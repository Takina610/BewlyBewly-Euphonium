import { beforeEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { settings } from '~/logic/storage'
import {
  realToGain,
  realToNativeVolume,
  setupVolumeBoost,
  sliderToRealVolume,
} from '~/logic/volumeBoost'

vi.mock('webextension-polyfill', () => {
  const browser = {
    runtime: { id: 'test-extension-id' },
    storage: {
      local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
      onChanged: { addListener: () => {} },
    },
  }
  return { default: browser, storage: browser.storage }
})

/**
 * 音量增强把播放器的音量控件重新解释成 0–200%：写 ≤1 的按滑块比例翻倍（播放器自己只会写 ≤1），
 * 写 >1 的按真实音量收下（存档恢复）；读返回真实音量（播放器的存档序列化用的就是它）。真实音量
 * 里 ≤100% 的部分写进原生属性，超出的部分归增益节点（jsdom 没有 AudioContext，那半个特性靠纯
 * 函数与「原生封顶在 1」钉住）。百分比数字气泡由我们改写成真实值。
 */
const nativeVolumeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume')!

function nativeVolume(video: HTMLVideoElement): number {
  return nativeVolumeDescriptor.get!.call(video) as number
}

function writeNativeVolume(video: HTMLVideoElement, value: number) {
  nativeVolumeDescriptor.set!.call(video, value)
}

const PROFILE_KEY = 'bpx_player_profile'

function writeProfile(volume: number | null, scale?: 'slider' | 'real') {
  if (volume === null) {
    localStorage.removeItem(PROFILE_KEY)
    return
  }
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ media: { volume, ...(scale ? { bewlyVolumeScale: scale } : {}) } }))
}

function readProfile(): { volume?: number, nonzeroVol?: number, bewlyVolumeScale?: string } {
  return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}')?.media ?? {}
}

let started = false

function ensureStarted() {
  if (started)
    return
  started = true
  setupVolumeBoost()
}

function mountPlayer() {
  document.body.innerHTML = `
    <div id="bilibili-player">
      <video></video>
      <div class="bpx-player-ctrl-volume">
        <div class="bpx-player-ctrl-volume-number">100</div>
      </div>
    </div>
  `
  return document.querySelector('video') as HTMLVideoElement
}

beforeEach(() => {
  vi.useFakeTimers()
  settings.value.videoPageVolumeBoost = false
  localStorage.clear()
  document.body.innerHTML = ''
})

it('maps the slider onto the boosted range piece by piece', () => {
  // 滑块一半 = 100%，顶 = 200%；100% 以内全靠原生音量，超出部分才要增益
  expect(sliderToRealVolume(0)).toBe(0)
  expect(sliderToRealVolume(0.25)).toBe(0.5)
  expect(sliderToRealVolume(0.5)).toBe(1)
  expect(sliderToRealVolume(1)).toBe(2)

  expect(realToNativeVolume(0.5)).toBe(0.5)
  expect(realToNativeVolume(1)).toBe(1)
  expect(realToNativeVolume(1.5)).toBe(1)

  expect(realToGain(0.5)).toBe(1)
  expect(realToGain(1)).toBe(1)
  expect(realToGain(1.5)).toBe(1.5)
})

it('doubles the player\'s writes and reports the real volume back', async () => {
  ensureStarted()
  const video = mountPlayer()

  settings.value.videoPageVolumeBoost = true
  await vi.advanceTimersByTimeAsync(1000)

  // 播放器把滑块拖到一半：真实 100%，原生正好顶满，读回去也是 1
  video.volume = 0.5
  expect(nativeVolume(video)).toBe(1)
  expect(video.volume).toBe(1)

  // 滑块顶 = 真实 200%
  video.volume = 1
  expect(nativeVolume(video)).toBe(1)
  expect(video.volume).toBe(2)

  // 往回拖到四分之一：真实 50%，原生跟着回去
  video.volume = 0.25
  expect(nativeVolume(video)).toBe(0.5)
  expect(video.volume).toBe(0.5)

  // 数字气泡报的是真实音量，不是播放器内部状态的那个 ≤100 值
  const number = document.querySelector('.bpx-player-ctrl-volume-number') as HTMLElement
  expect(number.textContent).toBe('50')
})

it('takes a boost-aware write as the real volume it claims to be', async () => {
  ensureStarted()
  const video = mountPlayer()

  settings.value.videoPageVolumeBoost = true
  await vi.advanceTimersByTimeAsync(1000)

  // 存档里带着增强值（>1），播放器恢复时原样写出：按真实音量收下
  video.volume = 1.5
  expect(video.volume).toBe(1.5)
  expect(nativeVolume(video)).toBe(1)

  // 数字气泡报 150
  const number = document.querySelector('.bpx-player-ctrl-volume-number') as HTMLElement
  expect(number.textContent).toBe('150')
})

