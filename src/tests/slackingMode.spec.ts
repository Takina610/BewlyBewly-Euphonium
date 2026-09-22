import { beforeEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { settings } from '~/logic/storage'

import { applySlackingClass, setupEarlySlackingMode, slackingAutoHeavy, slackingDimAlpha, slackingEffectiveLevel } from '../logic/slackingMode'

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

beforeEach(() => {
  settings.value.slackingMode = false
  settings.value.slackingLevel = 'light'
  settings.value.slackingDimIntensity = 40
  settings.value.slackingDisguiseTitle = true
  settings.value.slackingWindowTitle = ''
  settings.value.language = 'en'
  slackingAutoHeavy.value = false
  document.title = '哔哩哔哩 (゜-゜)つロ 干杯~-bilibili'
  // Leave no classes behind between tests: several of them assert on the same element
  document.documentElement.className = ''
  document.querySelector('#bewly')?.remove()
})

/** MutationObserver callbacks are microtasks, so give them a turn of the event loop. */
function flushObserver() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

it('is off while the mode is off', () => {
  expect(slackingEffectiveLevel.value).toBe('off')
  expect(slackingDimAlpha.value).toBe(0)
})

it('uses the light level when the mode is on and nothing else engaged', () => {
  settings.value.slackingMode = true

  expect(slackingEffectiveLevel.value).toBe('light')
  expect(slackingDimAlpha.value).toBeCloseTo(0.4)
})

it('uses the heavy level when the user picked it', () => {
  settings.value.slackingMode = true
  settings.value.slackingLevel = 'heavy'

  expect(slackingEffectiveLevel.value).toBe('heavy')
})

it('takes the higher of the manual level and the auto layer', () => {
  settings.value.slackingMode = true
  settings.value.slackingLevel = 'light'

  slackingAutoHeavy.value = true
  expect(slackingEffectiveLevel.value).toBe('heavy')

  // The auto layer must never downgrade a level the user picked by hand
  slackingAutoHeavy.value = false
  settings.value.slackingLevel = 'heavy'
  slackingAutoHeavy.value = false
  expect(slackingEffectiveLevel.value).toBe('heavy')
})

it('dims a little further in heavy mode, without ever reaching full black', () => {
  settings.value.slackingMode = true
  slackingAutoHeavy.value = true

  expect(slackingDimAlpha.value).toBeCloseTo(0.55)

  // 80 + the heavy bonus would overshoot; the result has to stay short of opaque
  settings.value.slackingDimIntensity = 80
  expect(slackingDimAlpha.value).toBeLessThan(1)
  expect(slackingDimAlpha.value).toBeCloseTo(0.92)
})

it('puts the level classes on the document and exposes the strengths CSS needs', () => {
  applySlackingClass()
  expect(document.documentElement.classList.contains('slacking-mode')).toBe(false)
  // With the mode off there is nothing to draw, so the dim must be fully transparent
  expect(document.documentElement.style.getPropertyValue('--bew-slacking-dim-alpha')).toBe('0')

  settings.value.slackingMode = true
  settings.value.slackingVideoDimIntensity = 35
  applySlackingClass()

  expect(document.documentElement.classList.contains('slacking-mode')).toBe(true)
  expect(document.documentElement.classList.contains('slacking-heavy')).toBe(false)
  expect(document.documentElement.style.getPropertyValue('--bew-slacking-video-dim')).toBe('0.35')
  expect(document.documentElement.style.getPropertyValue('--bew-slacking-dim-alpha')).toBe('0.4')

  slackingAutoHeavy.value = true
  applySlackingClass()

  expect(document.documentElement.classList.contains('slacking-heavy')).toBe(true)
  expect(document.documentElement.style.getPropertyValue('--bew-slacking-dim-alpha')).toBe('0.55')
})

it('carries the danmaku toggle on the same classes', () => {
  settings.value.slackingMode = true
  settings.value.slackingHideDanmaku = true
  applySlackingClass()
  expect(document.documentElement.classList.contains('slacking-hide-danmaku')).toBe(true)

  settings.value.slackingHideDanmaku = false
  applySlackingClass()
  expect(document.documentElement.classList.contains('slacking-hide-danmaku')).toBe(false)
})

/**
 * The dimming has to be in place before the app mounts, otherwise the page paints normally first and
 * only then turns grey — which is exactly the delay this was fixed for. `setupEarlySlackingMode` is
 * what the content script calls at `document_start`, so what matters is that it applies on its own,
 * without anything else having run.
 */
it('applies from the early setup alone, before any app could have mounted', async () => {
  // The settings still hold their defaults at this point, exactly as at document_start
  expect(settings.value.slackingMode).toBe(false)
  setupEarlySlackingMode()
  expect(document.documentElement.classList.contains('slacking-mode')).toBe(false)

  // This is the moment the async storage read lands. The watcher runs on the next microtask rather
  // than synchronously, which is still far ahead of the first paint.
  settings.value.slackingMode = true
  await nextTick()

  expect(document.documentElement.classList.contains('slacking-mode')).toBe(true)
  expect(document.documentElement.classList.contains('slacking-heavy')).toBe(false)
  expect(document.documentElement.style.getPropertyValue('--bew-slacking-dim-alpha')).toBe('0.4')

  settings.value.slackingLevel = 'heavy'
  await nextTick()
  expect(document.documentElement.classList.contains('slacking-heavy')).toBe(true)

  settings.value.slackingMode = false
  await nextTick()
  expect(document.documentElement.classList.contains('slacking-mode')).toBe(false)
})

/**
 * The tab title is one of the loudest giveaways — the tab bar, the taskbar preview and Alt-Tab all
 * read it — and it used to be disguised only once the app mounted. It now rides on the same early
 * setup as everything else.
 */
it('disguises the tab title as soon as the settings land', async () => {
  setupEarlySlackingMode()
  expect(document.title).not.toContain('#1')

  settings.value.slackingMode = true
  await nextTick()

  expect(document.title).toBe('Data Analysis Report #1')
})

it('uses the configured name, and the localized default when it is empty', async () => {
  settings.value.slackingWindowTitle = '数据分析日报'
  settings.value.language = 'cmn-CN'
  setupEarlySlackingMode()

  settings.value.slackingMode = true
  await nextTick()
  expect(document.title).toContain('数据分析日报')

  // Empty falls back to the message table for the selected language, not to English
  settings.value.slackingWindowTitle = ''
  settings.value.language = 'cmn-CN'
  await nextTick()
  expect(document.title).toContain('数据分析日报')

  settings.value.slackingMode = false
  await nextTick()
})

it('puts bilibili\'s own title back when the mode is turned off', async () => {
  setupEarlySlackingMode()
  settings.value.slackingMode = true
  await nextTick()
  expect(document.title).toBe('Data Analysis Report #1')

  settings.value.slackingMode = false
  await nextTick()

  expect(document.title).toBe('哔哩哔哩 (゜-゜)つロ 干杯~-bilibili')
})

it('corrects bilibili when it rewrites the title during navigation', async () => {
  setupEarlySlackingMode()
  settings.value.slackingMode = true
  await nextTick()
  expect(document.title).toBe('Data Analysis Report #1')

  // What a SPA navigation does to the title
  document.title = '【某视频】_哔哩哔哩_bilibili'
  await nextTick()
  await nextTick()

  expect(document.title).toBe('Data Analysis Report #1')

  settings.value.slackingMode = false
  await nextTick()
})

/**
 * The `#bewly` host does not exist at `document_start`; the app injects it much later. The classes
 * on that host are what collapse the card walls into a single-column list and drop the frosted glass
 * in our own UI, so they have to be put on it the moment it appears — otherwise a first visit keeps
 * the multi-column layout until some setting happens to change, which is exactly the bug this covers.
 */
it('dresses the shadow host as soon as the app injects it', async () => {
  expect(document.querySelector('#bewly')).toBeNull()

  setupEarlySlackingMode()
  settings.value.slackingMode = true
  settings.value.slackingLevel = 'heavy'
  await nextTick()

  // The document is dressed from the start, which is what the dim layer needs
  expect(document.documentElement.classList.contains('slacking-heavy')).toBe(true)

  // The app injects its host afterwards
  const host = document.createElement('div')
  host.id = 'bewly'
  document.body.appendChild(host)
  await flushObserver()

  expect(host.classList.contains('slacking-mode')).toBe(true)
  expect(host.classList.contains('slacking-heavy')).toBe(true)

  // And it keeps up with the mode afterwards
  settings.value.slackingMode = false
  await nextTick()
  expect(host.classList.contains('slacking-mode')).toBe(false)
})

it('dresses a host that is already in the page', async () => {
  const host = document.createElement('div')
  host.id = 'bewly'
  document.body.appendChild(host)

  settings.value.slackingMode = true
  setupEarlySlackingMode()
  await flushObserver()

  expect(host.classList.contains('slacking-mode')).toBe(true)
})
