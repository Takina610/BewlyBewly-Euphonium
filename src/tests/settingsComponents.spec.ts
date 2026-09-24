import { createPinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import components from '~/components'
import Appearance from '~/components/Settings/Appearance/Appearance.vue'
import HomeSettings from '~/components/Settings/BewlyPages/Home/Home.vue'
import Live from '~/components/Settings/BewlyPages/Live/Live.vue'
import Moments from '~/components/Settings/BewlyPages/Moments/Moments.vue'
import SearchPage from '~/components/Settings/BewlyPages/SearchPage/SearchPage.vue'
import VideoPage from '~/components/Settings/BewlyPages/VideoPage/VideoPage.vue'
import BilibiliSettings from '~/components/Settings/BilibiliSettings/BilibiliSettings.vue'
import SlackingNotice from '~/components/Settings/components/SlackingNotice.vue'
import Slacking from '~/components/Settings/Slacking/Slacking.vue'
import { LIVE_CLEANUP_ITEMS } from '~/constants/liveCleanup'
import { MOMENTS_TYPE_ITEMS } from '~/constants/momentsTypes'
import { SEARCH_PURIFY_ITEMS, SEARCH_RESULT_TYPES } from '~/constants/searchPurify'
import { VIDEO_POPUP_ITEMS } from '~/constants/videoPagePopups'
import { settings } from '~/logic'

vi.mock('webextension-polyfill', () => {
  const browser = {
    runtime: { id: 'test-extension-id' },
    storage: {
      local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
      onChanged: { addListener: () => {} },
    },
  }
  return { default: browser, storage: browser.storage }
})

let host: HTMLDivElement | undefined

afterEach(() => {
  host?.remove()
  host = undefined
})

/**
 * The switch inside the settings item whose title renders as `key`. No locale messages are loaded here,
 * so a title renders as its key — and an item's own description contains that key too, which is why
 * this scopes to the item rather than to any element mentioning it. Matching by label instead of by
 * position matters on this tab: switches get added to it, and "the last one" silently becomes something
 * else the moment they do.
 */
function switchFor(target: HTMLElement, key: string): HTMLInputElement | null {
  const item = Array.from(target.querySelectorAll<HTMLElement>('.b-settings-item'))
    .find(el => el.textContent?.includes(key))

  return item?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null
}

/**
 * `SettingsItem` and `SettingsItemGroup` live in `Settings/components/`, which the auto-registration
 * glob in `components/index.ts` does not cover — every settings tab has to import them by hand.
 * Forgetting that import does not fail `vue-tsc`; it silently renders the tags as unknown elements,
 * which is how the slacking tab first shipped looking empty. This pins the behaviour down.
 */
it('renders the slacking tab with its group and item components resolved', () => {
  host = document.createElement('div')
  document.body.appendChild(host)

  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    globalInjection: true,
    // The copy is irrelevant here, and a bare instance keeps this test independent of the locale files
    missingWarn: false,
    fallbackWarn: false,
  })
  const app = createApp(Slacking)
  app.use(i18n)
  app.use(components)
  app.mount(host)

  const html = host.innerHTML

  // An unresolved component degrades into a native element with its lowercased tag name. None of
  // these components renders that tag when it does resolve, so their presence means a missing import.
  for (const tag of ['settingsitemgroup', 'settingsitem', 'slider', 'select', 'shortcutinput'])
    expect(html, `unresolved component: <${tag}>`).not.toMatch(new RegExp(`<${tag}[\\s>]`, 'i'))

  // Both components carry their own root class, so this only matches a real render
  expect(html).toContain('b-settings-item-group')
  expect(html).toContain('b-settings-item')

  app.unmount()
})

/**
 * The comment-section IP location switch lives in this tab, and it has already shipped invisible once:
 * the source was right, but the copy the browser was running had been built before the change, so the
 * group simply was not on screen. A build-freshness problem cannot be caught here — but the render can,
 * and a missing import or a mistyped key looks exactly the same to the user (nothing there at all).
 *
 * The switch also has to be bound to the very setting the inject script reads, so that is asserted by
 * flipping it rather than by looking for the label.
 */
