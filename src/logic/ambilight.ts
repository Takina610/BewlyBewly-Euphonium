import Ambientlight from '~/ambientlight/libs/ambientlight'
import ErrorReporter from '~/ambientlight/libs/errors/reporter'
import { isWatchPageUrl, setErrorHandler, videoSelector, wrapErrorHandler } from '~/ambientlight/libs/generic'
import SettingsConfig from '~/ambientlight/libs/settings-config'
import { applyAmbilightPanelLanguageToConfig, resolvePanelLanguage, setAmbilightPanelLanguage } from '~/ambientlight/panel-i18n'
import { settings } from '~/logic'

/**
 * 视频页的氛围光（ambilight）：效果整体取自 bilibili-ambilight（MIT，见 README 的 Credits 与
 * `src/ambientlight/`），这里只做接线和开关——找播放器、起它的 `Ambientlight` 实例、跟着 B 站
 * 换视频重挂，并把我们的开关与主题映射到它自己的 `enabled` / `theme`。
 *
 * 它自己在播放器控制栏右下角装一个设置按钮（它的 `Settings.attachToPlayer`），模糊、扩散那些
 * 数值都在那个按钮的面板里调；本仓库改了它的两处默认值（模糊 25、扩散 140）、按 Bewly 语言
 * 翻译面板文案（`panel-i18n.ts`），并隐藏了面板里的主题选择与启用开关（都由 Bewly 管，见
 * `content.scss` 末尾）。
 */

declare global {

  interface Window {
    /** 它自己的约定：`undefined` 没试过、`false` 在加载/失败、实例为运行中（`content-main.js` 同款）。 */
    ambientlight?: Ambientlight | false
  }
}

setErrorHandler((ex: unknown) => ErrorReporter.captureException(ex))

const getVideoElem = () => document.querySelector(videoSelector)

// The top level element of the page that contains the player. For example: #app on /video/ pages
const getAppElem = (videoElem: Element) => videoElem.closest('body > *')

function getMastheadElem() {
  return document.querySelector('#biliMainHeader, #bili-header-container')
}

function isAmbientlightRunning(): boolean {
  return !!window.ambientlight && typeof window.ambientlight === 'object'
}

/** Bewly 的深浅色（auto 跟系统）解析成 ambilight 的 theme 值：1 深色、-1 浅色。 */
const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const systemDark = ref(systemDarkQuery.matches)
systemDarkQuery.addEventListener('change', (e) => {
  systemDark.value = e.matches
})

function syncThemeToAmbilight() {
  if (!isAmbientlightRunning())
    return

  const dark = settings.value.theme === 'dark' || (settings.value.theme === 'auto' && systemDark.value)
  ;(window.ambientlight as Ambientlight).settings?.set('theme', dark ? 1 : -1, true)
}

async function tryInitAmbientlight(): Promise<boolean | undefined> {
  if (isAmbientlightRunning())
    return true
  // `false` 是它自己的「正在构造」标记（`content-main.js` 同款）：构造要等设置、画布、监听一路
  // await 下来，没落地前每秒一次的 scan 都不得再起第二套，不然设置按钮会一份份往上堆
  if (window.ambientlight === false)
    return undefined
  if (!isWatchPageUrl())
    return undefined

  const videoElem = getVideoElem()
  if (!videoElem)
    return undefined

  const settingsMenuBtnParent = videoElem
    .closest('.bpx-player-container')
    ?.querySelector('.bpx-player-control-bottom-right')
  const appElem = getAppElem(videoElem)
  if (!settingsMenuBtnParent || !appElem)
    return undefined

  window.ambientlight = false
  try {
    window.ambientlight = await new Ambientlight(
      videoElem as HTMLVideoElement,
      appElem as HTMLElement,
      getMastheadElem(),
    )
  }
  catch (ex) {
    // 起失败了就让下一次 scan 再试：标记留在 false 会把重试永远挡在外面
    window.ambientlight = undefined
    throw ex
  }
  return true
}

