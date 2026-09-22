import { settings, slackingTitleSeq } from '~/logic'
import { i18n } from '~/utils/i18n'
import { isInIframe } from '~/utils/main'
import { matchesShortcut } from '~/utils/shortcut'

/**
 * Slacking mode: makes bilibili read as a plain, motionless work page to someone walking past.
 *
 * It has two levels. `light` leaves the layout alone and only dims and de-saturates what is on
 * screen; `heavy` additionally rearranges the card walls into a compact list and lays a grey wash
 * over the video itself.
 *
 * Timing matters more here than anywhere else in the extension. The point of the mode is that the
 * page is never seen looking normal, so none of it may wait for the app to mount — the app does not
 * mount until `DOMContentLoaded`, or on most pages until an idle callback, by which time the page has
 * long since painted. `setupEarlySlackingMode` is started by the content script at `document_start`
 * and owns everything visual; `setupSlackingMode` runs at mount and owns only the shortcuts.
 */

const ORIGINAL_ICON_ATTR = 'data-bewly-original-icon'
const CREATED_ICON_ATTR = 'data-bewly-slacking-icon'
const TITLE_SEQ_KEY = 'bewly-slacking-title-seq'
const TITLE_GUARD_INTERVAL = 2000

/**
 * Heavy mode dims the surroundings a little further than the user's own setting, so that the
 * already-washed video is not the brightest thing left on screen. Clamped so the page can never go
 * fully black.
 */
const HEAVY_EXTRA_DIM = 15
const HEAVY_MAX_DIM = 92

/** A gray document icon, so the tab strip and the taskbar preview stop showing the bilibili logo. */
const DISGUISE_FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#6b7280"/>
  <path d="M10.5 7h7.8L22 10.7V25a1 1 0 0 1-1 1H10.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" fill="#e5e7eb"/>
  <path d="M18.3 7 22 10.7h-3.7V7Z" fill="#9ca3af"/>
  <g fill="#9ca3af">
    <rect x="12" y="14" width="8.2" height="1.6" rx="0.8"/>
    <rect x="12" y="17.6" width="8.2" height="1.6" rx="0.8"/>
    <rect x="12" y="21.2" width="5.4" height="1.6" rx="0.8"/>
  </g>
</svg>`

/**
 * Auto-downgrade engaged while the browser window is not focused. Runtime-only by design: it must
 * never be written to storage, otherwise it would overwrite the level the user picked by hand.
 */
export const slackingAutoHeavy = ref<boolean>(false)

/** The level actually in effect: `max` of what the user set and what the auto layer engaged. */
export const slackingEffectiveLevel = computed<'off' | 'light' | 'heavy'>(() => {
  if (!settings.value.slackingMode)
    return 'off'

  if (slackingAutoHeavy.value || settings.value.slackingLevel === 'heavy')
    return 'heavy'

  return 'light'
})

/** Opacity for the dim overlay, as a number CSS can drop straight into `rgb(0 0 0 / ...)`. */
export const slackingDimAlpha = computed<number>(() => {
  const level = slackingEffectiveLevel.value
  if (level === 'off')
    return 0

  const base = settings.value.slackingDimIntensity
  const value = level === 'heavy' ? Math.min(base + HEAVY_EXTRA_DIM, HEAVY_MAX_DIM) : base
  return value / 100
})

function isTitleDisguiseActive(): boolean {
  return settings.value.slackingMode && settings.value.slackingDisguiseTitle
}

/**
 * Toggle the classes that let CSS take over the page, and publish the two strengths CSS needs.
 *
 * Safe to call before the DOM is ready — `<html>` exists from the very first tick, and the dimming
 * itself is a stylesheet rule rather than a rendered element, so nothing has to wait for the app to
 * mount. That is what keeps the page from flashing its normal colours on load.
 */
export function applySlackingClass() {
  const level = slackingEffectiveLevel.value
  const enabled = level !== 'off'
  const root = document.documentElement

  const targets: Array<Element | null> = [root, document.querySelector('#bewly')]
  for (const el of targets) {
    if (!el)
      continue

    el.classList.toggle('slacking-mode', enabled)
    el.classList.toggle('slacking-heavy', level === 'heavy')
    el.classList.toggle('slacking-hide-danmaku', settings.value.slackingMode && settings.value.slackingHideDanmaku)
  }

  // Inside a frame the enclosing page already dims everything the frame shows, so dimming again here
  // would double up. CSS cannot tell it is in a frame, so the value is decided here.
  root.style.setProperty(
    '--bew-slacking-dim-alpha',
    isInIframe() ? '0' : String(slackingDimAlpha.value),
  )
  root.style.setProperty(
    '--bew-slacking-video-dim',
    String(settings.value.slackingVideoDimIntensity / 100),
  )
}

function buildDisguiseFavicon(): string {
  return `data:image/svg+xml,${encodeURIComponent(DISGUISE_FAVICON)}`
}

/**
 * Rewrite every favicon link, remembering the original href on the element itself so that the
 * rewrite stays idempotent and can be undone.
 */
function disguiseFavicon() {
  const href = buildDisguiseFavicon()
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')

  if (links.length === 0) {
    if (!document.querySelector(`link[${CREATED_ICON_ATTR}]`)) {
      const link = document.createElement('link')
      link.rel = 'icon'
      link.setAttribute(CREATED_ICON_ATTR, '')
      link.setAttribute('href', href)
      document.head.append(link)
    }
    return
  }

  links.forEach((link) => {
    if (!link.hasAttribute(ORIGINAL_ICON_ATTR))
      link.setAttribute(ORIGINAL_ICON_ATTR, link.getAttribute('href') ?? '')

    if (link.getAttribute('href') !== href)
      link.setAttribute('href', href)
  })
}

function restoreFavicon() {
  document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach((link) => {
    if (!link.hasAttribute(ORIGINAL_ICON_ATTR))
      return

    const original = link.getAttribute(ORIGINAL_ICON_ATTR) ?? ''
    if (original)
      link.setAttribute('href', original)
    else
      link.removeAttribute('href')
    link.removeAttribute(ORIGINAL_ICON_ATTR)
  })

  document.querySelectorAll(`link[${CREATED_ICON_ATTR}]`).forEach(el => el.remove())
}

/** Read (or allocate) this tab's number, so several disguised tabs stay tellable apart. */
function getTabSequence(): number {
  try {
    const cached = window.sessionStorage.getItem(TITLE_SEQ_KEY)
    if (cached)
      return Number(cached) || 1
  }
  catch {
    // sessionStorage can be unavailable; fall through to a per-page number
  }

  const next = (Number(slackingTitleSeq.value) || 0) + 1
  // Wrap around so the number keeps looking like a plausible report series
  const sequence = next > 99 ? 1 : next

  slackingTitleSeq.value = sequence

  try {
    window.sessionStorage.setItem(TITLE_SEQ_KEY, String(sequence))
  }
  catch {
    // ignore
  }

  return sequence
}

/**
 * The localized default name, taken from the message tables.
 *
 * The i18n instance is published the moment the settings land (see `apply`), because everything that
 * reads a message before the app mounts would otherwise get English.
 */
function resolveDefaultTitleText(): string {
  return i18n.global.t('settings.slacking_window_title_default')
}

/**
 * The classes on the `#bewly` host drive the shadow-root rules: collapsing the card walls into a
 * list, and dropping the frosted glass inside our own UI. The host does not exist at
 * `document_start` — the app injects it much later, once the DOM is ready — so applying on settings
 * changes alone leaves it undressed on a first visit: heavy mode keeps its multi-column layout until
 * some setting happens to change, which is why toggling the mode twice appeared to fix it.
 *
 * So wait for the host and dress it the moment it arrives. Both observers are `childList`-only on a
 * single level, to keep the cost negligible while a heavy page is loading.
 */
