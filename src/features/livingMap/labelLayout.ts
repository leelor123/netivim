/**
 * Label collision avoidance for the Living Map. Labels are anchored bottom-centre at (x, y).
 * Higher-priority labels keep their place. A lower-priority label that would overlap an already
 * accepted one first tries a few small offsets (above, below, sideways); only when none is free
 * is it hidden. All buffers are allocated once, so resolve() is allocation-free and can run
 * whenever the camera moves. Widths come from real text measurement (see makeTextMeasurer).
 */

/** Candidate offsets as multiples of (label height + gap) vertically and (half widths) sideways. */
const OFFSET_STEPS_Y = [0, -1, 1, -2, 2] as const;
const OFFSET_STEPS_X = [0, -1, 1] as const;
/** Never move a label further than this from its marker, so it still reads as that marker's. */
export const MAX_LABEL_SHIFT_PX = 56;

export class LabelCollider {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly width: Float32Array;
  /** 1 when the label is projected on screen (input), then 1 only if it also survived (output). */
  readonly visible: Uint8Array;
  private readonly order: Uint16Array;
  private readonly accepted: Uint16Array;

  constructor(
    readonly count: number,
    priorities: ArrayLike<number>,
    readonly height = 22,
    readonly gap = 3,
  ) {
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.width = new Float32Array(count);
    this.visible = new Uint8Array(count);
    this.accepted = new Uint16Array(count);
    const idx = Array.from({ length: count }, (_, i) => i);
    // Higher priority first; the index breaks ties so the result is stable.
    idx.sort((a, b) => (priorities[b] ?? 0) - (priorities[a] ?? 0) || a - b);
    this.order = Uint16Array.from(idx);
  }

  private overlaps(n: number, xi: number, yi: number, wi: number): boolean {
    const hw = wi / 2 + this.gap;
    for (let a = 0; a < n; a++) {
      const j = this.accepted[a] as number;
      const hj = (this.width[j] as number) / 2;
      if (Math.abs(xi - (this.x[j] as number)) < hw + hj && Math.abs(yi - (this.y[j] as number)) < this.height + this.gap) return true;
    }
    return false;
  }

  /**
   * Hides every projected label that cannot be placed clear of higher-priority visible ones.
   * Labels that had to move have their x / y updated in place.
   */
  resolve(): void {
    let n = 0;
    const step = this.height + this.gap;
    for (let k = 0; k < this.count; k++) {
      const i = this.order[k] as number;
      if (this.visible[i] === 0) continue;
      const w = this.width[i] as number;
      const x0 = this.x[i] as number;
      const y0 = this.y[i] as number;
      let placed = false;
      for (let sx = 0; sx < OFFSET_STEPS_X.length && !placed; sx++) {
        const dx = (OFFSET_STEPS_X[sx] as number) * (w / 2 + this.gap);
        for (let sy = 0; sy < OFFSET_STEPS_Y.length; sy++) {
          const dy = (OFFSET_STEPS_Y[sy] as number) * step;
          if (Math.hypot(dx, dy) > MAX_LABEL_SHIFT_PX + (OFFSET_STEPS_X[sx] === 0 ? 0 : w / 2)) continue;
          if (this.overlaps(n, x0 + dx, y0 + dy, w)) continue;
          this.x[i] = x0 + dx;
          this.y[i] = y0 + dy;
          this.accepted[n++] = i;
          placed = true;
          break;
        }
      }
      if (!placed) this.visible[i] = 0;
    }
  }
}

/**
 * Returns a function that measures text width in CSS px for the given font, caching per string.
 * Uses a canvas 2D context; where none is available (tests, very old WebViews) it falls back to
 * `fallbackPxPerChar` per character.
 */
export function makeTextMeasurer(font: string, fallbackPxPerChar = 8): (text: string) => number {
  const cache = new Map<string, number>();
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  } catch {
    ctx = null;
  }
  if (ctx) ctx.font = font;
  return (text) => {
    const hit = cache.get(text);
    if (hit !== undefined) return hit;
    const w = ctx ? ctx.measureText(text).width : text.length * fallbackPxPerChar;
    cache.set(text, w);
    return w;
  };
}
