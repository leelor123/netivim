import { mixInto, rgb, type RGB } from './color';
import { clamp01, fbm, ridged, smoothstep, SimplexNoise2D, ValueNoise2D } from './noise';
import { hashString } from './rng';

/** Landscapes of the region (stylized, not survey-accurate). */
export type BiomeId =
  | 'coastalPlain'
  | 'judeanHills'
  | 'samarianHills'
  | 'jerusalemRidge'
  | 'negev'
  | 'galilee'
  | 'golan'
  | 'jordanValley'
  | 'deadSeaShore';

export const BIOME_IDS: readonly BiomeId[] = [
  'coastalPlain',
  'judeanHills',
  'samarianHills',
  'jerusalemRidge',
  'negev',
  'galilee',
  'golan',
  'jordanValley',
  'deadSeaShore',
];

/** Seeded noise sources shared by every biome of one terrain. */
export class NoiseSet {
  readonly a: SimplexNoise2D;
  readonly b: SimplexNoise2D;
  readonly v: ValueNoise2D;

  constructor(seed: number) {
    this.a = new SimplexNoise2D(seed);
    this.b = new SimplexNoise2D(seed ^ hashString('b'));
    this.v = new ValueNoise2D(seed ^ hashString('v'));
  }
}

/** Inputs for coloring one terrain face. */
export interface ColorSample {
  x: number;
  z: number;
  height: number;
  /** 0 = flat, 1 = vertical. */
  slope: number;
  /** 0-1 seeded per-face jitter. */
  jitter: number;
}

export interface Biome {
  readonly id: BiomeId;
  readonly nameKey: string;
  /** Default sea / lake level for the biome, or null for none. */
  readonly waterLevel: number | null;
  readonly waterColor: string;
  height(x: number, z: number, n: NoiseSet): number;
  color(out: RGB, s: ColorSample, n: NoiseSet): RGB;
}

/** Soft terraces (Judean and Samarian hill agriculture): flat steps with short risers. */
export function terrace(h: number, step: number, sharpness: number): number {
  const k = Math.floor(h / step);
  const f = h / step - k;
  return (k + smoothstep(0.5 - sharpness * 0.5, 0.5 + sharpness * 0.5, f)) * step;
}

const C = {
  sand: rgb('#e3cf9f'),
  dune: rgb('#ecd9a8'),
  wetSand: rgb('#c8b07c'),
  dryGrass: rgb('#b9a464'),
  plainGreen: rgb('#8f9a52'),
  scrub: rgb('#6f7a42'),
  olive: rgb('#7c8450'),
  terraRossa: rgb('#a8673f'),
  limestone: rgb('#cdbf9f'),
  paleStone: rgb('#ddd2b8'),
  greyStone: rgb('#9c968a'),
  ochre: rgb('#c9945a'),
  desertTan: rgb('#d8b07a'),
  wadiBed: rgb('#bba585'),
  darkRock: rgb('#7d5f45'),
  galileeGreen: rgb('#6c8a45'),
  meadow: rgb('#86a052'),
  basalt: rgb('#4a4744'),
  basaltSoil: rgb('#6b5a48'),
  valleyGreen: rgb('#7e9a4a'),
  marl: rgb('#d9cfb4'),
  salt: rgb('#f0ece0'),
  cliff: rgb('#b99a74'),
} as const;

const tmp: RGB = [0, 0, 0];

function rockOnSlope(out: RGB, s: ColorSample, rock: Readonly<RGB>, from: number, to: number): RGB {
  return mixInto(out, out, rock, smoothstep(from, to, s.slope + (s.jitter - 0.5) * 0.08));
}

function vary(out: RGB, j: number, amount: number): RGB {
  const k = 1 + (j - 0.5) * amount;
  out[0] *= k;
  out[1] *= k;
  out[2] *= k;
  return out;
}

