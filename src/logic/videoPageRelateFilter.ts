import { settings } from '~/logic'

/**
 * 视频下方推荐位里那两件只能在数据层做的事。
 *
 * 推荐位是页面自己请求的（`/x/web-interface/archive/related`），充电专属与「不是投稿视频」这两件事
 * 只有接口那份数据说得清：
 * - 充电专属的视频，接口条目上带着 `charging_pay`（实测：普通条目没有这个字段）；
 * - 投稿之外的内容（番剧、课程等），接口条目上 `ai_rcmd.goto` 不是 `av`，另外还有 `is_ogv`。
 * 这两件事在渲染出来的卡片上都没有痕迹（卡片长得一模一样），所以只能在这一层清。
 *
 * 「移除推广」与「移除所有内容」不在这里：推广卡是页面自己插进 DOM 的（接口里没有），
 * 由 `src/logic/videoPageRecommendationFilter.ts` 按卡片类名处理。
 *
 * 开关写在 `<html>` 上给注入脚本读，与评论区那套同一通道。
 */
export const VIDEO_RELATE_FILTER_ATTR = 'data-bewly-video-relate-filter'

export function setupVideoPageRelateFilter() {
  const publish = () => {
    document.documentElement.setAttribute(VIDEO_RELATE_FILTER_ATTR, JSON.stringify({
      chargeExclusive: settings.value.videoPageRemoveChargeExclusiveVideo,
      onlyUploader: settings.value.videoPageOnlyUploaderVideos,
    }))
  }

  publish()
  watch(
    () => [
      settings.value.videoPageRemoveChargeExclusiveVideo,
      settings.value.videoPageOnlyUploaderVideos,
    ],
    publish,
  )
}
