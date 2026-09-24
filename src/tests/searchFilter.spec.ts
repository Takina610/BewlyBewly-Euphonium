import { runInThisContext } from 'node:vm'

import { afterEach, expect, it, vi } from 'vitest'

import injectSource from '~/inject/index.js?raw'
import { SEARCH_FILTER_ATTR } from '~/logic/searchFilter'

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
 * The search page is purified in the main-world inject script: results arrive from the page's own
 * requests, and neither the result type nor the uploader's UID can be read off a rendered card.
 *
 * The script is copied verbatim into the extension as a classic script and cannot be imported, so this
 * evaluates its source against a fake XHR and reads the JSON that comes back out.
 */
const ALL_URL = 'https://api.bilibili.com/x/web-interface/wbi/search/all/v2?keyword=%E5%8E%9F%E7%A5%9E'
const TYPE_URL = 'https://api.bilibili.com/x/web-interface/wbi/search/type?search_type=video&keyword=%E5%8E%9F%E7%A5%9E'
const SQUARE_URL = 'https://api.bilibili.com/x/web-interface/wbi/search/square?limit=10&platform=web'
const DEFAULT_URL = 'https://api.bilibili.com/x/web-interface/wbi/search/default?web_location=333.337'

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

/** 综合搜索：投稿视频那一组里混着广告，另外还有一整组广告、一组 UP 主、一组活动卡。 */
const ALL_FIXTURE = {
  code: 0,
  data: {
    result: [
      {
        result_type: 'video',
        data: [
          { type: 'video', title: '<em class="keyword">原神</em>角色预告', author: '原神', mid: 401742377 },
          { type: 'ad', title: '广告位', author: '某品牌', mid: 1 },
          { type: 'video', title: '被屏蔽的投稿', author: '某个 UP', mid: 2 },
        ],
      },
      { result_type: 'bili_user', data: [{ type: 'bili_user', uname: '原神', mid: 401742377 }] },
      { result_type: 'brand_ad', data: [{ type: 'brand_ad', title: '品牌广告' }] },
      { result_type: 'activity', data: [{ type: 'activity', title: '活动卡' }] },
    ],
  },
}

function setRules(partial: Record<string, unknown>) {
  document.documentElement.setAttribute(SEARCH_FILTER_ATTR, JSON.stringify({
    purify: [],
    types: [],
    enabledKeywords: false,
    content: [],
    user: [],
    uid: [],
    ...partial,
  }))
}

function request(payload: unknown, url: string) {
  FakeXMLHttpRequest.payload = JSON.stringify(payload)
  const xhr = new FakeXMLHttpRequest()
  xhr.open('GET', url)
  xhr.send()
  return JSON.parse(xhr.responseText)
}

