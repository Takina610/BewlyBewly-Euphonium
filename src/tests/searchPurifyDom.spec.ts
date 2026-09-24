import { runInThisContext } from 'node:vm'

import { afterEach, expect, it, vi } from 'vitest'

import injectSource from '~/inject/index.js?raw'
import { SEARCH_FILTER_ATTR } from '~/logic/searchFilter'
import {
  buildSearchPurifyCss,
  compileKeywords,
  HIDDEN_CLASS,
  purifySearchResults,
  readSearchResultTexts,
} from '~/logic/searchPurifyDom'

import ssrResultsHtml from './fixtures/searchResultsSsr.html?raw'

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
 * 搜索结果页的首屏是**服务端渲染**的：结果跟着 HTML 一起来，注入脚本没有响应可改。所以类型过滤与
 * 关键词过滤在渲染出来的节点上要能单独走通，这一份就是那一半。
 *
 * **两种格子都要认**：服务端那份用 `div.col_3 col_xs_1_5 …` 装卡片，客户端渲染出来的是
 * `.video-list-item`（实测：同一个关键词，首屏 42 张卡片的父元素全是 `col_*`，`.video-list-item`
 * 一个都没有）。所以锚点钉在卡片本身，测试两种形状都跑。
 */
function card(title: string, options: { id?: string, user?: string, mid?: string, marker?: string } = {}): string {
  const { id = '', user = '', mid = '', marker = '' } = options
  const owner = user
    ? `<a class="bili-video-card__info--owner" href="//space.bilibili.com/${mid}"><span class="bili-video-card__info--author">${user}</span></a>`
    : ''
  return `
    <div class="bili-video-card">
      <a href="//www.bilibili.com/video/BV1${id || 'AAA'}/"></a>
      ${marker}
      ${owner}
      <h3 class="bili-video-card__info--tit" title="${title}">${title}</h3>
    </div>
  `
}

/** 服务端渲染那种格子。 */
function serverCell(inner: string, id = ''): string {
  return `<div class="col_3 col_xs_1_5 col_md_2 col_xl_1_7 mb_x40"${id ? ` id="${id}"` : ''}>${inner}</div>`
}

/** 客户端渲染那种格子。 */
function clientCell(inner: string, id = ''): string {
  return `<div class="video-list-item col_1_5 col_xs_2"${id ? ` id="${id}"` : ''}>${inner}</div>`
}

function buildResults(): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = `
    <div class="brand-ad-list search-all-list" id="brand-ad-block"></div>
    <div class="activity-game-list i_wrapper search-all-list">
      <div class="activity-game-list-wrap">
        <div class="col_6 activity-game-list-item" id="activity-cell"><div class="activity-card">活动</div></div>
        <div class="col_6 activity-game-list-item" id="game-cell"><a class="game-card" href="https://www.biligame.com/detail/?id=1">游戏</a></div>
      </div>
    </div>
    <div class="user-list search-all-list" id="user-block"></div>
    <div class="bangumi-pgc-list search-all-list" id="bangumi-block"></div>
    <div class="video i_wrapper search-all-list">
      <div class="video-list row">
        ${serverCell(card('普通投稿', { id: '1', user: '甲乙', mid: '222' }), 'cell-1')}
        ${serverCell(card('直播间', { id: 'live', marker: '<a href="//live.bilibili.com/123"></a>' }), 'cell-live')}
        ${serverCell(card('付费课程', { id: 'cheese', user: '甲', mid: '111', marker: '<span class="bili-video-card__info--cheese">课程</span>' }), 'cell-cheese')}
        ${serverCell(card('投放推广', { id: 'ad', marker: '<a class="bili-video-card__info--ad" href="//cm.bilibili.com/x">广告</a>' }), 'cell-ad')}
        ${clientCell(card('客户端渲染的投稿', { id: 'client', user: '丙', mid: '333' }), 'cell-client')}
      </div>
    </div>
  `
  return root
}

