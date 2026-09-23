import { BEWLY_API_TOAST } from '~/constants/globalEvents'

export type NotifyType = 'error' | 'warning' | 'info' | 'success'

/**
 * Puts a short message in front of the user through the app's toast layer.
 *
 * The event name says API because that is where this started — the main-world inject script cannot
 * reach the toast layer directly, so it shouts and the app listens. It is the only such channel, so
 * anything running before or outside the Vue tree can use it too.
 */
export function notifyUser(message: string, type: NotifyType = 'warning') {
  window.dispatchEvent(new CustomEvent(BEWLY_API_TOAST, { detail: { message, type } }))
}

/** Sentences already put in front of the user on this page. */
const shownMessages = new Set<string>()

/**
 * Same as `notifyUser`, but a given sentence is only ever shown once per page.
 *
 * One failure tends to reach this layer from several places at once — the following tab asks for three
 * pages in a row, and a request that fails can be reported by both the error-code branch and the
 * `catch` around it — and the same sentence three times tells the user nothing the first one did not.
 */
export function notifyUserOnce(message: string, type: NotifyType = 'warning') {
  if (shownMessages.has(message))
    return
  shownMessages.add(message)
  notifyUser(message, type)
}
