import type { GamepadLike } from '../core/input/gamepad';

export interface CaptureOptions {
  /** Pads to read; defaults to navigator.getGamepads. */
  readonly getPads?: () => readonly (GamepadLike | null)[];
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Poll interval in ms. */
  readonly pollMs?: number;
  /**
   * Buttons that cancel the capture when held for `holdCancelMs` (normally the Back button).
   * A short press of one of them is still captured as a binding, like any other button.
   */
  readonly holdCancelButtons?: readonly number[];
  readonly holdCancelMs?: number;
  readonly now?: () => number;
}

function defaultPads(): readonly (GamepadLike | null)[] {
  return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
}

/** Bitmask of pressed buttons per pad (index -> mask). */
function snapshot(pads: readonly (GamepadLike | null)[], out: Map<number, number>): void {
  out.clear();
  for (const p of pads) {
    if (!p?.connected) continue;
    let mask = 0;
    const n = Math.min(p.buttons.length, 31);
    for (let i = 0; i < n; i++) if (p.buttons[i]?.pressed) mask |= 1 << i;
    out.set(p.index, mask);
  }
}

/**
 * Waits for a NEW gamepad button press (buttons already held when capture starts, such as the
 * one that opened the capture, are ignored until released). Resolves with the standard button
 * index, or null on timeout or abort.
 */
export function captureNextGamepadButton(opts: CaptureOptions = {}): Promise<number | null> {
  const getPads = opts.getPads ?? defaultPads;
  const timeoutMs = opts.timeoutMs ?? 6000;
  const pollMs = opts.pollMs ?? 16;
  const holdMs = opts.holdCancelMs ?? 1000;
  const cancelBtns = new Set(opts.holdCancelButtons ?? []);
  const clock = opts.now ?? Date.now;
  /** Cancel-capable button currently being held: its index and when it went down. */
  let pending: { button: number; since: number } | null = null;
  return new Promise((resolve) => {
    const held = new Map<number, number>();
    const now = new Map<number, number>();
    const read = (): readonly (GamepadLike | null)[] => {
      try {
        return getPads();
      } catch {
        return [];
      }
    };
    snapshot(read(), held);
    let done = false;
    const finish = (v: number | null): void => {
      if (done) return;
      done = true;
      clearInterval(timer);
      clearTimeout(limit);
      opts.signal?.removeEventListener('abort', onAbort);
      resolve(v);
    };
    const onAbort = (): void => finish(null);
    const timer = setInterval(() => {
      snapshot(read(), now);
      if (pending) {
        let still = false;
        for (const mask of now.values()) if ((mask & (1 << pending.button)) !== 0) still = true;
        if (!still) {
          finish(pending.button);
          return;
        }
        if (clock() - pending.since >= holdMs) {
          finish(null);
          return;
        }
        return;
      }
      for (const [index, mask] of now) {
        const fresh = mask & ~(held.get(index) ?? 0);
        if (fresh !== 0) {
          const button = 31 - Math.clz32(fresh & -fresh);
          if (cancelBtns.has(button)) {
            pending = { button, since: clock() };
            return;
          }
          finish(button);
          return;
        }
        // Released buttons may be pressed again and then count as new.
        held.set(index, (held.get(index) ?? 0) & mask);
      }
    }, pollMs);
    const limit = setTimeout(() => finish(null), timeoutMs);
    if (opts.signal?.aborted) finish(null);
    else opts.signal?.addEventListener('abort', onAbort);
  });
}