const coastalPlain: Biome = {
  id: 'coastalPlain', nameKey: 'world.biome.coastalPlain', waterLevel: 0, waterColor: '#3f8fa8',
  height(x, z, n) {
    const base = 3 + fbm(n.a, x * 0.006, z * 0.006, 4) * 5;
    const duneMask = smoothstep(40, -20, x);
    const dunes = ridged(n.b, x * 0.03, z * 0.012, 3) * 4 * duneMask;
    const sea = clamp01((-x - 70) / 40) * 14;
    return base + dunes - sea;
  },
  color(out, s, n) {
    const green = clamp01(0.5 + fbm(n.v, s.x * 0.02, s.z * 0.02, 2));
    mixInto(out, C.dryGrass, C.plainGreen, green);
    mixInto(tmp, C.sand, C.dune, s.jitter);
    mixInto(out, out, tmp, smoothstep(20, -30, s.x));
    if (s.height < 1.2) mixInto(out, out, C.wetSand, smoothstep(1.2, 0.2, s.height));
    return vary(out, s.jitter, 0.1);
  },
};

function hillsHeight(x: number, z: number, n: NoiseSet, amp: number, step: number): number {
  const shape = fbm(n.a, x * 0.0055, z * 0.0055, 5) * 0.5 + 0.5;
  const h = 4 + Math.pow(shape, 1.35) * amp;
  const terraceMask = smoothstep(-0.2, 0.3, n.b.sample(x * 0.004, z * 0.004));
  return h + (terrace(h, step, 0.35) - h) * terraceMask * 0.85;
}

function hillsColor(out: RGB, s: ColorSample, n: NoiseSet, soil: Readonly<RGB>, rock: Readonly<RGB>): RGB {
  const veg = clamp01(0.45 + fbm(n.v, s.x * 0.015, s.z * 0.015, 2) * 0.9);
  mixInto(out, soil, C.olive, veg * 0.7);
  mixInto(out, out, C.scrub, smoothstep(0.55, 0.95, veg) * 0.5);
  rockOnSlope(out, s, rock, 0.18, 0.4);
  return vary(out, s.jitter, 0.14);
}

const judeanHills: Biome = {
  id: 'judeanHills', nameKey: 'world.biome.judeanHills', waterLevel: null, waterColor: '#4b7f8a',
  height: (x, z, n) => hillsHeight(x, z, n, 48, 3),
  color: (out, s, n) => hillsColor(out, s, n, C.terraRossa, C.limestone),
};

const samarianHills: Biome = {
  id: 'samarianHills', nameKey: 'world.biome.samarianHills', waterLevel: null, waterColor: '#4b7f8a',
  height: (x, z, n) => hillsHeight(x * 0.85, z * 0.85, n, 40, 2.5),
  color(out, s, n) {
    hillsColor(out, s, n, C.terraRossa, C.greyStone);
    return mixInto(out, out, C.galileeGreen, 0.2);
  },
};

const jerusalemRidge: Biome = {
  id: 'jerusalemRidge', nameKey: 'world.biome.jerusalemRidge', waterLevel: null, waterColor: '#4b7f8a',
  height(x, z, n) {
    const r = ridged(n.a, x * 0.005, z * 0.005, 4);
    const h = 10 + r * 62 + fbm(n.b, x * 0.02, z * 0.02, 2) * 3;
    return h + (terrace(h, 4, 0.25) - h) * 0.5;
  },
  color(out, s, n) {
    hillsColor(out, s, n, C.limestone, C.paleStone);
    return mixInto(out, out, C.paleStone, smoothstep(40, 70, s.height) * 0.5);
  },
};

const negev: Biome = {
  id: 'negev', nameKey: 'world.biome.negev', waterLevel: null, waterColor: '#4b7f8a',
  height(x, z, n) {
    const base = 8 + fbm(n.a, x * 0.004, z * 0.004, 4) * 16;
    const mesa = terrace(base, 7, 0.75);
    const channel = 1 - Math.abs(n.b.sample(x * 0.0045, z * 0.0045));
    const wadi = smoothstep(0.9, 0.99, channel) * 9;
    return mesa - wadi + fbm(n.v, x * 0.05, z * 0.05, 2) * 0.6;
  },
  color(out, s, n) {
    mixInto(out, C.desertTan, C.ochre, clamp01(0.5 + fbm(n.v, s.x * 0.01, s.z * 0.01, 2)));
    const channel = 1 - Math.abs(n.b.sample(s.x * 0.0045, s.z * 0.0045));
    mixInto(out, out, C.wadiBed, smoothstep(0.92, 0.985, channel));
    rockOnSlope(out, s, C.darkRock, 0.3, 0.55);
    return vary(out, s.jitter, 0.12);
  },
};

