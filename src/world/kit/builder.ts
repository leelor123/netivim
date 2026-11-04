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

/** One cross-section of a lofted hull: half-beam, keel and sheer (gunwale) heights at z. */
export interface HullStation {
  readonly z: number;
  readonly halfWidth: number;
  readonly keel: number;
  readonly sheer: number;
}

/**
 * Point on a hull cross-section. t runs 0 (keel line) to 1 (sheer) along a round-bilge quarter
 * ellipse; side is -1 (port) or +1 (starboard).
 */
function hullPoint(st: HullStation, t: number, side: number, out: THREE.Vector3): THREE.Vector3 {
  const u = (t * Math.PI) / 2;
  return out.set(side * st.halfWidth * Math.sin(u), st.keel + (st.sheer - st.keel) * (1 - Math.cos(u)), st.z);
}

/**
 * Flips any triangle whose face normal points toward `inside(centroid)`, so a closed convex-ish
 * shell built without care for winding ends up facing outward. Works on non-indexed positions.
 */
export function orientOutward(positions: number[], inside: (c: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3): void {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const ctr = new THREE.Vector3();
  const ref = new THREE.Vector3();
  for (let i = 0; i + 8 < positions.length; i += 9) {
    a.fromArray(positions, i);
    b.fromArray(positions, i + 3);
    c.fromArray(positions, i + 6);
    ctr.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    n.subVectors(c, b).cross(ref.subVectors(a, b));
    inside(ctr, ref);
    if (n.dot(ref.subVectors(ctr, ref)) < 0) {
      for (let k = 0; k < 3; k++) {
        const t = positions[i + 3 + k] ?? 0;
        positions[i + 3 + k] = positions[i + 6 + k] ?? 0;
        positions[i + 6 + k] = t;
      }
    }
  }
}

/**
 * Lofted boat hull band between cross-section parameters `from` and `to` (0 keel, 1 sheer), with
 * `steps` facets per side. Several bands (bottom paint, boot stripe, topsides) share the same
 * stations so they meet without gaps. Ends are closed with caps when the band spans the keel.
 */
export function hullGeometry(stations: readonly HullStation[], from = 0, to = 1, steps = 4): THREE.BufferGeometry {
  if (stations.length < 2) throw new Error('hullGeometry needs at least two stations');
  const pos: number[] = [];
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  for (let i = 0; i + 1 < stations.length; i++) {
    const s0 = stations[i];
    const s1 = stations[i + 1];
    if (!s0 || !s1) continue;
    for (const side of [-1, 1]) {
      for (let k = 0; k < steps; k++) {
        const t0 = from + ((to - from) * k) / steps;
        const t1 = from + ((to - from) * (k + 1)) / steps;
        const [a, b, c, d] = p as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
        hullPoint(s0, t0, side, a);
        hullPoint(s1, t0, side, b);
        hullPoint(s1, t1, side, c);
        hullPoint(s0, t1, side, d);
        tri(a, b, c);
        tri(a, c, d);
      }
    }
  }
  // End caps (transom and stem) when the band includes the keel line.
  if (from === 0) {
    for (const st of [stations[0], stations[stations.length - 1]]) {
      if (!st) continue;
      const [a, b, c] = p as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
      for (const side of [-1, 1]) {
        for (let k = 0; k < steps; k++) {
          hullPoint(st, (to * k) / steps, side, a);
          hullPoint(st, (to * (k + 1)) / steps, side, b);
          c.set(0, hullPoint(st, to, side, c).y, st.z);
          tri(a, b, c);
        }
      }
    }
  }
  const zMid = ((stations[0]?.z ?? 0) + (stations[stations.length - 1]?.z ?? 0)) / 2;
  orientOutward(pos, (ctr, out) => {
    // Inside reference: the hull centerline at mid height of the nearest station span.
    const st = nearestStation(stations, ctr.z);
    const isCap = Math.abs(ctr.z - (stations[0]?.z ?? 0)) < 1e-6 || Math.abs(ctr.z - (stations[stations.length - 1]?.z ?? 0)) < 1e-6;
    const midY = st.keel + (st.sheer - st.keel) * 0.65;
    return isCap ? out.set(0, ctr.y, zMid) : out.set(0, midY, ctr.z);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** The deck plate across the sheer line, lowered by `drop`, as strips between stations. */
export function deckGeometry(stations: readonly HullStation[], drop = 0, inset = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let i = 0; i + 1 < stations.length; i++) {
    const s0 = stations[i];
    const s1 = stations[i + 1];
    if (!s0 || !s1) continue;
    const w0 = Math.max(0.01, s0.halfWidth - inset);
    const w1 = Math.max(0.01, s1.halfWidth - inset);
    const y0 = s0.sheer - drop;
    const y1 = s1.sheer - drop;
    pos.push(-w0, y0, s0.z, w1, y1, s1.z, -w1, y1, s1.z);
    pos.push(-w0, y0, s0.z, w0, y0, s0.z, w1, y1, s1.z);
  }
  orientOutward(pos, (ctr, out) => out.set(ctr.x, ctr.y - 1, ctr.z));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function nearestStation(stations: readonly HullStation[], z: number): HullStation {
  let best = stations[0];
  let d = Infinity;
  for (const s of stations) {
    const dz = Math.abs(s.z - z);
    if (dz < d) {
      d = dz;
      best = s;
    }
  }
  if (!best) throw new Error('no stations');
  return best;
}

/** Interpolated station at z (linear between neighbours), for placing parts along a hull. */
export function stationAt(stations: readonly HullStation[], z: number): HullStation {
  for (let i = 0; i + 1 < stations.length; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    if (!a || !b) continue;
    if (z >= a.z && z <= b.z) {
      const t = (z - a.z) / Math.max(1e-6, b.z - a.z);
      return { z, halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * t, keel: a.keel + (b.keel - a.keel) * t, sheer: a.sheer + (b.sheer - a.sheer) * t };
    }
  }
  return nearestStation(stations, z);
}

const beamDir = new THREE.Vector3();
const beamQ = new THREE.Quaternion();
const beamE = new THREE.Euler();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

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

  /** Box of cross-section w x h spanning from (x0,y0,z0) to (x1,y1,z1): rails, braces, ropes. */
  beam(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w: number, h: number, color: ColorIn): this {
    beamDir.set(x1 - x0, y1 - y0, z1 - z0);
    const len = beamDir.length();
    if (len < 1e-5) return this;
    beamQ.setFromUnitVectors(Z_AXIS, beamDir.multiplyScalar(1 / len));
    beamE.setFromQuaternion(beamQ);
    return this.add(new THREE.BoxGeometry(w, h, len), color, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, beamE.x, beamE.y, beamE.z);
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
