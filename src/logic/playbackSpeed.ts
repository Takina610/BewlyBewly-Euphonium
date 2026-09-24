import { lastPlaybackRate, settings } from '~/logic'

/**
 * 视频页的播放速度：默认速度、长按倍速、自定义倍速列表。
 *
 * 三件事都靠播放器自己认：速度就是 `<video>.playbackRate`（直接写，播放器会把按钮上的数字跟着改），
 * 倍速菜单就是 `.bpx-player-ctrl-playbackrate-menu`（点它自己的条目本来就会改速度）。所以这里不碰
 * 播放器的 JS，只做三件事——进场时把速度设上去、按住方向键时反复按回去、把菜单换成用户写的那几档。
 *
 * B 站自己**不记**播放速度：`bpx_player_profile` 里只有画质、音量这些，刷新后一律回到 1x。所以
 * 「记住播放速度变化」记的是我们自己存的那个数（`lastPlaybackRate`），不是读回来的。
 */

/** 播放器里正片那个 <video>；悬浮预览、画中画都挂在别处，不进这个容器。 */
const PLAYER_SELECTOR = '#bilibili-player'
const VIDEO_SELECTOR = `${PLAYER_SELECTOR} video`
/** 播放器自己的倍速菜单；命中它才知道用户能点哪几档。 */
const RATE_MENU_SELECTOR = '.bpx-player-ctrl-playbackrate-menu'
const RATE_ITEM_SELECTOR = '.bpx-player-ctrl-playbackrate-menu-item'
const RATE_ITEM_CLASS = 'bpx-player-ctrl-playbackrate-menu-item'
/** 播放器用来标出当前那一档的类名。 */
const RATE_ACTIVE_CLASS = 'bpx-state-active'
/** 我们插进去的条目，撤掉列表时按它来找。 */
const RATE_CUSTOM_ATTR = 'data-bewly-rate-item'
/** 被列表挤掉的原生条目，撤掉列表时按它恢复。 */
const RATE_HIDDEN_ATTR = 'data-bewly-rate-hidden'

/** 浏览器自己允许的速度区间，超出去写 `playbackRate` 会抛 NotSupportedError。 */
export const MIN_PLAYBACK_RATE = 0.0625
export const MAX_PLAYBACK_RATE = 16
/** 自定义列表最多认这么多档，免得一段乱写的文本在菜单里排一屏。 */
export const MAX_PLAYBACK_RATE_LIST = 12

/**
 * 播放器把画质、进度这些安排好要一点时间，这段时间里它自己写进来的速度不算用户改的。
 * 也正因为有这么一段，进场设的速度要等它安静下来再确认一次。
 */
const LOAD_SETTLE_WINDOW = 2000
/** 上面那次确认的延迟。 */
const VERIFY_DELAY = 700
/**
 * 长按期间按回去的频率。用定时器而不是 rAF：定时器在标签页切到后台时照常跑，而长按快进这件事
 * 本来就发生在你没盯着画面的时候。
 */
const HOLD_INTERVAL = 60
/**
 * 按住多久才算长按。点一下右方向键是快进 5 秒，不是长按——不设这道门槛的话，每点一次快进都会
 * 把速度短暂拨到长按那一档，看起来就像「没长按也被设了」。
 */
const HOLD_DELAY = 250
/**
 * 松手后这一小段里，播放器要是把它长按的那一档当成新速度写回来，那是它自己的回声，不是用户挑的。
 * 播放器记的可能是我们按住时那一档（我们的速度写在它前面），所以不能就这么把速度留在那里。
 */
const HOLD_ECHO_WINDOW = 500

/** 输入里带负号：`-` 以及几个看着像减号的符号。 */
export function hasPlaybackRateSign(text: string): boolean {
  return /[-−—–]/.test(text)
}

/** 单个速度输入框里只认数字和小数点：多段就当没写，别拼成一个用户没写过的数。 */
export function sanitizePlaybackRateInput(text: string): string {
  const [first = ''] = String(text).split(/\s+/)
  return first.replace(/[^\d.]/g, '')
}

