import type { EventBus } from '../events';
import type { GameEvents } from '../gameEvents';
import { DEFAULT_BINDINGS, type Bindings } from './bindings';
import { applyDeadZone, BTN, detectFamily, type GamepadLike } from './gamepad';
import { dragToLook } from './lookDrag';
import { ignoreKeyForTextEntry, type TextEntryLike } from './textEntry';
import type { Action, GamepadFamily, InputDevice, Vec2 } from './types';

export interface InputSources {
  getGamepads(): readonly (GamepadLike | null)[];
}

const STICK_DEAD_ZONE = 0.2;
/** Stick-as-D-pad thresholds with hysteresis so menu focus does not flicker. */
const STICK_PRESS = 0.6;
const STICK_RELEASE = 0.4;
/** Any axis beyond this (or any button) counts as deliberate gamepad use. */
const GAMEPAD_ACTIVITY = 0.5;

const DIRS = ['up', 'down', 'left', 'right'] as const;
type Dir = (typeof DIRS)[number];

/**
 * Unified input: every simulation step, gamepad, keyboard and touch are folded into one
 * ActionState. Tracks the last active device so the UI can hide touch controls while a
 * controller is in use, and reports controller connect / disconnect.
 */
export class InputManager {
  readonly move: Vec2 = { x: 0, y: 0 };
  readonly look: Vec2 = { x: 0, y: 0 };
  /**
   * Camera rotation from touch / mouse drag for THIS step, in radians (x yaw, y pitch; same signs
   * as the stick). Kept apart from `look` (a rate the right stick also uses to scroll menus).
   * See lookDrag.ts for the frame-rate independent conversion.
   */
  readonly lookDrag: Vec2 = { x: 0, y: 0 };
  /** Multiplier for drag look (settings.controls.lookSensitivity). */
  lookSensitivity = 1;
  /** -1..1 from the triggers (right minus left). */
  scroll = 0;
  device: InputDevice = 'touch';
  family: GamepadFamily | null = null;

  private bindings: Bindings;
  private down = new Set<Action>();
  private prev = new Set<Action>();
  private readonly keys = new Set<string>();
  private readonly virtual = new Set<Action>();
  private readonly touchMove: Vec2 = { x: 0, y: 0 };
  /** Drag distance in CSS px accumulated since the last step. */
  private readonly dragPx: Vec2 = { x: 0, y: 0 };
  private readonly known = new Map<number, GamepadFamily>();
  private readonly seen = new Set<number>();
  private readonly stickHeld: Record<Dir, boolean> = { up: false, down: false, left: false, right: false };
  private readonly stickValue: Record<Dir, number> = { up: 0, down: 0, left: 0, right: 0 };
  private readonly tmp: Vec2 = { x: 0, y: 0 };
  private readonly lastMask = new Map<number, number>();

  constructor(
    private readonly bus: EventBus<GameEvents>,
    private readonly sources: InputSources,
    bindings: Bindings = DEFAULT_BINDINGS,
  ) {
    this.bindings = bindings;
  }

  setBindings(b: Bindings): void {
    this.bindings = b;
  }

  getBindings(): Bindings {
    return this.bindings;
  }

  isDown(a: Action): boolean {
    return this.down.has(a);
  }

  justPressed(a: Action): boolean {
    return this.down.has(a) && !this.prev.has(a);
  }

  justReleased(a: Action): boolean {
    return !this.down.has(a) && this.prev.has(a);
  }

  /** Virtual joystick from the touch UI, -1..1 on each axis (same convention as the gamepad). */
  setTouchMove(x: number, y: number): void {
    this.touchMove.x = x;
    this.touchMove.y = y;
    if (x !== 0 || y !== 0) this.setDevice('touch', null);
  }

