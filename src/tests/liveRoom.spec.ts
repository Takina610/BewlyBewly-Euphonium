import { beforeEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { buildLiveCleanupStyle, LIVE_QUALITY_ATTR, setupLiveRoom } from '~/logic/liveRoom'
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

/**
 * Live rooms are cleaned up with a stylesheet rather than by taking nodes out: those panels are
 * rendered by bilibili's own modules, and a rule survives them being rendered again. What is checked
 * here is that only the ticked entries produce rules, that the watermark switch is separate, and that
 * the real-name dialog is only recognised in a short popup — never in the chat, which says the same
 * words all day.
 *
 * The module installs one interval for the life of the page, so it is started once for the file.
 */
const REAL_NAME_SCAN_INTERVAL = 2000
let started = false

function ensureStarted() {
  if (started)
    return
  started = true
  setupLiveRoom()
}

/** 直播间里那块礼物面板，加上一个写着「实名认证」的弹窗和一段聊到它的聊天记录。 */
function mountLiveRoom() {
  document.body.innerHTML = `
    <div id="live-player-ctnr"><div class="web-player-icon-roomStatus"></div></div>
    <div id="gift-control-vm"><div class="gift-control-panel"></div></div>
    <div id="game-id"></div>
    <div class="room-popup-dialog" id="verify-dialog">请先完成实名认证</div>
    <div id="chat-history-list"><div>主播说：实名认证怎么弄啊</div></div>
  `
}

function cleanupStyle(): string {
  return document.querySelector('#bewly-live-cleanup')?.textContent ?? ''
}

beforeEach(() => {
  vi.useFakeTimers()
  settings.value.liveCleanupItems = []
  settings.value.liveRemoveWatermark = false
  settings.value.liveDefaultOriginalQuality = true
  document.body.innerHTML = ''
  document.documentElement.removeAttribute(LIVE_QUALITY_ATTR)
})

it('writes one rule per ticked overlay, and nothing else', () => {
  const style = buildLiveCleanupStyle({ items: ['giftSupport', 'gameCard'], removeWatermark: false })

  expect(style).toContain('#gift-control-vm { display: none !important; }')
  expect(style).toContain('#game-id { display: none !important; }')
  expect(style).not.toContain('announcement-wrapper')
  expect(style).not.toContain('web-player-icon-roomStatus')
})

it('hides the watermark only when that switch is on', () => {
  const on = buildLiveCleanupStyle({ items: [], removeWatermark: true })
  expect(on).toContain('.player-ctnr .web-player-icon-roomStatus')
  expect(on).toContain('.bilibili-live-player-video-logo { display: none !important; }')
  expect(buildLiveCleanupStyle({ items: [], removeWatermark: false })).not.toContain('roomStatus')
})

it('ignores an entry it has no selector for', () => {
  expect(buildLiveCleanupStyle({ items: ['not-a-real-key'], removeWatermark: false }))
    .not.toContain('not-a-real-key')
})

it('injects the rules for the overlays that are ticked', async () => {
  ensureStarted()
  mountLiveRoom()

  settings.value.liveCleanupItems = ['giftSupport', 'plusOne']
  await nextTick()

  expect(cleanupStyle()).toContain('#gift-control-vm { display: none !important; }')
  // 没勾的不在里面
  expect(cleanupStyle()).not.toContain('#game-id { display: none !important; }')
})

it('tells the player to ask for original quality', async () => {
  ensureStarted()

  expect(document.documentElement.getAttribute(LIVE_QUALITY_ATTR)).toBe('true')

  settings.value.liveDefaultOriginalQuality = false
  await vi.advanceTimersByTimeAsync(0)

  expect(document.documentElement.getAttribute(LIVE_QUALITY_ATTR)).toBe('false')
})

it('recognises the real-name dialog by its text, and leaves the chat alone', async () => {
  ensureStarted()
  settings.value.liveBlockRealNameDialog = true
  mountLiveRoom()

  await vi.advanceTimersByTimeAsync(REAL_NAME_SCAN_INTERVAL)

  const dialog = document.querySelector('#verify-dialog')!
  expect(dialog.hasAttribute('data-bewly-real-name-hidden')).toBe(true)
  // 聊天记录里也说着同样的话，但那是聊天区，不是弹窗
  expect(document.querySelector('#chat-history-list')!.hasAttribute('data-bewly-real-name-hidden')).toBe(false)
})

it('leaves the dialog alone when the switch is off', async () => {
  ensureStarted()
  settings.value.liveBlockRealNameDialog = false
  mountLiveRoom()

  await vi.advanceTimersByTimeAsync(REAL_NAME_SCAN_INTERVAL)

  expect(document.querySelector('#verify-dialog')!.hasAttribute('data-bewly-real-name-hidden')).toBe(false)
})
