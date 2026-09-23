import { settings } from '~/logic'
import { i18n } from '~/utils/i18n'

/**
 * Restores the 「已装填 N 条弹幕」 line in the player's danmaku bar, next to 「N人正在看」.
 *
 * bilibili still renders that line on bangumi pages, but on UGC video pages its player leaves it out
 * (`hideUgcDmNumber` in the player bundle skips the `-video-info-dm` block for UGC). The markup here is
 * the player's own, classes included, so its stylesheet does the styling and the line lands exactly
 * where bilibili puts it elsewhere. Ours carries a `data-bewly` marker so the two can be told apart —
 * when bilibili's own line is there (bangumi, or a future layout), nothing is added twice.
 *
 * The count comes from the video info row under the title (`.dm`, rendering `605` or `1.2万`), so no
 * request is made for it, and the number is the video's total rather than how much of it the player has
 * pulled so far.
 *
 * Started by the content script on video and bangumi pages outside of an iframe. The bangumi case is
 * left in on purpose: it is what keeps this from firing twice there.
 */

/** The player's danmaku bar and the two nodes that line is made of. */
const INFO_SELECTOR = '.bpx-player-video-info'
const DM_BLOCK_CLASS = 'bpx-player-video-info-dm'
const DIVIDE_CLASS = 'bpx-player-video-info-divide'
const NUM_CLASS = 'bpx-player-video-info-dm-num'
/** Marks our own nodes; bilibili's carry no such attribute. */
const OURS_ATTR = 'data-bewly-danmaku-count'
/** The info row sits under the title; `.dm-text` holds the number, the fallback the whole cell. */
const COUNT_SELECTORS = ['.video-info-detail-list .dm .dm-text', '.video-info-detail-list .dm']
/** The info row and the player mount at different moments, and a new video replaces the player. */
const SCAN_INTERVAL = 2000
/** Separator character the player renders between the two halves of the bar, Chinese comma included. */
const SEPARATOR = '，'
/** Stands in for the count while the localized sentence is split around it. */
const COUNT_MARKER = '\u0001'

/**
 * Started by the content script on video and bangumi pages outside of an iframe.
 */
export function setupVideoPageDanmakuCount() {
  let timer: number | undefined

  function readCount(): string {
    for (const node of Array.from(document.querySelectorAll<HTMLElement>(COUNT_SELECTORS.join(', ')))) {
      const match = /[\d.]+\s*[万亿萬億]?/.exec(node.textContent?.trim() ?? '')
      if (match)
        return match[0].replace(/\s+/g, '')
    }
    return ''
  }

  /** Our own block, when it is already in the bar. Bilibili's own is not marked, so it never matches. */
  function findOurs(info: Element | null): HTMLElement | null {
    return info?.querySelector<HTMLElement>(`.${DM_BLOCK_CLASS}[${OURS_ATTR}]`) ?? null
  }

  function remove() {
    document.querySelectorAll(`[${OURS_ATTR}]`).forEach(node => node.remove())
  }

  /** The sentence is split around the count so the number can keep the player's own styling. */
  function appendSentence(block: HTMLElement, count: string) {
    const sentence = String(i18n.global.t('common.loaded_danmaku_count', { count: COUNT_MARKER }))
    const num = document.createElement('span')
    num.className = NUM_CLASS
    num.textContent = count

    const parts = sentence.split(COUNT_MARKER)
    if (parts.length === 2)
      block.append(parts[0], num, parts[1])
    else
      block.append(num)
  }

  function insert(info: HTMLElement, count: string) {
    const divide = document.createElement('div')
    divide.className = DIVIDE_CLASS
    divide.setAttribute(OURS_ATTR, 'true')
    divide.textContent = SEPARATOR

    const block = document.createElement('div')
    block.className = DM_BLOCK_CLASS
    block.setAttribute(OURS_ATTR, 'true')
    appendSentence(block, count)

    info.append(divide, block)
  }

  function sync() {
    const info = document.querySelector<HTMLElement>(INFO_SELECTOR)
    // bilibili's own line: leave it alone and keep ours out of the way
    const theirs = info?.querySelector(`.${DM_BLOCK_CLASS}:not([${OURS_ATTR}])`)

    if (!info || theirs || !settings.value.videoPageShowLoadedDanmakuCount) {
      remove()
      return
    }

    const count = readCount()
    if (!count) {
      remove()
      return
    }

    const block = findOurs(info)
    if (!block) {
      insert(info, count)
      return
    }

    const num = block.querySelector(`.${NUM_CLASS}`)
    if (num && num.textContent !== count)
      num.textContent = count
  }

  function start() {
    sync()
    timer ??= window.setInterval(sync, SCAN_INTERVAL)
  }

  function stop() {
    remove()
    if (timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
  }

  watch(
    () => [settings.value.videoPageShowLoadedDanmakuCount, settings.value.language],
    () => {
      if (!settings.value.videoPageShowLoadedDanmakuCount) {
        stop()
        return
      }
      // A language change means the sentence itself has to be built again, not just re-numbered.
      remove()
      start()
    },
  )

  start()
}
