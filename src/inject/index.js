const isArray = val => Array.isArray(val)
function injectFunction(
  origin,
  keys,
  cb,
) {
  if (!isArray(keys))
    keys = [keys]

  const originKeysValue = keys.reduce((obj, key) => {
    obj[key] = origin[key]
    return obj
  }, {})

  keys.map(k => origin[k])

  keys.forEach((key) => {
    const fn = (...args) => {
      cb(...args)
      return (originKeysValue[key]).apply(origin, args)
    }
    fn.toString = (origin)[key].toString
    ;(origin)[key] = fn
  })

  return {
    originKeysValue,
    restore: () => {
      for (const key in originKeysValue) {
        origin[key] = (originKeysValue[key]).bind(origin)
      }
    },
  }
}

// 注入 history.pushState 调用以触发自定义的 pushstate 事件，用于监控 iframe drawer 路由变化
injectFunction(
  window.history,
  ['pushState'],
  (...args) => {
    window.dispatchEvent(new CustomEvent('pushstate', { detail: args }))
  },
)

const PARAMS_TO_REMOVE = [
  'spm_id_from',
  'from_source',
  'msource',
  'bsource',
  'seid',
  'source',
  'session_id',
  'visit_id',
  'sourceFrom',
  'from_spmid',
  'share_source',
  'share_medium',
  'share_plat',
  'share_session_id',
  'share_tag',
  'unique_k',
  'csource',
  'vd_source',
  'tab',
  'trackid',
  'is_story_h5',
  'share_from',
  'plat_id',
  '-Arouter',
  'launch_id',
  'live_from',
  'hotRank',
  'broadcast_type',
]

function cleanUrl(url) {
  try {
    const urlObj = new URL(url)
    let hasChanged = false

    PARAMS_TO_REMOVE.forEach((param) => {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.delete(param)
        hasChanged = true
      }
    })

    if (hasChanged) {
      return urlObj.toString()
        .replace(/([^:])\/\//g, '$1/')
        .replace(/%3D/gi, '=')
        .replace(/%26/g, '&')
    }
  }
  catch {
  }
  return url
}

function cleanText(text) {
  if (!text)
    return text
  // 匹配 http/https 链接
  return text.replace(/(https?:\/\/\S+)/g, (match) => {
    return cleanUrl(match)
  })
}

function setupClipboardInterceptor() {
  const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard)

  navigator.clipboard.writeText = function (text) {
    const shouldClean = document.documentElement.getAttribute('data-bewly-clean-url') === 'true'
    if (shouldClean && typeof text === 'string' && text.includes('bilibili.com')) {
      text = cleanText(text)
    }
    return originalWriteText(text)
  }
}

setupClipboardInterceptor()

function isReplyActionUrl(url) {
  if (!url)
    return false
  try {
    const parsed = new URL(url, location.href)
    const path = parsed.pathname.replace(/\/+$/, '')
    return parsed.hostname === 'api.bilibili.com'
      && path === '/x/v2/reply/action'
  }
  catch {
    return /api\.bilibili\.com\/x\/v2\/reply\/action(?:\?|$|\/)/.test(String(url))
  }
}

let lastReplyActionToastKey = ''
let lastReplyActionToastAt = 0

function notifyReplyActionError(data) {
  if (!data || typeof data !== 'object')
    return
  if (data.code === 0 || data.code === '0')
    return

  const message = data.message || data.msg
  if (!message || message === '0')
    return

  const text = String(message)
  const now = Date.now()
  if (text === lastReplyActionToastKey && now - lastReplyActionToastAt < 800)
    return
  lastReplyActionToastKey = text
  lastReplyActionToastAt = now

  window.dispatchEvent(new CustomEvent('bewlyApiToast', {
    detail: { message: text, type: 'error' },
  }))
}

