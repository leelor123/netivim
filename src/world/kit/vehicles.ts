import * as THREE from 'three';
import { rgb, type RGB } from '../color';
import { Rng } from '../rng';
import { deckGeometry, hullGeometry, stationAt, type GeoBuilder, type HullStation } from './builder';
import { kitBuilder, type KitOptions } from './buildings';

const TIRE = '#262422';
const HUB = '#55524c';
const DARK = '#24262a';

/** Vehicles face +z; wheels sit on y = 0. */
function wheel(b: GeoBuilder, x: number, z: number, r: number, w = 0.3): void {
  b.cyl(r, r, w, 8, TIRE, x, r, z, 0, 0, Math.PI / 2);
  b.cyl(r * 0.45, r * 0.45, w + 0.02, 6, HUB, x, r, z, 0, 0, Math.PI / 2);
}

/** 1940s cab-over-engine flatbed truck with a canvas-covered cargo bed. */
export function truck1940s(o: KitOptions & { covered?: boolean } = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'truck');
  const b = kitBuilder(o, 0.06);
  const paint = r.pick(['#5c6449', '#6b5d45', '#4f5a5f', '#7a6b4f']);
  for (const z of [1.9, -0.9, -1.9]) for (const x of [-0.95, 0.95]) wheel(b, x, z, 0.48);
  b.block(1.9, 0.25, 6.0, '#2d2b28', 0, 0.55, -0.2);
  // Hood, fenders and cab.
  b.block(1.1, 0.8, 1.4, paint, 0, 0.8, 2.3);
  b.block(0.9, 0.1, 0.06, '#8a8780', 0, 1.0, 3.02);
  for (const x of [-0.85, 0.85]) b.box(0.45, 0.25, 1.2, paint, x, 1.05, 2.0, 0, -0.15);
  b.block(1.9, 1.4, 1.4, paint, 0, 0.8, 1.0);
  b.box(1.6, 0.55, 0.06, DARK, 0, 1.85, 1.72);
  b.box(0.06, 0.45, 0.8, DARK, 0.96, 1.8, 1.0);
  b.box(0.06, 0.45, 0.8, DARK, -0.96, 1.8, 1.0);
  for (const x of [-0.6, 0.6]) b.cyl(0.12, 0.12, 0.08, 6, '#d9d4c0', x, 1.25, 3.04, Math.PI / 2);
  // Grille slats, bumper and running boards.
  for (let i = 0; i < 5; i++) b.box(0.05, 0.55, 0.04, '#3a3936', -0.3 + i * 0.15, 1.2, 3.02);
  b.box(2.0, 0.14, 0.16, '#2f2e2b', 0, 0.62, 3.12);
  for (const x of [-1.02, 1.02]) b.box(0.3, 0.06, 1.0, '#2f2e2b', x, 0.72, 1.0);
  // Cargo bed.
  b.block(2.1, 0.6, 3.6, '#6e5236', 0, 0.8, -1.3);
  if (o.covered ?? r.chance(0.6)) {
    b.block(2.1, 1.1, 3.4, '#a59a78', 0, 1.4, -1.3);
    b.add(new THREE.CylinderGeometry(1.05, 1.05, 3.4, 8, 1, false, -Math.PI / 2, Math.PI), '#a59a78', 0, 2.5, -1.3, -Math.PI / 2, 0, 0, 1, 1, 0.45);
  } else {
    for (let i = 0; i < 4; i++) b.block(0.6, 0.6, 0.6, '#9a7b52', -0.6 + (i % 2) * 1.2, 1.4, -0.4 - Math.floor(i / 2) * 1.6);
    b.block(1.4, 0.5, 0.8, '#b5a37c', 0, 1.4, -2.6);
  }
  return b.build();
}

