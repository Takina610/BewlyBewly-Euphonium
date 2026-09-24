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

// ============================ 接口响应改写 ============================
// 评论和动态都是页面自己请求的，过滤只能在这一层做：把 JSON 读出来、丢掉要丢的条目、再放回去。
// fetch 与 XHR 两条路都装上——走哪条是 B 站自己的事，页面上两种都有。
//
// 一次请求只过滤一次：页面可能把 response 读好几遍，改两次就等于把已经过滤过的再过滤一遍。

/**
 * @param shouldFilter 这条请求归不归这套规则管
 * @param filter 拿到解析好的 JSON，返回改过的 payload；返回 null 表示不用改
 */
function setupJsonResponseFilter(shouldFilter, filter) {
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch.bind(window)
    window.fetch = function (...args) {
      const input = args[0]
      let url = ''
      if (typeof input === 'string')
        url = input
      else if (input && typeof input.url === 'string')
        url = input.url

      const result = originalFetch(...args)
      if (!shouldFilter(url))
        return result

      return result.then(async (response) => {
        if (!response || typeof response.json !== 'function')
          return response

        let payload
        try {
          payload = await response.clone().json()
        }
        catch {
          return response
        }

        const filtered = filter(payload)
        if (!filtered)
          return response

        const headers = new Headers(response.headers)
        headers.delete('content-length')
        return new Response(JSON.stringify(filtered), {
          status: response.status,
          statusText: response.statusText,
          headers,
        })
      })
    }
  }

  if (typeof XMLHttpRequest !== 'undefined') {
    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send
    const textDescriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText')
    const responseDescriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response')

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__bewlyJsonUrl = typeof url === 'string' ? url : String(url ?? '')
      return originalOpen.call(this, method, url, ...rest)
    }

    XMLHttpRequest.prototype.send = function (...args) {
      this.__bewlyJsonFiltered = undefined
      return originalSend.apply(this, args)
    }

    function readFiltered(xhr, value) {
      if (xhr.readyState !== 4 || !shouldFilter(xhr.__bewlyJsonUrl || ''))
        return value
      if (xhr.__bewlyJsonFiltered !== undefined)
        return xhr.__bewlyJsonFiltered

      let result = value
      try {
        if (typeof value === 'string') {
          const filtered = filter(JSON.parse(value))
          if (filtered)
            result = JSON.stringify(filtered)
        }
        else if (value && typeof value === 'object' && !(value instanceof ArrayBuffer)) {
          const filtered = filter(value)
          if (filtered)
            result = filtered
        }
      }
      catch {}

      try {
        xhr.__bewlyJsonFiltered = result
      }
      catch {}
      return result
    }

    if (textDescriptor && textDescriptor.get) {
      Object.defineProperty(XMLHttpRequest.prototype, 'responseText', {
        configurable: true,
        enumerable: textDescriptor.enumerable,
        get() {
          return readFiltered(this, textDescriptor.get.call(this))
        },
      })
    }

    // 弹幕那段也换了这个属性，它先装的话这里包在外层：各自只认自己的请求，互不干扰
    if (responseDescriptor && responseDescriptor.get) {
      Object.defineProperty(XMLHttpRequest.prototype, 'response', {
        configurable: true,
        enumerable: responseDescriptor.enumerable,
        get() {
          return readFiltered(this, responseDescriptor.get.call(this))
        },
      })
    }
  }
}

// ============================ 关键词名单 ============================
// 评论过滤与动态过滤共用一套写法：一行是普通关键词，写成 `/…/` 就是正则。
// 内容、话题用包含匹配（一句话里提到就算），UP 主、UID 用整段相等——与首页那两个黑名单同一套语义。

function compileKeywords(rows, mode) {
  const strings = []
  const regexps = []

  for (const row of Array.isArray(rows) ? rows : []) {
    const keyword = String((row && row.keyword) || '').trim()
    if (!keyword)
      continue

    if (keyword.length > 2 && keyword.startsWith('/') && keyword.endsWith('/')) {
      try {
        regexps.push(new RegExp(keyword.slice(1, -1), 'i'))
      }
      catch {}
    }
    else {
      strings.push(keyword.toUpperCase())
    }
  }

  return { mode, strings, regexps }
}

function isEmptyKeywords(matcher) {
  return !matcher || (!matcher.strings.length && !matcher.regexps.length)
}