it('renders the comment group of the bilibili settings tab, wired to the setting itself', async () => {
  host = document.createElement('div')
  document.body.appendChild(host)

  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    globalInjection: true,
    missingWarn: false,
    fallbackWarn: false,
  })
  const app = createApp(BilibiliSettings)
  app.use(i18n)
  app.use(components)
  app.mount(host)
  await nextTick()

  const html = host.innerHTML
  for (const tag of ['settingsitemgroup', 'settingsitem', 'radio'])
    expect(html, `unresolved component: <${tag}>`).not.toMatch(new RegExp(`<${tag}[\\s>]`, 'i'))

  // With no locale messages loaded the keys render as-is, which is what the other tabs assert too
  expect(html).toContain('settings.comment_settings')
  expect(html).toContain('settings.show_comment_ip_location')

  // The switch has to track the very setting the inject script reads
  const ipLocationSwitch = switchFor(host, 'settings.show_comment_ip_location')
  expect(ipLocationSwitch, 'the IP location switch').not.toBeNull()

  settings.value.showCommentIpLocation = false
  await nextTick()
  expect(ipLocationSwitch!.checked).toBe(false)

  settings.value.showCommentIpLocation = true
  await nextTick()
  expect(ipLocationSwitch!.checked).toBe(true)

  app.unmount()
})

/**
 * The notice exists because slacking mode takes those settings over while leaving the controls live:
 * without it, the only feedback is that changing them appears to do nothing. It has to appear only
 * while the mode is on, and its icon and buttons have to actually resolve.
 */
it('explains the take-over only while slacking mode is on', async () => {
  host = document.createElement('div')
  document.body.appendChild(host)

  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    globalInjection: true,
    missingWarn: false,
    fallbackWarn: false,
  })
  const app = createApp(SlackingNotice)
  app.use(i18n)
  app.use(components)
  app.mount(host)

  settings.value.slackingMode = false
  await nextTick()
  expect(host.querySelector('.b-slacking-notice')).toBeNull()

  settings.value.slackingMode = true
  await nextTick()

  const notice = host.querySelector('.b-slacking-notice')
  expect(notice).not.toBeNull()

  const html = notice!.innerHTML
  for (const tag of ['slackingnotice', 'button-not-real'])
    expect(html).not.toMatch(new RegExp(`<${tag}[\\s>]`, 'i'))

  // The action has to be there: this is the whole point of the notice
  expect(html).toContain('settings.slacking_notice_disable')
  expect(html).toContain('i-mingcute:eye-close-fill')

  app.unmount()
})

/**
 * The video page tab carries the player-behaviour group. It is one of the tabs slacking mode replaces
 * wholesale, so this asserts the switch in the state where the tab is actually shown.
 */
it('renders the player-behaviour switch of the video page tab', async () => {
  host = document.createElement('div')
  document.body.appendChild(host)

  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    globalInjection: true,
    missingWarn: false,
    fallbackWarn: false,
  })
  const app = createApp(VideoPage)
  app.use(i18n)
  app.use(components)
  settings.value.slackingMode = false
  app.mount(host)
  await nextTick()

  const html = host.innerHTML
  expect(html).toContain('settings.group_player_behaviour')
  expect(html).toContain('settings.remember_web_fullscreen')

  const switchEl = switchFor(host, 'settings.remember_web_fullscreen')
  expect(switchEl, 'the web fullscreen memory switch').not.toBeNull()

  settings.value.videoPageRememberWebFullscreen = false
  await nextTick()
  expect(switchEl!.checked).toBe(false)

  settings.value.videoPageRememberWebFullscreen = true
  await nextTick()
  expect(switchEl!.checked).toBe(true)

  app.unmount()
})

/**
 * Slacking mode takes a few pages' appearance over, so those settings tabs are replaced by the notice
 * rather than left showing controls that quietly do nothing. The notice has to be the *only* thing
 * there — that is what the user asked for, and the reason a page-specific settings tab is treated
 * differently from a mixed one like General, where only the affected rows are hidden.
 */
