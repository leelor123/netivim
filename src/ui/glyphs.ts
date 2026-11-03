import { DEFAULT_BINDINGS, type Bindings } from '../core/input/bindings';
import { BTN } from '../core/input/gamepad';
import type { Action, GamepadFamily, InputDevice } from '../core/input/types';

/** Button prompt for an action on the current device (BRIEF 7). */
export interface Glyph {
  /** Short visible label, e.g. "A", "✕", "Enter". */
  readonly label: string;
  /** Accessible name in the UI language (locale key). */
  readonly ariaKey: string;
}

type Labels = Readonly<Record<number, string>>;

const SHARED_TAIL: Labels = {
  [BTN.up]: '↑',
  [BTN.down]: '↓',
  [BTN.left]: '←',
  [BTN.right]: '→',
};

/**
 * Per-family labels by STANDARD-mapping button index. Positions are physical, so the Nintendo
 * table is swapped on purpose: the bottom button (index 0) is labelled B, the right one A.
 */
const FAMILY_LABELS: Readonly<Record<GamepadFamily, Labels>> = {
  xbox: {
    [BTN.south]: 'A',
    [BTN.east]: 'B',
    [BTN.west]: 'X',
    [BTN.north]: 'Y',
    [BTN.lb]: 'LB',
    [BTN.rb]: 'RB',
    [BTN.lt]: 'LT',
    [BTN.rt]: 'RT',
    [BTN.select]: 'View',
    [BTN.start]: 'Menu',
    [BTN.l3]: 'LS',
    [BTN.r3]: 'RS',
    ...SHARED_TAIL,
  },
  playstation: {
    [BTN.south]: '✕',
    [BTN.east]: '○',
    [BTN.west]: '□',
    [BTN.north]: '△',
    [BTN.lb]: 'L1',
    [BTN.rb]: 'R1',
    [BTN.lt]: 'L2',
    [BTN.rt]: 'R2',
    [BTN.select]: 'Create',
    [BTN.start]: 'Options',
    [BTN.l3]: 'L3',
    [BTN.r3]: 'R3',
    ...SHARED_TAIL,
  },
  nintendo: {
    [BTN.south]: 'B',
    [BTN.east]: 'A',
    [BTN.west]: 'Y',
    [BTN.north]: 'X',
    [BTN.lb]: 'L',
    [BTN.rb]: 'R',
    [BTN.lt]: 'ZL',
    [BTN.rt]: 'ZR',
    [BTN.select]: '−',
    [BTN.start]: '+',
    [BTN.l3]: 'LS',
    [BTN.r3]: 'RS',
    ...SHARED_TAIL,
  },
  generic: {
    [BTN.south]: 'A',
    [BTN.east]: 'B',
    [BTN.west]: 'X',
    [BTN.north]: 'Y',
    [BTN.lb]: 'L1',
    [BTN.rb]: 'R1',
    [BTN.lt]: 'L2',
    [BTN.rt]: 'R2',
    [BTN.select]: 'Select',
    [BTN.start]: 'Start',
    [BTN.l3]: 'L3',
    [BTN.r3]: 'R3',
    ...SHARED_TAIL,
  },
};

/** Icons for the on-screen touch buttons. */
const TOUCH_LABELS: Readonly<Record<Action, string>> = {
  confirm: '●',
  back: '↩',
  pause: '❚❚',
  interact: '✋',
  alt: '✦',
  map: '▦',
  tabPrev: '‹',
  tabNext: '›',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
};

const KEY_NAMES: Readonly<Record<string, string>> = {
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Space: 'Space',
  Backspace: 'Backspace',
  Escape: 'Esc',
  BracketLeft: '[',
  BracketRight: ']',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** Human name of a KeyboardEvent.code ("KeyE" -> "E", "Digit1" -> "1"). */
export function keyName(code: string): string {
  const known = KEY_NAMES[code];
  if (known !== undefined) return known;
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  return code;
}

let currentBindings: Bindings = DEFAULT_BINDINGS;

/** The controls system calls this whenever settings.controls.bindings changes. */
export function setGlyphBindings(b: Bindings): void {
  currentBindings = b;
}

/** Label of one standard-mapping button for a controller family ("?" when unknown). */
export function buttonLabel(button: number, family: GamepadFamily | null): string {
  return FAMILY_LABELS[family ?? 'generic'][button] ?? String(button);
}

/** Lowest gamepad button index bound to the action, or -1. Face buttons beat the D-pad. */
export function buttonFor(action: Action, bindings: Bindings): number {
  let best = -1;
  for (const [key, list] of Object.entries(bindings.gamepad)) {
    if (!list.includes(action)) continue;
    const idx = Number(key);
    if (best === -1 || idx < best) best = idx;
  }
  return best;
}

/** First keyboard code bound to the action (insertion order), or null. */
export function keyFor(action: Action, bindings: Bindings): string | null {
  for (const [code, list] of Object.entries(bindings.keyboard)) if (list.includes(action)) return code;
  return null;
}

export function glyphForBindings(
  action: Action,
  device: InputDevice,
  family: GamepadFamily | null,
  bindings: Bindings,
): Glyph {
  const ariaKey = 'controls.action.' + action;
  if (device === 'touch') return { label: TOUCH_LABELS[action], ariaKey };
  if (device === 'keyboard') {
    const code = keyFor(action, bindings);
    return { label: code === null ? '?' : keyName(code), ariaKey };
  }
  const button = buttonFor(action, bindings);
  return { label: button === -1 ? '?' : buttonLabel(button, family), ariaKey };
}

/** The UI contract: uses the bindings last supplied through setGlyphBindings. */
export function glyphFor(action: Action, device: InputDevice, family: GamepadFamily | null): Glyph {
  return glyphForBindings(action, device, family, currentBindings);
}