function matchKeywords(matcher, text) {
  if (isEmptyKeywords(matcher))
    return false

  const value = String(text == null ? '' : text)
  if (!value)
    return false

  const upper = value.toUpperCase()
  if (matcher.mode === 'exact')
    return matcher.strings.includes(upper.trim()) || matcher.regexps.some(re => re.test(value))

  return matcher.strings.some(keyword => upper.includes(keyword)) || matcher.regexps.some(re => re.test(value))
}

/** 读一个挂在 <html> 上的 JSON 开关，按原字符串缓存——同一份设置不必每个请求都解析一遍。 */
function readJsonAttribute(attr) {
  const raw = document.documentElement.getAttribute(attr)
  if (!raw)
    return null

  if (raw !== readJsonAttribute.cacheKey || readJsonAttribute.cacheAttr !== attr) {
    readJsonAttribute.cacheKey = raw
    readJsonAttribute.cacheAttr = attr
    try {
      readJsonAttribute.cacheValue = JSON.parse(raw)
    }
    catch {
      readJsonAttribute.cacheValue = null
    }
  }

  return readJsonAttribute.cacheValue
}

// ============================ 评论区过滤 ============================
// 评论（含楼中楼）由页面自己请求，返回的 JSON 里带着内容、UP 主名和 UID —— UID 在 DOM 上根本
// 拿不到，所以过滤只能在数据这层做。开关与四条名单由 content script 序列化成 JSON 写在 <html> 上
// （`src/logic/commentFilter.ts`），与评论区 IP 属地同一套通道。
//
// 注意这是**不看**评论内容之外的：命中的评论连同它下面的楼中楼一起消失，楼里单独命中的也会掉。

const COMMENT_FILTER_ATTR = 'data-bewly-comment-filter'
const COMMENT_REPLY_RE = /\/x\/v2\/reply\/(?:wbi\/)?(?:main|reply)(?:[/?]|$)/
/** 话题在评论里就是内容中成对的 `#` 之间那一段。 */
const COMMENT_TOPIC_RE = /#([^#\n]{1,40})#/g

function readCommentFilterRules() {
  const parsed = readJsonAttribute(COMMENT_FILTER_ATTR)
  if (!parsed || !parsed.enabled)
    return null

  const rules = {
    content: compileKeywords(parsed.content, 'contains'),
    user: compileKeywords(parsed.user, 'exact'),
    uid: compileKeywords(parsed.uid, 'exact'),
    topic: compileKeywords(parsed.topic, 'contains'),
  }

  // 开关开着但四条名单都空着，等于没开
  return Object.values(rules).every(isEmptyKeywords) ? null : rules
}

function hasMatchedTopic(matcher, message) {
  if (isEmptyKeywords(matcher))
    return false

  const text = String(message == null ? '' : message)
  COMMENT_TOPIC_RE.lastIndex = 0
  let match = COMMENT_TOPIC_RE.exec(text)
  while (match) {
    if (matchKeywords(matcher, match[1]))
      return true
    match = COMMENT_TOPIC_RE.exec(text)
  }
  return false
}

function shouldDropComment(reply, rules) {
  if (!reply || typeof reply !== 'object')
    return false

  const member = reply.member || {}
  if (matchKeywords(rules.content, reply.content && reply.content.message))
    return true
  if (matchKeywords(rules.user, member.uname))
    return true
  if (matchKeywords(rules.uid, member.mid == null ? '' : String(member.mid)))
    return true
  return hasMatchedTopic(rules.topic, reply.content && reply.content.message)
}

/** 一层一层来：这一层的评论掉了，它下面的楼中楼跟着掉；楼里单独命中的自己掉。 */
function filterReplyList(container, key, rules) {
  const list = container[key]
  if (!Array.isArray(list))
    return false

  const kept = []
  let changed = false

  for (const reply of list) {
    if (shouldDropComment(reply, rules)) {
      changed = true
      continue
    }

    if (filterReplyList(reply, 'replies', rules))
      changed = true

    kept.push(reply)
  }

  if (changed)
    container[key] = kept

  return changed
}

function filterCommentPayload(payload) {
  const rules = readCommentFilterRules()
  const data = payload && payload.data
  if (!rules || !data || typeof data !== 'object')
    return null

  let changed = false
  for (const key of ['replies', 'top_replies', 'hots']) {
    if (filterReplyList(data, key, rules))
      changed = true
  }

  // 还有一层：第一条评论的楼中楼也可能单独挂在 data.top 之类的字段上，这里不猜，认准那三个
  return changed ? payload : null
}

