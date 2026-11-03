import type { Action, GamepadFamily, InputDevice } from '../core/input/types';

/**
 * Button prompt for an action on the current device (BRIEF 7). STUB owned by the Controls agent:
 * the signature is the contract, the content will be replaced with real per-family glyphs.
 */
export interface Glyph {
  /** Short visible label, e.g. "A", "Cross", "Enter". */
  readonly label: string;
  /** Accessible name in the UI language. */
  readonly ariaKey: string;
}

export function glyphFor(action: Action, device: InputDevice, family: GamepadFamily | null): Glyph {
  return { label: action + ':' + device + ':' + (family ?? '-'), ariaKey: 'controls.action.' + action };
}
