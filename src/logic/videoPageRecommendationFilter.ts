import { FilterType, useFilter } from '~/composables/useFilter'
import { settings } from '~/logic'
import { queryDomUntilFound } from '~/utils/main'

/**
 * Hides the videos in the video page's recommendation rail that match the user's blocklists.
 *
 * Everything here is read off the rendered card — title, uploader, view count, duration — rather than
 * from the `related` API. bilibili fills that rail itself and mixes in promoted cards that the API
 * response does not contain, so reading the DOM is the only way to cover all of it, and it costs no
 * request. The trade-off is that a card can only offer what it displays, which is why the like-to-view
 * ratio has no place here.
 *
 * The blocklists are the home feed's, judged by the very same `useFilter`, so `/regex/` entries and the
 * `万`-style numbers behave identically in both places. The thresholds are shared too, but stay off
 * unless asked for: a threshold that suits the home feed is easy to overshoot in a rail full of niche
 * videos.
 */

/** The rail's card list. The `:scope >` matters — the rail also holds a "next up" block with a card. */
const REC_LIST_SELECTOR = '.rec-list'
const CARD_SELECTOR = ':scope > .video-page-card-small'
const FILTERED_ATTR = 'data-bewly-rec-filtered'
/** How often to look for a replacement container. A new video, or a part switch, replaces it. */
const REBIND_INTERVAL = 2000
/** How often to look for the rail while it does not exist yet. */
const FIRST_LOOKUP_INTERVAL = 500

export interface RecommendationCard {
  title: string
  owner: { name: string, mid: string }
  stat: { viewStr: string | null }
  duration: number | null
  /**
   * Always false: the rail does not say whether the uploader is followed, so the exemption for
   * followed uploaders must never treat a card as exempt.
   */
  isFollowed: boolean
}

/**
 * Seconds for an `mm:ss` or `hh:mm:ss` badge, or `null` when there is no badge to read.
 */
export function parseDurationText(text: string): number | null {
  const parts = text.trim().split(':')
  // A badge always carries at least minutes and seconds; anything else is not a duration
  if (parts.length < 2 || parts.length > 3)
    return null

  let seconds = 0
  for (const part of parts) {
    const value = Number(part)
    if (!Number.isInteger(value) || value < 0)
      return null

    seconds = seconds * 60 + value
  }

  return seconds
}

/**
 * The view count the way the shared comparison reads them: digits, optionally with a `万` suffix.
 *
 * `亿` is folded into `万` because that comparison only knows `万` — left alone, a
 * hundred-million-view card would fail to parse and then be hidden for the wrong reason.
 */
export function normalizeViewCountText(text: string): string | null {
  const match = text.trim().match(/^(\d+(?:\.\d+)?)\s*([万萬亿億])?/)
  if (!match)
    return null

  const [, count, unit] = match
  if (unit === '亿' || unit === '億')
    return `${Number(count) * 10000}万`

  return unit ? `${count}万` : count
}

/**
 * The view count sits between the play icon and the danmaku icon. Reading only that stretch is what
 * keeps the danmaku count — which follows the second icon — from being mistaken for it.
 *
 * Returns `null` rather than guessing when the stretch is empty or the icons have moved: a card left
 * unfiltered is a far cheaper mistake than one hidden for a number it never showed.
 */
function readViewCount(playinfo: Element | null): string | null {
  const playIcon = playinfo?.querySelector('svg.play')
  if (!playIcon)
    return null

  let text = ''
  let node: Node | null = playIcon.nextSibling
  while (node && !(node instanceof Element && node.matches('svg.dm'))) {
    if (node.nodeType === Node.TEXT_NODE)
      text += node.textContent ?? ''
    node = node.nextSibling
  }

  return text.trim() ? normalizeViewCountText(text) : null
}

