import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gradeInto, rgb, type RGB } from '../color';
import type { EraGrade } from '../eraLook';
import { Rng } from '../rng';

export type ColorIn = RGB | string | number;

export interface BuilderOptions {
  /** Era grading applied to every part color. */
  readonly grade?: EraGrade;
  /** 0-1 per-face brightness variation (low-poly sparkle); seeded. */
  readonly jitter?: number;
  readonly seed?: number | string;
  /** Adds the float attribute aLimb (figures' procedural rig). */
  readonly limbs?: boolean;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const p = new THREE.Vector3();
const s = new THREE.Vector3();

/** Triangular prism for gable roofs: width along x, ridge height h, length d along z, base at y=0. */
export function gableGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1, 1, 1, 3, 1);
  g.rotateX(-Math.PI / 2);
  g.scale(w / Math.sqrt(3), h / 1.5, d);
  g.translate(0, h / 3, 0);
  return g;
}

/** Four-sided hip roof (pyramid) with base w x d at y=0. */
export function pyramidGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(w, h, d);
  g.translate(0, h / 2, 0);
  return g;
}

/**
 * Accumulates primitive parts (each with transform and flat color) and merges them into one
 * non-indexed geometry with position, normal (flat) and color: one draw call with a shared
 * vertex-color material, ready for instancing.
 */
export class GeoBuilder {
  private readonly parts: THREE.BufferGeometry[] = [];
  private readonly rng: Rng;
  /** Current rig limb id written to aLimb (0 body, 1 left leg, 2 right leg, 3 left arm, 4 right arm). */
  limb = 0;

  constructor(private readonly opts: BuilderOptions = {}) {
    this.rng = new Rng(opts.seed ?? 1);
  }

  /** Adds a geometry (consumed: it is disposed after use). */
  add(geo: THREE.BufferGeometry, color: ColorIn, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
    e.set(rx, ry, rz);
    q.setFromEuler(e);
    p.set(x, y, z);
    s.set(sx, sy, sz);
    g.applyMatrix4(m4.compose(p, q, s));
    g.computeVertexNormals();
    const base: RGB = Array.isArray(color) ? [color[0], color[1], color[2]] : rgb(color);
    if (this.opts.grade) gradeInto(base, this.opts.grade.tint, this.opts.grade.saturation);
    const count = g.attributes.position?.count ?? 0;
    const colors = new Float32Array(count * 3);
    const jitter = this.opts.jitter ?? 0;
    for (let f = 0; f < count; f += 3) {
      const k = jitter > 0 ? 1 + (this.rng.next() - 0.5) * jitter : 1;
      for (let v = f; v < f + 3 && v < count; v++) {
        colors[v * 3] = base[0] * k;
        colors[v * 3 + 1] = base[1] * k;
        colors[v * 3 + 2] = base[2] * k;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (this.opts.limbs) g.setAttribute('aLimb', new THREE.BufferAttribute(new Float32Array(count).fill(this.limb), 1));
    this.parts.push(g);
    return this;
  }

  box(w: number, h: number, d: number, color: ColorIn, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);
  }

  /** Box whose bottom sits at y. */
  block(w: number, h: number, d: number, color: ColorIn, x: number, y: number, z: number, ry = 0): this {
    return this.box(w, h, d, color, x, y + h / 2, z, ry);
  }

  cyl(rTop: number, rBottom: number, h: number, seg: number, color: ColorIn, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1), color, x, y, z, rx, ry, rz);
  }

  cone(r: number, h: number, seg: number, color: ColorIn, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.ConeGeometry(r, h, seg, 1), color, x, y, z, rx, ry, rz);
  }

  /** Low-poly blob (icosahedron) scaled per axis. */
  blob(r: number, color: ColorIn, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, detail = 0, ry = 0): this {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, x, y, z, 0, ry, 0, sx, sy, sz);
  }

  sphere(r: number, wSeg: number, hSeg: number, color: ColorIn, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): this {
    return this.add(new THREE.SphereGeometry(r, wSeg, hSeg), color, x, y, z, 0, 0, 0, sx, sy, sz);
  }

  dome(r: number, color: ColorIn, x: number, y: number, z: number, seg = 8): this {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(2, seg / 2), 0, Math.PI * 2, 0, Math.PI / 2), color, x, y, z);
  }

  gable(w: number, h: number, d: number, color: ColorIn, x: number, y: number, z: number, ry = 0): this {
    return this.add(gableGeometry(w, h, d), color, x, y, z, 0, ry, 0);
  }

  pyramid(w: number, h: number, d: number, color: ColorIn, x: number, y: number, z: number, ry = 0): this {
    return this.add(pyramidGeometry(w, h, d), color, x, y, z, 0, ry, 0);
  }

  get partCount(): number {
    return this.parts.length;
  }

  /** Merges all parts into one geometry and frees the parts. */
  build(): THREE.BufferGeometry {
    if (this.parts.length === 0) throw new Error('GeoBuilder.build with no parts');
    const merged = mergeGeometries(this.parts, false);
    for (const g of this.parts) g.dispose();
    this.parts.length = 0;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }
}