/** 1940s intercity bus with rounded hood, window strip and roof rack. */
export function bus1940s(o: KitOptions = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'bus');
  const b = kitBuilder(o, 0.05);
  const paint = r.pick(['#3f6d8c', '#b7b09a', '#7b8d5a', '#c19a4a']);
  const trim = '#e6e0cf';
  for (const z of [2.6, -2.4]) for (const x of [-1.0, 1.0]) wheel(b, x, z, 0.5, 0.35);
  b.block(2.3, 0.4, 7.6, '#2d2b28', 0, 0.5, 0);
  b.block(1.3, 0.9, 1.2, paint, 0, 0.8, 3.9);
  b.cyl(0.65, 0.65, 0.9, 8, paint, 0, 1.25, 4.5);
  b.block(2.4, 1.0, 6.6, paint, 0, 0.8, -0.3);
  b.block(2.4, 1.0, 6.6, trim, 0, 1.8, -0.3);
  b.block(2.45, 0.2, 6.7, paint, 0, 2.8, -0.3);
  for (let i = 0; i < 6; i++) {
    const z = 2.4 - i * 1.05;
    b.box(0.05, 0.7, 0.85, DARK, 1.22, 2.3, z);
    b.box(0.05, 0.7, 0.85, DARK, -1.22, 2.3, z);
  }
  b.box(2.0, 0.75, 0.06, DARK, 0, 2.3, 3.0);
  b.box(2.3, 0.08, 6.0, '#3b3834', 0, 3.1, -0.4);
  for (let i = 0; i < 3; i++) b.block(0.7, 0.45, 0.6, '#8a6c48', -0.6 + i * 0.6, 3.1, -1.5 + i * 1.3);
  return b.build();
}

/**
 * Improvised armored "sandwich" truck (1947-48 convoys): steel plates over wood, narrow vision
 * slits. Deliberately carries no visible weapons (BRIEF 4).
 */
export function sandwichTruck(o: KitOptions = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'sandwich');
  const b = kitBuilder(o, 0.08);
  const plate = r.pick(['#6d6f68', '#5f625c', '#7a7466']);
  for (const z of [1.9, -0.9, -1.9]) for (const x of [-0.95, 0.95]) wheel(b, x, z, 0.48);
  b.block(1.9, 0.25, 6.0, '#2d2b28', 0, 0.55, -0.2);
  // Armored hood (angled plates) and boxy armored cab.
  b.block(1.3, 0.9, 1.4, plate, 0, 0.75, 2.35);
  b.box(1.3, 0.12, 1.0, plate, 0, 1.75, 2.6, 0, -0.35);
  b.block(2.2, 1.7, 1.6, plate, 0, 0.7, 1.0);
  b.box(1.4, 0.08, 0.06, '#121212', 0, 2.05, 1.81);
  b.box(0.06, 0.08, 0.7, '#121212', 1.11, 2.0, 1.0);
  b.box(0.06, 0.08, 0.7, '#121212', -1.11, 2.0, 1.0);
  // Armored cargo box with rivet strips and a rear door.
  b.block(2.3, 2.0, 3.8, plate, 0, 0.7, -1.4);
  for (let i = 0; i < 4; i++) {
    b.box(2.34, 0.06, 0.06, '#4c4d49', 0, 1.1 + i * 0.45, 0.5);
    b.box(0.06, 0.06, 3.8, '#4c4d49', 1.16, 1.1 + i * 0.45, -1.4);
    b.box(0.06, 0.06, 3.8, '#4c4d49', -1.16, 1.1 + i * 0.45, -1.4);
  }
  b.box(1.6, 1.6, 0.06, '#5a5c56', 0, 1.7, -3.31);
  b.box(1.8, 0.06, 0.08, '#121212', 0, 2.3, -3.33);
  for (const z of [-0.6, -2.0]) {
    b.box(0.06, 0.06, 0.6, '#121212', 1.17, 2.2, z);
    b.box(0.06, 0.06, 0.6, '#121212', -1.17, 2.2, z);
  }
  return b.build();
}

