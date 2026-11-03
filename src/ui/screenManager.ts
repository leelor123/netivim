/** A screen on the UI stack. Hooks are optional; the host does the DOM work. */
export interface Screen {
  readonly id: string;
  /** Modal screens keep the screen below visible (but inert). */
  readonly modal?: boolean;
  /** Return true when the screen handled back itself (e.g. closed a sub-panel). */
  back?(): boolean;
  /** Tab bumpers; return true when handled. */
  tab?(delta: -1 | 1): boolean;
  /** Called after the screen became the top of the stack (pushed or uncovered). */
  activate?(): void;
  /** Called when the screen leaves the stack for good. */
  dispose?(): void;
  /** Root screens cannot be popped by back. */
  readonly root?: boolean;
}

/** Renders screens. The DOM host lives in domHost.ts; tests use a fake. */
export interface ScreenHost<S extends Screen> {
  mount(screen: S, below: S | null): void;
  unmount(screen: S): void;
  /** `screen` is no longer on top (covered by `by`). */
  cover(screen: S, by: S): void;
  /** `screen` is on top again. */
  uncover(screen: S): void;
}

/** Stack of screens: push / pop / replace; back pops unless the top handles it or is a root. */
export class ScreenManager<S extends Screen> {
  private readonly stack: S[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly host: ScreenHost<S>) {}

  get top(): S | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  get depth(): number {
    return this.stack.length;
  }

  get screens(): readonly S[] {
    return this.stack;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  push(screen: S): void {
    const below = this.top;
    if (below) this.host.cover(below, screen);
    this.stack.push(screen);
    this.host.mount(screen, below);
    screen.activate?.();
    this.changed();
  }

  pop(): S | null {
    const s = this.stack.pop();
    if (!s) return null;
    this.host.unmount(s);
    s.dispose?.();
    const top = this.top;
    if (top) {
      this.host.uncover(top);
      top.activate?.();
    }
    this.changed();
    return s;
  }

  /** Pops screens until `screen` is on top (no-op if it is not on the stack). */
  popTo(screen: S): void {
    if (!this.stack.includes(screen)) return;
    while (this.top && this.top !== screen) this.pop();
  }

  /** Swaps the top screen without uncovering the one below. */
  replace(screen: S): void {
    const old = this.stack.pop();
    if (old) {
      this.host.unmount(old);
      old.dispose?.();
    }
    const below = this.top;
    if (below && !old) this.host.cover(below, screen);
    this.stack.push(screen);
    this.host.mount(screen, below);
    screen.activate?.();
    this.changed();
  }

  /** Removes every screen (top first). */
  clear(): void {
    while (this.stack.length > 0) {
      const s = this.stack.pop() as S;
      this.host.unmount(s);
      s.dispose?.();
    }
    this.changed();
  }

  /** Clears the stack and shows one root screen. */
  reset(screen: S): void {
    this.clear();
    this.push(screen);
  }

  /** Back action: the top screen may handle it; otherwise pop unless it is a root. */
  back(): boolean {
    const top = this.top;
    if (!top) return false;
    if (top.back?.()) return true;
    if (top.root || this.stack.length === 0) return false;
    this.pop();
    return true;
  }

  tab(delta: -1 | 1): boolean {
    return this.top?.tab?.(delta) ?? false;
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }
}
