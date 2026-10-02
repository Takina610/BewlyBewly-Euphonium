import { expect, it, vi } from 'vitest'

import SettingsConfig from '~/ambientlight/libs/settings-config'
import { setupAmbilight } from '~/logic/ambilight'
import { settings } from '~/logic/storage'

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

// vendor 的模块顶层就探测 color-gamut，jsdom 没有 matchMedia：在导入发生前补一个最小桩
vi.hoisted(() => {
  if (typeof globalThis.matchMedia !== 'function') {
    (globalThis as any).matchMedia = (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  }
})

/**
 * 效果本体是 vendor 来的 bilibili-ambilight（jsdom 里起不来，也不该在这里测它）；这里钉住的是
 * 接线层的两件事：功能默认开着（用户要求自动开启）、它家面板里模糊/扩散的默认值是本仓库改过的
 * 25 / 140。jsdom 的地址不是 B 站播放页，循环扫不到播放器也不会起实例——正好当「不起实例」
 * 的冒烟用。
 */
it('has the ambient light on by default', () => {
  expect(settings.value.videoPageAmbilight).toBe(true)
})

it('overrides the vendored defaults for blur and spread', () => {
  const defaults = Object.fromEntries(
    SettingsConfig.map(setting => [setting.name, setting.default]),
  )
  expect(defaults.blur2).toBe(25)
  expect(defaults.spread).toBe(140)
})

it('scans without starting anything outside a watch page', async () => {
  vi.useFakeTimers()
  const dispose = setupAmbilight()
  await vi.advanceTimersByTimeAsync(3000)

  // jsdom 不是 B 站播放页：不能有实例，也不能把约定槽位占成 false
  expect(window.ambientlight).toBeUndefined()

  dispose()
  vi.useRealTimers()
})
