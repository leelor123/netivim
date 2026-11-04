import * as THREE from 'three';
import type { LevelWorld } from '../../../gameplay/runtime/levelKit';

/**
 * Small pooled particle bursts for building feedback: a puff of dust when a wall frame snaps
 * in or gravel is poured, a shower of warm sparks when the tower stands and the searchlight
 * turns on. One Points object, a fixed pool, no allocation after construction. Purely visual;
 * skipped when reduced motion is on.
 */

const N = 72;
const GRAVITY = 5;

export type PuffKind = 'dust' | 'gravel' | 'spark';

const COLORS: Readonly<Record<PuffKind, readonly [number, number, number]>> = {
  dust: [0.86, 0.79, 0.64],
  gravel: [0.65, 0.61, 0.53],
  spark: [1, 0.86, 0.45],
};

export class Puff {
  private readonly pos = new Float32Array(N * 3);
  private readonly col = new Float32Array(N * 3);
  private readonly vel = new Float32Array(N * 3);
  private readonly life = new Float32Array(N);
  private readonly grav = new Float32Array(N);
  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;
  private next = 0;
  private seed = 12345;
  private alive = 0;

  constructor(
    world: LevelWorld,
    private readonly reduced: () => boolean,
  ) {
    for (let i = 0; i < N; i++) this.pos[i * 3 + 1] = -1000;
    const geo = world.bag.geometry(new THREE.BufferGeometry());
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    const mat = world.bag.material(new THREE.PointsMaterial({ size: 0.42, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    world.scene.add(points);
  }

  /** Deterministic pseudo-random in [0, 1) (no Math.random: replays look the same). */
  private rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Throws `count` particles up and out from a point. */
  emit(kind: PuffKind, x: number, y: number, z: number, count = 10): void {
    if (this.reduced()) return;
    const c = COLORS[kind];
    const up = kind === 'spark' ? 4.5 : 1.8;
    const spread = kind === 'spark' ? 3.2 : 1.6;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % N;
      const a = this.rnd() * Math.PI * 2;
      const r = (0.3 + this.rnd()) * spread;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(a) * r;
      this.vel[i * 3 + 1] = (0.4 + this.rnd()) * up;
      this.vel[i * 3 + 2] = Math.sin(a) * r;
      this.life[i] = (kind === 'spark' ? 1.1 : 0.7) * (0.7 + this.rnd() * 0.6);
      this.grav[i] = kind === 'spark' ? GRAVITY * 0.5 : GRAVITY;
      this.col[i * 3] = c[0];
      this.col[i * 3 + 1] = c[1];
      this.col[i * 3 + 2] = c[2];
    }
    this.alive = N;
    this.colAttr.needsUpdate = true;
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    let any = false;
    for (let i = 0; i < N; i++) {
      const l = this.life[i] ?? 0;
      if (l <= 0) continue;
      any = true;
      this.life[i] = l - dt;
      if (l - dt <= 0) {
        this.pos[i * 3 + 1] = -1000;
        continue;
      }
      this.vel[i * 3 + 1] = (this.vel[i * 3 + 1] ?? 0) - (this.grav[i] ?? GRAVITY) * dt;
      this.pos[i * 3] = (this.pos[i * 3] ?? 0) + (this.vel[i * 3] ?? 0) * dt;
      this.pos[i * 3 + 1] = (this.pos[i * 3 + 1] ?? 0) + (this.vel[i * 3 + 1] ?? 0) * dt;
      this.pos[i * 3 + 2] = (this.pos[i * 3 + 2] ?? 0) + (this.vel[i * 3 + 2] ?? 0) * dt;
    }
    this.posAttr.needsUpdate = true;
    if (!any) this.alive = 0;
  }
}