function isHidden(root: HTMLElement, id: string) {
  return root.querySelector<HTMLElement>(`#${id}`)?.classList.contains(HIDDEN_CLASS) === true
}

function purify(root: HTMLElement, blockedTypes: string[], keywords: Parameters<typeof purifySearchResults>[1]['keywords'] = null) {
  purifySearchResults(root, { blockedTypes, keywords })
}

/** 只切某一类名单，另外两类留空。 */
function only(part: Partial<NonNullable<Parameters<typeof purifySearchResults>[1]['keywords']>>) {
  return {
    content: compileKeywords([], 'contains'),
    user: compileKeywords([], 'exact'),
    uid: compileKeywords([], 'exact'),
    ...part,
  } as Parameters<typeof purifySearchResults>[1]['keywords']
}

it('hides whole blocks by type', () => {
  const root = buildResults()

  purify(root, ['ad', 'user', 'bangumi'])

  expect(isHidden(root, 'brand-ad-block')).toBe(true)
  expect(isHidden(root, 'user-block')).toBe(true)
  expect(isHidden(root, 'bangumi-block')).toBe(true)
})

it('hides a result by its own type, whichever kind of cell it sits in', () => {
  const root = buildResults()

  purify(root, ['live', 'ketang', 'ad', 'video'])

  expect(isHidden(root, 'cell-live')).toBe(true)
  expect(isHidden(root, 'cell-cheese')).toBe(true)
  expect(isHidden(root, 'cell-ad')).toBe(true)
  // 「投稿视频」把 /video/BV 的都拿掉，两种格子都在内
  expect(isHidden(root, 'cell-1')).toBe(true)
  expect(isHidden(root, 'cell-client')).toBe(true)
})

it('keeps one of the two cards in the shared activity block, and takes the block when both are gone', () => {
  const root = buildResults()
  const block = root.querySelector('.activity-game-list')!

  purify(root, ['hot_banner'])
  expect(isHidden(root, 'activity-cell')).toBe(true)
  expect(isHidden(root, 'game-cell')).toBe(false)
  expect(block.classList.contains(HIDDEN_CLASS)).toBe(false)

  purify(root, ['hot_banner', 'game'])
  expect(block.classList.contains(HIDDEN_CLASS)).toBe(true)

  // 两条都放开之后，那块要回来
  purify(root, [])
  expect(block.classList.contains(HIDDEN_CLASS)).toBe(false)
  expect(isHidden(root, 'activity-cell')).toBe(false)
})

it('hides results whose title, uploader or UID matches the keyword lists', () => {
  const root = buildResults()

  purify(root, [], only({ content: compileKeywords([{ keyword: '付费', remark: '' }], 'contains') }))
  expect(isHidden(root, 'cell-cheese')).toBe(true)
  expect(isHidden(root, 'cell-1')).toBe(false)

  // UP 主是**完全**匹配：「甲」命中课程那条，「甲乙」命中投稿那条，互不牵连
  purify(root, [], only({ user: compileKeywords([{ keyword: '甲', remark: '' }], 'exact') }))
  expect(isHidden(root, 'cell-cheese')).toBe(true)
  expect(isHidden(root, 'cell-1')).toBe(false)

  purify(root, [], only({ user: compileKeywords([{ keyword: '甲乙', remark: '' }], 'exact') }))
  expect(isHidden(root, 'cell-1')).toBe(true)
  expect(isHidden(root, 'cell-cheese')).toBe(false)

  purify(root, [], only({ uid: compileKeywords([{ keyword: '333', remark: '' }], 'exact') }))
  expect(isHidden(root, 'cell-client')).toBe(true)

  // 名单清空后卡片要回来
  purify(root, [])
  expect(isHidden(root, 'cell-1')).toBe(false)
  expect(isHidden(root, 'cell-cheese')).toBe(false)
  expect(isHidden(root, 'cell-client')).toBe(false)
})

