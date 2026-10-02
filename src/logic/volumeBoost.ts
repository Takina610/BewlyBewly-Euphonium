import { settings } from '~/logic'

/**
 * 视频页的音量增强：播放器的音量控件真的在 0–200% 上调节与显示。
 *
 * 浏览器规定 `video.volume` 只认 0–1，而 B 站播放器的内部状态也只到 1（实测：100% 时继续按 ↑，
 * 它写进来的还是 1），所以「让播放器自己写超量程」走不通。做法是属性包装重新解释它的读写：
 *
 * - **写**：播放器自己只会写 ≤1（拖动条、键盘步进都先夹到 1），这个值按滑块比例理解——
 *   `v × 2`，拖到顶就是 200%；大于 1 的写只可能来自「知道增强在跑」的一方（比如存档恢复出来的
 *   增强值），按真实音量直接收下。
 * - **读**：返回真实音量（0–2）。播放器的存档序列化用的就是它（实测存出来的是 2），下次打开
 *   原样恢复。
 * - 100% 以内的部分照旧写进原生 `video.volume`，超出的部分由 Web Audio 的增益节点补上。
 * - 播放器音量条上的百分比数字由它自己的内部状态渲染（永远 ≤100），所以真实音量一变，就把
 *   `.bpx-player-ctrl-volume-number` 的文本改成真实百分比——滑条几何本来就是按比例的，只有
 *   这个数字要多说一句。
 *
 * 存档语义由主世界的注入脚本兜住（`src/inject/index.js`）：增强开着时（`<html>` 带着
 * `data-bewly-volume-boost`）把播放器写进 `bpx_player_profile` 的真实音量除回比例，于是恢复时
 * 写进来的 ≤1 值刚好翻倍还原。开关切换时的存量换算见 `adoptProfileForBoost` /
 * `settleProfileAfterBoost`（带标记、幂等，多标签页同开同关也不会换算两次）。
 */

/** 播放器里正片那个 <video>；悬浮预览、画中画都挂在别处，不进这个容器。 */
const PLAYER_SELECTOR = '#bilibili-player'
const VIDEO_SELECTOR = `${PLAYER_SELECTOR} video`

/** 滑块量程放大倍数：滑块顶 = 200%。 */
export const VOLUME_BOOST_FACTOR = 2

/** 滑块值 → 真实音量。 */
export function sliderToRealVolume(slider: number): number {
  return Math.min(Math.max(slider, 0), 1) * VOLUME_BOOST_FACTOR
}

/** 真实音量 → 原生 `video.volume` 能表示的那部分。 */
export function realToNativeVolume(real: number): number {
  return Math.min(real, 1)
}

/** 真实音量 → 增益节点要补上的倍数；没接音频图时它必须是 1。 */
export function realToGain(real: number): number {
  return Math.max(real, 1)
}

/** B 站播放器存音量的地方。`nonzeroVol` 是静音前那一档，跟 volume 一起换算。 */
const PROFILE_KEY = 'bpx_player_profile'
/** 标记 profile 里的音量存的是哪种含义；缺了按真实音量理解（旧存档、没开过增强都成立）。 */
const SCALE_KEY = 'bewlyVolumeScale'
type VolumeScale = 'slider' | 'real'

interface StoredVolumes {
  volume: number | null
  nonzeroVol: number | null
  scale: VolumeScale
}

function readStoredVolumes(): StoredVolumes {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}') as {
      media?: { volume?: unknown, nonzeroVol?: unknown, bewlyVolumeScale?: unknown }
    }
    const media = profile?.media ?? {}
    const read = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) ? value : null
    return {
      volume: read(media.volume),
      nonzeroVol: read(media.nonzeroVol),
      scale: media.bewlyVolumeScale === 'slider' ? 'slider' : 'real',
    }
  }
  catch {
    return { volume: null, nonzeroVol: null, scale: 'real' }
  }
}

function writeStoredVolumes(volumes: StoredVolumes) {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    const profile = (raw ? JSON.parse(raw) : {}) as {
      media?: Record<string, unknown>
    }
    if (!profile.media)
      profile.media = {}
    if (volumes.volume !== null)
      profile.media.volume = volumes.volume
    if (volumes.nonzeroVol !== null)
      profile.media.nonzeroVol = volumes.nonzeroVol
    profile.media[SCALE_KEY] = volumes.scale
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  }
  catch {
    // profile 读不了/写不进去就算了：最坏情况是下次打开时音量回到 100% 封顶
  }
}

/**
 * 增强被打开：profile 里的值还是真实含义，换成滑块含义（除回去会翻倍）。已有标记就说明换过了，
 * 别再动——几个标签页同时收到开关变化，这里必须是个空操作。
 */
