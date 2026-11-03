import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, circle, type Collider } from '../../../gameplay/core/collision';
import type { LevelWorld } from '../../../gameplay/runtime/levelKit';
import { ottomanBuilding, stoneVillageHouse, templerHouse, kitBuilder } from '../../../world/kit/buildings';
import { citrusTree, cypressTree, oliveTree, palmTree, rock, sabraHedge } from '../../../world/kit/nature';
import { barrel, crate, fence, sack, terraceWall } from '../../../world/kit/props';
import { fishingBoat } from '../../../world/kit/vehicles';
import { densityCount } from '../../../world/quality';
import { Rng } from '../../../world/rng';
import { bakePlacements, scatterOnTerrain } from '../../../world/scatter';
import type { RoadHit, RoadPath } from '../../../world/roads';
import {
  DECOY_JERUSALEM,
  DECOY_VILLAGE,
  FIELDS,
  JAMILA,
  KEY_POINTS,
  LOAD_PARTS,
  OFFICE,
  PLATFORM,
  POSTED_ROADS,
  RAIL_ROAD_INDEX,
  VENDOR,
  WELL,
  type FieldRect,
} from './layout';

/**
 * Static scenery of the level: buildings, trees, fields, marker posts, the pier and the station.
 * Colliders are registered always (the QA bot walks into them like a player); meshes are only
 * built when not headless. Everything visible is merged into a few meshes per area (one draw
 * call each) and freed by the world's resource bag.
 */

const ERA = 'ottoman1890' as const;
const PI2 = Math.PI / 2;

/** Merges geometries into one mesh with the shared kit material. */
class Batch {
  private readonly parts: THREE.BufferGeometry[] = [];

  constructor(
    private readonly world: LevelWorld,
    private readonly name: string,
  ) {}

  /** Bakes a kit geometry onto the ground at (x, z). The geometry is consumed. */
  add(geometry: THREE.BufferGeometry, x: number, z: number, ry = 0, sink = 0, y?: number): void {
    const [baked] = bakePlacements(geometry, [{ x, y: (y ?? this.world.heightAt(x, z)) - sink, z, ry, scale: 1 }]);
    geometry.dispose();
    if (baked) this.parts.push(baked);
  }

  /** Adds a geometry that is already in world space. */
  addRaw(geometry: THREE.BufferGeometry): void {
    this.parts.push(geometry);
  }

  flush(): void {
    if (this.parts.length === 0) return;
    const merged = mergeGeometries(this.parts, false);
    for (const g of this.parts) g.dispose();
    this.parts.length = 0;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(this.world.bag.geometry(merged), this.world.mats.solid);
    mesh.name = this.name;
    mesh.castShadow = this.world.opts.quality.shadows;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.world.scene.add(mesh);
  }
}

export interface Scenery {
  readonly rail: RoadPath;
  /** True inside a sown field. */
  inField(x: number, z: number): boolean;
}

export function inFieldRect(f: FieldRect, x: number, z: number, margin = 0): boolean {
  return x >= f.minX - margin && x <= f.maxX + margin && z >= f.minZ - margin && z <= f.maxZ + margin;
}

export function inAnyField(x: number, z: number): boolean {
  for (let i = 0; i < FIELDS.length; i++) if (inFieldRect(FIELDS[i] as FieldRect, x, z)) return true;
  return false;
}

