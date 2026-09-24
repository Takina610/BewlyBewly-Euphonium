import { beforeEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import {
  cleanupPlaybackRateInput,
  cleanupPlaybackRateListInput,
  formatPlaybackRate,
  hasPlaybackRateSign,
  parsePlaybackRate,
  parsePlaybackRateList,
  sanitizePlaybackRateInput,
  sanitizePlaybackRateListInput,
  setupPlaybackSpeed,
} from '~/logic/playbackSpeed'
import { lastPlaybackRate, settings } from '~/logic/storage'

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
 * The speed settings are written against the player's real markup: the button's list is
 * `.bpx-player-ctrl-playbackrate-menu` with one `li` per speed, and the video lives in
 * `#bilibili-player`. What is checked here is that the three settings land where the user expects —
 * the default on load, the long-press speed while the key is held, and the custom list in the menu —
 * and that turning a setting back off leaves the player's own behaviour alone.
 *
 * The module keeps one interval and a rAF loop for the life of the page, so it is started once for the
 * file; starting it per test would stack loops that then act on the next test's DOM.
 */
let started = false

function ensureStarted() {
  if (started)
    return
  started = true
  setupPlaybackSpeed()
}

/** The player's own speed menu, as bilibili renders it. */
const NATIVE_RATES = [2, 1.5, 1.25, 1, 0.75, 0.5]

function mountPlayer(rates: number[] = NATIVE_RATES) {
  document.body.innerHTML = `
    <div id="bilibili-player">
      <video></video>
      <div class="bpx-player-ctrl-btn bpx-player-ctrl-playbackrate">
        <ul class="bpx-player-ctrl-playbackrate-menu">
          ${rates.map(rate => `<li class="bpx-player-ctrl-playbackrate-menu-item" data-value="${rate}">${rate}x</li>`).join('')}
        </ul>
      </div>
    </div>
  `
  return {
    video: document.querySelector('video') as HTMLVideoElement,
    menu: document.querySelector('.bpx-player-ctrl-playbackrate-menu') as HTMLElement,
  }
}

function menuItems(menu: HTMLElement) {
  return Array.from(menu.querySelectorAll<HTMLElement>('.bpx-player-ctrl-playbackrate-menu-item'))
}

/** The speeds the menu actually offers: hidden entries are what the custom list took away. */
function shownRates(menu: HTMLElement) {
  return menuItems(menu)
    .filter(item => !item.hasAttribute('data-bewly-rate-hidden'))
    .map(item => Number(item.getAttribute('data-value')))
}

function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

function release(key: string) {
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
}

beforeEach(() => {
  vi.useFakeTimers()
  settings.value.videoPageDefaultPlaybackRate = ''
  settings.value.videoPageLongPressPlaybackRate = ''
  settings.value.videoPagePlaybackRateList = ''
  settings.value.videoPageDisableLongPressSpeedUp = false
  settings.value.videoPageRememberPlaybackRate = false
  lastPlaybackRate.value = 0
  document.body.innerHTML = ''
})

it('reads a speed, and refuses to guess at one', () => {
  expect(parsePlaybackRate('1.5')).toBe(1.5)
  expect(parsePlaybackRate(' 2x ')).toBe(2)
  expect(parsePlaybackRate('0.75')).toBe(0.75)

  // 空着表示「不动播放器」；乱写的东西同样按没写处理，别把它当成 1x
  expect(parsePlaybackRate('')).toBeNull()
  expect(parsePlaybackRate('   ')).toBeNull()
  expect(parsePlaybackRate('abc')).toBeNull()
  expect(parsePlaybackRate('0')).toBeNull()
  expect(parsePlaybackRate('-2')).toBeNull()

  // 浏览器自己认不了超出区间的速度，写下去会抛错
  expect(parsePlaybackRate('100')).toBe(16)
  expect(parsePlaybackRate('0.001')).toBe(0.0625)
})

it('reads a speed list, dropping what it cannot use', () => {
  expect(parsePlaybackRateList('2 1.5 1')).toEqual([2, 1.5, 1])
  expect(parsePlaybackRateList('1 1.0 1.00')).toEqual([1])
  expect(parsePlaybackRateList('abc 2 x1')).toEqual([2])
  expect(parsePlaybackRateList('')).toEqual([])
  expect(parsePlaybackRateList('1 2 3 4 5 6 7 8 9 10 11 12 13')).toHaveLength(12)
})

it('writes a speed the way the player does', () => {
  expect(formatPlaybackRate(1)).toBe('1.0x')
  expect(formatPlaybackRate(1.5)).toBe('1.5x')
  expect(formatPlaybackRate(1.25)).toBe('1.25x')
  expect(formatPlaybackRate(0.75)).toBe('0.75x')
})

it('keeps a speed box to digits', () => {
  expect(sanitizePlaybackRateInput('1.5')).toBe('1.5')
  expect(sanitizePlaybackRateInput('1.5x')).toBe('1.5')
  expect(sanitizePlaybackRateInput('abc')).toBe('')
  // 粘贴进来好几段时只取第一段，别把「1.5 2」拼成 1.52
  expect(sanitizePlaybackRateInput('1.5 2')).toBe('1.5')
  // 多出来的小数点认不出，交给 parsePlaybackRate 按「没写」处理
  expect(parsePlaybackRate(sanitizePlaybackRateInput('1..5'))).toBeNull()
})

it('turns down a speed that is a sign away from usable', () => {
  expect(hasPlaybackRateSign('-2')).toBe(true)
  expect(hasPlaybackRateSign('1.5')).toBe(false)
})

it('settles a speed box on a value that will really be used', () => {
  // 0 与乱写的认不出：清空，而不是拿它当 1x
  expect(cleanupPlaybackRateInput('0')).toBe('')
  expect(cleanupPlaybackRateInput('0.')).toBe('')
  expect(cleanupPlaybackRateInput('1..5')).toBe('')
  // 超出浏览器区间：写成真正会生效的那个数，别让框里留着一个用不上的值
  expect(cleanupPlaybackRateInput('100')).toBe('16')
  expect(cleanupPlaybackRateInput('0.001')).toBe('0.0625')
  // 认得出的原样留下（写法上不做多余改写）
  expect(cleanupPlaybackRateInput('1.5')).toBe('1.5')
  expect(cleanupPlaybackRateInput('0.75')).toBe('0.75')
})

it('settles the list box the same way', () => {
  expect(cleanupPlaybackRateListInput('2 1.5 1')).toBe('2 1.5 1')
  // 0、乱写的段、重复的都收走
  expect(cleanupPlaybackRateListInput('2 0 1.5x 2')).toBe('2 1.5')
  expect(cleanupPlaybackRateListInput('abc')).toBe('')
  expect(cleanupPlaybackRateListInput('1 2 3 4 5 6 7 8 9 10 11 12 13')).toBe('1 2 3 4 5 6 7 8 9 10 11 12')
})

it('lets the list box keep its spaces', () => {
  expect(sanitizePlaybackRateListInput('2 1.5 1')).toBe('2 1.5 1')
  // 打完一个数要能接着打空格，所以尾空格留着；连着敲的空格并成一个
  expect(sanitizePlaybackRateListInput('2  1.5 ')).toBe('2 1.5 ')
  expect(sanitizePlaybackRateListInput('2, 1.5')).toBe('2 1.5')
  expect(sanitizePlaybackRateListInput('2\t1.5')).toBe('2 1.5')
  expect(sanitizePlaybackRateListInput('abc')).toBe('')
  expect(parsePlaybackRateList(sanitizePlaybackRateListInput('1.5x 2 一'))).toEqual([1.5, 2])
})

it('opens a video at the default speed', async () => {
  ensureStarted()
  settings.value.videoPageDefaultPlaybackRate = '1.5'
  const { video } = mountPlayer()

  await vi.advanceTimersByTimeAsync(1000)

  expect(video.playbackRate).toBe(1.5)
})

it('leaves the speed alone when nothing is configured', async () => {
  ensureStarted()
  const { video } = mountPlayer()
  video.playbackRate = 1.25
  video.dispatchEvent(new Event('loadedmetadata'))

  await vi.advanceTimersByTimeAsync(1000)

  expect(video.playbackRate).toBe(1.25)
})

it('puts the custom list in the player\'s own menu', async () => {
  ensureStarted()
  settings.value.videoPagePlaybackRateList = '2 1 1.75'
  const { menu } = mountPlayer()

  await vi.advanceTimersByTimeAsync(1000)

  // 列表里的三档都在，播放器多出来的那几档被收走
  expect(shownRates(menu).sort((a, b) => b - a)).toEqual([2, 1, 1.75].sort((a, b) => b - a))

  // 缺的那一档是我们补的，写法跟播放器自己的一致
  const custom = menuItems(menu).find(item => item.getAttribute('data-value') === '1.75')
  expect(custom?.textContent).toBe('1.75x')
  // 补进来的档位按大小排在原位，菜单还是一列从快到慢
  expect(shownRates(menu)).toEqual([2, 1.75, 1])
})

it('sets the speed when a custom entry is picked', async () => {
  ensureStarted()
  settings.value.videoPagePlaybackRateList = '3'
  settings.value.videoPageRememberPlaybackRate = true
  const { video, menu } = mountPlayer()

  await vi.advanceTimersByTimeAsync(1000)
  menuItems(menu)[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))

  expect(video.playbackRate).toBe(3)
  expect(lastPlaybackRate.value).toBe(3)
  expect(menuItems(menu).find(item => item.getAttribute('data-value') === '3')?.className).toContain('bpx-state-active')
})