const takenOverTabs = [
  ['Appearance', Appearance],
  ['BewlyBewly Pages → Search Page', SearchPage],
  ['BewlyBewly Pages → Video Page', VideoPage],
] as const

for (const [name, tab] of takenOverTabs) {
  it(`replaces "${name}" with the notice while slacking mode is on`, async () => {
    host = document.createElement('div')
    document.body.appendChild(host)

    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      fallbackLocale: 'en',
      globalInjection: true,
      missingWarn: false,
      fallbackWarn: false,
    })
    const app = createApp(tab)
    app.use(i18n)
    app.use(components)
    app.mount(host)

    settings.value.slackingMode = true
    await nextTick()

    expect(host.querySelector('.b-slacking-notice')).not.toBeNull()
    // The whole page body is gone: no group, no picker, no items
    expect(host.querySelectorAll('.b-settings-item-group').length, 'settings groups left visible').toBe(0)
    expect(host.querySelectorAll('.b-settings-item').length, 'settings items left visible').toBe(0)

    settings.value.slackingMode = false
    await nextTick()

    expect(host.querySelector('.b-slacking-notice')).toBeNull()
    expect(host.querySelectorAll('.b-settings-item-group').length).toBeGreaterThan(0)

    app.unmount()
  })
}

/** Mounts one settings tab on its own, with the plugins the tabs assume are there. */
async function mountTab(tab: any, options: { pinia?: boolean } = {}) {
  host = document.createElement('div')
  document.body.appendChild(host)

  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    globalInjection: true,
    missingWarn: false,
    fallbackWarn: false,
  })
  const app = createApp(tab)
  app.use(i18n)
  app.use(components)
  if (options.pinia)
    app.use(createPinia())
  app.mount(host)
  await nextTick()

  return app
}

/**
 * The video page gained a speed group: three text fields (default speed, long-press speed, the
 * player's speed list) and two switches. The fields are the interesting half — a switch that is not
 * wired up looks exactly like a switch that is, but a field left empty when the setting is not says
 * so — so both ends are asserted.
 */
it('renders the playback speed group of the video page tab', async () => {
  const app = await mountTab(VideoPage)

  const html = host!.innerHTML
  expect(html).toContain('settings.group_playback_speed')
  for (const key of ['settings.default_playback_speed', 'settings.long_press_playback_speed', 'settings.playback_speed_list'])
    expect(html).toContain(key)

  const inputs = Array.from(host!.querySelectorAll<HTMLInputElement>('input'))
  settings.value.videoPageDefaultPlaybackRate = '1.5'
  settings.value.videoPagePlaybackRateList = '2 1.5 1'
  await nextTick()
  expect(inputs.some(input => input.value === '1.5')).toBe(true)
  expect(inputs.some(input => input.value === '2 1.5 1')).toBe(true)

  const speedUpSwitch = switchFor(host!, 'settings.disable_long_press_speed_up')
  expect(speedUpSwitch, 'the long-press speed-up switch').not.toBeNull()
  settings.value.videoPageDisableLongPressSpeedUp = true
  await nextTick()
  expect(speedUpSwitch!.checked).toBe(true)
  settings.value.videoPageDisableLongPressSpeedUp = false
  settings.value.videoPageDefaultPlaybackRate = ''
  settings.value.videoPagePlaybackRateList = ''

  app.unmount()
})

/**
 * 三个速度框只认数字，写进框里的东西要能真的一路走到底：不是数字的字符既不进 settings，也不留在框里
 * （留在框里看着就像记下了）。倍速列表还要认空格当分隔符，所以这几个框都把按键拦下来——B 站页面自己的
 * 快捷键会把空格吃掉，上游对字体输入框是同样处理的。
 */