const galilee: Biome = {
  id: 'galilee', nameKey: 'world.biome.galilee', waterLevel: null, waterColor: '#3e7f9a',
  height(x, z, n) {
    const shape = fbm(n.a, x * 0.005, z * 0.005, 5) * 0.5 + 0.5;
    return 6 + Math.pow(shape, 1.2) * 52;
  },
  color(out, s, n) {
    mixInto(out, C.galileeGreen, C.meadow, clamp01(0.5 + fbm(n.v, s.x * 0.02, s.z * 0.02, 2)));
    rockOnSlope(out, s, C.basalt, 0.25, 0.5);
    return vary(out, s.jitter, 0.12);
  },
};

const golan: Biome = {
  id: 'golan', nameKey: 'world.biome.golan', waterLevel: null, waterColor: '#3e7f9a',
  height(x, z, n) {
    const plateau = 46 + fbm(n.a, x * 0.008, z * 0.008, 3) * 4;
    const cones = Math.max(0, n.b.sample(x * 0.006, z * 0.006) - 0.55) * 60;
    const scarp = smoothstep(-40, 20, x + n.v.sample(z * 0.02, 0) * 15);
    return 4 + (plateau - 4) * scarp + cones * scarp;
  },
  color(out, s, n) {
    mixInto(out, C.basaltSoil, C.dryGrass, clamp01(0.5 + fbm(n.v, s.x * 0.02, s.z * 0.02, 2)));
    if (s.jitter > 0.86) mixInto(out, out, C.basalt, 0.7);
    rockOnSlope(out, s, C.basalt, 0.2, 0.42);
    return vary(out, s.jitter, 0.1);
  },
};

const jordanValley: Biome = {
  id: 'jordanValley', nameKey: 'world.biome.jordanValley', waterLevel: -12, waterColor: '#4f8c7c',
  height(x, z, n) {
    const floor = -10 + fbm(n.a, x * 0.01, z * 0.01, 3) * 2;
    const walls = smoothstep(70, 170, Math.abs(x)) * (45 + fbm(n.b, x * 0.006, z * 0.006, 4) * 20);
    const river = smoothstep(6, 0, Math.abs(x - n.v.sample(z * 0.01, 3) * 25)) * 3;
    return floor + walls - river;
  },
  color(out, s, n) {
    mixInto(out, C.marl, C.valleyGreen, smoothstep(0, 1, 0.5 + fbm(n.v, s.x * 0.03, s.z * 0.03, 2)) * smoothstep(6, -4, s.height));
    rockOnSlope(out, s, C.cliff, 0.25, 0.5);
    return vary(out, s.jitter, 0.1);
  },
};

const deadSeaShore: Biome = {
  id: 'deadSeaShore', nameKey: 'world.biome.deadSeaShore', waterLevel: 0, waterColor: '#5fb3b0',
  height(x, z, n) {
    const shore = 2 + fbm(n.a, x * 0.01, z * 0.01, 3) * 1.5 - clamp01((x - 30) / 50) * 8;
    const cliffs = smoothstep(-40, -110, x + n.b.sample(z * 0.01, 0) * 20) * (70 + fbm(n.b, x * 0.01, z * 0.01, 3) * 25);
    return shore + cliffs;
  },
  color(out, s, n) {
    mixInto(out, C.marl, C.desertTan, clamp01(0.4 + fbm(n.v, s.x * 0.02, s.z * 0.02, 2)));
    if (s.height < 1.4) mixInto(out, out, C.salt, smoothstep(1.4, 0.3, s.height));
    rockOnSlope(out, s, C.cliff, 0.25, 0.5);
    return vary(out, s.jitter, 0.1);
  },
};

export const BIOMES: Readonly<Record<BiomeId, Biome>> = {
  coastalPlain,
  judeanHills,
  samarianHills,
  jerusalemRidge,
  negev,
  galilee,
  golan,
  jordanValley,
  deadSeaShore,
};
