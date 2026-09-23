import { beforeEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { settings } from '~/logic/storage'
import { setupVideoPageDanmakuCount } from '~/logic/videoPageDanmakuCount'

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
  i18n: {
    global: {
      t: (_key: string, params?: { count?: string }) => `已装填 ${params?.count ?? '{count}'} 条弹幕`,
    },
  },
}))

/**
 * The player renders 「已装填 N 条弹幕」 next to 「N人正在看」 on bangumi pages only; on UGC video pages
 * it skips that block, and this module puts it back. What is checked here is the shape of that work:
 * the markup is the player's own (so its stylesheet applies), it is never added twice, bilibili's own
 * line wins when it is there, and the number is read from the video info row rather than requested.
 *
 * Started once for the file — it registers one interval for the life of the page, and starting it per
 * test would stack intervals that then act on the next test's DOM.
 */
const SCAN_INTERVAL = 2000
let started = false

function ensureStarted() {
  if (started)
    return
  started = true
  setupVideoPageDanmakuCount()
}

/** The player's danmaku bar, as the page renders it, plus the info row holding the count. */
function mountPage(options: { count?: string, bilibiliOwnCount?: boolean } = {}) {
  const { count = '1.2万', bilibiliOwnCount = false } = options

  document.body.innerHTML = `
    <div id="viewbox_report">
      <div class="video-info-detail-list">
        <div class="view item"><div class="view-text">64.4万</div></div>
        <div class="dm item"><div class="dm-text">${count}</div></div>
      </div>
    </div>
    <div class="bpx-player-video-info">
      <div class="bpx-player-video-info-online"><span class="bpx-player-video-info-online-num">56</span>人正在看</div>
    </div>
  `

  if (bilibiliOwnCount) {
    const own = document.createElement('div')
    own.className = 'bpx-player-video-info-dm'
    own.textContent = '已装填 6000 条弹幕'
    document.querySelector('.bpx-player-video-info')!.append(own)
  }
}

function ourBlocks(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-bewly-danmaku-count]'))
}

function infoBar(): HTMLElement {
  return document.querySelector('.bpx-player-video-info') as HTMLElement
}

beforeEach(() => {
  vi.useFakeTimers()
  settings.value.videoPageShowLoadedDanmakuCount = true
  document.body.innerHTML = ''
})

it('adds the player\'s own line back to the danmaku bar, with the count from the info row', async () => {
  ensureStarted()
  mountPage()
  await vi.advanceTimersByTimeAsync(SCAN_INTERVAL)

  expect(ourBlocks()).toHaveLength(2)

  const [divide, block] = ourBlocks()
  expect(divide.className).toBe('bpx-player-video-info-divide')
  expect(divide.textContent).toBe('，')
  expect(block.className).toBe('bpx-player-video-info-dm')
  expect(block.textContent).toBe('已装填 1.2万 条弹幕')
  expect(block.querySelector('.bpx-player-video-info-dm-num')?.textContent).toBe('1.2万')
  expect(infoBar().lastElementChild).toBe(block)
})

it('leaves a second scan nothing to do', async () => {
  ensureStarted()
  mountPage()
  await vi.advanceTimersByTimeAsync(SCAN_INTERVAL * 3)

  expect(ourBlocks()).toHaveLength(2)
})

it('keeps out of the way when bilibili renders its own line (bangumi pages)', async () => {
  ensureStarted()
  mountPage({ bilibiliOwnCount: true })
  await vi.advanceTimersByTimeAsync(SCAN_INTERVAL)

  expect(ourBlocks()).toHaveLength(0)
  expect(infoBar().textContent).toContain('已装填 6000 条弹幕')
})

it('takes the line back out when the switch goes off', async () => {
  ensureStarted()
  mountPage()
  await vi.advanceTimersByTimeAsync(SCAN_INTERVAL)
  expect(ourBlocks()).toHaveLength(2)

  settings.value.videoPageShowLoadedDanmakuCount = false
  await nextTick()

  expect(ourBlocks()).toHaveLength(0)
})

it('waits for the count instead of guessing one', async () => {
  ensureStarted()
  document.body.innerHTML = `
    <div class="video-info-detail-list"></div>
    <div class="bpx-player-video-info"></div>
  `
  await vi.advanceTimersByTimeAsync(SCAN_INTERVAL)

  expect(ourBlocks()).toHaveLength(0)
})
