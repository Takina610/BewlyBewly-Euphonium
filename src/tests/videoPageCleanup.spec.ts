import { expect, it, vi } from 'vitest'

import {
  ACTIVITY_TAG_SELECTORS,
  buildVideoPageCleanupStyle,
  CHARGE_BUTTON_SELECTOR,
  LIVE_ORDER_SELECTORS,
  VIDEO_POPUP_SELECTORS,
} from '~/logic/videoPageCleanup'

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
 * The video page's cleanups are a stylesheet: the popups, the charge button and the two strips are all
 * re-rendered by the page itself, so hiding them has to survive that. The style is built from the
 * settings, which is what these read.
 */
const NOTHING_HIDDEN = {
  popups: [],
  removeChargeButton: false,
  blockLiveOrder: false,
  blockActivityTag: false,
}

it('builds an empty stylesheet while nothing is switched on', () => {
  expect(buildVideoPageCleanupStyle(NOTHING_HIDDEN)).toBe('')
})

it('hides every node of each chosen popup', () => {
  const style = buildVideoPageCleanupStyle({ ...NOTHING_HIDDEN, popups: ['vote', 'gradeSummary'] })

  expect(style).toContain('.bili-vote { display: none !important; }')
  expect(style).toContain('.bili-danmaku-x-vote { display: none !important; }')
  expect(style).toContain('.bili-scoreSum { display: none !important; }')
  // 没被点名的那几种一动不动
  expect(style).not.toContain('.bili-score {')
  expect(style).not.toContain('.bili-link {')
})

it('takes the other popups as one switch, and the guide set with the follow popup', () => {
  const style = buildVideoPageCleanupStyle({ ...NOTHING_HIDDEN, popups: ['other', 'attention'] })

  for (const selector of VIDEO_POPUP_SELECTORS.other)
    expect(style, `missing ${selector}`).toContain(`${selector} { display: none !important; }`)
  // 三连关注那一套引导全都算它
  expect(style).toContain('.bili-guide-follow { display: none !important; }')
  expect(style).toContain('.bili-danmaku-x-guide { display: none !important; }')
})

it('hides the charge button, the reservation card and the activity strip each on their own', () => {
  expect(buildVideoPageCleanupStyle({ ...NOTHING_HIDDEN, removeChargeButton: true }))
    .toContain(`${CHARGE_BUTTON_SELECTOR} { display: none !important; }`)

  const reserve = buildVideoPageCleanupStyle({ ...NOTHING_HIDDEN, blockLiveOrder: true })
  expect(reserve).toContain(`${LIVE_ORDER_SELECTORS.join(', ')} { display: none !important; }`)

  const activity = buildVideoPageCleanupStyle({ ...NOTHING_HIDDEN, blockActivityTag: true })
  expect(activity).toContain(`${ACTIVITY_TAG_SELECTORS.join(', ')} { display: none !important; }`)

  // 三件事各管各的，开关关着就不该出现在样式里
  expect(buildVideoPageCleanupStyle({ ...NOTHING_HIDDEN, blockActivityTag: true }))
    .not.toContain('.bili-reserve')
})
