import type { Game } from '../../game';
import type { Action } from '../../core/input/types';
import type { AnalogInput } from '../../features/timeline/screen';
import { h } from '../../ui/dom';
import { routeModalScroll, routeScroll } from '../../ui/scrollRouting';
import { ignoreKeyForTextEntry } from '../../core/input/textEntry';

/**
 * Hosted gameplay screens (hub menu, briefing, failure card, debrief, quiz, codex...). They live
 * outside the UI root and carry data-screen, so the UI system yields focus to them. Controller
 * first: D-pad / stick move focus, confirm activates, back goes back. While the game is paused
 * the stack is detached so the UI pause menu owns the screen.
 */

export interface GpScreen {
  readonly id: string;
  readonly el: HTMLElement;
  /** Custom action handling (e.g. the timeline); return true when handled. */
  onAction?(action: Action): boolean;
  update?(dt: number, analog: AnalogInput): void;
  back?(): void;
  /** Called once when the screen leaves the stack. */
  dispose?(): void;
  /** Mounted by the screen itself into the given root (hosted feature screens). */
  mountInto?(root: HTMLElement): void;
  unmountFrom?(): void;
}

const NAV_ACTIONS: readonly Action[] = ['up', 'down', 'left', 'right', 'confirm', 'back', 'tabPrev', 'tabNext', 'alt', 'interact'];
export const FOCUS_ATTR = 'data-gp-focus';

export class ScreenStack {
  readonly root: HTMLElement;
  private readonly stack: GpScreen[] = [];
  private attached = false;
  /** Steps to ignore input after a change, so one press never acts on two screens. */
  private settle = 0;
  private readonly offs: (() => void)[] = [];
  private readonly analog = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, scroll: 0 };
  private readonly rtl: boolean;
  private readonly lastFocus = new WeakMap<GpScreen, { key: string | undefined; el: HTMLElement }>();

  constructor(private readonly game: Game) {
    this.rtl = game.i18n.dir === 'rtl';
    this.root = h('div', { class: 'gp-root', attrs: { dir: game.i18n.dir } });
    this.offs.push(
      game.onStep((dt) => this.step(dt)),
      game.bus.on('flow:pause-changed', ({ paused }) => this.syncAttached(paused)),
    );
  }

  get top(): GpScreen | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  get depth(): number {
    return this.stack.length;
  }

  has(id: string): boolean {
    return this.stack.some((s) => s.id === id);
  }

  push(s: GpScreen): void {
    const below = this.top;
    if (below) {
      this.remember(below);
      below.el.hidden = true;
      below.el.removeAttribute('data-screen');
    }
    this.stack.push(s);
    this.mount(s);
    this.changed();
  }

  pop(): void {
    const s = this.stack.pop();
    if (s) this.unmount(s);
    const top = this.top;
    if (top) {
      top.el.hidden = false;
      top.el.dataset.screen = 'gp-' + top.id;
      this.restoreFocus(top);
    }
    this.changed();
  }

  replace(s: GpScreen): void {
    const old = this.stack.pop();
    if (old) this.unmount(old);
    this.stack.push(s);
    this.mount(s);
    this.changed();
  }

  /** Shows exactly one screen. */
  reset(s: GpScreen): void {
    this.clear();
    this.push(s);
  }

  clear(): void {
    while (this.stack.length > 0) this.unmount(this.stack.pop() as GpScreen);
    this.changed();
  }

  dispose(): void {
    this.clear();
    for (const off of this.offs) off();
    this.root.remove();
  }

  /** Moves focus within the top screen (exported for tests and pointer users). */
  moveFocus(delta: 1 | -1): void {
    const top = this.top;
    if (!top) return;
    const items = focusables(top.el);
    if (items.length === 0) return;
    const cur = items.indexOf(document.activeElement as HTMLElement);
    const next = items[cur < 0 ? 0 : (cur + delta + items.length) % items.length];
    next?.focus();
  }

  private mount(s: GpScreen): void {
    s.el.classList.add('gp-screen');
    s.el.dataset.screen = 'gp-' + s.id;
    if (s.mountInto) s.mountInto(this.root);
    else this.root.append(s.el);
    this.focusFirst(s);
  }

  private unmount(s: GpScreen): void {
    if (s.unmountFrom) s.unmountFrom();
    else s.el.remove();
    s.dispose?.();
  }

  /** Remembers what had focus on a screen that is about to be covered (by data-key, else element). */
  private remember(s: GpScreen): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && s.el.contains(active)) this.lastFocus.set(s, { key: active.dataset.key, el: active });
  }

  /** Returns focus to what the player had when the screen was covered; first control otherwise. */
  private restoreFocus(s: GpScreen): void {
    const mem = this.lastFocus.get(s);
    const target = (mem?.key ? findByKey(s.el, mem.key) : null) ?? (mem?.el.isConnected && s.el.contains(mem.el) ? mem.el : null);
    if (target && this.attached) target.focus({ preventScroll: true });
    else this.focusFirst(s);
  }

  private focusFirst(s: GpScreen): void {
    const first = focusables(s.el)[0];
    // Focus after the element is in the document (same task).
    if (first && this.attached) first.focus({ preventScroll: true });
  }

  private changed(): void {
    this.settle = 2;
    this.syncAttached(this.game.flow.paused);
  }

  private syncAttached(paused: boolean): void {
    const want = this.stack.length > 0 && !paused;
    if (want === this.attached) return;
    this.attached = want;
    if (want) {
      window.addEventListener('keydown', this.onKey, true);
      window.addEventListener('keyup', this.onKey, true);
      document.body.append(this.root);
      const top = this.top;
      if (top) this.focusFirst(top);
    } else {
      window.removeEventListener('keydown', this.onKey, true);
      window.removeEventListener('keyup', this.onKey, true);
      this.root.remove();
    }
  }

  /**
   * The step loop already turns the confirm key into one click. Swallow the browser's own
   * Enter / Space activation of a focused button so a key press never acts twice
   * (same rule as FocusManager). Text fields keep their keys.
   */
  private readonly onKey = (e: KeyboardEvent): void => {
    const target = e.target;
    if (!(target instanceof HTMLElement) || !this.root.contains(target)) return;
    if (ignoreKeyForTextEntry(e.code, target)) return;
    if (!(target instanceof HTMLButtonElement)) return;
    if (this.game.input.getBindings().keyboard[e.code]?.includes('confirm')) e.preventDefault();
  };

  private step(dt: number): void {
    const top = this.top;
    const input = this.game.input;
    if (!top || !this.attached) {
      routeModalScroll(input.scroll, input.look.y, dt);
      return;
    }
    this.analog.moveX = input.move.x;
    this.analog.moveY = input.move.y;
    this.analog.lookX = input.look.x;
    this.analog.lookY = input.look.y;
    this.analog.scroll = input.scroll;
    if (top.update) top.update(dt, this.analog);
    // Plain sheets have no update: triggers / right stick scroll their body (same as menus).
    else routeScroll(top.el, this.analog.scroll, this.analog.lookY, dt);
    if (this.settle > 0) {
      this.settle--;
      return;
    }
    for (const a of NAV_ACTIONS) {
      if (!input.justPressed(a)) continue;
      if (this.handle(top, a)) return;
    }
  }

  private handle(top: GpScreen, a: Action): boolean {
    if (top.onAction?.(a)) return true;
    switch (a) {
      case 'up':
        this.moveFocus(-1);
        return true;
      case 'down':
        this.moveFocus(1);
        return true;
      case 'left':
        this.moveFocus(this.rtl ? 1 : -1);
        return true;
      case 'right':
        this.moveFocus(this.rtl ? -1 : 1);
        return true;
      case 'confirm': {
        const active = document.activeElement;
        if (active instanceof HTMLElement && top.el.contains(active) && active.hasAttribute(FOCUS_ATTR)) {
          active.click();
          return true;
        }
        this.focusFirst(top);
        return true;
      }
      case 'back':
        if (top.back) {
          top.back();
          return true;
        }
        return false;
      default:
        return false;
    }
  }
}