/** Ground patch that follows the terrain, with furrow stripes (world space, vertex colors). */
function fieldGeometry(world: LevelWorld, f: FieldRect, seed: string): THREE.BufferGeometry {
  const cell = 2.5;
  const nx = Math.max(1, Math.round((f.maxX - f.minX) / cell));
  const nz = Math.max(1, Math.round((f.maxZ - f.minZ) / cell));
  const rng = new Rng(seed);
  const pos: number[] = [];
  const col: number[] = [];
  const furrowA = new THREE.Color('#8a6b46');
  const furrowB = new THREE.Color('#756040');
  const c = new THREE.Color();
  const vert = (x: number, z: number, row: number, k: number): void => {
    pos.push(x, world.heightAt(x, z) + 0.07, z);
    c.copy(row % 2 === 0 ? furrowA : furrowB).multiplyScalar(k);
    col.push(c.r, c.g, c.b);
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = f.minX + (i / nx) * (f.maxX - f.minX);
      const x1 = f.minX + ((i + 1) / nx) * (f.maxX - f.minX);
      const z0 = f.minZ + (j / nz) * (f.maxZ - f.minZ);
      const z1 = f.minZ + ((j + 1) / nz) * (f.maxZ - f.minZ);
      const k = 0.94 + rng.next() * 0.1;
      vert(x0, z0, j, k);
      vert(x0, z1, j, k);
      vert(x1, z0, j, k);
      vert(x1, z0, j, k);
      vert(x0, z1, j, k);
      vert(x1, z1, j, k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Rows of young green sprouts on a field (world space). */
function sproutGeometry(world: Pick<LevelWorld, 'heightAt'>, f: FieldRect, seed: string): THREE.BufferGeometry {
  const b = kitBuilder({ era: ERA, seed }, 0.2);
  const rng = new Rng(seed + '-s');
  for (let z = f.minZ + 1.5; z < f.maxZ - 0.5; z += 2.5) {
    for (let x = f.minX + 1.2; x < f.maxX - 0.5; x += 2.2) {
      const px = x + rng.range(-0.2, 0.2);
      b.cone(0.22, 0.5, 4, rng.chance(0.5) ? '#6f9540' : '#5f8438', px, world.heightAt(px, z) + 0.3, z);
    }
  }
  return b.build();
}

/** Marker posts with a white cloth along both sides of a road or path (world space). */
function markerPosts(world: LevelWorld, road: RoadPath, every: number, offset: number): THREE.BufferGeometry {
  const b = kitBuilder({ era: ERA, seed: 'posts' }, 0.1);
  const v = new THREE.Vector3();
  const n = Math.max(1, Math.floor(road.length / every));
  for (let i = 1; i < n; i++) {
    const { heading } = road.pointAt(i / n, v);
    for (const side of [-1, 1]) {
      const x = v.x + Math.cos(heading) * offset * side;
      const z = v.z - Math.sin(heading) * offset * side;
      const y = world.heightAt(x, z);
      b.cyl(0.05, 0.06, 1.2, 5, '#6b5038', x, y + 0.6, z);
      b.box(0.34, 0.22, 0.04, '#efe7d4', x, y + 1.05, z, heading);
    }
  }
  return b.build();
}

/** Market stall: table, four poles and a colored cloth roof. */
function stall(seed: string, cloth: string): THREE.BufferGeometry {
  const b = kitBuilder({ era: ERA, seed }, 0.1);
  b.block(2.6, 0.9, 1.2, '#7a5a3c', 0, 0, 0);
  for (const sx of [-1.3, 1.3]) for (const sz of [-0.6, 0.6]) b.cyl(0.05, 0.05, 2.4, 5, '#5e4631', sx, 1.2, sz);
  b.box(3.0, 0.1, 1.8, cloth, 0, 2.45, 0, 0, 0.12);
  b.blob(0.22, '#c9b48d', -0.7, 1.05, 0, 1, 0.6, 1);
  b.blob(0.22, '#d8a14a', 0, 1.05, 0.1, 1, 0.6, 1);
  b.blob(0.22, '#a3322a', 0.7, 1.05, -0.1, 1, 0.6, 1);
  return b.build();
}

/** Stone well head with a wooden frame and bucket. */
function wellHead(): THREE.BufferGeometry {
  const b = kitBuilder({ era: ERA, seed: 'well' }, 0.12);
  b.cyl(1.1, 1.2, 0.9, 10, '#cdbd9b', 0, 0.45, 0);
  b.cyl(0.8, 0.8, 0.05, 10, '#2a3a44', 0, 0.88, 0);
  for (const sx of [-1, 1]) b.box(0.14, 2.4, 0.14, '#6b5038', sx, 1.8, 0);
  b.box(2.3, 0.14, 0.14, '#6b5038', 0, 3.0, 0);
  b.cyl(0.18, 0.15, 0.3, 6, '#7a6a55', 0.4, 1.5, 0);
  return b.build();
}

/** Taboun (clay oven) with a pile of fuel. */
function oven(): THREE.BufferGeometry {
  const b = kitBuilder({ era: ERA, seed: 'oven' }, 0.1);
  b.dome(0.9, '#b49c78', 0, 0, 0, 8);
  b.block(0.4, 0.4, 0.5, '#2b2522', 0, 0, 0.8);
  b.block(0.9, 0.5, 0.5, '#7a5a3c', 1.4, 0, 0.1);
  return b.build();
}

/** A string of colored cloth between two poles (a wedding being prepared). */
function bunting(a: { x: number; z: number }, b2: { x: number; z: number }, y: number): THREE.BufferGeometry {
  const b = kitBuilder({ era: ERA, seed: 'bunting' }, 0.05);
  b.cyl(0.06, 0.06, y + 0.4, 5, '#6b5038', a.x, (y + 0.4) / 2, a.z);
  b.cyl(0.06, 0.06, y + 0.4, 5, '#6b5038', b2.x, (y + 0.4) / 2, b2.z);
  const n = 9;
  const colors = ['#b5523b', '#d8a14a', '#3f6f9a', '#e9e4d8', '#2f7f6f'];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const sag = Math.sin(t * Math.PI) * 0.35;
    b.box(0.34, 0.5, 0.04, colors[i % colors.length] ?? '#b5523b', a.x + (b2.x - a.x) * t, y - sag - 0.1, a.z + (b2.z - a.z) * t, Math.atan2(b2.x - a.x, b2.z - a.z) + PI2);
  }
  return b.build();
}

/** Railway platform slab with a light canopy. */
function platform(): THREE.BufferGeometry {
  const b = kitBuilder({ era: ERA, seed: 'platform' }, 0.08);
  const { cx, cz, length, depth } = PLATFORM;
  b.block(length, 0.25, depth, '#b9ab8e', cx, 0, cz);
  for (let i = 0; i < 5; i++) {
    const x = cx - length / 2 + 2 + (i * (length - 4)) / 4;
    b.cyl(0.07, 0.07, 3.3, 5, '#4a4038', x, 1.9, cz + depth / 2 - 0.3);
  }
  b.box(length, 0.12, depth * 0.7, '#8a4b35', cx, 3.6, cz + depth * 0.15);
  return b.build();
}

/** Steam train: locomotive, tender and two carriages; the front faces +z. */
export function trainGeometry(): THREE.BufferGeometry {
  const b = kitBuilder({ era: ERA, seed: 'train' }, 0.06);
  b.cyl(0.95, 0.95, 5, 10, '#2d3236', 0, 1.9, 5.2, PI2);
  b.cyl(0.35, 0.28, 1.4, 8, '#1f2327', 0, 3.4, 7.0);
  b.block(2.3, 2.7, 2.2, '#3f4a40', 0, 0.7, 2.0);
  b.box(2.5, 0.16, 2.5, '#2a2f33', 0, 3.45, 2.0);
  b.block(2.2, 1.7, 3, '#2d3236', 0, 0.7, -0.9);
  for (const sx of [-1.15, 1.15]) for (const z of [1.2, 3.6, 5.6, -0.4, -1.7]) b.cyl(0.55, 0.55, 0.14, 10, '#3a3633', sx, 0.55, z, 0, 0, PI2);
  const wood = ['#7b5a3a', '#6a4d36'];
  for (let i = 0; i < 2; i++) {
    const z0 = -5.6 - i * 7.2;
    b.block(2.5, 2.7, 6.4, wood[i] ?? '#7b5a3a', 0, 0.7, z0);
    b.box(2.7, 0.14, 6.6, '#4a3a2c', 0, 3.45, z0);
    for (let w = 0; w < 4; w++) for (const sx of [-1.26, 1.26]) b.box(0.05, 0.8, 0.8, '#d8c9a2', sx, 2.2, z0 + (w - 1.5) * 1.5);
    for (const sx of [-1.15, 1.15]) for (const dz of [-2.2, 2.2]) b.cyl(0.5, 0.5, 0.12, 8, '#3a3633', sx, 0.5, z0 + dz, 0, 0, PI2);
  }
  return b.build();
}

/** Sleepers and two steel rails along the railbed (world space). */
function railGeometry(rail: RoadPath): THREE.BufferGeometry {
  const b = kitBuilder({ era: ERA, seed: 'rails' }, 0.08);
  const v = new THREE.Vector3();
  const n = Math.floor(rail.length / 1.6);
  for (let i = 0; i <= n; i++) {
    const { heading } = rail.pointAt(i / n, v);
    const y = v.y + 0.08;
    b.box(2.2, 0.1, 0.35, '#5e4631', v.x, y, v.z, heading);
    for (const side of [-0.75, 0.75]) b.box(0.08, 0.1, 1.9, '#4a4a4a', v.x + Math.cos(heading) * side, y + 0.09, v.z - Math.sin(heading) * side, heading);
  }
  return b.build();
}

/** Short wooden pier over the water. */
function pier(): THREE.BufferGeometry {
  const b = kitBuilder({ era: ERA, seed: 'pier' }, 0.12);
  b.block(26, 0.18, 3.2, '#7a5f43', -92, 0.75, 5.5);
  for (let i = 0; i < 9; i++) for (const sz of [-1.4, 1.4]) b.cyl(0.14, 0.14, 2.6, 5, '#4f3d2c', -103 + i * 3, -0.4, 5.5 + sz);
  return b.build();
}

function nearRoad(roads: readonly RoadPath[], hit: RoadHit, x: number, z: number, d: number): boolean {
  for (const r of roads) if (r.nearest(x, z, d, hit)) return true;
  return false;
}

function boxHits(colliders: readonly Collider[], x: number, z: number, margin: number): boolean {
  for (const c of colliders) {
    if (c.kind === 'circle') {
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + margin) ** 2) return true;
    } else if (Math.abs(x - c.x) < c.hw + margin && Math.abs(z - c.z) < c.hd + margin) return true;
  }
  return false;
}

