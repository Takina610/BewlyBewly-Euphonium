import { beforeEach, expect, it, vi } from 'vitest'

/**
 * A failure usually reaches the user through more than one path — the following tab asks for three
 * pages in a row, and a request can be reported by both the error-code branch and the `catch` around
 * it — so the same sentence has to be shown once, not once per path.
 *
 * The notice is published as an event the app listens for, which is also what these observe.
 */
let toasts: Array<{ message: string, type: string }> = []
let listener: EventListener | undefined

async function loadNotify() {
  return await import('~/utils/notify')
}

beforeEach(() => {
  vi.resetModules()
  toasts = []
  if (listener)
    window.removeEventListener('bewlyApiToast', listener)
  listener = ((event: CustomEvent<{ message: string, type: string }>) => {
    toasts.push(event.detail)
  }) as EventListener
  window.addEventListener('bewlyApiToast', listener)
})

it('shows a sentence once, however many places report it', async () => {
  const { notifyUserOnce } = await loadNotify()

  notifyUserOnce('加载失败，刷新页面可重试', 'error')
  notifyUserOnce('加载失败，刷新页面可重试', 'error')
  notifyUserOnce('加载失败，刷新页面可重试', 'error')

  expect(toasts).toEqual([{ message: '加载失败，刷新页面可重试', type: 'error' }])
})

it('still shows a different sentence, and with its own type', async () => {
  const { notifyUserOnce } = await loadNotify()

  notifyUserOnce('加载失败，刷新页面可重试', 'error')
  notifyUserOnce('扩展已更新，请刷新页面', 'warning')

  expect(toasts).toEqual([
    { message: '加载失败，刷新页面可重试', type: 'error' },
    { message: '扩展已更新，请刷新页面', type: 'warning' },
  ])
})

it('leaves the deliberate, always-deliver path alone', async () => {
  const { notifyUserOnce, notifyUser } = await loadNotify()

  notifyUserOnce('加载失败，刷新页面可重试', 'error')
  notifyUser('加载失败，刷新页面可重试', 'error')

  expect(toasts).toHaveLength(2)
})