/** Finds a control by its data-key (items carry one so they survive a re-render). */
export function findByKey(root: HTMLElement, key: string): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-key="' + key.replace(/["\\]/g, '\\$&') + '"]');
}

/** data-key of the focused control inside root, if any. */
export function activeKey(root: HTMLElement): string | undefined {
  const a = document.activeElement;
  return a instanceof HTMLElement && root.contains(a) ? a.dataset.key : undefined;
}

/**
 * Runs a re-render and puts focus back on the control with the same data-key (or `fallbackKey`
 * when that control is gone), so replaceChildren never drops focus to body.
 */
export function rerenderKeepingFocus(root: HTMLElement, render: () => void, fallbackKey?: string): void {
  const key = activeKey(root);
  render();
  const target = (key ? findByKey(root, key) : null) ?? (key && fallbackKey ? findByKey(root, fallbackKey) : null);
  if (target && document.activeElement !== target) target.focus({ preventScroll: true });
}

export function focusables(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[' + FOCUS_ATTR + ']')) {
    if (el.hidden || (el as HTMLButtonElement).disabled || el.closest('[hidden]')) continue;
    out.push(el);
  }
  return out;
}

/** A focusable button for hosted screens. */
export function gpButton(label: string, onClick: () => void, opts: { primary?: boolean; key?: string; sub?: string; ariaLabel?: string } = {}): HTMLButtonElement {
  const b = h('button', { class: 'gp-btn' + (opts.primary ? ' gp-btn--primary' : ''), attrs: { type: 'button', [FOCUS_ATTR]: '' } });
  if (opts.ariaLabel) b.setAttribute('aria-label', opts.ariaLabel);
  b.append(h('span', { class: 'gp-btn__label', text: label }));
  if (opts.sub) b.append(h('span', { class: 'gp-btn__sub', text: opts.sub }));
  if (opts.key) b.dataset.key = opts.key;
  b.addEventListener('click', onClick);
  return b;
}