it('gives the player its own list back when the custom list is cleared', async () => {
  ensureStarted()
  settings.value.videoPagePlaybackRateList = '2 1'
  const { menu } = mountPlayer()

  await vi.advanceTimersByTimeAsync(1000)
  expect(shownRates(menu)).toEqual([2, 1])

  settings.value.videoPagePlaybackRateList = ''
  await nextTick()
  await vi.advanceTimersByTimeAsync(1000)

  expect(shownRates(menu)).toEqual(NATIVE_RATES)
  expect(menuItems(menu).every(item => !item.hasAttribute('data-bewly-rate-item'))).toBe(true)
})

it('holds the configured speed while the right arrow key is down', async () => {
  ensureStarted()
  settings.value.videoPageLongPressPlaybackRate = '0.75'
  const { video } = mountPlayer()

  await vi.advanceTimersByTimeAsync(1000)
  video.playbackRate = 1

  press('ArrowRight')
  // B 站自己的长按是 3x，这里要能盖回去
  video.playbackRate = 3
  await vi.advanceTimersByTimeAsync(300)
  expect(video.playbackRate).toBe(0.75)

  release('ArrowRight')
  expect(video.playbackRate).toBe(1)
})

it('leaves a tapped key alone', async () => {
  ensureStarted()
  settings.value.videoPageLongPressPlaybackRate = '0.75'
  const { video } = mountPlayer()

  await vi.advanceTimersByTimeAsync(1000)
  video.playbackRate = 1

  // 点一下右方向键是快进 5 秒，不是长按：这一下不该把速度拨到 0.75
  press('ArrowRight')
  await vi.advanceTimersByTimeAsync(100)
  expect(video.playbackRate).toBe(1)
  release('ArrowRight')
  expect(video.playbackRate).toBe(1)

  // 松手之后判定时间也过去了，不能事后才把那一档按上去
  await vi.advanceTimersByTimeAsync(1000)
  expect(video.playbackRate).toBe(1)
})

