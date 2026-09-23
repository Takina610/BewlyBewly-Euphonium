import { beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useDark } from '~/composables/useDark'
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
 * Switching the theme used to run inside a view transition with a circular reveal, and that reveal is
 * what flashed light: the browser shows a snapshot of the old page and plays the new state in over it,
 * so switching to dark always puts the light page back on screen after the click. There is no way to
 * reveal a new theme without showing the old one while it plays, so the switch is immediate now.
 *
 * These lock that in: the classes land in the same task as the click (one frame, nothing in between),
 * and a view transition is never started — even where the API exists. The clip animation this replaced
 * was also aimed at `::view-transition-old(root)`, which paints *under* `::view-transition-new(root)`,
 * so it never showed anything to begin with.
 *
 * `useDark` registers watchers for the life of the page, so it is started once for the file.
 */
let toggleDark: (e: MouseEvent) => void
let startViewTransition: ReturnType<typeof vi.fn>

beforeAll(() => {
  startViewTransition = vi.fn()
  // The API is available in every current browser, so the test has to make it available here too —
  // otherwise it would pass by accident.
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: startViewTransition,
  })
  toggleDark = useDark().toggleDark
})

beforeEach(() => {
  startViewTransition.mockClear()
  document.documentElement.className = ''
  document.body.className = ''
})

function click(): MouseEvent {
  return new MouseEvent('click', { clientX: 100, clientY: 100 })
}

it('lands the switch in the same task as the click, with no view transition', async () => {
  settings.value.theme = 'light'
  settings.value.slackingMode = false

  toggleDark(click())

  expect(document.documentElement.classList.contains('dark')).toBe(true)
  expect(document.documentElement.classList.contains('bili_dark')).toBe(false)
  expect(startViewTransition).not.toHaveBeenCalled()

  await nextTick()
  expect(document.body.classList.contains('dark')).toBe(true)
})

it('switches back the same way', async () => {
  settings.value.theme = 'dark'
  await nextTick()

  toggleDark(click())

  expect(document.documentElement.classList.contains('dark')).toBe(false)
  expect(startViewTransition).not.toHaveBeenCalled()
})

it('does nothing while slacking mode forces the theme', async () => {
  settings.value.slackingMode = true
  settings.value.theme = 'light'
  await nextTick()

  toggleDark(click())

  expect(settings.value.theme).toBe('light')
  expect(startViewTransition).not.toHaveBeenCalled()
  settings.value.slackingMode = false
})
