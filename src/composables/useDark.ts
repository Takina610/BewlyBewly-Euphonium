import { usePreferredDark } from '@vueuse/core'

import { settings } from '~/logic'
import { runWhenIdle } from '~/utils/lazyLoad'
import { setCookie } from '~/utils/main'
import { executeTimes } from '~/utils/timer'

export function useDark() {
  const isPreferredDark = usePreferredDark()
  const currentSystemColorScheme = computed(() => isPreferredDark.value ? 'dark' : 'light')
  const currentAppColorScheme = computed((): 'dark' | 'light' => {
    // Slacking mode keeps the dark theme on: a light page under the dim overlay only reads as grey,
    // and that grey is its own kind of tell. Runtime-only — `settings.theme` is never written, so the
    // user's own choice is back the moment the mode goes off. The early half of this lives in
    // `applySlackingClass`, which lands the same classes at `document_start` instead of at mount.
    if (settings.value.slackingMode)
      return 'dark'

    if (settings.value.theme !== 'auto')
      return settings.value.theme
    else
      return currentSystemColorScheme.value
  })
  const isDark = computed(() => currentAppColorScheme.value === 'dark')
  let themeChangeTimer: NodeJS.Timeout | null = null

  // Watch for changes in the 'settings.value.theme' variable and add the 'dark' class to the 'mainApp' element
  // to prevent some Unocss dark-specific styles from failing to take effect
  watch(
    // `slackingMode` belongs here because it overrides what the theme resolves to: without it, leaving
    // the mode would keep the forced classes on until something else happened to change the theme.
    () => [settings.value.theme, isPreferredDark.value, settings.value.slackingMode],
    () => {
      setAppAppearance()
    },
    { immediate: true },
  )

  // use watchEffect instead of onMounted because onMounted is only aviailable in setup function
  watchEffect(() => {
    // Because some shadow dom may not be loaded when the page has already loaded, we need to wait until the page is idle
    runWhenIdle(() => {
      if (isDark.value) {
        setCookie('theme_style', 'dark', 365 * 10)
        // TODO: find a better way implement this
        themeChangeTimer = executeTimes(() => {
          window.dispatchEvent(new CustomEvent('global.themeChange', { detail: 'dark' }))
        }, 10, 500)
      }
      else {
        setCookie('theme_style', 'light', 365 * 10)
        themeChangeTimer = executeTimes(() => {
          window.dispatchEvent(new CustomEvent('global.themeChange', { detail: 'light' }))
        }, 10, 500)
      }
    })
  })

  /**
   * Watch for changes in the 'settings.value.theme' variable and add the 'dark' class to the 'mainApp' element
   * to prevent some Unocss dark-specific styles from failing to take effect
   */
  function setAppAppearance() {
    if (themeChangeTimer)
      clearInterval(themeChangeTimer)

    if (isDark.value) {
      document.querySelector('#bewly')?.classList.add('dark')
      document.documentElement.classList.add('dark')
      nextTick(() => {
        document.body?.classList.add('dark')
      })
      // bili_dark is bilibili's official dark mode class
      document.documentElement.classList.add('bili_dark')

      setCookie('theme_style', 'dark', 365 * 10)
      window.dispatchEvent(new CustomEvent('global.themeChange', { detail: 'dark' }))
    }
    else {
      document.querySelector('#bewly')?.classList?.remove('dark')
      document.documentElement.classList.remove('dark')
      nextTick(() => {
        document.body?.classList.remove('dark')
      })
      document.documentElement.classList.remove('bili_dark')

      setCookie('theme_style', 'light', 365 * 10)
      window.dispatchEvent(new CustomEvent('global.themeChange', { detail: 'light' }))
    }

    // Only used as a temporary solution, which will eventually be removed
    // It seems like Bilibili already supports dark mode when the `bili_dark` class is added to the `html` element
    // but it's not yet fully refined.
    if (currentAppColorScheme.value === 'dark') {
      if (document.documentElement.classList.contains('bili_dark')) {
        document.documentElement.classList.remove('bili_dark')
      }
    }
    // else {
    //   if (!document.documentElement.classList.contains('bili_dark')) {
    //     document.documentElement.classList.add('bili_dark')
    //   }
    // }
  }

  /**
   * Switches the theme outright, with no animation.
   *
   * This used to run inside a view transition with a circular clip-path reveal, and that reveal was
   * what flashed: with a view transition the browser puts a snapshot of the *old* page on screen and
   * plays the new state in over it, so switching to dark necessarily shows the light page after the
   * click — and the longer the page takes to snapshot (a video page with comments and a player takes
   * a while), the longer that light stays. The clip-path itself never even showed: it was aimed at
   * `::view-transition-old(root)`, which paints *under* `::view-transition-new(root)`, so the only
   * thing on screen was the browser's own cross-fade.
   *
   * The classes are applied here rather than left to the watcher so the switch lands in the same task
   * as the click — one frame, nothing in between.
   */
  function toggleDark(_e: MouseEvent) {
    // While slacking mode forces the theme, a switch here would write a choice that cannot take
    // effect. Both callers (dock, sidebar) hide themselves in that state; this covers anything that
    // reaches it anyway, so the setting is never silently changed behind the user's back.
    if (settings.value.slackingMode)
      return

    if (currentAppColorScheme.value !== currentSystemColorScheme.value)
      settings.value.theme = 'auto'
    else
      settings.value.theme = isPreferredDark.value ? 'light' : 'dark'

    setAppAppearance()
  }

  return {
    isDark,
    toggleDark,
  }
}
