import { beforeEach, expect, it, vi } from 'vitest'

import { FilterType, useFilter } from '~/composables/useFilter'
import { settings } from '~/logic/storage'
import type { RailRemoveAllState } from '~/logic/videoPageRecommendationFilter'
import { normalizeViewCountText, parseDurationText, railNodesForRemoveAll, readRecommendationCard, setRailRemoveAll, shouldHideCard, shouldHideRailCard } from '~/logic/videoPageRecommendationFilter'

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
  settings.value.enableFilterByTitle = false
  settings.value.enableFilterByUser = false
  settings.value.filterByTitle = []
  settings.value.filterByUser = []
  settings.value.filterByViewCount = 10000
  settings.value.filterByDuration = 600
  settings.value.videoPageFilterNumericConditions = false
  settings.value.disableFilterForFollowedUser = false
  settings.value.recommendationMode = 'web'
})

/** The parts of the rail's card markup that the reader actually touches. */
function buildCard(options: { title?: string, uploader?: string, mid?: string, views?: string, duration?: string } = {}): HTMLElement {
  const {
    title = '标题',
    uploader = '某UP主',
    mid = '12345',
    views = '55万',
    duration = '10:00',
  } = options

  const card = document.createElement('div')
  card.className = 'video-page-card-small'
  // The whitespace mirrors the real markup, where the counts live in text nodes around the icons
  card.innerHTML = `<div class="card-box">
    <div class="pic"><span class="duration">${duration}</span></div>
    <div class="info">
      <a href="/video/BV1test"><p class="title" title="${title}">${title}</p></a>
      <div class="upname"><a href="//space.bilibili.com/${mid}/"><svg></svg></a>
        ${uploader}
      </div>
      <div class="playinfo"><svg class="play"></svg>
        ${views}
        <svg class="dm"></svg>
        1921
      </div>
    </div>
  </div>`
  return card
}

/** The rail's instance of the shared blocklist judgement, switched on by its own rules. */
function blocklistFilter() {
  return useFilter(
    ['isFollowed'],
    [FilterType.title, FilterType.user, FilterType.user],
    [['title'], ['owner', 'name'], ['owner', 'mid']],
    { [FilterType.title]: true, [FilterType.user]: true },
  )
}

/** The rail's instance of the shared thresholds. */
function thresholdFilter() {
  return useFilter(
    ['isFollowed'],
    [FilterType.viewCountStr, FilterType.duration],
    [['stat', 'viewStr'], ['duration']],
    { [FilterType.viewCountStr]: true, [FilterType.duration]: true },
  )
}

it('reads a card the way the shared judgement expects it', () => {
  const data = readRecommendationCard(buildCard({
    title: '一个视频标题',
    uploader: '某个UP主',
    mid: '286187082',
    views: '55万',
    duration: '15:25',
  }))

  expect(data.title).toBe('一个视频标题')
  expect(data.owner.name).toBe('某个UP主')
  expect(data.owner.mid).toBe('286187082')
  expect(data.stat.viewStr).toBe('55万')
  expect(data.duration).toBe(925)
  // The rail never knows whether the uploader is followed, so no card may be exempted as followed
  expect(data.isFollowed).toBe(false)
})

it('reads a duration badge, and only something that is one', () => {
  expect(parseDurationText('15:25')).toBe(925)
  expect(parseDurationText('1:02:33')).toBe(3753)
  expect(parseDurationText('00:40')).toBe(40)

  expect(parseDurationText('')).toBeNull()
  expect(parseDurationText('45')).toBeNull()
  expect(parseDurationText('ab:cd')).toBeNull()
})

it('hands the shared comparison a view count in the format it reads', () => {
  expect(normalizeViewCountText('55万')).toBe('55万')
  expect(normalizeViewCountText('1108.7万')).toBe('1108.7万')
  expect(normalizeViewCountText('1921')).toBe('1921')
  // `亿` has to be folded, because the shared comparison only knows `万`
  expect(normalizeViewCountText('1.2亿')).toBe('12000万')
  expect(normalizeViewCountText('')).toBeNull()
})

/**
 * A card captured from a live video page. The icon paths and the outer indentation are trimmed; the
 * classes, the elements and the whitespace around the counts are as they came out of the page.
 *
 * It is worth keeping this real: the danmaku count sits in the same block as the view count and is
 * formatted the same way (`1.9万` there), so a reader that took the block as a whole would look right
 * against a hand-written card and produce the wrong number here.
 */
