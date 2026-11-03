/**
 * Orbit camera state for the map. Pure math (no three.js) so it is unit-testable; the scene copies
 * position() into the camera. Right stick orbits, triggers and pinch zoom.
 */
export interface RigLimits {
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly minPolar: number;
  readonly maxPolar: number;
}

export const DEFAULT_LIMITS: RigLimits = { minDistance: 8, maxDistance: 80, minPolar: 0.15, maxPolar: 1.4 };

export class CameraRig {
  azimuth = 0;
  /** Angle from straight down (0) to the horizon (PI / 2). */
  polar = 0.95;
  distance = 62;
  /** Orbit target (x, z on the ground plane). */
  targetX = 0;
  targetZ = 0;
  targetY = 0;

  constructor(private readonly limits: RigLimits = DEFAULT_LIMITS) {}

  orbit(dAzimuth: number, dPolar: number): void {
    this.azimuth += dAzimuth;
    this.polar = Math.min(this.limits.maxPolar, Math.max(this.limits.minPolar, this.polar + dPolar));
  }

  /** factor < 1 zooms in, > 1 zooms out. */
  zoom(factor: number): void {
    this.distance = Math.min(this.limits.maxDistance, Math.max(this.limits.minDistance, this.distance * factor));
  }

  /** Stick / trigger input for dt seconds. Reduced motion halves the speed so nothing sweeps. */
  applyAnalog(dt: number, lookX: number, lookY: number, scroll: number, reducedMotion: boolean): void {
    const dead = 0.15;
    const speed = reducedMotion ? 0.8 : 1.8;
    const lx = Math.abs(lookX) > dead ? lookX : 0;
    const ly = Math.abs(lookY) > dead ? lookY : 0;
    if (lx !== 0 || ly !== 0) this.orbit(lx * speed * dt, ly * speed * dt * 0.7);
    if (Math.abs(scroll) > 0.05) this.zoom(Math.exp(scroll * dt * (reducedMotion ? 0.8 : 1.6)));
  }

  /** Camera position written into out. */
  position(out: { x: number; y: number; z: number }): void {
    const sinP = Math.sin(this.polar);
    out.x = this.targetX + this.distance * sinP * Math.sin(this.azimuth);
    out.y = this.targetY + this.distance * Math.cos(this.polar);
    out.z = this.targetZ + this.distance * sinP * Math.cos(this.azimuth);
  }
}