it('reads a card the way the keyword lists expect it', () => {
  const root = buildResults()
  const first = root.querySelector('#cell-1')!.querySelector('.bili-video-card')!

  expect(readSearchResultTexts(first)).toEqual({ title: '普通投稿', user: '甲乙', uid: '222' })
  // 没有作者的卡片读出来是空的，不该因此命中
  expect(readSearchResultTexts(root.querySelector('#cell-live')!.querySelector('.bili-video-card')!).user).toBe('')
})

it('builds a stylesheet that hides the blocked types before anything renders', () => {
  const css = buildSearchPurifyCss(['ad', 'live', 'video'])

  expect(css).toContain(`.${HIDDEN_CLASS} { display: none !important; }`)
  expect(css).toContain('.brand-ad-list { display: none !important; }')
  // 类型那一半锚在卡片上，两种格子都盖得住
  expect(css).toContain('.bili-video-card:has([href*="live.bilibili.com"]) { display: none !important; }')
  expect(css).toContain('.bili-video-card:has(a[href*="/video/BV"]) { display: none !important; }')
  // 没点名的类型不该出现
  expect(css).not.toContain('cheese')
  // 活动与游戏共用一块：两条都点上时才收整块
  expect(buildSearchPurifyCss(['hot_banner'])).not.toContain('.activity-game-list { display: none !important; }')
  expect(buildSearchPurifyCss(['hot_banner', 'game'])).toContain('.activity-game-list { display: none !important; }')
})

/**
 * 一张**真实抓下来**的搜索结果卡片信息区（`search.bilibili.com/video?keyword=原神` 那次），只去掉了
 * 骨架屏、图标、样式与 Vue 的属性。信息区是关键词那一半要读的东西——标题、UP 主名、以及 UP 主链接
 * 里的 UID——所以这份固定件锁的是「真页面上这些选择器读得到」。
 */
const CAPTURED_RESULT_INFO = `<div class="bili-video-card__info"><!----><div class="bili-video-card__info--right"><a href="//www.bilibili.com/video/BV1n4h46tEQP/" target="_blank" data-mod="search-card" data-idx="all" data-ext="click"><h3 class="bili-video-card__info--tit" title="原神7.1版本往冥府的安魂歌剧情合集（更新到主线白夜似梦初醒，往冥府的安魂歌，风仙亦是仙，古剑通幽玄，溯流的变奏曲第一天，冰宫密令第一周"><em class="keyword">原神</em>7.1版本往冥府的安魂歌剧情合集（更新到主线白夜似梦初醒，往冥府的安魂歌，风仙亦是仙，古剑通幽玄，溯流的变奏曲第一天，冰宫密令第一周</h3></a><!----><div class="bili-video-card__info--bottom"><a class="bili-video-card__info--owner" href="//space.bilibili.com/23084818" target="_blank" data-mod="search-card" data-idx="all" data-ext="click"><span class="bili-video-card__info--author">泛音1572</span><span class="bili-video-card__info--date"> · 昨天</span></a></div></div></div>`

const CAPTURED_CARD_FACTS = {
  title: '原神7.1版本往冥府的安魂歌剧情合集（更新到主线白夜似梦初醒，往冥府的安魂歌，风仙亦是仙，古剑通幽玄，溯流的变奏曲第一天，冰宫密令第一周',
  user: '泛音1572',
  uid: '23084818',
}

