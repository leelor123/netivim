/**
 * Hardware-keyboard text entry guard. While the player types into a field, game actions bound to
 * letters and arrows must not fire (and must not steal focus from the field).
 */

export interface TextEntryLike {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
  readonly type?: string;
}

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color', 'image']);
/** Keys that still reach the game from a text field: leave the field or move out of it. */
const PASS_THROUGH_CODES = new Set(['Escape', 'ArrowUp', 'ArrowDown']);

export function isTextEntryTarget(t: TextEntryLike | null | undefined): boolean {
  if (!t) return false;
  if (t.isContentEditable === true) return true;
  const tag = (t.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUT_TYPES.has((t.type ?? 'text').toLowerCase());
  return false;
}

/** True when a keydown with this code, aimed at this target, must not become a game action. */
export function ignoreKeyForTextEntry(code: string, target: TextEntryLike | null | undefined): boolean {
  return isTextEntryTarget(target) && !PASS_THROUGH_CODES.has(code);
}
