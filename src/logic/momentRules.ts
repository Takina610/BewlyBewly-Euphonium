import { MOMENTS_TYPE_ITEMS } from '~/constants/momentsTypes'
import { settings } from '~/logic'

/**
 * 动态过滤的判定。这里只做判断，不碰设置也不碰 DOM——同一套规则有两处要用：
 *
 * 1. 动态页、首页那个动态面板、空间动态：它们由 B 站页面自己请求，过滤在注入脚本里做
 *    （`src/inject/index.js`）——那份脚本是要原样拷进扩展的经典脚本，import 不了这里。
 * 2. 本扩展自己的首页「关注」「追番」两个标签页：它们通过后台请求同一份接口，页面世界的钩子
 *    看不见，只能在自己的调用点过滤。
 *
 * 两处的规则必须一致，`src/tests/momentRules.spec.ts` 拿同一份样例同时喂给两边，谁改歪了都会红。
 */

export interface KeywordRow {
  keyword: string
  remark: string
}

export interface MomentRuleConfig {
  types: string[]
  blockInvisible: boolean
  blockJumpAds: boolean
  blockLiveReservation: boolean
  blockPromotions: boolean
  blockVideos: boolean
  keywords: {
    content: KeywordMatcher
    user: KeywordMatcher
    uid: KeywordMatcher
    topic: KeywordMatcher
  } | null
}

interface KeywordMatcher {
  mode: 'contains' | 'exact'
  strings: string[]
  regexps: RegExp[]
}

/** 动态条目的形状只用到这几处，其余字段一律不关心。 */
type MomentItem = Record<string, any>

const TYPE_KEYS = new Set<string>(MOMENTS_TYPE_ITEMS.map(item => item.key))