/** 列表输入框：数字、小数点，外加当分隔符的空格。 */
export function sanitizePlaybackRateListInput(text: string): string {
  return String(text).replace(/\s+/g, ' ').replace(/[^\d. ]/g, '')
}

/**
 * 离开输入框时把内容收成真正会生效的那个值：`0`、`1..5` 这种认不出的清空，超范围（`100`）写成
 * 夹住之后那个数。输入当中不能这么干——`0` 是 `0.5` 的前半截。
 */
export function cleanupPlaybackRateInput(text: string): string {
  const rate = parsePlaybackRate(text)
  return rate === null ? '' : String(rate)
}

/** 列表同理：认不出的那几段、重复的、超出上限的都去掉，剩下的按写下来的顺序写回去。 */
export function cleanupPlaybackRateListInput(text: string): string {
  return parsePlaybackRateList(text).join(' ')
}

/**
 * 读一个速度值：`1.5`、`1.5x`、` 2 ` 都认，别的（空、`abc`、`0`）一律 null，表示不要动。
 */
export function parsePlaybackRate(text: string): number | null {
  const value = Number(String(text).trim().replace(/x$/i, ''))
  if (!Number.isFinite(value) || value <= 0)
    return null

  return Math.min(Math.max(value, MIN_PLAYBACK_RATE), MAX_PLAYBACK_RATE)
}

/**
 * 读一行速度列表（空格分隔，如 `2 1.5 1`）：认不出的整段跳过，重复的只留一个，按写下来的顺序返回。
 */
export function parsePlaybackRateList(text: string, limit = MAX_PLAYBACK_RATE_LIST): number[] {
  const rates: number[] = []
  for (const part of String(text).split(/\s+/)) {
    const rate = parsePlaybackRate(part)
    if (rate === null || rates.includes(rate))
      continue

    rates.push(rate)
    if (rates.length >= limit)
      break
  }
  return rates
}

/**
 * 菜单上怎么写速度。B 站自己写成 `2.0x` / `1.25x` / `0.75x`——最多两位小数，整数也带一位。
 */
export function formatPlaybackRate(rate: number): string {
  const rounded = Math.round(rate * 100) / 100
  return `${rounded % 1 === 0 ? rounded.toFixed(1) : rounded}x`
}

function readRate(item: Element): number | null {
  return parsePlaybackRate(item.getAttribute('data-value') ?? '')
}

/** 把菜单恢复成播放器自己的样子：拆掉我们插的条目，放开被藏起来的。 */
function restoreMenu(menu: Element) {
  for (const item of Array.from(menu.querySelectorAll(`[${RATE_CUSTOM_ATTR}]`)))
    item.remove()

  for (const item of Array.from(menu.querySelectorAll(`[${RATE_HIDDEN_ATTR}]`))) {
    if (item instanceof HTMLElement)
      item.style.display = ''
    item.removeAttribute(RATE_HIDDEN_ATTR)
  }
}

/** 让当前那一档戴上播放器的选中样式。 */
function syncActiveItem(menu: Element, rate: number) {
  for (const item of Array.from(menu.querySelectorAll(RATE_ITEM_SELECTOR))) {
    // 被我们藏起来的原生条目也要一起摘掉选中态：它已经不在菜单上了
    const active = readRate(item) === rate && !item.hasAttribute(RATE_HIDDEN_ATTR)
    item.classList.toggle(RATE_ACTIVE_CLASS, active)
  }
}

/**
 * 菜单已经是不是就是这个列表的样子。菜单变化会来回触发观察器，所以每次动手前先问这一句：
 * 已经是了就别再铺一遍，否则「铺菜单 → 观察器响 → 再铺」会一直转下去。
 */
function menuMatches(menu: Element, rates: number[]): boolean {
  const shown = Array.from(menu.querySelectorAll(RATE_ITEM_SELECTOR))
    .filter(item => !item.hasAttribute(RATE_HIDDEN_ATTR))
    .map(item => readRate(item))

  return shown.length === rates.length && rates.every(rate => shown.includes(rate))
}