it('keeps the speed boxes to digits, and their keys inside the box', async () => {
  const app = await mountTab(VideoPage)

  const [defaultRate, longPressRate, list] = Array.from(host!.querySelectorAll<HTMLInputElement>('input:not([type="checkbox"])'))
  expect(defaultRate, 'the default speed field').toBeDefined()
  expect(list, 'the speed list field').toBeDefined()

  // 列表：空格留得住，逗号、字母、x 当场丢掉
  list.value = '2 1.5 '
  list.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  expect(settings.value.videoPagePlaybackRateList).toBe('2 1.5 ')
  expect(list.value).toBe('2 1.5 ')

  list.value = '2, 1.5x'
  list.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  expect(settings.value.videoPagePlaybackRateList).toBe('2 1.5')
  expect(list.value).toBe('2 1.5')

  defaultRate.value = '1.5x'
  defaultRate.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  expect(settings.value.videoPageDefaultPlaybackRate).toBe('1.5')
  expect(defaultRate.value).toBe('1.5')

  longPressRate.value = 'abc'
  longPressRate.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  expect(settings.value.videoPageLongPressPlaybackRate).toBe('')

  // 框里的按键不外传：外传就会被 B 站页面的快捷键当成「空格 = 播放/暂停」
  let leaked = false
  const catchKey = () => {
    leaked = true
  }
  document.addEventListener('keydown', catchKey)
  list.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
  document.removeEventListener('keydown', catchKey)
  expect(leaked).toBe(false)

  // 带负号的整条不收：抹掉负号会把 `-2` 悄悄变成 `2`
  list.value = '2 1.5'
  list.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  list.value = '2 1.5-'
  list.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  expect(settings.value.videoPagePlaybackRateList).toBe('2 1.5')
  expect(list.value).toBe('2 1.5')

  defaultRate.value = '-2'
  defaultRate.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  expect(settings.value.videoPageDefaultPlaybackRate).toBe('1.5')
  expect(defaultRate.value).toBe('1.5')

  // 离开框的时候把内容收成真会生效的那个值：0 清空，超范围的写成夹住后的数
  defaultRate.value = '0'
  defaultRate.dispatchEvent(new Event('input', { bubbles: true }))
  defaultRate.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
  expect(settings.value.videoPageDefaultPlaybackRate).toBe('')
  expect(defaultRate.value).toBe('')

  defaultRate.value = '100'
  defaultRate.dispatchEvent(new Event('input', { bubbles: true }))
  defaultRate.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
  expect(settings.value.videoPageDefaultPlaybackRate).toBe('16')
  expect(defaultRate.value).toBe('16')

  list.value = '2 0 1.5x'
  list.dispatchEvent(new Event('input', { bubbles: true }))
  list.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
  expect(settings.value.videoPagePlaybackRateList).toBe('2 1.5')
  expect(list.value).toBe('2 1.5')

  settings.value.videoPageDefaultPlaybackRate = ''
  settings.value.videoPageLongPressPlaybackRate = ''
  settings.value.videoPagePlaybackRateList = ''

  app.unmount()
})

/**
 * The trending tab's filter reads the home feed's lists and thresholds but has switches of its own, so
 * both halves matter: the switches render, and flipping one moves its own setting rather than the
 * home feed's.
 */
it('renders the trending filter switches of the home tab', async () => {
  const app = await mountTab(HomeSettings, { pinia: true })

  const html = host!.innerHTML
  expect(html).toContain('settings.group_trending_filters')

  const switchEl = switchFor(host!, 'settings.trending_filter_by_user')
  expect(switchEl, 'the trending uploader switch').not.toBeNull()

  const homeSwitch = switchFor(host!, 'settings.filter_by_user')
  const homeBefore = homeSwitch?.checked

  settings.value.trendingFilterByUser = true
  await nextTick()
  expect(switchEl!.checked).toBe(true)
  expect(homeSwitch?.checked).toBe(homeBefore)

  settings.value.trendingFilterByUser = false

  app.unmount()
})

/**
 * The bilibili settings tab gained the comment filter — one switch plus four keyword lists that only
 * appear once it is on — and the exact-count switch. A list whose component failed to import renders
 * as an unknown element, which is how the slacking tab first shipped looking empty.
 */