function setupReplyActionInterceptor() {
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch.bind(window)
    window.fetch = function (...args) {
      const input = args[0]
      let url = ''
      if (typeof input === 'string')
        url = input
      else if (input && typeof input.url === 'string')
        url = input.url

      return originalFetch(...args).then((response) => {
        if (isReplyActionUrl(url)) {
          response.clone().json().then(notifyReplyActionError).catch(() => {})
        }
        return response
      })
    }
  }

  if (typeof XMLHttpRequest !== 'undefined') {
    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__bewlyReplyActionUrl = typeof url === 'string' ? url : String(url ?? '')
      return originalOpen.call(this, method, url, ...rest)
    }

    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener('load', function onLoad() {
        if (!isReplyActionUrl(this.__bewlyReplyActionUrl))
          return
        try {
          notifyReplyActionError(JSON.parse(this.responseText))
        }
        catch {}
      })
      return originalSend.apply(this, args)
    }
  }
}

setupReplyActionInterceptor()

// ============================ 评论区 IP 属地 ============================
// 属地本来就躺在 B 站接口返回的评论数据里（`reply_control.location`），只是网页端不渲染它。
// 评论组件是 lit 写的，把数据挂在元素实例属性上，而隔离世界看不到页面自定义组件的实例属性 ——
// 所以读数据这件事只能由跑在主世界的注入脚本来做，content script 只往 <html> 上写开关
// （`src/logic/commentIpLocation.ts`，与 data-bewly-clean-url 同一套做法）。

const COMMENT_LOCATION_ATTR = 'data-bewly-comment-ip-location'
const COMMENT_LOCATION_CLASS = 'bewly-comment-location'
// 评论组件的宿主，动态页用的是 webview 版
const COMMENT_HOST_SELECTOR = 'bili-comments, bili-comments-webview'
// 各个版本的组件把回复数据挂在不同字段上，挨个试
const COMMENT_DATA_KEYS = ['data', 'reply', '_data', '__data']
// 沿 shadow host 链往上找数据时最多走几层
const COMMENT_HOST_HOPS = 8
// 评论树被整个换掉（SPA 换视频）后多久能察觉，同时也是新评论宿主的兜底扫描间隔
const COMMENT_SCAN_INTERVAL = 2000

function isCommentLocationEnabled() {
  return document.documentElement.getAttribute(COMMENT_LOCATION_ATTR) === 'true'
}

/** 从评论操作按钮出发，沿 shadow host 链往上找挂着这条评论数据的那一层，取 IP 属地 */
function resolveCommentLocation(el) {
  let node = el
  for (let hop = 0; node && hop < COMMENT_HOST_HOPS; hop++) {
    for (const key of COMMENT_DATA_KEYS) {
      const data = node[key]
      const location = data && data.reply_control && data.reply_control.location
      if (typeof location === 'string' && location)
        return location
    }
    const root = node.getRootNode ? node.getRootNode() : null
    node = root && root.host ? root.host : node.parentElement
  }
  return ''
}

// 组件用 20px 的块间距排点赞、回复这些操作，量一次复用；属地跟在时间后面，间距取一半
let commentBlockGap = ''

function measureCommentBlockGap(shadowRoot) {
  if (commentBlockGap)
    return commentBlockGap

  const sibling = shadowRoot.querySelector('#like') || shadowRoot.querySelector('#reply') || shadowRoot.querySelector('#dislike')
  const gap = sibling ? getComputedStyle(sibling).marginLeft : ''
  if (gap && gap !== '0px')
    commentBlockGap = gap

  return commentBlockGap || '16px'
}

function injectCommentLocation(actionButtons) {
  const shadowRoot = actionButtons.shadowRoot
  // 已经插过就不再插：lit 重渲染后这里要能补回来，所以判重看 DOM 而不是看标记
  if (!shadowRoot || shadowRoot.querySelector(`.${COMMENT_LOCATION_CLASS}`))
    return

  const pubdate = shadowRoot.querySelector('#pubdate')
  if (!pubdate)
    return

  const location = resolveCommentLocation(actionButtons)
  if (!location)
    return

  const span = document.createElement('span')
  span.className = COMMENT_LOCATION_CLASS
  span.textContent = location
  // shadow 里用不上扩展的样式表，所以写行内；--text3 是组件自己用的次要文字色，跟着主题走
  span.style.cssText = `margin-left:calc(${measureCommentBlockGap(shadowRoot)} / 2);color:var(--text3,#9499a0);font-size:inherit;white-space:nowrap;`
  pubdate.after(span)
}

