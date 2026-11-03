import { hash2i, Rng } from './rng';

/** Any 2D noise source returning values roughly in [-1, 1]. */
export interface Noise2D {
  sample(x: number, y: number): number;
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** Seeded lattice value noise with quintic interpolation. */
export class ValueNoise2D implements Noise2D {
  constructor(private readonly seed: number) {}

  private lattice(ix: number, iy: number): number {
    return (hash2i(ix, iy, this.seed) / 4294967296) * 2 - 1;
  }

  sample(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const u = fade(x - ix);
    const v = fade(y - iy);
    const a = this.lattice(ix, iy);
    const b = this.lattice(ix + 1, iy);
    const c = this.lattice(ix, iy + 1);
    const d = this.lattice(ix + 1, iy + 1);
    const top = a + (b - a) * u;
    const bottom = c + (d - c) * u;
    return top + (bottom - top) * v;
  }
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD_X = [1, -1, 1, -1, 1, -1, 0, 0, 0.7071, -0.7071, 0.7071, -0.7071];
const GRAD_Y = [0, 0, 1, -1, 0, 0, 1, -1, 0.7071, 0.7071, -0.7071, -0.7071];

/** Seeded 2D simplex noise (Gustavson), output in about [-1, 1]. */
export class SimplexNoise2D implements Noise2D {
  private readonly perm = new Uint8Array(512);

  constructor(seed: number) {
    const rng = new Rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const t = p[i] ?? 0;
      p[i] = p[j] ?? 0;
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255] ?? 0;
  }

  private corner(gi: number, x: number, y: number): number {
    let t = 0.5 - x * x - y * y;
    if (t < 0) return 0;
    t *= t;
    const g = gi % 12;
    return t * t * ((GRAD_X[g] ?? 0) * x + (GRAD_Y[g] ?? 0) * y);
  }

  sample(xin: number, yin: number): number {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const p = this.perm;
    const g0 = p[ii + (p[jj] ?? 0)] ?? 0;
    const g1 = p[ii + i1 + (p[jj + j1] ?? 0)] ?? 0;
    const g2 = p[ii + 1 + (p[jj + 1] ?? 0)] ?? 0;
    return 70 * (this.corner(g0, x0, y0) + this.corner(g1, x1, y1) + this.corner(g2, x2, y2));
  }
}

/** Fractal Brownian motion: summed octaves, normalized back to about [-1, 1]. */
export function fbm(noise: Noise2D, x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let o = 0; o < octaves; o++) {
    sum += noise.sample(fx, fy) * amp;
    norm += amp;
    amp *= gain;
    fx = fx * lacunarity + 17.31;
    fy = fy * lacunarity - 9.77;
  }
  return sum / norm;
}

/** Ridged multifractal in [0, 1]: sharp crests (stone ridges) and soft valleys. */
export function ridged(noise: Noise2D, x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let o = 0; o < octaves; o++) {
    const r = 1 - Math.abs(noise.sample(fx, fy));
    sum += r * r * amp;
    norm += amp;
    amp *= gain;
    fx = fx * lacunarity + 5.13;
    fy = fy * lacunarity + 11.7;
  }
  return sum / norm;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
