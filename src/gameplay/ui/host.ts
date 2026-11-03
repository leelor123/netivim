import type { Game } from '../../game';
import type { Action } from '../../core/input/types';
import type { AnalogInput } from '../../features/timeline/screen';
import { h } from '../../ui/dom';

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
      this.focusFirst(top);
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
      document.body.append(this.root);
      const top = this.top;
      if (top) this.focusFirst(top);
    } else {
      this.root.remove();
    }
  }

  private step(dt: number): void {
    const top = this.top;
    if (!top || !this.attached) return;
    const input = this.game.input;
    this.analog.moveX = input.move.x;
    this.analog.moveY = input.move.y;
    this.analog.lookX = input.look.x;
    this.analog.lookY = input.look.y;
    this.analog.scroll = input.scroll;
    top.update?.(dt, this.analog);
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

export function focusables(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[' + FOCUS_ATTR + ']')) {
    if (el.hidden || (el as HTMLButtonElement).disabled || el.closest('[hidden]')) continue;
    out.push(el);
  }
  return out;
}

/** A focusable button for hosted screens. */
export function gpButton(label: string, onClick: () => void, opts: { primary?: boolean; key?: string; sub?: string } = {}): HTMLButtonElement {
  const b = h('button', { class: 'gp-btn' + (opts.primary ? ' gp-btn--primary' : ''), attrs: { type: 'button', [FOCUS_ATTR]: '' } });
  b.append(h('span', { class: 'gp-btn__label', text: label }));
  if (opts.sub) b.append(h('span', { class: 'gp-btn__sub', text: opts.sub }));
  if (opts.key) b.dataset.key = opts.key;
  b.addEventListener('click', onClick);
  return b;
}
