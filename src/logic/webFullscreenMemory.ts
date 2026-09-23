import { WEB_FULLSCREEN_BUTTON_SELECTOR, WEB_FULLSCREEN_ENTERED_CLASS } from '~/composables/useWebFullscreen'
import { settings, webFullscreenEntered } from '~/logic'
import { queryDomUntilFound } from '~/utils/main'

/**
 * Opens a video page the way the last one was left: in web fullscreen (网页全屏), or not.
 *
 * bilibili does not do this itself. Its player profile in `localStorage` carries volume, quality and
 * danmaku preferences, but nothing about the screen mode, and a reload always comes back in `normal`.
 *
 * The memory is the *state*, not a command to enter: leaving fullscreen is recorded just like entering
 * it, so a page the user deliberately left out of fullscreen opens that way next time. Nothing here
 * ever pushes the user back in — the restore runs once per player, and the attempt is skipped when the
 * player is already in the state being restored.
 *
 * Web fullscreen only. The wide (宽屏) and 'fullscreen' modes are separate states, and `data-screen`
 * distinguishes them; focusing on the one mode keeps the clicked control and the read-back state the
 * same thing.
 */

/** How often to look for a replacement player. A new video, or a part switch, replaces it. */
const REBIND_INTERVAL = 2000
/** How often to look for the player while it has not mounted yet. */
const FIRST_LOOKUP_INTERVAL = 500
/** How long to give the player before checking that the restore click took effect. */
const RESTORE_VERIFY_DELAY = 700

/**
 * Started by the content script on video and bangumi pages outside of an iframe — the player exists
 * there, and the drawer's frame must never be pushed into fullscreen (it is a panel inside someone
 * else's layout, where becoming fullscreen would hide the page hosting it).
 */
export function setupWebFullscreenMemory() {
  let button: HTMLElement | null = null
  let observer: MutationObserver | null = null
  let guard: number | undefined
  let lookupAbort: AbortController | undefined
  let verifyTimer: number | undefined

  function isEntered(target: Element): boolean {
    return target.classList.contains(WEB_FULLSCREEN_ENTERED_CLASS)
  }

  /**
   * Write down the state the player is in. This is what the memory is made of, so it must never happen
   * while slacking mode is on: the mode is about not drawing attention, and a page that silently
   * remembered "fullscreen" from a moment the user was hiding their screen would do the opposite.
   */
  function record(entered: boolean) {
    if (settings.value.slackingMode)
      return

    if (webFullscreenEntered.value !== entered)
      webFullscreenEntered.value = entered
  }

  function handleClassChange() {
    if (button)
      record(isEntered(button))
  }

  /**
   * Enter web fullscreen if that is how the last video page was left.
   *
   * The current state is checked first: the player may already be in the state being restored (the
   * mode may have survived a soft navigation), and clicking blind would take the user out of it.
   */
  function restore(target: HTMLElement) {
    if (!settings.value.videoPageRememberWebFullscreen || settings.value.slackingMode)
      return

    if (!webFullscreenEntered.value || isEntered(target))
      return

    target.click()

    // The click goes to the player's own control, which may not be wired up the very instant its button
    // exists. One retry covers that, and it can never double-toggle: the state is checked again first,
    // so a player that did react to the first click is left alone.
    verifyTimer = window.setTimeout(() => {
      verifyTimer = undefined

      if (!target.isConnected || isEntered(target))
        return

      if (!settings.value.videoPageRememberWebFullscreen || settings.value.slackingMode)
        return

      target.click()
    }, RESTORE_VERIFY_DELAY)
  }

  /**
   * Take charge of one player. Re-binding is what keeps this working across a soft navigation, where
   * bilibili replaces the player instead of loading the page again.
   */
  function bind(target: HTMLElement | null) {
    if (!target || target === button)
      return

    observer?.disconnect()
    button = target
    restore(target)

    // Watching the one class the player toggles, not the page
    observer = new MutationObserver(handleClassChange)
    observer.observe(target, { attributes: true, attributeFilter: ['class'] })
  }

  function ensureBound() {
    const found = document.querySelector<HTMLElement>(WEB_FULLSCREEN_BUTTON_SELECTOR)
    if (!found || (found === button && found.isConnected))
      return

    bind(found)
  }

  function start() {
    if (guard === undefined)
      guard = window.setInterval(ensureBound, REBIND_INTERVAL)

    // A page that already has its player (a soft navigation, or a script that started late) must not
    // wait for the first tick of the guard
    ensureBound()

    lookupAbort?.abort()
    lookupAbort = new AbortController()
    queryDomUntilFound(WEB_FULLSCREEN_BUTTON_SELECTOR, FIRST_LOOKUP_INTERVAL, lookupAbort).then((found) => {
      if (found)
        bind(found)
    })
  }

  function stop() {
    lookupAbort?.abort()
    lookupAbort = undefined

    if (verifyTimer !== undefined) {
      window.clearTimeout(verifyTimer)
      verifyTimer = undefined
    }

    observer?.disconnect()
    observer = null
    button = null

    if (guard !== undefined) {
      window.clearInterval(guard)
      guard = undefined
    }
  }

  watch(
    () => settings.value.videoPageRememberWebFullscreen,
    on => (on ? start() : stop()),
    { immediate: true },
  )
}
