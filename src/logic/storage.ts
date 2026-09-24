import { useStorageLocal } from '~/composables/useStorageLocal'
import type { wallpaperItem } from '~/constants/imgs'
import { LIVE_CLEANUP_KEYS } from '~/constants/liveCleanup'
import type { HomeSubPage } from '~/contentScripts/views/Home/types'
import type { AppPage } from '~/enums/appEnums'

export const storageDemo = useStorageLocal('webext-demo', 'Storage Demo')
export const accessKey = useStorageLocal('accessKey', '')

export interface Settings {
  touchScreenOptimization: boolean
  enableGridLayoutSwitcher: boolean
  enableHorizontalScrolling: boolean

  language: string
  customizeFont: 'default' | 'recommend' | 'recommend-new' | 'custom'
  fontFamily: string
  danmakuFont: 'default' | 'override' | 'custom'
  danmakuFontFamily: string
  removeTheIndentFromChinesePunctuation: boolean

  disableFrostedGlass: boolean
  reduceFrostedGlassBlur: boolean
  disableShadow: boolean

  enableVideoPreview: boolean

  // Link Opening Behavior
  videoCardLinkOpenMode: 'drawer' | 'newTab' | 'currentTab'
  topBarLinkOpenMode: 'currentTab' | 'currentTabIfNotHomepage' | 'newTab'
  searchBarLinkOpenMode: 'currentTab' | 'currentTabIfNotHomepage' | 'newTab'
  closeDrawerWithoutPressingEscAgain: boolean

  enableVideoCtrlBarOnVideoCard: boolean
  hoverVideoCardDelayed: boolean

  // Desktop & Dock
  autoHideTopBar: boolean
  showTopBarThemeColorGradient: boolean
  showBewlyOrBiliTopBarSwitcher: boolean
  showBewlyOrBiliPageSwitcher: boolean
  topBarIconBadges: 'number' | 'dot' | 'none'
  openNotificationsPageAsDrawer: boolean
  turnOnSearchHistory: boolean

  alwaysUseDock: boolean
  autoHideDock: boolean
  halfHideDock: boolean
  dockPosition: 'left' | 'right' | 'bottom'
  /** @deprecated use dockItemsConfig instead */
  dockItemVisibilityList: { page: AppPage, visible: boolean }[]
  dockItemsConfig: { page: AppPage, visible: boolean, openInNewTab: boolean, useOriginalBiliPage: boolean }[]
  disableDockGlowingEffect: boolean
  disableLightDarkModeSwitcherOnDock: boolean
  backToTopAndRefreshButtonsAreSeparated: boolean
  enableUndoRefreshButton: boolean // 添加撤销刷新按钮配置项

  sidebarPosition: 'left' | 'right'
  autoHideSidebar: boolean

  theme: 'light' | 'dark' | 'auto'
  themeColor: string
  useLinearGradientThemeColorBackground: boolean
  wallpaperMode: 'buildIn' | 'byUrl'
  wallpaper: string
  enableWallpaperMasking: boolean
  wallpaperMaskOpacity: number
  wallpaperBlurIntensity: number
  locallyUploadedWallpaper: wallpaperItem | null

  customizeCSS: boolean
  customizeCSSContent: string

  showVideoPageBackground: boolean
  roundedVideoPlayer: boolean
  videoPageDanmakuStyle: 'auto' | 'on' | 'off'
  videoPageVideoPodStyle: 'auto' | 'on' | 'off'
  /**
   * 弹幕屏蔽等级，屏蔽权重低于该等级的弹幕。`0` 关闭。整条视频页上的弹幕都由它筛，
   * 主世界注入脚本在弹幕分段返回时按这个值丢弃条目（见 `src/logic/danmakuLevelFilter.ts`）。
   */
  videoPageDanmakuLevelFilter: number
  /** 在播放器信息栏里补回 B 站自己只在番剧页显示的「已装填 N 条弹幕」。 */
  videoPageShowLoadedDanmakuCount: boolean

  /**
   * 视频页的默认播放速度，写成 `1.5` 这样的十进制数。空字符串表示不动 B 站自己的速度。
   */
  videoPageDefaultPlaybackRate: string
  /**
   * 长按右方向键时的播放速度。空字符串表示不动 B 站自己的长按倍速。
   */
  videoPageLongPressPlaybackRate: string
  /**
   * 自定义倍速列表，空格分隔（`2 1.5 1`）。空字符串表示不动播放器自带的列表。
   */
  videoPagePlaybackRateList: string
  /** 禁止长按方向键倍速播放。 */
  videoPageDisableLongPressSpeedUp: boolean
  /** 记住播放速度变化：用户把速度改到多少，下次打开视频页就用多少。 */
  videoPageRememberPlaybackRate: boolean

