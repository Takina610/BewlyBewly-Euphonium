import { useStorageLocal } from '~/composables/useStorageLocal'
import type { wallpaperItem } from '~/constants/imgs'
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