it('renders the comment filter and the exact-count switch of the bilibili settings tab', async () => {
  const app = await mountTab(BilibiliSettings)

  settings.value.enableCommentFilter = false
  await nextTick()

  let html = host!.innerHTML
  expect(html).toContain('settings.group_comment_filter')
  expect(html).toContain('settings.show_exact_counts')

  const filterSwitch = switchFor(host!, 'settings.enable_comment_filter')
  expect(filterSwitch, 'the comment filter switch').not.toBeNull()
  const exactSwitch = switchFor(host!, 'settings.show_exact_counts')
  expect(exactSwitch, 'the exact-count switch').not.toBeNull()

  // 那几个数在顶栏「我的」面板和个人空间页上，跟评论区没关系：别把它放回评论区那一组
  const exactItem = Array.from(host!.querySelectorAll<HTMLElement>('.b-settings-item'))
    .find(el => el.textContent?.includes('settings.show_exact_counts'))
  expect(exactItem?.closest('.b-settings-item-group')?.textContent).toContain('settings.group_user_pages')
  const commentGroup = Array.from(host!.querySelectorAll<HTMLElement>('.b-settings-item-group'))
    .find(el => el.textContent?.includes('settings.show_comment_ip_location'))
  expect(commentGroup?.textContent).not.toContain('settings.show_exact_counts')

  // 开关没打开时名单不占地方
  const itemsBefore = host!.querySelectorAll('.b-settings-item').length

  settings.value.enableCommentFilter = true
  settings.value.showExactCounts = false
  await nextTick()

  html = host!.innerHTML
  expect(exactSwitch!.checked).toBe(false)
  expect(host!.querySelectorAll('.b-settings-item').length).toBeGreaterThan(itemsBefore)

  // 四张名单都在，而且没有哪个组件没被解析出来（没解析的会退化成同名原生标签）
  for (const key of ['settings.comment_filter_content', 'settings.comment_filter_user', 'settings.comment_filter_uid', 'settings.comment_filter_topic'])
    expect(html).toContain(key)
  for (const tag of ['keywordtable', 'settingsitem', 'settingsitemgroup', 'list', 'listitem'])
    expect(html, `unresolved component: <${tag}>`).not.toMatch(new RegExp(`<${tag}[\\s>]`, 'i'))

  settings.value.enableCommentFilter = false
  settings.value.showExactCounts = true

  app.unmount()
})

/**
 * The dynamic page tab: five block switches, the sixteen type chips, and the keyword lists behind
 * their own switch. Ticking a chip has to write its key — that list is the whole feature.
 */
it('renders the dynamic page tab, and its chips write the blocked types', async () => {
  const app = await mountTab(Moments)

  settings.value.momentsFilterKeywords = false
  settings.value.momentsBlockedTypes = []
  await nextTick()

  const html = host!.innerHTML
  expect(html).toContain('settings.group_moments_block')
  for (const item of MOMENTS_TYPE_ITEMS)
    expect(html, `missing type chip: ${item.labelKey}`).toContain(item.labelKey)

  const invisibleSwitch = switchFor(host!, 'settings.moments_block_invisible')
  expect(invisibleSwitch, 'the unviewable switch').not.toBeNull()
  settings.value.momentsBlockInvisible = true
  await nextTick()
  expect(invisibleSwitch!.checked).toBe(true)
  settings.value.momentsBlockInvisible = false

  // 点一格类型：写进 settings，再点一下收回来
  const chip = Array.from(host!.querySelectorAll<HTMLElement>('div'))
    .find(el => el.textContent?.trim() === 'settings.moments_type_forward')!
  chip.click()
  await nextTick()
  expect(settings.value.momentsBlockedTypes).toContain('forward')
  chip.click()
  await nextTick()
  expect(settings.value.momentsBlockedTypes).not.toContain('forward')

  // 关键词过滤：开关打开才铺开四张名单
  const itemsBefore = host!.querySelectorAll('.b-settings-item').length
  settings.value.momentsFilterKeywords = true
  await nextTick()
  expect(host!.querySelectorAll('.b-settings-item').length).toBeGreaterThan(itemsBefore)
  expect(host!.innerHTML).not.toMatch(/<keywordtable[\s>]/i)
  settings.value.momentsFilterKeywords = false

  app.unmount()
})