/**
 * 把菜单换成用户写的那几档：列表里有、播放器也有的留着，播放器多出来的藏起来，列表里缺的补上。
 *
 * 藏而不是删，是为了列表被清空时能把播放器自己的菜单原样还回去——那几档是播放器渲染出来的，
 * 删掉就再也回不来了。
 */
function rewriteMenu(menu: Element, rates: number[], onPick: (rate: number) => void) {
  if (menuMatches(menu, rates))
    return

  restoreMenu(menu)
  if (!rates.length)
    return

  const missing = new Set(rates)

  for (const item of Array.from(menu.querySelectorAll(RATE_ITEM_SELECTOR))) {
    const rate = readRate(item)
    if (rate !== null && missing.delete(rate))
      continue

    if (item instanceof HTMLElement) {
      item.setAttribute(RATE_HIDDEN_ATTR, '1')
      item.style.display = 'none'
    }
  }

  for (const rate of rates) {
    if (!missing.has(rate))
      continue

    const item = document.createElement('li')
    item.className = RATE_ITEM_CLASS
    item.setAttribute('data-value', String(rate))
    item.setAttribute(RATE_CUSTOM_ATTR, '1')
    item.textContent = formatPlaybackRate(rate)
    item.addEventListener('click', () => onPick(rate))

    // 按大小插进播放器自己的顺序里，菜单看起来还是一列从快到慢
    const next = Array.from(menu.querySelectorAll(RATE_ITEM_SELECTOR))
      .find(el => !el.hasAttribute(RATE_CUSTOM_ATTR) && (readRate(el) ?? 0) < rate)
    menu.insertBefore(item, next ?? null)
  }
}

/**
 * 起这一套。页面门在调用点（`contentScripts/index.ts`），模块自己不做 URL 判断——与
 * `webFullscreenMemory` 同一套做法，这样它能在 jsdom 里直接驱动。
 */
