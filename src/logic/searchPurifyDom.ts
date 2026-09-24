import { settings } from '~/logic'

/**
 * 搜索结果页的净化，第二半。
 *
 * 第一半在注入脚本里（`src/logic/searchFilter.ts` 发开关、`src/inject/index.js` 改接口响应），它管的是
 * 页面自己请求的那些结果。但**搜索结果页的首屏是服务端渲染的**：那次请求根本不经过页面，注入脚本
 * 没有响应可改，于是首屏永远是原样，只有切 tab / 翻页（走接口）之后才生效。
 *
 * 所以这里按渲染出来的节点再滤一遍，两条路互补：
 * - 服务端渲染的首屏：靠这一半；
 * - 切 tab、翻页、改排序：接口那一半本来就能管，这一半照样会滤（同一批卡片）。
 *
 * **锚点是卡片本身（`.bili-video-card`），不是它外面的格子**：那种格子的类名随渲染来源而变——服务端
 * 那份是 `div.col_3 col_xs_1_5 …`，客户端渲染出来的是 `.video-list-item`（实测：同一个关键词，
 * 首屏 42 张卡片的父元素全是 `col_*`，而 `.video-list-item` 一个都没有）。钉住卡片、把它的父元素当成
 * 那一格来藏，两种形状都盖得住。
 *
 * 类型过滤进注入的样式表（`:has()`，首屏不闪）；关键词过滤只能在卡片渲染出文字之后读，走一次 JS 扫描。
 */

export interface KeywordMatcher {
  mode: 'contains' | 'exact'
  strings: string[]
  regexps: RegExp[]
}

/** 名单里的一行。与首页、评论区那几张表同一形状。 */
export interface KeywordRow {
  keyword: string
  remark: string
}

/** 与注入脚本同一套写法：一行是普通关键词，写成 `/…/` 就是正则。 */
export function compileKeywords(rows: KeywordRow[] | undefined, mode: 'contains' | 'exact'): KeywordMatcher {
  const strings: string[] = []
  const regexps: RegExp[] = []

  for (const row of Array.isArray(rows) ? rows : []) {
    const keyword = String((row && row.keyword) || '').trim()
    if (!keyword)
      continue

    if (keyword.length > 2 && keyword.startsWith('/') && keyword.endsWith('/')) {
      try {
        regexps.push(new RegExp(keyword.slice(1, -1), 'i'))
      }
      catch {}
    }
    else {
      strings.push(keyword.toUpperCase())
    }
  }

  return { mode, strings, regexps }
}

export function isEmptyMatcher(matcher: KeywordMatcher | null | undefined): boolean {
  return !matcher || (!matcher.strings.length && !matcher.regexps.length)
}

export function matchesKeywords(matcher: KeywordMatcher | null | undefined, text: unknown): boolean {
  if (isEmptyMatcher(matcher))
    return false

  const value = String(text == null ? '' : text)
  if (!value)
    return false

  const upper = value.toUpperCase()
  if (matcher!.mode === 'exact')
    return matcher!.strings.includes(upper.trim()) || matcher!.regexps.some(re => re.test(value))

  return matcher!.strings.some(keyword => upper.includes(keyword)) || matcher!.regexps.some(re => re.test(value))
}

/** 按设置拼出的样式表挂在这个 id 上；被藏起来的格子挂 `HIDDEN_CLASS`。 */
export const PURIFY_STYLE_ID = 'bewly-search-purify'
export const HIDDEN_CLASS = 'bewly-search-filtered'

/** 一条结果的骨架。 */
const CARD_SELECTOR = '.bili-video-card'

/**
 * 整个区块拿掉的那些结果（各自有固定容器）。键与设置里的类型一一对应
 * （`src/constants/searchPurify.ts`）。
 */
export const SEARCH_BLOCK_SELECTORS: { type: string, selector: string }[] = [
  { type: 'ad', selector: '.brand-ad-list' },
  { type: 'user', selector: '.user-list' },
  { type: 'user', selector: '.video-card-content' },
  { type: 'bangumi', selector: '.bangumi-pgc-list' },
]

/**
 * 一条结果里的标记 → 那条结果。标记是卡片**里面**的东西，藏的是它所在的那一格。
 *
 * 网页端搜不到的类型（漫画、频道、合集、话题、动态）也按 B 站自己的域名/路径写着——出现了就能滤掉，
 * 没出现就什么都不做。搜不到的两种（相关搜索、热搜横幅以外的部分）在这一层没有对应节点。
 */
export const SEARCH_CARD_MARKERS: { type: string, marker: string }[] = [
  { type: 'ad', marker: '.bili-video-card__info--ad' },
  { type: 'ad', marker: '[href*="cm.bilibili.com"]' },
  { type: 'live', marker: '[href*="live.bilibili.com"]' },
  { type: 'ketang', marker: '.bili-video-card__info--cheese' },
  { type: 'article', marker: '[href*="/read/cv"]' },
  { type: 'twitter', marker: '[href*="t.bilibili.com"]' },
  { type: 'comic', marker: '[href*="manga.bilibili.com"]' },
  { type: 'collection', marker: '[href*="/medialist/"]' },
  { type: 'subject', marker: '[href*="/topic/"]' },
  // 投稿视频：卡片的主链接指着 /video/BV 的就是它
  { type: 'video', marker: 'a[href*="/video/BV"]' },
]

