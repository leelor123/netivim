/**
 * Subtitle lifetime measured in game time, not wall time. It is advanced by the game's step hook,
 * which does not run while the game is paused, so a caption never expires behind a menu and is
 * still there (with its remaining time) when the player resumes.
 */
export class SubtitleTimer {
  private remaining = 0;
  private running = false;

  /** Starts a line. `durationMs <= 0` means it stays until cleared. */
  start(durationMs: number): void {
    this.running = durationMs > 0;
    this.remaining = durationMs > 0 ? durationMs / 1000 : 0;
  }

  stop(): void {
    this.running = false;
    this.remaining = 0;
  }

  get active(): boolean {
    return this.running;
  }

  /** Seconds left (0 when the line has no timeout). */
  get secondsLeft(): number {
    return this.remaining;
  }

  /** Advances by `dt` game seconds. Returns true on the tick that ends the line. */
  tick(dt: number): boolean {
    if (!this.running) return false;
    this.remaining -= dt;
    if (this.remaining > 0) return false;
    this.stop();
    return true;
  }
}
