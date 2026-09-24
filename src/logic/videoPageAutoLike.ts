import { settings } from '~/logic'

/**
 * 进视频页自动点赞：按钮自己点一下，赞过之后不再碰。
 *
 * 这里最要紧的一条是**点之前必须先知道视频是不是已经赞过**：B 站那枚按钮是个开关，赞过之后带上
 * `.on`，点反了就是把用户的赞取消掉。
 *
 * 那个答案不在 DOM 里——未赞的视频在页面拿到三元组状态前后长得一模一样。网页端自己的答案来自
 * `/x/web-interface/archive/relation`，而且它**只在登录时才发这个请求**（页面里 `getTripleState`
 * 先看 `userInfo.isLogin`）。所以状态由主世界的注入脚本盯着页面那次请求的响应发布到 `<html>` 上
 * （`src/inject/index.js`），这里只读它：
 * - 没有状态（没登录，或页面还没问）→ 什么都不做。顺带避开了「页面还没拿到登录态就点」的竞态：
 *   那时候 B 站只会弹一个登录框，赞也不会点上。
 * - 状态说已经赞过 → 收工，绝不再点。
 * - 状态说没赞过 → 点一下，一个视频只点一次。
 *
 * 一个视频只点一次，即使它在 SPA 里被来回打开：用户手动取消的赞不会被这里补回来。
 */

/** 状态发布在 `<html>` 上，形如 `{"bvid":"BV1…","like":false}`。 */
export const AUTO_LIKE_ATTR = 'data-bewly-autolike'
/** 点赞按钮：工具栏左边那一枚。 */
export const LIKE_BUTTON_SELECTOR = '.video-toolbar-left .video-like'
/** 赞过之后 B 站自己挂上的类名。 */
const LIKED_CLASS = 'on'
/** 这一枚按钮当前不可用时（比如稿件被锁定）B 站挂的类名。 */
const DISABLED_CLASS = 'disable'
/** 多久看一遍按钮与状态。工具栏比播放器先出来，但也可能被 SPA 换掉。 */
const SCAN_INTERVAL = 1000

export interface AutoLikeState {
  bvid: string
  like: boolean
}

/** 当前地址里的视频号。取不到就返回空串（这时候不该动）。 */
export function currentBvid(href: string): string {
  return href.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1] ?? ''
}

/** 读页面发布的状态；读不懂就当作「还不知道」。 */
export function parseAutoLikeState(raw: string | null | undefined): AutoLikeState | null {
  if (!raw)
    return null

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object')
      return null
    if (typeof parsed.bvid !== 'string' || typeof parsed.like !== 'boolean')
      return null

    return { bvid: parsed.bvid, like: parsed.like }
  }
  catch {
    return null
  }
}

/** 这枚按钮现在是什么情况：没渲染出来 / 已赞 / 现在点不了 / 可以点。 */
export function likeButtonState(button: Element | null): 'missing' | 'liked' | 'disabled' | 'ready' {
  if (!button)
    return 'missing'
  if (button.classList.contains(LIKED_CLASS))
    return 'liked'
  if (button.classList.contains(DISABLED_CLASS))
    return 'disabled'

  return 'ready'
}

export function setupVideoPageAutoLike() {
  /** 已经处理过的视频号：点过的、以及页面说早就赞过的。 */
  const handled = new Set<string>()

  function tick() {
    if (!settings.value.videoPageAutoLike)
      return

    const bvid = currentBvid(location.href)
    if (!bvid || handled.has(bvid))
      return

    // 页面自己问出来的状态。没拿到就不动：没登录，或者它还没问
    const state = parseAutoLikeState(document.documentElement.getAttribute(AUTO_LIKE_ATTR))
    if (!state || state.bvid !== bvid)
      return

    if (state.like) {
      handled.add(bvid)
      return
    }

    const button = document.querySelector<HTMLElement>(LIKE_BUTTON_SELECTOR)
    const buttonState = likeButtonState(button)

    // 没渲染出来、或者现在点不了（稿件被锁之类）：等下一拍再看
    if (buttonState === 'missing' || buttonState === 'disabled')
      return

    if (buttonState === 'liked') {
      // 页面自己已经显示赞过了，别跟它拧着来
      handled.add(bvid)
      return
    }

    handled.add(bvid)
    button?.click()
  }

  const guard = window.setInterval(tick, SCAN_INTERVAL)
  tick()

  return () => window.clearInterval(guard)
}