/** Donkey pulling a two-wheeled cart (donkey faces +z). */
export function donkeyCart(o: KitOptions & { load?: boolean } = {}): THREE.BufferGeometry {
  const b = kitBuilder(o, 0.08);
  const coat = '#8c7d6c';
  // Donkey.
  b.blob(0.5, coat, 0, 1.0, 1.9, 0.8, 0.8, 1.5);
  for (const x of [-0.2, 0.2]) for (const z of [1.5, 2.3]) b.cyl(0.07, 0.06, 0.75, 5, coat, x, 0.38, z);
  b.box(0.22, 0.55, 0.3, coat, 0, 1.35, 2.55, 0, -0.6);
  b.blob(0.22, coat, 0, 1.55, 2.85, 0.9, 0.9, 1.5);
  b.box(0.18, 0.18, 0.2, '#d8d0c2', 0, 1.47, 3.12);
  for (const x of [-0.1, 0.1]) b.box(0.06, 0.32, 0.08, '#6e6152', x, 1.85, 2.75, 0, -0.2);
  // Shafts, cart bed and wheels.
  for (const x of [-0.45, 0.45]) b.box(0.07, 0.07, 2.2, '#6e5236', x, 0.95, 1.0, 0, 0.1);
  b.block(1.4, 0.15, 1.8, '#7a5a3c', 0, 0.7, -0.4);
  for (const x of [-0.72, 0.72]) b.block(0.08, 0.35, 1.8, '#6e5236', x, 0.85, -0.4);
  b.cyl(0.55, 0.55, 0.1, 8, '#5a412b', 0.8, 0.55, -0.4, 0, 0, Math.PI / 2);
  b.cyl(0.55, 0.55, 0.1, 8, '#5a412b', -0.8, 0.55, -0.4, 0, 0, Math.PI / 2);
  if (o.load ?? true) {
    b.blob(0.35, '#c9b48d', -0.3, 1.1, -0.1, 1, 0.8, 1.2);
    b.blob(0.35, '#b9a27a', 0.3, 1.1, -0.7, 1, 0.8, 1.2);
    b.block(0.5, 0.4, 0.5, '#9a7b52', 0.2, 0.85, 0.1);
  }
  return b.build();
}

/** Half-beam of the hull surface at height y on a station (inverse of the round-bilge section). */
function sideX(st: HullStation, y: number): number {
  const k = Math.min(1, Math.max(0, (y - st.keel) / Math.max(1e-6, st.sheer - st.keel)));
  return st.halfWidth * Math.sin(Math.acos(1 - k));
}

/** Gunwale cap rails along both sheers, one beam per station span. */
function gunwale(b: GeoBuilder, stations: readonly HullStation[], w: number, h: number, color: string, lift = 0): void {
  for (let i = 0; i + 1 < stations.length; i++) {
    const s0 = stations[i];
    const s1 = stations[i + 1];
    if (!s0 || !s1) continue;
    for (const side of [-1, 1]) {
      b.beam(side * s0.halfWidth, s0.sheer + lift, s0.z, side * s1.halfWidth, s1.sheer + lift, s1.z, w, h, color);
    }
  }
}

const SHIP_HULL: readonly HullStation[] = [
  { z: -23, halfWidth: 3.3, keel: 0.4, sheer: 2.95 },
  { z: -20.5, halfWidth: 3.85, keel: -1.5, sheer: 2.82 },
  { z: -12, halfWidth: 4.0, keel: -2.0, sheer: 2.75 },
  { z: 8, halfWidth: 4.0, keel: -2.0, sheer: 2.75 },
  { z: 16, halfWidth: 3.55, keel: -1.9, sheer: 2.88 },
  { z: 22, halfWidth: 2.3, keel: -1.4, sheer: 3.15 },
  { z: 26, halfWidth: 0.14, keel: -0.3, sheer: 3.55 },
];

