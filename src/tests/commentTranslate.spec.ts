import { runInThisContext } from 'node:vm'

import { afterEach, expect, it, vi } from 'vitest'

import injectSource from '~/inject/index.js?raw'
import { COMMENT_TRANSLATE_ATTR } from '~/logic/commentTranslate'

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
 * The comment translate feature rides the same main-world inject script as the IP location: the
 * comment components are lit elements, and the reply data (here `content.message`, the comment text)
 * hangs on page-owned instance properties an isolated world cannot see. So the buttons, the requests
 * and the result blocks all live in the inject script, which the content script only tells the switch
 * — on `<html>`, the same channel as the IP location.
 *
 * Like `commentIpLocation.spec.ts`, there is no importing that script (it ships as a classic script),
 * so this evaluates its source in the jsdom page and looks at what it leaves behind. The tree below is
 * the structure bilibili's own comment bundle renders: `bili-comments` → `#feed` →
 * `bili-comment-thread-renderer` → `#comment` → `bili-comment-renderer` → `#footer` →
 * `bili-comment-action-buttons-renderer` → `#pubdate`/`#like`/`#reply`, with sub-replies one
 * `bili-comment-replies-renderer` deeper. The Index-Translate endpoint itself is faked at `fetch`,
 * per model, so the 9b → 35b → 2b fallback chain can be walked end to end.
 */
const TRANSLATE_BUTTON_CLASS = 'bewly-comment-translate'
const TRANSLATION_BLOCK_CLASS = 'bewly-comment-translation'
const TRANSLATE_API = 'https://index-translate.bilibili.com/v1/chat/completions'
const MODELS = ['index-mt-9b', 'index-mt-35b', 'index-mt-2b']
const CHATTER_REPLY = '您想让我翻译的内容看起来不太完整，只输入了“fr”。可以试着提供完整的句子或段落，这样我就能帮您准确翻译了。'

let host: HTMLElement | undefined
let rpidSeed = 0

afterEach(() => {
  document.documentElement.removeAttribute(COMMENT_TRANSLATE_ATTR)
  vi.unstubAllGlobals()
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

function commentData(message: string) {
  rpidSeed += 1
  return { rpid: rpidSeed, content: { message } }
}

function renderCommentTree(topMessage: string, replyMessage?: string): { actions: HTMLElement, subActions?: HTMLElement } {
  host = document.createElement('div')
  host.id = 'commentapp'
  document.body.appendChild(host)

  const comments = createElement('bili-comments')
  host.appendChild(comments)
  const commentsRoot = shadowOf(comments)

  const feed = createElement('div', { id: 'feed' })
  commentsRoot.appendChild(feed)

  const thread = createElement('bili-comment-thread-renderer', { data: commentData(topMessage) })
  feed.appendChild(thread)
  const threadRoot = shadowOf(thread)

  const comment = createElement('bili-comment-renderer', { id: 'comment', data: commentData(topMessage) })
  threadRoot.appendChild(comment)
  const commentRoot = shadowOf(comment)
  const footer = createElement('div', { id: 'footer' })
  commentRoot.appendChild(footer)

  const actions = createElement('bili-comment-action-buttons-renderer', { data: commentData(topMessage) })
  footer.appendChild(actions)
  const actionsRoot = shadowOf(actions)
  const pubdate = createElement('div', { id: 'pubdate' })
  pubdate.textContent = '3天前'
  actionsRoot.appendChild(pubdate)
  actionsRoot.appendChild(createElement('div', { id: 'like' }))
  actionsRoot.appendChild(createElement('div', { id: 'reply' }))

  let subActions: HTMLElement | undefined
  if (replyMessage !== undefined) {
    const replies = createElement('bili-comment-replies-renderer')
    threadRoot.appendChild(replies)
    const repliesRoot = shadowOf(replies)
    const expanderContents = createElement('div', { id: 'expander-contents' })
    repliesRoot.appendChild(expanderContents)

    const subReply = createElement('bili-comment-reply-renderer', { data: commentData(replyMessage) })
    expanderContents.appendChild(subReply)
    const subReplyRoot = shadowOf(subReply)
    subActions = createElement('bili-comment-action-buttons-renderer', { data: commentData(replyMessage) })
    subReplyRoot.appendChild(subActions)
    // 楼中楼的操作栏没有回复按钮，按钮应当退到时间后面
    shadowOf(subActions).appendChild(createElement('div', { id: 'pubdate' }))
  }

  return { actions, subActions }
}

/** Runs the inject script against the current page with the switch already on, as the browser would. */
function startInject(): void {
  // jsdom has no Clipboard API, and the script's URL cleaner patches it on the way in
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => {} },
  })

  runInThisContext(`;(() => {\n${injectSource}\n})()`)

  document.documentElement.setAttribute(COMMENT_TRANSLATE_ATTR, 'true')

  // 默认的假接口：谁点都给出一份正常译文。测试里自备了按模型应答的假接口时不覆盖。
  if (!vi.isMockFunction(globalThis.fetch)) {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '默认译文' } }] }),
    })))
  }
}

