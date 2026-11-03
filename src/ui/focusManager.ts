import type { Action, InputDevice, Vec2 } from '../core/input/types';
import type { Bindings } from '../core/input/bindings';
import { findNext, firstInReadingOrder, horizontalDelta, tabDelta, type Box, type Dir } from './nav';
import type { ScreenManager } from './screenManager';
import type { UiScreen } from './uiScreen';
import { adjusterFor } from './widgets';

/** The part of InputManager the UI reads. */
export interface FocusInput {
  readonly device: InputDevice;
  readonly scroll: number;
  readonly look: Vec2;
  isDown(a: Action): boolean;
  getBindings(): Bindings;
}

const NAV = ['confirm', 'back', 'up', 'down', 'left', 'right', 'tabPrev', 'tabNext'] as const;
type NavAction = (typeof NAV)[number];
const NAV_INDEX: Readonly<Record<NavAction, number>> = { confirm: 0, back: 1, up: 2, down: 3, left: 4, right: 5, tabPrev: 6, tabNext: 7 };
const isDir = (a: NavAction): a is Dir => a === 'up' || a === 'down' || a === 'left' || a === 'right';

/** Held-direction auto-repeat, in seconds of game time (not wall time, so slow frames never repeat). */
const REPEAT_DELAY = 0.38;
const REPEAT_EVERY = 0.11;
/** Android may deliver one controller press both as a key event and through the Gamepad API. */
const DUPLICATE_WINDOW = 150;
const SCROLL_SPEED = 900;
const SCROLL_DEAD = 0.15;
const SELECTOR = '[data-focusable]';

export interface FocusManagerDeps {
  readonly input: FocusInput;
  readonly screens: ScreenManager<UiScreen>;
  readonly rtl: boolean;
  readonly now: () => number;
  readonly reducedMotion: () => boolean;
  /**
   * Keyboard keys bound to pause are left to the game loop in this state (it resumes the game
   * itself); returning true skips them here.
   */
  readonly deferPauseKey: () => boolean;
}

/**
 * Controller-first focus: D-pad / stick move spatially between [data-focusable] elements of the
 * top screen, confirm clicks, back pops, bumpers switch tabs, triggers scroll. Keyboard is read
 * from key events (so quick taps are never missed); pads and touch buttons from the InputManager.
 */
export class FocusManager {
  current: HTMLElement | null = null;
  /** While true (e.g. remap capture) input is tracked but not acted on. */
  suspended = false;
  /** Time of the last action handled from a key event. */
  lastKeyAt = -Infinity;

  private readonly prev = new Uint8Array(NAV.length);
  /** Seconds each action has been held, and seconds since its last repeat. */
  private readonly held = new Float64Array(NAV.length);
  private readonly sinceRepeat = new Float64Array(NAV.length);
  private readonly keyHandledAt = new Float64Array(NAV.length).fill(-Infinity);

  constructor(private readonly deps: FocusManagerDeps) {}

  /** Per-step poll; dt is game time since the last poll. Allocation-free. */
  tick(dt: number): void {
    const { input } = this.deps;
    const now = this.deps.now();
    const fromPad = input.device !== 'keyboard';
    for (let i = 0; i < NAV.length; i++) {
      const a = NAV[i] as NavAction;
      const down = input.isDown(a);
      const was = this.prev[i] === 1;
      this.prev[i] = down ? 1 : 0;
      if (!down || !fromPad || this.suspended || !this.deps.screens.top) continue;
      if (!was) {
        this.held[i] = 0;
        this.sinceRepeat[i] = 0;
        if (now - (this.keyHandledAt[i] ?? -Infinity) < DUPLICATE_WINDOW) continue;
        this.dispatch(a);
        continue;
      }
      const held = (this.held[i] ?? 0) + dt;
      const since = (this.sinceRepeat[i] ?? 0) + dt;
      this.held[i] = held;
      this.sinceRepeat[i] = since;
      if (isDir(a) && held >= REPEAT_DELAY && since >= REPEAT_EVERY) {
        this.sinceRepeat[i] = 0;
        this.dispatch(a);
      }
    }
    if (this.suspended) return;
    const top = this.deps.screens.top;
    if (!top || !fromPad) return;
    let v = input.scroll;
    if (Math.abs(v) < SCROLL_DEAD) v = input.look.y;
    if (Math.abs(v) >= SCROLL_DEAD) (top.scroller ?? top.el).scrollTop += v * SCROLL_SPEED * dt;
  }

  /** Handles one UI action. Returns true when something on screen reacted. */
  dispatch(a: NavAction): boolean {
    const { screens } = this.deps;
    const top = screens.top;
    if (!top) return false;
    this.ensureFocus();
    switch (a) {
      case 'confirm': {
        const el = this.current;
        if (!el || (el instanceof HTMLButtonElement && el.disabled)) return false;
        el.click();
        return true;
      }
      case 'back':
        return screens.back();
      case 'tabPrev':
      case 'tabNext':
        return screens.tab(tabDelta(a, this.deps.rtl));
      default: {
        const el = this.current;
        if (el && (a === 'left' || a === 'right')) {
          const adjust = adjusterFor(el);
          if (adjust) {
            adjust(horizontalDelta(a, this.deps.rtl));
            return true;
          }
        }
        return this.move(a);
      }
    }
  }