/** 1940s immigrant ship (Aliyah Bet style): lofted hull with sheer, bridge, funnel and two masts. */
export function immigrantShip(o: KitOptions = {}): THREE.BufferGeometry {
  const b = kitBuilder(o, 0.05);
  const hull = '#3c4248';
  const st = SHIP_HULL;
  b.add(hullGeometry(st, 0, 0.36, 3), '#5e2c26');
  b.add(hullGeometry(st, 0.36, 0.42, 1), '#b9b3a3');
  b.add(hullGeometry(st, 0.42, 0.9, 4), hull);
  b.add(hullGeometry(st, 0.9, 1, 1), '#b7b3a8');
  b.add(deckGeometry(st), '#8a7a62');
  gunwale(b, st, 0.22, 0.14, '#d9d4c6', 0.07);
  // Rail: stanchions and a top rail around the main deck.
  for (let z = -21; z <= 22; z += 2.6) {
    const s = stationAt(st, z);
    for (const side of [-1, 1]) b.block(0.07, 1.0, 0.07, '#d9d4c6', side * (s.halfWidth - 0.08), s.sheer, z);
  }
  gunwale(b, st.slice(1, 6), 0.06, 0.06, '#d9d4c6', 1.0);
  // Portholes along the topsides.
  for (let z = -18; z <= 17; z += 2.2) {
    const s = stationAt(st, z);
    const x = sideX(s, 1.55) + 0.02;
    for (const side of [-1, 1]) b.cyl(0.2, 0.2, 0.06, 8, '#1d2024', side * x, 1.55, z, 0, 0, Math.PI / 2);
  }
  // Superstructure: deckhouse, bridge with wings and windows, funnel with a band.
  b.block(6.5, 3.0, 9, '#d9d4c6', 0, 2.75, -6);
  b.block(6.8, 0.15, 9.3, '#bdb7a8', 0, 5.75, -6);
  b.block(5.5, 2.2, 6, '#d9d4c6', 0, 5.9, -6.5);
  b.block(8.6, 0.12, 1.6, '#bdb7a8', 0, 8.1, -4.2);
  b.block(6.0, 0.15, 6.4, '#bdb7a8', 0, 8.1, -6.5);
  for (let i = 0; i < 6; i++) {
    b.box(0.06, 0.6, 0.6, '#2a2d30', 3.26, 4.0, -9.5 + i * 1.4);
    b.box(0.06, 0.6, 0.6, '#2a2d30', -3.26, 4.0, -9.5 + i * 1.4);
  }
  for (let i = 0; i < 5; i++) b.box(0.8, 0.7, 0.06, '#24292e', -2.0 + i, 7.15, -3.48);
  b.cyl(0.9, 1.0, 4, 10, '#3f3a34', 0, 9.8, -8);
  b.cyl(0.92, 0.92, 0.6, 10, '#a6382f', 0, 11.5, -8);
  b.cyl(0.95, 0.95, 0.12, 10, '#1d1b19', 0, 11.86, -8);
  for (const z of [12, -18]) {
    const s = stationAt(st, z);
    b.cyl(0.18, 0.25, 14, 6, '#5a4a38', 0, s.sheer + 6.7, z);
    b.box(5, 0.15, 0.15, '#5a4a38', 0, s.sheer + 10.7, z);
    // Stays down to the rails.
    for (const side of [-1, 1]) b.beam(0, s.sheer + 13.4, z, side * (s.halfWidth - 0.2), s.sheer + 0.1, z - 1.5, 0.04, 0.04, '#2c2a27');
  }
  // Lifeboats in davits, hatch covers and deck cargo.
  for (const z of [-2, 4]) {
    for (const x of [-3.2, 3.2]) {
      b.blob(0.8, '#d0c9b8', x, 3.6, z, 0.8, 0.5, 2.4, 1);
      b.beam(x * 1.05, 2.8, z - 1.4, x * 1.02, 4.2, z - 1.4, 0.08, 0.08, '#3a3936');
      b.beam(x * 1.05, 2.8, z + 1.4, x * 1.02, 4.2, z + 1.4, 0.08, 0.08, '#3a3936');
    }
  }
  b.block(3, 0.6, 4, '#6b5d4a', 0, 2.75, 15);
  b.block(3, 1.2, 6, '#7a6b55', 0, 2.75, 8);
  for (let i = 0; i < 3; i++) b.box(3.05, 0.06, 0.08, '#4e4436', 0, 3.6, 5.6 + i * 2.4);
  return b.build();
}

const BOAT_HULL: readonly HullStation[] = [
  { z: -3.0, halfWidth: 0.92, keel: -0.18, sheer: 0.74 },
  { z: -2.1, halfWidth: 1.13, keel: -0.36, sheer: 0.68 },
  { z: -0.2, halfWidth: 1.2, keel: -0.42, sheer: 0.63 },
  { z: 1.8, halfWidth: 1.06, keel: -0.38, sheer: 0.7 },
  { z: 3.25, halfWidth: 0.6, keel: -0.22, sheer: 0.86 },
  { z: 4.2, halfWidth: 0.05, keel: 0.05, sheer: 1.02 },
];

