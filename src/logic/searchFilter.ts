import { settings } from '~/logic'

/**
 * 搜索页净化：清掉搜索页顶部那几块（默认关键词、热搜、发现），再按类型、按关键词清搜索结果。
 *
 * 三件事都在数据层做——搜索结果是页面自己请求的，清在响应里谁也看不见；而且「结果是不是广告」
 * 「UP 主的 UID 是多少」这些在渲染出来的卡片上读不到，只有接口那份数据说得清。注入脚本读不到
 * 扩展的设置，所以这里把开关与三条名单序列化成 JSON 写在 `<html>` 上，与评论过滤共用同一套通道
 * （`src/inject/index.js`）。
 *
 * 名单里的一行可以是普通关键词，也可以写成 `/正则/`，与评论区的名单同一套写法。
 */
export const SEARCH_FILTER_ATTR = 'data-bewly-search-filter'

export function setupSearchFilter() {
  const publish = () => {
    document.documentElement.setAttribute(SEARCH_FILTER_ATTR, JSON.stringify({
      purify: settings.value.searchPurifyItems,
      types: settings.value.searchBlockedTypes,
      enabledKeywords: settings.value.searchFilterKeywords,
      content: settings.value.searchFilterContent,
      user: settings.value.searchFilterUser,
      uid: settings.value.searchFilterUid,
    }))
  }

  publish()
  // 名单是就地改的（新增、删除、编辑），deep 才能看见
  watch(
    () => [
      settings.value.searchPurifyItems,
      settings.value.searchBlockedTypes,
      settings.value.searchFilterKeywords,
      settings.value.searchFilterContent,
      settings.value.searchFilterUser,
      settings.value.searchFilterUid,
    ],
    publish,
    { deep: true },
  )
}