/** 顶部那块活动卡与游戏卡：它们在同一个容器里，各有各的标记。 */
export const SEARCH_ACTIVITY_MARKERS: { type: string, marker: string }[] = [
  { type: 'hot_banner', marker: '.activity-card' },
  { type: 'game', marker: '.game-card' },
]

/** 按设置拼出样式表：类型过滤这一半靠它，首屏因此不会先露一下再消失。 */
export function buildSearchPurifyCss(blockedTypes: string[]): string {
  const rules: string[] = []
  const set = new Set(blockedTypes)

  rules.push(`.${HIDDEN_CLASS} { display: none !important; }`)

  for (const block of SEARCH_BLOCK_SELECTORS) {
    if (set.has(block.type))
      rules.push(`${block.selector} { display: none !important; }`)
  }

  for (const item of SEARCH_CARD_MARKERS) {
    if (set.has(item.type))
      rules.push(`${CARD_SELECTOR}:has(${item.marker}) { display: none !important; }`)
  }

  for (const item of SEARCH_ACTIVITY_MARKERS) {
    if (set.has(item.type))
      rules.push(`.activity-game-list-item:has(${item.marker}) { display: none !important; }`)
  }

  // 活动与游戏共用一块：两块都被滤掉时，把空掉的外壳也去掉（只滤一块时外壳里还有另一块）
  if (set.has('hot_banner') && set.has('game'))
    rules.push('.activity-game-list { display: none !important; }')

  return rules.join('\n')
}

/** 一条结果上能读到的关键词素材：标题、UP 主名、UID。 */
export interface SearchResultTexts {
  title: string
  user: string
  uid: string
}

/**
 * 从一张卡片里读关键词素材。UP 主名与 UID 都能拿到：作者名在
 * `.bili-video-card__info--author` 里，它的外层链接指向 `space.bilibili.com/<mid>`。
 */
export function readSearchResultTexts(el: Element): SearchResultTexts {
  const ownerHref = el.querySelector('a[href*="space.bilibili.com"]')?.getAttribute('href') ?? ''

  return {
    title: el.querySelector('.bili-video-card__info--tit')?.textContent?.trim() ?? '',
    user: el.querySelector('.bili-video-card__info--author')?.textContent?.trim() ?? '',
    uid: ownerHref.match(/(\d+)/)?.[1] ?? '',
  }
}

export interface SearchKeywordMatchers {
  content: KeywordMatcher
  user: KeywordMatcher
  uid: KeywordMatcher
}

/** 一条结果是否命中关键词名单。 */
export function matchesSearchKeywords(texts: SearchResultTexts, matchers: SearchKeywordMatchers | null): boolean {
  if (!matchers)
    return false
  if (matchesKeywords(matchers.content, texts.title))
    return true
  if (matchesKeywords(matchers.user, texts.user))
    return true

  return matchesKeywords(matchers.uid, texts.uid)
}

export interface SearchPurifyOptions {
  blockedTypes: string[]
  keywords: SearchKeywordMatchers | null
}

/**
 * 一个标记元素所在的那条结果。卡片按卡片算（藏它的父元素——也就是那一格），活动卡按它那一格算；
 * 别的页面模板（专栏、用户、番剧那几套）退一步：往上走到某张列表的直接子元素为止，最多四层。
 */
export function resultCell(el: HTMLElement): HTMLElement {
  const card = el.closest<HTMLElement>(CARD_SELECTOR)
  if (card)
    return card.parentElement ?? card

  const activityItem = el.closest<HTMLElement>('.activity-game-list-item')
  if (activityItem)
    return activityItem

  // 兜底：往上一层一层找「某张列表的直接子元素」。走不动就返回标记本身
  let node = el
  for (let depth = 0; depth < 4; depth++) {
    const parent = node.parentElement
    if (!parent || parent === document.body || parent === document.documentElement || parent.id === 'app')
      return el
    if (/(?:^|\s)[\w-]*list\b|search-all-list/.test(String(parent.className || '')))
      return node
    node = parent
  }

  return el
}

function hide(el: HTMLElement) {
  el.classList.add(HIDDEN_CLASS)
}

function restore(el: HTMLElement) {
  el.classList.remove(HIDDEN_CLASS)
}

/**
 * 走一遍渲染出来的结果：命中类型的整条拿掉，命中关键词的也拿掉，其余的交回来。
 *
 * 是幂等的（本来该藏的藏、不该藏的恢复），所以每次 DOM 变动都能整片重跑一遍，不必记账谁是谁。
 */