/** Small wooden fishing boat (Jaffa / coastal lifeboat): lofted planked hull, wheelhouse, mast and gear. */
export function fishingBoat(o: KitOptions = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'boat');
  const b = kitBuilder(o, 0.06);
  const paint = r.pick(['#3f6f9a', '#e2dccb', '#2f7f6f', '#b5523b']);
  const trim = paint === '#e2dccb' ? '#3f6f9a' : '#e8e2d2';
  const wood = '#7a5a3c';
  const st = BOAT_HULL;
  b.add(hullGeometry(st, 0, 0.42, 3), '#8a3b2a');
  b.add(hullGeometry(st, 0.42, 0.5, 1), trim);
  b.add(hullGeometry(st, 0.5, 1, 3), paint);
  b.add(deckGeometry(st), '#a88a62');
  gunwale(b, st, 0.1, 0.1, trim, 0.05);
  // Strakes: a raised plank line along each side reads as a planked hull.
  for (let i = 0; i + 1 < st.length; i++) {
    const s0 = st[i];
    const s1 = st[i + 1];
    if (!s0 || !s1) continue;
    for (const side of [-1, 1]) {
      const y0 = s0.keel + (s0.sheer - s0.keel) * 0.72;
      const y1 = s1.keel + (s1.sheer - s1.keel) * 0.72;
      b.beam(side * (sideX(s0, y0) + 0.01), y0, s0.z, side * (sideX(s1, y1) + 0.01), y1, s1.z, 0.03, 0.04, shadeHex(paint, 0.78));
    }
  }
  // Painted eye on each bow (a Levantine boat tradition).
  const eyeSt = stationAt(st, 3.0);
  const ey = eyeSt.keel + (eyeSt.sheer - eyeSt.keel) * 0.82;
  for (const side of [-1, 1]) {
    const x = side * (sideX(eyeSt, ey) + 0.015);
    b.cyl(0.12, 0.12, 0.02, 8, '#efe9dc', x, ey, 3.0, 0, 0.3 * side, Math.PI / 2);
    b.cyl(0.06, 0.06, 0.03, 6, '#1d1a18', x + side * 0.006, ey, 3.02, 0, 0.3 * side, Math.PI / 2);
  }
  // Wheelhouse with a roof overhang, windows and a rear door.
  const cz = -1.2;
  const cy = stationAt(st, cz).sheer - 0.02;
  b.block(1.5, 1.25, 1.5, trim, 0, cy, cz);
  b.block(1.75, 0.08, 1.85, shadeHex(paint, 0.8), 0, cy + 1.25, cz + 0.05);
  b.box(1.15, 0.38, 0.04, '#2a2d30', 0, cy + 0.9, cz + 0.76);
  for (const side of [-1, 1]) b.box(0.04, 0.34, 0.9, '#2a2d30', side * 0.76, cy + 0.9, cz);
  b.box(0.6, 0.95, 0.04, wood, 0.3, cy + 0.48, cz - 0.76);
  b.cyl(0.05, 0.05, 0.5, 5, '#3a3a3a', -0.45, cy + 1.5, cz - 0.4);
  // Mast, boom with a furled sail and stays to stem and stern.
  const mz = 1.0;
  const my = stationAt(st, mz).sheer;
  b.cyl(0.07, 0.085, 4.5, 6, '#5a4a38', 0, my + 2.2, mz);
  b.beam(0, my + 1.1, mz, 0, my + 1.25, mz + 2.6, 0.07, 0.07, '#5a4a38');
  b.beam(0, my + 1.3, mz + 0.1, 0, my + 1.4, mz + 2.4, 0.22, 0.2, '#d8cdb2');
  b.beam(0, my + 4.4, mz, 0, 1.02, 4.15, 0.025, 0.025, '#2c2a27');
  b.beam(0, my + 4.4, mz, 0, cy + 1.3, cz + 0.2, 0.025, 0.025, '#2c2a27');
  // Thwart, fish boxes, coiled rope, net, rudder and tiller.
  b.block(2.0, 0.08, 0.3, wood, 0, stationAt(st, 2.4).sheer - 0.12, 2.4);
  b.block(0.55, 0.3, 0.4, '#9a7b52', -0.45, stationAt(st, 0.3).sheer - 0.02, 0.3);
  b.block(0.55, 0.3, 0.4, '#8a6c48', -0.4, stationAt(st, 0.3).sheer + 0.28, 0.35);
  b.cyl(0.24, 0.26, 0.1, 9, '#b9a77f', 0.55, stationAt(st, 0.2).sheer + 0.03, 0.2);
  b.blob(0.45, '#7a6b55', 0.45, 0.85, 1.8, 1.2, 0.45, 1.0, 1);
  b.box(0.06, 0.8, 0.5, wood, 0, 0.2, -3.2);
  b.beam(0, 0.85, -3.15, 0, 1.0, -2.3, 0.05, 0.05, wood);
  return b.build();
}

function shadeHex(hex: string, k: number): RGB {
  const c = rgb(hex);
  return [c[0] * k, c[1] * k, c[2] * k];
}
