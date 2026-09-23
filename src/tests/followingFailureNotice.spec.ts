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

/** What the moment interface does; set per test. */
let answer: () => Promise<unknown> = async () => ({ code: -400, message: '请求错误' })
const getMoments = vi.fn(() => answer())
vi.mock('~/utils/api', () => ({
  default: {
    moment: { getMoments: () => getMoments() },
    live: { getFollowingLiveList: vi.fn(async () => ({ code: -400 })) },
  },
}))

/**
 * This tab asks for three pages in a row to fill the first screen. A failure used to be reported by
 * each of those three asks — the user saw one sentence three times — and when the request *threw*
 * rather than answering, nothing stopped the tab from asking again at all. Both halves are locked
 * here: the tab asks once, and the notice appears once however many places report it.
 */
let toasts: string[] = []

beforeEach(() => {
  getMoments.mockClear()
  answer = async () => ({ code: -400, message: '请求错误' })
  toasts = []
  window.addEventListener('bewlyApiToast', ((event: CustomEvent<{ message: string }>) => {
    toasts.push(event.detail.message)
  }) as EventListener, { once: true })
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

it('asks an interface that answers with an error code once, and says so once', async () => {
  await mountAndSettle()

  expect(getMoments).toHaveBeenCalledTimes(1)
  expect(toasts).toEqual(['common.load_failed'])
})

it('asks an interface that throws once, and says so once', async () => {
  answer = async () => {
    throw new Error('network down')
  }

  await mountAndSettle()

  expect(getMoments).toHaveBeenCalledTimes(1)
  expect(toasts).toEqual(['common.load_failed'])
})

async function mountAndSettle() {
  // A fresh module graph per test: the notice is remembered per page, and one test is one page
  vi.resetModules()
  const [{ settings }, { default: Following }] = await Promise.all([
    import('~/logic/storage'),
    import('~/contentScripts/views/Home/components/Following.vue'),
  ])
  // The livestream rail is another request with its own error path; off, so this stays about the loop
  settings.value.followingTabShowLivestreamingVideos = false

  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(Following, { gridLayout: 'adaptive' })
  app.use(createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', globalInjection: true, missingWarn: false, fallbackWarn: false }))
  app.provide('BEWLY_APP', provider())
  app.mount(host)

  // The three asks are chained through awaits; a few turns is enough for the first one to settle
  for (let i = 0; i < 8; i++)
    await nextTick()
  await new Promise(resolve => setTimeout(resolve, 20))

  app.unmount()
  host.remove()
}