type ModelAnswer = { content: string } | 'empty' | 'chatter' | Error

/** Fake Index-Translate endpoint answering per requested model. */
function stubTranslations(byModel: Record<string, ModelAnswer>) {
  const fetchMock = vi.fn(async (_url: unknown, init?: { body?: string }) => {
    const model = JSON.parse(init?.body ?? '{}').model as string
    const answer = byModel[model] ?? { content: '兜底译文' }
    if (answer instanceof Error)
      throw answer
    if (answer === 'empty')
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '' } }] }) }
    if (answer === 'chatter')
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: CHATTER_REPLY } }] }) }
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: answer.content } }] }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const settle = () => new Promise(resolve => setTimeout(resolve, 50))

function requestedModels(fetchMock: ReturnType<typeof stubTranslations>): string[] {
  return fetchMock.mock.calls.map(call => JSON.parse((call[1] as unknown as { body: string }).body).model)
}

it('puts a translate button on foreign comments and none on Chinese ones', async () => {
  const cases: Array<[string, boolean]> = [
    ['Great video, really enjoyed it!', true],
    ['今日もお疲れ様！この曲すごくいいね。', true],
    ['이 영상 진짜 좋아요!', true],
    ['Отличное видео, спасибо!', true],
    ['今天辛苦了，视频做得真好。', false],
    // 中文为主、夹杂一个外语词的评论读得懂，不给按钮
    ['今天看了一下午Netflix', false],
    // 链接剥掉之后没有可翻的东西
    ['https://www.bilibili.com/video/av1234', false],
    ['😂😂😂', false],
    ['', false],
    // 表情剥掉之后还剩外语内容的照常给按钮；剥完只剩中文（或什么都不剩）的不给
    ['Amazing video [脱单doge]', true],
    ['笑死[脱单doge]', false],
    ['[脱单doge][dog]', false],
  ]
  for (const [message, foreign] of cases) {
    const { actions } = renderCommentTree(message)
    startInject()
    await settle()

    const hasButton = actions.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`) !== null
    expect(hasButton, message).toBe(foreign)

    host?.remove()
    host = undefined
  }
})

it('places the button to the right of the reply button, falling back behind the timestamp', async () => {
  const { actions, subActions } = renderCommentTree('Amazing video!', 'Japanese reply here')
  startInject()
  await settle()

  const button = actions.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`) as HTMLElement
  expect(button.previousElementSibling!.id).toBe('reply')

  // 楼中楼没有 #reply，退到时间后面
  const subButton = subActions!.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`) as HTMLElement
  expect(subButton.previousElementSibling!.id).toBe('pubdate')
})

it('translates on click, toggles, and does not refetch the cached translation', async () => {
  const { actions } = renderCommentTree('Amazing video, love it!')
  startInject()
  const fetchMock = stubTranslations({ 'index-mt-9b': { content: '太棒了，超喜欢这个视频！' } })
  await settle()

  const button = actions.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`) as HTMLElement
  button.click()
  await settle()

  // 9b 先行；翻译块落在操作行正上方
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(requestedModels(fetchMock)).toEqual(['index-mt-9b'])
  expect(actions.parentElement!.querySelector(`.${TRANSLATION_BLOCK_CLASS}`)?.textContent).toBe('太棒了，超喜欢这个视频！')
  expect(button.textContent).toBe('收起翻译')

  button.click()
  await settle()
  expect(actions.parentElement!.querySelector(`.${TRANSLATION_BLOCK_CLASS}`)).toBeNull()
  expect(button.textContent).toBe('翻译')

  // 收起再展开走缓存，不再发请求
  button.click()
  await settle()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(actions.parentElement!.querySelector(`.${TRANSLATION_BLOCK_CLASS}`)?.textContent).toBe('太棒了，超喜欢这个视频！')
})

