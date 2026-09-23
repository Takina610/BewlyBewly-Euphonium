import { beforeEach, expect, it, vi } from 'vitest'

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

vi.mock('~/utils/i18n', () => ({
  i18n: { global: { t: () => '扩展已更新，请刷新页面' } },
}))

/**
 * Once the extension has been reloaded or updated under an open page, every request it makes fails
 * with `Extension context invalidated.` — and the home tabs, having no data and no error to show,
 * stayed blank until the page was refreshed. These cover the three things that end that confusion:
 * the promise never settles (so no caller sees an unexpected error, and none of them mistakes the
 * silence for "there was nothing to show"), the background is not called once the context is known to
 * be gone, and the user is told once per page.
 *
 * The module remembers that it has already spoken — that memory is per page, not per call — so the
 * tests below keep their order: the one that hears the notice runs before the one that proves the
 * second call stays quiet.
 */
const CONTEXT_INVALIDATED = 'Extension context invalidated.'

let toasts: string[] = []
let listener: EventListener | undefined

async function loadApi() {
  const [api, polyfill] = await Promise.all([
    import('~/utils/api'),
    import('webextension-polyfill'),
  ])
  return { ...api, browser: polyfill.default as typeof polyfill.default & { runtime: { id?: string } } }
}

beforeEach(() => {
  toasts = []
  if (listener)
    window.removeEventListener('bewlyApiToast', listener)
  listener = ((event: CustomEvent<{ message: string }>) => {
    toasts.push(event.detail.message)
  }) as EventListener
  window.addEventListener('bewlyApiToast', listener)
})

/** A promise that never settles is the point, so it is given a few turns to prove it. */
async function isSettled(promise: Promise<unknown>): Promise<boolean> {
  let settled = false
  promise.then(() => (settled = true), () => (settled = true))
  for (let i = 0; i < 4; i++)
    await Promise.resolve()
  return settled
}

it('sends through, and resolves with what the background answered', async () => {
  const { sendToExtension, browser } = await loadApi()
  browser.runtime.id = 'test-extension-id'
  const send = vi.fn(async () => ({ code: 0, data: 'ok' }))

  await expect(sendToExtension(send)).resolves.toEqual({ code: 0, data: 'ok' })
  expect(send).toHaveBeenCalledTimes(1)
})

it('never settles, and does not call the background, once the context is gone', async () => {
  const { sendToExtension, browser } = await loadApi()
  Object.assign(browser.runtime, { id: undefined })
  const send = vi.fn(async () => ({ code: 0 }))

  expect(await isSettled(sendToExtension(send))).toBe(false)
  expect(send).not.toHaveBeenCalled()
  expect(toasts).toEqual(['扩展已更新，请刷新页面'])
})

it('treats a context that dies mid-flight the same way, and stays quiet after the first time', async () => {
  const { sendToExtension } = await loadApi()
  const send = vi.fn(async () => {
    throw new Error(CONTEXT_INVALIDATED)
  })

  const before = toasts.length
  expect(await isSettled(sendToExtension(send))).toBe(false)
  const afterFirst = toasts.length
  expect(await isSettled(sendToExtension(send))).toBe(false)

  // The page has already been told by now (the test above heard it), and a second failure must not
  // add another message on top.
  expect(afterFirst - before).toBeLessThanOrEqual(1)
  expect(toasts.length).toBe(afterFirst)
})

it('lets every other error through untouched', async () => {
  // The test above left the context dead, and a dead context swallows every call before it is made
  const { sendToExtension, browser } = await loadApi()
  browser.runtime.id = 'test-extension-id'
  const error = new Error('boom')

  await expect(sendToExtension(async () => {
    throw error
  })).rejects.toBe(error)
})

it('matches the message exactly, so unrelated errors are not swallowed', async () => {
  const { isExtensionContextInvalidatedError } = await loadApi()

  expect(isExtensionContextInvalidatedError(new Error(CONTEXT_INVALIDATED))).toBe(true)
  expect(isExtensionContextInvalidatedError(CONTEXT_INVALIDATED)).toBe(true)
  expect(isExtensionContextInvalidatedError(new Error('Extension context invalidated. (extra)'))).toBe(false)
  expect(isExtensionContextInvalidatedError(new Error('Extension context invalid'))).toBe(false)
  expect(isExtensionContextInvalidatedError(undefined)).toBe(false)
})
