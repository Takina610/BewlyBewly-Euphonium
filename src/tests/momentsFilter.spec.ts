import { runInThisContext } from 'node:vm'

import { afterEach, expect, it, vi } from 'vitest'

import injectSource from '~/inject/index.js?raw'
import { MOMENTS_FILTER_ATTR } from '~/logic/momentsFilter'

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
 * The dynamic feed is filtered in the main-world inject script: the page asks for it itself, and a
 * card's type, author and topic live in the response rather than in the rendered card. The script is
 * copied verbatim into the extension as a classic script and cannot be imported, so this evaluates its
 * source against a fake XHR and reads the surviving items back out.
 *
 * The fixture is one item per condition, each differing in exactly one field, so a wrong mapping shows
 * up as the wrong id surviving.
 */
const FEED_URL = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?type=all&offset=&update_baseline=&page=1&platform=web'

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

interface ItemSpec {
  id: string
  type?: string
  author?: { mid: number, name: string }
  text?: string
  major?: Record<string, unknown>
  additional?: Record<string, unknown>
  topic?: { id: number, name: string }
  visible?: boolean
  folded?: boolean
}

function feedItem(spec: ItemSpec) {
  const modules: Record<string, unknown> = {
    module_author: spec.author ?? { mid: 1, name: '甲' },
    module_dynamic: {
      desc: { text: spec.text ?? '' },
      major: spec.major ?? null,
      additional: spec.additional ?? null,
      topic: spec.topic ?? null,
    },
  }
  if (spec.folded)
    modules.module_fold = { ids: ['x'], statement: '展开 1 条相关动态' }

  return {
    id_str: spec.id,
    type: spec.type ?? 'DYNAMIC_TYPE_WORD',
    visible: spec.visible ?? true,
    modules,
  }
}

const ITEMS: ItemSpec[] = [
  { id: 'keep', type: 'DYNAMIC_TYPE_WORD', text: '一条普通动态' },
  { id: 'video', type: 'DYNAMIC_TYPE_AV', major: { type: 'MAJOR_TYPE_ARCHIVE' }, text: '投稿视频' },
  { id: 'ad', type: 'DYNAMIC_TYPE_AD', text: '广告卡' },
  { id: 'goods', type: 'DYNAMIC_TYPE_DRAW', additional: { type: 'ADDITIONAL_TYPE_GOODS' }, text: '带货' },
  { id: 'reserve', type: 'DYNAMIC_TYPE_DRAW', additional: { type: 'ADDITIONAL_TYPE_RESERVE' }, text: '预约了直播' },
  { id: 'gone', type: 'DYNAMIC_TYPE_WORD', major: { type: 'MAJOR_TYPE_NONE' } },
  { id: 'folded', type: 'DYNAMIC_TYPE_WORD', text: '折叠起来的动态', folded: true },
  { id: 'topic', type: 'DYNAMIC_TYPE_DRAW', text: '话题动态', topic: { id: 9, name: '原神' } },
  { id: 'banned-up', type: 'DYNAMIC_TYPE_WORD', text: '这个 UP 不想看', author: { mid: 20, name: '乙' } },
  { id: 'banned-uid', type: 'DYNAMIC_TYPE_WORD', text: '这个 UID 不想看', author: { mid: 42, name: '丙' } },
  { id: 'keyword', type: 'DYNAMIC_TYPE_WORD', text: '这条里有关键词' },
  { id: 'repost', type: 'DYNAMIC_TYPE_FORWARD', text: '转发了一条' },
]

function payloadOf(items: ItemSpec[] = ITEMS) {
  return {
    code: 0,
    data: {
      has_more: true,
      items: items.map(feedItem),
      offset: '',
      update_baseline: '',
      update_num: 0,
    },
  }
}

function setRules(partial: Record<string, unknown> = {}) {
  document.documentElement.setAttribute(MOMENTS_FILTER_ATTR, JSON.stringify({
    types: [],
    blockInvisible: false,
    blockJumpAds: false,
    blockLiveReservation: false,
    blockPromotions: false,
    blockVideos: false,
    enabledKeywords: false,
    content: [],
    user: [],
    uid: [],
    topic: [],
    ...partial,
  }))
}

/** 留下来的动态 id。 */
function survivors(url = FEED_URL): string[] {
  const xhr = new FakeXMLHttpRequest()
  xhr.open('GET', url)
  xhr.send()
  return JSON.parse(xhr.responseText).data.items.map((item: { id_str: string }) => item.id_str)
}

afterEach(() => {
  document.documentElement.removeAttribute(MOMENTS_FILTER_ATTR)
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

it('leaves the whole feed alone when nothing is asked for', () => {
  FakeXMLHttpRequest.payload = JSON.stringify(payloadOf())
  setRules()

  expect(survivors()).toEqual(ITEMS.map(item => item.id))
})

it('drops the cards the five switches name', () => {
  FakeXMLHttpRequest.payload = JSON.stringify(payloadOf())

  setRules({ blockVideos: true })
  expect(survivors()).not.toContain('video')

  setRules({ blockPromotions: true })
  expect(survivors()).not.toContain('ad')

  setRules({ blockJumpAds: true })
  expect(survivors()).not.toContain('goods')

  setRules({ blockLiveReservation: true })
  expect(survivors()).not.toContain('reserve')

  setRules({ blockInvisible: true })
  expect(survivors()).not.toContain('gone')
})

it('drops the types that were ticked, and only those', () => {
  FakeXMLHttpRequest.payload = JSON.stringify(payloadOf())

  setRules({ types: ['fold', 'forward'] })

  expect(survivors()).not.toContain('folded')
  expect(survivors()).not.toContain('repost')
  expect(survivors()).toContain('keep')
  expect(survivors()).toContain('video')
})

it('drops by keyword, matching each scope the way the lists are written', () => {
  FakeXMLHttpRequest.payload = JSON.stringify(payloadOf())

  setRules({ enabledKeywords: true, content: [{ keyword: '关键词', remark: '' }] })
  expect(survivors()).not.toContain('keyword')
  expect(survivors()).toContain('keep')

  setRules({ enabledKeywords: true, user: [{ keyword: '乙', remark: '' }] })
  expect(survivors()).not.toContain('banned-up')
  expect(survivors()).toContain('keyword')

  setRules({ enabledKeywords: true, uid: [{ keyword: '42', remark: '' }] })
  expect(survivors()).not.toContain('banned-uid')

  setRules({ enabledKeywords: true, topic: [{ keyword: '原神', remark: '' }] })
  expect(survivors()).not.toContain('topic')
})

it('filters a feed request once, however often the page reads it', () => {
  FakeXMLHttpRequest.payload = JSON.stringify(payloadOf())
  setRules({ types: ['fold'] })

  const xhr = new FakeXMLHttpRequest()
  xhr.open('GET', FEED_URL)
  xhr.send()

  expect(xhr.responseText).toBe(xhr.responseText)
  expect(JSON.parse(xhr.responseText).data.items).toHaveLength(ITEMS.length - 1)
})

it('does not touch responses that are not the feed', () => {
  FakeXMLHttpRequest.payload = JSON.stringify(payloadOf())
  setRules({ types: ['fold', 'ad', 'forward', 'video'] })

  expect(survivors('https://api.bilibili.com/x/web-interface/view?bvid=BV1TceU6iEoH')).toEqual(ITEMS.map(item => item.id))
})
