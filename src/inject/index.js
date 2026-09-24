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

// ============================ 评论区 IP 属地与性别 ============================
// 属地与性别本来就躺在 B 站接口返回的评论数据里（`reply_control.location` 与 `member.sex`），
// 只是网页端不渲染它们。评论组件是 lit 写的，把数据挂在元素实例属性上，而隔离世界看不到页面自定义
// 组件的实例属性 —— 所以读数据这件事只能由跑在主世界的注入脚本来做，content script 只往 <html> 上
// 写开关（`src/logic/commentIpLocation.ts`，与 data-bewly-clean-url 同一套做法）。

const COMMENT_LOCATION_ATTR = 'data-bewly-comment-ip-location'
const COMMENT_GENDER_ATTR = 'data-bewly-comment-gender'
const COMMENT_LOCATION_CLASS = 'bewly-comment-location'
const COMMENT_GENDER_CLASS = 'bewly-comment-gender'
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

function isCommentGenderEnabled() {
  return document.documentElement.getAttribute(COMMENT_GENDER_ATTR) === 'true'
}

/** 从评论操作按钮出发，沿 shadow host 链往上找挂着这条评论数据的那一层，取属地与性别 */
function resolveCommentMeta(el) {
  let node = el
  for (let hop = 0; node && hop < COMMENT_HOST_HOPS; hop++) {
    for (const key of COMMENT_DATA_KEYS) {
      const data = node[key]
      if (!data || typeof data !== 'object')
        continue

      const location = data.reply_control && data.reply_control.location
      const gender = data.member && data.member.sex
      const hasLocation = typeof location === 'string' && location
      // 「保密」照实显示：它是多数派，藏掉的话看着就像这儿没生效
      const hasGender = typeof gender === 'string' && gender
      if (hasLocation || hasGender)
        return { location: hasLocation ? location : '', gender: hasGender ? gender : '' }
    }
    const root = node.getRootNode ? node.getRootNode() : null
    node = root && root.host ? root.host : node.parentElement
  }
  return { location: '', gender: '' }
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

/** 属地与性别是同一个位置上的两小段文字，样式一样，插入顺序就是它们的先后 */
function makeCommentMetaSpan(className, text, shadowRoot) {
  const span = document.createElement('span')
  span.className = className
  span.textContent = text
  // shadow 里用不上扩展的样式表，所以写行内；--text3 是组件自己用的次要文字色，跟着主题走
  span.style.cssText = `margin-left:calc(${measureCommentBlockGap(shadowRoot)} / 2);color:var(--text3,#9499a0);font-size:inherit;white-space:nowrap;`
  return span
}

function injectCommentMeta(actionButtons) {
  const shadowRoot = actionButtons.shadowRoot
  // 已经插过就不再插：lit 重渲染后这里要能补回来，所以判重看 DOM 而不是看标记
  if (!shadowRoot
    || shadowRoot.querySelector(`.${COMMENT_LOCATION_CLASS}`)
    || shadowRoot.querySelector(`.${COMMENT_GENDER_CLASS}`)) {
    return
  }

  const pubdate = shadowRoot.querySelector('#pubdate')
  if (!pubdate)
    return

  const meta = resolveCommentMeta(actionButtons)
  const showLocation = isCommentLocationEnabled() && meta.location
  const showGender = isCommentGenderEnabled() && meta.gender
  if (!showLocation && !showGender)
    return

  let anchor = pubdate
  // 属地关掉时，性别就落在属地本该在的地方（时间后面）
  if (showLocation) {
    const locationSpan = makeCommentMetaSpan(COMMENT_LOCATION_CLASS, meta.location, shadowRoot)
    anchor.after(locationSpan)
    anchor = locationSpan
  }
  if (showGender)
    anchor.after(makeCommentMetaSpan(COMMENT_GENDER_CLASS, meta.gender, shadowRoot))
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
          if (node.nodeType === 1
            && !node.isContentEditable
            && !node.classList.contains(COMMENT_LOCATION_CLASS)
            && !node.classList.contains(COMMENT_GENDER_CLASS)) {
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
      injectCommentMeta(el)

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

  /** 收回已插进去的属地与性别。shadow 里的节点 querySelectorAll 到不了，只能自己穿进去找 */
  function removeCommentMetas(root) {
    for (const el of root.querySelectorAll(`.${COMMENT_LOCATION_CLASS}, .${COMMENT_GENDER_CLASS}`))
      el.remove()

    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot)
        removeCommentMetas(el.shadowRoot)
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
        removeCommentMetas(host.shadowRoot)
    }
    release()
  }

  function syncWithFlag() {
    if (isCommentLocationEnabled() || isCommentGenderEnabled())
      enable()
    else
      disable()
  }

  new MutationObserver(syncWithFlag).observe(document.documentElement, {
    attributes: true,
    attributeFilter: [COMMENT_LOCATION_ATTR, COMMENT_GENDER_ATTR],
  })

  syncWithFlag()
}

