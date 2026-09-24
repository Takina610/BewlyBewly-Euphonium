import { runInThisContext } from 'node:vm'

import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import injectSource from '~/inject/index.js?raw'
import { currentMomentRules, shouldHideMoment } from '~/logic/momentRules'
import { MOMENTS_FILTER_ATTR } from '~/logic/momentsFilter'
import { settings } from '~/logic/storage'

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
 * The same rules live in two places, because the dynamic feed is read from two directions: the page
 * asks for it itself (filtered by the main-world inject script, which cannot import anything), and the
 * extension's own home tabs ask the background for it (filtered in TypeScript at their call site).
 *
 * Neither half can be shared, so this spec keeps them honest: one fixture, one set of rules, and both
 * implementations have to answer the same thing. A rule added to one side and not the other fails
 * here rather than quietly disagreeing in the browser.
 */
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

const FEED_URL = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?type=all'

/** 一条件一例：每一条只在一个字段上与「该留下」那条不同。 */
const FIXTURE = [
  item('keep', {}),
  item('video', { type: 'DYNAMIC_TYPE_AV', major: { type: 'MAJOR_TYPE_ARCHIVE' } }),
  item('pgc', { type: 'DYNAMIC_TYPE_PGC' }),
  item('word', { type: 'DYNAMIC_TYPE_WORD' }),
  item('draw', { type: 'DYNAMIC_TYPE_DRAW' }),
  item('draw-opus', { type: 'DYNAMIC_TYPE_DRAW', major: { type: 'MAJOR_TYPE_OPUS' } }),
  item('article', { type: 'DYNAMIC_TYPE_ARTICLE' }),
  item('audio', { type: 'DYNAMIC_TYPE_MUSIC' }),
  item('live', { type: 'DYNAMIC_TYPE_LIVE_RCMD' }),
  item('medialist', { type: 'DYNAMIC_TYPE_MEDIALIST' }),
  item('ad', { type: 'DYNAMIC_TYPE_AD' }),
  item('ad-module', { type: 'DYNAMIC_TYPE_WORD', moduleAd: true }),
  item('banner', { type: 'DYNAMIC_TYPE_BANNER' }),
  item('ugc-season', { type: 'DYNAMIC_TYPE_UGC_SEASON' }),
  item('courses', { type: 'DYNAMIC_TYPE_COURSES' }),
  item('story', { type: 'DYNAMIC_TYPE_AV', major: { type: 'MAJOR_TYPE_ARCHIVE', archive: { type: 3 } } }),
  item('topic-rcmd', { type: 'DYNAMIC_TYPE_TOPIC_RCMD' }),
  item('forward', { type: 'DYNAMIC_TYPE_FORWARD' }),
  item('folded', { folded: true }),
  item('invisible', { type: 'DYNAMIC_TYPE_WORD', major: { type: 'MAJOR_TYPE_NONE' } }),
  item('goods', { type: 'DYNAMIC_TYPE_DRAW', additional: { type: 'ADDITIONAL_TYPE_GOODS' } }),
  item('up-rcmd', { type: 'DYNAMIC_TYPE_WORD', additional: { type: 'ADDITIONAL_TYPE_UP_RCMD' } }),
  item('reserve', { type: 'DYNAMIC_TYPE_WORD', additional: { type: 'ADDITIONAL_TYPE_RESERVE' } }),
  item('goods-node', { type: 'DYNAMIC_TYPE_DRAW', nodes: [{ type: 'RICH_TEXT_NODE_TYPE_GOODS', orig_text: '带货' }] }),
  item('topic-inline', { type: 'DYNAMIC_TYPE_DRAW', text: '带话题的', nodes: [{ type: 'RICH_TEXT_NODE_TYPE_TOPIC', text: '#原神#' }] }),
  item('topic-module', { type: 'DYNAMIC_TYPE_DRAW', topic: { id: 1, name: '星穹铁道' } }),
  item('text-hit', { type: 'DYNAMIC_TYPE_WORD', text: '这里有关键词' }),
  item('up-hit', { type: 'DYNAMIC_TYPE_WORD', author: { mid: 20, name: '乙' } }),
  item('uid-hit', { type: 'DYNAMIC_TYPE_WORD', author: { mid: 42, name: '丙' } }),
  item('orig-hit', { type: 'DYNAMIC_TYPE_FORWARD', origText: '转发的那半也有话' }),
]

