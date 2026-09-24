import { runInThisContext } from 'node:vm'

import { afterEach, expect, it, vi } from 'vitest'

import injectSource from '~/inject/index.js?raw'
import { AUTO_LIKE_ATTR, parseAutoLikeState } from '~/logic/videoPageAutoLike'

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
 * The like state has to come from the page's own `/x/web-interface/archive/relation` request: it is the
 * only place that knows both whether the user is logged in and whether the video is already liked, and
 * the page makes that request only once it has a login. The inject script watches its response and
 * publishes the state on `<html>`; nothing may be published from a response we cannot attribute to a
 * video or that came back with an error.
 *
 * The script is copied verbatim into the extension as a classic script and cannot be imported, so this
 * evaluates its source against a fake XHR and reads the attribute it publishes.
 */
const RELATION_URL = 'https://api.bilibili.com/x/web-interface/archive/relation?aid=80433022&bvid=BV1TceU6iEoH'

class FakeXMLHttpRequest {
  static payload = ''
  static status = 200

  readyState = 1
  status = 200
  response = null as unknown
  url = ''
  private listeners: Record<string, ((this: FakeXMLHttpRequest) => void)[]> = {}

  open(_method: string, url: string) {
    this.url = url
  }

  send() {
    this.readyState = 4
    this.status = FakeXMLHttpRequest.status
    try {
      this.response = JSON.parse(FakeXMLHttpRequest.payload)
    }
    catch {
      this.response = FakeXMLHttpRequest.payload
    }
    for (const listener of this.listeners.load ?? [])
      listener.call(this)
  }

  addEventListener(type: string, listener: (this: FakeXMLHttpRequest) => void) {
    (this.listeners[type] ||= []).push(listener)
  }

  get responseText(): string {
    return this.readyState === 4 ? FakeXMLHttpRequest.payload : ''
  }
}

function request(url = RELATION_URL) {
  const xhr = new FakeXMLHttpRequest()
  xhr.open('GET', url)
  xhr.send()
}

function published() {
  return parseAutoLikeState(document.documentElement.getAttribute(AUTO_LIKE_ATTR))
}

afterEach(() => {
  document.documentElement.removeAttribute(AUTO_LIKE_ATTR)
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

it('publishes the like state the page itself asked for', () => {
  FakeXMLHttpRequest.payload = JSON.stringify({ code: 0, data: { like: false, coin: 0, favorite: false } })
  request()

  expect(published()).toEqual({ bvid: 'BV1TceU6iEoH', like: false })

  FakeXMLHttpRequest.payload = JSON.stringify({ code: 0, data: { like: true, coin: 1, favorite: false } })
  request()
  expect(published()).toEqual({ bvid: 'BV1TceU6iEoH', like: true })
})

it('publishes nothing it cannot attribute or trust', () => {
  // 没登录：页面根本不会发这个请求，但就算发回来了也不是一条状态
  FakeXMLHttpRequest.payload = JSON.stringify({ code: -101, message: '账号未登录', data: null })
  request()
  expect(published()).toBeNull()

  // 一条已经赞过的状态，不能被一个错误覆盖成「没赞过」
  FakeXMLHttpRequest.payload = JSON.stringify({ code: 0, data: { like: true } })
  request()
  FakeXMLHttpRequest.payload = JSON.stringify({ code: -412, message: '请求被拦截' })
  request()
  expect(published()).toEqual({ bvid: 'BV1TceU6iEoH', like: true })

  // URL 里没有 bvid：状态不知道该算在哪个视频头上
  FakeXMLHttpRequest.payload = JSON.stringify({ code: 0, data: { like: false } })
  request('https://api.bilibili.com/x/web-interface/archive/relation?aid=80433022')
  expect(published()).toEqual({ bvid: 'BV1TceU6iEoH', like: true })
})

it('leaves other responses alone', () => {
  FakeXMLHttpRequest.payload = JSON.stringify({ code: 0, data: { like: true } })
  request('https://api.bilibili.com/x/web-interface/view?bvid=BV1TceU6iEoH')

  expect(published()).toBeNull()
})