// Bilibili can replace the video and player elements. Ported from the upstream `content-main.js`.
function detectReplacedPlayerElems() {
  let scheduled = false
  let checking = false

  const check = wrapErrorHandler(async () => {
    scheduled = false
    if (checking || !isWatchPageUrl() || !settings.value.videoPageAmbilight)
      return

    const ambientlight = window.ambientlight
    if (!ambientlight || typeof ambientlight !== 'object')
      return

    const videoElem = getVideoElem()
    if (!videoElem)
      return

    checking = true
    try {
      const pageElemsChanged = ambientlight.updatePageElems(
        getAppElem(videoElem) as HTMLElement,
        getMastheadElem(),
      )

      const playerChanged
        = !ambientlight.videoPlayerElem?.isConnected
          || !ambientlight.videoPlayerElem.contains(videoElem)
      const videoChanged = playerChanged || ambientlight.videoElem !== videoElem

      if (playerChanged) {
        await ambientlight.reinitPlayerElems(videoElem as HTMLVideoElement)
      }
      else if (videoChanged) {
        ambientlight.initVideoElem(videoElem as HTMLVideoElement)
      }

      // Bilibili could have re-rendered the controls of the player
      if (!ambientlight.settingsMenuBtnParent?.isConnected) {
        const settingsMenuBtnParent = ambientlight.videoPlayerElem.querySelector(
          '.bpx-player-control-bottom-right',
        )
        if (settingsMenuBtnParent)
          ambientlight.settingsMenuBtnParent = settingsMenuBtnParent
      }
      ambientlight.settings?.attachToPlayer(
        ambientlight.settingsMenuBtnParent,
        ambientlight.videoAreaElem,
      )

      if (ambientlight.elem && !ambientlight.elem.isConnected) {
        ambientlight.appendElemToViewContainer()
        ambientlight.sizesChanged = true
      }

      if (videoChanged) {
        await ambientlight.start()
      }
      else if (pageElemsChanged) {
        await ambientlight.optionalFrame()
      }
    }
    finally {
      checking = false
    }
  }, true)

  // Throttled, because the danmaku (comments that fly over the video) mutate the page continuously
  const observer = new MutationObserver(() => {
    if (scheduled)
      return

    scheduled = true
    setTimeout(check, 250)
  })
  observer.observe(document, { childList: true, subtree: true })
}

/**
 * 我们开关的当前意图。引擎的操作必须边沿触发：它的 `start()` / `disable()` 只该在状态变化时
 * 调用一次——每秒重复调 `start()` 会打乱它内部的显示循环（实测菜单会被压扁成一段纯文本，
 * 光晕也会随之消失），它的设计是构造后自行运转、换视频时由 MutationObserver 重挂。
 */
let ambilightCommandedOn = false

/**
 * enable 的重入保护：enable 是异步的（构造/等待 start 都要 await），而 scan 每秒触发一次、
 * 开关与语言的 watch 也会触发——两次 enable 并发会对引擎重复 start/重复挂监听，把它的内部
 * 状态打乱（实测光晕就此失灵，开关来回一次才恢复）。同一时刻只允许一个 enable 在跑。
 */
let enableInFlight: Promise<void> | null = null
function enableAmbientlight() {
  if (enableInFlight)
    return enableInFlight

  const inFlight = (async () => {
    try {
      if (isAmbientlightRunning()) {
        // 已在运行且已接管：什么都不做，让它自己运转
        if (ambilightCommandedOn)
          return

        // 实例还在但我们的开关刚从「关」切到「开」（disable 时它自己记了 enabled=false）：
        // 重新启用一次
        const ambientlight = window.ambientlight as Ambientlight
        ambientlight.settings?.set('enabled', true, true)
        await ambientlight.start()
        syncThemeToAmbilight()
        ambilightCommandedOn = true
        return
      }

      // 上一次尝试还没落地（构造中的实例占着位），scan 下一秒再来
      if (window.ambientlight === false)
        return

      if (await tryInitAmbientlight()) {
        detectReplacedPlayerElems()
        // 构造完成不等于开始显示：它自己的 start 会因「enabled 尚未同步为 true」等原因
        // 静默跳过（构造读设置早于我们把 enabled 写回 true），这里显式补一次 start
        const ambientlight = window.ambientlight as Ambientlight
        ambientlight.settings?.set('enabled', true, true)
        await ambientlight.start()
        ambilightCommandedOn = true
        syncThemeToAmbilight()
      }
    }
    catch (ex) {
      console.warn('[BewlyBewly] Failed to start ambilight:', ex)
      // 起失败了：复位意图标记，让下一次 scan 再试
      ambilightCommandedOn = false
    }
  })()

  enableInFlight = inFlight
  inFlight.finally(() => {
    if (enableInFlight === inFlight)
      enableInFlight = null
  })
  return enableInFlight
}

