import { settings } from '~/logic'

/**
 * 评论区翻译的开关，写在 `<html>` 上给主世界的注入脚本（`src/inject/index.js`）读——
 * 注入脚本是页面上下文里的普通脚本，拿不到扩展的设置，只能这样传，与评论区 IP 属地同一套通道。
 * 翻译请求也由注入脚本自己发：Index-Translate 接口允许跨域读取，页面上下文的 Origin 又不会
 * 撞上 B 站拉黑扩展来源的那条 WAF 规则，用不着 background 中转。模型不设选项，注入脚本里
 * 按 9b → 35b → 2b 自动回退。
 */
export const COMMENT_TRANSLATE_ATTR = 'data-bewly-comment-translate'

export function setupCommentTranslate() {
  const publish = () => {
    document.documentElement.setAttribute(COMMENT_TRANSLATE_ATTR, String(settings.value.commentTranslateEnabled))
  }

  publish()
  watch(
    () => settings.value.commentTranslateEnabled,
    publish,
  )
}