const CAPTURED_CARD_HTML = `<div class="video-page-card-small">
  <div class="card-box">
    <div class="pic-box">
      <div class="pic"><div class="framepreview-box"><a href="/video/BV1cBp4zQENM/?spm_id_from=333.788.recommend_more_video.0" class="video-awesome-img"><div class="b-img"><img src="//i2.hdslb.com/bfs/archive/a4f8580886054ba97e2155f65728e2063aac665a.jpg" class="b-img__inner" alt="iPhone 17系列性能分析：挤爆牙膏！" loading="lazy"></div></a></div> <span class="mask-video"></span> <span class="duration">34:31</span></div>
      <div class="watch-later-video van-watchlater black"><span class="wl-tips"></span></div><div class="v-recommend-inline-player"></div>
    </div>
    <div class="info">
      <a href="/video/BV1cBp4zQENM/?spm_id_from=333.788.recommend_more_video.0" class=""><p title="iPhone 17系列性能分析：挤爆牙膏！" class="title">iPhone 17系列性能分析：挤爆牙膏！</p></a>
      <div class="upname"><a href="//space.bilibili.com/25876945/" target="_blank" style="display:;"><svg class="up-icon"></svg> <span class="name">极客湾Geekerwan</span></a></div>
      <div class="playinfo"><svg class="play"></svg>
        503.1万

        <svg class="dm"></svg>
        1.9万
      </div>
    </div>
  </div>
</div>`

it('reads a card captured from the real rail', () => {
  const holder = document.createElement('div')
  holder.innerHTML = CAPTURED_CARD_HTML

  const card = holder.querySelector('.video-page-card-small')
  if (!card)
    throw new Error('the captured card did not parse')

  const data = readRecommendationCard(card)

  expect(data.title).toBe('iPhone 17系列性能分析：挤爆牙膏！')
  expect(data.owner.name).toBe('极客湾Geekerwan')
  expect(data.owner.mid).toBe('25876945')
  expect(data.stat.viewStr).toBe('503.1万')
  expect(data.duration).toBe(2071)
  // The danmaku count from the same block, which is what a whole-block read would have produced
  expect(data.stat.viewStr).not.toBe('1.9万')
})

it('hides what the shared blocklists match, even with the home feed\'s own switches off', () => {
  settings.value.filterByTitle = [{ keyword: '剧透', remark: '' }]
  settings.value.filterByUser = [{ keyword: '广告君', remark: '' }, { keyword: '99999', remark: '' }]
  // The home feed's switches are off — the rail has a switch of its own and shares the lists
  expect(settings.value.enableFilterByTitle).toBe(false)
  expect(settings.value.enableFilterByUser).toBe(false)

  const blocklists = blocklistFilter()
  const decide = (card: HTMLElement) =>
    shouldHideCard(readRecommendationCard(card), blocklists.value, null, false)

  expect(decide(buildCard({ title: '剧透预警：这部片子的结局是……' }))).toBe(true)
  expect(decide(buildCard({ uploader: '广告君' }))).toBe(true)
  // The second user condition is the UID, so a blacklist entry can be one too
  expect(decide(buildCard({ uploader: '另一个UP主', mid: '99999' }))).toBe(true)
  expect(decide(buildCard({ title: '正常视频', uploader: '正常UP主', mid: '12345' }))).toBe(false)
})

it('leaves the thresholds out unless they are opted into', () => {
  const thresholds = thresholdFilter()
  const small = readRecommendationCard(buildCard({ views: '5000', duration: '01:00' }))

  // Nothing is hidden by a threshold that the user has not switched on
  expect(shouldHideCard(small, null, thresholds.value, false)).toBe(false)
  expect(shouldHideCard(small, null, thresholds.value, true)).toBe(true)
})

it('keeps a card that does not offer the value a threshold would judge', () => {
  const thresholds = thresholdFilter()
  // No view count and no badge: there is nothing to compare, so the card must be left alone
  const data = readRecommendationCard(buildCard({ views: '', duration: '' }))

  expect(data.stat.viewStr).toBeNull()
  expect(data.duration).toBeNull()
  expect(shouldHideCard(data, null, thresholds.value, true)).toBe(false)
})

