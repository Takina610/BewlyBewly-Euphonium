import type { API_COLLECTION } from '~/background/messageListeners/api'
import { isExtensionContextValid } from '~/utils/extensionContext'
import { i18n } from '~/utils/i18n'
import { notifyUserOnce } from '~/utils/notify'

type CamelCase<S extends string> = S extends `${infer P1}_${infer P2}${infer P3}`
  ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
  : Lowercase<S>

type APIFunction<T = typeof API_COLLECTION> = {
  [K in keyof T as CamelCase<string & K>]: {
    // @ts-expect-error allow params
    [P in keyof T[K]]: T[K][P] extends Function ? T[K][P] : Lowercase<T[K][P]['_fetch']['method']> extends 'get' ? (options?: Partial<T[K][P]['params']>) => Promise<any> : (options?: Partial<T[K][P]['params'] & T[K][P]['_fetch']['body']>) => Promise<any>
  }
}

/**
 * `Extension context invalidated.` is what a `browser.*` call throws once the extension has been
 * reloaded or updated under a page that stayed open: this content script is orphaned and can never
 * reach the background again. Matched exactly — a prefix test would swallow unrelated errors.
 */
const CONTEXT_INVALIDATED_MESSAGE = 'Extension context invalidated.'

export function isExtensionContextInvalidatedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return message === CONTEXT_INVALIDATED_MESSAGE
}

/**
 * What a request that cannot be made resolves to. Rejecting would hand every caller an error it never
 * expects (`const { data } = await api…` turns into a TypeError on top of an unhandled rejection), and
 * resolving with nothing would read as "the list is empty" — which is the confusion this exists to
 * end: a home tab that stays blank for the rest of the page's life, until the page is refreshed.
 *
 * So the promise stays pending, the caller keeps waiting, and the user is told once, with the one
 * thing that actually fixes it. One shared promise: pages that scroll forever keep re-requesting, and
 * those pending promises should not pile up.
 */
const neverSettles = new Promise<never>(() => {})

let toldAboutInvalidContext = false

function tellAboutInvalidContext() {
  if (toldAboutInvalidContext)
    return
  toldAboutInvalidContext = true
  console.warn('[BewlyBewly] The extension was reloaded or updated. Refresh this page to keep using it.')
  notifyUserOnce(i18n.global.t('common.extension_reloaded'), 'warning')
}

/**
 * Sends a message to the background, unless this content script is already orphaned.
 *
 * The check runs before the call, but the context can die between the two, so the call is wrapped too.
 */
export function sendToExtension<T>(send: () => Promise<T>): Promise<T> {
  const onFailure = (error: unknown): Promise<T> => {
    if (!isExtensionContextInvalidatedError(error))
      throw error
    tellAboutInvalidContext()
    return neverSettles
  }

  if (!isExtensionContextValid()) {
    tellAboutInvalidContext()
    return neverSettles
  }

  try {
    return Promise.resolve(send()).catch(onFailure)
  }
  catch (error) {
    return onFailure(error)
  }
}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export interface APIClient extends APIFunction<typeof API_COLLECTION> {

}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export class APIClient {
  private readonly cache = new Map<string | symbol, any>()

  constructor() {
    // @ts-expect-error ignore
    return new Proxy({}, {
      get: (_, namespace) => { // namespace
        if (this.cache.has(namespace)) {
          return this.cache.get(namespace)
        }
        else {
          const api = new Proxy({}, {
            get(_, p) {
              return (options?: object) => {
                return sendToExtension(() => browser.runtime.sendMessage({
                  contentScriptQuery: p,
                  ...options,
                }))
              }
            },
          })
          this.cache.set(namespace, api)
          return api
        }
      },
    })
  }
}

const api = new APIClient()

export default api