interface ItemSpec {
  type?: string
  text?: string
  origText?: string
  major?: Record<string, unknown>
  additional?: Record<string, unknown>
  topic?: { id: number, name: string }
  author?: { mid: number, name: string }
  nodes?: Record<string, unknown>[]
  folded?: boolean
  moduleAd?: boolean
}

function item(id: string, spec: ItemSpec) {
  const modules: Record<string, unknown> = {
    module_author: spec.author ?? { mid: 1, name: '甲' },
    module_dynamic: {
      desc: { text: spec.text ?? '', rich_text_nodes: spec.nodes ?? [] },
      major: spec.major ?? null,
      additional: spec.additional ?? null,
      topic: spec.topic ?? null,
    },
  }
  if (spec.folded)
    modules.module_fold = { ids: ['x'] }
  if (spec.moduleAd)
    modules.module_ad = { source_content: {} }
  if (spec.origText) {
    ;(modules.module_dynamic as any).desc.text = '转发'
    ;(spec as Record<string, unknown>).orig = {
      modules: { module_dynamic: { desc: { text: spec.origText } } },
    }
  }

  return { ...spec, id_str: id, type: spec.type ?? 'DYNAMIC_TYPE_WORD', visible: true, modules }
}

/** 那套设置，写成一份一份的：每条规则单独一遍，最后再来一遍全开。 */
const RULE_SETS: { name: string, apply: () => void }[] = [
  ...['momentsBlockInvisible', 'momentsBlockJumpAds', 'momentsBlockLiveReservation', 'momentsBlockPromotions', 'momentsBlockVideos'].map(key => ({
    name: key,
    apply: () => {
      ;(settings.value as Record<string, unknown>)[key] = true
    },
  })),
  ...['forward', 'video', 'pgc', 'fold', 'word', 'draw', 'article', 'audio', 'live', 'medialist', 'ad', 'banner', 'ugcSeason', 'story', 'topicRcmd', 'courses'].map(key => ({
    name: `type:${key}`,
    apply: () => {
      settings.value.momentsBlockedTypes = [key]
    },
  })),
  {
    name: 'keyword:content',
    apply: () => {
      settings.value.momentsFilterKeywords = true
      settings.value.momentsFilterContent = [{ keyword: '关键词', remark: '' }]
    },
  },
  {
    name: 'keyword:user',
    apply: () => {
      settings.value.momentsFilterKeywords = true
      settings.value.momentsFilterUser = [{ keyword: '乙', remark: '' }]
    },
  },
  {
    name: 'keyword:uid',
    apply: () => {
      settings.value.momentsFilterKeywords = true
      settings.value.momentsFilterUid = [{ keyword: '42', remark: '' }]
    },
  },
  {
    name: 'keyword:topic',
    apply: () => {
      settings.value.momentsFilterKeywords = true
      settings.value.momentsFilterTopic = [{ keyword: '原神', remark: '' }]
    },
  },
  {
    name: 'keyword:regex',
    apply: () => {
      settings.value.momentsFilterKeywords = true
      settings.value.momentsFilterContent = [{ keyword: '/關鍵|关键/', remark: '' }]
    },
  },
  {
    name: 'everything',
    apply: () => {
      settings.value.momentsBlockedTypes = ['forward', 'video', 'ad', 'fold', 'story', 'live', 'topicRcmd', 'courses', 'banner']
      settings.value.momentsBlockInvisible = true
      settings.value.momentsBlockJumpAds = true
      settings.value.momentsBlockLiveReservation = true
      settings.value.momentsBlockPromotions = true
      settings.value.momentsBlockVideos = true
      settings.value.momentsFilterKeywords = true
      settings.value.momentsFilterContent = [{ keyword: '关键词', remark: '' }]
      settings.value.momentsFilterUser = [{ keyword: '乙', remark: '' }]
      settings.value.momentsFilterUid = [{ keyword: '42', remark: '' }]
      settings.value.momentsFilterTopic = [{ keyword: '星穹铁道', remark: '' }]
    },
  },
]

