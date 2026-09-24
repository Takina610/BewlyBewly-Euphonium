/**
 * 动态页能屏蔽的类型。`key` 是存进设置的值，`labelKey` 是设置页上显示的名字；至于每一种对应哪些
 * 接口字段，由 `src/logic/momentsFilter.ts` 决定。
 *
 * 这份清单来自 B 站自己那套类型枚举：名字（`DYNAMIC_TYPE_*` / `MAJOR_TYPE_*`）是网页端的，编号出自
 * 它的 App。有几种（故事、话题推荐）在网页端的动态接口里还没有对应的名字，那两格留着，等它出现。
 */
export const MOMENTS_TYPE_ITEMS = [
  { key: 'forward', labelKey: 'settings.moments_type_forward' },
  { key: 'video', labelKey: 'settings.moments_type_video' },
  { key: 'pgc', labelKey: 'settings.moments_type_pgc' },
  { key: 'fold', labelKey: 'settings.moments_type_fold' },
  { key: 'word', labelKey: 'settings.moments_type_word' },
  { key: 'draw', labelKey: 'settings.moments_type_draw' },
  { key: 'article', labelKey: 'settings.moments_type_article' },
  { key: 'audio', labelKey: 'settings.moments_type_audio' },
  { key: 'live', labelKey: 'settings.moments_type_live' },
  { key: 'medialist', labelKey: 'settings.moments_type_medialist' },
  { key: 'ad', labelKey: 'settings.moments_type_ad' },
  { key: 'banner', labelKey: 'settings.moments_type_banner' },
  { key: 'ugcSeason', labelKey: 'settings.moments_type_ugc_season' },
  { key: 'story', labelKey: 'settings.moments_type_story' },
  { key: 'topicRcmd', labelKey: 'settings.moments_type_topic_rcmd' },
  { key: 'courses', labelKey: 'settings.moments_type_courses' },
]

export type MomentsTypeKey = typeof MOMENTS_TYPE_ITEMS[number]['key']
