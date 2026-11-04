import { segmentBlockedAny, type Collider } from '../core/collision';
import { Telegraph } from '../core/telegraph';

/**
 * Stealth / avoidance (STL): patrols walk waypoint loops with vision cones. Being inside a cone
 * fills a telegraphed "noticed" meter; only a full meter (minimum warning time from difficulty)
 * counts as seen, which is a soft fail with instant retry. No harm, ever.
 */

export interface PatrolDef {
  readonly id: string;
  /** Closed loop of waypoints [x, z]. */
  readonly path: readonly (readonly [number, number])[];
  /** Meters per second. */
  readonly speed: number;
  readonly viewRange: number;
  /** Half of the cone angle in radians. */
  readonly viewHalfAngle: number;
  /** Seconds to pause at each waypoint (looking around). */
  readonly pause?: number;
}

export class Patrol {
  x = 0;
  z = 0;
  heading = 0;
  private segment = 0;
  private along = 0;
  private waiting = 0;
  readonly telegraph: Telegraph;

  constructor(
    readonly def: PatrolDef,
    warningSeconds: () => number,
  ) {
    if (def.path.length < 1) throw new Error('Patrol needs a path');
    this.telegraph = new Telegraph(warningSeconds);
    this.reset();
  }

  reset(): void {
    const p = this.def.path[0] as readonly [number, number];
    this.x = p[0];
    this.z = p[1];
    this.segment = 0;
    this.along = 0;
    this.waiting = 0;
    this.telegraph.reset();
    this.faceNext();
  }

  update(dt: number): void {
    const path = this.def.path;
    if (path.length < 2) return;
    if (this.waiting > 0) {
      this.waiting -= dt;
      return;
    }
    let move = this.def.speed * dt;
    let guard = 0;
    while (move > 0 && guard++ <= path.length * 2) {
      const a = path[this.segment] as readonly [number, number];
      const b = path[(this.segment + 1) % path.length] as readonly [number, number];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const left = len - this.along;
      if (move < left) {
        this.along += move;
        move = 0;
      } else {
        move -= left;
        this.segment = (this.segment + 1) % path.length;
        this.along = 0;
        this.waiting = this.def.pause ?? 0;
        if (this.waiting > 0) move = 0;
      }
      const s = path[this.segment] as readonly [number, number];
      const e = path[(this.segment + 1) % path.length] as readonly [number, number];
      const l = Math.max(1e-6, Math.hypot(e[0] - s[0], e[1] - s[1]));
      this.x = s[0] + ((e[0] - s[0]) * this.along) / l;
      this.z = s[1] + ((e[1] - s[1]) * this.along) / l;
      this.heading = Math.atan2(e[0] - s[0], e[1] - s[1]);
    }
  }

  /** True when the point is inside the vision cone and not hidden behind an occluder. */
  sees(px: number, pz: number, occluders: readonly Collider[]): boolean {
    const dx = px - this.x;
    const dz = pz - this.z;
    const d = Math.hypot(dx, dz);
    if (d > this.def.viewRange) return false;
    if (d > 1e-6) {
      const fx = Math.sin(this.heading);
      const fz = Math.cos(this.heading);
      const cos = (dx * fx + dz * fz) / d;
      if (cos < Math.cos(this.def.viewHalfAngle)) return false;
    }
    if (segmentBlockedAny(this.x, this.z, px, pz, occluders)) return false;
    return true;
  }

  private faceNext(): void {
    const path = this.def.path;
    const a = path[0] as readonly [number, number];
    const b = (path[1] ?? path[0]) as readonly [number, number];
    this.heading = Math.atan2(b[0] - a[0], b[1] - a[1]);
  }
}

export type StealthStatus = 'clear' | 'warning' | 'seen';

export class StealthField {
  readonly patrols: Patrol[];
  /** Highest notice level of any patrol (0-1), for the HUD meter. */
  alert = 0;

  constructor(
    defs: readonly PatrolDef[],
    warningSeconds: () => number,
    public occluders: readonly Collider[] = [],
  ) {
    this.patrols = defs.map((d) => new Patrol(d, warningSeconds));
  }

  reset(): void {
    for (const p of this.patrols) p.reset();
    this.alert = 0;
  }

  /** Hidden spots (bushes, doorways) can make the player invisible. */
  update(dt: number, px: number, pz: number, hidden = false): StealthStatus {
    let status: StealthStatus = 'clear';
    this.alert = 0;
    for (const p of this.patrols) {
      p.update(dt);
      const exposed = !hidden && p.sees(px, pz, this.occluders);
      if (p.telegraph.update(dt, exposed)) status = 'seen';
      else if (status !== 'seen' && p.telegraph.phase === 'warning') status = 'warning';
      this.alert = Math.max(this.alert, p.telegraph.phase === 'triggered' ? 1 : p.telegraph.level);
    }
    return status;
  }
}
