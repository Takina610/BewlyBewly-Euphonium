import { settings } from '~/logic'

/**
 * 评论区过滤的开关与四条名单。
 *
 * 过滤本身在页面自己那层做：评论（含楼中楼）是页面用 XHR 拉的，返回的 JSON 里带着内容、UP 主名
 * 和 UID——UID 在 DOM 上根本拿不到，所以只能在这一层拦。注入脚本读不到扩展的设置，只能读
 * `<html>` 上的一串 JSON，这套通道与评论区 IP 属地、弹幕等级共用（`src/inject/index.js`）。
 *
 * 名单里的一行可以是普通关键词，也可以写成 `/正则/`，与首页那两个黑名单同一套写法。
 */
export const COMMENT_FILTER_ATTR = 'data-bewly-comment-filter'

export function setupCommentFilter() {
  const publish = () => {
    document.documentElement.setAttribute(COMMENT_FILTER_ATTR, JSON.stringify({
      enabled: settings.value.enableCommentFilter,
      onlyAt: settings.value.commentFilterOnlyAt,
      goods: settings.value.commentFilterGoods,
      content: settings.value.commentFilterContent,
      user: settings.value.commentFilterUser,
      uid: settings.value.commentFilterUid,
      topic: settings.value.commentFilterTopic,
    }))
  }

  publish()
  // 名单是就地改的（新增、删除、编辑），deep 才能看见
  watch(
    () => [
      settings.value.enableCommentFilter,
      settings.value.commentFilterOnlyAt,
      settings.value.commentFilterGoods,
      settings.value.commentFilterContent,
      settings.value.commentFilterUser,
      settings.value.commentFilterUid,
      settings.value.commentFilterTopic,
    ],
    publish,
    { deep: true },
  )
}