function setupCommentFilter() {
  setupJsonResponseFilter(
    url => COMMENT_REPLY_RE.test(typeof url === 'string' ? url : ''),
    filterCommentPayload,
  )
}

setupCommentFilter()

// ============================ 动态页过滤 ============================
// 动态页（t.bilibili.com）的动态流由页面自己请求，过滤也就在响应上做：命中的条目从 items 里丢掉。
// 开关、屏蔽类型与四条关键词名单由 content script 序列化成 JSON 写在 <html> 上
// （`src/logic/momentsFilter.ts`）。
//
// 形状只有一种：接口给的是 `modules` 对象（`module_dynamic.major/additional/desc`）。同一份数据在
// B 站的 App 与「空间页桌面版」接口里是数组，那种形状这里不认——认不出的条目原样放行，比猜错强。
//
// 类型屏蔽用的是网页端那两个枚举的名字（`DYNAMIC_TYPE_*` / `MAJOR_TYPE_*`），清单见
// `src/constants/momentsTypes.ts`。

const MOMENTS_FILTER_ATTR = 'data-bewly-moments-filter'
// 动态流的各个入口：首页动态、空间动态、顶栏面板、热门与话题
const MOMENTS_FEED_RE = /\/x\/polymer\/web-dynamic\/(?:desktop\/)?v1\/feed\/(?:all|space|nav|hot|topic)(?:[/?]|$)/

function momentModules(item) {
  return (item && item.modules) || {}
}

function momentDynamic(item) {
  return momentModules(item).module_dynamic || {}
}

function momentDynamicType(item) {
  return String((item && item.type) || '')
}

function momentMajorType(item) {
  return String((momentDynamic(item).major || {}).type || '')
}

function momentAdditionalType(item) {
  return String((momentDynamic(item).additional || {}).type || '')
}

/** 折叠：接口说这条不是正常显示，或者它是一条「展开 N 条相关动态」。 */
function isFoldedMoment(item) {
  return item.visible === false || !!momentModules(item).module_fold
}

/** 无权查看：动态失效那条路（`MAJOR_TYPE_NONE` 的 tips 就是「该动态已被删除」这类话）。 */
function isUnavailableMoment(item) {
  return momentMajorType(item) === 'MAJOR_TYPE_NONE'
}

/** 跳转广告：带货卡与「你可能感兴趣的 UP 主」卡，两种都会把人带走。 */
function isJumpAdMoment(item) {
  if (momentAdditionalType(item) === 'ADDITIONAL_TYPE_GOODS' || momentAdditionalType(item) === 'ADDITIONAL_TYPE_UP_RCMD')
    return true

  const major = momentDynamic(item).major || {}
  if (major.goods)
    return true

  return richTextNodes(item).some(node => node.type === 'RICH_TEXT_NODE_TYPE_GOODS')
}

/** 直播预约：预约卡。`button.type === 2` 是直播那一档，其余的预约卡一并算进来。 */
function isLiveReservationMoment(item) {
  return momentAdditionalType(item) === 'ADDITIONAL_TYPE_RESERVE'
}

/** 推广：广告卡，以及没有类型标出来但挂着广告模块的卡片。 */
function isPromotionMoment(item) {
  return momentDynamicType(item) === 'DYNAMIC_TYPE_AD'
    || !!momentModules(item).module_ad
    || momentAdditionalType(item) === 'ADDITIONAL_TYPE_UP_RCMD'
}

function isVideoMoment(item) {
  return momentDynamicType(item) === 'DYNAMIC_TYPE_AV' || momentMajorType(item) === 'MAJOR_TYPE_ARCHIVE'
}

