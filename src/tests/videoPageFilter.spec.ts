import { beforeEach, expect, it, vi } from 'vitest'

import { FilterType, useFilter } from '~/composables/useFilter'
import { settings } from '~/logic/storage'
import { normalizeViewCountText, parseDurationText, readRecommendationCard, shouldHideCard } from '~/logic/videoPageRecommendationFilter'

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