/**
 * The live-room tab: the 15 overlays as chips (all of them on by default, since that list is what was
 * asked for), plus the three player switches.
 */
it('renders the live-room tab, and its chips come off and on', async () => {
  const app = await mountTab(Live)

  const html = host!.innerHTML
  expect(html).toContain('settings.group_live_cleanup')
  for (const item of LIVE_CLEANUP_ITEMS)
    expect(html, `missing overlay chip: ${item.labelKey}`).toContain(item.labelKey)

  const watermarkSwitch = switchFor(host!, 'settings.live_remove_watermark')
  expect(watermarkSwitch, 'the watermark switch').not.toBeNull()
  settings.value.liveRemoveWatermark = false
  await nextTick()
  expect(watermarkSwitch!.checked).toBe(false)
  settings.value.liveRemoveWatermark = true

  const chip = Array.from(host!.querySelectorAll<HTMLElement>('div'))
    .find(el => el.textContent?.trim() === 'settings.live_cleanup_wish')!
  chip.click()
  await nextTick()
  expect(settings.value.liveCleanupItems).not.toContain('wish')
  chip.click()
  await nextTick()
  expect(settings.value.liveCleanupItems).toContain('wish')

  app.unmount()
})

/**
 * The video page group of the bilibili settings tab: four switches plus the popup chips. Ticking a chip
 * writes its key into one shared list, which is the whole feature — each option only ever adds or
 * removes itself from `videoPageRemovedPopups`.
 */
/**
 * The video page's cleanups and the auto-like switch live in the video page tab, next to the switches
 * they belong with: the popups under 弹幕 (they are danmaku actions), the rest in a group of their own.
 * Ticking a popup chip writes its key into one shared list, which is the whole feature — each option
 * only ever adds or removes itself from `videoPageRemovedPopups`.
 */
it('renders the video page cleanups in the video page tab, and its chips write the keys', async () => {
  settings.value.slackingMode = false
  const app = await mountTab(VideoPage)

  settings.value.videoPageRemovedPopups = []
  await nextTick()

  const html = host!.innerHTML
  expect(html).toContain('settings.group_video_page_cleanup')
  expect(html).toContain('settings.group_danmaku')
  for (const item of VIDEO_POPUP_ITEMS)
    expect(html, `missing popup chip: ${item.labelKey}`).toContain(item.labelKey)

  const autoLikeSwitch = switchFor(host!, 'settings.video_page_auto_like')
  expect(autoLikeSwitch, 'the auto-like switch').not.toBeNull()
  settings.value.videoPageAutoLike = true
  await nextTick()
  expect(autoLikeSwitch!.checked).toBe(true)
  settings.value.videoPageAutoLike = false

  // 三件事各一个开关，都要落在自己的设置上
  for (const key of ['settings.video_page_remove_charge_button', 'settings.video_page_block_live_order', 'settings.video_page_block_activity_tag'])
    expect(switchFor(host!, key), `missing switch: ${key}`).not.toBeNull()

  // 推荐位过滤：四格按内容清，加上「按关键词过滤」与它那个阈值开关
  const htmlWithRail = host!.innerHTML
  expect(htmlWithRail).toContain('settings.group_video_recommendation_filter')
  for (const key of [
    'settings.video_page_remove_charge_exclusive_video',
    'settings.video_page_remove_promoted_videos',
    'settings.video_page_only_uploader_videos',
    'settings.video_page_remove_all_recommendations',
    'settings.video_page_filter_recommendations',
    'settings.video_page_filter_numeric_conditions',
  ]) {
    expect(switchFor(host!, key), `missing rail switch: ${key}`).not.toBeNull()
  }

  // 那两枚开关绑的是自己那份设置（名单与首页共用，但开不开各管各的）
  const railSwitch = switchFor(host!, 'settings.video_page_filter_recommendations')
  const thresholdsSwitch = switchFor(host!, 'settings.video_page_filter_numeric_conditions')
  settings.value.videoPageFilterRecommendations = false
  settings.value.videoPageFilterNumericConditions = true
  await nextTick()
  expect(railSwitch!.checked).toBe(false)
  expect(thresholdsSwitch!.checked).toBe(true)
  settings.value.videoPageFilterRecommendations = true
  settings.value.videoPageFilterNumericConditions = false
  await nextTick()

  const chip = Array.from(host!.querySelectorAll<HTMLElement>('div'))
    .find(el => el.textContent?.trim() === 'settings.video_popup_vote')!
  chip.click()
  await nextTick()
  expect(settings.value.videoPageRemovedPopups).toContain('vote')
  chip.click()
  await nextTick()
  expect(settings.value.videoPageRemovedPopups).not.toContain('vote')

  app.unmount()
})

