/**
 * Controller scrolling shared by every screen host (FocusManager for the menus, ScreenStack for
 * hosted gameplay sheets, the Living Map side panel). Triggers or the right stick scroll the
 * nearest scrollable container, so long text is never unreachable without touch.
 */

export const SCROLL_SPEED = 900;
export const SCROLL_DEAD = 0.15;

/** Selector for containers a hosted screen may scroll with the controller. */
export const SCROLLER_SELECTOR = '.gp-sheet__body, .gp-provenance__body, .lm-panel, .tl-detail, [data-scroller]';

export interface ScrollLike {
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

/** Signed scroll axis from triggers (preferred) or the right stick, or 0 inside the dead zone. */
export function scrollAxis(scroll: number, lookY: number): number {
  const v = Math.abs(scroll) >= SCROLL_DEAD ? scroll : lookY;
  return Math.abs(v) >= SCROLL_DEAD ? v : 0;
}

/** Pixels to scroll this step for the given axis value. */
export function scrollDelta(axis: number, dt: number): number {
  return axis * SCROLL_SPEED * dt;
}

export function canScroll(el: ScrollLike): boolean {
  return el.scrollHeight - el.clientHeight > 1;
}

/**
 * Picks the container to scroll: the overflowing one that holds the focused element, otherwise
 * the first overflowing one. Returns null when nothing overflows.
 */
export function chooseScroller<T extends ScrollLike>(candidates: readonly T[], holdsFocus: (c: T) => boolean): T | null {
  let first: T | null = null;
  for (const c of candidates) {
    if (!canScroll(c)) continue;
    if (holdsFocus(c)) return c;
    first ??= c;
  }
  return first;
}

/** Scrolls by `delta` px, clamped to the scrollable range. Returns true when the position changed. */
export function scrollBy(el: ScrollLike, delta: number): boolean {
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  const next = Math.min(max, Math.max(0, el.scrollTop + delta));
  if (next === el.scrollTop) return false;
  el.scrollTop = next;
  return true;
}

/** Attributes that make a scroll container keyboard-reachable and named for screen readers. */
export function scrollableAttrs(label: string): Record<string, string> {
  return { tabindex: '0', role: 'region', 'aria-label': label };
}

/** Routes one analog sample to the best scroller under `root`. DOM glue around the pure helpers. */
export function routeScroll(root: HTMLElement, scroll: number, lookY: number, dt: number): boolean {
  const axis = scrollAxis(scroll, lookY);
  if (axis === 0) return false;
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(SCROLLER_SELECTOR));
  if (root.matches(SCROLLER_SELECTOR)) candidates.unshift(root);
  return scrollCandidates(candidates, axis, dt);
}

function scrollCandidates(candidates: readonly HTMLElement[], axis: number, dt: number): boolean {
  const active = document.activeElement;
  const target = chooseScroller(candidates, (c) => active !== null && c.contains(active));
  return target ? scrollBy(target, scrollDelta(axis, dt)) : false;
}

/** Level-owned modal sheets (archive night, tower lenses) that live outside any ScreenStack. */
export const MODAL_SCROLLER_SELECTOR = '.an-stage:not([hidden]) .gp-sheet__body, .an-viewer:not([hidden]) .gp-provenance__body, .ch01t-lenses:not([hidden]) .gp-sheet__body';

/** Same routing for level modals, used while no hosted gameplay screen is on top. */
export function routeModalScroll(scroll: number, lookY: number, dt: number): boolean {
  const axis = scrollAxis(scroll, lookY);
  if (axis === 0) return false;
  return scrollCandidates(Array.from(document.querySelectorAll<HTMLElement>(MODAL_SCROLLER_SELECTOR)), axis, dt);
}
