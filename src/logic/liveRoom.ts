import type { LiveCleanupKey } from '~/constants/liveCleanup'
import { settings } from '~/logic'

/**
 * 直播间的净化：藏掉那些浮窗、去掉水印、默认原画。
 *
 * 藏东西一律用样式表，不拆 DOM：这些浮窗是 B 站自己的模块渲染出来的，拆掉之后它再渲染一遍还得再拆，
 * 而 `display:none` 一条规则跟到底。这里的选择器来自三份网页端脚本与直播间自己的代码（B 站 App 那份
 * 清单里有些项在网页端并不存在，那些按最接近的结构写，代码里都标了）。
 *
 * 默认原画要在主世界改请求：播放地址是页面自己求的（`getRoomPlayInfo`，进直播间时 `qn=0` 让它自己
 * 挑），只有把那个 0 换成 10000 才是原画。开关写在 `<html>` 上给注入脚本读，与评论区那套同一通道。
 */

/** 直播间页面的开关，主世界的注入脚本按它决定要不要改画质请求。 */
export const LIVE_QUALITY_ATTR = 'data-bewly-live-original-quality'

/**
 * 每一项要藏的选择器。键与 `src/constants/liveCleanup.ts` 一一对应。
 *
 * 这份清单里标了「网页端没有」的那几项，B 站网页端不一定有对应节点：它们来自 B 站 App 那边的一份
 * 浮窗清单，网页端只对上其中一部分（其余选择器是照最接近的已验证结构写的）。2026-09-23 在
 * `live.bilibili.com/22637261` 上实测过一遍：购物卡片（`#shop-popover-vm`）、关注提醒
 * （`#welcome-area-bottom-vm`）、投喂支持（`#gift-control-vm`）、滚动横幅、+1、游戏卡与水印都在。
 */
export const LIVE_CLEANUP_SELECTORS: Record<LiveCleanupKey, string[]> = {
  // 购物卡片：网页端就是播放器角上那张购物卡（App 里的「购物卡片」没有对应的网页节点）
  shoppingCard: ['#shop-popover-vm', '.z-shop-popover-vm'],
  // 购物精选：网页端没有这一项，按同类结构留着
  shoppingPicks: ['.shop-picks', '.z-shop-picks', '#shop-picks-vm'],
  // 关注提醒：只藏欢迎条，不动关注按钮——那按钮是用户要用的，不是浮窗
  followReminder: ['#welcome-area-bottom-vm', '.welcome-area-bottom'],
  // 直播预约：网页端没有已验证的节点
  reservation: ['#reserve-vm', '.reserve-card', '.z-reserve-card', '.reserve-popover'],
  // 投喂支持：整个礼物面板（连同充值、上船那几行）
  giftSupport: ['#gift-control-vm'],
  scrollingBanner: ['.announcement-wrapper', '.web-player-inject-wrap .announcement-wrapper', '.activity-pushing-out'],
  // 电池任务：实测直播间里那个入口是 `task-gather-entry`（旁边就是 `battery-icon`）
  batteryTask: ['.section-block.battery-block', '.task-gather-entry'],
  // 正在去买：播放器左上角那个小橙车
  buyingNow: ['div.shop-popover'],
  giftPlanet: ['.gift-planet__main', '#head-info-vm .gift-planet-entry', 'div.gift-planet-entry'],
  playTogether: ['.play-together-service-card-container', '.play-together-entry', '#player-together-wrap-vm'],
  // 各种 +1：网页端没有已验证的节点，按点赞动画那个挂载点留着
  plusOne: ['#like-moment-animation-vm'],
  wish: ['.gift-wish-card-root', '.gift-control-panel .wish-icon', '.gift-control-panel .wish-tip'],
  // 直播效果打分：网页端没有已验证的节点，按播放器那套反馈弹窗的名字留着
  effectRating: ['#qoe-feedback-vm', '.qoe-feedback', '.bpx-player-qoeFeedback', '.bpx-player-qoeFeedback-score'],
  voteDanmaku: ['#aside-area-vm .vote-card', '.vote-card', 'div.bili-danmaku-x-vote'],
  gameCard: ['#game-id', '#interactive-play-vm', '#lol-left-panel-vm', '#lol-right-panel-vm', '#lol-bottom-panel-vm', '#multi-voice-index', '#link-mic-vm'],
}

