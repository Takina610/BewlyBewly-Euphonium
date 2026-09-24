import type { VideoPopupKey } from '~/constants/videoPagePopups'
import { settings } from '~/logic'

/**
 * 视频页的净化：清掉播放器里的浮窗、UP 主卡片上的充电按钮、预约卡，以及视频下方的活动条。
 *
 * 藏东西一律用样式表，不拆 DOM：这些浮窗是播放器自己渲染的，拆掉之后它下次渲染还得再拆，
 * 而 `display:none` 一条规则跟到底（与直播间净化同一套做法）。
 *
 * 这几格就是播放器认的那几个弹幕动作（`#VOTE#`、`#ATTENTION#`、`#GRADE#`、`#GRADESUMMARY#`、
 * `#LINK#`，以及剩下的那几种），与 B 站 App 那边的弹幕类型一一对应（投票 9、关注 5、评分 11、
 * 评分总结 12、关联视频 2）。
 *
 * 类名有两套：现在的播放器渲染的是 `bili-danmaku-x-*`（2026-09-24 在播放器包里逐个查过，
 * 见下表的注释），几个老版本用的是短一点的 `bili-*`。两套都留着——播放器版本是分流的，
 * 而多一条 `display:none` 不会碍事。
 */

/** 每一种浮窗要藏的节点。键与 `src/constants/videoPagePopups.ts` 一一对应。 */
export const VIDEO_POPUP_SELECTORS: Record<VideoPopupKey, string[]> = {
  // 投票弹幕
  vote: ['.bili-danmaku-x-vote', '.bili-danmaku-x-voted', '.bili-vote'],
  // 三连关注弹幕：关注、一键三连、已关注、催充电，整套引导都算
  attention: [
    '.bili-danmaku-x-guide',
    '.bili-danmaku-x-guide-all',
    '.bili-danmaku-x-guide-animate',
    '.bili-danmaku-x-guide-canCancel',
    '.bili-danmaku-x-guide-cyc',
    '.bili-danmaku-x-guide-electric',
    '.bili-danmaku-x-guide-follow',
    '.bili-danmaku-x-guide-followed',
    '.bili-danmaku-x-guide-gray',
    '.bili-danmaku-x-guide-init-three',
    '.bili-danmaku-x-guide-three',
    '.bili-danmaku-x-guide-three-animate',
    '.bili-danmaku-x-follow-to-electric',
    '.bili-guide',
    '.bili-guide-all',
    '.bili-guide-animate',
    '.bili-guide-cyc',
    '.bili-guide-electric',
    '.bili-guide-follow',
    '.bili-guide-followed',
    '.bili-follow-to-electric',
  ],
  // 评分弹幕（superRating 是同一件事的另一种卡）
  grade: ['.bili-danmaku-x-score', '.bili-danmaku-x-score-area', '.bili-danmaku-x-superRating', '.bili-score'],
  // 评分总结弹幕
  gradeSummary: ['.bili-danmaku-x-scoreSum', '.bili-scoreSum'],
  // 关联视频弹幕
  link: ['.bili-danmaku-x-link', '.bili-link'],
  // 其它：打卡、心动、活动连击、催更、种草、迷你弹窗、播放效果调查
  other: [
    '.bili-danmaku-x-clock',
    '.bili-danmaku-x-cmtime',
    '.bili-danmaku-x-combo',
    '.bili-danmaku-x-rewardfans',
    '.bili-danmaku-x-goodsLike',
    '.bili-danmaku-x-cmd-shrink',
    '.bili-cmd-shrink',
    '.bpx-player-qoeFeedback',
    '.bili-clock',
    '.bili-cmtime',
    '.bili-qoeFeedback',
  ],
}

/** 充电按钮：UP 主卡片右侧那一枚，旧版是纯文字、新版带图标，两套都要。 */
export const CHARGE_BUTTON_SELECTOR = '.upinfo-btn-panel .new-charge-btn, .upinfo-btn-panel .old-charge-btn'

/**
 * 预约卡：播放器里那张直播 / 首映预告，也就是弹幕动作 `#RESERVE#`（App 那边叫直播预约横幅）。
 * 它比上面那几种都大，是横着一条，所以单独一个开关。
 */
export const LIVE_ORDER_SELECTORS = [
  '.bili-danmaku-x-reserve',
  '.bili-danmaku-x-reserve-btn',
  '.bili-danmaku-x-reserved',
  '.bili-danmaku-x-unreserved',
  '.bili-reserve',
]

/** 活动条：视频下方那条「[活动名]」加一张封面图。 */
export const ACTIVITY_TAG_SELECTORS = ['.video-resource-list', '#activity_vote', '.activity-m-v1']

/**
 * 按当前设置拼出要注入的样式。给测试用，也让人一眼看得出开关落在哪几条规则上。
 */
export function buildVideoPageCleanupStyle(options: {
  popups: string[]
  removeChargeButton: boolean
  blockLiveOrder: boolean
  blockActivityTag: boolean
}): string {
  const rules: string[] = []

  for (const key of options.popups) {
    for (const selector of VIDEO_POPUP_SELECTORS[key] ?? [])
      rules.push(`${selector} { display: none !important; }`)
  }

  if (options.removeChargeButton)
    rules.push(`${CHARGE_BUTTON_SELECTOR} { display: none !important; }`)

  if (options.blockLiveOrder)
    rules.push(`${LIVE_ORDER_SELECTORS.join(', ')} { display: none !important; }`)

  if (options.blockActivityTag)
    rules.push(`${ACTIVITY_TAG_SELECTORS.join(', ')} { display: none !important; }`)

  return rules.join('\n')
}

/**
 * 只作用于视频页；番剧播放页是另一套播放器外壳，本模块的类名不认它（调用点已经按 URL 分开了）。
 */
export function setupVideoPageCleanup() {
  const styleEl = document.createElement('style')
  styleEl.id = 'bewly-video-page-cleanup'
  document.documentElement.appendChild(styleEl)

  const publish = () => {
    styleEl.textContent = buildVideoPageCleanupStyle({
      popups: settings.value.videoPageRemovedPopups,
      removeChargeButton: settings.value.videoPageRemoveChargeButton,
      blockLiveOrder: settings.value.videoPageBlockLiveOrder,
      blockActivityTag: settings.value.videoPageBlockActivityTag,
    })
  }

  publish()
  watch(
    () => [
      settings.value.videoPageRemovedPopups,
      settings.value.videoPageRemoveChargeButton,
      settings.value.videoPageBlockLiveOrder,
      settings.value.videoPageBlockActivityTag,
    ],
    publish,
    { deep: true },
  )

  return () => styleEl.remove()
}
