import { runInThisContext } from 'node:vm'

import { afterEach, expect, it, vi } from 'vitest'

import injectSource from '~/inject/index.js?raw'
import { LIVE_QUALITY_ATTR } from '~/logic/liveRoom'

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
 * The live room asks for its stream itself, and the first ask carries `qn=0` — "pick one for me",
 * which lands on 蓝光 rather than 原画. The only place that can be changed is the main-world inject
 * script, so this evaluates its source and reads the URL the page's request got opened with.
 *
 * Only `qn=0` is rewritten: once the user has picked a quality the page sends that quality, and that
 * is a choice to respect rather than correct.
 */
const PLAY_URL = 'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=22637261&protocol=0,1&format=0,1,2&codec=0,1,2&qn=0&platform=web&ptype=8'

class FakeXMLHttpRequest {
  openedUrl = ''

  open(_method: string, url: string) {
    this.openedUrl = url
  }
}

function setFlag(value: boolean) {
  document.documentElement.setAttribute(LIVE_QUALITY_ATTR, String(value))
}

function openWith(url: string): string {
  const xhr = new FakeXMLHttpRequest()
  xhr.open('GET', url)
  return xhr.openedUrl
}

afterEach(() => {
  document.documentElement.removeAttribute(LIVE_QUALITY_ATTR)
})

// jsdom has no Clipboard API, and the script's URL cleaner patches it on the way in
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async () => {} },
})

;(globalThis as any).XMLHttpRequest = FakeXMLHttpRequest
runInThisContext(`;(() => {
${injectSource}
})()`)

it('asks for original quality when the room is entered with the auto pick', () => {
  setFlag(true)

  const url = new URL(openWith(PLAY_URL))

  expect(url.searchParams.get('qn')).toBe('10000')
  // 其余参数一个都不能动
  expect(url.searchParams.get('room_id')).toBe('22637261')
  expect(url.searchParams.get('codec')).toBe('0,1,2')
})

it('leaves a quality the user picked alone', () => {
  setFlag(true)

  const url = new URL(openWith(PLAY_URL.replace('qn=0', 'qn=150')))

  expect(url.searchParams.get('qn')).toBe('150')
})

it('does nothing while the switch is off', () => {
  setFlag(false)

  expect(new URL(openWith(PLAY_URL)).searchParams.get('qn')).toBe('0')
})

it('does not touch requests that are not the live stream', () => {
  setFlag(true)

  const url = openWith('https://api.bilibili.com/x/web-interface/view?bvid=BV1TceU6iEoH&qn=0')

  expect(url).toBe('https://api.bilibili.com/x/web-interface/view?bvid=BV1TceU6iEoH&qn=0')
})
