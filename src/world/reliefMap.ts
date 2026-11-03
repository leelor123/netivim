import * as THREE from 'three';
import { mixInto, rgb, type RGB } from './color';
import { fbm, smoothstep, SimplexNoise2D } from './noise';
import { hash01 } from './rng';

/**
 * The Archive's glowing relief map of the region (stylized, not survey-accurate): coastal plain,
 * central hills, the Jordan rift with the Kinneret and the Dead Sea, the eastern plateau and the
 * Negev. u runs west to east, v north (-1) to south (+1).
 */
export interface ReliefSample {
  height: number;
  water: boolean;
}

const noise = new SimplexNoise2D(1948);

export function reliefHeight(u: number, v: number, out: ReliefSample): ReliefSample {
  const coast = -0.38 - 0.14 * v + noise.sample(v * 3, 1) * 0.02;
  const riftX = 0.47 + 0.04 * v;
  const d = u - coast;
  if (d < 0) {
    out.height = -0.06 + d * 0.05;
    out.water = true;
    return out;
  }
  let h = Math.min(0.12, d * 0.35);
  const ridge = Math.exp(-Math.pow((u - 0.12 - 0.05 * v) / 0.2, 2)) * (0.75 - 0.35 * smoothstep(0.35, 0.9, v));
  const carmel = Math.exp(-(Math.pow((u + 0.28) / 0.08, 2) + Math.pow((v + 0.62) / 0.06, 2))) * 0.35;
  const galilee = smoothstep(-0.5, -0.8, v) * 0.35 * smoothstep(-0.25, 0.1, u);
  h += ridge + carmel + galilee;
  h += fbm(noise, u * 5, v * 5, 3) * 0.06 * smoothstep(0, 0.2, d);
  const rift = Math.exp(-Math.pow((u - riftX) / 0.07, 2));
  const plateau = smoothstep(riftX + 0.04, riftX + 0.3, u) * 0.42;
  h = h * (1 - rift) - rift * 0.22 + plateau * (1 - rift);
  out.height = h;
  const kinneret = Math.hypot((u - riftX) / 0.05, (v + 0.6) / 0.09) < 1;
  const deadSea = Math.hypot((u - riftX) / 0.05, (v - 0.25) / 0.17) < 1;
  out.water = kinneret || deadSea;
  if (out.water) out.height = Math.min(h, -0.22);
  return out;
}

const COLORS = {
  sea: rgb('#1d6d86'),
  lake: rgb('#2f8f9a'),
  sand: rgb('#d9c38f'),
  plain: rgb('#6f8f4a'),
  hills: rgb('#b0966a'),
  high: rgb('#e2d6b8'),
  desert: rgb('#c8995a'),
  rift: rgb('#5d7a3c'),
  plateau: rgb('#a88a5c'),
};

const s = { height: 0, water: false };
const tmp: RGB = [0, 0, 0];

function reliefColor(out: RGB, u: number, v: number, h: number, water: boolean, j: number): RGB {
  if (water) return mixInto(out, h < -0.1 ? COLORS.lake : COLORS.sea, COLORS.sea, 0);
  mixInto(out, COLORS.plain, COLORS.hills, smoothstep(0.1, 0.45, h));
  mixInto(out, out, COLORS.high, smoothstep(0.55, 0.9, h));
  const coast = -0.38 - 0.14 * v;
  mixInto(out, out, COLORS.sand, smoothstep(0.05, 0.0, u - coast));
  mixInto(out, out, COLORS.desert, smoothstep(0.35, 0.65, v) * (1 - smoothstep(0.3, 0.6, h)) * 0.85);
  mixInto(out, out, COLORS.rift, smoothstep(-0.05, -0.25, h));
  mixInto(tmp, out, COLORS.plateau, smoothstep(0.55, 0.65, u) * 0.6);
  out[0] = tmp[0] * (0.94 + j * 0.12);
  out[1] = tmp[1] * (0.94 + j * 0.12);
  out[2] = tmp[2] * (0.94 + j * 0.12);
  return out;
}