it('keeps the real volume when the boost is switched on mid-session', async () => {
  ensureStarted()
  const video = mountPlayer()
  writeNativeVolume(video, 0.8)

  settings.value.videoPageVolumeBoost = true
  await vi.advanceTimersByTimeAsync(1000)

  // 接管本身一动不动：真实音量原样，读回去也是它
  expect(nativeVolume(video)).toBe(0.8)
  expect(video.volume).toBe(0.8)

  // 之后播放器写的值按新量程解释
  video.volume = 1
  expect(nativeVolume(video)).toBe(1)
  expect(video.volume).toBe(2)
})

it('gives the native property its volume back when the boost is switched off', async () => {
  ensureStarted()
  const video = mountPlayer()

  settings.value.videoPageVolumeBoost = true
  await vi.advanceTimersByTimeAsync(1000)
  video.volume = 0.75
  expect(nativeVolume(video)).toBe(1)

  settings.value.videoPageVolumeBoost = false
  await vi.advanceTimersByTimeAsync(1000)

  // 真实音量（150% 里能表达的那部分）原样还给原生属性
  expect(video.volume).toBe(1)
  video.volume = 0.5
  expect(nativeVolume(video)).toBe(0.5)
})

it('restores the same real volume across sessions once the boost is on', async () => {
  ensureStarted()
  const video = mountPlayer()
  // 上个会话（增强还没开）留下的真实音量 80%
  writeProfile(0.8)

  settings.value.videoPageVolumeBoost = true
  await vi.advanceTimersByTimeAsync(1000)

  // 开关一打开存档就换成滑块含义（0.4）
  expect(readProfile().volume).toBe(0.4)
  expect(readProfile().bewlyVolumeScale).toBe('slider')

  // 下次打开页面：播放器从存档恢复滑块值 0.4，听到的还是 80%
  video.volume = 0.4
  expect(nativeVolume(video)).toBe(0.8)
  expect(readProfile().volume).toBe(0.4)
})

it('recovers the restored slider value when the player wrote it before the takeover', async () => {
  ensureStarted()
  const video = mountPlayer()
  writeProfile(0.5, 'slider')
  // 播放器抢在扫描前面把存档里的滑块值写进了原生属性
  writeNativeVolume(video, 0.5)

  settings.value.videoPageVolumeBoost = true
  await vi.advanceTimersByTimeAsync(1000)

  // 认出这是滑块值：真实音量补回到 100%，而不是从 50% 重新开始
  expect(nativeVolume(video)).toBe(1)
  expect(video.volume).toBe(1)
})

it('restores a left-at-200% session to 200%', async () => {
  ensureStarted()
  const video = mountPlayer()
  // 上个会话把音量留在了 200%：主世界拦截把存档写成了滑块顶（1）
  writeProfile(1, 'slider')
  writeNativeVolume(video, 1)

  settings.value.videoPageVolumeBoost = true
  await vi.advanceTimersByTimeAsync(1000)

  expect(video.volume).toBe(2)
  expect(nativeVolume(video)).toBe(1)
})

it('keeps the profile conversions one-time even when they are asked for twice', async () => {
  writeProfile(0.8)
  expect(readProfile().bewlyVolumeScale).toBeUndefined()

  // 两个标签页先后收到开关变化：换算只能发生一次
  const { adoptProfileForBoost, settleProfileAfterBoost } = await import('~/logic/volumeBoost')
  adoptProfileForBoost()
  adoptProfileForBoost()
  expect(readProfile().volume).toBe(0.4)

  settleProfileAfterBoost()
  settleProfileAfterBoost()
  expect(readProfile().volume).toBe(0.8)
  expect(readProfile().bewlyVolumeScale).toBe('real')
})

it('raises the main-world flag while hooked so saves get halved', async () => {
  ensureStarted()
  mountPlayer()

  settings.value.videoPageVolumeBoost = true
  await vi.advanceTimersByTimeAsync(1000)
  expect(document.documentElement.hasAttribute('data-bewly-volume-boost')).toBe(true)

  settings.value.videoPageVolumeBoost = false
  await vi.advanceTimersByTimeAsync(1000)
  expect(document.documentElement.hasAttribute('data-bewly-volume-boost')).toBe(false)
})

it('follows the video element when the player swaps it', async () => {
  ensureStarted()
  const video = mountPlayer()

  settings.value.videoPageVolumeBoost = true
  await vi.advanceTimersByTimeAsync(1000)
  video.volume = 0.75
  expect(video.volume).toBe(1.5)

  // 换集：新的 <video> 元素，包装要跟过去
  document.body.innerHTML = '<div id="bilibili-player"><video></video></div>'
  const next = document.querySelector('video') as HTMLVideoElement
  await vi.advanceTimersByTimeAsync(1000)

  next.volume = 1
  expect(nativeVolume(next)).toBe(1)
  expect(next.volume).toBe(2)
  await nextTick()
})
