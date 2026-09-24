import { runInThisContext } from 'node:vm'

import { afterEach, expect, it, vi } from 'vitest'

import injectSource from '~/inject/index.js?raw'
import { COMMENT_FILTER_ATTR } from '~/logic/commentFilter'

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
 * Comments are filtered in the main-world inject script: the page fetches them itself, and the UID a
 * comment is filtered by never reaches the DOM at all. The script is copied verbatim into the
 * extension as a classic script and cannot be imported, so this evaluates its source against a fake
 * XHR and reads the JSON String that comes back out.
 */
const COMMENT_URL = 'https://api.bilibili.com/x/v2/reply/wbi/main?oid=117313961463398&type=1&mode=3&ps=20'

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

interface ReplySpec {
  mid: number
  uname: string
  message: string
  replies?: ReplySpec[]
}

function reply(spec: ReplySpec): Record<string, unknown> {
  return {
    member: { mid: spec.mid, uname: spec.uname },
    content: { message: spec.message },
    replies: spec.replies?.map(reply) ?? [],
  }
}

/** 每一条都只差在一个维度上，出问题时一眼看得出是谁被误伤。 */
const FIXTURE: ReplySpec[] = [
  { mid: 1, uname: '甲', message: '这条应该留下' },
  { mid: 2, uname: '乙', message: '包含广告词的评论' },
  { mid: 3, uname: '乙乙', message: 'UP 主名只是像，不该被误伤' },
  { mid: 4, uname: '丙', message: '话题评论 #原神# 好玩' },
  {
    mid: 5,
    uname: '丁',
    message: '这条自己没问题',
    replies: [
      { mid: 6, uname: '戊', message: '楼里这条有广告词' },
      { mid: 7, uname: '己', message: '楼里这条没问题' },
    ],
  },
  {
    mid: 8,
    uname: '庚',
    message: '带广告词的家长',
    replies: [{ mid: 9, uname: '辛', message: '无辜的楼中楼' }],
  },
]

function payloadOf(specs: ReplySpec[]) {
  return {
    code: 0,
    data: {
      replies: specs.map(reply),
      top_replies: [],
      hots: [],
      cursor: { all_count: 6, is_end: false },
    },
  }
}

function setRules(partial: Record<string, unknown>) {
  document.documentElement.setAttribute(COMMENT_FILTER_ATTR, JSON.stringify({
    enabled: true,
    content: [],
    user: [],
    uid: [],
    topic: [],
    ...partial,
  }))
}

function requestComments(url = COMMENT_URL) {
  const xhr = new FakeXMLHttpRequest()
  xhr.open('GET', url)
  xhr.send()
  return JSON.parse(xhr.responseText)
}

/** 留下来的评论，写成 `mid` 的列表，楼中楼单独跟在后面。 */
function survivors(payload: any): { top: number[], nested: number[] } {
  const top: number[] = []
  const nested: number[] = []
  for (const item of payload.data.replies) {
    top.push(item.member.mid)
    for (const child of item.replies)
      nested.push(child.member.mid)
  }
  return { top, nested }
}