export function adoptProfileForBoost() {
  const stored = readStoredVolumes()
  if (stored.scale === 'slider')
    return

  const halve = (value: number) => value / VOLUME_BOOST_FACTOR
  writeStoredVolumes({
    volume: stored.volume === null ? 1 / VOLUME_BOOST_FACTOR : halve(stored.volume),
    nonzeroVol: stored.nonzeroVol === null ? null : halve(stored.nonzeroVol),
    scale: 'slider',
  })
}

/** 增强被关掉：存值从滑块含义换回真实含义（乘回来、夹进原生区间）。同样只换一次。 */
export function settleProfileAfterBoost() {
  const stored = readStoredVolumes()
  if (stored.scale === 'real')
    return

  writeStoredVolumes({
    volume: stored.volume === null ? null : realToNativeVolume(sliderToRealVolume(stored.volume)),
    nonzeroVol: stored.nonzeroVol === null ? null : realToNativeVolume(sliderToRealVolume(stored.nonzeroVol)),
    scale: 'real',
  })
}

const nativeVolumeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume')!

function nativeVolume(video: HTMLMediaElement): number {
  return nativeVolumeDescriptor.get!.call(video) as number
}

function setNativeVolume(video: HTMLMediaElement, value: number) {
  nativeVolumeDescriptor.set!.call(video, value)
}

/** 播放器音量条上的百分比数字（它自己的内部状态渲染的，永远 ≤100，由我们改写成真实值）。 */
const VOLUME_NUMBER_SELECTOR = '.bpx-player-ctrl-volume .bpx-player-ctrl-volume-number'
/** 主世界存档拦截的开关（见 `src/inject/index.js`）。 */
const BOOST_FLAG_ATTRIBUTE = 'data-bewly-volume-boost'

/**
 * 起这一套。页面门在调用点（`contentScripts/index.ts`），模块自己不做 URL 判断——与
 * `playbackSpeed` 同一套做法，这样它能在 jsdom 里直接驱动。
 */