it('leaves the speed alone when the arrow key comes from a field in a shadow root', async () => {
  ensureStarted()
  settings.value.videoPageLongPressPlaybackRate = '0.75'
  const { video } = mountPlayer()

  await vi.advanceTimersByTimeAsync(1000)

  // 设置界面挂在 shadow root 里：事件走到 window 这一层，target 只是宿主元素，真实目标要看 composedPath
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = '<input type="text">'
  const field = root.querySelector('input') as HTMLInputElement

  field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }))
  await vi.advanceTimersByTimeAsync(400)

  expect(video.playbackRate).toBe(1)
})

it('comes back to the speed the user picked, not to bilibili\'s 3x', async () => {
  ensureStarted()
  settings.value.videoPageLongPressPlaybackRate = '0.75'
  const { video } = mountPlayer()

  await vi.advanceTimersByTimeAsync(3000)
  // 用户自己挑到 1.25
  video.playbackRate = 1.25
  video.dispatchEvent(new Event('ratechange'))

  press('ArrowRight')
  await vi.advanceTimersByTimeAsync(300)
  expect(video.playbackRate).toBe(0.75)

  // B 站自己的长按倍速也是往 playbackRate 上写 3x，松手后不能以它为准
  video.playbackRate = 3
  video.dispatchEvent(new Event('ratechange'))
  await vi.advanceTimersByTimeAsync(100)
  release('ArrowRight')
  expect(video.playbackRate).toBe(1.25)
})

it('does not remember bilibili\'s own long-press speed', async () => {
  ensureStarted()
  settings.value.videoPageLongPressPlaybackRate = '0.75'
  settings.value.videoPageRememberPlaybackRate = true
  const { video } = mountPlayer()

  await vi.advanceTimersByTimeAsync(3000)
  video.playbackRate = 1.25
  video.dispatchEvent(new Event('ratechange'))
  expect(lastPlaybackRate.value).toBe(1.25)

  // 长按期间播放器写的 3x 不是用户挑的偏好，别记下来当下一支视频的进场速度
  press('ArrowRight')
  video.playbackRate = 3
  video.dispatchEvent(new Event('ratechange'))
  await vi.advanceTimersByTimeAsync(300)
  release('ArrowRight')

  expect(lastPlaybackRate.value).toBe(1.25)
})