afterEach(() => {
  document.documentElement.removeAttribute(COMMENT_FILTER_ATTR)
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

it('leaves every comment alone while the filter is off', () => {
  FakeXMLHttpRequest.payload = JSON.stringify(payloadOf(FIXTURE))
  setRules({ enabled: false, content: [{ keyword: '广告', remark: '' }] })

  expect(survivors(requestComments()).top).toEqual([1, 2, 3, 4, 5, 8])
})

it('drops comments whose text contains a keyword', () => {
  FakeXMLHttpRequest.payload = JSON.stringify(payloadOf(FIXTURE))
  setRules({ content: [{ keyword: '广告', remark: '' }] })

  expect(survivors(requestComments()).top).toEqual([1, 3, 4, 5])
})

it('drops comments by uploader and by UID, matching the whole value', () => {
  FakeXMLHttpRequest.payload = JSON.stringify(payloadOf(FIXTURE))
  setRules({ user: [{ keyword: '乙', remark: '' }] })
  // 「乙乙」只是名字里带着「乙」，不该跟着掉
  expect(survivors(requestComments()).top).toEqual([1, 3, 4, 5, 8])

  setRules({ uid: [{ keyword: '4', remark: '' }] })
  expect(survivors(requestComments()).top).toEqual([1, 2, 3, 5, 8])
})

it('drops comments that carry a blocked topic', () => {
  FakeXMLHttpRequest.payload = JSON.stringify(payloadOf(FIXTURE))
  setRules({ topic: [{ keyword: '原神', remark: '' }] })
  expect(survivors(requestComments()).top).toEqual([1, 2, 3, 5, 8])

  // 「话题」只看成对的 # 之间那一段，正文里出现同样的字不算
  setRules({ topic: [{ keyword: '好玩', remark: '' }] })
  expect(survivors(requestComments()).top).toEqual([1, 2, 3, 4, 5, 8])
})

it('takes the nested replies with a dropped comment, and drops the ones that match on their own', () => {
  FakeXMLHttpRequest.payload = JSON.stringify(payloadOf(FIXTURE))
  setRules({ content: [{ keyword: '广告', remark: '' }] })

  const { top, nested } = survivors(requestComments())

  // 带广告词的家长连同楼里两条一起消失
  expect(top).not.toContain(8)
  expect(nested).not.toContain(9)
  // 家长自己没问题，只有楼里那条踩线
  expect(top).toContain(5)
  expect(nested).toEqual([7])
})

it('reads a regex entry the same way the home feed does', () => {
  FakeXMLHttpRequest.payload = JSON.stringify(payloadOf(FIXTURE))
  setRules({ content: [{ keyword: '/广[告\s]*词/', remark: '' }] })

  expect(survivors(requestComments()).top).toEqual([1, 3, 4, 5])
})

it('filters a request once, however often the page reads it', () => {
  FakeXMLHttpRequest.payload = JSON.stringify(payloadOf(FIXTURE))
  setRules({ content: [{ keyword: '广告', remark: '' }] })

  const xhr = new FakeXMLHttpRequest()
  xhr.open('GET', COMMENT_URL)
  xhr.send()

  expect(xhr.responseText).toBe(xhr.responseText)
  expect(JSON.parse(xhr.responseText).data.replies).toHaveLength(4)
})

it('does not touch responses that are not comments', () => {
  FakeXMLHttpRequest.payload = JSON.stringify(payloadOf(FIXTURE))
  setRules({ content: [{ keyword: '广告', remark: '' }] })

  const request = requestComments('https://api.bilibili.com/x/web-interface/view?bvid=BV1TceU6iEoH')

  expect(survivors(request).top).toEqual([1, 2, 3, 4, 5, 8])
})

it('filters comments fetched through fetch as well', async () => {
  // jsdom 没有 fetch，但跑测试的 Node 有；注入脚本认的是 `window.fetch` 存不存在
  if (typeof globalThis.fetch !== 'function' || typeof globalThis.Response !== 'function')
    return

  const originalFetch = globalThis.fetch
  ;(globalThis as any).fetch = async () => new Response(JSON.stringify(payloadOf(FIXTURE)), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
  ;(window as any).fetch = globalThis.fetch

  try {
    // 这一段在脚本加载时就取好了，所以要重跑一遍才认得上边的替身
    runInThisContext(`;(() => {
${injectSource}
})()`)

    setRules({ content: [{ keyword: '广告', remark: '' }] })
    const response = await (window as any).fetch(COMMENT_URL)
    const payload = await response.json()

    expect(payload.data.replies).toHaveLength(4)
  }
  finally {
    globalThis.fetch = originalFetch
    ;(window as any).fetch = originalFetch
  }
})