  /** Spatial move from the current element. */
  move(dir: Dir): boolean {
    const list = this.candidates();
    if (list.length === 0) return false;
    const cur = this.current;
    const idx = cur ? list.indexOf(cur) : -1;
    if (idx < 0) return this.focus(list[firstInReadingOrder(this.boxes(list), this.deps.rtl)] ?? null);
    const boxes = this.boxes(list);
    const from = boxes[idx] as Box;
    const next = findNext(from, boxes, dir, this.deps.rtl);
    return next >= 0 ? this.focus(list[next] ?? null) : false;
  }

  /** Focuses an element (or the top screen's preferred element when null is not wanted). */
  focus(el: HTMLElement | null): boolean {
    if (!el || el === this.current) return false;
    this.current?.classList.remove('is-focus');
    this.current = el;
    el.classList.add('is-focus');
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: this.deps.reducedMotion() ? 'auto' : 'smooth' });
    return true;
  }

  /** Called when the top screen changes: restore or pick the initial focus. */
  refresh(): void {
    const top = this.deps.screens.top;
    if (!top) {
      this.current?.classList.remove('is-focus');
      this.current = null;
      return;
    }
    if (this.current && top.el.contains(this.current) && this.current.isConnected) return;
    this.current?.classList.remove('is-focus');
    this.current = null;
    const remembered = top.lastFocus;
    const pick = remembered?.isConnected && this.isUsable(remembered) ? remembered : (top.initialFocus?.() ?? null);
    if (pick && this.isUsable(pick)) this.focus(pick);
    else this.ensureFocus();
  }

  /** Re-focuses the element with the same data-key after a screen re-rendered its content. */
  refocusKey(key: string | undefined): void {
    const top = this.deps.screens.top;
    if (!top || !key) return;
    const el = top.el.querySelector<HTMLElement>('[data-key="' + CSS.escape(key) + '"]');
    if (el) {
      this.current = null;
      this.focus(el);
    }
  }

  /** Attaches keyboard, pointer and focus listeners. Returns a detach function. */
  attach(target: Window): () => void {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!this.deps.screens.top) return;
      const acts = this.deps.input.getBindings().keyboard[e.code];
      if (!acts) return;
      let nav: NavAction | null = null;
      for (const a of acts) if (a in NAV_INDEX) nav = a as NavAction;
      if (!nav) return;
      // Stop native button activation and page scrolling; Tab stays native for accessibility.
      e.preventDefault();
      if (this.suspended) return;
      if (acts.includes('pause') && this.deps.deferPauseKey()) return;
      if (e.repeat && !isDir(nav)) return;
      this.keyHandledAt[NAV_INDEX[nav]] = this.deps.now();
      if (this.dispatch(nav)) this.lastKeyAt = this.deps.now();
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && this.deps.screens.top) e.preventDefault();
    };
    const onFocusIn = (e: FocusEvent): void => {
      const t = e.target;
      if (t instanceof HTMLElement && t.hasAttribute('data-focusable') && t !== this.current) {
        this.current?.classList.remove('is-focus');
        this.current = t;
        t.classList.add('is-focus');
      }
    };
    const onPointerOver = (e: PointerEvent): void => {
      if (e.pointerType !== 'mouse' || !(e.target instanceof Element)) return;
      const el = e.target.closest<HTMLElement>(SELECTOR);
      const top = this.deps.screens.top;
      if (el && top?.el.contains(el) && this.isUsable(el) && el !== this.current) {
        this.current?.classList.remove('is-focus');
        this.current = el;
        el.classList.add('is-focus');
        el.focus({ preventScroll: true });
      }
    };
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('focusin', onFocusIn);
    target.addEventListener('pointerover', onPointerOver);
    return () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('focusin', onFocusIn);
      target.removeEventListener('pointerover', onPointerOver);
    };
  }

  private ensureFocus(): void {
    const top = this.deps.screens.top;
    if (!top) return;
    if (this.current && this.current.isConnected && top.el.contains(this.current) && this.isUsable(this.current)) return;
    const list = this.candidates();
    if (list.length === 0) return;
    const preferred = top.initialFocus?.() ?? null;
    this.focus(preferred && this.isUsable(preferred) ? preferred : (list[firstInReadingOrder(this.boxes(list), this.deps.rtl)] ?? null));
  }

  private candidates(): HTMLElement[] {
    const top = this.deps.screens.top;
    if (!top) return [];
    const out: HTMLElement[] = [];
    for (const el of top.el.querySelectorAll<HTMLElement>(SELECTOR)) if (this.isUsable(el)) out.push(el);
    return out;
  }

  private isUsable(el: HTMLElement): boolean {
    if (el instanceof HTMLButtonElement && el.disabled) return false;
    if (el.closest('[inert]')) return false;
    return el.getClientRects().length > 0;
  }

  private boxes(list: readonly HTMLElement[]): Box[] {
    return list.map((el) => el.getBoundingClientRect());
  }
}
