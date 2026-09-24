import { runInThisContext } from 'node:vm'

import { afterEach, expect, it, vi } from 'vitest'

import injectSource from '~/inject/index.js?raw'
import { COMMENT_GENDER_ATTR, COMMENT_IP_LOCATION_ATTR } from '~/logic/commentIpLocation'

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
 * The comment section's IP location is unreachable from a content script: the comment components are
 * lit elements that keep the reply data on a page-owned JS property, and an isolated world cannot see
 * custom-element instance properties. So the reading and the DOM work both live in the main-world
 * inject script, which the content script can only tell one thing — the switch on `<html>`.
 *
 * There is no way to unit-test that script by importing it (it is copied verbatim into the extension
 * as a classic script), so this evaluates its source in the jsdom page and looks at the DOM it leaves
 * behind. The structure below is the one bilibili's own comment bundle renders (verified against
 * `bili-comments.<hash>.js`): `bili-comments` → `#feed` → `bili-comment-thread-renderer` → `#comment` →
 * `bili-comment-renderer` → `#footer` → `bili-comment-action-buttons-renderer` → `#pubdate`, with
 * sub-replies one `bili-comment-replies-renderer` deeper.
 */
const LOCATION_CLASS = 'bewly-comment-location'
const GENDER_CLASS = 'bewly-comment-gender'

interface Tree {
  actions: HTMLElement
  subActions: HTMLElement
}

let host: HTMLElement | undefined

afterEach(() => {
  document.documentElement.removeAttribute(COMMENT_IP_LOCATION_ATTR)
  document.documentElement.removeAttribute(COMMENT_GENDER_ATTR)
  host?.remove()
  host = undefined
})

function createElement(name: string, props: Record<string, unknown> = {}): HTMLElement {
  const node = document.createElement(name)
  Object.assign(node, props)
  return node
}

function shadowOf(element: HTMLElement): ShadowRoot {
  return element.attachShadow({ mode: 'open' })
}

function replyData(location: string, sex = '') {
  return { rpid: 1, reply_control: { location }, member: { sex } }
}

/** Builds the comment tree, returns nothing about it but the two action-button shadow hosts. */
function renderCommentTree(): Tree {
  host = document.createElement('div')
  host.id = 'commentapp'
  document.body.appendChild(host)

  const comments = createElement('bili-comments')
  host.appendChild(comments)
  const commentsRoot = shadowOf(comments)

  const feed = createElement('div', { id: 'feed' })
  commentsRoot.appendChild(feed)

  const thread = createElement('bili-comment-thread-renderer', { data: replyData('IP属地：上海') })
  feed.appendChild(thread)
  const threadRoot = shadowOf(thread)

  const comment = createElement('bili-comment-renderer', { id: 'comment', data: replyData('IP属地：上海') })
  threadRoot.appendChild(comment)
  const commentRoot = shadowOf(comment)
  const footer = createElement('div', { id: 'footer' })
  commentRoot.appendChild(footer)

  const actions = createElement('bili-comment-action-buttons-renderer', { data: replyData('IP属地：上海') })
  footer.appendChild(actions)
  const actionsRoot = shadowOf(actions)
  const pubdate = createElement('div', { id: 'pubdate' })
  pubdate.textContent = '3天前'
  actionsRoot.appendChild(pubdate)
  actionsRoot.appendChild(createElement('div', { id: 'like' }))

  const replies = createElement('bili-comment-replies-renderer')
  threadRoot.appendChild(replies)
  const repliesRoot = shadowOf(replies)
  const expanderContents = createElement('div', { id: 'expander-contents' })
  repliesRoot.appendChild(expanderContents)

  const subReply = createElement('bili-comment-reply-renderer', { data: replyData('IP属地：广东') })
  expanderContents.appendChild(subReply)
  const subReplyRoot = shadowOf(subReply)
  const subActions = createElement('bili-comment-action-buttons-renderer', { data: replyData('IP属地：广东') })
  subReplyRoot.appendChild(subActions)
  shadowOf(subActions).appendChild(createElement('div', { id: 'pubdate' }))

  return { actions, subActions }
}

/** Runs the inject script against the current page, with the switch already on. */
function startInjectWithSwitchOn(): void {
  // jsdom has no Clipboard API, and the script's URL cleaner patches it on the way in
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => {} },
  })

  // As a classic script, exactly as the browser runs it in the page. Wrapped in a scope of its own
  // because this global outlives the test, and the script declares top-level names.
  runInThisContext(`;(() => {\n${injectSource}\n})()`)

  document.documentElement.setAttribute(COMMENT_IP_LOCATION_ATTR, 'true')
}

function turnSwitch(on: boolean): void {
  document.documentElement.setAttribute(COMMENT_IP_LOCATION_ATTR, String(on))
}

const settle = () => new Promise(resolve => setTimeout(resolve, 50))

it('shows the IP location the reply data already carries, after the timestamp', async () => {
  const { actions, subActions } = renderCommentTree()
  startInjectWithSwitchOn()
  await settle()

  const top = actions.shadowRoot!.querySelector(`.${LOCATION_CLASS}`)
  const sub = subActions.shadowRoot!.querySelector(`.${LOCATION_CLASS}`)

  expect(top?.textContent).toBe('IP属地：上海')
  expect(sub?.textContent).toBe('IP属地：广东')
  // Right behind the comment's timestamp, which is where the location belongs
  expect(top?.previousElementSibling?.id).toBe('pubdate')
  // `--text3` is the colour the component itself gives its secondary text
  expect(top?.getAttribute('style')).toContain('var(--text3')
})

