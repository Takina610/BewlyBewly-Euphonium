/**
 * 搜索页净化能清掉的东西。
 *
 * 前九个（`SEARCH_PURIFY_ITEMS`）是搜索页顶部那几块内容，清法是不同的接口：默认关键词来自搜索框的
 * 默认词接口，热搜与发现来自同一个「搜索广场」接口。至于每一键对应哪个接口的哪个字段，由
 * `src/logic/searchFilter.ts` 决定。
 *
 * 后十五个（`SEARCH_RESULT_TYPES`）是搜索结果里按类型清——名字按 B 站自己的枚举写，网页端有的
 * 那几种能真的清掉，网页端没有的（漫画、频道、动态、合集）清不掉，代码里注明了原因。
 */
export const SEARCH_PURIFY_ITEMS = [
  { key: 'words', labelKey: 'settings.search_purify_words' },
  { key: 'trending', labelKey: 'settings.search_purify_trending' },
  { key: 'recommend', labelKey: 'settings.search_purify_recommend' },
]

export type SearchPurifyItemKey = typeof SEARCH_PURIFY_ITEMS[number]['key']

export const SEARCH_RESULT_TYPES = [
  { key: 'hot_banner', labelKey: 'settings.search_type_hot_banner' },
  { key: 'video', labelKey: 'settings.search_type_video' },
  { key: 'related_search', labelKey: 'settings.search_type_related_search' },
  { key: 'game', labelKey: 'settings.search_type_game' },
  { key: 'user', labelKey: 'settings.search_type_user' },
  { key: 'ad', labelKey: 'settings.search_type_ad' },
  { key: 'comic', labelKey: 'settings.search_type_comic' },
  { key: 'channel', labelKey: 'settings.search_type_channel' },
  { key: 'bangumi', labelKey: 'settings.search_type_bangumi' },
  { key: 'subject', labelKey: 'settings.search_type_subject' },
  { key: 'collection', labelKey: 'settings.search_type_collection' },
  { key: 'article', labelKey: 'settings.search_type_article' },
  { key: 'twitter', labelKey: 'settings.search_type_twitter' },
  { key: 'live', labelKey: 'settings.search_type_live' },
  { key: 'ketang', labelKey: 'settings.search_type_ketang' },
]

export type SearchResultTypeKey = typeof SEARCH_RESULT_TYPES[number]['key']
