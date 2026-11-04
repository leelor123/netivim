import { segmentBlockedAny, type Collider } from '../../../gameplay/core/collision';
import { Telegraph } from '../../../gameplay/core/telegraph';

/**
 * A shore searchlight on a fixed rhythm: sweep, rest (beam dark), sweep back, rest. An audio tick
 * is announced `tickLead` seconds before every sweep. Pure and deterministic (no wall clock).
 * Being inside the beam fills the same telegraphed meter as a patrol cone.
 */

export interface SweepLightDef {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Center heading of the sweep (0 faces +z). */
  readonly heading: number;
  /** The beam swings between heading - arc and heading + arc. */
  readonly arc: number;
  readonly halfAngle: number;
  readonly range: number;
  readonly sweepTime: number;
  readonly restTime: number;
  /** Seconds into the cycle at the start of the checkpoint. */
  readonly offset: number;
  readonly tickLead: number;
}

export class SweepLight {
  /** Current beam heading (kept at the end of the last sweep while resting). */
  heading: number;
  on = false;
  readonly telegraph: Telegraph;
  private clock = 0;
  private ticked = false;

  constructor(
    readonly def: SweepLightDef,
    warningSeconds: () => number,
  ) {
    this.telegraph = new Telegraph(warningSeconds);
    this.heading = def.heading;
    this.reset();
  }

  get period(): number {
    return 2 * (this.def.sweepTime + this.def.restTime);
  }

  reset(): void {
    this.clock = this.def.offset;
    this.ticked = false;
    this.telegraph.reset();
    this.apply();
  }

  /** Seconds until the next sweep starts (0 while sweeping). */
  get untilSweep(): number {
    const d = this.def;
    const slot = d.sweepTime + d.restTime;
    const u = this.clock % this.period;
    const within = u % slot;
    return within < d.sweepTime ? 0 : slot - within;
  }

  /** Advances the rhythm. Returns true on the step the pre-sweep tick should sound. */
  advance(dt: number): boolean {
    this.clock += dt;
    this.apply();
    if (this.on) {
      this.ticked = false;
      return false;
    }
    if (!this.ticked && this.untilSweep <= this.def.tickLead) {
      this.ticked = true;
      return true;
    }
    return false;
  }

  /** True when the point is inside the lit beam and not hidden behind an occluder. */
  sees(px: number, pz: number, occluders: readonly Collider[]): boolean {
    if (!this.on) return false;
    const d = this.def;
    const dx = px - d.x;
    const dz = pz - d.z;
    const dist = Math.hypot(dx, dz);
    if (dist > d.range) return false;
    if (dist > 1e-6) {
      const cos = (dx * Math.sin(this.heading) + dz * Math.cos(this.heading)) / dist;
      if (cos < Math.cos(d.halfAngle)) return false;
    }
    if (segmentBlockedAny(d.x, d.z, px, pz, occluders)) return false;
    return true;
  }

  /** Feeds the exposure meter; returns true on the step the beam counts as having seen. */
  expose(dt: number, exposed: boolean): boolean {
    return this.telegraph.update(dt, exposed);
  }

  private apply(): void {
    const d = this.def;
    const slot = d.sweepTime + d.restTime;
    const u = this.clock % this.period;
    const seg = u < slot ? 0 : 1;
    const within = u - seg * slot;
    const forward = seg === 0 ? 1 : -1;
    if (within < d.sweepTime) {
      this.on = true;
      const f = within / d.sweepTime;
      this.heading = d.heading + forward * (-d.arc + 2 * d.arc * f);
    } else {
      this.on = false;
      this.heading = d.heading + forward * d.arc;
    }
  }
}