it('stays out of the comment section while the switch is off', async () => {
  const { actions } = renderCommentTree()
  startInjectWithSwitchOn()
  await settle()

  turnSwitch(false)
  await settle()
  expect(actions.shadowRoot!.querySelector(`.${LOCATION_CLASS}`)).toBeNull()

  turnSwitch(true)
  await settle()
  expect(actions.shadowRoot!.querySelector(`.${LOCATION_CLASS}`)).not.toBeNull()
})

it('leaves comments that carry no location, and later ones are picked up as they load', async () => {
  const { actions } = renderCommentTree()
  const commentsRoot = (document.querySelector('bili-comments') as HTMLElement).shadowRoot!
  startInjectWithSwitchOn()
  await settle()

  // A comment without a location in its reply data gets nothing — and adds nothing downstream
  const feed = commentsRoot.querySelector('#feed') as HTMLElement
  const bare = createElement('bili-comment-thread-renderer', { data: { rpid: 2, reply_control: { location: '' } } })
  feed.appendChild(bare)
  const bareRoot = shadowOf(bare)
  const bareActions = createElement('bili-comment-action-buttons-renderer', { data: { rpid: 2, reply_control: { location: '' } } })
  bareRoot.appendChild(bareActions)
  const bareActionsRoot = shadowOf(bareActions)
  bareActionsRoot.appendChild(createElement('div', { id: 'pubdate' }))
  await settle()

  expect(bareActionsRoot.querySelector(`.${LOCATION_CLASS}`)).toBeNull()
  expect(actions.shadowRoot!.querySelectorAll(`.${LOCATION_CLASS}`).length).toBe(1)

  // Comments that arrive later (paging, newly posted) must show up without the switch being touched
  const late = createElement('bili-comment-action-buttons-renderer', { data: replyData('IP属地：北京') })
  const lateRoot = shadowOf(late)
  lateRoot.appendChild(createElement('div', { id: 'pubdate' }))
  bareActionsRoot.appendChild(late)
  await settle()

  expect(lateRoot.querySelector(`.${LOCATION_CLASS}`)?.textContent).toBe('IP属地：北京')

  // lit attaches the shadow root when the element is constructed and fills it a microtask later, so a
  // comment can be discovered while its shadow root is still empty. That tree layer still has to be
  // watched, otherwise everything rendered into it from then on goes unnoticed.
  const pending = createElement('bili-comment-action-buttons-renderer', { data: replyData('IP属地：四川') })
  const pendingRoot = shadowOf(pending)
  bareActionsRoot.appendChild(pending)
  await settle()
  expect(pendingRoot.querySelector(`.${LOCATION_CLASS}`)).toBeNull()

  pendingRoot.appendChild(createElement('div', { id: 'pubdate' }))
  await settle()
  expect(pendingRoot.querySelector(`.${LOCATION_CLASS}`)?.textContent).toBe('IP属地：四川')
})

/**
 * Gender rides along with the location: same place, same styling, same switch channel. It is its own
 * switch, so the two have to be able to stand alone — including the case where gender is shown while
 * the location is not, where it takes the location's place behind the timestamp.
 *
 * 「保密」照实显示：它在评论里是多数派，藏掉的话看着就像这儿没生效。
 */
it('shows the gender behind the location, private included', async () => {
  const { actions } = renderCommentTree()
  startInjectWithSwitchOn()

  // 这一条的数据里有性别
  const withSex = createElement('bili-comment-action-buttons-renderer', { data: replyData('IP属地：上海', '女') })
  const withSexRoot = shadowOf(withSex)
  const pubdate = createElement('div', { id: 'pubdate' })
  withSexRoot.appendChild(pubdate)
  actions.parentElement!.appendChild(withSex)

  turnGender(true)
  await settle()

  const gender = withSexRoot.querySelector(`.${GENDER_CLASS}`)
  expect(gender?.textContent).toBe('女')
  expect(gender?.previousElementSibling?.textContent).toBe('IP属地：上海')
  expect(gender?.getAttribute('style')).toContain('var(--text3')

  // 没公开性别的也显示，评论里这一种最多
  const privateOne = createElement('bili-comment-action-buttons-renderer', { data: replyData('IP属地：北京', '保密') })
  const privateRoot = shadowOf(privateOne)
  privateRoot.appendChild(createElement('div', { id: 'pubdate' }))
  actions.parentElement!.appendChild(privateOne)
  await settle()
  expect(privateRoot.querySelector(`.${GENDER_CLASS}`)?.textContent).toBe('保密')
})

it('puts the gender where the location would be when only the gender is on', async () => {
  const { actions } = renderCommentTree()
  startInjectWithSwitchOn()
  turnSwitch(false)
  turnGender(true)
  await settle()

  const gender = actions.shadowRoot!.querySelector(`.${GENDER_CLASS}`)
  // 那一条的数据里没写性别，所以这里只检查位置：紧跟时间
  expect(gender).toBeNull()
  expect(actions.shadowRoot!.querySelector(`.${LOCATION_CLASS}`)).toBeNull()

  // 换一条有性别的：它落在时间后面，也就是属地本该在的地方
  const only = createElement('bili-comment-action-buttons-renderer', { data: replyData('', '男') })
  const onlyRoot = shadowOf(only)
  onlyRoot.appendChild(createElement('div', { id: 'pubdate' }))
  actions.parentElement!.appendChild(only)
  await settle()

  expect(onlyRoot.querySelector(`.${GENDER_CLASS}`)?.textContent).toBe('男')
  expect(onlyRoot.querySelector(`.${GENDER_CLASS}`)?.previousElementSibling?.id).toBe('pubdate')
})

function turnGender(on: boolean): void {
  document.documentElement.setAttribute(COMMENT_GENDER_ATTR, String(on))
}