function setupCommentIpLocation() {
  // 已经挂了观察器的 shadowRoot，避免同一层反复挂。弱引用即可，评论树被换掉后自然回收
  let observedRoots = new WeakSet()
  let commentObservers = []
  let boundHosts = []
  let walkFrame = 0
  let scanTimer = 0

  function observeShadowRoot(shadowRoot) {
    if (observedRoots.has(shadowRoot))
      return
    observedRoots.add(shadowRoot)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList')
          continue
        for (const node of mutation.addedNodes) {
          // 编辑器里打字引发的抖动不算新内容；自己插进去的属地更不算，不然会自己触发自己
          if (node.nodeType === 1 && !node.isContentEditable && !node.classList.contains(COMMENT_LOCATION_CLASS)) {
            scheduleWalk()
            return
          }
        }
      }
    })
    observer.observe(shadowRoot, { childList: true, subtree: true })
    commentObservers.push(observer)
  }

  function walkElement(el) {
    if (el.localName === 'bili-comment-action-buttons-renderer')
      injectCommentLocation(el)

    // querySelectorAll 穿不过 shadow 边界，所以每碰到一层 shadow root 就自己走下去
    if (el.shadowRoot) {
      observeShadowRoot(el.shadowRoot)
      walkRoot(el.shadowRoot)
    }
  }

  function walkRoot(root) {
    let elements
    try {
      elements = root.querySelectorAll('*')
    }
    catch {
      return
    }
    for (const el of elements)
      walkElement(el)
  }

  // 一批变更只走一遍整棵树（整树重扫是幂等的，插过的会自己跳过）
  function scheduleWalk() {
    if (walkFrame)
      return
    walkFrame = requestAnimationFrame(() => {
      walkFrame = 0
      for (const host of boundHosts) {
        if (host.shadowRoot)
          walkRoot(host.shadowRoot)
      }
    })
  }

  function bindHost(host) {
    boundHosts.push(host)
    observeShadowRoot(host.shadowRoot)
    walkRoot(host.shadowRoot)
  }

  function scanHosts() {
    // 评论树被换掉了：旧树的观察器已经没有意义，直接放弃，下面重新绑定新的
    if (boundHosts.some(host => !host.isConnected))
      release()

    for (const host of document.querySelectorAll(COMMENT_HOST_SELECTOR)) {
      if (host.shadowRoot && !boundHosts.includes(host))
        bindHost(host)
    }
  }

  function release() {
    for (const observer of commentObservers)
      observer.disconnect()
    commentObservers = []
    boundHosts = []
    // 观察器全断了，这一层的记录也要一起清掉，否则重新开启时 observeShadowRoot 会以为还挂着
    observedRoots = new WeakSet()

    if (walkFrame) {
      cancelAnimationFrame(walkFrame)
      walkFrame = 0
    }
  }

  /** 收回已插进去的属地。shadow 里的节点 querySelectorAll 到不了，只能自己穿进去找 */
  function removeLocations(root) {
    for (const el of root.querySelectorAll(`.${COMMENT_LOCATION_CLASS}`))
      el.remove()

    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot)
        removeLocations(el.shadowRoot)
    }
  }

  function enable() {
    if (scanTimer)
      return
    scanHosts()
    scanTimer = setInterval(scanHosts, COMMENT_SCAN_INTERVAL)
  }

  function disable() {
    if (scanTimer) {
      clearInterval(scanTimer)
      scanTimer = 0
    }

    for (const host of boundHosts) {
      if (host.shadowRoot)
        removeLocations(host.shadowRoot)
    }
    release()
  }

  function syncWithFlag() {
    if (isCommentLocationEnabled())
      enable()
    else
      disable()
  }

  new MutationObserver(syncWithFlag).observe(document.documentElement, {
    attributes: true,
    attributeFilter: [COMMENT_LOCATION_ATTR],
  })

  syncWithFlag()
}