export function setupPlaybackSpeed() {
  let video: HTMLVideoElement | null = null
  let menu: Element | null = null
  let menuObserver: MutationObserver | null = null
  /** 我们自己写进去的那个值，用来把播放器的回声和用户的手动改动分开。 */
  let writtenRate = 0
  /**
   * 不长按时该是多快：进场那一档，或者用户自己挑的一档。松手后回到它，而不是回到长按期间被
   * 播放器改乱的那个数——B 站的长按是往 `playbackRate` 上写 3x 的，拿它当还原值就会把速度留在 3x。
   */
  let baseRate = 0
  /**
   * 右方向键从按下到松开的这一整段。这期间的速度变化都是播放器在动（B 站自己的长按倍速就是往
   * `playbackRate` 上写 3x），不是用户挑的偏好，所以既不记进 `lastPlaybackRate`，也不当还原值。
   */
  let pressActive = false
  /** 长按期间要维持的速度；null 表示这一档交给 B 站自己（没配，或还没到判定时间）。 */
  let holdRate: number | null = null
  /** 刚松开的那一档，以及松开的时间点：用来认出播放器写回来的那次回声。 */
  let lastHoldRate: number | null = null
  let holdEndedAt = 0
  let holdTimer: number | undefined
  let holdDelayTimer: number | undefined
  /** 这次加载的时间点，用来判断一个速度变化是不是播放器自己在安顿。 */
  let loadedAt = 0
  let userChanged = false
  let verifyTimer: number | undefined

  function currentVideo(): HTMLVideoElement | null {
    return document.querySelector<HTMLVideoElement>(VIDEO_SELECTOR)
      ?? document.querySelector<HTMLVideoElement>(PLAYER_SELECTOR)?.querySelector('video')
      ?? null
  }

  /** 写速度。写之前先记下来，这样它自己触发的 ratechange 不会被当成用户改的。 */
  function applyRate(rate: number) {
    if (!video || video.playbackRate === rate)
      return

    writtenRate = rate
    video.playbackRate = rate
  }

  /** 进场速度：设了默认速度就用它；没设而开了「记住播放速度变化」，就用上次记住的那个。 */
  function startRate(): number | null {
    const configured = parsePlaybackRate(settings.value.videoPageDefaultPlaybackRate)
    if (configured !== null)
      return configured

    if (settings.value.videoPageRememberPlaybackRate && lastPlaybackRate.value > 0)
      return lastPlaybackRate.value

    return null
  }

  function applyStartRate() {
    const rate = startRate()
    if (rate === null)
      return

    baseRate = rate
    applyRate(rate)
  }

  function handleRateChange() {
    if (!video)
      return

    const rate = video.playbackRate
    // 我们自己写的（播放器随后会跟着改按钮上的数字，但不会再改速度）
    if (rate === writtenRate)
      return

    // 按着右方向键的整段时间里，播放器写的速度都是在快进，不是用户挑的偏好
    if (pressActive)
      return

    // 松手后播放器把它长按的那一档写回来：拨回原来那一档，也别记成用户挑的
    if (lastHoldRate !== null && rate === lastHoldRate && Date.now() - holdEndedAt < HOLD_ECHO_WINDOW) {
      applyRate(baseRate)
      return
    }

    // 刚加载完这一小段里写进来的速度是播放器在安顿：跟着它走，但不算用户改的
    if (loadedAt && Date.now() - loadedAt < LOAD_SETTLE_WINDOW) {
      baseRate = rate
      return
    }

    userChanged = true
    baseRate = rate
    // 没开「记住播放速度变化」就不存：那是这个开关的全部意义
    if (settings.value.videoPageRememberPlaybackRate)
      lastPlaybackRate.value = rate
  }

  function bindVideo(target: HTMLVideoElement) {
    if (target === video)
      return

    video?.removeEventListener('ratechange', handleRateChange)
    video?.removeEventListener('loadedmetadata', handleLoaded)
    video = target
    target.addEventListener('ratechange', handleRateChange)
    target.addEventListener('loadedmetadata', handleLoaded)
    // 绑定的时候视频可能已经载入完了，loadedmetadata 不会再响一次
    handleLoaded()
  }

  function handleLoaded() {
    loadedAt = Date.now()
    userChanged = false
    writtenRate = 0
    // 换视频了，长按那点心气不再适用；这里只停循环，不把旧速度写回去
    stopHold(false)
    baseRate = video?.playbackRate ?? 0

    applyStartRate()

    if (verifyTimer !== undefined)
      window.clearTimeout(verifyTimer)
    verifyTimer = window.setTimeout(() => {
      verifyTimer = undefined
      // 用户在等待期间自己挑了速度，就不用再替他决定了
      if (!userChanged)
        applyStartRate()
    }, VERIFY_DELAY)
  }

  // #region 长按
  /**
   * 按下的地方是不是在打字。扩展自己的界面挂在 shadow root 里，事件走到 window 这一层，
   * `target` 只剩宿主元素了，所以要从 `composedPath` 里找真实目标——不然在设置里按方向键移光标，
   * 视频速度也会跟着变。
   */
  function isEditable(event: Event): boolean {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : []
    for (const node of path.length ? path : [event.target]) {
      const el = node as HTMLElement | null
      if (!el || !el.tagName)
        continue
      if (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
        return true
    }
    return false
  }

  function holdLoop() {
    if (holdRate !== null)
      applyRate(holdRate)
  }

  /** 判定成长按：把配置的那一档按住不放。 */
  function beginHold() {
    holdDelayTimer = undefined
    if (!pressActive || !video)
      return

    const configured = parsePlaybackRate(settings.value.videoPageLongPressPlaybackRate)
    const disabled = settings.value.videoPageDisableLongPressSpeedUp
    // 没配长按速度又没禁用：那是 B 站自己的长按倍速，不动它
    if (configured === null && !disabled)
      return

    // 禁用优先于长按速度：这个开关的意思是「按住时不许加速」，配了速度也一样
    holdRate = disabled ? baseRate : (configured ?? baseRate)
    holdLoop()
    holdTimer = window.setInterval(holdLoop, HOLD_INTERVAL)
  }

  /** 键按下：先只是记着，够久没松手才算长按。 */
  function startPress() {
    if (pressActive || !video)
      return

    pressActive = true
    holdDelayTimer = window.setTimeout(beginHold, HOLD_DELAY)
  }

  function stopHold(restore = true) {
    pressActive = false
    if (holdDelayTimer !== undefined) {
      window.clearTimeout(holdDelayTimer)
      holdDelayTimer = undefined
    }

    if (holdTimer !== undefined) {
      window.clearInterval(holdTimer)
      holdTimer = undefined
    }

    if (holdRate === null)
      return

    const released = holdRate
    holdRate = null
    // 松手后回到原来那一档。B 站自己也会回，这里只是保证「禁止长按倍速」时它真的回到原样
    if (restore) {
      lastHoldRate = released
      holdEndedAt = Date.now()
      applyRate(baseRate)
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowRight' || isEditable(event) || event.repeat)
      // 连按产生的 repeat 事件不算一次新的长按，第一次按下时已经开始计时了
      return

    startPress()
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (event.key === 'ArrowRight')
      stopHold()
  }
  // #endregion

  // #region 倍速菜单
  function syncMenu() {
    if (!menu?.isConnected) {
      menuObserver?.disconnect()
      menuObserver = null
      menu = null
    }

    const rates = parsePlaybackRateList(settings.value.videoPagePlaybackRateList)
    const found = document.querySelector(RATE_MENU_SELECTOR)

    if (!found) {
      menu = null
      return
    }

    if (found === menu) {
      // 菜单没换人，但列表可能刚被编辑过
      rewriteMenu(menu, rates, pickRate)
    }
    else {
      menuObserver?.disconnect()
      menu = found
      rewriteMenu(menu, rates, pickRate)

      // 播放器会在登录状态变化等时候重排这个菜单，重排后要按当前列表再铺一遍
      menuObserver = new MutationObserver(() => {
        if (menu)
          rewriteMenu(menu, parsePlaybackRateList(settings.value.videoPagePlaybackRateList), pickRate)
      })
      menuObserver.observe(menu, { childList: true })
    }

    if (video && menu)
      syncActiveItem(menu, video.playbackRate)
  }

  function pickRate(rate: number) {
    baseRate = rate
    applyRate(rate)
    userChanged = true
    if (settings.value.videoPageRememberPlaybackRate)
      lastPlaybackRate.value = rate

    if (menu && video)
      syncActiveItem(menu, video.playbackRate)
  }
  // #endregion

  function scan() {
    const found = currentVideo()
    if (found)
      bindVideo(found)

    syncMenu()
  }

  function handleWindowBlur() {
    stopHold()
  }

  const guard = window.setInterval(scan, 1000)
  scan()

  window.addEventListener('keydown', handleKeyDown, true)
  window.addEventListener('keyup', handleKeyUp, true)
  window.addEventListener('blur', handleWindowBlur)

  // 自定义列表：改列表当场重铺菜单，不用刷新页面
  watch(
    () => settings.value.videoPagePlaybackRateList,
    () => {
      if (!menu) {
        syncMenu()
        return
      }

      rewriteMenu(menu, parsePlaybackRateList(settings.value.videoPagePlaybackRateList), pickRate)
      if (video)
        syncActiveItem(menu, video.playbackRate)
    },
  )

  watch(
    () => settings.value.videoPageDefaultPlaybackRate,
    () => applyStartRate(),
  )

  // 长按那两项改了就当场生效：正在长按的话，先把手放回原来那一档，别让旧配置一直按着
  watch(
    [() => settings.value.videoPageLongPressPlaybackRate, () => settings.value.videoPageDisableLongPressSpeedUp],
    () => stopHold(),
  )

  return () => {
    window.clearInterval(guard)
    if (verifyTimer !== undefined)
      window.clearTimeout(verifyTimer)
    stopHold()
    menuObserver?.disconnect()
    window.removeEventListener('keydown', handleKeyDown, true)
    window.removeEventListener('keyup', handleKeyUp, true)
    window.removeEventListener('blur', handleWindowBlur)
    video?.removeEventListener('ratechange', handleRateChange)
    video?.removeEventListener('loadedmetadata', handleLoaded)
    if (menu)
      restoreMenu(menu)
  }
}
