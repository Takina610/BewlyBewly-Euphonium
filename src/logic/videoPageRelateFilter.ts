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
 * **但视频页的首屏是服务端渲染的**：那次 `archive/related` 是服务端替页面问的，页面自己一次都不问
 * （实测：进视频页时 `archive/related` 没有出现在请求里）。所以这一层只覆盖「页面自己后来问的那几次」
 * ———切视频、播放器续播。首屏那一份要靠：
 * - 「仅 UP 主投稿视频」：推荐卡是 DOM，主链接不指 `/video/BV` 的就不是投稿（见
 *   `videoPageRecommendationFilter.ts` 的 `isNonVideoCard`），不看接口也认得；
 * - 「充电专属」：卡片上真的一点痕迹都没有，只能自己去问一次接口，结果由注入脚本发布到
 *   `<html data-bewly-video-relate-drop>` 上（`src/inject/index.js` 的 `setupRelateDropList`），
 *   推荐位列按 bvid 把它们摘掉。
 *
 * 「移除推广」与「移除所有内容」不在这里：推广卡是页面自己插进 DOM 的（接口里没有），
 * 由 `src/logic/videoPageRecommendationFilter.ts` 按卡片类名处理。
 *
 * 开关写在 `<html>` 上给注入脚本读，与评论区那套同一通道。
 */
export const VIDEO_RELATE_FILTER_ATTR = 'data-bewly-video-relate-filter'
/** 注入脚本问出来的「该摘掉的 bvid」名单，形如 `["BV1…"]`。 */
export const VIDEO_RELATE_DROP_ATTR = 'data-bewly-video-relate-drop'

/** 读注入脚本发布的那份名单；读不懂就当它不存在。 */
export function parseRelateDropList(raw: string | null | undefined): string[] {
  if (!raw)
    return []

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []
  }
  catch {
    return []
  }
}

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
