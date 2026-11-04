/**
 * Double-confirm skip: a hold is hard for players with motor difficulty, so two activations of
 * the skip button within a short window also skip (tap-tap, Enter-Enter, or a screen reader's
 * double activation).
 */
export class DoubleConfirm {
  private last = -Infinity;

  constructor(private readonly windowMs = 1500) {}

  /** Registers one activation at `nowMs`; true when it completes a double confirm. */
  press(nowMs: number): boolean {
    if (nowMs - this.last <= this.windowMs) {
      this.last = -Infinity;
      return true;
    }
    this.last = nowMs;
    return false;
  }

  /** True while a first activation is waiting for its second. */
  armed(nowMs: number): boolean {
    return nowMs - this.last <= this.windowMs;
  }

  reset(): void {
    this.last = -Infinity;
  }
}
