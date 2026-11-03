import type { GamepadLike } from '../core/input/gamepad';

export interface CaptureOptions {
  /** Pads to read; defaults to navigator.getGamepads. */
  readonly getPads?: () => readonly (GamepadLike | null)[];
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Poll interval in ms. */
  readonly pollMs?: number;
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
      for (const [index, mask] of now) {
        const fresh = mask & ~(held.get(index) ?? 0);
        if (fresh !== 0) {
          finish(31 - Math.clz32(fresh & -fresh));
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
