import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import components from '~/components'
import UserPanelPop from '~/components/TopBar/components/UserPanelPop.vue'
import { settings } from '~/logic/storage'

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

/** The three counts the panel shows, as the API returns them. */
const STAT = { following: 429, follower: 1429271, dynamic_count: 12 }

vi.mock('~/utils/api', () => ({
  default: {
    user: { getUserStat: vi.fn(async () => ({ code: 0, data: { ...STAT } })) },
    auth: { logout: vi.fn(async () => ({})) },
  },
}))

/**
 * "数量精确显示" has two halves: the space page, whose counts are replaced in the DOM by the inject
 * script, and the top bar's own user panel — this extension's UI, where the number is formatted by
 * hand. The switch has to reach both, and this pins the second one: the same figure is written
 * abbreviated or in full depending on it.
 */
const USER_INFO = {
  face: '',
  level_info: { current_level: 5, current_min: 0, current_exp: 20000, next_exp: 30000 },
  mid: 123,
  money: 10,
  uname: '测试',
  vip: { status: 0 },
  wallet: { mid: 123, bcoin_balance: 5 },
  is_senior_member: false,
} as any

let host: HTMLDivElement | undefined

beforeEach(() => {
  settings.value.showExactCounts = true
})

afterEach(() => {
  host?.remove()
  host = undefined
})

/** `ALink` reads the app provider for its open mode; nothing here needs it to do anything. */
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

function mountPanel() {
  host = document.createElement('div')
  document.body.appendChild(host)

  const app = createApp(UserPanelPop, { userInfo: USER_INFO })
  app.use(createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', globalInjection: true, missingWarn: false, fallbackWarn: false }))
  app.use(components)
  app.provide('BEWLY_APP', provider())
  app.mount(host)

  return app
}

/** 面板里某个计数显示成什么。按 title 认那一格——title 始终是完整值。 */
function shownCount(exact: string): string {
  const cell = Array.from(host!.querySelectorAll<HTMLElement>('.channel-info-item'))
    .find(el => el.getAttribute('title') === exact)
  return cell?.querySelector('.num')?.textContent?.trim() ?? ''
}

async function settle() {
  for (let i = 0; i < 4; i++)
    await nextTick()
  await new Promise(resolve => setTimeout(resolve, 20))
}

it('writes the top-bar counts in full while the switch is on', async () => {
  const app = mountPanel()
  await settle()

  expect(shownCount('1429271')).toBe('1,429,271')
  expect(shownCount('429')).toBe('429')
  expect(shownCount('12')).toBe('12')

  app.unmount()
})

it('writes them abbreviated while the switch is off', async () => {
  settings.value.showExactCounts = false
  const app = mountPanel()
  await settle()

  // 缩写的具体写法由 numFormatter 按语言决定，这里只要求它不是完整值
  expect(shownCount('1429271')).not.toBe('1,429,271')
  expect(shownCount('1429271')).toContain('M')

  settings.value.showExactCounts = true
  await nextTick()
  expect(shownCount('1429271')).toBe('1,429,271')

  app.unmount()
})
