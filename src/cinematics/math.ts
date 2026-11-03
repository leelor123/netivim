import type { EasingName, Vec3Tuple } from './types';

/** Maps u in [0,1] through a named curve. 'hold' keeps the start value until the segment ends. */
export function ease(name: EasingName | undefined, u: number): number {
  const x = u <= 0 ? 0 : u >= 1 ? 1 : u;
  switch (name ?? 'smoothstep') {
    case 'linear':
      return x;
    case 'easeIn':
      return x * x * x;
    case 'easeOut': {
      const k = 1 - x;
      return 1 - k * k * k;
    }
    case 'easeInOut':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'smoothstep':
      return x * x * (3 - 2 * x);
    case 'hold':
      return x >= 1 ? 1 : 0;
  }
}

/** Uniform Catmull-Rom scalar spline between p1 and p2 (p0, p3 are the neighbours). */
export function catmullRom(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

export interface Vec3Out {
  x: number;
  y: number;
  z: number;
}

export function lerpVec3(a: Vec3Tuple, b: Vec3Tuple, u: number, out: Vec3Out): void {
  out.x = a[0] + (b[0] - a[0]) * u;
  out.y = a[1] + (b[1] - a[1]) * u;
  out.z = a[2] + (b[2] - a[2]) * u;
}

export function catmullRomVec3(p0: Vec3Tuple, p1: Vec3Tuple, p2: Vec3Tuple, p3: Vec3Tuple, u: number, out: Vec3Out): void {
  out.x = catmullRom(p0[0], p1[0], p2[0], p3[0], u);
  out.y = catmullRom(p0[1], p1[1], p2[1], p3[1], u);
  out.z = catmullRom(p0[2], p1[2], p2[2], p3[2], u);
}

export function distVec3(a: Vec3Tuple, b: Vec3Tuple): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
