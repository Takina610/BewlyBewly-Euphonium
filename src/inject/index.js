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

window.___inject = true

// History.prototype.pushState = history.pushState
// History.prototype.replaceState = history.replaceState
// History.prototype.forward = history.forward
