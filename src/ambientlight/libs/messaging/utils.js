export const origin = 'https://www.bilibili.com'
export const extensionId = 'bewlybewly-ambientlight'

export function isSameWindowMessage(event) {
  return event.source === window && event.origin === origin
}
