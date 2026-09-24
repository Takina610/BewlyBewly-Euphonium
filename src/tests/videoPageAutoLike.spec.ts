import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { settings } from '~/logic'
import {
  AUTO_LIKE_ATTR,
  currentBvid,
  LIKE_BUTTON_SELECTOR,
  likeButtonState,
  parseAutoLikeState,
  setupVideoPageAutoLike,
} from '~/logic/videoPageAutoLike'

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
 * Auto-like clicks the video page's own like button, so the two mistakes that matter are clicking a
 * video that is already liked (that unlikes it) and clicking while the page has not resolved the
 * like state yet (bilibili only opens a login dialog then, and nothing is liked).
 *
 * The like state is published on `<html>` by the inject script, which watches the page's own
 * `/x/web-interface/archive/relation` request — the page only makes that request when it has a login.
 * So "no state" is the case where nothing may be clicked, and these tests drive exactly that.
 *
 * The timers are left on the fake clock for the whole file, because swapping back in `afterEach`
 * would leave the module's interval running against a stopped clock.
 */

const VIDEO_URL = '/video/BV1TceU6iEoH/'

let dispose: (() => void) | undefined
let clicks = 0

function publishState(state: { bvid: string, like: boolean } | string) {
  document.documentElement.setAttribute(AUTO_LIKE_ATTR, typeof state === 'string' ? state : JSON.stringify(state))
}

function mountLikeButton(options: { liked?: boolean, disabled?: boolean } = {}) {
  document.body.innerHTML = `
    <div class="video-toolbar-left">
      <div class="video-toolbar-left-main">
        <div class="video-like video-toolbar-left-item${options.liked ? ' on' : ''}${options.disabled ? ' disable' : ''}"></div>
      </div>
    </div>
  `

  document.querySelector<HTMLElement>(LIKE_BUTTON_SELECTOR)!
    .addEventListener('click', () => clicks++)
}

beforeEach(() => {
  vi.useFakeTimers()
  clicks = 0
  settings.value.videoPageAutoLike = true
  window.history.pushState({}, '', VIDEO_URL)
  mountLikeButton()
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.innerHTML = ''
  document.documentElement.removeAttribute(AUTO_LIKE_ATTR)
  window.history.pushState({}, '', '/')
})

it('reads the video number, the published state and the button state', () => {
  expect(currentBvid('https://www.bilibili.com/video/BV1TceU6iEoH/?spm_id_from=333.788')).toBe('BV1TceU6iEoH')
  expect(currentBvid('https://www.bilibili.com/')).toBe('')

  expect(parseAutoLikeState('{"bvid":"BV1TceU6iEoH","like":true}')).toEqual({ bvid: 'BV1TceU6iEoH', like: true })
  expect(parseAutoLikeState('{"bvid":"BV1TceU6iEoH","like":false}')).toEqual({ bvid: 'BV1TceU6iEoH', like: false })
  // 读不懂的一律当「还不知道」，不能猜
  expect(parseAutoLikeState(null)).toBeNull()
  expect(parseAutoLikeState('')).toBeNull()
  expect(parseAutoLikeState('not json')).toBeNull()
  expect(parseAutoLikeState('{"bvid":"BV1"}')).toBeNull()
  expect(parseAutoLikeState('{"like":true}')).toBeNull()

  expect(likeButtonState(null)).toBe('missing')
  const button = document.createElement('div')
  expect(likeButtonState(button)).toBe('ready')
  button.classList.add('on')
  expect(likeButtonState(button)).toBe('liked')
  button.classList.remove('on')
  button.classList.add('disable')
  expect(likeButtonState(button)).toBe('disabled')
})

it('does not touch anything until the page has published its own like state', () => {
  dispose = setupVideoPageAutoLike()

  vi.advanceTimersByTime(10000)
  expect(clicks).toBe(0)

  // 状态一到（说没赞过），就点一下
  publishState({ bvid: 'BV1TceU6iEoH', like: false })
  vi.advanceTimersByTime(1000)
  expect(clicks).toBe(1)
})

it('leaves a video the page says is already liked alone, for good', () => {
  publishState({ bvid: 'BV1TceU6iEoH', like: true })
  dispose = setupVideoPageAutoLike()

  vi.advanceTimersByTime(10000)
  expect(clicks).toBe(0)
})

it('ignores a state that belongs to another video', () => {
  publishState({ bvid: 'BV1SOMEONEELSE', like: false })
  dispose = setupVideoPageAutoLike()

  vi.advanceTimersByTime(10000)
  expect(clicks).toBe(0)
})

it('never clicks twice for the same video', () => {
  publishState({ bvid: 'BV1TceU6iEoH', like: false })
  dispose = setupVideoPageAutoLike()

  vi.advanceTimersByTime(1000)
  expect(clicks).toBe(1)

  // 用户自己把赞取消掉：状态那一份已经不新了，但一个视频也只点一次
  document.querySelector(LIKE_BUTTON_SELECTOR)!.classList.remove('on')
  vi.advanceTimersByTime(10000)
  expect(clicks).toBe(1)
})

it('waits for a toolbar that has not rendered yet, and for one that is not clickable', () => {
  document.body.innerHTML = ''
  publishState({ bvid: 'BV1TceU6iEoH', like: false })
  dispose = setupVideoPageAutoLike()

  vi.advanceTimersByTime(3000)
  expect(clicks).toBe(0)

  mountLikeButton({ disabled: true })
  vi.advanceTimersByTime(3000)
  expect(clicks).toBe(0)

  document.querySelector(LIKE_BUTTON_SELECTOR)!.classList.remove('disable')
  vi.advanceTimersByTime(1000)
  expect(clicks).toBe(1)
})

it('leaves a button the page itself shows as liked alone', () => {
  mountLikeButton({ liked: true })
  publishState({ bvid: 'BV1TceU6iEoH', like: false })
  dispose = setupVideoPageAutoLike()

  vi.advanceTimersByTime(10000)
  expect(clicks).toBe(0)
})

it('does nothing while the switch is off, and picks it up when it is turned on', () => {
  settings.value.videoPageAutoLike = false
  publishState({ bvid: 'BV1TceU6iEoH', like: false })
  dispose = setupVideoPageAutoLike()

  vi.advanceTimersByTime(3000)
  expect(clicks).toBe(0)

  settings.value.videoPageAutoLike = true
  vi.advanceTimersByTime(1000)
  expect(clicks).toBe(1)
})

it('handles a second video after the first, on the same page', () => {
  publishState({ bvid: 'BV1TceU6iEoH', like: false })
  dispose = setupVideoPageAutoLike()
  vi.advanceTimersByTime(1000)
  expect(clicks).toBe(1)

  // SPA 换到下一个视频
  window.history.pushState({}, '', '/video/BV1NEXTVIDEO/')
  vi.advanceTimersByTime(3000)
  expect(clicks).toBe(1)

  publishState({ bvid: 'BV1NEXTVIDEO', like: false })
  vi.advanceTimersByTime(1000)
  expect(clicks).toBe(2)
})