  /** 进视频页时自动点赞一次（已经赞过的、没登录的都不动）。 */
  videoPageAutoLike: boolean
  /** 要清掉的播放器浮窗键，见 `src/logic/videoPageCleanup.ts`。空名单表示什么都不清。 */
  videoPageRemovedPopups: string[]
  /** 藏掉 UP 主卡片上的充电按钮。 */
  videoPageRemoveChargeButton: boolean
  /** 藏掉播放器里的预约卡（直播 / 首映预告）。 */
  videoPageBlockLiveOrder: boolean
  /** 藏掉视频下方的活动条。 */
  videoPageBlockActivityTag: boolean

  /** 视频下方推荐：充电专属视频不上推荐位。 */
  videoPageRemoveChargeExclusiveVideo: boolean
  /** 视频下方推荐：推广卡（游戏、活动、运营位）不上推荐位。 */
  videoPageRemovePromotedVideos: boolean
  /** 视频下方推荐：只留 UP 主投稿，番剧等内容一并清掉。 */
  videoPageOnlyUploaderVideos: boolean
  /** 视频下方推荐：整个推荐位都不显示。 */
  videoPageRemoveAllRecommendations: boolean

  searchPageDarkenOnSearchFocus: boolean
  searchPageBlurredOnSearchFocus: boolean
  searchPageLogoColor: 'white' | 'themeColor'
  searchPageLogoGlow: boolean
  searchPageShowLogo: boolean
  searchPageSearchBarFocusCharacter: string
  individuallySetSearchPageWallpaper: boolean
  searchPageWallpaperMode: 'buildIn' | 'byUrl'
  searchPageWallpaper: string
  searchPageEnableWallpaperMasking: boolean
  searchPageWallpaperMaskOpacity: number
  searchPageWallpaperBlurIntensity: number

  /**
   * 搜索页净化：要清掉的那几块，键见 `src/constants/searchPurify.ts`。
   * 过滤本身由主世界的注入脚本在接口响应上做，见 `src/logic/searchFilter.ts`。
   */
  searchPurifyItems: string[]
  /** 按类型净化搜索结果：要清掉的结果类型，键见 `src/constants/searchPurify.ts`。 */
  searchBlockedTypes: string[]
  /** 按关键词净化搜索结果：三条名单，与评论区的同名名单匹配规则相同。 */
  searchFilterKeywords: boolean
  searchFilterContent: { keyword: string, remark: string }[]
  searchFilterUser: { keyword: string, remark: string }[]
  searchFilterUid: { keyword: string, remark: string }[]

  recommendationMode: 'web' | 'app'
  recommendationNoAutoSwitch: boolean

  // filter setting
  disableFilterForFollowedUser: boolean
  filterOutVerticalVideos: boolean
  enableFilterByViewCount: boolean
  filterByViewCount: number
  filterLikeViewRatio: boolean
  filterByLikeViewRatio: number
  enableFilterByDuration: boolean
  filterByDuration: number
  enableFilterByTitle: boolean
  filterByTitle: { keyword: string, remark: string }[]
  enableFilterByUser: boolean
  filterByUser: { keyword: string, remark: string }[]

  // Video page recommendation rail. It reads the two tables above — the rail has no lists of its own,
  // only these two switches.
  videoPageFilterRecommendations: boolean
  videoPageFilterNumericConditions: boolean

  // Trending tab of the home page. Its switches are its own, but the lists and the thresholds are the
  // home feed's, so a keyword only has to be written down once.
  trendingFilterByTitle: boolean
  trendingFilterByUser: boolean
  trendingFilterByViewCount: boolean
  trendingFilterByDuration: boolean
  trendingFilterLikeViewRatio: boolean

  followingTabShowLivestreamingVideos: boolean

  homePageTabVisibilityList: { page: HomeSubPage, visible: boolean }[]
  alwaysShowTabsOnHomePage: boolean
  useSearchPageModeOnHomePage: boolean
  searchPageModeWallpaperFixed: boolean

  adaptToOtherPageStyles: boolean
  showTopBar: boolean
  useOriginalBilibiliTopBar: boolean
  useOriginalBilibiliHomepage: boolean

