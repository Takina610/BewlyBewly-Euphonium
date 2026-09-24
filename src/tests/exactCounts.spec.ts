import { beforeEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import {
  formatExactCount,
  readAbbreviatedValue,
  readExactCount,
  readExactFromTooltip,
  setupExactCounts,
  withExactCount,
} from '~/logic/exactCounts'
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
 * The space page writes its counts abbreviated, but the exact number is already on the element as a
 * `title`. What is checked here is that only that pairing is touched: an abbreviated figure with a
 * full value behind it, never a count that is already exact, and never an element that merely has a
 * `title`.
 *
 * The module keeps one interval for the life of the page, so it is started once for the file.
 */
const SCAN_INTERVAL = 2000
let started = false

function ensureStarted() {
  if (started)
    return
  started = true
  setupExactCounts()
}

/** The space page's header counter, as bilibili renders it. */
function mountCounter(value = '1,429,271', shown = '142.9万') {
  document.body.innerHTML = `
    <div class="nav-statistics">
      <a class="nav-statistics__item" href="/2/relation/fans">
        <span class="nav-statistics__item-text">粉丝数</span>
        <span class="nav-statistics__item-num" title="${value}">${shown}</span>
      </a>
    </div>
  `
  return document.querySelector('.nav-statistics__item-num') as HTMLElement
}

beforeEach(() => {
  vi.useFakeTimers()
  settings.value.showExactCounts = true
  document.body.innerHTML = ''
})

it('writes a full number with thousand separators', () => {
  expect(formatExactCount(1429271)).toBe('1,429,271')
  expect(formatExactCount(429)).toBe('429')
  expect(formatExactCount('1,429,271')).toBe('1,429,271')
  expect(formatExactCount('142.9万')).toBe('142.9万')
})

it('takes the full value off the element, and only when there is one to take', () => {
  expect(readExactCount('1,429,271', '142.9万')).toBe('1,429,271')
  // 本来就是完整值，没什么可换的
  expect(readExactCount('429', '429')).toBeNull()
  // 没有 title 就没有完整值可读，别猜
  expect(readExactCount(null, '142.9万')).toBeNull()
  expect(readExactCount('', '142.9万')).toBeNull()
  expect(readExactCount('很多', '142.9万')).toBeNull()
})

it('reads an abbreviation as a rough number', () => {
  expect(readAbbreviatedValue('142.9万')).toBe(1429000)
  expect(readAbbreviatedValue('1878.2万')).toBe(18782000)
  expect(readAbbreviatedValue('5.3亿')).toBe(530000000)
  expect(readAbbreviatedValue('5.3億分钟')).toBe(530000000)
  expect(readAbbreviatedValue('429')).toBeNull()
  // 整块文字得就是那个缩写（后面可以跟个单位），一句话里带着缩写不算
  expect(readAbbreviatedValue('已有1.5万人看过')).toBeNull()
})

it('finds the full value inside the tooltip sentence those two rows carry', () => {
  // 空间页头部：关注数、粉丝数直接放完整值，获赞数与播放数放的是一句话（B 站的 stats.like_tooltip）
  expect(readExactFromTooltip('截至2026.09.23, 视频、动态、专栏累计获赞18,782,000', '1878.2万')).toBe('18,782,000')
  expect(readExactFromTooltip('截止昨天，累计播放数为530,247,318', '5.3亿')).toBe('530,247,318')
  expect(readExactFromTooltip('截止昨天，累计播放为530,247,318分钟', '5.3亿分钟')).toBe('530,247,318')

  // 句子里的数字跟缩写对不上就别认：那多半是日期、序号之类的别的数
  expect(readExactFromTooltip('【4K】某某 2024', '1.5万')).toBeNull()
  expect(readExactFromTooltip('截至2026.09.23, 累计获赞9,812', '1878.2万')).toBeNull()
  // 没有 title、或这行不是缩写，都不动
  expect(readExactFromTooltip(null, '1878.2万')).toBeNull()
  expect(readExactFromTooltip('截至2026.09.23, 累计获赞18,782,000', '1878')).toBeNull()
})

it('keeps whatever follows the abbreviation', () => {
  // 直播 / 音视频的播放数带着单位，换完得留着
  expect(withExactCount('5.3亿分钟', '截止昨天，累计播放为530,247,318分钟')).toBe('530,247,318分钟')
  expect(withExactCount('142.9万', '1,429,271')).toBe('1,429,271')
  expect(withExactCount('429', '429')).toBeNull()
})

it('shows the full number where bilibili writes the abbreviation', async () => {
  ensureStarted()
  const counter = mountCounter()

  await vi.advanceTimersByTimeAsync(SCAN_INTERVAL)

  expect(counter.textContent).toBe('1,429,271')
})

it('leaves a count that is already exact alone', async () => {
  ensureStarted()
  const counter = mountCounter('429', '429')

  await vi.advanceTimersByTimeAsync(SCAN_INTERVAL)

  expect(counter.textContent).toBe('429')
  expect(counter.hasAttribute('data-bewly-exact-count')).toBe(false)
})

/**
 * 空间页头部那一排的真实样子：关注数、粉丝数的 title 是完整值，获赞数、播放数的 title 是一句 tooltip
 * （`s1.hdslb.com/.../fresh-space` 里 `count: l("stats.like_tooltip", ...)`）。四条都要换成完整值，
 * 否则用户看到的就是「只有粉丝数生效」。
 */
function mountStatisticsRow() {
  document.body.innerHTML = `
    <div class="nav-statistics">
      <div class="nav-statistics__item">
        <span class="nav-statistics__item-text">关注数</span>
        <span class="nav-statistics__item-num" title="429">429</span>
      </div>
      <a class="nav-statistics__item" href="/2/relation/fans">
        <span class="nav-statistics__item-text">粉丝数</span>
        <span class="nav-statistics__item-num" title="1,429,271">142.9万</span>
      </a>
      <div class="nav-statistics__item">
        <span class="nav-statistics__item-text">获赞数</span>
        <span class="nav-statistics__item-num" title="截至2026.09.23, 视频、动态、专栏累计获赞18,782,000">1878.2万</span>
      </div>
      <div class="nav-statistics__item">
        <span class="nav-statistics__item-text">播放数</span>
        <span class="nav-statistics__item-num" title="截止昨天，累计播放数为530,247,318">5.3亿</span>
      </div>
    </div>
  `
  return Array.from(document.querySelectorAll<HTMLElement>('.nav-statistics__item-num'))
}

it('writes every count of the space header in full, tooltip rows included', async () => {
  ensureStarted()
  const [following, fans, likes, play] = mountStatisticsRow()

  await vi.advanceTimersByTimeAsync(SCAN_INTERVAL)

  expect(following.textContent).toBe('429')
  expect(fans.textContent).toBe('1,429,271')
  expect(likes.textContent).toBe('18,782,000')
  expect(play.textContent).toBe('530,247,318')

  // 关掉之后四条都回到缩写
  settings.value.showExactCounts = false
  await nextTick()
  await vi.advanceTimersByTimeAsync(SCAN_INTERVAL)

  expect(likes.textContent).toBe('1878.2万')
  expect(play.textContent).toBe('5.3亿')
})

it('leaves the numbers inside a shadow root alone', async () => {
  ensureStarted()
  // 评论区是 web component，数字在它的 shadow root 里：这套管的是空间页头部那几个数，不该伸进评论区
  const replies = document.createElement('div')
  replies.className = 'bili-comments'
  document.body.appendChild(replies)
  const root = replies.attachShadow({ mode: 'open' })
  root.innerHTML = '<span title="1,429,271">142.9万</span>'

  await vi.advanceTimersByTimeAsync(SCAN_INTERVAL)

  expect(root.querySelector('span')?.textContent).toBe('142.9万')
})

it('puts the abbreviation back when the switch goes off', async () => {
  ensureStarted()
  const counter = mountCounter()

  await vi.advanceTimersByTimeAsync(SCAN_INTERVAL)
  expect(counter.textContent).toBe('1,429,271')

  settings.value.showExactCounts = false
  await nextTick()
  await vi.advanceTimersByTimeAsync(SCAN_INTERVAL)

  expect(counter.textContent).toBe('142.9万')
})

it('keeps up with a header that is rendered again', async () => {
  ensureStarted()
  mountCounter()
  await vi.advanceTimersByTimeAsync(SCAN_INTERVAL)

  // 切换标签之类的操作会把这块整个换掉
  const counter = mountCounter()
  await vi.advanceTimersByTimeAsync(SCAN_INTERVAL)

  expect(counter.textContent).toBe('1,429,271')
})