it('does not remember the speed-up bilibili writes while the key is held', async () => {
  ensureStarted()
  settings.value.videoPageRememberPlaybackRate = true
  const { video } = mountPlayer()

  await vi.advanceTimersByTimeAsync(3000)
  video.playbackRate = 1.5
  video.dispatchEvent(new Event('ratechange'))
  expect(lastPlaybackRate.value).toBe(1.5)

  // 没配长按速度：按住 Right 就是 B 站自己的长按快进，写进来的 3x 不该变成下一支视频的速度
  press('ArrowRight')
  await vi.advanceTimersByTimeAsync(500)
  video.playbackRate = 3
  video.dispatchEvent(new Event('ratechange'))
  release('ArrowRight')

  expect(lastPlaybackRate.value).toBe(1.5)
})

it('undoes the long-press speed if the player writes it back after release', async () => {
  ensureStarted()
  settings.value.videoPageLongPressPlaybackRate = '0.75'
  const { video } = mountPlayer()

  await vi.advanceTimersByTimeAsync(3000)
  video.playbackRate = 1.25
  await vi.advanceTimersByTimeAsync(50)

  press('ArrowRight')
  await vi.advanceTimersByTimeAsync(300)
  expect(video.playbackRate).toBe(0.75)

  release('ArrowRight')
  expect(video.playbackRate).toBe(1.25)

  // 播放器记的可能是按住时那一档，松手后当成新速度写回来——那不是用户挑的
  video.playbackRate = 0.75
  await vi.advanceTimersByTimeAsync(50)
  expect(video.playbackRate).toBe(1.25)
})

it('lets go the moment the long-press setting changes', async () => {
  ensureStarted()
  settings.value.videoPageLongPressPlaybackRate = '0.75'
  const { video } = mountPlayer()

  await vi.advanceTimersByTimeAsync(1000)
  press('ArrowRight')
  await vi.advanceTimersByTimeAsync(300)
  expect(video.playbackRate).toBe(0.75)

  // 改回默认（留空）：当场放开，不用等松手
  settings.value.videoPageLongPressPlaybackRate = ''
  await nextTick()
  expect(video.playbackRate).toBe(1)

  release('ArrowRight')
})

it('keeps the normal speed when long-press speed-up is forbidden', async () => {
  ensureStarted()
  settings.value.videoPageDisableLongPressSpeedUp = true
  const { video } = mountPlayer()

  await vi.advanceTimersByTimeAsync(3000)
  video.playbackRate = 1.25
  video.dispatchEvent(new Event('ratechange'))

  press('ArrowRight')
  video.playbackRate = 3
  await vi.advanceTimersByTimeAsync(300)

  expect(video.playbackRate).toBe(1.25)

  release('ArrowRight')
  expect(video.playbackRate).toBe(1.25)
})

it('leaves long-press alone when neither setting is on', async () => {
  ensureStarted()
  const { video } = mountPlayer()

  await vi.advanceTimersByTimeAsync(1000)
  video.playbackRate = 1

  press('ArrowRight')
  video.playbackRate = 3
  await vi.advanceTimersByTimeAsync(100)

  expect(video.playbackRate).toBe(3)
  release('ArrowRight')
})

it('remembers the speed the user picks, and opens the next video at it', async () => {
  ensureStarted()
  settings.value.videoPageRememberPlaybackRate = true
  const { video, menu } = mountPlayer()

  // 播放器刚把视频安顿好的那一小段里写进来的速度不算用户挑的，所以等到它安静下来
  await vi.advanceTimersByTimeAsync(3000)
  // 用户从播放器自己的菜单里挑了一档
  video.playbackRate = 1.25
  video.dispatchEvent(new Event('ratechange'))
  expect(lastPlaybackRate.value).toBe(1.25)

  // 下一个视频（换个 <video> 元素）开场就用这个速度
  document.body.innerHTML = '<div id="bilibili-player"><video></video></div>'
  const next = document.querySelector('video') as HTMLVideoElement
  await vi.advanceTimersByTimeAsync(1000)

  expect(next.playbackRate).toBe(1.25)
  expect(menu.isConnected).toBe(false)
})

it('does not remember what the player writes while it is settling', async () => {
  ensureStarted()
  settings.value.videoPageRememberPlaybackRate = true
  const { video } = mountPlayer()

  await vi.advanceTimersByTimeAsync(1000)
  // 播放器自己把速度归到 1x，这不是用户挑的
  video.playbackRate = 1
  video.dispatchEvent(new Event('ratechange'))

  expect(lastPlaybackRate.value).toBe(0)
})

it('does not remember the speed when the switch is off', async () => {
  ensureStarted()
  const { video } = mountPlayer()

  await vi.advanceTimersByTimeAsync(3000)
  video.playbackRate = 1.25
  video.dispatchEvent(new Event('ratechange'))

  expect(lastPlaybackRate.value).toBe(0)
})