  // Slacking mode (摸鱼模式)
  slackingMode: boolean
  /** How far the mode goes: `light` keeps the layout as it is, `heavy` also rearranges it. */
  slackingLevel: 'light' | 'heavy'
  /** How much to dim the page while slacking mode is on, as a percentage of black. */
  slackingDimIntensity: number
  /** How much grey wash to lay over the video in heavy mode, as a percentage. */
  slackingVideoDimIntensity: number
  slackingDisguiseTitle: boolean
  /** Base text used to disguise the tab title. Falls back to a localized default when empty. */
  slackingWindowTitle: string
  /** Shortcut that toggles slacking mode, e.g. `Alt+Q`. Empty disables the shortcut. */
  slackingShortcut: string
  /** Shortcut that engages heavy mode directly, e.g. `Alt+S`. Empty disables the shortcut. */
  slackingLevelShortcut: string
  slackingHideDanmaku: boolean

  blockAds: boolean
  blockTopSearchPageAds: boolean
  blockVIPDanmukuStyle: boolean
  cleanUrlArgument: boolean
  bvToAv: boolean
  legacyPlayerLoadingScreen: boolean
  /**
   * 进入视频页时，按上次离开时的样子恢复网页全屏（网页全屏状态本身另存，见下方 `webFullscreenEntered`）。
   * 手动退出全屏后当次不再自动进入，下次也不会——退出这个动作本身就是"记住"的内容。
   */
  videoPageRememberWebFullscreen: boolean
  /**
   * 在评论区每条评论的时间后面显示 IP 属地。属地本来就在 B 站接口返回的评论数据里
   * （`reply_control.location`），网页端不渲染而已，打开后由主世界的注入脚本把它补到 DOM 上。
   */
  showCommentIpLocation: boolean
  /** 在属地后面显示性别（`member.sex`）。属地没显示时，性别就占那个位置。 */
  showCommentGender: boolean
  /** 整个评论区都不显示。 */
  blockCommentSection: boolean
  /**
   * 评论区过滤：四条名单分别对评论内容、UP 主名、UID、话题匹配，命中的评论（连同它下面的楼中楼）
   * 由主世界的注入脚本从接口响应里丢掉，见 `src/logic/commentFilter.ts`。
   */
  enableCommentFilter: boolean
  /** 只说了「@某人」、没有别的内容的评论。 */
  commentFilterOnlyAt: boolean
  /** 带着商品卡的评论，也就是 UP 主带货。 */
  commentFilterGoods: boolean
  commentFilterContent: { keyword: string, remark: string }[]
  commentFilterUser: { keyword: string, remark: string }[]
  commentFilterUid: { keyword: string, remark: string }[]
  commentFilterTopic: { keyword: string, remark: string }[]

  /**
   * 顶栏「我的」面板与个人空间页头部那几个数（动态、关注、粉丝、获赞）显示完整数值，不再写成 `1.4万`。
   * 评论区的数字不归它管。
   */
  showExactCounts: boolean

  // 动态页过滤。类型屏蔽读 `momentsBlockedTypes`（键见 `src/logic/momentsFilter.ts`），关键词过滤
  // 那四条名单与评论区的同名名单是同一套匹配规则，但各存各的。
  momentsBlockedTypes: string[]
  momentsBlockInvisible: boolean
  momentsBlockJumpAds: boolean
  momentsBlockLiveReservation: boolean
  momentsBlockPromotions: boolean
  momentsBlockVideos: boolean
  /** 按关键词过滤动态。四条名单见下。 */
  momentsFilterKeywords: boolean
  momentsFilterContent: { keyword: string, remark: string }[]
  momentsFilterUser: { keyword: string, remark: string }[]
  momentsFilterUid: { keyword: string, remark: string }[]
  momentsFilterTopic: { keyword: string, remark: string }[]

  /** 净化直播间浮窗：要清掉的浮窗键，见 `src/logic/liveRoom.ts`。空名单表示什么都不清。 */
  liveCleanupItems: string[]
  /** 进入直播间时默认选原画。 */
  liveDefaultOriginalQuality: boolean
  /** 移除直播间的播放器水印。 */
  liveRemoveWatermark: boolean
  /** 屏蔽直播间的实名认证弹窗。 */
  liveBlockRealNameDialog: boolean
}