function resetSettings() {
  settings.value.momentsBlockedTypes = []
  settings.value.momentsBlockInvisible = false
  settings.value.momentsBlockJumpAds = false
  settings.value.momentsBlockLiveReservation = false
  settings.value.momentsBlockPromotions = false
  settings.value.momentsBlockVideos = false
  settings.value.momentsFilterKeywords = false
  settings.value.momentsFilterContent = []
  settings.value.momentsFilterUser = []
  settings.value.momentsFilterUid = []
  settings.value.momentsFilterTopic = []
}

/** 注入脚本那边认哪些、丢哪些。 */
function injectVerdict(): string[] {
  FakeXMLHttpRequest.payload = JSON.stringify({
    code: 0,
    data: { has_more: true, items: FIXTURE, offset: '', update_baseline: '', update_num: 0 },
  })

  const xhr = new FakeXMLHttpRequest()
  xhr.open('GET', FEED_URL)
  xhr.send()

  const survivors = JSON.parse(xhr.responseText).data.items as { id_str: string }[]
  return FIXTURE.filter(entry => !survivors.some(survivor => survivor.id_str === entry.id_str)).map(entry => entry.id_str)
}

/** 扩展自己那侧（首页那两个标签页）认哪些。没有规则可套时什么都不认。 */
function typescriptVerdict(): string[] {
  const rules = currentMomentRules()
  if (!rules)
    return []

  return FIXTURE.filter(entry => shouldHideMoment(entry, rules)).map(entry => entry.id_str)
}

beforeEach(() => {
  resetSettings()
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
  }))
})

afterEach(() => {
  document.documentElement.removeAttribute(MOMENTS_FILTER_ATTR)
  resetSettings()
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

it('hides nothing while nothing is asked for', () => {
  expect(typescriptVerdict()).toEqual([])
  expect(injectVerdict()).toEqual([])
})

for (const ruleSet of RULE_SETS) {
  it(`both halves agree on "${ruleSet.name}"`, () => {
    resetSettings()
    ruleSet.apply()

    // 注入脚本读的是 <html> 上的那份 JSON，先按同一份设置把它写出来
    document.documentElement.setAttribute(MOMENTS_FILTER_ATTR, JSON.stringify({
      types: settings.value.momentsBlockedTypes,
      blockInvisible: settings.value.momentsBlockInvisible,
      blockJumpAds: settings.value.momentsBlockJumpAds,
      blockLiveReservation: settings.value.momentsBlockLiveReservation,
      blockPromotions: settings.value.momentsBlockPromotions,
      blockVideos: settings.value.momentsBlockVideos,
      enabledKeywords: settings.value.momentsFilterKeywords,
      content: settings.value.momentsFilterContent,
      user: settings.value.momentsFilterUser,
      uid: settings.value.momentsFilterUid,
      topic: settings.value.momentsFilterTopic,
    }))

    const fromInject = injectVerdict()
    const fromTypeScript = typescriptVerdict()

    expect(fromTypeScript).toEqual(fromInject)
    // 每条规则都得真的认得点东西，否则「两边一致」可能只是两边都不干活
    if (ruleSet.name !== 'type:topicRcmd')
      expect(fromInject.length).toBeGreaterThan(0)
  })
}
