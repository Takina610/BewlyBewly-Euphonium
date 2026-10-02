import { beforeEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { settings } from '~/logic/storage'

// isVideoOrBangumiPage 要能返回 true（jsdom 的地址不是 B 站）；setCookie 用等价的真实现，
// 让 cookie 断言有据可查
vi.mock('~/utils/main', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/utils/main')>()
  return {
    ...actual,
    isVideoOrBangumiPage: () => true,
  }
})

const { useDark } = await import('~/composables/useDark')

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
 * 氛围光（ambilight）开着时，视频页的深浅色归它管：它强制暗色来衬光晕。Bewly 的适配若再写
 * 主题 cookie、发 themeChange 事件、动 bili_dark，评论区字体和导航栏就会被拉到另一边——页面
 * 深色配浅色的字，谁都看不清。这里钉住：开着时页面主题的三个写入通道全部静默，关掉后恢复；
 * Bewly 自己 UI 的 dark 类不受影响。
 */
let themeChangeEvents: string[] = []

beforeEach(() => {
  document.documentElement.className = ''
  document.body.className = ''
  document.cookie = 'theme_style=; max-age=0'
  themeChangeEvents = []
  window.addEventListener('global.themeChange', (e: Event) => {
    themeChangeEvents.push((e as CustomEvent).detail)
  })
  settings.value.videoPageAmbilight = true
  settings.value.theme = 'light'
  settings.value.slackingMode = false
})

function writtenCookie(): string | null {
  const match = document.cookie.match(/theme_style=(light|dark)/)
  return match ? match[1] : null
}

it('leaves the page theme alone while the ambilight owns it', async () => {
  useDark()
  await nextTick()
  await new Promise(r => setTimeout(r, 30))

  // 浅色偏好没有落到页面上：不写 cookie、不发 themeChange、不动 bili_dark
  expect(writtenCookie()).toBeNull()
  expect(themeChangeEvents).toEqual([])
  expect(document.documentElement.classList.contains('bili_dark')).toBe(false)

  // Bewly 自己 UI 的 dark 类照常（浅色下不该有）
  expect(document.querySelector('#bewly')?.classList.contains('dark') ?? false).toBe(false)
})

it('resumes the page theme when the ambilight is switched off', async () => {
  useDark()
  await nextTick()
  expect(themeChangeEvents).toEqual([])

  settings.value.videoPageAmbilight = false
  await nextTick()
  await new Promise(r => setTimeout(r, 30))

  // 适配恢复：浅色偏好重新落到页面上（cookie 在 jsdom 里写不进 .bilibili.com 域，断言事件通道）
  expect(themeChangeEvents).toContain('light')
})

it('still drives its own UI dark classes while the ambilight owns the page', async () => {
  document.body.innerHTML = '<div id="bewly"></div>'
  settings.value.theme = 'dark'

  useDark()
  await nextTick()
  await new Promise(r => setTimeout(r, 30))

  // 页面通道静默，但 Bewly 自己的 dark 类照常上（挂 html 与 #bewly）
  expect(document.documentElement.classList.contains('dark')).toBe(true)
  expect(writtenCookie()).toBeNull()
  expect(themeChangeEvents).toEqual([])
})