export function setupVolumeBoost() {
  let video: HTMLVideoElement | null = null
  /** 当前真实音量（0–2）。包装的读永远返回它，播放器的存档才能带上增强值。 */
  let realVolume = 0
  /** 浏览器要一次用户手势才肯让 AudioContext 出声；没等到手势前先不把音频接进图里。 */
  let hasUserGesture = false

  // #region 音频图
  let audioContext: AudioContext | null = null
  let gainNode: GainNode | null = null
  /** 接过源的那个元素；`createMediaElementSource` 对同一个元素只能调一次。 */
  let sourcedVideo: HTMLVideoElement | null = null

  function resumeAudio() {
    if (audioContext?.state === 'suspended')
      audioContext.resume().catch(() => {})
  }

  /**
   * 音频图能晚接就晚接：接上之后这个元素的音频就永远走 Web Audio 了，而 AudioContext 要等
   * 一次用户手势才肯出声。第一次需要放大（真实音量 > 100%）时才接。
   */
  function ensureAudioGraph() {
    if (!video)
      return
    if (gainNode && sourcedVideo === video)
      return

    try {
      audioContext = audioContext ?? new AudioContext()
      gainNode = gainNode ?? audioContext.createGain()
      if (sourcedVideo !== video) {
        const source = audioContext.createMediaElementSource(video)
        source.connect(gainNode)
        gainNode.connect(audioContext.destination)
        sourcedVideo = video
      }
    }
    catch {
      // 接不上（重复接、媒体流受限）就留在增益 1 的世界里，音量回到 100% 封顶
      gainNode = null
      sourcedVideo = null
    }
  }

  function handleUserGesture() {
    hasUserGesture = true
    resumeAudio()
    // 手势之前一直欠着的音频图（比如进场就恢复了 150%），现在可以接上了
    applyVolume()
  }
  // #endregion

  /** 按当前真实音量落声：原生属性拿 ≤ 100% 的部分，超出的找增益节点；数字气泡跟着改写。 */
  function applyVolume() {
    if (!video)
      return

    const native = realToNativeVolume(realVolume)
    if (nativeVolume(video) !== native)
      setNativeVolume(video, native)

    if (realVolume > 1 && hasUserGesture) {
      ensureAudioGraph()
      resumeAudio()
    }
    if (gainNode && sourcedVideo === video)
      gainNode.gain.value = realToGain(realVolume)

    syncVolumeNumber()
  }

  /** 播放器把数字气泡画成它内部状态的那个 ≤100 值，真实音量一变就改写成真实的。 */
  function syncVolumeNumber() {
    const text = String(Math.round(realVolume * 100))
    const number = document.querySelector<HTMLElement>(VOLUME_NUMBER_SELECTOR)
    if (number && number.textContent !== text)
      number.textContent = text
  }

  function installWrapper(target: HTMLVideoElement) {
    Object.defineProperty(target, 'volume', {
      configurable: true,
      get() {
        return realVolume
      },
      set(value: unknown) {
        const volume = Number(value)
        // 跟浏览器自己的规矩一致：认不出的值不动（原生那边会抛错，这里选择忽略）
        if (!Number.isFinite(volume))
          return

        // ≤1 是播放器自己写的（拖动条、键盘步进都先夹到 1）：按滑块比例翻成真实音量；
        // >1 只可能来自知道增强在跑的一方（存档恢复），按真实音量收下
        realVolume = volume <= 1
          ? sliderToRealVolume(volume)
          : Math.min(Math.max(volume, 0), 2)
        applyVolume()
      },
    })
  }

  /** 摘掉包装，把真实音量（≤ 100%）交还给原生属性。 */
  function uninstallWrapper(target: HTMLVideoElement) {
    const native = realToNativeVolume(realVolume)
    delete (target as unknown as Record<string, unknown>).volume

    if (nativeVolume(target) !== native)
      setNativeVolume(target, native)
    else
      target.dispatchEvent(new Event('volumechange'))

    if (gainNode)
      gainNode.gain.value = 1
    document.documentElement.removeAttribute(BOOST_FLAG_ATTRIBUTE)
  }

  function hook(target: HTMLVideoElement) {
    if (Object.getOwnPropertyDescriptor(target, 'volume'))
      return

    video = target
    const stored = readStoredVolumes()
    const native = nativeVolume(target)
    // 播放器抢在我们前面把存档恢复进了原生属性：存档是滑块含义时，那个值要翻回真实音量，
    // 否则恢复出来的音量只剩一半。带标记的存档里 volume 恰为 1 只可能来自一次真实的 200%
    // 保存（没人动过的存档没有标记），所以不做例外
    const restoredFromSliderScale = stored.scale === 'slider'
      && stored.volume !== null && native === stored.volume
    realVolume = restoredFromSliderScale
      ? sliderToRealVolume(native)
      : native
    installWrapper(target)
    // 主世界存档拦截靠这面旗子认「增强开着」；要在下一次存档发生前立起来
    document.documentElement.setAttribute(BOOST_FLAG_ATTRIBUTE, '')
    applyVolume()
  }

  function unhook() {
    if (!video)
      return

    if (Object.getOwnPropertyDescriptor(video, 'volume'))
      uninstallWrapper(video)
    video = null
  }

  function currentVideo(): HTMLVideoElement | null {
    return document.querySelector<HTMLVideoElement>(VIDEO_SELECTOR)
      ?? document.querySelector<HTMLVideoElement>(PLAYER_SELECTOR)?.querySelector('video')
      ?? null
  }

  function scan() {
    if (!settings.value.videoPageVolumeBoost) {
      // 存档还记着滑块含义就换回来：换算是幂等的，每秒问一次也只真的换一次
      settleProfileAfterBoost()
      unhook()
      return
    }

    // 反过来，开着的时候存档必须是滑块含义（存档被别的工具动过也能自愈）
    adoptProfileForBoost()

    const found = currentVideo()
    if (!found)
      return

    if (found !== video) {
      // 换视频（换元素）不动存档：存着的滑块值对新视频照样成立
      unhook()
      hook(found)
    }
  }

  const scanTimer = window.setInterval(scan, 1000)
  scan()

  // AudioContext 的自动播放策略：任何一次用户手势都能把它唤醒
  window.addEventListener('pointerdown', handleUserGesture, true)
  window.addEventListener('keydown', handleUserGesture, true)

  // 开关当场生效：打开时先把存档换成滑块含义、再接管页面上的播放器（没有就算了，等 scan）；
  // 关了就还原、把存档换回真实含义——哪怕这个页面上从来没有播放器
  watch(
    () => settings.value.videoPageVolumeBoost,
    (enabled) => {
      if (enabled) {
        scan()
      }
      else {
        settleProfileAfterBoost()
        unhook()
      }
    },
  )

  return () => {
    window.clearInterval(scanTimer)
    window.removeEventListener('pointerdown', handleUserGesture, true)
    window.removeEventListener('keydown', handleUserGesture, true)
    unhook()
    settleProfileAfterBoost()
    if (gainNode)
      gainNode.gain.value = 1
  }
}