export function readRecommendationCard(card: Element): RecommendationCard {
  const spaceHref = card.querySelector('.upname a[href*="space.bilibili.com"]')?.getAttribute('href') ?? ''

  return {
    title: card.querySelector('.info p.title')?.textContent?.trim() ?? '',
    owner: {
      // Collapsed because an entry has to match exactly; a stray newline in the markup would
      // otherwise let a blocked uploader through
      name: (card.querySelector('.upname')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      mid: spaceHref.match(/(\d+)/)?.[1] ?? '',
    },
    stat: { viewStr: readViewCount(card.querySelector('.playinfo')) },
    duration: parseDurationText(card.querySelector('.pic span.duration')?.textContent ?? ''),
    isFollowed: false,
  }
}

/**
 * The decision itself, kept apart from the DOM work so it can be reasoned about — and tested — on its
 * own.
 *
 * @param data - the card as read off the rail
 * @param blocklists - the shared title/uploader predicate, or `null` to skip it
 * @param thresholds - the shared view/duration predicate, or `null` to skip it
 * @param numericConditions - whether the thresholds are allowed to take part at all
 */
export function shouldHideCard(
  data: RecommendationCard,
  blocklists: Function | null,
  thresholds: Function | null,
  numericConditions: boolean,
): boolean {
  if (blocklists && !blocklists(data))
    return true

  // The thresholds are opt-in, and a card that does not display a value is left alone rather than
  // judged against a number it cannot offer
  if (
    numericConditions
    && data.stat.viewStr !== null
    && data.duration !== null
    && thresholds
    && !thresholds(data)
  ) {
    return true
  }

  return false
}

/**
 * The rail only exists on a video's own page; bangumi playback renders a different one, which this
 * deliberately leaves untouched.
 */
function isVideoDetailPage(): boolean {
  return /^https?:\/\/(?:www\.)?bilibili\.com\/video\/[^/]+/.test(location.href)
}

/**
 * Started by the content script as early as everything else, because bilibili renders the rail on its
 * own schedule — long before our app mounts, and it must never be seen unfiltered.
 */
export function setupVideoPageRecommendationFilter() {
  if (!isVideoDetailPage())
    return

  // Both instances count as enabled: whether the rail is filtered at all is decided here, by a switch
  // of its own, rather than by the home feed's per-condition switches — the two share the lists.
  const blocklists = useFilter(
    ['isFollowed'],
    [FilterType.title, FilterType.user, FilterType.user],
    [['title'], ['owner', 'name'], ['owner', 'mid']],
    { [FilterType.title]: true, [FilterType.user]: true },
  )
  const thresholds = useFilter(
    ['isFollowed'],
    [FilterType.viewCountStr, FilterType.duration],
    [['stat', 'viewStr'], ['duration']],
    { [FilterType.viewCountStr]: true, [FilterType.duration]: true },
  )

  /** The cards we are currently hiding, so that they can be handed back when the rules change. */
  const hidden = new Set<HTMLElement>()
  let list: HTMLElement | null = null
  let observer: MutationObserver | null = null
  let guard: number | undefined
  let lookupAbort: AbortController | undefined

  function hide(card: HTMLElement) {
    if (card.getAttribute(FILTERED_ATTR) === '1')
      return

    card.setAttribute(FILTERED_ATTR, '1')
    // Inline rather than a stylesheet rule: the decision is per card, and the rail lays itself out
    // again as soon as a card stops taking part in it
    card.style.display = 'none'
    hidden.add(card)
  }

  function restore(card: HTMLElement) {
    card.style.display = ''
    card.removeAttribute(FILTERED_ATTR)
    hidden.delete(card)
  }

  function restoreAll() {
    for (const card of [...hidden])
      restore(card)
  }

  /** The rail holds tens of cards, so judging all of them on every change is cheap. */
  function scan() {
    if (!list?.isConnected)
      return

    for (const card of Array.from(list.querySelectorAll<HTMLElement>(CARD_SELECTOR))) {
      if (shouldHideCard(readRecommendationCard(card), blocklists.value, thresholds.value, settings.value.videoPageFilterNumericConditions))
        hide(card)
      else if (card.getAttribute(FILTERED_ATTR) === '1')
        restore(card)
    }
  }

  function bind(target: HTMLElement) {
    // Cards the replaced rail dropped are no longer ours to track
    for (const card of [...hidden]) {
      if (!card.isConnected)
        hidden.delete(card)
    }

    observer?.disconnect()
    list = target
    // `childList` only: the rail appends to itself when it loads more, and nothing we do adds or
    // removes children
    observer = new MutationObserver(scan)
    observer.observe(target, { childList: true })
    scan()
  }

  /**
   * A new video, or a switch of part, replaces the rail wholesale — which takes the observer with it.
   * Looking the container up again on a timer is what keeps the filter alive across that without
   * watching the whole document.
   */
  function ensureBound() {
    const found = document.querySelector<HTMLElement>(REC_LIST_SELECTOR)
    if (!found || (found === list && found.isConnected))
      return

    bind(found)
  }

  function start() {
    if (guard === undefined)
      guard = window.setInterval(ensureBound, REBIND_INTERVAL)

    // Bind as soon as the rail appears rather than waiting for the guard's next tick
    lookupAbort?.abort()
    lookupAbort = new AbortController()
    queryDomUntilFound(REC_LIST_SELECTOR, FIRST_LOOKUP_INTERVAL, lookupAbort).then((found) => {
      if (!settings.value.videoPageFilterRecommendations)
        return

      if (found)
        bind(found)
    })
  }

  function stop() {
    lookupAbort?.abort()
    lookupAbort = undefined
    observer?.disconnect()
    observer = null

    if (guard !== undefined) {
      window.clearInterval(guard)
      guard = undefined
    }

    restoreAll()
    list = null
  }

  watch(
    () => settings.value.videoPageFilterRecommendations,
    on => (on ? start() : stop()),
    { immediate: true },
  )

  // The two lists and the thresholds are all edited while a video page is open, so the decision has to
  // be taken again whenever they change — a card hidden by a keyword that has just been removed has to
  // come back.
  watch(
    () => [
      settings.value.filterByTitle,
      settings.value.filterByUser,
      settings.value.filterByViewCount,
      settings.value.filterByDuration,
      settings.value.videoPageFilterNumericConditions,
    ],
    scan,
    { deep: true },
  )
}
