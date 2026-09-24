/**
 * 播放器里能清掉的浮窗。`key` 是存进设置的值，`labelKey` 是设置页上显示的名字——至于每一格对应
 * 哪几个节点，由 `src/logic/videoPageCleanup.ts` 那张选择器表决定：选择器会跟着 B 站改版走，
 * 而这份清单是给人挑的。
 *
 * 这几格的名字与 B 站自己的弹幕浮窗对得上（投票、三连关注、评分、评分总结、关联视频），
 * 「其它」是剩下那些不常出现的（打卡、心动、迷你弹窗、播放效果调查）。
 */
export const VIDEO_POPUP_ITEMS = [
  { key: 'vote', labelKey: 'settings.video_popup_vote' },
  { key: 'attention', labelKey: 'settings.video_popup_attention' },
  { key: 'grade', labelKey: 'settings.video_popup_grade' },
  { key: 'gradeSummary', labelKey: 'settings.video_popup_grade_summary' },
  { key: 'link', labelKey: 'settings.video_popup_link' },
  { key: 'other', labelKey: 'settings.video_popup_other' },
]

export type VideoPopupKey = typeof VIDEO_POPUP_ITEMS[number]['key']
