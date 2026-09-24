import { settings } from '~/logic'

/**
 * 动态页过滤的开关、屏蔽类型与四条关键词名单。
 *
 * 过滤本身在页面那层做：动态流是页面自己请求的（`/x/polymer/web-dynamic/v1/feed/…`），条目从响应
 * 的 `items` 里丢掉就谁也看不见了——首页那个动态面板、动态页、空间动态走的都是同一个接口，所以这
 * 一份设置在所有会出现动态的地方都作数。注入脚本读的是 `<html>` 上的一串 JSON，与评论过滤共用同一
 * 套通道（`src/inject/index.js`）。
 */
export const MOMENTS_FILTER_ATTR = 'data-bewly-moments-filter'

export function setupMomentsFilter() {
  const publish = () => {
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
  }

  publish()
  watch(
    () => [
      settings.value.momentsBlockedTypes,
      settings.value.momentsBlockInvisible,
      settings.value.momentsBlockJumpAds,
      settings.value.momentsBlockLiveReservation,
      settings.value.momentsBlockPromotions,
      settings.value.momentsBlockVideos,
      settings.value.momentsFilterKeywords,
      settings.value.momentsFilterContent,
      settings.value.momentsFilterUser,
      settings.value.momentsFilterUid,
      settings.value.momentsFilterTopic,
    ],
    publish,
    { deep: true },
  )
}
