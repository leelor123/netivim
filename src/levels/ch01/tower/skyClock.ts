import * as THREE from 'three';
import type { LevelWorld } from '../../../gameplay/runtime/levelKit';

/**
 * The sun as the clock: sky, sun, hemisphere light and fog follow the day fraction from dawn
 * (0) to sunset (1). Colors are lerped in place on preallocated objects (no per-frame
 * allocation). Mandate-era palette; the late keys give the long golden hour and the afterglow.
 */

interface Key {
  readonly t: number;
  readonly top: string;
  readonly horizon: string;
  readonly bottom: string;
  readonly sun: string;
  readonly hemiSky: string;
  readonly hemiGround: string;
  readonly fog: string;
  /** Degrees above the horizon and compass bearing (0 = -z, 90 = +x). */
  readonly elevation: number;
  readonly azimuth: number;
  readonly sunIntensity: number;
  readonly hemiIntensity: number;
  readonly sunSize: number;
}

export const SKY_KEYS: readonly Key[] = [
  { t: 0, top: '#5d7fae', horizon: '#f3b98a', bottom: '#b98e72', sun: '#ffc58a', hemiSky: '#c9c3c8', hemiGround: '#5a4636', fog: '#e8c9a8', elevation: 8, azimuth: 95, sunIntensity: 2.0, hemiIntensity: 0.95, sunSize: 1.6 },
  { t: 0.3, top: '#6f9cc4', horizon: '#eadfc2', bottom: '#b7a07e', sun: '#fff0cf', hemiSky: '#e6e0cc', hemiGround: '#5d4a36', fog: '#dcd2b8', elevation: 38, azimuth: 130, sunIntensity: 2.9, hemiIntensity: 1.2, sunSize: 1 },
  { t: 0.55, top: '#6f9cc4', horizon: '#e8dcc0', bottom: '#b7a07e', sun: '#fff4dc', hemiSky: '#e6e0cc', hemiGround: '#5d4a36', fog: '#dcd2b8', elevation: 62, azimuth: 180, sunIntensity: 3.0, hemiIntensity: 1.25, sunSize: 1 },
  { t: 0.78, top: '#6c8fb8', horizon: '#f0d2a0', bottom: '#b89870', sun: '#ffd08a', hemiSky: '#ecd2b6', hemiGround: '#5a4632', fog: '#e4c9a0', elevation: 24, azimuth: 235, sunIntensity: 2.7, hemiIntensity: 1.05, sunSize: 1.3 },
  { t: 0.92, top: '#4d5a8f', horizon: '#ff9a54', bottom: '#8a5a52', sun: '#ff8a3c', hemiSky: '#d6a3a8', hemiGround: '#52404a', fog: '#d9967a', elevation: 7, azimuth: 262, sunIntensity: 2.3, hemiIntensity: 0.8, sunSize: 2.4 },
  { t: 1, top: '#2c3560', horizon: '#d8684a', bottom: '#4a3a48', sun: '#ff6a2e', hemiSky: '#8a7aa0', hemiGround: '#3a3445', fog: '#8a6670', elevation: 2.5, azimuth: 268, sunIntensity: 1.2, hemiIntensity: 0.6, sunSize: 2.8 },
];

/** Index of the key segment [i, i + 1] containing t (clamped). */
export function segmentIndex(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  for (let i = 0; i < SKY_KEYS.length - 1; i++) if (c <= (SKY_KEYS[i + 1] as Key).t) return i;
  return SKY_KEYS.length - 2;
}

/** 0-1 "how dark" for lamps, windows and crickets: starts at the golden hour, full at sunset. */
export function duskAmount(t: number): number {
  return Math.min(1, Math.max(0, (t - 0.78) / 0.2));
}

const smooth = (x: number): number => x * x * (3 - 2 * x);

interface ParsedKey {
  readonly top: THREE.Color;
  readonly horizon: THREE.Color;
  readonly bottom: THREE.Color;
  readonly sun: THREE.Color;
  readonly hemiSky: THREE.Color;
  readonly hemiGround: THREE.Color;
  readonly fog: THREE.Color;
}

const PARSED: readonly ParsedKey[] = SKY_KEYS.map((k) => ({
  top: new THREE.Color(k.top),
  horizon: new THREE.Color(k.horizon),
  bottom: new THREE.Color(k.bottom),
  sun: new THREE.Color(k.sun),
  hemiSky: new THREE.Color(k.hemiSky),
  hemiGround: new THREE.Color(k.hemiGround),
  fog: new THREE.Color(k.fog),
}));

export class SkyClock {
  private readonly dir = new THREE.Vector3();
  private lastT = -1;

  constructor(private readonly world: LevelWorld) {}

  /** Sets the whole sky for the day fraction. Cheap and allocation-free; skips tiny changes. */
  apply(t: number): void {
    if (Math.abs(t - this.lastT) < 0.0005) return;
    this.lastT = t;
    const i = segmentIndex(t);
    const a = SKY_KEYS[i] as Key;
    const b = SKY_KEYS[i + 1] as Key;
    const pa = PARSED[i] as ParsedKey;
    const pb = PARSED[i + 1] as ParsedKey;
    const k = smooth(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))));
    const w = this.world;
    const u = w.sky.mesh.material.uniforms;
    (u.uTop?.value as THREE.Color).lerpColors(pa.top, pb.top, k);
    (u.uHorizon?.value as THREE.Color).lerpColors(pa.horizon, pb.horizon, k);
    (u.uBottom?.value as THREE.Color).lerpColors(pa.bottom, pb.bottom, k);
    (u.uSunColor?.value as THREE.Color).lerpColors(pa.sun, pb.sun, k);
    if (u.uSunSize) u.uSunSize.value = a.sunSize + (b.sunSize - a.sunSize) * k;

    const el = THREE.MathUtils.degToRad(a.elevation + (b.elevation - a.elevation) * k);
    const az = THREE.MathUtils.degToRad(a.azimuth + (b.azimuth - a.azimuth) * k);
    this.dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    w.sunDirection.copy(this.dir);
    (u.uSunDir?.value as THREE.Vector3).copy(this.dir);
    w.sun.position.copy(w.sun.target.position).addScaledVector(this.dir, 120);
    w.sun.color.lerpColors(pa.sun, pb.sun, k);
    w.sun.intensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * k;
    w.hemi.color.lerpColors(pa.hemiSky, pb.hemiSky, k);
    w.hemi.groundColor.lerpColors(pa.hemiGround, pb.hemiGround, k);
    w.hemi.intensity = a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * k;
    const bg = w.scene.background;
    if (bg instanceof THREE.Color) bg.lerpColors(pa.fog, pb.fog, k);
    const fog = w.scene.fog;
    if (fog) fog.color.lerpColors(pa.fog, pb.fog, k);
  }
}