export function purifySearchResults(root: ParentNode, options: SearchPurifyOptions): void {
  const blocked = new Set(options.blockedTypes)
  const candidates = new Set<HTMLElement>()

  for (const block of SEARCH_BLOCK_SELECTORS) {
    if (!blocked.has(block.type))
      continue
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(block.selector)))
      candidates.add(el)
  }

  for (const item of SEARCH_CARD_MARKERS) {
    if (!blocked.has(item.type))
      continue
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(item.marker)))
      candidates.add(resultCell(el))
  }

  for (const item of SEARCH_ACTIVITY_MARKERS) {
    if (!blocked.has(item.type))
      continue
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(item.marker)))
      candidates.add(resultCell(el))
  }

  // 关键词只看一条条的结果
  if (options.keywords) {
    for (const card of Array.from(root.querySelectorAll<HTMLElement>(CARD_SELECTOR))) {
      if (matchesSearchKeywords(readSearchResultTexts(card), options.keywords))
        candidates.add(resultCell(card))
    }
  }

  // 先把这次不该藏的恢复（改设置之后要能回来），再藏该藏的
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(`.${HIDDEN_CLASS}`))) {
    if (!candidates.has(el))
      restore(el)
  }
  for (const el of candidates)
    hide(el)

  // 活动与游戏共用一块：两条都滤掉之后，把空掉的外壳一起收掉
  for (const wrap of Array.from(root.querySelectorAll<HTMLElement>('.activity-game-list-wrap'))) {
    const items = Array.from(wrap.querySelectorAll<HTMLElement>('.activity-game-list-item'))
    const allHidden = items.length > 0 && items.every(item => item.classList.contains(HIDDEN_CLASS))
    const block = wrap.closest<HTMLElement>('.activity-game-list')
    if (!block)
      continue

    if (allHidden)
      hide(block)
    else if (block.classList.contains(HIDDEN_CLASS) && !blocked.has('hot_banner') && !blocked.has('game'))
      restore(block)
  }
}

/** 关键词那一半的名单：开关关着、或者三张名单都空着，就是 null（不做这件事）。 */
function currentKeywordMatchers(): SearchKeywordMatchers | null {
  if (!settings.value.searchFilterKeywords)
    return null

  const matchers = {
    content: compileKeywords(settings.value.searchFilterContent, 'contains'),
    user: compileKeywords(settings.value.searchFilterUser, 'exact'),
    uid: compileKeywords(settings.value.searchFilterUid, 'exact'),
  }

  return Object.values(matchers).every(isEmptyMatcher) ? null : matchers
}

/** 什么都没配时，连扫都不用扫（见 `setupSearchPurifyDom` 里的说明）。 */
function nothingConfigured(blockedTypes: string[], keywords: SearchKeywordMatchers | null): boolean {
  return !blockedTypes.length && !keywords && !document.querySelector(`.${HIDDEN_CLASS}`)
}

/** 首屏之后还要盯一会儿的时长：Vue 补水/补渲染会把我们挂的类抹掉，这一段时间里补回来。 */
const SETTLE_TICKS = 15
const SETTLE_INTERVAL = 1000

/**
 * 搜索结果页上装这一套。类型过滤进样式表（首屏不闪），关键词过滤走扫描；
 * 页面是服务端渲染 + 客户端补渲染的混合体，所以扫描挂在 DOM 变动上，另外还有一小段定时兜底——
 * 补水（hydration）会按它自己的模板重写 class，我们挂上去的那个类会被抹掉，而那次重写不一定产生
 * 「子节点变动」，光靠观察器补不回来。
 */
export function setupSearchPurifyDom() {
  if (!/^https?:\/\/search\.bilibili\.com/.test(location.href))
    return

  const styleEl = document.createElement('style')
  styleEl.id = PURIFY_STYLE_ID
  document.documentElement.appendChild(styleEl)

  const apply = () => {
    const blockedTypes = settings.value.searchBlockedTypes
    const keywords = currentKeywordMatchers()
    styleEl.textContent = buildSearchPurifyCss(blockedTypes)

    // 什么都没配（默认状态）就不扫：这张页面 DOM 变动很频繁，而没配规则时扫一遍什么也读不到。
    // 已经藏过东西的页面仍然要扫一次，否则那些格子就回不来了。
    if (nothingConfigured(blockedTypes, keywords))
      return

    purifySearchResults(document, { blockedTypes, keywords })
  }

  // 一次变更一批：服务端那份 HTML 是一个节点一个节点解析进来的，逐条跑太碎
  let frame = 0
  const schedule = () => {
    if (frame)
      return
    frame = requestAnimationFrame(() => {
      frame = 0
      apply()
    })
  }

  apply()
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true })

  let ticks = 0
  const settle = window.setInterval(() => {
    apply()
    if (++ticks >= SETTLE_TICKS)
      window.clearInterval(settle)
  }, SETTLE_INTERVAL)

  watch(
    () => [
      settings.value.searchBlockedTypes,
      settings.value.searchFilterKeywords,
      settings.value.searchFilterContent,
      settings.value.searchFilterUser,
      settings.value.searchFilterUid,
    ],
    schedule,
    { deep: true },
  )
}