/** 屏蔽类型里的一格。清单见 `src/constants/momentsTypes.ts`，这里一格一格对着接口字段判。 */
function hasBlockedMomentType(item, types) {
  if (!types.length)
    return false

  const type = momentDynamicType(item)
  const major = momentMajorType(item)

  for (const key of types) {
    switch (key) {
      case 'forward':
        if (type === 'DYNAMIC_TYPE_FORWARD')
          return true
        break
      case 'video':
        if (isVideoMoment(item))
          return true
        break
      case 'pgc':
        if (type === 'DYNAMIC_TYPE_PGC' || type === 'DYNAMIC_TYPE_PGC_UNION' || major === 'MAJOR_TYPE_PGC')
          return true
        break
      case 'fold':
        if (isFoldedMoment(item))
          return true
        break
      case 'word':
        if (type === 'DYNAMIC_TYPE_WORD')
          return true
        break
      case 'draw':
        if (type === 'DYNAMIC_TYPE_DRAW' || major === 'MAJOR_TYPE_DRAW' || major === 'MAJOR_TYPE_OPUS')
          return true
        break
      case 'article':
        if (type === 'DYNAMIC_TYPE_ARTICLE' || major === 'MAJOR_TYPE_ARTICLE')
          return true
        break
      case 'audio':
        if (type === 'DYNAMIC_TYPE_MUSIC' || major === 'MAJOR_TYPE_MUSIC')
          return true
        break
      case 'live':
        if (type === 'DYNAMIC_TYPE_LIVE' || type === 'DYNAMIC_TYPE_LIVE_RCMD'
          || major === 'MAJOR_TYPE_LIVE' || major === 'MAJOR_TYPE_LIVE_RCMD') {
          return true
        }
        break
      case 'medialist':
        if (type === 'DYNAMIC_TYPE_MEDIALIST' || major === 'MAJOR_TYPE_MEDIALIST')
          return true
        break
      case 'ad':
        if (type === 'DYNAMIC_TYPE_AD')
          return true
        break
      case 'banner':
        if (type === 'DYNAMIC_TYPE_BANNER')
          return true
        break
      case 'ugcSeason':
        if (type === 'DYNAMIC_TYPE_UGC_SEASON' || major === 'MAJOR_TYPE_UGC_SEASON')
          return true
        break
      case 'story':
        // 网页端的动态枚举里没有「故事」。App 那边是按视频的 stype === 3 判的，这里照同一条来
        if ((momentDynamic(item).major || {}).archive && momentDynamic(item).major.archive.type === 3)
          return true
        break
      case 'topicRcmd':
        // 网页端同样没有这个名字，等它出现
        if (type === 'DYNAMIC_TYPE_TOPIC_RCMD')
          return true
        break
      case 'courses':
        if (type === 'DYNAMIC_TYPE_COURSES' || type === 'DYNAMIC_TYPE_COURSES_SEASON'
          || type === 'DYNAMIC_TYPE_COURSES_BATCH' || major === 'MAJOR_TYPE_COURSES') {
          return true
        }
        break
    }
  }

  return false
}

function richTextNodes(item) {
  const desc = momentDynamic(item).desc
  return (desc && Array.isArray(desc.rich_text_nodes)) ? desc.rich_text_nodes : []
}

/** 正文：本条动态的文字。转发那半边的文字也算进来——看的时候是一条。 */
function momentText(item) {
  const parts = [momentDynamic(item).desc?.text]
  for (const node of richTextNodes(item))
    parts.push(node.orig_text, node.text)

  const opus = (momentDynamic(item).major || {}).opus
  if (opus) {
    parts.push(opus.title)
    if (opus.summary)
      parts.push(opus.summary.text)
  }

  const original = item.orig
  if (original)
    parts.push(momentDynamic(original).desc?.text)

  return parts.filter(part => typeof part === 'string' && part).join('\n')
}

