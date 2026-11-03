import * as THREE from 'three';
import type { Rng } from './rng';
import type { Terrain } from './terrain';

export interface Placement {
  x: number;
  y: number;
  z: number;
  /** Yaw in radians. */
  ry: number;
  scale: number;
}

export interface ScatterOptions {
  readonly count: number;
  readonly rng: Rng;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Reject slopes above this (0 flat .. 1 vertical). */
  readonly maxSlope?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  /** Reject points whose road coverage exceeds this. Default 0.05. */
  readonly maxRoad?: number;
  readonly avoid?: (x: number, z: number) => boolean;
  readonly scaleMin?: number;
  readonly scaleMax?: number;
  /** Lower the object into the ground by this many meters (roots, rocks). */
  readonly sink?: number;
  /** 0-1: probability field; points where noise(x,z) < rng are rejected (groves, clusters). */
  readonly cluster?: (x: number, z: number) => number;
}

/** Picks ground placements on a terrain with rejection sampling. Deterministic for the rng. */
export function scatterOnTerrain(terrain: Terrain, o: ScatterOptions): Placement[] {
  const out: Placement[] = [];
  const maxTries = o.count * 12;
  for (let tries = 0; tries < maxTries && out.length < o.count; tries++) {
    const x = o.rng.range(o.minX, o.maxX);
    const z = o.rng.range(o.minZ, o.maxZ);
    const keep = o.rng.next();
    const ry = o.rng.range(0, Math.PI * 2);
    const scale = o.rng.range(o.scaleMin ?? 0.85, o.scaleMax ?? 1.2);
    if (o.cluster && o.cluster(x, z) < keep) continue;
    if (terrain.roadAt(x, z) > (o.maxRoad ?? 0.05)) continue;
    if (terrain.isUnderwater(x, z)) continue;
    const y = terrain.heightAt(x, z);
    if (o.minHeight !== undefined && y < o.minHeight) continue;
    if (o.maxHeight !== undefined && y > o.maxHeight) continue;
    if (o.maxSlope !== undefined && terrain.slopeAt(x, z) > o.maxSlope) continue;
    if (o.avoid?.(x, z)) continue;
    out.push({ x, y: y - (o.sink ?? 0), z, ry, scale });
  }
  return out;
}

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const s = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

/** One InstancedMesh (one draw call) for a list of placements. */
export function instancesFrom(geometry: THREE.BufferGeometry, material: THREE.Material, placements: readonly Placement[], name = 'instances'): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, placements.length));
  mesh.count = placements.length;
  placements.forEach((pl, i) => {
    p.set(pl.x, pl.y, pl.z);
    q.setFromAxisAngle(up, pl.ry);
    s.setScalar(pl.scale);
    mesh.setMatrixAt(i, m.compose(p, q, s));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = name;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** Bakes placements of one geometry into a single static merged geometry (for clusters). */
export function bakePlacements(geometry: THREE.BufferGeometry, placements: readonly Placement[]): THREE.BufferGeometry[] {
  return placements.map((pl) => {
    const g = geometry.clone();
    p.set(pl.x, pl.y, pl.z);
    q.setFromAxisAngle(up, pl.ry);
    s.setScalar(pl.scale);
    g.applyMatrix4(m.compose(p, q, s));
    return g;
  });
}