/**
 * 开关关上：用它们自己的 disable（内部记 enabled=false、撤光层、还原页面），再把设置按钮从
 * 播放器里摘掉——它们自己的设计是留着按钮方便再开，但我们的开关在外观设置里，按钮留在控制栏
 * 只会让人以为功能坏了。重开时 `attachToPlayer` 会把保留的引用原样挂回去。
 */
async function disableAmbientlight() {
  ambilightCommandedOn = false
  try {
    if (isAmbientlightRunning()) {
      const ambientlight = window.ambientlight as Ambientlight
      await ambientlight.disable()
      ambientlight.settings?.menuBtn?.remove()
      ambientlight.settings?.menuElem?.remove()
      ambientlight.settings?.bezelElem?.remove()
    }
  }
  catch (ex) {
    console.warn('[BewlyBewly] Failed to stop ambilight:', ex)
  }
}

/**
 * 起这一套。页面门在调用点（`contentScripts/index.ts`，排除抽屉的 iframe）；播放器可能比这晚
 * 很多才出现，所以每秒对一次——但引擎的操作是边沿触发的（见 `ambilightCommandedOn`），状态
 * 没变化时什么都不做。
 */
export function setupAmbilight() {
  // 任何引擎构造之前：面板语言与配置文案先就位（菜单按构造时的配置文案生成）
  setAmbilightPanelLanguage(resolvePanelLanguage(settings.value.language))
  applyAmbilightPanelLanguageToConfig(SettingsConfig)

  const scan = () => {
    if (settings.value.videoPageAmbilight) {
      if (!ambilightCommandedOn) {
        enableAmbientlight()
      }
      else {
        // 已接管后的健康检查：引擎自己的 enabled 被拨到 false（比如它家面板/存储的意外写入）
        // 时效果会静默消失——拨回来并重新 start。只在确实失灵时动作，有界。
        const ambientlight = isAmbientlightRunning() ? (window.ambientlight as Ambientlight) : null
        const theirEnabled = (ambientlight?.settings as { enabled?: boolean } | undefined)?.enabled
        if (ambientlight && theirEnabled === false) {
          ambientlight.settings?.set('enabled', true, true)
          ambientlight.start()
        }
      }
    }
    else if (ambilightCommandedOn) {
      disableAmbientlight()
    }
  }

  scan()
  const scanTimer = window.setInterval(scan, 1000)

  watch(
    () => settings.value.videoPageAmbilight,
    () => scan(),
  )

  // 深浅色（auto 跟系统）与面板语言变化时同步
  watch([() => settings.value.theme, systemDark], () => syncThemeToAmbilight())

  // 语言变化：重写配置文案并软重初始化引擎（菜单在构造时按配置文案生成，DOM 改写会把
  // 它压扁成纯文本——实测）。重置 `window.ambientlight` 为 undefined 让下一次 scan 走完整构造
  watch(() => settings.value.language, async (newLanguage) => {
    setAmbilightPanelLanguage(resolvePanelLanguage(newLanguage))
    applyAmbilightPanelLanguageToConfig(SettingsConfig)
    const wasOn = ambilightCommandedOn
    await disableAmbientlight()
    window.ambientlight = undefined
    ambilightCommandedOn = false
    if (wasOn)
      await enableAmbientlight()
  })

  return () => {
    window.clearInterval(scanTimer)
    disableAmbientlight()
  }
}