it('reads a card captured from the real results page', () => {
  const holder = document.createElement('div')
  holder.innerHTML = serverCell(`<div class="bili-video-card">${CAPTURED_RESULT_INFO}</div>`, 'captured-cell')

  const cell = holder.querySelector<HTMLElement>('#captured-cell')!
  const card = cell.querySelector('.bili-video-card')!

  expect(readSearchResultTexts(card)).toEqual(CAPTURED_CARD_FACTS)

  // 关键词那一半照着真卡片走一遍：UP 主名命中就藏那一格，没命中的留着
  purifySearchResults(holder, { blockedTypes: [], keywords: only({ user: compileKeywords([{ keyword: CAPTURED_CARD_FACTS.user, remark: '' }], 'exact') }) })
  expect(cell.classList.contains(HIDDEN_CLASS)).toBe(true)

  purifySearchResults(holder, { blockedTypes: [], keywords: only({ content: compileKeywords([{ keyword: '绝对不匹配的词', remark: '' }], 'contains') }) })
  expect(cell.classList.contains(HIDDEN_CLASS)).toBe(false)

  // UID 也在
  purifySearchResults(holder, { blockedTypes: [], keywords: only({ uid: compileKeywords([{ keyword: CAPTURED_CARD_FACTS.uid, remark: '' }], 'exact') }) })
  expect(cell.classList.contains(HIDDEN_CLASS)).toBe(true)
})

/**
 * 一份**真实抓下来的首屏**（`search.bilibili.com/all?keyword=库里` 那次，8 个格子），类名原样保留：
 * 外层是服务端那份 `div.col_3 col_xs_1_5 …`，卡片是 `.bili-video-card`。
 *
 * 这一份锁住「首屏那种形状也滤得到」——曾经锚在 `.video-list-item` 上，而首屏一个都没有（这就是
 * 「进去不生效、切一下 tab 才行」的成因）。
 */
it('filters cards captured from a real first paint', () => {
  const holder = document.createElement('div')
  holder.innerHTML = ssrResultsHtml

  const cells = Array.from(holder.querySelectorAll<HTMLElement>('.video-list > div'))
  expect(cells).toHaveLength(8)
  // 这份固定件就是首屏那种形状：外层不是 `.video-list-item`
  expect(holder.querySelectorAll('.video-list-item')).toHaveLength(0)
  expect(cells[0].className).toContain('col_')

  // 读得到标题、UP 主名、UID
  const texts = readSearchResultTexts(cells[0].querySelector('.bili-video-card')!)
  expect(texts.title).toContain('库里')
  expect(texts.user).toBe('金州勇士')
  expect(texts.uid).toBe('1006662958')

  // 关键词：命中「库里」的格子藏起来，没命中的留着——藏的是外层格子，不是卡片
  purify(holder, [], only({ content: compileKeywords([{ keyword: '库里', remark: '' }], 'contains') }))
  const hidden = cells.filter(cell => cell.classList.contains(HIDDEN_CLASS))
  const shown = cells.filter(cell => !cell.classList.contains(HIDDEN_CLASS))
  expect(hidden.length).toBeGreaterThan(0)
  expect(shown.length).toBeGreaterThan(0)
  for (const cell of hidden)
    expect(cell.textContent).toContain('库里')
  for (const cell of shown)
    expect(cell.textContent).not.toContain('库里')

  // 类型：这条广告（真页面里就有）按类型清掉，而且只清它一条
  purify(holder, [])
  expect(holder.querySelectorAll(`.${HIDDEN_CLASS}`)).toHaveLength(0)

  const adCell = cells.find(cell => cell.querySelector('.bili-video-card__info--ad, [href*="cm.bilibili.com"]'))
  expect(adCell, '抓下来的这一份里有一条广告').toBeTruthy()

  purify(holder, ['ad'])
  expect(adCell!.classList.contains(HIDDEN_CLASS)).toBe(true)
  expect(cells.filter(cell => cell.classList.contains(HIDDEN_CLASS))).toHaveLength(1)
})

