import { ACTIONS, type Action } from './types';
import { BTN } from './gamepad';

export interface Bindings {
  /** Standard gamepad button index -> actions. */
  readonly gamepad: Readonly<Record<number, readonly Action[]>>;
  /** KeyboardEvent.code -> actions. */
  readonly keyboard: Readonly<Record<string, readonly Action[]>>;
}

export const DEFAULT_BINDINGS: Bindings = {
  gamepad: {
    [BTN.south]: ['confirm'],
    [BTN.east]: ['back'],
    [BTN.west]: ['interact'],
    [BTN.north]: ['alt'],
    [BTN.lb]: ['tabPrev'],
    [BTN.rb]: ['tabNext'],
    [BTN.select]: ['map'],
    [BTN.start]: ['pause'],
    [BTN.up]: ['up'],
    [BTN.down]: ['down'],
    [BTN.left]: ['left'],
    [BTN.right]: ['right'],
  },
  keyboard: {
    Enter: ['confirm'],
    Space: ['confirm'],
    NumpadEnter: ['confirm'],
    Backspace: ['back'],
    Escape: ['back', 'pause'],
    KeyE: ['interact'],
    KeyF: ['interact'],
    KeyR: ['alt'],
    KeyM: ['map'],
    BracketLeft: ['tabPrev'],
    BracketRight: ['tabNext'],
    ArrowUp: ['up'],
    ArrowDown: ['down'],
    ArrowLeft: ['left'],
    ArrowRight: ['right'],
    KeyW: ['up'],
    KeyS: ['down'],
    KeyA: ['left'],
    KeyD: ['right'],
  },
};

const ACTION_SET: ReadonlySet<string> = new Set(ACTIONS);
const isActionList = (v: unknown): v is Action[] =>
  Array.isArray(v) && v.length <= 4 && v.every((a) => typeof a === 'string' && ACTION_SET.has(a));

/** Assigns an action to a gamepad button, removing it from any other button (no duplicates). */
export function remapGamepad(b: Bindings, action: Action, button: number): Bindings {
  const gamepad: Record<number, Action[]> = {};
  for (const [k, list] of Object.entries(b.gamepad)) {
    const rest = list.filter((a) => a !== action);
    if (rest.length > 0) gamepad[Number(k)] = rest;
  }
  gamepad[button] = [...(gamepad[button] ?? []), action];
  return { ...b, gamepad };
}

/** Validates bindings loaded from storage; falls back to defaults for anything invalid. */
export function sanitizeBindings(v: unknown): Bindings {
  if (typeof v !== 'object' || v === null) return DEFAULT_BINDINGS;
  const o = v as Record<string, unknown>;
  const gp = o.gamepad;
  const kb = o.keyboard;
  if (typeof gp !== 'object' || gp === null || typeof kb !== 'object' || kb === null) return DEFAULT_BINDINGS;
  const gamepad: Record<number, Action[]> = {};
  for (const [k, list] of Object.entries(gp)) {
    const idx = Number(k);
    if (Number.isInteger(idx) && idx >= 0 && idx < 32 && isActionList(list)) gamepad[idx] = list;
  }
  const keyboard: Record<string, Action[]> = {};
  for (const [k, list] of Object.entries(kb)) {
    if (k.length <= 32 && isActionList(list)) keyboard[k] = list;
  }
  // Never allow a layout that loses confirm, back or pause on the gamepad.
  const all = Object.values(gamepad).flat();
  for (const must of ['confirm', 'back', 'pause'] as const) if (!all.includes(must)) return DEFAULT_BINDINGS;
  return { gamepad, keyboard };
}
