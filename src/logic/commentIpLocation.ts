import { settings } from '~/logic'

/**
 * 评论区 IP 属地的开关，写在 `<html>` 上给主世界的注入脚本（`src/inject/index.js`）读——
 * 注入脚本是页面上下文里的普通脚本，拿不到扩展的设置，只能这样传，与 `data-bewly-clean-url` 同一套做法。
 *
 * 属地本身读不了：评论组件把接口返回的数据挂在页面自己定义的 JS 属性上，
 * 隔离世界看不到页面自定义组件的实例属性，所以读数据、插 DOM 都由主世界的注入脚本负责，
 * 这里只发布开关。
 */
export const COMMENT_IP_LOCATION_ATTR = 'data-bewly-comment-ip-location'

export function setupCommentIpLocation() {
  const publish = () => {
    document.documentElement.setAttribute(COMMENT_IP_LOCATION_ATTR, String(settings.value.showCommentIpLocation))
  }

  publish()
  watch(() => settings.value.showCommentIpLocation, publish)
}