/**
 * The search page purification group: the two chip lists write the two lists of keys, and the keyword
 * lists only take up room once their switch is on (the same shape as the comment filter).
 */
it('renders the search page purification group, and its chips write the keys', async () => {
  const app = await mountTab(SearchPage, { pinia: true })

  settings.value.searchPurifyItems = []
  settings.value.searchBlockedTypes = []
  settings.value.searchFilterKeywords = false
  await nextTick()

  const html = host!.innerHTML
  expect(html).toContain('settings.group_search_purify')
  for (const item of SEARCH_PURIFY_ITEMS)
    expect(html, `missing purify chip: ${item.labelKey}`).toContain(item.labelKey)
  for (const item of SEARCH_RESULT_TYPES)
    expect(html, `missing type chip: ${item.labelKey}`).toContain(item.labelKey)

  const itemsBefore = host!.querySelectorAll('.b-settings-item').length

  const purifyChip = Array.from(host!.querySelectorAll<HTMLElement>('div'))
    .find(el => el.textContent?.trim() === 'settings.search_purify_trending')!
  purifyChip.click()
  await nextTick()
  expect(settings.value.searchPurifyItems).toContain('trending')
  purifyChip.click()
  await nextTick()
  expect(settings.value.searchPurifyItems).not.toContain('trending')

  const typeChip = Array.from(host!.querySelectorAll<HTMLElement>('div'))
    .find(el => el.textContent?.trim() === 'settings.search_type_live')!
  typeChip.click()
  await nextTick()
  expect(settings.value.searchBlockedTypes).toContain('live')

  settings.value.searchFilterKeywords = true
  await nextTick()
  expect(host!.querySelectorAll('.b-settings-item').length).toBeGreaterThan(itemsBefore)
  for (const tag of ['keywordtable', 'settingsitem', 'settingsitemgroup'])
    expect(host!.innerHTML, `unresolved component: <${tag}>`).not.toMatch(new RegExp(`<${tag}[\\s>]`, 'i'))

  settings.value.searchBlockedTypes = []
  settings.value.searchFilterKeywords = false

  app.unmount()
})

/**
 * The same trap, caught statically and across every settings tab.
 *
 * `Settings/components/` is outside the auto-registration glob, so each of its components has to be
 * imported by hand wherever it is used. Mounting every tab to check would drag in toast, pinia and
 * the API layer, so this reads the sources instead — enough to catch the missing import, which is a
 * purely textual mistake.
 */
it('every settings tab imports the Settings/components components it uses', () => {
  const sources = import.meta.glob('../components/**/*.vue', {
    eager: true,
    query: '?raw',
    import: 'default',
  }) as Record<string, string>

  const sharedNames = Object.keys(sources)
    .filter(path => path.includes('/Settings/components/'))
    .map(path => path.split('/').pop()!.replace('.vue', ''))

  expect(sharedNames.length).toBeGreaterThan(0)

  const offences: string[] = []

  for (const [path, source] of Object.entries(sources)) {
    // The shared components themselves are the definition, not a consumer
    if (path.includes('/Settings/components/') || !path.includes('/Settings/'))
      continue

    for (const name of sharedNames) {
      const used = new RegExp(`<${name}(?![A-Za-z])`).test(source)
      const imported = new RegExp(`\\bimport\\s+${name}\\s+from`).test(source)

      if (used && !imported)
        offences.push(`${path} uses <${name}> without importing it`)
    }
  }

  expect(offences).toEqual([])
})