export interface SceneryOptions {
  readonly headless: boolean;
}

export function buildScenery(world: LevelWorld, o: SceneryOptions): Scenery {
  const vis = !o.headless;
  const q = world.opts.quality;
  const rail = world.terrain.roads[RAIL_ROAD_INDEX] as RoadPath;
  const hit: RoadHit = { distance: 0, height: 0, along: 0 };
  const batches = {
    jaffa: new Batch(world, 'jaffa'),
    station: new Batch(world, 'station'),
    colony: new Batch(world, 'colony'),
    village: new Batch(world, 'village'),
    jerusalem: new Batch(world, 'jerusalem'),
    country: new Batch(world, 'country'),
    fields: new Batch(world, 'fields'),
  };
  type Area = keyof typeof batches;

  // ---- buildings: [x, z, rotation], collider half sizes follow the rotation ---------------------
  const building = (area: Area, make: () => THREE.BufferGeometry, x: number, z: number, ry: number, hw: number, hd: number, sink = 0.15): void => {
    const turned = Math.abs(Math.abs(ry) - PI2) < 0.01;
    world.colliders.push(box(x, z, turned ? hd : hw, turned ? hw : hd, 5));
    if (vis) batches[area].add(make(), x, z, ry, sink);
  };
  const ott = (area: Area, seed: string, x: number, z: number, ry: number): void => building(area, () => ottomanBuilding({ era: ERA, seed }), x, z, ry, 6.1, 4.7);
  const stone = (area: Area, seed: string, x: number, z: number, ry: number, dome = false): void =>
    building(area, () => stoneVillageHouse({ era: ERA, seed, dome, stories: 1 }), x, z, ry, 3.9, 3.3);
  const colony = (seed: string, x: number, z: number, ry: number): void => building('colony', () => templerHouse({ era: ERA, seed }), x, z, ry, 5.2, 4.4);
  const prop = (area: Area, geo: () => THREE.BufferGeometry, x: number, z: number, ry: number, r = 0): void => {
    if (r > 0) world.colliders.push(circle(x, z, r, 1.2));
    if (vis) batches[area].add(geo(), x, z, ry);
  };

  // Jaffa: the office, merchants' houses and the old town.
  ott('jaffa', 'office', OFFICE.x, OFFICE.z, 0);
  ott('jaffa', 'jaffa-2', -74, -28, 0);
  ott('jaffa', 'jaffa-3', -38, -27, 0);
  ott('jaffa', 'jaffa-4', -24, -4, -PI2);
  ott('jaffa', 'jaffa-5', -75, 28, PI2);
  stone('jaffa', 'jf-1', -79, -9, PI2, true);
  stone('jaffa', 'jf-2', -67, -20, 0);
  stone('jaffa', 'jf-3', -66, 27, PI2);
  stone('jaffa', 'jf-4', -38, 38, 0, true);
  stone('jaffa', 'jf-5', -58, 36, 0);
  stone('jaffa', 'jf-6', -22, 18, -PI2);
  // Market stalls (the vendor stands behind the first one).
  if (vis) {
    batches.jaffa.add(stall('stall-1', '#b5523b'), VENDOR.x, VENDOR.z + 2.4, 0);
    batches.jaffa.add(stall('stall-2', '#3f6f9a'), VENDOR.x - 7, VENDOR.z + 3.4, 0.15);
    batches.jaffa.add(stall('stall-3', '#d8a14a'), VENDOR.x + 7, VENDOR.z + 3.6, -0.12);
    batches.jaffa.add(pier(), 0, 0, 0, 0, 0);
    [
      [-96, 14, 0.4],
      [-99, -8, 1.8],
      [-92, -16, 0.9],
    ].forEach(([bx, bz, br], i) => batches.jaffa.add(fishingBoat({ era: ERA, seed: 'boat' + String(i) }), bx as number, bz as number, br as number, 0, 0.25));
  }
  world.colliders.push(box(VENDOR.x, VENDOR.z + 2.4, 1.5, 0.8, 1), box(VENDOR.x - 7, VENDOR.z + 3.4, 1.5, 0.8, 1), box(VENDOR.x + 7, VENDOR.z + 3.6, 1.5, 0.8, 1));
  // Tables with the address tags and the planning desk (Habib's table).
  if (vis) {
    const t = kitBuilder({ era: ERA, seed: 'tables' }, 0.1);
    t.block(13, 0.9, 1.0, '#7a5a3c', -56, 0, -4.4);
    t.block(2.2, 0.9, 1.1, '#7a5a3c', -45, 0, -4.4);
    for (const x of [-61, -58.4, -53.6, -51]) t.box(0.6, 0.05, 0.4, '#efe7d4', x, 0.94, -4.3, 0.1);
    t.box(1.2, 0.05, 0.8, '#d8c9a2', -45, 0.94, -4.4);
    batches.jaffa.addRaw(t.build());
  }
  world.colliders.push(box(-56, -4.4, 6.5, 0.5, 1), box(-45, -4.4, 1.1, 0.55, 1));
  // Cart yard: fence, crates, sacks and barrels.
  for (const [x, z, r] of [
    [-44, 17, 0],
    [-32, 20, 0],
  ] as const) if (vis) batches.jaffa.add(fence({ era: ERA, seed: 'yard' + String(x), kind: 'wood', length: 8 }), x, z, r);
  if (vis) {
    batches.jaffa.add(crate({ era: ERA, size: 1.0 }), LOAD_PARTS.x, LOAD_PARTS.z, 0.3);
    batches.jaffa.add(crate({ era: ERA, size: 0.9 }), LOAD_PARTS.x + 1.1, LOAD_PARTS.z + 0.5, 0.8);
    batches.jaffa.add(barrel({ era: ERA, kind: 'wood', seed: 'p1' }), LOAD_PARTS.x - 0.9, LOAD_PARTS.z + 0.8, 0);
    batches.jaffa.add(sack({ era: ERA, seed: 'sk1' }), -41, 12.2, 0.4);
    batches.jaffa.add(sack({ era: ERA, seed: 'sk2' }), -40.3, 13.1, 1.1);
    batches.jaffa.add(crate({ era: ERA, size: 0.6 }), -48, 8.6, 0.2);
  }
  // Station and platform.
  building('station', () => ottomanBuilding({ era: ERA, seed: 'station' }), 10, 53, Math.PI, 6.1, 4.7);
  if (vis) {
    batches.station.add(platform(), 0, 0, 0, 0, world.heightAt(PLATFORM.cx, PLATFORM.cz) + 0.02);
    batches.station.add(barrel({ era: ERA, kind: 'wood', seed: 'st1' }), 4, 45.5, 0);
    batches.station.add(crate({ era: ERA, size: 0.9 }), 17, 45.7, 0.3);
    batches.station.add(sack({ era: ERA, seed: 'st2' }), 18.2, 45.9, 0.1);
  }
  // The track and the parked train are not walkable.
  world.colliders.push(box(PLATFORM.cx, 40, PLATFORM.length / 2 + 2, 1.3, 3));
  if (vis) batches.country.addRaw(railGeometry(rail));

  // Rishon LeZion: colony houses around the well plaza, and the well itself.
  colony('rl-1', 104, 148, -PI2);
  colony('rl-2', 100, 172, Math.PI);
  colony('rl-3', 64, 168, Math.PI);
  colony('rl-4', 80, 130, 0);
  colony('rl-5', 114, 166, -PI2);
  prop('colony', wellHead, WELL.x, WELL.z, 0, 1.5);
  if (vis) {
    batches.colony.add(barrel({ era: ERA, kind: 'wood', seed: 'w1' }), WELL.x - 2.2, WELL.z + 1.6, 0);
    batches.colony.add(barrel({ era: ERA, kind: 'wood', seed: 'w2' }), WELL.x - 2.9, WELL.z + 0.9, 0.5);
    batches.colony.add(crate({ era: ERA, size: 0.9 }), WELL.x + 2.6, WELL.z - 1.2, 0.4);
    batches.colony.add(sack({ era: ERA, seed: 'w3' }), WELL.x + 2.2, WELL.z - 2.1, 0.2);
  }

  // The Arab village: stone houses around a small square, an oven and wedding cloth.
  stone('village', 'vl-jamila', JAMILA.x + 6, JAMILA.z, -PI2, true);
  stone('village', 'vl-neighbor', DECOY_VILLAGE.x + 6, DECOY_VILLAGE.z, -PI2);
  stone('village', 'vl-3', 66, 42, 0, true);
  stone('village', 'vl-4', 48, 64, PI2);
  stone('village', 'vl-5', 90, 40, -PI2);
  stone('village', 'vl-6', 95, 80, -PI2, true);
  stone('village', 'vl-7', 68, 82, Math.PI);
  stone('village', 'vl-8', 100, 58, -PI2);
  prop('village', oven, 80, 45, 0, 1.2);
  if (vis) {
    batches.village.addRaw(bunting({ x: 70, z: 47 }, { x: 76, z: 51 }, 3.4));
    batches.village.add(sack({ era: ERA, seed: 'v1' }), 73, 46.3, 0.3);
    batches.village.add(crate({ era: ERA, size: 0.7 }), 74.2, 46.6, 0.1);
  }

  // Jerusalem: stone houses, a courtyard and the neighbor's door.
  ott('jerusalem', 'jr-1', 104, -104, PI2);
  ott('jerusalem', 'jr-2', 150, -104, -PI2);
  stone('jerusalem', 'jr-eliyahu', 139, -141, 0);
  stone('jerusalem', 'jr-left', 126, -137, PI2);
  stone('jerusalem', 'jr-neighbor', DECOY_JERUSALEM.x + 6, DECOY_JERUSALEM.z, -PI2);
  stone('jerusalem', 'jr-4', 118, -138, 0, true);
  stone('jerusalem', 'jr-5', 158, -146, -PI2, true);
  if (vis) {
    batches.jerusalem.add(terraceWall({ era: ERA, seed: 'jw1', length: 10, height: 1.2 }), 148, -113, 0.1);
    batches.jerusalem.add(terraceWall({ era: ERA, seed: 'jw2', length: 10, height: 1.2 }), 118, -126, 1.2);
    batches.jerusalem.add(crate({ era: ERA, size: 0.8 }), 141.3, -131, 0.2);
  }
  // A stone bench and a low table for the shared bread.
  world.colliders.push(box(137.6, -130.2, 1.2, 0.45, 0.9));
  if (vis) {
    const t = kitBuilder({ era: ERA, seed: 'bread' }, 0.1);
    t.block(2.4, 0.5, 0.9, '#cdbd9b', 137.6, 0, -130.2);
    t.blob(0.2, '#d8b072', 137.1, 0.62, -130.2, 1, 0.5, 1);
    t.blob(0.2, '#c99d5e', 137.9, 0.62, -130.1, 1, 0.5, 1);
    batches.jerusalem.addRaw(t.build());
  }

  // ---- fields, posts, trees -----------------------------------------------------------------------
  const roads = world.terrain.roads;
  if (vis) {
    FIELDS.forEach((f, i) => {
      batches.fields.addRaw(fieldGeometry(world, f, 'field-' + f.id));
      if (q.vegetation > 0.3) batches.fields.addRaw(sproutGeometry(world, f, 'sprout-' + String(i)));
    });
    POSTED_ROADS.forEach((i) => batches.country.addRaw(markerPosts(world, roads[i] as RoadPath, i === 0 ? 11 : 9, i === 0 ? 3.7 : 2.6)));
  }

  const free = (x: number, z: number): boolean => {
    if (nearRoad(roads, hit, x, z, 6)) return false;
    for (const f of FIELDS) if (inFieldRect(f, x, z, 3)) return false;
    for (const k of KEY_POINTS) if ((k.x - x) ** 2 + (k.z - z) ** 2 < 36) return false;
    return !boxHits(world.colliders, x, z, 2.2);
  };
  const trees = (area: Area, seed: string, make: (s: string) => THREE.BufferGeometry, count: number, minX: number, maxX: number, minZ: number, maxZ: number, r: number): void => {
    const n = densityCount(count, q.vegetation);
    const rng = new Rng(seed);
    const spots = scatterOnTerrain(world.terrain, { count: n, rng, minX, maxX, minZ, maxZ, maxSlope: 0.5, minHeight: 0.8, avoid: (x, z) => !free(x, z), scaleMin: 0.9, scaleMax: 1.2 });
    spots.forEach((s, i) => {
      // Only trees near a walkable route are solid: the camera and the motor test every collider.
      if (nearRoad(roads, hit, s.x, s.z, 24)) world.colliders.push(circle(s.x, s.z, r, 4));
      if (vis) batches[area].add(make(seed + String(i)), s.x, s.z, s.ry);
    });
  };
  trees('jaffa', 'palms', (s) => palmTree({ era: ERA, seed: s }), 7, -80, -18, -34, 40, 0.5);
  trees('colony', 'citrus', (s) => citrusTree({ era: ERA, seed: s }), 24, 112, 160, 150, 186, 0.7);
  trees('colony', 'citrus-2', (s) => citrusTree({ era: ERA, seed: s }), 8, 58, 78, 160, 184, 0.7);
  trees('village', 'olives', (s) => oliveTree({ era: ERA, seed: s }), 14, 44, 112, 30, 90, 0.6);
  trees('country', 'olives-2', (s) => oliveTree({ era: ERA, seed: s }), 16, -50, 70, 40, 180, 0.6);
  trees('jerusalem', 'cypress', (s) => cypressTree({ era: ERA, seed: s }), 9, 98, 170, -160, -92, 0.45);
  trees('jerusalem', 'olives-3', (s) => oliveTree({ era: ERA, seed: s }), 6, 100, 170, -160, -92, 0.6);
  if (vis) {
    const rng = new Rng('hedges');
    const hedges: readonly [number, number, number][] = [
      [60, 36, 0],
      [94, 66, PI2],
      [56, 88, 0.3],
      [102, 92, 0],
      [-14, 60, PI2],
      [52, 112, -0.3],
    ];
    for (const [x, z, ry] of hedges) if (free(x, z)) batches.country.add(sabraHedge({ era: ERA, seed: 'hedge' + String(x), length: 8 + rng.range(0, 3) }), x, z, ry);
    for (let i = 0; i < 10; i++) {
      const x = rng.range(-50, 120);
      const z = rng.range(20, 150);
      if (free(x, z)) batches.country.add(rock({ era: ERA, seed: 'rk' + String(i), size: rng.range(0.4, 0.9) }), x, z, rng.range(0, 6));
    }
    for (const b of Object.values(batches)) b.flush();
  }

  return { rail, inField: inAnyField };
}