function watchForSlackingHost() {
  function dressHost(): boolean {
    if (!document.querySelector('#bewly'))
      return false

    applySlackingClass()
    return true
  }

  function watchBody() {
    if (dressHost())
      return

    const observer = new MutationObserver(() => {
      if (!dressHost())
        return

      observer.disconnect()
    })
    observer.observe(document.body, { childList: true })
  }

  if (document.body) {
    watchBody()
    return
  }

  // `document_start` runs before <body> exists, so wait for the root to gain one first
  const rootObserver = new MutationObserver(() => {
    if (!document.body)
      return

    rootObserver.disconnect()
    watchBody()
  })
  rootObserver.observe(document.documentElement, { childList: true })
}

/**
 * Start applying slacking mode as early as possible, from the content script at `document_start`.
 *
 * The settings are read back asynchronously from `storage.local`, so at `document_start` they still
 * hold their defaults and nothing can be applied yet. Watching from here means the classes, the
 * dimming strength, the tab title and the favicon all land on the first change — a few milliseconds
 * later, before bilibili's content has had its first paint.
 */
export function setupEarlySlackingMode() {
  watchForSlackingHost()

  let expectedTitle = ''
  /** The last value we wrote, so that anything else seen in `document.title` can be attributed to bilibili. */
  let lastWrittenByUs = ''
  /** bilibili's most recent own title, kept so that the disguise can be undone to the right one. */
  let realTitle = ''
  let titleObserver: MutationObserver | undefined
  let observedTitleEl: Element | null = null
  let guardTimer: number | undefined

  function resolveTitle(): string {
    const base = settings.value.slackingWindowTitle.trim() || resolveDefaultTitleText()
    return `${base} #${getTabSequence()}`
  }

  function enforceTitle() {
    if (document.title === expectedTitle)
      return

    // Anything that is not the value we last wrote came from bilibili
    if (document.title !== lastWrittenByUs)
      realTitle = document.title

    lastWrittenByUs = expectedTitle
    document.title = expectedTitle
  }

  /**
   * bilibili rewrites the title on every SPA navigation, and may replace the `<title>` element
   * outright — hence the re-attach plus the periodic guard below.
   */
  function ensureTitleObserver() {
    const titleEl = document.querySelector('title')
    if (titleEl === observedTitleEl)
      return

    titleObserver?.disconnect()
    observedTitleEl = titleEl

    if (!titleEl)
      return

    titleObserver = new MutationObserver(enforceTitle)
    titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true })
  }

  function applyTitle(enabled: boolean) {
    if (!enabled) {
      titleObserver?.disconnect()
      titleObserver = undefined
      observedTitleEl = null

      // Put bilibili's own title back, unless it has already been replaced by a navigation
      if (realTitle && document.title === lastWrittenByUs)
        document.title = realTitle

      lastWrittenByUs = ''
      realTitle = ''
      return
    }

    expectedTitle = resolveTitle()
    enforceTitle()
    ensureTitleObserver()
  }

  function guardTick() {
    // Nothing to guard while the tab is not on screen, and background timers are throttled anyway
    if (document.hidden || !isTitleDisguiseActive())
      return

    enforceTitle()
    ensureTitleObserver()
    disguiseFavicon()
  }

  function stopGuard() {
    if (guardTimer === undefined)
      return

    window.clearInterval(guardTimer)
    guardTimer = undefined
  }

  function apply() {
    // A disabled mode must not leave the auto layer latched, or it would come back the next time
    // the mode is switched on.
    if (!settings.value.slackingMode)
      slackingAutoHeavy.value = false

    // Publish the language as soon as it is known, so that every message read from here on — the
    // disguised title included — comes out in the right one. The app sets the same value when it
    // mounts; doing it here only moves it earlier.
    if (settings.value.language && i18n.global.locale.value !== settings.value.language)
      i18n.global.locale.value = settings.value.language

    applySlackingClass()

    if (isTitleDisguiseActive()) {
      applyTitle(true)
      disguiseFavicon()
      guardTimer ??= window.setInterval(guardTick, TITLE_GUARD_INTERVAL)
    }
    else {
      applyTitle(false)
      restoreFavicon()
      stopGuard()
    }
  }

  watch(
    () => [
      slackingEffectiveLevel.value,
      settings.value.slackingDimIntensity,
      settings.value.slackingVideoDimIntensity,
      settings.value.slackingHideDanmaku,
      settings.value.slackingDisguiseTitle,
      settings.value.slackingWindowTitle,
      // The disguised name comes from the message tables, so it has to be re-resolved on a switch
      settings.value.language,
    ],
    apply,
    { immediate: true },
  )
}