setupCommentIpLocation()

// ============================ 评论区净化 ============================
// 整个评论区不显示。评论区是页面自己那颗组件树渲染的（`#commentapp > bili-comments`，番剧页是
// `#comment-module`），藏起来就好；开关写在 <html> 的 data-bewly-comment-cleanup 上
// （`src/logic/commentCleanup.ts`），与上面那条通道同一套。

const COMMENT_CLEANUP_ATTR = 'data-bewly-comment-cleanup'
// 播放页 / 番剧页的评论区是一个容器，动态页与空间页另有名字（`.bili-comment-container` 那一套）。
// 开关就一个，所以四处都算上。
const COMMENT_SECTION_SELECTOR = '#commentapp, #comment-module, .bili-comment-container, .comment-wrap bili-comments'

function isCommentSectionHidden() {
  const raw = document.documentElement.getAttribute(COMMENT_CLEANUP_ATTR)
  if (!raw)
    return false

  try {
    return !!JSON.parse(raw).hideSection
  }
  catch {
    return false
  }
}

function setupCommentCleanup() {
  const styleEl = document.createElement('style')
  styleEl.id = 'bewly-comment-cleanup'
  document.documentElement.appendChild(styleEl)

  const publish = () => {
    styleEl.textContent = isCommentSectionHidden()
      ? `${COMMENT_SECTION_SELECTOR} { display: none !important; }`
      : ''
  }

  new MutationObserver(publish).observe(document.documentElement, {
    attributes: true,
    attributeFilter: [COMMENT_CLEANUP_ATTR],
  })

  publish()
}

setupCommentCleanup()

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
// 评论、动态、推荐位、搜索都是页面自己请求的，过滤只能在这一层做：把 JSON 读出来、丢掉要丢的条目、
// 再放回去。fetch 与 XHR 两条路都装上——走哪条是 B 站自己的事，页面上两种都有。
//
// **只装一套钩子**：每个特性往下面那张表里登记一条规则，钩子在最后统一装一次。曾经是每个特性各装
// 一套，于是同一次响应要穿过十来层包装（每层一次正则、一次函数调用），而页面每读一次 `responseText`
// 都要把整条链走一遍。现在不管登记了多少条规则，链子都只有一层。
//
// 一次请求只过滤一次：页面可能把 response 读好几遍，改两次就等于把已经过滤过的再过滤一遍。

/** @type {{ shouldFilter: (url: string) => boolean, filter: (payload: any) => any }[]} */
const jsonResponseRules = []

/**
 * 登记一条规则。谁需要改写响应就调它，钩子由 `installJsonResponseHooks` 统一装。
 *
 * @param shouldFilter 这条请求归不归这套规则管
 * @param filter 拿到解析好的 JSON，返回改过的 payload；返回 null 表示不用改
 */
function setupJsonResponseFilter(shouldFilter, filter) {
  jsonResponseRules.push({ shouldFilter, filter })
}

/** 规则自己炸了不能连累页面：当作「不用改」。 */
function filterJsonPayload(rule, payload) {
  try {
    return rule.filter(payload) || null
  }
  catch {
    return null
  }
}

/**
 * 这条 URL 认领的规则都过一遍（规则各管各的接口，今天不会有两条同时命中一条 URL，但按登记顺序
 * 逐条问过更稳）。一条都没改动就返回 null，调用方据此原样放行。
 */
function applyJsonRules(url, payload) {
  let current = payload
  let changed = false

  for (const rule of jsonResponseRules) {
    if (!rule.shouldFilter(url))
      continue

    const filtered = filterJsonPayload(rule, current)
    if (filtered) {
      current = filtered
      changed = true
    }
  }

  return changed ? current : null
}

