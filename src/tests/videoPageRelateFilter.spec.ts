import { runInThisContext } from 'node:vm'

import { afterEach, expect, it, vi } from 'vitest'

import injectSource from '~/inject/index.js?raw'
import { VIDEO_RELATE_FILTER_ATTR } from '~/logic/videoPageRelateFilter'

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
 * Two of the rail's options are decided on the related feed's data rather than on the rendered cards:
 * a charge-exclusive video and a card that is not an uploaded video look exactly like every other card
 * in the rail, so the only place they can be told apart is the response.
 *
 * The inject script is copied verbatim into the extension as a classic script and cannot be imported,
 * so this evaluates its source against a fake XHR and reads the JSON that comes back out.
 */
const RELATE_URL = 'https://api.bilibili.com/x/web-interface/archive/related?bvid=BV1TceU6iEoH&ps=30'

class FakeXMLHttpRequest {
  static payload = ''

  readyState = 1
  status = 200
  url = ''
  private listeners: Record<string, ((this: FakeXMLHttpRequest) => void)[]> = {}

  open(_method: string, url: string) {
    this.url = url
  }

  send() {
    this.readyState = 4
    for (const listener of this.listeners.load ?? [])
      listener.call(this)
  }

  addEventListener(type: string, listener: (this: FakeXMLHttpRequest) => void) {
    (this.listeners[type] ||= []).push(listener)
  }

  get responseText(): string {
    return this.readyState === 4 ? FakeXMLHttpRequest.payload : ''
  }

  get response(): string {
    return this.responseText
  }
}

/** 每一条只差在一个维度上：充电专属、投稿之外、认不出的。 */
const FIXTURE = [
  { bvid: 'BV1', title: '普通投稿', ai_rcmd: { goto: 'av' } },
  { bvid: 'BV2', title: '充电专属', charging_pay: 1, ai_rcmd: { goto: 'av' } },
  { bvid: 'BV3', title: '充电专属（字段在但值为 0）', charging_pay: 0, ai_rcmd: { goto: 'av' } },
  { bvid: 'BV4', title: '番剧', is_ogv: true, ai_rcmd: { goto: 'bangumi' } },
  { bvid: 'BV5', title: '课程', ai_rcmd: { goto: 'cheese' } },
  { bvid: 'BV6', title: '没有 ai_rcmd 的条目' },
]

function setRules(partial: Record<string, unknown>) {
  document.documentElement.setAttribute(VIDEO_RELATE_FILTER_ATTR, JSON.stringify({
    chargeExclusive: false,
    onlyUploader: false,
    ...partial,
  }))
}

function requestRelate(url = RELATE_URL): string[] {
  FakeXMLHttpRequest.payload = JSON.stringify({ code: 0, data: FIXTURE.map(item => ({ ...item })) })
  const xhr = new FakeXMLHttpRequest()
  xhr.open('GET', url)
  xhr.send()
  return JSON.parse(xhr.responseText).data.map((item: { bvid: string }) => item.bvid)
}

afterEach(() => {
  document.documentElement.removeAttribute(VIDEO_RELATE_FILTER_ATTR)
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

it('leaves the rail alone while both switches are off', () => {
  setRules({})

  expect(requestRelate()).toEqual(['BV1', 'BV2', 'BV3', 'BV4', 'BV5', 'BV6'])
})

it('drops charge-exclusive videos, and only those the field says so', () => {
  setRules({ chargeExclusive: true })

  // `charging_pay: 0` 是明摆着没开通，不该跟着掉
  expect(requestRelate()).toEqual(['BV1', 'BV3', 'BV4', 'BV5', 'BV6'])
})

it('keeps uploaded videos only, and keeps what it cannot recognise', () => {
  setRules({ onlyUploader: true })

  // 番剧与课程掉落；没有 `ai_rcmd` 的条目认不出来，宁可不删
  expect(requestRelate()).toEqual(['BV1', 'BV2', 'BV3', 'BV6'])
})

it('leaves other responses alone', () => {
  setRules({ chargeExclusive: true, onlyUploader: true })

  expect(requestRelate('https://api.bilibili.com/x/web-interface/view?bvid=BV1TceU6iEoH'))
    .toEqual(['BV1', 'BV2', 'BV3', 'BV4', 'BV5', 'BV6'])
})