setupCommentIpLocation()

// ============================ 弹幕等级过滤 ============================
// 弹幕分段由播放器自己在主世界用 XHR 拉（`/x/v2/dm/wbi/web/seg.so`），所以只有这里能换掉它拿到的字节。
// 屏蔽等级写在 <html> 的 data-bewly-danmaku-level 上（`src/logic/danmakuLevelFilter.ts`），与评论区
// IP 属地同一套通道。
//
// 规则照抄 B 站自己的：`Math.abs(weight) < level` 就丢弃（它的过滤器里那句 `aiJudge` 就是这个判断，
// 只是现在那个等级由弹幕密度推出来、几乎恒为 2~3，等于不生效）。weight 是弹幕自带的等级，9 号字段。
//
// protobuf 不必完整解析：repeated 字段允许把各段字节原样拼回去，所以按字段边界切开、跳过要丢的条目、
// 剩下的拼接即可 —— 不认识的结构一个字节都不动。

const DANMAKU_LEVEL_ATTR = 'data-bewly-danmaku-level'
// 分段接口（wbi 前后缀都算）与历史弹幕，两侧返回的都是同一份 DmSegMobileReply
const DANMAKU_SEGMENT_RE = /\/x\/v2\/dm\/[^?#]*(?:seg\.so|history)/
const DANMAKU_ELEM_FIELD = 1
const DANMAKU_MODE_FIELD = 3
const DANMAKU_WEIGHT_FIELD = 9
const DANMAKU_POOL_FIELD = 11

function readDanmakuLevel() {
  const level = Number(document.documentElement.getAttribute(DANMAKU_LEVEL_ATTR))
  return Number.isFinite(level) && level > 0 ? level : 0
}

/** 读一个 varint。用乘法而不是 `<<`，64 位字段不会溢出成负数。 */
function readVarint(bytes, pos) {
  let value = 0
  let shift = 0
  while (pos < bytes.length) {
    const byte = bytes[pos++]
    value += (byte & 0x7F) * 2 ** shift
    if (!(byte & 0x80))
      return { value, pos }
    shift += 7
  }
  return null
}

/**
 * 读一个 int32 型的 varint，按补码还原符号。负数在 protobuf 里被符号扩展到 64 位，逐字节累加会变成
 * 天文数字（`Math.abs` 就认不出它其实很小了），所以只取低 32 位：多出来的高位分组全是 2^32 的整数倍。
 */
function readInt32(bytes, pos) {
  let raw = 0
  let shift = 0
  while (pos < bytes.length) {
    const byte = bytes[pos++]
    // 只累加低 32 位里的分组：位位置 ≥ 32 的那几组是 2^32 的整数倍，对低 32 位没有贡献
    if (shift < 32)
      raw = (raw + ((byte & 0x7F) << shift)) >>> 0
    if (!(byte & 0x80))
      return { value: raw > 2147483647 ? raw - 4294967296 : raw, pos }
    shift += 7
  }
  return null
}

/** 按字段切开 [from, to) 这段消息，wire=0 的字段顺带把值读出来。切不动就返回 null。 */
function readFields(bytes, from, to) {
  const fields = []
  let pos = from
  while (pos < to) {
    const start = pos
    const tag = readVarint(bytes, pos)
    if (!tag)
      return null
    pos = tag.pos
    const field = Math.floor(tag.value / 8)
    const wire = tag.value % 8
    let value
    let dataStart
    let dataEnd
    if (wire === 0) {
      const read = readInt32(bytes, pos)
      if (!read)
        return null
      value = read.value
      pos = read.pos
    }
    else if (wire === 1) {
      pos += 8
    }
    else if (wire === 2) {
      const length = readVarint(bytes, pos)
      if (!length)
        return null
      dataStart = length.pos
      dataEnd = length.pos + length.value
      pos = dataEnd
    }
    else if (wire === 5) {
      pos += 4
    }
    else {
      return null
    }
    if (pos > to)
      return null
    fields.push({ field, wire, value, start, end: pos, dataStart, dataEnd })
  }
  return fields
}

/** 一条弹幕里我们关心的三个数：等级（权重）、弹幕池、类型。 */
function readDanmakuElem(bytes, field) {
  const fields = readFields(bytes, field.dataStart, field.dataEnd)
  if (!fields)
    return null

  const elem = { mode: 0, pool: 0, weight: undefined }
  for (const entry of fields) {
    if (entry.wire !== 0)
      continue
    if (entry.field === DANMAKU_WEIGHT_FIELD)
      elem.weight = entry.value
    else if (entry.field === DANMAKU_POOL_FIELD)
      elem.pool = entry.value
    else if (entry.field === DANMAKU_MODE_FIELD)
      elem.mode = entry.value
  }
  return elem
}

function shouldDropDanmaku(elem, level) {
  // 没带等级的条目一律放行：字幕池、代码/BAS 弹幕都可能没有这个字段，误删的代价比漏删大
  if (elem.weight === undefined)
    return false
  if (elem.pool === 1 || elem.pool === 2)
    return false
  if (elem.mode >= 7)
    return false
  return Math.abs(elem.weight) < level
}

/** 丢掉等级不够的弹幕。返回 null 表示「原样放行」（认不出的字节流，或一条都没删）。 */
function filterDanmakuSegment(bytes, level) {
  const fields = readFields(bytes, 0, bytes.length)
  if (!fields)
    return null

  const kept = []
  for (const field of fields) {
    if (field.field === DANMAKU_ELEM_FIELD && field.wire === 2) {
      const elem = readDanmakuElem(bytes, field)
      if (elem && shouldDropDanmaku(elem, level))
        continue
    }
    kept.push(bytes.subarray(field.start, field.end))
  }
  if (kept.length === fields.length)
    return null

  let total = 0
  for (const chunk of kept)
    total += chunk.length
  const filtered = new Uint8Array(total)
  let offset = 0
  for (const chunk of kept) {
    filtered.set(chunk, offset)
    offset += chunk.length
  }
  return filtered
}

function filterDanmakuResponse(xhr, value) {
  const level = readDanmakuLevel()
  if (!level || !xhr || !DANMAKU_SEGMENT_RE.test(xhr.__bewlyDanmakuUrl || ''))
    return value
  // 一次请求只过滤一次：页面可能反复读 response
  if (xhr.__bewlyDanmakuResponse !== undefined)
    return xhr.__bewlyDanmakuResponse

  let response = value
  if (value instanceof ArrayBuffer) {
    const filtered = filterDanmakuSegment(new Uint8Array(value), level)
    if (filtered)
      response = filtered.buffer
  }
  try {
    xhr.__bewlyDanmakuResponse = response
  }
  catch {}
  return response
}

function setupDanmakuLevelFilter() {
  if (typeof XMLHttpRequest === 'undefined')
    return

  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send
  const responseDescriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response')

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__bewlyDanmakuUrl = typeof url === 'string' ? url : String(url ?? '')
    return originalOpen.call(this, method, url, ...rest)
  }

  XMLHttpRequest.prototype.send = function (...args) {
    this.__bewlyDanmakuResponse = undefined
    return originalSend.apply(this, args)
  }

  // 换掉 response 而不是 responseText：分段是二进制，`responseType` 是 arraybuffer，
  // 而页面是在自己的 load 回调里读 `response` 的 —— 那里改已经来不及，只能在取值处拦。
  if (responseDescriptor && responseDescriptor.get) {
    Object.defineProperty(XMLHttpRequest.prototype, 'response', {
      configurable: true,
      enumerable: responseDescriptor.enumerable,
      get() {
        return filterDanmakuResponse(this, responseDescriptor.get.call(this))
      },
    })
  }
}

setupDanmakuLevelFilter()

window.___inject = true

// History.prototype.pushState = history.pushState
// History.prototype.replaceState = history.replaceState
// History.prototype.forward = history.forward