export const originalSettings: Settings = {
  touchScreenOptimization: false,
  enableGridLayoutSwitcher: false,
  enableHorizontalScrolling: false,

  language: '',
  customizeFont: 'recommend-new',
  fontFamily: '',
  danmakuFont: 'override',
  danmakuFontFamily: '',
  removeTheIndentFromChinesePunctuation: true,

  disableFrostedGlass: false,
  reduceFrostedGlassBlur: true,
  disableShadow: false,

  // Link Opening Behavior
  videoCardLinkOpenMode: 'newTab',
  topBarLinkOpenMode: 'newTab',
  searchBarLinkOpenMode: 'newTab',
  closeDrawerWithoutPressingEscAgain: false,

  enableVideoPreview: false,
  enableVideoCtrlBarOnVideoCard: false,
  hoverVideoCardDelayed: false,

  // Desktop & Dock
  autoHideTopBar: false,
  showTopBarThemeColorGradient: true,
  showBewlyOrBiliTopBarSwitcher: false,
  showBewlyOrBiliPageSwitcher: false,
  topBarIconBadges: 'number',
  openNotificationsPageAsDrawer: true,
  turnOnSearchHistory: true,

  alwaysUseDock: false,
  autoHideDock: false,
  halfHideDock: false,
  dockPosition: 'right',
  /** @deprecated use dockItemsConfig instead */
  dockItemVisibilityList: [],
  dockItemsConfig: [],
  disableDockGlowingEffect: false,
  disableLightDarkModeSwitcherOnDock: false,
  backToTopAndRefreshButtonsAreSeparated: true,
  enableUndoRefreshButton: false,

  sidebarPosition: 'right',
  autoHideSidebar: false,

  theme: 'auto',
  themeColor: '#00a1d6',
  useLinearGradientThemeColorBackground: false,
  wallpaperMode: 'buildIn',
  wallpaper: '',
  enableWallpaperMasking: false,
  wallpaperMaskOpacity: 80,
  wallpaperBlurIntensity: 0,
  locallyUploadedWallpaper: null,

  customizeCSS: false,
  customizeCSSContent: '',

  showVideoPageBackground: false,
  roundedVideoPlayer: false,
  videoPageDanmakuStyle: 'off',
  videoPageVideoPodStyle: 'off',
  videoPageDanmakuLevelFilter: 0,
  videoPageShowLoadedDanmakuCount: true,

  // 空字符串一律表示「不动播放器自己的行为」，所以这三项默认什么都不做
  videoPageDefaultPlaybackRate: '',
  videoPageLongPressPlaybackRate: '',
  videoPagePlaybackRateList: '',
  videoPageDisableLongPressSpeedUp: false,
  videoPageRememberPlaybackRate: false,

  // 视频页净化：默认一声不响，等用户自己挑要清什么
  videoPageAutoLike: false,
  videoPageRemovedPopups: [],
  videoPageRemoveChargeButton: false,
  videoPageBlockLiveOrder: false,
  videoPageBlockActivityTag: false,

  videoPageRemoveChargeExclusiveVideo: false,
  videoPageRemovePromotedVideos: false,
  videoPageOnlyUploaderVideos: false,
  videoPageRemoveAllRecommendations: false,

  searchPageDarkenOnSearchFocus: true,
  searchPageBlurredOnSearchFocus: false,
  searchPageLogoColor: 'themeColor',
  searchPageLogoGlow: true,
  searchPageShowLogo: true,
  searchPageSearchBarFocusCharacter: '',
  individuallySetSearchPageWallpaper: false,
  searchPageWallpaperMode: 'buildIn',
  searchPageWallpaper: '',
  searchPageEnableWallpaperMasking: false,
  searchPageWallpaperMaskOpacity: 0,
  searchPageWallpaperBlurIntensity: 0,

  // 空名单：搜索页净化装上了但不动任何东西，等用户自己挑
  searchPurifyItems: [],
  searchBlockedTypes: [],
  searchFilterKeywords: false,
  searchFilterContent: [],
  searchFilterUser: [],
  searchFilterUid: [],

  recommendationMode: 'web',
  recommendationNoAutoSwitch: false,

  // filter setting
  disableFilterForFollowedUser: false,
  filterOutVerticalVideos: false,
  enableFilterByViewCount: false,
  filterLikeViewRatio: false,
  filterByLikeViewRatio: 5,
  filterByViewCount: 10000,
  enableFilterByDuration: false,
  filterByDuration: 3600,
  enableFilterByTitle: false,
  filterByTitle: [],
  enableFilterByUser: false,
  filterByUser: [],

  // On by default, but the lists it reads start empty, so it stays quiet until they are filled
  videoPageFilterRecommendations: true,
  videoPageFilterNumericConditions: false,

  // Off by default: the trending tab is a ranked list, not a recommendation feed, so filtering it is
  // something the user asks for rather than something to discover
  trendingFilterByTitle: false,
  trendingFilterByUser: false,
  trendingFilterByViewCount: false,
  trendingFilterByDuration: false,
  trendingFilterLikeViewRatio: false,

  followingTabShowLivestreamingVideos: true,

  homePageTabVisibilityList: [],
  alwaysShowTabsOnHomePage: false,
  useSearchPageModeOnHomePage: false,
  searchPageModeWallpaperFixed: false,

  adaptToOtherPageStyles: true,
  showTopBar: true,
  useOriginalBilibiliTopBar: false,
  useOriginalBilibiliHomepage: false,

  // Slacking mode (摸鱼模式)
  slackingMode: false,
  slackingLevel: 'light',
  slackingDimIntensity: 40,
  slackingVideoDimIntensity: 35,
  slackingDisguiseTitle: true,
  slackingWindowTitle: '',
  slackingShortcut: 'Alt+Q',
  slackingLevelShortcut: 'Alt+S',
  slackingHideDanmaku: true,

  // bilibili settings
  blockAds: true,
  blockTopSearchPageAds: true,
  blockVIPDanmukuStyle: true,
  cleanUrlArgument: true,
  bvToAv: false,
  legacyPlayerLoadingScreen: false,
  videoPageRememberWebFullscreen: true,
  showCommentIpLocation: true,
  showCommentGender: false,
  blockCommentSection: false,
  enableCommentFilter: false,
  commentFilterOnlyAt: false,
  commentFilterGoods: false,
  commentFilterContent: [],
  commentFilterUser: [],
  commentFilterUid: [],
  commentFilterTopic: [],
  showExactCounts: true,

  // 空名单 / 关着的开关：动态页过滤装上了但一声不响，等用户自己挑要屏蔽什么
  momentsBlockedTypes: [],
  momentsBlockInvisible: false,
  momentsBlockJumpAds: false,
  momentsBlockLiveReservation: false,
  momentsBlockPromotions: false,
  momentsBlockVideos: false,
  momentsFilterKeywords: false,
  momentsFilterContent: [],
  momentsFilterUser: [],
  momentsFilterUid: [],
  momentsFilterTopic: [],

  // 直播间这几项默认开：用户点名要的那些浮窗一进直播间就该清掉
  liveCleanupItems: LIVE_CLEANUP_KEYS,
  liveDefaultOriginalQuality: true,
  liveRemoveWatermark: true,
  liveBlockRealNameDialog: true,
}