/** 把上面那张表接到页面的请求上，只接一次；一条规则都没有时什么都不装。 */
function installJsonResponseHooks() {
  if (!jsonResponseRules.length)
    return

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

        const filtered = applyJsonRules(url, payload)
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
      if (xhr.readyState !== 4)
        return value
      if (xhr.__bewlyJsonFiltered !== undefined)
        return xhr.__bewlyJsonFiltered

      const url = xhr.__bewlyJsonUrl || ''
      let result = value
      try {
        if (typeof value === 'string') {
          const filtered = applyJsonRules(url, JSON.parse(value))
          if (filtered)
            result = JSON.stringify(filtered)
        }
        else if (value && typeof value === 'object' && !(value instanceof ArrayBuffer)) {
          const filtered = applyJsonRules(url, value)
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
// 拿不到，所以过滤只能在数据这层做。开关、四条名单与另外两条单条规则由 content script 序列化成
// JSON 写在 <html> 上（`src/logic/commentFilter.ts`），与评论区 IP 属地同一套通道。
//
// 注意这是**不看**评论内容之外的：命中的评论连同它下面的楼中楼一起消失，楼里单独命中的也会掉。

const COMMENT_FILTER_ATTR = 'data-bewly-comment-filter'
const COMMENT_REPLY_RE = /\/x\/v2\/reply\/(?:wbi\/)?(?:main|reply)(?:[/?]|$)/
/** 话题在评论里就是内容中成对的 `#` 之间那一段。 */
const COMMENT_TOPIC_RE = /#([^#\n]{1,40})#/g
/** 带货链接都长在这个域名下。 */
const COMMENT_GOODS_PREFIX = 'https://gaoneng.bilibili.com/tetris'

function readCommentFilterRules() {
  const parsed = readJsonAttribute(COMMENT_FILTER_ATTR)
  if (!parsed || !parsed.enabled)
    return null

  const rules = {
    onlyAt: !!parsed.onlyAt,
    goods: !!parsed.goods,
    content: compileKeywords(parsed.content, 'contains'),
    user: compileKeywords(parsed.user, 'exact'),
    uid: compileKeywords(parsed.uid, 'exact'),
    topic: compileKeywords(parsed.topic, 'contains'),
  }

  // 开关开着但两条单条规则都关着、四条名单也空着，等于没开
  const nothingInLists = [rules.content, rules.user, rules.uid, rules.topic].every(isEmptyKeywords)
  return nothingInLists && !rules.onlyAt && !rules.goods ? null : rules
}

/**
 * 整条评论只有「@某人」、别的什么都没有。
 *
 * 写成「按空白切开，每一段都是 @ 开头」而不是一条正则：`(@\S+\s?)+` 这种套着量词的正则会在长评论上
 * 回溯到爆，而这里的输入是别人的评论，长度不由我们说了算。
 */
function isOnlyAtComment(message) {
  const text = String(message == null ? '' : message).trim()
  if (!text.startsWith('@'))
    return false

  return text.split(/\s+/).every(part => part.startsWith('@') && part.length > 1)
}

/** 蓝链里带着商品字段，或者干脆就指着带货域名。 */
function hasGoodsLink(urls) {
  if (!urls || typeof urls !== 'object')
    return false

  for (const url of Object.values(urls)) {
    if (!url || typeof url !== 'object')
      continue

    const extra = url.extra
    if (extra && typeof extra === 'object') {
      // 这两个字段不一定在：`Number(undefined)` 是 NaN，直接拿来跟 0 比会把「有 extra 但没带货」
      // 的蓝链全判成带货
      const itemId = Number(extra.goods_item_id)
      if (Number(extra.goods_cm_control) === 1 || (Number.isFinite(itemId) && itemId !== 0))
        return true
    }
    const schema = url.app_url_schema || url.app_url_schema_h5
    if (typeof schema === 'string' && schema.startsWith(COMMENT_GOODS_PREFIX))
      return true
  }

  return false
}

/** 带货评论：挂着商品卡、正文里带着货链接，或蓝链里带着商品字段。 */
function isGoodsComment(reply) {
  const content = reply.content || {}
  if (content.card_info)
    return true

  const message = content.message
  if (typeof message === 'string' && message.includes(COMMENT_GOODS_PREFIX))
    return true

  return hasGoodsLink(content.urls)
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
  const message = reply.content && reply.content.message
  if (rules.goods && isGoodsComment(reply))
    return true
  if (rules.onlyAt && isOnlyAtComment(message))
    return true
  if (matchKeywords(rules.content, message))
    return true
  if (matchKeywords(rules.user, member.uname))
    return true
  if (matchKeywords(rules.uid, member.mid == null ? '' : String(member.mid)))
    return true
  return hasMatchedTopic(rules.topic, message)
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
    url => COMMENT_REPLY_RE.test(typeof url === 'string' ? url : '') && !!readCommentFilterRules(),
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
    url => MOMENTS_FEED_RE.test(typeof url === 'string' ? url : '') && !!readMomentsRules(),
    filterMomentsPayload,
  )
}

setupMomentsFilter()

// ============================ 视频下方推荐过滤 ============================
// 推荐位由页面自己请求（`/x/web-interface/archive/related`），其中有两件事只有接口那份数据说得清：
// - 充电专属的条目上带着 `charging_pay`（实测：普通条目连这个字段都没有）；
// - 投稿之外的内容（番剧、课程等）`ai_rcmd.goto` 不是 `av`，另外还带 `is_ogv`。
// 上面两件事在渲染出来的卡片上都没有痕迹（卡片长得一模一样），所以只能在这一层清。
//
// 推广位与「整个推荐位都不要」不在这里：那两种卡片是页面自己插进 DOM 的，由 content script 按
// 卡片类名处理（`src/logic/videoPageRecommendationFilter.ts`）。
//
// 开关写在 <html> 的 data-bewly-video-relate-filter 上（`src/logic/videoPageRelateFilter.ts`）。

const VIDEO_RELATE_FILTER_ATTR = 'data-bewly-video-relate-filter'
const VIDEO_RELATE_RE = /\/x\/web-interface\/archive\/related(?:[/?]|$)/

function readVideoRelateRules() {
  const parsed = readJsonAttribute(VIDEO_RELATE_FILTER_ATTR)
  if (!parsed)
    return null
  if (!parsed.chargeExclusive && !parsed.onlyUploader)
    return null

  return { chargeExclusive: !!parsed.chargeExclusive, onlyUploader: !!parsed.onlyUploader }
}

/** 充电专属：`charging_pay` 出现即算，只有明摆着的 0 / false / 空才不算。 */
function isChargeExclusiveItem(item) {
  const flag = item.charging_pay
  if (flag === undefined || flag === null || flag === false || flag === '' || flag === '0' || flag === 0)
    return false

  return true
}

/** 投稿视频：`ai_rcmd.goto` 是 `av`。没有这个字段的按投稿算——认不出的条目不删。 */
function isUploaderVideoItem(item) {
  if (item.is_ogv)
    return false

  const goto = item.ai_rcmd && item.ai_rcmd.goto
  return !goto || goto === 'av'
}

function shouldDropRelateItem(item, rules) {
  if (!item || typeof item !== 'object')
    return false
  if (rules.chargeExclusive && isChargeExclusiveItem(item))
    return true
  if (rules.onlyUploader && !isUploaderVideoItem(item))
    return true

  return false
}

function filterRelatePayload(payload) {
  const rules = readVideoRelateRules()
  const list = payload && payload.data
  if (!rules || !Array.isArray(list))
    return null

  const kept = list.filter(item => !shouldDropRelateItem(item, rules))
  if (kept.length === list.length)
    return null

  payload.data = kept
  return payload
}

function setupVideoRelateFilter() {
  setupJsonResponseFilter(
    url => VIDEO_RELATE_RE.test(typeof url === 'string' ? url : '') && !!readVideoRelateRules(),
    filterRelatePayload,
  )
}

setupVideoRelateFilter()

// ============================ 搜索页净化 ============================
// 搜索结果是页面自己请求的，清在响应里谁也看不见；而且「这条结果是什么类型」「UP 主的 UID 是多少」
// 在渲染出来的卡片上读不到，只有接口那份数据说得清。开关、类型清单与三条名单由 content script
// 序列化成 JSON 写在 <html> 上（`src/logic/searchFilter.ts`）。
//
// 网页端搜索页用的是这几个接口：
// - 综合搜索 `/x/web-interface/wbi/search/all/v2`：结果按 `result_type` 分组，组里每条也带 `type`；
// - 分类搜索 `/x/web-interface/wbi/search/type`：`data.result[]` 是一条条结果；
// - 热搜与发现 `/x/web-interface/wbi/search/square`：网页端 `data` 是个对象（`trending` / `recommend`），
//   每一块的 `list` 就是那串词；App 那边是 `data[]` + `type` + `data.list`，两种都认；
// - 默认关键词 `/x/web-interface/wbi/search/default`：搜索框里那个默认词就是 `data.name`。

const SEARCH_FILTER_ATTR = 'data-bewly-search-filter'
const SEARCH_ALL_RE = /\/x\/web-interface\/(?:wbi\/)?search\/all\/v2(?:[/?]|$)/
const SEARCH_TYPE_RE = /\/x\/web-interface\/(?:wbi\/)?search\/type(?:[/?]|$)/
// 热搜与发现在网页端是 `x/web-interface` 那一份，App 那边用的是 `x/v2`，两个都认
const SEARCH_SQUARE_RE = /\/x\/(?:web-interface|v2)\/(?:wbi\/)?search\/square(?:[/?]|$)/
const SEARCH_DEFAULT_RE = /\/x\/web-interface\/(?:wbi\/)?search\/default(?:[/?]|$)/
const SEARCH_RECOMMEND_RE = /\/x\/v2\/search\/recommend(?:[/?]|$)/
const SEARCH_DEFAULTWORDS_RE = /\/x\/v2\/search\/defaultwords(?:[/?]|$)/

/**
 * 设置里那一格（按 B 站自己的类型名写）对应的接口类型标识。
 *
 * 网页端综合搜索实际会返回的只有 `video`、`bili_user`、`media_bangumi`、`media_ft`、`web_game`、
 * `activity`、`brand_ad` 这几种；剩下的几格（漫画、频道、话题、合集、动态）是 B 站自己的分类，
 * 网页端把那些内容放在分类搜索里，名字照它的枚举写在这里——出现了就能清掉，没出现就什么都不动。
 * 相关搜索网页端没有对应的结果，那一格今天不会命中。
 *
 * 「热搜横幅」对应的是结果页最上面那一块：网页端把活动卡（`activity`）与游戏卡（`web_game`）
 * 拼成一个列表，位置就是热搜横幅那个位置；游戏卡另有一格管它，两格都勾上就整块清掉。
 */
const SEARCH_RESULT_TYPE_IDS = {
  hot_banner: ['activity', 'hot_banner', 'banner'],
  video: ['video'],
  related_search: ['related_search'],
  game: ['game', 'web_game', 'esports'],
  user: ['bili_user', 'user'],
  ad: ['ad', 'brand_ad'],
  comic: ['comic'],
  channel: ['channel'],
  bangumi: ['media_bangumi', 'media_ft', 'ogv_pgc', 'bgm_media', 'pgc_media'],
  subject: ['topic', 'subject'],
  collection: ['collection'],
  article: ['article'],
  twitter: ['dynamic', 'dynamic_new', 'twitter'],
  live: ['live', 'live_room', 'live_user'],
  ketang: ['ketang'],
}

function readSearchRules() {
  const parsed = readJsonAttribute(SEARCH_FILTER_ATTR)
  if (!parsed)
    return null

  const purify = Array.isArray(parsed.purify) ? parsed.purify : []
  const types = Array.isArray(parsed.types) ? parsed.types : []
  const keywords = parsed.enabledKeywords
    ? {
        content: compileKeywords(parsed.content, 'contains'),
        user: compileKeywords(parsed.user, 'exact'),
        uid: compileKeywords(parsed.uid, 'exact'),
      }
    : null

  const hasKeywords = keywords && !Object.values(keywords).every(isEmptyKeywords)
  if (!purify.length && !types.length && !hasKeywords)
    return null

  return { purify, types, keywords: hasKeywords ? keywords : null }
}

/** 标题带 `<em class="keyword">` 高亮，匹配前先摘掉。 */
function stripSearchHighlight(text) {
  return String(text == null ? '' : text).replace(/<[^>]*>/g, '')
}

/** 各种结果类型的字段名不一样，挨个试。 */
function searchItemTitle(item) {
  return stripSearchHighlight(item.title || item.uname || item.name || '')
}

function searchItemUp(item) {
  return stripSearchHighlight(item.author || item.uname || item.up_name || '')
}

function searchItemUid(item) {
  const mid = item.mid == null ? item.uid : item.mid
  return mid == null ? '' : String(mid)
}

function matchesSearchKeywords(item, keywords) {
  if (!keywords)
    return false
  if (matchKeywords(keywords.content, searchItemTitle(item)))
    return true
  if (matchKeywords(keywords.user, searchItemUp(item)))
    return true

  return matchKeywords(keywords.uid, searchItemUid(item))
}

/** 这一条结果的类型标识，`type` 与 `result_type` 都算。 */
function searchItemTypeId(item) {
  return String(item.type || item.result_type || '')
}

/** 这一格设置落到哪些类型标识上。 */
function blockedSearchTypeIds(types) {
  const ids = []
  for (const key of types) {
    const mapped = SEARCH_RESULT_TYPE_IDS[key]
    if (mapped)
      ids.push(...mapped)
  }
  return ids
}

function shouldDropSearchItem(item, rules, blockedIds) {
  if (!item || typeof item !== 'object')
    return false
  if (blockedIds.length && blockedIds.includes(searchItemTypeId(item)))
    return true

  return matchesSearchKeywords(item, rules.keywords)
}

/** 综合搜索：整组分类型，组里每条也带自己的类型，两个都要看。 */
function filterSearchAllPayload(payload, rules, blockedIds) {
  const groups = payload && payload.data && payload.data.result
  if (!Array.isArray(groups))
    return null

  let changed = false
  const keptGroups = []

  for (const group of groups) {
    const groupType = String((group && group.result_type) || '')
    if (groupType && blockedIds.includes(groupType)) {
      changed = true
      continue
    }

    const items = group && group.data
    if (!Array.isArray(items)) {
      keptGroups.push(group)
      continue
    }

    const kept = items.filter(item => !shouldDropSearchItem(item, rules, blockedIds))
    if (kept.length !== items.length) {
      changed = true
      group.data = kept
      // 清空的那一组整个不要：留着一个空壳，页面上会多出一段空白
      if (!kept.length && items.length)
        continue
    }
    keptGroups.push(group)
  }

  if (!changed)
    return null

  payload.data.result = keptGroups
  return payload
}

/** 分类搜索：`data.result[]` 是一条条结果，类型看每条自己。 */
function filterSearchTypePayload(payload, rules, blockedIds) {
  const items = payload && payload.data && payload.data.result
  if (!Array.isArray(items))
    return null

  const kept = items.filter(item => !shouldDropSearchItem(item, rules, blockedIds))
  if (kept.length === items.length)
    return null

  payload.data.result = kept
  return payload
}

/** 推荐理由（「因为你关注了…」）跟着发现一起清。 */
function stripSearchRecommendReason(list) {
  let changed = false
  for (const entry of list) {
    if (entry && entry.recommend_reason) {
      delete entry.recommend_reason
      changed = true
    }
  }
  return changed
}

/**
 * 热搜与发现。同一个接口有两种形状，两种都认：
 * - 网页端（实测）：`data` 是个对象，键就是那一块的名字（`trending`，登录后还有 `recommend`），
 *   每一块的 `list` 就是那串词；
 * - App 那边（以及老网页端）：`data` 是数组，每一块自带 `type`，词在 `data.list` 里。
 *
 * 清法一样：那一块的 list 清空。
 */
function filterSearchSquarePayload(payload, purify) {
  const data = payload && payload.data
  if (!data || typeof data !== 'object')
    return null

  let changed = false

  const purifyBlock = (type, block) => {
    const list = block && block.list
    if (!Array.isArray(list))
      return

    if (purify.includes(type)) {
      block.list = []
      changed = true
    }
    else if (type === 'recommend' && stripSearchRecommendReason(list)) {
      changed = true
    }
  }

  if (Array.isArray(data)) {
    for (const block of data) {
      if (block && typeof block === 'object')
        purifyBlock(String(block.type || ''), block.data)
    }
  }
  else {
    for (const [type, block] of Object.entries(data))
      purifyBlock(type, block)
  }

  return changed ? payload : null
}

function filterSearchRecommendPayload(payload, purify) {
  const list = payload && payload.data && payload.data.list
  if (!purify.includes('recommend') || !Array.isArray(list) || !list.length)
    return null

  payload.data.list = []
  return payload
}

function filterSearchDefaultPayload(payload, purify) {
  const data = payload && payload.data
  if (!purify.includes('words') || !data || typeof data !== 'object')
    return null
  if (!data.name && !data.show_name)
    return null

  // 搜索框里那个默认词就是它，清掉等于让它没有默认词
  data.name = ''
  data.show_name = ''
  return payload
}

function setupSearchFilter() {
  const withRules = (url, filter) => {
    setupJsonResponseFilter(
      // 什么都没配时不认领这条请求：省掉对每个搜索响应的一次 JSON.parse（搜索响应不小，
      // 而且这是默认状态——没开任何净化的人不该为它付这份钱）
      candidate => url.test(typeof candidate === 'string' ? candidate : '') && !!readSearchRules(),
      (payload) => {
        const rules = readSearchRules()
        if (!rules)
          return null

        return filter(payload, rules)
      },
    )
  }

  withRules(SEARCH_ALL_RE, (payload, rules) => filterSearchAllPayload(payload, rules, blockedSearchTypeIds(rules.types)))
  withRules(SEARCH_TYPE_RE, (payload, rules) => filterSearchTypePayload(payload, rules, blockedSearchTypeIds(rules.types)))
  withRules(SEARCH_SQUARE_RE, (payload, rules) => filterSearchSquarePayload(payload, rules.purify))
  withRules(SEARCH_RECOMMEND_RE, (payload, rules) => filterSearchRecommendPayload(payload, rules.purify))
  withRules(SEARCH_DEFAULT_RE, (payload, rules) => filterSearchDefaultPayload(payload, rules.purify))
  withRules(SEARCH_DEFAULTWORDS_RE, (payload, rules) => filterSearchDefaultPayload(payload, rules.purify))
}

setupSearchFilter()

// ============================ 视频页自动点赞 ============================
// 点赞有个前提：得先知道视频是不是已经赞过——那枚按钮是个开关，点反了就是把用户的赞取消，而未赞的
// 视频在页面拿到三元组状态前后长得一模一样（DOM 上看不出「状态还没到」）。
//
// 网页端自己的答案是 `/x/web-interface/archive/relation`，而且它**只在登录时才发这个请求**
// （页面里 `getTripleState` 先看 `userInfo.isLogin`）。所以这里盯着页面自己那次请求的响应，把结果
// 写进 <html>，由 content script（`src/logic/videoPageAutoLike.ts`）决定要不要点。
//
// 这样连竞态也没有了：页面还没拿到登录态时点按钮，B 站只会弹登录框、什么都不做；而请求没发出来，
// 我们就不点。

const AUTOLIKE_ATTR = 'data-bewly-autolike'
const AUTOLIKE_RELATION_RE = /\/x\/web-interface\/archive\/relation(?:[/?]|$)/

/** 从请求 URL 里取 bvid。取不到就不发布：状态必须知道是哪个视频的。 */
function bvidFromRelatedUrl(url) {
  const match = String(url || '').match(/[?&]bvid=(BV[0-9A-Za-z]+)/)
  return match ? match[1] : ''
}

function publishAutoLikeState(url, payload) {
  const bvid = bvidFromRelatedUrl(url)
  if (!bvid || !payload || payload.code !== 0 || !payload.data)
    return

  document.documentElement.setAttribute(AUTOLIKE_ATTR, JSON.stringify({
    bvid,
    like: !!payload.data.like,
  }))
}

function setupAutoLikeState() {
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
      // clone 出来读，页面自己那份一个字节都不动；读不动就算了
      if (AUTOLIKE_RELATION_RE.test(url)) {
        result
          .then(response => response.clone().json().then(payload => publishAutoLikeState(url, payload)).catch(() => {}))
          .catch(() => {})
      }
      return result
    }
  }

  if (typeof XMLHttpRequest !== 'undefined') {
    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__bewlyRelationUrl = typeof url === 'string' ? url : String(url ?? '')
      return originalOpen.call(this, method, url, ...rest)
    }

    XMLHttpRequest.prototype.send = function (...args) {
      if (AUTOLIKE_RELATION_RE.test(this.__bewlyRelationUrl || '')) {
        this.addEventListener('load', function () {
          let payload = null
          try {
            payload = this.response && typeof this.response === 'object' ? this.response : JSON.parse(this.responseText)
          }
          catch {}
          publishAutoLikeState(this.__bewlyRelationUrl, payload)
        })
      }
      return originalSend.apply(this, args)
    }
  }
}

setupAutoLikeState()

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

// 所有规则登记完了，接口钩子在这里统一装一次（见上面那段注释：一套钩子，多少条规则都只一层）。
installJsonResponseHooks()

window.___inject = true

// History.prototype.pushState = history.pushState
// History.prototype.replaceState = history.replaceState
// History.prototype.forward = history.forward