  /**
   * Look drag from the touch look area or a mouse drag on the 3D view, in CSS px (x right,
   * y down). Accumulated until the next step, which converts the sum into radians.
   */
  addLookDelta(dx: number, dy: number, device: 'touch' | 'mouse' = 'touch'): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.dragPx.x += dx;
    this.dragPx.y += dy;
    if (dx !== 0 || dy !== 0) this.setDevice(device === 'mouse' ? 'keyboard' : 'touch', null);
  }

  /** Drops a pending drag (a menu opened, the app lost focus). */
  clearLookDelta(): void {
    this.dragPx.x = 0;
    this.dragPx.y = 0;
  }

  /** On-screen touch buttons. */
  setVirtual(action: Action, pressed: boolean): void {
    if (pressed) {
      this.virtual.add(action);
      this.setDevice('touch', null);
    } else {
      this.virtual.delete(action);
    }
  }

  /** Listens to keyboard and pointer events. Returns an unbind function. */
  attach(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>): () => void {
    const onKeyDown = (e: Event): void => {
      const code = (e as KeyboardEvent).code;
      if (!code) return;
      if (ignoreKeyForTextEntry(code, e.target as TextEntryLike | null)) return;
      this.keys.add(code);
      this.setDevice('keyboard', null);
    };
    const onKeyUp = (e: Event): void => {
      this.keys.delete((e as KeyboardEvent).code);
    };
    const onPointer = (e: Event): void => {
      const type = (e as PointerEvent).pointerType;
      this.setDevice(type === 'mouse' ? 'keyboard' : 'touch', null);
    };
    const onBlur = (): void => {
      // Keys released while the app was in the background must not stay stuck.
      this.keys.clear();
      this.virtual.clear();
      this.clearLookDelta();
    };
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('pointerdown', onPointer);
    target.addEventListener('blur', onBlur);
    return () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('pointerdown', onPointer);
      target.removeEventListener('blur', onBlur);
    };
  }

  /** One simulation step. Allocation-free apart from what the browser returns. */
  update(): void {
    const swap = this.prev;
    this.prev = this.down;
    this.down = swap;
    this.down.clear();

    for (const code of this.keys) {
      const acts = this.bindings.keyboard[code];
      if (acts) for (const a of acts) this.down.add(a);
    }
    for (const a of this.virtual) this.down.add(a);

    this.move.x = 0;
    this.move.y = 0;
    this.look.x = 0;
    this.look.y = 0;
    this.scroll = 0;
    dragToLook(this.dragPx.x, this.dragPx.y, this.lookSensitivity, this.lookDrag);
    this.clearLookDelta();

    const pad = this.pollGamepads();
    if (pad) this.readPad(pad);

    if (this.move.x === 0 && this.move.y === 0) {
      const right = this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0;
      const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0;
      const down = this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0;
      const up = this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0;
      const kx = right - left;
      const ky = down - up;
      if (kx !== 0 || ky !== 0) {
        const len = Math.hypot(kx, ky);
        this.move.x = kx / len;
        this.move.y = ky / len;
      } else {
        this.move.x = this.touchMove.x;
        this.move.y = this.touchMove.y;
      }
    }
  }

  /** Tracks connects and disconnects, and returns the most relevant connected pad. */
  private pollGamepads(): GamepadLike | null {
    let pads: readonly (GamepadLike | null)[];
    try {
      pads = this.sources.getGamepads();
    } catch {
      pads = [];
    }
    this.seen.clear();
    let active: GamepadLike | null = null;
    for (const p of pads) {
      if (!p?.connected) continue;
      this.seen.add(p.index);
      if (!this.known.has(p.index)) {
        const fam = detectFamily(p.id);
        this.known.set(p.index, fam);
        this.bus.emit('input:gamepad-connected', { index: p.index, family: fam });
      }
      if (active === null || this.isActive(p)) active = p;
    }
    if (this.known.size > this.seen.size) {
      for (const index of [...this.known.keys()]) {
        if (this.seen.has(index)) continue;
        this.known.delete(index);
        this.lastMask.delete(index);
        this.bus.emit('input:gamepad-lost', { index });
        if (this.device === 'gamepad' && this.known.size === 0) this.setDevice('touch', null);
      }
    }
    return active;
  }

  private isActive(p: GamepadLike): boolean {
    return this.activityMask(p) !== 0;
  }

  /** Bitmask of pressed buttons (bits 0-23) and deflected axes (bits 24-31). */
  private activityMask(p: GamepadLike): number {
    let mask = 0;
    const nb = Math.min(p.buttons.length, 24);
    for (let i = 0; i < nb; i++) if (p.buttons[i]?.pressed) mask |= 1 << i;
    const na = Math.min(p.axes.length, 8);
    for (let i = 0; i < na; i++) if (Math.abs(p.axes[i] ?? 0) > GAMEPAD_ACTIVITY) mask |= 1 << (24 + i);
    return mask;
  }

  private readPad(p: GamepadLike): void {
    // Switch to gamepad only on NEW controller input, so a held or stuck button cannot take the
    // screen back from a player who just touched it.
    const mask = this.activityMask(p);
    const before = this.lastMask.get(p.index) ?? 0;
    this.lastMask.set(p.index, mask);
    if ((mask & ~before) !== 0) this.setDevice('gamepad', this.known.get(p.index) ?? detectFamily(p.id));

    for (let i = 0; i < p.buttons.length; i++) {
      if (!p.buttons[i]?.pressed) continue;
      const acts = this.bindings.gamepad[i];
      if (acts) for (const a of acts) this.down.add(a);
    }

    applyDeadZone(p.axes[0] ?? 0, p.axes[1] ?? 0, STICK_DEAD_ZONE, this.tmp);
    this.move.x = this.tmp.x;
    this.move.y = this.tmp.y;
    applyDeadZone(p.axes[2] ?? 0, p.axes[3] ?? 0, STICK_DEAD_ZONE, this.tmp);
    this.look.x = this.tmp.x;
    this.look.y = this.tmp.y;
    this.scroll = (p.buttons[BTN.rt]?.value ?? 0) - (p.buttons[BTN.lt]?.value ?? 0);

    // The left stick also drives menu directions.
    const v = this.stickValue;
    v.up = -this.move.y;
    v.down = this.move.y;
    v.left = -this.move.x;
    v.right = this.move.x;
    for (const d of DIRS) {
      this.stickHeld[d] = this.stickHeld[d] ? v[d] > STICK_RELEASE : v[d] > STICK_PRESS;
      if (this.stickHeld[d]) this.down.add(d);
    }
  }

  private setDevice(device: InputDevice, family: GamepadFamily | null): void {
    if (device === this.device && family === this.family) return;
    this.device = device;
    this.family = family;
    this.bus.emit('input:device-changed', { device, family });
  }
}
