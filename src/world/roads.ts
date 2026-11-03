import * as THREE from 'three';

/** A road or path as a Catmull-Rom spline through control points on the ground plane (x, z). */
export interface RoadSpec {
  readonly points: readonly (readonly [number, number])[];
  /** Full width of the flat road bed (meters). */
  readonly width: number;
  /** Width of the blended shoulder on each side (meters). */
  readonly shoulder: number;
  /** Surface color (sRGB hex). */
  readonly color: string;
  /** Meters between polyline samples (smaller = smoother). */
  readonly spacing?: number;
}

/** Result of a nearest-point query. */
export interface RoadHit {
  distance: number;
  /** Road bed height at the nearest point. */
  height: number;
  /** 0-1 position along the road. */
  along: number;
}

/** A road sampled into a polyline with a smoothed bed height profile. */
export class RoadPath {
  readonly xs: Float32Array;
  readonly zs: Float32Array;
  readonly heights: Float32Array;
  readonly halfWidth: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly length: number;
  private readonly cumulative: Float32Array;

  constructor(
    readonly spec: RoadSpec,
    groundHeight: (x: number, z: number) => number,
  ) {
    const curve = new THREE.CatmullRomCurve3(spec.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const spacing = spec.spacing ?? 3;
    const n = Math.max(2, Math.ceil(curve.getLength() / spacing) + 1);
    const pts = curve.getSpacedPoints(n - 1);
    this.xs = new Float32Array(n);
    this.zs = new Float32Array(n);
    this.cumulative = new Float32Array(n);
    const raw = new Float32Array(n);
    let len = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = pts[i] ?? pts[pts.length - 1] ?? new THREE.Vector3();
      this.xs[i] = p.x;
      this.zs[i] = p.z;
      raw[i] = groundHeight(p.x, p.z);
      if (i > 0) len += Math.hypot(p.x - (this.xs[i - 1] ?? 0), p.z - (this.zs[i - 1] ?? 0));
      this.cumulative[i] = len;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    this.length = len;
    // Smooth the bed profile so the road climbs gently instead of following every bump.
    const window = Math.max(1, Math.round(18 / spacing));
    this.heights = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let count = 0;
      for (let k = -window; k <= window; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k));
        sum += raw[j] ?? 0;
        count++;
      }
      this.heights[i] = sum / count;
    }
    this.halfWidth = spec.width / 2;
    const pad = this.halfWidth + spec.shoulder;
    this.minX = minX - pad;
    this.maxX = maxX + pad;
    this.minZ = minZ - pad;
    this.maxZ = maxZ + pad;
  }

  /** Nearest point on the polyline. Returns false (out untouched) when beyond maxDistance. */
  nearest(x: number, z: number, maxDistance: number, out: RoadHit): boolean {
    if (x < this.minX - maxDistance || x > this.maxX + maxDistance || z < this.minZ - maxDistance || z > this.maxZ + maxDistance) return false;
    let best = maxDistance * maxDistance;
    let found = false;
    const n = this.xs.length;
    for (let i = 0; i < n - 1; i++) {
      const ax = this.xs[i] ?? 0;
      const az = this.zs[i] ?? 0;
      const bx = this.xs[i + 1] ?? 0;
      const bz = this.zs[i + 1] ?? 0;
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t - x;
      const pz = az + dz * t - z;
      const d2 = px * px + pz * pz;
      if (d2 < best) {
        best = d2;
        found = true;
        out.distance = Math.sqrt(d2);
        const ha = this.heights[i] ?? 0;
        out.height = ha + ((this.heights[i + 1] ?? ha) - ha) * t;
        const ca = this.cumulative[i] ?? 0;
        out.along = this.length > 0 ? (ca + ((this.cumulative[i + 1] ?? ca) - ca) * t) / this.length : 0;
      }
    }
    return found;
  }

  /** Point and heading along the road at 0-1 (for placing vehicles). No allocation. */
  pointAt(along: number, out: THREE.Vector3): { heading: number } {
    const target = Math.min(1, Math.max(0, along)) * this.length;
    const n = this.xs.length;
    let i = 0;
    while (i < n - 2 && (this.cumulative[i + 1] ?? 0) < target) i++;
    const ca = this.cumulative[i] ?? 0;
    const cb = this.cumulative[i + 1] ?? ca;
    const t = cb > ca ? (target - ca) / (cb - ca) : 0;
    const ax = this.xs[i] ?? 0;
    const az = this.zs[i] ?? 0;
    const bx = this.xs[i + 1] ?? ax;
    const bz = this.zs[i + 1] ?? az;
    const ha = this.heights[i] ?? 0;
    out.set(ax + (bx - ax) * t, ha + ((this.heights[i + 1] ?? ha) - ha) * t, az + (bz - az) * t);
    headingScratch.heading = Math.atan2(bx - ax, bz - az);
    return headingScratch;
  }
}

const headingScratch = { heading: 0 };
