import { beforeEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import { createI18n } from 'vue-i18n'

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

vi.mock('~/utils/i18n', () => ({
  i18n: { global: { t: (key: string) => key, locale: { value: 'en' } } },
}))

/** The three videos the 热门 tab is served; the titles are what the filter looks at. */
const videos = [
  { aid: 1, title: '普通视频', owner: { mid: 10, name: '甲' }, stat: { view: 100000, like: 5000 }, duration: 600, rcmd_reason: { content: '' } },
  { aid: 2, title: '【广告】某游戏', owner: { mid: 11, name: '乙' }, stat: { view: 200000, like: 9000 }, duration: 300, rcmd_reason: { content: '' } },
  { aid: 3, title: '另一个视频', owner: { mid: 12, name: '乙' }, stat: { view: 300000, like: 100 }, duration: 120, rcmd_reason: { content: '' } },
]

const getPopularVideos = vi.fn(async () => ({
  code: 0,
  data: { list: videos, no_more: true },
}))

vi.mock('~/utils/api', () => ({
  default: { video: { getPopularVideos: () => getPopularVideos() } },
}))

beforeEach(() => {
  getPopularVideos.mockClear()
})

/** The provider the tab reads its scroll callbacks from; nothing here needs them to do anything. */
function provider() {
  return {
    activatedPage: ref(),
    scrollbarRef: ref(),
    reachTop: ref(true),
    mainAppRef: ref(),
    handleReachBottom: ref(),
    handlePageRefresh: ref(),
    handleUndoRefresh: ref(),
    handleForwardRefresh: ref(),
    showUndoButton: ref(false),
    handleBackToTop: () => {},
    haveScrollbar: async () => true,
    openIframeDrawer: () => {},
  }
}

/**
 * A fresh module graph per test: the filter is built once at setup from the settings in force then.
 * The settings themselves come from the module the tab imports, so both are imported together.
 */
async function mountTab(prepare: (settings: any) => void) {
  vi.resetModules()
  const [{ settings }, { default: Trending }] = await Promise.all([
    import('~/logic/storage'),
    import('~/contentScripts/views/Home/components/Trending.vue'),
  ])

  // 只留这一件要测的事：黑名单开着，名单里一条关键词
  settings.value.trendingFilterByTitle = false
  settings.value.trendingFilterByUser = false
  settings.value.enableFilterByTitle = false
  settings.value.enableFilterByUser = false
  settings.value.filterByTitle = [{ keyword: '广告', remark: '' }]
  settings.value.filterByUser = [{ keyword: '乙', remark: '' }]
  prepare(settings.value)

  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(Trending, { gridLayout: 'adaptive' })
  app.use(createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', globalInjection: true, missingWarn: false, fallbackWarn: false }))
  app.provide('BEWLY_APP', provider())
  app.mount(host)

  for (let i = 0; i < 8; i++)
    await nextTick()
  await new Promise(resolve => setTimeout(resolve, 20))

  const rendered = host.querySelectorAll('videocard').length
  app.unmount()
  host.remove()

  return rendered
}

it('shows the whole popular list when its filter is off', async () => {
  const rendered = await mountTab(() => {})

  expect(rendered).toBe(3)
})

it('hides what the home feed\'s blocklists match, once the tab is told to use them', async () => {
  const rendered = await mountTab((settings) => {
    settings.trendingFilterByTitle = true
    settings.trendingFilterByUser = true
  })

  // 标题带「广告」的、UP 主叫「乙」的两条都不见了
  expect(rendered).toBe(1)
})

it('listens to its own switches, not the home feed\'s', async () => {
  // 首页那两个开关关着、热门这边开着：两边各听各的
  const rendered = await mountTab((settings) => {
    settings.trendingFilterByUser = true
  })
  expect(rendered).toBe(1)

  // 反过来也一样：首页开着不会让热门跟着过滤
  const untouched = await mountTab((settings) => {
    settings.enableFilterByUser = true
    settings.enableFilterByTitle = true
  })
  expect(untouched).toBe(3)
})

it('reads the home feed\'s thresholds for its own numeric switches', async () => {
  const rendered = await mountTab((settings) => {
    settings.trendingFilterByViewCount = true
    settings.filterByViewCount = 250000
  })

  // 只有播放量高于阈值的最后那条留着
  expect(rendered).toBe(1)
})
