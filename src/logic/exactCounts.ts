import { settings } from '~/logic'

/**
 * 数量精确显示：把 B 站缩写成 `142.9万` 的数字换回完整值。
 *
 * 不用问接口：完整值就挂在同一个节点上。空间页头部那几格（`span.nav-statistics__item-num`）的 `title`
 * 有两种写法——关注数、粉丝数直接放完整值（`1,429,271`），获赞数、播放数放的是一句 tooltip
 * （`截至2026.09.23, 视频、动态、专栏累计获赞18,782,000`）。两种都要认，这也是这一版改的原因：
 * 只认纯数字的时候，获赞数与播放数就被漏掉了。
 *
 * 认的是「整块文字是缩写 + 有 title」这一对条件，而不是钉死那一串类名：这几格用的是同一个组件，
 * 钉死类名的话，B 站换个写法这个功能就悄悄失效了。
 *
 * 只走 light DOM：评论区是 web component，数字都在它的 shadow root 里，本来就不在扫描范围里——
 * 这个功能管的是空间页头部与顶栏「我的」面板那几个数，评论区的数字不动。
 */

/** 整块文字就是「缩写 + 可选短单位」：`142.9万`、`1878.2万`、`5.3亿`、`5.3亿分钟`。 */
const ABBREVIATED_RE = /^(\d[\d.]*)([万亿萬億])\D{0,4}$/
/** `title` 直接就是完整值的时候，它长这样：可以有千位分隔符。 */
const EXACT_RE = /^[\d,]+$/
/** 缩写里那个单位换算成多少。 */
const UNIT_FACTORS: Record<string, number> = { 万: 1e4, 萬: 1e4, 亿: 1e8, 億: 1e8 }

/** 多久看一遍页面上的数字。切换标签、软导航都会让这块重新渲染。 */
const SCAN_INTERVAL = 2000
/** 动过的节点挂这个属性，值就是原来那行缩写，方便原样还回去。 */
const EXACT_ATTR = 'data-bewly-exact-count'

/** 显示用的完整数值：`1429271` → `1,429,271`。 */
export function formatExactCount(value: number | string): string {
  const num = typeof value === 'string' ? Number(value.replace(/,/g, '')) : value
  if (!Number.isFinite(num))
    return String(value)

  return String(Math.round(num)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 缩写读成一个大致的数：`1878.2万` → `18782000`。认不出就返回 null。 */
export function readAbbreviatedValue(shown: string): number | null {
  const match = ABBREVIATED_RE.exec(shown.trim())
  if (!match)
    return null

  const value = Number(match[1]) * UNIT_FACTORS[match[2]]
  return Number.isFinite(value) ? value : null
}

/**
 * `title` 里的完整值，没什么可换的（或认不出）就返回 null。原样返回字符串而不是转成数字：
 * 这个数只用来显示，不必在这里做算术。
 */
export function readExactCount(title: string | null | undefined, shown: string): string | null {
  if (!title || !EXACT_RE.test(title.trim()))
    return null

  const exact = title.trim()
  // 本来就是完整值（关注数只有几百），换上去等于没换
  return exact.replace(/,/g, '') === shown.replace(/,/g, '') ? null : exact
}

/**
 * tooltip 那句话里的完整值。句子里的日期同样是数字（`截至2026.09.23`），所以从后往前挑第一段
 * 数字，并要求它跟缩写对得上——差得超过一个「单位刻度」就是不认识的格式，宁可不动。
 * 容差取 0.06 个单位（万是 600、亿是 600 万）：正好盖住四舍五入那点误差，又不至于把日期认成数值。
 */
export function readExactFromTooltip(title: string | null | undefined, shown: string): string | null {
  const match = ABBREVIATED_RE.exec(shown.trim())
  if (!title || !match)
    return null

  const abbreviated = Number(match[1]) * UNIT_FACTORS[match[2]]
  if (!Number.isFinite(abbreviated))
    return null

  const tolerance = UNIT_FACTORS[match[2]] * 0.06
  const groups = title.match(/\d[\d,]*/g) ?? []
  for (let i = groups.length - 1; i >= 0; i--) {
    const exact = Number(groups[i].replace(/,/g, ''))
    if (Number.isFinite(exact) && Math.abs(exact - abbreviated) <= tolerance)
      return groups[i]
  }
  return null
}

/**
 * 换上去之后这行该显示什么；没什么可换就返回 null。缩写后面跟着的短单位（播放数带 `分钟`）留着。
 */
export function withExactCount(shown: string, title: string | null | undefined): string | null {
  const match = ABBREVIATED_RE.exec(shown.trim())
  if (!match)
    return null

  const exact = readExactCount(title, shown) ?? readExactFromTooltip(title, shown)
  if (!exact)
    return null

  return shown.trim().replace(`${match[1]}${match[2]}`, exact)
}

/**
 * 起这一套。页面门在调用点（`contentScripts/index.ts`）：只有在个人空间页上，这些数字才由这套
 * 组件渲染。
 */
export function setupExactCounts() {
  function scan() {
    if (!settings.value.showExactCounts) {
      restoreAll()
      return
    }

    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[title]'))) {
      const shown = el.textContent ?? ''
      const exact = withExactCount(shown, el.getAttribute('title'))
      if (!exact)
        continue

      el.setAttribute(EXACT_ATTR, shown)
      el.textContent = exact
    }
  }

  function restoreAll() {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[${EXACT_ATTR}]`))) {
      const shown = el.getAttribute(EXACT_ATTR)
      if (shown)
        el.textContent = shown
      el.removeAttribute(EXACT_ATTR)
    }
  }

  const guard = window.setInterval(scan, SCAN_INTERVAL)
  scan()
  watch(() => settings.value.showExactCounts, scan)

  return () => {
    window.clearInterval(guard)
    restoreAll()
  }
}