/** Non-indexed, flat-shaded relief geometry, width x depth meters, height scale in meters. */
export function reliefGeometry(width: number, depth: number, segX: number, segZ: number, heightScale: number): THREE.BufferGeometry {
  const pos = new Float32Array(segX * segZ * 18);
  const col = new Float32Array(segX * segZ * 18);
  const hs = new Float32Array((segX + 1) * (segZ + 1));
  const ws = new Uint8Array((segX + 1) * (segZ + 1));
  for (let j = 0; j <= segZ; j++) {
    for (let i = 0; i <= segX; i++) {
      reliefHeight((i / segX) * 2 - 1, (j / segZ) * 2 - 1, s);
      hs[j * (segX + 1) + i] = Math.max(s.water ? s.height : -0.06, s.height);
      ws[j * (segX + 1) + i] = s.water ? 1 : 0;
    }
  }
  let p = 0;
  const c: RGB = [0, 0, 0];
  const put = (i: number, j: number): void => {
    const k = j * (segX + 1) + i;
    const water = ws[k] === 1;
    const h = hs[k] ?? 0;
    pos[p] = (i / segX - 0.5) * width;
    pos[p + 1] = (water ? (h < -0.1 ? -0.22 : -0.06) : h) * heightScale;
    pos[p + 2] = (j / segZ - 0.5) * depth;
    col[p] = c[0];
    col[p + 1] = c[1];
    col[p + 2] = c[2];
    p += 3;
  };
  const tri = (a: [number, number], b: [number, number], d: [number, number], id: number): void => {
    const u = ((a[0] + b[0] + d[0]) / 3 / segX) * 2 - 1;
    const v = ((a[1] + b[1] + d[1]) / 3 / segZ) * 2 - 1;
    const ka = a[1] * (segX + 1) + a[0];
    const kb = b[1] * (segX + 1) + b[0];
    const kd = d[1] * (segX + 1) + d[0];
    const water = (ws[ka] ?? 0) + (ws[kb] ?? 0) + (ws[kd] ?? 0) >= 2;
    const h = ((hs[ka] ?? 0) + (hs[kb] ?? 0) + (hs[kd] ?? 0)) / 3;
    reliefColor(c, u, v, h, water, hash01(id, 7));
    put(a[0], a[1]);
    put(b[0], b[1]);
    put(d[0], d[1]);
  };
  for (let j = 0; j < segZ; j++) {
    for (let i = 0; i < segX; i++) {
      const id = (j * segX + i) * 2;
      tri([i, j], [i, j + 1], [i + 1, j], id);
      tri([i + 1, j], [i, j + 1], [i + 1, j + 1], id + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * Relief map material: lit vertex colors plus an emissive layer with glowing contour lines,
 * shimmering water and a slow scan line. uHighlight (0-1) brightens it for interaction.
 */
export class ReliefMaterial {
  readonly material: THREE.MeshStandardMaterial;
  readonly uniforms = {
    uTime: { value: 0 },
    uHighlight: { value: 0 },
    uScale: { value: 1 },
    uDepth: { value: 1 },
    uGlow: { value: new THREE.Color('#ffbe62') },
    uSea: { value: new THREE.Color('#3fd0ff') },
  };

  constructor(heightScale: number, depth: number) {
    this.uniforms.uScale.value = heightScale;
    this.uniforms.uDepth.value = depth;
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
    this.material.name = 'relief-map';
    const u = this.uniforms;
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRelief;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRelief = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vRelief;
          uniform float uTime;
          uniform float uHighlight;
          uniform float uScale;
          uniform float uDepth;
          uniform vec3 uGlow;
          uniform vec3 uSea;`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float hN = vRelief.y / uScale;
          float isSea = 1.0 - step(-0.05, hN);
          float k = hN * 9.0;
          float f = abs(fract(k) - 0.5);
          float w = fwidth(k) * 1.2;
          float contour = (1.0 - smoothstep(0.0, w, 0.5 - f)) * (1.0 - isSea);
          float scanPos = fract(uTime * 0.06) * 1.4 - 0.7;
          float scan = exp(-pow((vRelief.z / uDepth - scanPos) * 18.0, 2.0));
          float shimmer = 0.6 + 0.4 * sin(uTime * 1.3 + vRelief.x * 9.0 + vRelief.z * 7.0);
          float boost = 1.0 + uHighlight * 1.5;
          totalEmissiveRadiance += vColor.rgb * (0.16 + 0.12 * uHighlight);
          totalEmissiveRadiance += uGlow * contour * 0.6 * boost;
          totalEmissiveRadiance += uSea * isSea * shimmer * 0.35 * boost;
          totalEmissiveRadiance += mix(uGlow, uSea, 0.5) * scan * 0.55;`,
        );
    };
    this.material.customProgramCacheKey = () => 'netivim-relief';
  }

  update(elapsed: number): void {
    this.uniforms.uTime.value = elapsed;
  }

  dispose(): void {
    this.material.dispose();
  }
}

/** Reference points on the relief (u, v in -1..1) with locale keys, for pins and tooltips. */
export const RELIEF_PINS: readonly { readonly id: string; readonly labelKey: string; readonly u: number; readonly v: number }[] = [
  { id: 'haifa', labelKey: 'world.hub.pin.haifa', u: -0.3, v: -0.62 },
  { id: 'jaffa', labelKey: 'world.hub.pin.jaffa', u: -0.3, v: -0.08 },
  { id: 'jerusalem', labelKey: 'world.hub.pin.jerusalem', u: 0.18, v: 0.1 },
  { id: 'latrun', labelKey: 'world.hub.pin.latrun', u: -0.08, v: 0.05 },
  { id: 'negba', labelKey: 'world.hub.pin.negba', u: -0.3, v: 0.3 },
];