it('sends the OpenAI-style request with the comment text, emotes stripped', async () => {
  const { actions } = renderCommentTree('Amazing video [脱单doge]')
  startInject()
  const fetchMock = stubTranslations({})
  await settle()

  const button = actions.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`) as HTMLElement
  button.click()
  await settle()

  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe(TRANSLATE_API)
  expect(init.method).toBe('POST')
  const body = JSON.parse(init.body as string)
  expect(body.model).toBe('index-mt-9b')
  expect(body.messages).toEqual([{ role: 'user', content: '把这段话翻译成中文：Amazing video' }])
  expect(body.chat_template_kwargs).toEqual({ enable_thinking: false })
})

it('falls back to 35b when 9b comes back with nothing', async () => {
  const { actions } = renderCommentTree('Amazing video!')
  startInject()
  const fetchMock = stubTranslations({
    'index-mt-9b': 'empty',
    'index-mt-35b': { content: '35B 的译文' },
  })
  await settle()

  const button = actions.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`) as HTMLElement
  button.click()
  await settle()

  expect(requestedModels(fetchMock)).toEqual(['index-mt-9b', 'index-mt-35b'])
  expect(actions.parentElement!.querySelector(`.${TRANSLATION_BLOCK_CLASS}`)?.textContent).toBe('35B 的译文')
  expect(button.textContent).toBe('收起翻译')
})

it('treats advice-like replies as no result, all the way down to 2b', async () => {
  const { actions } = renderCommentTree('fr')
  startInject()
  const fetchMock = stubTranslations({
    'index-mt-9b': 'chatter',
    'index-mt-35b': 'chatter',
    'index-mt-2b': { content: '2B 的译文' },
  })
  await settle()

  const button = actions.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`) as HTMLElement
  button.click()
  await settle()

  expect(requestedModels(fetchMock)).toEqual(MODELS)
  expect(actions.parentElement!.querySelector(`.${TRANSLATION_BLOCK_CLASS}`)?.textContent).toBe('2B 的译文')
  expect(button.textContent).toBe('收起翻译')
})

it('shows failure only after every model has failed, and retries on the next click', async () => {
  const { actions } = renderCommentTree('Amazing video!')
  startInject()
  const fetchMock = stubTranslations({
    'index-mt-9b': 'chatter',
    'index-mt-35b': 'chatter',
    'index-mt-2b': 'chatter',
  })
  await settle()

  const button = actions.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`) as HTMLElement
  button.click()
  await settle()

  expect(requestedModels(fetchMock)).toEqual(MODELS)
  expect(actions.parentElement!.querySelector(`.${TRANSLATION_BLOCK_CLASS}`)?.textContent).toBe('翻译失败')
  expect(button.textContent).toBe('翻译')

  // 再点一次就是重试：这次让接口正常回话
  fetchMock.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: '成功了' } }] }),
  }))
  button.click()
  await settle()
  expect(actions.parentElement!.querySelector(`.${TRANSLATION_BLOCK_CLASS}`)?.textContent).toBe('成功了')
  expect(button.textContent).toBe('收起翻译')
})