/** 话题：`module_dynamic.topic.name` 与正文里 `RICH_TEXT_NODE_TYPE_TOPIC` 那些 `#…#`。 */
function momentTopics(item) {
  const topics = []
  const topic = momentDynamic(item).topic
  if (topic && typeof topic.name === 'string')
    topics.push(topic.name)

  for (const node of richTextNodes(item)) {
    if (node.type !== 'RICH_TEXT_NODE_TYPE_TOPIC')
      continue
    const text = String(node.text || node.orig_text || '')
    topics.push(text.replace(/^#+/, '').replace(/#+$/, ''))
  }

  return topics
}

function matchesMomentKeywords(item, keywords) {
  if (matchKeywords(keywords.content, momentText(item)))
    return true

  const author = momentModules(item).module_author || {}
  if (matchKeywords(keywords.user, author.name))
    return true
  if (matchKeywords(keywords.uid, author.mid == null ? '' : String(author.mid)))
    return true

  return momentTopics(item).some(topic => matchKeywords(keywords.topic, topic))
}

function readMomentsRules() {
  const parsed = readJsonAttribute(MOMENTS_FILTER_ATTR)
  if (!parsed)
    return null

  const rules = {
    types: Array.isArray(parsed.types) ? parsed.types : [],
    blockInvisible: !!parsed.blockInvisible,
    blockJumpAds: !!parsed.blockJumpAds,
    blockLiveReservation: !!parsed.blockLiveReservation,
    blockPromotions: !!parsed.blockPromotions,
    blockVideos: !!parsed.blockVideos,
    keywords: parsed.enabledKeywords
      ? {
          content: compileKeywords(parsed.content, 'contains'),
          user: compileKeywords(parsed.user, 'exact'),
          uid: compileKeywords(parsed.uid, 'exact'),
          topic: compileKeywords(parsed.topic, 'contains'),
        }
      : null,
  }

  if (rules.keywords && Object.values(rules.keywords).every(isEmptyKeywords))
    rules.keywords = null

  const nothingToDo = !rules.types.length && !rules.keywords
    && !rules.blockInvisible && !rules.blockJumpAds && !rules.blockLiveReservation
    && !rules.blockPromotions && !rules.blockVideos

  return nothingToDo ? null : rules
}

function shouldDropMoment(item, rules) {
  if (!item || typeof item !== 'object')
    return false

  if (rules.blockInvisible && isUnavailableMoment(item))
    return true
  if (rules.blockJumpAds && isJumpAdMoment(item))
    return true
  if (rules.blockLiveReservation && isLiveReservationMoment(item))
    return true
  if (rules.blockPromotions && isPromotionMoment(item))
    return true
  if (rules.blockVideos && isVideoMoment(item))
    return true
  if (rules.keywords && matchesMomentKeywords(item, rules.keywords))
    return true

  return hasBlockedMomentType(item, rules.types)
}

function filterMomentsPayload(payload) {
  const rules = readMomentsRules()
  const data = payload && payload.data
  if (!rules || !data || !Array.isArray(data.items))
    return null

  const kept = data.items.filter(item => !shouldDropMoment(item, rules))
  if (kept.length === data.items.length)
    return null

  data.items = kept
  return payload
}

function setupMomentsFilter() {
  setupJsonResponseFilter(
    url => MOMENTS_FEED_RE.test(typeof url === 'string' ? url : ''),
    filterMomentsPayload,
  )
}

setupMomentsFilter()

// ============================ 直播间默认原画 ============================
// 直播间的播放地址是页面自己求的：进房间时它带 `qn=0`，让服务端自己挑一档（实测落在蓝光）。
// 要原画就把那个 0 换成 10000 —— 只在 0 的时候换：用户自己选过清晰度时页面会带上具体的 qn，
// 那一次是他的选择，不该被改回去。
//
// 开关写在 <html> 的 data-bewly-live-original-quality 上（`src/logic/liveRoom.ts`）。

const LIVE_QUALITY_ATTR = 'data-bewly-live-original-quality'
/** 原画。不可用时服务端会退到最接近的一档，所以写下去是安全的。 */
const LIVE_ORIGINAL_QN = 10000
const LIVE_PLAY_URL_RE = /\/(?:xlive\/web-room\/v2\/index\/getRoomPlayInfo|room\/v1\/Room\/playUrl)(?:\?|$)/

function isLiveQualityEnabled() {
  return document.documentElement.getAttribute(LIVE_QUALITY_ATTR) === 'true'
}

/** 把自动选档（`qn=0`）换成原画；其它情况原样返回。 */
function preferOriginalQuality(url) {
  if (typeof url !== 'string' || !isLiveQualityEnabled() || !LIVE_PLAY_URL_RE.test(url))
    return url

  try {
    const parsed = new URL(url, location.href)
    if (parsed.searchParams.get('qn') !== '0')
      return url

    parsed.searchParams.set('qn', String(LIVE_ORIGINAL_QN))
    return parsed.toString()
  }
  catch {
    return url
  }
}

function setupLiveOriginalQuality() {
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch.bind(window)
    window.fetch = function (...args) {
      const input = args[0]
      if (typeof input === 'string') {
        args[0] = preferOriginalQuality(input)
      }
      else if (input && typeof input.url === 'string') {
        const rewritten = preferOriginalQuality(input.url)
        if (rewritten !== input.url)
          args[0] = new Request(rewritten, input)
      }

      return originalFetch(...args)
    }
  }

  if (typeof XMLHttpRequest !== 'undefined') {
    const originalOpen = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      return originalOpen.call(this, method, preferOriginalQuality(typeof url === 'string' ? url : String(url ?? '')), ...rest)
    }
  }
}

setupLiveOriginalQuality()

window.___inject = true

// History.prototype.pushState = history.pushState
// History.prototype.replaceState = history.replaceState
// History.prototype.forward = history.forward