/**
 * 关键词这一半有两份实现：注入脚本改接口响应（首屏之外那些），这一份读渲染出来的卡片。
 * 两边必须同答案——一份认 `/正则/`、另一份不认，或者一处「包含」一处「完全」，都会让同一份名单在
 * 不同时候表现不一样。这里拿同一份样例同时喂给两边。
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

const SEARCH_ALL_URL = 'https://api.bilibili.com/x/web-interface/wbi/search/all/v2?keyword=x'

function injectSurvivors(types: string[], content: { keyword: string, remark: string }[], user: { keyword: string, remark: string }[], uid: { keyword: string, remark: string }[]): string[] {
  document.documentElement.setAttribute(SEARCH_FILTER_ATTR, JSON.stringify({
    purify: [],
    types,
    enabledKeywords: true,
    content,
    user,
    uid,
  }))

  FakeXMLHttpRequest.payload = JSON.stringify({
    code: 0,
    data: {
      result: [{
        result_type: 'video',
        data: [
          { type: 'video', title: '付费课程', author: '甲', mid: 111 },
          { type: 'video', title: '普通投稿', author: '甲乙', mid: 222 },
          { type: 'live', title: '直播间', author: '乙', mid: 333 },
        ],
      }],
    },
  })

  const xhr = new FakeXMLHttpRequest()
  xhr.open('GET', SEARCH_ALL_URL)
  xhr.send()
  return JSON.parse(xhr.responseText).data.result[0].data.map((item: { title: string }) => item.title)
}

/** DOM 那一半的答案，与上面同一份顺序（那棵树里只比对两张投稿卡，直播间那条只在上面的样例里）。 */
function domSurvivors(content: { keyword: string, remark: string }[], user: { keyword: string, remark: string }[], uid: { keyword: string, remark: string }[]): string[] {
  const root = buildResults()

  purify(root, [], {
    content: compileKeywords(content, 'contains'),
    user: compileKeywords(user, 'exact'),
    uid: compileKeywords(uid, 'exact'),
  })

  const survivors: string[] = []
  if (!isHidden(root, 'cell-cheese'))
    survivors.push('付费课程')
  if (!isHidden(root, 'cell-1'))
    survivors.push('普通投稿')

  return survivors
}

afterEach(() => {
  document.documentElement.removeAttribute(SEARCH_FILTER_ATTR)
})

// jsdom has no Clipboard API, and the script's URL cleaner patches it on the way in
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async () => {} },
})

it('agrees with the inject script about what a keyword entry means', () => {
  ;(globalThis as any).XMLHttpRequest = FakeXMLHttpRequest
  runInThisContext(`;(() => {\n${injectSource}\n})()`)

  const cases: { content: { keyword: string, remark: string }[], user: { keyword: string, remark: string }[], uid: { keyword: string, remark: string }[] }[] = [
    { content: [{ keyword: '付费', remark: '' }], user: [], uid: [] },
    { content: [{ keyword: '/付费|课程/', remark: '' }], user: [], uid: [] },
    { content: [], user: [{ keyword: '甲', remark: '' }], uid: [] },
    { content: [], user: [{ keyword: '甲乙', remark: '' }], uid: [] },
    { content: [], user: [], uid: [{ keyword: '111', remark: '' }] },
    { content: [{ keyword: '直播间', remark: '' }], user: [], uid: [] },
  ]

  for (const entry of cases) {
    const fromInject = injectSurvivors([], entry.content, entry.user, entry.uid)
      .filter(title => title !== '直播间')
    const fromDom = domSurvivors(entry.content, entry.user, entry.uid)

    expect(fromDom, JSON.stringify(entry)).toEqual(fromInject)
  }
})

it('does the same for types, which both halves decide per result', () => {
  ;(globalThis as any).XMLHttpRequest = FakeXMLHttpRequest
  runInThisContext(`;(() => {\n${injectSource}\n})()`)

  expect(injectSurvivors(['live'], [], [], [])).toEqual(['付费课程', '普通投稿'])

  const root = buildResults()
  purify(root, ['live'])
  expect(isHidden(root, 'cell-live')).toBe(true)
  expect(isHidden(root, 'cell-1')).toBe(false)
})
