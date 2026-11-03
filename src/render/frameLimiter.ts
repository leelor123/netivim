import type { FpsCap } from '../core/settings';

/**
 * FPS cap by frame skipping inside setAnimationLoop. The display decides when callbacks run
 * (60/90/120/144 Hz); a capped frame renders only when a full cap interval has elapsed. The
 * schedule advances by exact intervals (not "now"), so the average rate matches the cap even when
 * the display rate is not a multiple of it, and a long stall resets it instead of bursting.
 */
export class FrameLimiter {
  private interval = 0;
  private next = -1;

  constructor(cap: FpsCap = 60) {
    this.setCap(cap);
  }

  setCap(cap: FpsCap): void {
    this.interval = cap > 0 ? 1000 / cap : 0;
    this.next = -1;
  }

  get cap(): number {
    return this.interval > 0 ? 1000 / this.interval : 0;
  }

  /** Call once per animation-loop callback with its timestamp (ms). True = render this frame. */
  shouldRender(now: number): boolean {
    if (this.interval === 0) return true;
    if (this.next < 0) {
      this.next = now + this.interval;
      return true;
    }
    // Accept a frame slightly early: vsync timestamps jitter by a fraction of a millisecond.
    const slack = Math.min(2, this.interval * 0.1);
    if (now + slack < this.next) return false;
    this.next += this.interval;
    // After a stall (tab hidden, long task) restart the schedule rather than catching up.
    if (now - this.next > this.interval) this.next = now + this.interval;
    return true;
  }
}
