import { beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { WEB_FULLSCREEN_ENTERED_CLASS } from '~/composables/useWebFullscreen'
import { settings, webFullscreenEntered } from '~/logic/storage'
import { setupWebFullscreenMemory } from '~/logic/webFullscreenMemory'

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
 * The module registers one watcher and one interval for the life of the page, so it is started once for
 * the file and driven through the DOM from there. Starting it per test would stack watchers, and a
 * watcher left over from an earlier test would click a button belonging to a later one.
 */
let started = false
function ensureStarted() {
  if (started)
    return

  started = true
  setupWebFullscreenMemory()
}

interface FakePlayer {
  button: HTMLButtonElement
  clicks: () => number
}

/**
 * A player as far as this module can tell: the web-fullscreen control, and a click that flips the state
 * the module watches. `reacts: false` stands for a control that is not wired up yet.
 */
function mountPlayer(options: { reacts?: boolean } = {}): FakePlayer {
  const { reacts = true } = options
  document.querySelectorAll('.bpx-player-ctrl-btn').forEach(element => element.remove())

  const button = document.createElement('button')
  button.className = 'bpx-player-ctrl-btn bpx-player-ctrl-web'

  let clicks = 0
  button.addEventListener('click', () => {
    clicks++
    if (reacts)
      button.classList.toggle(WEB_FULLSCREEN_ENTERED_CLASS)
  })

  document.body.append(button)

  return { button, clicks: () => clicks }
}

/** Mutation records and reactive watchers are delivered on microtasks. */
async function settleMicrotasks() {
  await vi.advanceTimersByTimeAsync(0)
  for (let i = 0; i < 3; i++)
    await Promise.resolve()
}

/**
 * Let the module discover the player, and give a restore click its verification window.
 *
 * The window has to cover the worst case rather than the typical one: the rebinding guard ticks every
 * two seconds, and a player mounted just after a tick waits almost the whole period to be found — after
 * which the click still has its 700ms verification retry to run. Hence the 3.1s.
 */
async function settle() {
  await vi.advanceTimersByTimeAsync(3100)
  await settleMicrotasks()
}

const isEntered = (button: Element) => button.classList.contains(WEB_FULLSCREEN_ENTERED_CLASS)

/**
 * One clock for the whole file, never swapped back. The module registers its interval for the life of
 * the page, so returning to the real timers between tests would strand that interval on a clock nothing
 * advances any more — and every test after the first would silently drive nothing.
 */
beforeAll(() => {
  vi.useFakeTimers()
})

beforeEach(() => {
  document.querySelectorAll('.bpx-player-ctrl-btn').forEach(element => element.remove())
  settings.value.slackingMode = false
  settings.value.videoPageRememberWebFullscreen = true
  webFullscreenEntered.value = false

  ensureStarted()
})

it('reopens in web fullscreen when that is how the last video was left', async () => {
  webFullscreenEntered.value = true
  await nextTick()

  const player = mountPlayer()
  await settle()

  expect(isEntered(player.button)).toBe(true)
})

it('leaves the player alone when the last video was left out of fullscreen', async () => {
  const player = mountPlayer()
  await settle()

  expect(isEntered(player.button)).toBe(false)
  expect(player.clicks()).toBe(0)
})

/**
 * The whole point of a memory: leaving fullscreen is an answer too. Recording it is what keeps the
 * module from pushing the user back into a mode they just left.
 */
it('records the user leaving fullscreen, so the next video opens without it', async () => {
  webFullscreenEntered.value = true
  await nextTick()

  const player = mountPlayer()
  await settle()
  expect(isEntered(player.button)).toBe(true)

  // The user leaves web fullscreen through the same control
  player.button.click()
  await settleMicrotasks()

  expect(isEntered(player.button)).toBe(false)
  expect(webFullscreenEntered.value).toBe(false)
})

it('records fullscreen entered by hand', async () => {
  const player = mountPlayer()
  await settle()

  expect(webFullscreenEntered.value).toBe(false)

  player.button.click()
  await settleMicrotasks()

  expect(webFullscreenEntered.value).toBe(true)
})

/**
 * The mode is about not drawing attention, so a restore must not fire while it runs — and a page that
 * silently remembered state from a moment the user was hiding their screen would be the opposite of
 * what the mode is for.
 */
it('does not restore while slacking mode is on', async () => {
  webFullscreenEntered.value = true
  settings.value.slackingMode = true
  await nextTick()

  const player = mountPlayer()
  await settle()

  expect(isEntered(player.button)).toBe(false)
  expect(player.clicks()).toBe(0)
})

it('does not record anything while slacking mode is on', async () => {
  settings.value.slackingMode = true
  await nextTick()

  const player = mountPlayer()
  await settle()

  player.button.click()
  await settleMicrotasks()

  expect(isEntered(player.button)).toBe(true)
  expect(webFullscreenEntered.value).toBe(false)
})

it('stands down entirely while the setting is off', async () => {
  webFullscreenEntered.value = true
  settings.value.videoPageRememberWebFullscreen = false
  await nextTick()

  const player = mountPlayer()
  await settle()

  expect(isEntered(player.button)).toBe(false)
  expect(player.clicks()).toBe(0)

  // Switching it back on takes effect without a reload
  settings.value.videoPageRememberWebFullscreen = true
  await nextTick()
  await settle()

  expect(isEntered(player.button)).toBe(true)
})

/**
 * A control that never reacts must not be clicked for ever: the rebinding guard re-runs every two
 * seconds, and a retry loop there would look like the mode toggling itself on and off.
 */
it('attempts a stubborn control twice at most, and never again for the same player', async () => {
  webFullscreenEntered.value = true
  await nextTick()

  // One attempt plus the single verification retry
  const player = mountPlayer({ reacts: false })
  await settle()
  expect(player.clicks()).toBe(2)

  // Many more guard ticks: the player is the same element, so it is not restored again
  await settle()
  await settle()
  expect(player.clicks()).toBe(2)
})

/**
 * A soft navigation swaps the player out under us. The replacement is a new player, and it is opened the
 * way the memory says — which is what keeps this working when a video auto-advances.
 */
it('takes charge of a player that replaced the one before it', async () => {
  webFullscreenEntered.value = true
  await nextTick()

  const first = mountPlayer()
  await settle()
  expect(isEntered(first.button)).toBe(true)

  // bilibili replaces the player without loading the page again
  const second = mountPlayer()
  await settle()

  expect(isEntered(second.button)).toBe(true)
})
