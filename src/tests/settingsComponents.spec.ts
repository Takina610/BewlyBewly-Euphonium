import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import components from '~/components'
import Appearance from '~/components/Settings/Appearance/Appearance.vue'
import SearchPage from '~/components/Settings/BewlyPages/SearchPage/SearchPage.vue'
import VideoPage from '~/components/Settings/BewlyPages/VideoPage/VideoPage.vue'
import BilibiliSettings from '~/components/Settings/BilibiliSettings/BilibiliSettings.vue'
import SlackingNotice from '~/components/Settings/components/SlackingNotice.vue'
import Slacking from '~/components/Settings/Slacking/Slacking.vue'
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

  // The last switch on the tab is the one this group adds; it has to track the stored setting
  const switches = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  const ipLocationSwitch = switches[switches.length - 1]

  settings.value.showCommentIpLocation = false
  await nextTick()
  expect(ipLocationSwitch.checked).toBe(false)

  settings.value.showCommentIpLocation = true
  await nextTick()
  expect(ipLocationSwitch.checked).toBe(true)

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