afterEach(() => {
  document.documentElement.removeAttribute(SEARCH_FILTER_ATTR)
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

it('leaves every result alone while nothing is switched on', () => {
  setRules({})

  const payload = request(ALL_FIXTURE, ALL_URL)
  expect(payload.data.result).toHaveLength(4)
  expect(payload.data.result[0].data).toHaveLength(3)
})

it('drops the results of a blocked type, both whole groups and single items', () => {
  setRules({ types: ['ad', 'user'] })

  const payload = request(ALL_FIXTURE, ALL_URL)
  // 广告那一组、UP 主那一组整个消失
  expect(payload.data.result.map((group: { result_type: string }) => group.result_type)).toEqual(['video', 'activity'])
  // 投稿视频那一组里那条广告也掉，两条投稿留下
  expect(payload.data.result[0].data.map((item: { title: string }) => item.title))
    .toEqual(['<em class="keyword">原神</em>角色预告', '被屏蔽的投稿'])
})

it('takes the activity group as the trending banner the settings call it', () => {
  setRules({ types: ['hot_banner'] })

  const payload = request(ALL_FIXTURE, ALL_URL)
  expect(payload.data.result.map((group: { result_type: string }) => group.result_type))
    .toEqual(['video', 'bili_user', 'brand_ad'])
})

it('drops results by keyword, uploader and UID', () => {
  setRules({ enabledKeywords: true, content: [{ keyword: '被屏蔽', remark: '' }] })
  expect(request(ALL_FIXTURE, ALL_URL).data.result[0].data).toHaveLength(2)

  setRules({ enabledKeywords: true, user: [{ keyword: '原神', remark: '' }] })
  const byUp = request(ALL_FIXTURE, ALL_URL)
  // UP 主那一组整组空了就不要了，投稿那一组里同名 UP 的那条也掉了
  expect(byUp.data.result.map((group: { result_type: string }) => group.result_type)).toEqual(['video', 'brand_ad', 'activity'])
  expect(byUp.data.result[0].data.map((item: { mid: number }) => item.mid)).toEqual([1, 2])

  setRules({ enabledKeywords: true, uid: [{ keyword: '401742377', remark: '' }] })
  expect(request(ALL_FIXTURE, ALL_URL).data.result[0].data.map((item: { mid: number }) => item.mid)).toEqual([1, 2])
})

it('filters the typed search tab the same way', () => {
  setRules({ types: ['video'] })

  // 投稿视频掉光，广告留下（它自成一类）
  const byType = request({ code: 0, data: { result: ALL_FIXTURE.data.result[0].data } }, TYPE_URL)
  expect(byType.data.result.map((item: { type: string }) => item.type)).toEqual(['ad'])

  setRules({ enabledKeywords: true, user: [{ keyword: '某品牌', remark: '' }] })
  const byUp = request({ code: 0, data: { result: ALL_FIXTURE.data.result[0].data } }, TYPE_URL)
  expect(byUp.data.result.map((item: { type: string }) => item.type)).toEqual(['video', 'video'])
})

it('empties the trending and discover blocks, and the reason lines with them', () => {
  setRules({ purify: ['trending', 'recommend'] })

  // 网页端那份：data 是个对象，键就是那一块的名字
  const web = request({
    code: 0,
    data: {
      trending: { title: '热搜', list: [{ keyword: '热搜一' }] },
      recommend: { title: '发现', list: [{ keyword: '发现一', recommend_reason: '因为你关注了原神' }] },
    },
  }, SQUARE_URL)

  expect(web.data.trending.list).toEqual([])
  expect(web.data.recommend.list).toEqual([])

  // App 那份：data 是数组，每一块自带 type
  const app = request({
    code: 0,
    data: [
      { type: 'trending', data: { list: [{ keyword: '热搜一' }] } },
      { type: 'recommend', data: { list: [{ keyword: '发现一', recommend_reason: '因为你关注了原神' }] } },
    ],
  }, SQUARE_URL)

  expect(app.data[0].data.list).toEqual([])
  expect(app.data[1].data.list).toEqual([])
})

it('keeps the discover block but takes the reason lines out of it when only trending is purified', () => {
  setRules({ purify: ['trending'] })

  const payload = request({
    code: 0,
    data: {
      trending: { list: [{ keyword: '热搜一' }] },
      recommend: { list: [{ keyword: '发现一', recommend_reason: '因为你关注了原神' }, { keyword: '发现二' }] },
    },
  }, SQUARE_URL)

  expect(payload.data.trending.list).toEqual([])
  expect(payload.data.recommend.list).toEqual([{ keyword: '发现一' }, { keyword: '发现二' }])
})

it('clears the default keyword in the search box', () => {
  setRules({ purify: ['words'] })

  const payload = request({
    code: 0,
    data: { seid: '1', name: '璃月', show_name: '璃月', url: 'https://search.bilibili.com/all?keyword=璃月' },
  }, DEFAULT_URL)

  expect(payload.data.name).toBe('')
  expect(payload.data.show_name).toBe('')
})

it('leaves other responses alone', () => {
  setRules({ types: ['video', 'ad', 'user'], purify: ['words', 'trending', 'recommend'] })

  const payload = request(ALL_FIXTURE, 'https://api.bilibili.com/x/web-interface/view?bvid=BV1TceU6iEoH')

  expect(payload.data.result).toHaveLength(4)
})