export const settings = useStorageLocal('settings', ref<Settings>(originalSettings), { mergeDefaults: true })

export type GridLayoutType = 'adaptive' | 'twoColumns' | 'oneColumn'

export interface GridLayout {
  home: GridLayoutType
}

export const gridLayout = useStorageLocal('gridLayout', ref<GridLayout>({
  home: 'adaptive',
}), { mergeDefaults: true })

export const sidePanel = useStorageLocal('sidePanel', ref<{
  home: boolean
}>({
  home: true,
}), { mergeDefaults: true })

/**
 * Monotonic counter used to number the disguised tab titles ("report #3"), so that
 * several disguised tabs can still be told apart by the user.
 */
export const slackingTitleSeq = useStorageLocal('slackingTitleSeq', 0)

/**
 * Whether the last video page was left in web fullscreen (网页全屏). Kept apart from `settings`
 * because nobody chooses it: it is written as the player's own state changes, and read back when the
 * next video page opens. bilibili does not remember this itself — its player profile carries volume,
 * quality and danmaku preferences, but nothing about the screen mode.
 */
export const webFullscreenEntered = useStorageLocal('webFullscreenEntered', false)

/**
 * The playback speed the user last set by hand. Kept apart from `settings` for the same reason as
 * `webFullscreenEntered`: it is not a preference anybody picks, it is what the player was left at,
 * and it is only read back when "remember the speed" is on. `0` means nothing has been remembered.
 */
export const lastPlaybackRate = useStorageLocal('lastPlaybackRate', 0)
