/**
 * 直播间能清掉的浮窗。`key` 是存进设置的值，`labelKey` 是设置页上显示的名字——至于每一格怎么藏，
 * 由 `src/logic/liveRoom.ts` 那张选择器表决定：选择器会跟着 B 站改版走，而这份清单是给人挑的。
 */
export const LIVE_CLEANUP_ITEMS = [
  { key: 'shoppingCard', labelKey: 'settings.live_cleanup_shopping_card' },
  { key: 'shoppingPicks', labelKey: 'settings.live_cleanup_shopping_picks' },
  { key: 'followReminder', labelKey: 'settings.live_cleanup_follow_reminder' },
  { key: 'reservation', labelKey: 'settings.live_cleanup_reservation' },
  { key: 'giftSupport', labelKey: 'settings.live_cleanup_gift_support' },
  { key: 'scrollingBanner', labelKey: 'settings.live_cleanup_scrolling_banner' },
  { key: 'batteryTask', labelKey: 'settings.live_cleanup_battery_task' },
  { key: 'buyingNow', labelKey: 'settings.live_cleanup_buying_now' },
  { key: 'giftPlanet', labelKey: 'settings.live_cleanup_gift_planet' },
  { key: 'playTogether', labelKey: 'settings.live_cleanup_play_together' },
  { key: 'plusOne', labelKey: 'settings.live_cleanup_plus_one' },
  { key: 'wish', labelKey: 'settings.live_cleanup_wish' },
  { key: 'effectRating', labelKey: 'settings.live_cleanup_effect_rating' },
  { key: 'voteDanmaku', labelKey: 'settings.live_cleanup_vote_danmaku' },
  { key: 'gameCard', labelKey: 'settings.live_cleanup_game_card' },
]

export type LiveCleanupKey = typeof LIVE_CLEANUP_ITEMS[number]['key']

/** 默认全清：这份清单就是用户点名要的东西。 */
export const LIVE_CLEANUP_KEYS: string[] = LIVE_CLEANUP_ITEMS.map(item => item.key)
