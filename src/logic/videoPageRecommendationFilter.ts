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
/**
 * 列表下面那个「展开」（点它加载更多）。清空整个列表时要跟着一起藏，不然会剩一个孤零零的按钮。
 */
const FOOTER_SELECTOR = '.rec-footer'
/**
 * 推荐位上的卡片一共四种：`.video-page-card-small` 是投稿视频，另外三种是页面自己插进来的推广位
 * （运营位、游戏、活动/会员购那类）。四种都要看着，前三种由下面的推广开关处理。
 */
const CARD_SELECTOR = ':scope > .video-page-card-small, :scope > .video-page-special-card-small, :scope > .video-page-game-card-small, :scope > .video-page-operator-card-small'
/** 推广位卡片：不是投稿视频的那三种。 */
export const PROMOTED_CARD_SELECTOR = '.video-page-special-card-small, .video-page-game-card-small, .video-page-operator-card-small'
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
 * 推广卡上读不到投稿视频那些字段，拿它的结构去读只会读出空值；判断早就由卡片类名做完了，
 * 这里给共享条件一个空壳，让它什么都不匹配。
 */
const EMPTY_CARD: RecommendationCard = {
  title: '',
  owner: { name: '', mid: '' },
  stat: { viewStr: null },
  duration: null,
  isFollowed: false,
}

/**
 * 这张卡片现在该不该藏。三件事各管一摊：
 * - 推广位（不是投稿视频的那三种卡片）；
 * - 只要 UP 主投稿，推广位同样不算；
 * - 关键词名单与阈值那两个共享条件（推广卡上读不到标题以外的信息，所以不拿它们去 judge）。
 *
 * 「整个推荐位都不要」不在这里：那一条不是一张卡的事，由 `railNodesForRemoveAll` 整块处理。
 */
export function shouldHideRailCard(data: RecommendationCard, options: {
  removePromotedVideos: boolean
  onlyUploaderVideos: boolean
  isPromotedCard: boolean
  blocklists: Function | null
  thresholds: Function | null
  numericConditions: boolean
}): boolean {
  if (options.isPromotedCard && (options.removePromotedVideos || options.onlyUploaderVideos))
    return true

  // 推广卡上没有 UP 名、播放量、时长这些信息，共享条件套上去只会误判
  if (options.isPromotedCard)
    return false

  return shouldHideCard(data, options.blocklists, options.thresholds, options.numericConditions)
}

/**
 * 「移除所有侧边栏推荐内容」时要藏的节点：那个列表，以及它下面的「展开」。
 *
 * 只藏列表会留下一个孤零零的「展开」按钮（点它也一样没东西出来），而且这时逐张判断也没有意义——
 * 本来就该整块消失。单独拿出来是因为这条规则容易漏，测试也照着它写。
 *
 * 「接下来播放」不动：那是自动连播的入口，不是推荐位的一部分。
 */
export function railNodesForRemoveAll(list: HTMLElement | null): HTMLElement[] {
  if (!list)
    return []

  const footer = list.parentElement?.querySelector<HTMLElement>(FOOTER_SELECTOR) ?? null
  return footer ? [list, footer] : [list]
}

/** 被整体藏掉的节点，开关关掉时要交回去。 */
export interface RailRemoveAllState {
  nodes: HTMLElement[]
}

/**
 * 开关「移除所有」：一次藏掉（或交回）列表与它的「展开」。
 *
 * 状态由调用方拿着（见 `RailRemoveAllState`），这样重复开关不会积下第二份记录，关掉时也一定交得回来。
 */
export function setRailRemoveAll(list: HTMLElement | null, state: RailRemoveAllState, on: boolean): void {
  for (const el of state.nodes)
    el.style.display = ''
  state.nodes = []

  if (!on)
    return

  for (const el of railNodesForRemoveAll(list)) {
    el.style.display = 'none'
    state.nodes.push(el)
  }
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
  /** 被「移除所有」整体藏掉的节点（列表与「展开」），开关关掉时要交回去。 */
  const removeAllState: RailRemoveAllState = { nodes: [] }
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

  /**
   * 整个列表都不要了：藏列表本身与它的「展开」，不逐张藏。
   *
   * 逐个藏卡片在这儿是白做的（判断结果全都是「藏」），而且会漏下那个「展开」按钮。所以这一格走
   * 另一条路：一次开关两个节点。真正的开关动作在 `setRailRemoveAll` 里（那一份是能单独测的）。
   */
  function setRemoveAll(on: boolean) {
    setRailRemoveAll(list, removeAllState, on)
  }

  /** The rail holds tens of cards, so judging all of them on every change is cheap. */
  function scan() {
    if (!list?.isConnected)
      return

    if (settings.value.videoPageRemoveAllRecommendations) {
      // 先把逐张藏过的卡片交回去，免得两边都记着一份状态
      restoreAll()
      setRemoveAll(true)
      return
    }

    setRemoveAll(false)

    for (const card of Array.from(list.querySelectorAll<HTMLElement>(CARD_SELECTOR))) {
      const promoted = card.matches(PROMOTED_CARD_SELECTOR)

      if (shouldHideRailCard(
        promoted ? EMPTY_CARD : readRecommendationCard(card),
        {
          removePromotedVideos: settings.value.videoPageRemovePromotedVideos,
          onlyUploaderVideos: settings.value.videoPageOnlyUploaderVideos,
          isPromotedCard: promoted,
          blocklists: blocklists.value,
          thresholds: thresholds.value,
          numericConditions: settings.value.videoPageFilterNumericConditions,
        },
      )) {
        hide(card)
      }
      else if (card.getAttribute(FILTERED_ATTR) === '1') {
        restore(card)
      }
    }
  }

  function bind(target: HTMLElement) {
    // Cards the replaced rail dropped are no longer ours to track
    for (const card of [...hidden]) {
      if (!card.isConnected)
        hidden.delete(card)
    }
    // 被整体藏过的节点同理：换了一根新列表，旧的已经不在了
    removeAllState.nodes = removeAllState.nodes.filter(el => el.isConnected)

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
    setRemoveAll(false)
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
      settings.value.videoPageRemovePromotedVideos,
      settings.value.videoPageOnlyUploaderVideos,
      settings.value.videoPageRemoveAllRecommendations,
    ],
    scan,
    { deep: true },
  )
}