/** 水印：直播间左上角那枚状态标与播放器自己的 logo（画在画面里的那层是 canvas，样式管不到）。 */
export const LIVE_WATERMARK_SELECTORS = [
  '.player-ctnr .web-player-icon-roomStatus',
  '.live-player-ctnr .web-player-icon-roomStatus',
  '.bilibili-live-player-video-logo',
]

/** 实名认证弹窗没有固定的类名可依，只能在短文本的弹层里认它。 */
const REAL_NAME_TEXT_RE = /实名认证|实名验证|实名信息/
/** 认到一个弹层时它的文字最长这么长；再长的多半是聊天区，不动。 */
const REAL_NAME_MAX_TEXT = 300
const REAL_NAME_SELECTOR = '[class*="dialog"], [class*="modal"], [class*="popup"], [class*="layer"], [role="dialog"]'
const REAL_NAME_HIDDEN_ATTR = 'data-bewly-real-name-hidden'
/** 多久看一遍弹窗。这类弹层是按需弹出来的，没有可挂的锚点。 */
const REAL_NAME_SCAN_INTERVAL = 2000

/**
 * 按当前设置拼出要注入的样式。给测试用，也让人一眼看得出开关落在哪几条规则上。
 */
export function buildLiveCleanupStyle(options: {
  items: string[]
  removeWatermark: boolean
}): string {
  const rules: string[] = []

  for (const key of options.items) {
    for (const selector of LIVE_CLEANUP_SELECTORS[key] ?? [])
      rules.push(`${selector} { display: none !important; }`)
  }

  if (options.removeWatermark) {
    // 水印是画在播放器里的，只能藏不能拆：拆了播放器下次渲染还会画回来
    rules.push(`${LIVE_WATERMARK_SELECTORS.join(', ')} { display: none !important; }`)
  }

  // 实名认证弹窗是认出来之后临时挂上属性的，规则一直留着，谁挂上谁就消失
  rules.push(`[${REAL_NAME_HIDDEN_ATTR}] { display: none !important; }`)

  return rules.join('\n')
}

export function setupLiveRoom() {
  const styleEl = document.createElement('style')
  styleEl.id = 'bewly-live-cleanup'
  document.documentElement.appendChild(styleEl)

  function publish() {
    styleEl.textContent = buildLiveCleanupStyle({
      items: settings.value.liveCleanupItems,
      removeWatermark: settings.value.liveRemoveWatermark,
    })
    document.documentElement.setAttribute(LIVE_QUALITY_ATTR, String(settings.value.liveDefaultOriginalQuality))
  }

  /** 短文本的弹层里出现「实名认证」就当它是那个弹窗。 */
  function scanRealNameDialogs() {
    if (!settings.value.liveBlockRealNameDialog)
      return

    for (const el of Array.from(document.querySelectorAll<HTMLElement>(REAL_NAME_SELECTOR))) {
      if (el.hasAttribute(REAL_NAME_HIDDEN_ATTR))
        continue

      const text = el.textContent ?? ''
      if (text.length > REAL_NAME_MAX_TEXT || !REAL_NAME_TEXT_RE.test(text))
        continue

      el.setAttribute(REAL_NAME_HIDDEN_ATTR, '1')
    }
  }

  publish()
  watch(
    () => [
      settings.value.liveCleanupItems,
      settings.value.liveRemoveWatermark,
      settings.value.liveDefaultOriginalQuality,
    ],
    publish,
    { deep: true },
  )

  const guard = window.setInterval(scanRealNameDialogs, REAL_NAME_SCAN_INTERVAL)
  scanRealNameDialogs()

  return () => {
    window.clearInterval(guard)
    styleEl.remove()
  }
}