/**
 * The rail mixes three kinds of promoted card in with the uploaded videos: an operators' pick, a game
 * card and an activity card. None of them is a video, and none of them carries the fields the shared
 * lists read, which is why they are decided by class rather than by the shared judgement.
 */
function railDecision(partial: Partial<Parameters<typeof shouldHideRailCard>[1]> = {}) {
  return shouldHideRailCard(readRecommendationCard(buildCard()), {
    removePromotedVideos: false,
    onlyUploaderVideos: false,
    isPromotedCard: false,
    blocklists: null,
    thresholds: null,
    numericConditions: false,
    ...partial,
  })
}

it('hides promoted cards under either switch that means them', () => {
  expect(railDecision({ isPromotedCard: true })).toBe(false)
  expect(railDecision({ isPromotedCard: true, removePromotedVideos: true })).toBe(true)
  // 「仅 UP 主投稿视频」把推广位也算作不该出现的东西
  expect(railDecision({ isPromotedCard: true, onlyUploaderVideos: true })).toBe(true)
})

it('does not run the shared lists against a promoted card', () => {
  settings.value.filterByTitle = [{ keyword: '标题', remark: '' }]
  const blocklists = blocklistFilter()

  // 同一张卡，当成投稿视频读就会命中标题；当成推广卡时不看这些条件
  expect(railDecision({ blocklists: blocklists.value })).toBe(true)
  expect(railDecision({ blocklists: blocklists.value, isPromotedCard: true })).toBe(false)
  // 但只要推广位那一项开着，它照样走
  expect(railDecision({ blocklists: blocklists.value, isPromotedCard: true, removePromotedVideos: true })).toBe(true)
})

/**
 * 「移除所有侧边栏推荐内容」不是逐张卡的判断，而是整块消失：只藏卡片列表会留下一个孤零零的
 * 「展开」按钮（点它也一样没东西出来），所以那个按钮要跟着一起藏；「接下来播放」不动，那是自动
 * 连播的入口，不是推荐位。
 */
it('hides the list and its expander when the whole rail is turned off', () => {
  const holder = document.createElement('div')
  holder.className = 'recommend-list-v1'
  holder.innerHTML = `
    <div class="next-play"></div>
    <div class="rec-list"><div class="video-page-card-small"></div></div>
    <div class="rec-footer">展开</div>
  `

  const list = holder.querySelector<HTMLElement>('.rec-list')
  const nodes = railNodesForRemoveAll(list)

  expect(nodes).toEqual([list, holder.querySelector('.rec-footer')])
  // 「接下来播放」不在名单里
  expect(nodes).not.toContain(holder.querySelector('.next-play'))
})

it('handles a rail without the expander, and one that is not there at all', () => {
  const holder = document.createElement('div')
  holder.innerHTML = '<div class="rec-list"></div>'

  expect(railNodesForRemoveAll(holder.querySelector<HTMLElement>('.rec-list'))).toHaveLength(1)
  expect(railNodesForRemoveAll(null)).toEqual([])
})

/**
 * 开关本身：藏的时候列表与「展开」一起下去，关掉的时候都要交回来（不留半藏着的状态），
 * 反复开关也只记一份。
 */
it('hides and restores the list and its expander, however often it is toggled', () => {
  const holder = document.createElement('div')
  holder.className = 'recommend-list-v1'
  holder.innerHTML = `
    <div class="next-play"></div>
    <div class="rec-list"></div>
    <div class="rec-footer">展开</div>
  `

  const list = holder.querySelector<HTMLElement>('.rec-list')!
  const footer = holder.querySelector<HTMLElement>('.rec-footer')!
  const nextPlay = holder.querySelector<HTMLElement>('.next-play')!
  const state: RailRemoveAllState = { nodes: [] }

  setRailRemoveAll(list, state, true)
  expect(list.style.display).toBe('none')
  expect(footer.style.display).toBe('none')
  // 「接下来播放」不受影响
  expect(nextPlay.style.display).toBe('')
  expect(state.nodes).toHaveLength(2)

  // 藏了两次也只记一份，关一次就全回来了
  setRailRemoveAll(list, state, true)
  expect(state.nodes).toHaveLength(2)

  setRailRemoveAll(list, state, false)
  expect(list.style.display).toBe('')
  expect(footer.style.display).toBe('')
  expect(state.nodes).toEqual([])

  // 列表不在时什么都不做
  setRailRemoveAll(null, state, true)
  expect(state.nodes).toEqual([])
})
