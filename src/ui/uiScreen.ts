import type { Screen, ScreenHost } from './screenManager';

/** A DOM screen on the UI stack. */
export interface UiScreen extends Screen {
  readonly el: HTMLElement;
  /** Scroll container for triggers / right stick (defaults to el). */
  readonly scroller?: HTMLElement;
  /** Element focused when the screen first opens. */
  initialFocus?(): HTMLElement | null;
  /** Remembered focus, restored when the screen is uncovered. */
  lastFocus?: HTMLElement | null;
}

const LEAVE_MS = 200;

/**
 * Mounts screens into a layer element. Covered full screens are hidden; covered screens under a
 * modal stay visible but inert. Enter / leave transitions are CSS-driven and skipped entirely
 * when reduced motion is on.
 */
export class DomScreenHost implements ScreenHost<UiScreen> {
  constructor(
    private readonly layer: HTMLElement,
    private readonly reducedMotion: () => boolean,
  ) {}

  mount(screen: UiScreen, below: UiScreen | null): void {
    const el = screen.el;
    el.classList.add('nv-screen');
    el.classList.toggle('nv-screen--modal', !!screen.modal);
    el.dataset.uiScreen = screen.id;
    if (!this.reducedMotion()) {
      el.classList.add('is-entering');
      // Removed on the next task so the CSS animation plays once.
      setTimeout(() => el.classList.remove('is-entering'), LEAVE_MS + 50);
    }
    if (below && !screen.modal) below.el.hidden = true;
    this.layer.append(el);
  }

  unmount(screen: UiScreen): void {
    const el = screen.el;
    el.inert = true;
    if (this.reducedMotion() || !el.isConnected) {
      el.remove();
      return;
    }
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), LEAVE_MS);
  }

  cover(screen: UiScreen, by: UiScreen): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && screen.el.contains(active)) screen.lastFocus = active;
    screen.el.inert = true;
    screen.el.setAttribute('aria-hidden', 'true');
    if (!by.modal) screen.el.hidden = true;
  }

  uncover(screen: UiScreen): void {
    screen.el.inert = false;
    screen.el.removeAttribute('aria-hidden');
    screen.el.hidden = false;
  }
}