/**
 * The keyboard shortcuts and the focus-driven auto-downgrade. Everything visual is already handled
 * by `setupEarlySlackingMode`; this part can afford to wait for the app to mount, because neither the
 * keys nor the window focus mean anything before there is a page to interact with.
 */
export function setupSlackingMode() {
  /**
   * Focus moving into an inner frame also fires a window blur, so confirm the window itself really
   * lost focus before engaging — otherwise clicking into a drawer would dim the page.
   */
  function handleWindowBlur() {
    window.setTimeout(() => {
      if (document.hasFocus() || !settings.value.slackingMode)
        return

      // Focus inside an embedded frame (the video opened in a drawer, for instance) leaves the
      // window focused as far as the user is concerned, so it must not engage either.
      if (document.activeElement?.tagName === 'IFRAME')
        return

      slackingAutoHeavy.value = true
    }, 0)
  }

  /**
   * Coming back is signalled by the user actually operating the page, not by the window regaining
   * focus: restoring on focus alone would flash the full-brightness page on every Alt-Tab back.
   * Hover events can be delivered to an unfocused window, so the page must really hold focus.
   */
  function handleActivity() {
    if (!slackingAutoHeavy.value || !document.hasFocus())
      return

    slackingAutoHeavy.value = false
  }

  const activityEvents = ['mousemove', 'mousedown', 'wheel', 'scroll', 'keydown'] as const

  function handleKeydown(event: KeyboardEvent) {
    if (event.repeat)
      return

    const shortcut = settings.value.slackingShortcut
    if (shortcut && matchesShortcut(event, shortcut)) {
      event.preventDefault()
      settings.value.slackingMode = !settings.value.slackingMode
      return
    }

    const levelShortcut = settings.value.slackingLevelShortcut
    if (!levelShortcut || !matchesShortcut(event, levelShortcut))
      return

    // Doubles as the panic button: reaching straight for the heavy shortcut should not require
    // switching the mode on first.
    event.preventDefault()

    if (!settings.value.slackingMode) {
      settings.value.slackingMode = true
      settings.value.slackingLevel = 'heavy'
    }
    else {
      settings.value.slackingLevel = settings.value.slackingLevel === 'heavy' ? 'light' : 'heavy'
    }
  }

  window.addEventListener('blur', handleWindowBlur)
  window.addEventListener('keydown', handleKeydown)
  for (const event of activityEvents)
    window.addEventListener(event, handleActivity, { passive: true })

  onUnmounted(() => {
    window.removeEventListener('blur', handleWindowBlur)
    window.removeEventListener('keydown', handleKeydown)
    for (const event of activityEvents)
      window.removeEventListener(event, handleActivity)
  })
}
