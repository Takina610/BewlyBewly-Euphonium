import { expect, it } from 'vitest'

import { eventToShortcut, hasModifier, matchesShortcut, normalizeShortcutKey, parseShortcut } from '~/utils/shortcut'

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init)
}

it('describes a combination by its physical key and held modifiers', () => {
  expect(eventToShortcut(keydown({ code: 'KeyQ', altKey: true }))).toBe('Alt+Q')
  expect(eventToShortcut(keydown({ code: 'KeyQ', ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+Q')
  expect(eventToShortcut(keydown({ code: 'F5' }))).toBe('F5')
  expect(eventToShortcut(keydown({ code: 'Digit1', metaKey: true }))).toBe('Meta+1')
  expect(eventToShortcut(keydown({ code: 'Space', altKey: true }))).toBe('Alt+Space')
})

it('ignores a modifier pressed on its own, so that recording waits for the real key', () => {
  expect(eventToShortcut(keydown({ code: 'AltLeft', altKey: true }))).toBe('')
  expect(eventToShortcut(keydown({ code: 'ControlLeft', ctrlKey: true }))).toBe('')
})

it('normalizes key codes to stable labels regardless of keyboard layout', () => {
  expect(normalizeShortcutKey('KeyQ')).toBe('Q')
  expect(normalizeShortcutKey('Digit1')).toBe('1')
  expect(normalizeShortcutKey('F5')).toBe('F5')
  expect(normalizeShortcutKey('Minus')).toBe('-')
})

it('matches the recorded combination exactly', () => {
  expect(matchesShortcut(keydown({ code: 'KeyQ', altKey: true }), 'Alt+Q')).toBe(true)
  expect(matchesShortcut(keydown({ code: 'KeyQ', ctrlKey: true, altKey: true }), 'Alt+Q')).toBe(false)
  expect(matchesShortcut(keydown({ code: 'KeyQ' }), 'Alt+Q')).toBe(false)
})

it('never matches when no shortcut is set', () => {
  expect(matchesShortcut(keydown({ code: 'KeyQ', altKey: true }), '')).toBe(false)
})

it('reports whether a combination carries a modifier', () => {
  expect(hasModifier('Alt+Q')).toBe(true)
  expect(hasModifier('F5')).toBe(false)
  expect(hasModifier('')).toBe(false)
})

it('splits a combination into its key and modifiers', () => {
  expect(parseShortcut('Ctrl+Alt+Shift+Q')).toEqual({ key: 'Q', modifiers: ['Ctrl', 'Alt', 'Shift'] })
  expect(parseShortcut('Alt+Space')).toEqual({ key: 'Space', modifiers: ['Alt'] })
})