it('re-attaches the open translation after a re-render wipes it', async () => {
  const { actions } = renderCommentTree('Amazing video!')
  startInject()
  stubTranslations({})
  await settle()

  const button = actions.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`) as HTMLElement
  button.click()
  await settle()
  expect(actions.parentElement!.querySelector(`.${TRANSLATION_BLOCK_CLASS}`)).not.toBeNull()

  // lit 重渲染会把自己渲染的节点重铺一遍，模拟它再动一次操作栏
  actions.shadowRoot!.appendChild(createElement('div', { id: 'dislike' }))
  await settle()

  expect(actions.parentElement!.querySelector(`.${TRANSLATION_BLOCK_CLASS}`)?.textContent).toBe('兜底译文')
  expect(actions.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`)).not.toBeNull()
})

it('colors the button B站 blue on hover, secondary colour otherwise', async () => {
  const { actions } = renderCommentTree('Amazing video!')
  startInject()
  await settle()

  const button = actions.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`) as HTMLElement
  expect(button.getAttribute('style')).toContain('var(--text3')

  button.dispatchEvent(new Event('mouseenter'))
  expect(button.getAttribute('style')).toContain('var(--brand_blue')

  button.dispatchEvent(new Event('mouseleave'))
  expect(button.getAttribute('style')).toContain('var(--text3')
  expect(button.getAttribute('style')).not.toContain('var(--brand_blue')
})

it('keeps the translation text in the comment body colour', async () => {
  const { actions } = renderCommentTree('Amazing video!')
  startInject()
  stubTranslations({})
  await settle()

  const button = actions.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`) as HTMLElement
  button.click()
  await settle()

  const block = actions.parentElement!.querySelector(`.${TRANSLATION_BLOCK_CLASS}`) as HTMLElement
  expect(block.getAttribute('style')).toContain('var(--text1')
})

it('gives sub-replies their own button without touching the Chinese parent', async () => {
  const { actions, subActions } = renderCommentTree('中文评论，不用翻。', 'Japanese reply here')
  startInject()
  stubTranslations({})
  await settle()

  expect(actions.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`)).toBeNull()
  expect(subActions!.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`)).not.toBeNull()

  const button = subActions!.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`) as HTMLElement
  button.click()
  await settle()
  // 楼中楼的操作按钮直接挂在 shadow root 下，块也在同一层里
  expect((subActions!.getRootNode() as ShadowRoot).querySelector(`.${TRANSLATION_BLOCK_CLASS}`)?.textContent).toBe('兜底译文')
})

it('takes the buttons and the open translations back when the switch turns off', async () => {
  const { actions } = renderCommentTree('Amazing video!')
  startInject()
  stubTranslations({})
  await settle()

  const button = actions.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`) as HTMLElement
  button.click()
  await settle()
  expect(actions.parentElement!.querySelector(`.${TRANSLATION_BLOCK_CLASS}`)).not.toBeNull()

  document.documentElement.setAttribute(COMMENT_TRANSLATE_ATTR, 'false')
  await settle()
  expect(actions.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`)).toBeNull()
  expect(actions.parentElement!.querySelector(`.${TRANSLATION_BLOCK_CLASS}`)).toBeNull()

  // 再打开时按钮回来；翻译状态挂在被收回的元素上，重新翻是新的一次
  document.documentElement.setAttribute(COMMENT_TRANSLATE_ATTR, 'true')
  await settle()
  expect(actions.shadowRoot!.querySelector(`.${TRANSLATE_BUTTON_CLASS}`)).not.toBeNull()
})
