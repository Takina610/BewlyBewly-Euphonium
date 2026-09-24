import { settings } from '~/logic'

/**
 * 整个评论区都不显示。
 *
 * 评论区是页面自己那颗组件树渲染的（`#commentapp > bili-comments`），扩展的样式表管得到它，但这里
 * 还是交给主世界的注入脚本去做（`src/inject/index.js`）——理由只有一个：它与「IP 属地」那条通道
 * 本来就是一回事，开关写在 `<html>` 上，注入脚本读它、动手，content script 不必再维护第二套样式。
 *
 * 隐藏的选择器与动态页那套分开：动态页的评论区是另一个容器，本模块只管播放页 / 番剧页这一处。
 */
export const COMMENT_CLEANUP_ATTR = 'data-bewly-comment-cleanup'

export function setupCommentCleanup() {
  const publish = () => {
    document.documentElement.setAttribute(COMMENT_CLEANUP_ATTR, JSON.stringify({
      hideSection: settings.value.blockCommentSection,
    }))
  }

  publish()
  watch(() => settings.value.blockCommentSection, publish)
}
