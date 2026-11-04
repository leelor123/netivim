/**
 * Label collision avoidance for the Living Map. Labels are anchored bottom-centre at (x, y).
 * Higher-priority labels keep their place; a lower-priority label that would overlap an already
 * accepted one is hidden. All buffers are allocated once, so resolve() is allocation-free and can
 * run whenever the camera moves.
 */
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
    readonly height = 20,
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

  /** Hides every projected label that overlaps a higher-priority visible one. */
  resolve(): void {
    let n = 0;
    const gap = this.gap;
    for (let k = 0; k < this.count; k++) {
      const i = this.order[k] as number;
      if (this.visible[i] === 0) continue;
      const hw = (this.width[i] as number) / 2 + gap;
      const xi = this.x[i] as number;
      const yi = this.y[i] as number;
      let clear = true;
      for (let a = 0; a < n; a++) {
        const j = this.accepted[a] as number;
        const hj = (this.width[j] as number) / 2;
        if (Math.abs(xi - (this.x[j] as number)) < hw + hj && Math.abs(yi - (this.y[j] as number)) < this.height + gap) {
          clear = false;
          break;
        }
      }
      if (clear) this.accepted[n++] = i;
      else this.visible[i] = 0;
    }
  }
}
