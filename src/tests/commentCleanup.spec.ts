import { runInThisContext } from 'node:vm'

import { afterEach, expect, it, vi } from 'vitest'

import injectSource from '~/inject/index.js?raw'
import { COMMENT_CLEANUP_ATTR } from '~/logic/commentCleanup'

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
 * Hiding the whole comment section is a stylesheet the inject script writes: the section is a page-owned
 * component tree, and only the main world sees the flag the content script puts on `<html>`.
 *
 * The script runs against jsdom's `document` here, so the rules it writes can be read back — the
 * selectors themselves are verified against bilibili's own comment markup elsewhere.
 */
const STYLE_ID = 'bewly-comment-cleanup'
const SECTION_SELECTOR = '#commentapp, #comment-module, .bili-comment-container, .comment-wrap bili-comments'

function styleText(): string {
  return document.getElementById(STYLE_ID)?.textContent ?? ''
}

afterEach(() => {
  document.documentElement.removeAttribute(COMMENT_CLEANUP_ATTR)
  document.getElementById(STYLE_ID)?.remove()
})

// jsdom has no Clipboard API, and the script's URL cleaner patches it on the way in
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async () => {} },
})

// 观察器回调是异步的（微任务），改完开关要等一拍才看得到样式
const settle = () => new Promise(resolve => setTimeout(resolve, 20))

it('writes no rules until the switch is on, and takes them back when it goes off', async () => {
  runInThisContext(`;(() => {\n${injectSource}\n})()`)

  expect(styleText()).toBe('')

  document.documentElement.setAttribute(COMMENT_CLEANUP_ATTR, JSON.stringify({ hideSection: true }))
  await settle()
  expect(styleText()).toContain(`${SECTION_SELECTOR} { display: none !important; }`)

  document.documentElement.setAttribute(COMMENT_CLEANUP_ATTR, JSON.stringify({ hideSection: false }))
  await settle()
  expect(styleText()).toBe('')
})

it('ignores a flag it cannot read', async () => {
  runInThisContext(`;(() => {\n${injectSource}\n})()`)

  document.documentElement.setAttribute(COMMENT_CLEANUP_ATTR, 'not json')
  await settle()
  expect(styleText()).toBe('')

  document.documentElement.setAttribute(COMMENT_CLEANUP_ATTR, JSON.stringify({ somethingElse: true }))
  await settle()
  expect(styleText()).toBe('')
})
