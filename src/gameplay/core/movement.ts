import { Point2, resolveCircle, type Bounds, type Collider } from './collision';

/**
 * Third-person character motor: camera-relative movement with smooth acceleration, turning,
 * collision and terrain following. Pure (no three.js) and allocation-free.
 *
 * Conventions: input y is down-positive (stick forward = -1). Camera yaw 0 looks along +z;
 * forward = (sin yaw, cos yaw), right = (-cos yaw, sin yaw). Heading 0 faces +z.
 */

export interface MotorParams {
  /** Meters per second at full stick. */
  readonly maxSpeed: number;
  /** Velocity smoothing rate (1/s); higher is snappier. */
  readonly accel: number;
  /** Heading turn rate (rad/s). */
  readonly turnRate: number;
  /** Collision radius in meters. */
  readonly radius: number;
}

export const DEFAULT_MOTOR: MotorParams = { maxSpeed: 4.2, accel: 10, turnRate: 10, radius: 0.35 };

export type HeightFn = (x: number, z: number) => number;

export class CharacterMotor {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vz = 0;
  heading = 0;
  colliders: readonly Collider[] = [];
  bounds: Bounds | null = null;
  heightAt: HeightFn = () => 0;
  private readonly p = new Point2();

  constructor(public params: MotorParams = DEFAULT_MOTOR) {}

  /** Teleport (checkpoint restore); clears velocity. */
  place(x: number, z: number, heading = this.heading): void {
    this.x = x;
    this.z = z;
    this.vx = 0;
    this.vz = 0;
    this.heading = heading;
    this.y = this.heightAt(x, z);
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  /** 0-1 walk amount for the figure rig. */
  get walk(): number {
    return Math.min(1, this.speed / this.params.maxSpeed);
  }

  /** One fixed step. inputX/inputY are stick axes (-1..1, y down). */
  update(dt: number, inputX: number, inputY: number, cameraYaw: number): void {
    const { maxSpeed, accel, turnRate, radius } = this.params;
    let ix = inputX;
    let iy = inputY;
    const mag = Math.hypot(ix, iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }
    const fx = Math.sin(cameraYaw);
    const fz = Math.cos(cameraYaw);
    const rx = -Math.cos(cameraYaw);
    const rz = Math.sin(cameraYaw);
    const fwd = -iy;
    const tx = (fx * fwd + rx * ix) * maxSpeed;
    const tz = (fz * fwd + rz * ix) * maxSpeed;
    const k = Math.min(1, accel * dt);
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;
    if (Math.abs(this.vx) < 1e-4 && tx === 0) this.vx = 0;
    if (Math.abs(this.vz) < 1e-4 && tz === 0) this.vz = 0;

    this.p.x = this.x + this.vx * dt;
    this.p.z = this.z + this.vz * dt;
    resolveCircle(this.p, radius, this.colliders, this.bounds);
    // Velocity follows what actually happened (sliding along walls, no build-up into them).
    if (dt > 0) {
      this.vx = (this.p.x - this.x) / dt;
      this.vz = (this.p.z - this.z) / dt;
    }
    this.x = this.p.x;
    this.z = this.p.z;
    this.y = this.heightAt(this.x, this.z);

    if (this.speed > 0.05) {
      const target = Math.atan2(this.vx, this.vz);
      this.heading = turnToward(this.heading, target, turnRate * dt);
    }
  }
}

/** Wraps an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r <= -Math.PI) r += Math.PI * 2;
  return r;
}

/** Rotates `from` toward `to` by at most `maxStep` radians along the shortest arc. */
export function turnToward(from: number, to: number, maxStep: number): number {
  const d = wrapAngle(to - from);
  if (Math.abs(d) <= maxStep) return wrapAngle(to);
  return wrapAngle(from + Math.sign(d) * maxStep);
}

/** Stick vector that walks toward a world point for a given camera yaw (used by the QA bot). */
export function stickToward(fromX: number, fromZ: number, toX: number, toZ: number, cameraYaw: number, out: { x: number; y: number }): { x: number; y: number } {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const nx = dx / d;
  const nz = dz / d;
  const fwd = nx * Math.sin(cameraYaw) + nz * Math.cos(cameraYaw);
  const right = nx * -Math.cos(cameraYaw) + nz * Math.sin(cameraYaw);
  // Slow down on arrival so the bot does not orbit its target.
  const s = Math.min(1, d / 1.5);
  out.x = right * s;
  out.y = -fwd * s;
  return out;
}
