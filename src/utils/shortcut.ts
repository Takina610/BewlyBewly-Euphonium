/**
 * Helpers for recording and matching in-page keyboard shortcuts.
 *
 * Keys are described by their physical `KeyboardEvent.code` rather than `key`, so that a
 * recorded shortcut keeps working when the user switches keyboard layout.
 */

const CODE_ALIASES: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: '\'',
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  NumpadAdd: 'Numpad +',
  NumpadSubtract: 'Numpad -',
  NumpadMultiply: 'Numpad *',
  NumpadDivide: 'Numpad /',
}

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const
type Modifier = typeof MODIFIERS[number]

/** `KeyboardEvent.code` values that are modifiers themselves, not a shortcut key. */
const MODIFIER_CODES = new Set(['AltLeft', 'AltRight', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'])

export function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.has(code)
}

/** Turn a `KeyboardEvent.code` into the label used inside a shortcut string. */
export function normalizeShortcutKey(code: string): string {
  if (code.startsWith('Key'))
    return code.slice(3)
  if (code.startsWith('Digit'))
    return code.slice(5)
  return CODE_ALIASES[code] ?? code
}

export function parseShortcut(shortcut: string): { key: string, modifiers: Modifier[] } {
  const parts = shortcut.split('+').filter(Boolean)
  const key = parts.pop() ?? ''
  return {
    key,
    modifiers: MODIFIERS.filter(modifier => parts.includes(modifier)),
  }
}

/** The modifier names currently held down, in the canonical order. */
export function heldModifiers(event: KeyboardEvent): Modifier[] {
  return MODIFIERS.filter(modifier =>
    event[`${modifier.toLowerCase()}Key` as 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'],
  )
}

/**
 * Describe a keydown event as a shortcut string, or an empty string when the event carries
 * no shortcut key of its own (a bare modifier being held down).
 */
export function eventToShortcut(event: KeyboardEvent): string {
  if (!event.code || isModifierCode(event.code))
    return ''

  return [...heldModifiers(event), normalizeShortcutKey(event.code)].join('+')
}

/**
 * Whether a keydown event is exactly the recorded shortcut. Modifiers are compared both ways,
 * so `Alt+Q` does not also fire while `Ctrl+Alt+Q` is pressed.
 */
export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  if (!shortcut)
    return false

  const { key, modifiers } = parseShortcut(shortcut)
  if (!key || normalizeShortcutKey(event.code) !== key)
    return false

  return (['Ctrl', 'Alt', 'Shift', 'Meta'] as Modifier[]).every(
    modifier => event[`${modifier.toLowerCase()}Key` as 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey']
      === modifiers.includes(modifier),
  )
}

export function hasModifier(shortcut: string): boolean {
  return parseShortcut(shortcut).modifiers.length > 0
}