function compileKeywords(rows: KeywordRow[], mode: 'contains' | 'exact'): KeywordMatcher {
  const strings: string[] = []
  const regexps: RegExp[] = []

  for (const row of Array.isArray(rows) ? rows : []) {
    const keyword = String(row?.keyword ?? '').trim()
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

function isEmptyKeywords(matcher: KeywordMatcher | null): boolean {
  return !matcher || (!matcher.strings.length && !matcher.regexps.length)
}

function matchKeywords(matcher: KeywordMatcher, text: unknown): boolean {
  if (isEmptyKeywords(matcher))
    return false

  const value = String(text ?? '')
  if (!value)
    return false

  const upper = value.toUpperCase()
  if (matcher.mode === 'exact')
    return matcher.strings.includes(upper.trim()) || matcher.regexps.some(re => re.test(value))

  return matcher.strings.some(keyword => upper.includes(keyword)) || matcher.regexps.some(re => re.test(value))
}

/** 按当前设置拼一份规则；什么都没开时返回 null，调用点据此整段跳过。 */
export function currentMomentRules(): MomentRuleConfig | null {
  const keywords = settings.value.momentsFilterKeywords
    ? {
        content: compileKeywords(settings.value.momentsFilterContent, 'contains'),
        user: compileKeywords(settings.value.momentsFilterUser, 'exact'),
        uid: compileKeywords(settings.value.momentsFilterUid, 'exact'),
        topic: compileKeywords(settings.value.momentsFilterTopic, 'contains'),
      }
    : null

  const config: MomentRuleConfig = {
    types: settings.value.momentsBlockedTypes.filter(key => TYPE_KEYS.has(key)),
    blockInvisible: settings.value.momentsBlockInvisible,
    blockJumpAds: settings.value.momentsBlockJumpAds,
    blockLiveReservation: settings.value.momentsBlockLiveReservation,
    blockPromotions: settings.value.momentsBlockPromotions,
    blockVideos: settings.value.momentsBlockVideos,
    keywords: keywords && !Object.values(keywords).every(isEmptyKeywords) ? keywords : null,
  }

  const nothingToDo = !config.types.length && !config.keywords
    && !config.blockInvisible && !config.blockJumpAds && !config.blockLiveReservation
    && !config.blockPromotions && !config.blockVideos

  return nothingToDo ? null : config
}

/** 把一份规则套到一批动态上，返回该留下的。 */
export function filterMomentItems<T extends MomentItem>(items: T[], config: MomentRuleConfig | null): T[] {
  if (!config || !Array.isArray(items))
    return items

  return items.filter(item => !shouldHideMoment(item, config))
}

function modules(item: MomentItem) {
  return (item?.modules ?? {}) as Record<string, any>
}

function dynamic(item: MomentItem) {
  return (modules(item).module_dynamic ?? {}) as Record<string, any>
}

function dynamicType(item: MomentItem): string {
  return String(item?.type ?? '')
}

function majorType(item: MomentItem): string {
  return String(dynamic(item).major?.type ?? '')
}

function additionalType(item: MomentItem): string {
  return String(dynamic(item).additional?.type ?? '')
}

function richTextNodes(item: MomentItem): Record<string, any>[] {
  const desc = dynamic(item).desc
  return Array.isArray(desc?.rich_text_nodes) ? desc.rich_text_nodes : []
}

/** 折叠：接口说这条不是正常显示，或者它是一条「展开 N 条相关动态」。 */
function isFoldedMoment(item: MomentItem): boolean {
  return item.visible === false || !!modules(item).module_fold
}

/** 无权查看：动态失效那条路（`MAJOR_TYPE_NONE`）。 */
function isUnavailableMoment(item: MomentItem): boolean {
  return majorType(item) === 'MAJOR_TYPE_NONE'
}

/** 跳转广告：带货卡与「你可能感兴趣的 UP 主」卡。 */
function isJumpAdMoment(item: MomentItem): boolean {
  if (additionalType(item) === 'ADDITIONAL_TYPE_GOODS' || additionalType(item) === 'ADDITIONAL_TYPE_UP_RCMD')
    return true

  if (dynamic(item).major?.goods)
    return true

  return richTextNodes(item).some(node => node.type === 'RICH_TEXT_NODE_TYPE_GOODS')
}

function isLiveReservationMoment(item: MomentItem): boolean {
  return additionalType(item) === 'ADDITIONAL_TYPE_RESERVE'
}

function isPromotionMoment(item: MomentItem): boolean {
  return dynamicType(item) === 'DYNAMIC_TYPE_AD'
    || !!modules(item).module_ad
    || additionalType(item) === 'ADDITIONAL_TYPE_UP_RCMD'
}

function isVideoMoment(item: MomentItem): boolean {
  return dynamicType(item) === 'DYNAMIC_TYPE_AV' || majorType(item) === 'MAJOR_TYPE_ARCHIVE'
}

/** 屏蔽类型里的一格，与 `src/inject/index.js` 里那张表一格一格对应。 */
function hasBlockedMomentType(item: MomentItem, types: string[]): boolean {
  if (!types.length)
    return false

  const type = dynamicType(item)
  const major = majorType(item)

  for (const key of types) {
    switch (key) {
      case 'forward':
        if (type === 'DYNAMIC_TYPE_FORWARD')
          return true
        break
      case 'video':
        if (isVideoMoment(item))
          return true
        break
      case 'pgc':
        if (type === 'DYNAMIC_TYPE_PGC' || type === 'DYNAMIC_TYPE_PGC_UNION' || major === 'MAJOR_TYPE_PGC')
          return true
        break
      case 'fold':
        if (isFoldedMoment(item))
          return true
        break
      case 'word':
        if (type === 'DYNAMIC_TYPE_WORD')
          return true
        break
      case 'draw':
        if (type === 'DYNAMIC_TYPE_DRAW' || major === 'MAJOR_TYPE_DRAW' || major === 'MAJOR_TYPE_OPUS')
          return true
        break
      case 'article':
        if (type === 'DYNAMIC_TYPE_ARTICLE' || major === 'MAJOR_TYPE_ARTICLE')
          return true
        break
      case 'audio':
        if (type === 'DYNAMIC_TYPE_MUSIC' || major === 'MAJOR_TYPE_MUSIC')
          return true
        break
      case 'live':
        if (type === 'DYNAMIC_TYPE_LIVE' || type === 'DYNAMIC_TYPE_LIVE_RCMD'
          || major === 'MAJOR_TYPE_LIVE' || major === 'MAJOR_TYPE_LIVE_RCMD') {
          return true
        }
        break
      case 'medialist':
        if (type === 'DYNAMIC_TYPE_MEDIALIST' || major === 'MAJOR_TYPE_MEDIALIST')
          return true
        break
      case 'ad':
        if (type === 'DYNAMIC_TYPE_AD')
          return true
        break
      case 'banner':
        if (type === 'DYNAMIC_TYPE_BANNER')
          return true
        break
      case 'ugcSeason':
        if (type === 'DYNAMIC_TYPE_UGC_SEASON' || major === 'MAJOR_TYPE_UGC_SEASON')
          return true
        break
      case 'story':
        // 网页端的动态枚举里没有「故事」，照 App 那边的 stype === 3 来
        if (dynamic(item).major?.archive?.type === 3)
          return true
        break
      case 'topicRcmd':
        if (type === 'DYNAMIC_TYPE_TOPIC_RCMD')
          return true
        break
      case 'courses':
        if (type === 'DYNAMIC_TYPE_COURSES' || type === 'DYNAMIC_TYPE_COURSES_SEASON'
          || type === 'DYNAMIC_TYPE_COURSES_BATCH' || major === 'MAJOR_TYPE_COURSES') {
          return true
        }
        break
    }
  }

  return false
}

/** 正文：本条动态的文字，转发那半边的也算进来。 */
function momentText(item: MomentItem): string {
  const parts = [dynamic(item).desc?.text]
  for (const node of richTextNodes(item))
    parts.push(node.orig_text, node.text)

  const opus = dynamic(item).major?.opus
  if (opus)
    parts.push(opus.title, opus.summary?.text)

  if (item?.orig)
    parts.push(dynamic(item.orig).desc?.text)

  return parts.filter(part => typeof part === 'string' && part).join('\n')
}

function momentTopics(item: MomentItem): string[] {
  const topics: string[] = []
  const topic = dynamic(item).topic
  if (typeof topic?.name === 'string')
    topics.push(topic.name)

  for (const node of richTextNodes(item)) {
    if (node.type !== 'RICH_TEXT_NODE_TYPE_TOPIC')
      continue
    topics.push(String(node.text || node.orig_text || '').replace(/^#+/, '').replace(/#+$/, ''))
  }

  return topics
}

function matchesMomentKeywords(item: MomentItem, keywords: NonNullable<MomentRuleConfig['keywords']>): boolean {
  if (matchKeywords(keywords.content, momentText(item)))
    return true

  const author = modules(item).module_author ?? {}
  if (matchKeywords(keywords.user, author.name))
    return true
  if (matchKeywords(keywords.uid, author.mid == null ? '' : String(author.mid)))
    return true

  return momentTopics(item).some(topic => matchKeywords(keywords.topic, topic))
}

export function shouldHideMoment(item: MomentItem, config: MomentRuleConfig): boolean {
  if (!item || typeof item !== 'object')
    return false

  if (config.blockInvisible && isUnavailableMoment(item))
    return true
  if (config.blockJumpAds && isJumpAdMoment(item))
    return true
  if (config.blockLiveReservation && isLiveReservationMoment(item))
    return true
  if (config.blockPromotions && isPromotionMoment(item))
    return true
  if (config.blockVideos && isVideoMoment(item))
    return true
  if (config.keywords && matchesMomentKeywords(item, config.keywords))
    return true

  return hasBlockedMomentType(item, config.types)
}
