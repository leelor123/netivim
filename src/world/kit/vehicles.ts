import * as THREE from 'three';
import { Rng } from '../rng';
import type { GeoBuilder } from './builder';
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

/** 1940s immigrant ship (Aliyah Bet style): long low hull, bridge, funnel and two masts. */
export function immigrantShip(o: KitOptions = {}): THREE.BufferGeometry {
  const b = kitBuilder(o, 0.06);
  const hull = '#3c4248';
  const len = 46;
  const beam = 8;
  b.block(beam, 4.5, len, hull, 0, -2.0, 0);
  b.add(new THREE.CylinderGeometry(1, 1, 4.5, 3), hull, 0, 0.25, len / 2, 0, 0, 0, beam / Math.sqrt(3), 1, 6 / 1.5);
  b.block(beam - 0.2, 0.3, len - 0.4, '#8a7a62', 0, 2.5, 0);
  b.block(beam + 0.05, 0.6, len, '#b7b3a8', 0, 1.9, 0);
  b.block(beam - 1.5, 3.0, 9, '#d9d4c6', 0, 2.8, -6);
  b.block(beam - 2.5, 2.2, 6, '#d9d4c6', 0, 5.8, -6.5);
  for (let i = 0; i < 6; i++) b.box(0.06, 0.6, 0.6, '#2a2d30', (beam - 1.5) / 2 + 0.01, 4.0, -9.5 + i * 1.4);
  b.cyl(0.9, 1.0, 4, 8, '#3f3a34', 0, 9.8, -8);
  b.cyl(0.92, 0.92, 0.6, 8, '#a6382f', 0, 11.5, -8);
  for (const z of [12, -18]) {
    b.cyl(0.18, 0.25, 14, 6, '#5a4a38', 0, 9.5, z);
    b.box(5, 0.15, 0.15, '#5a4a38', 0, 13.5, z);
  }
  // Lifeboats and deck cargo.
  for (const z of [-2, 4]) for (const x of [-3.4, 3.4]) b.blob(0.8, '#d0c9b8', x, 3.3, z, 0.8, 0.5, 2.4);
  b.block(3, 1.2, 6, '#7a6b55', 0, 2.8, 8);
  return b.build();
}

/** Small wooden fishing boat with a cabin and short mast. */
export function fishingBoat(o: KitOptions = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'boat');
  const b = kitBuilder(o, 0.08);
  const paint = r.pick(['#3f6f9a', '#e2dccb', '#2f7f6f', '#b5523b']);
  b.block(2.4, 1.0, 6.0, paint, 0, -0.4, 0);
  b.add(new THREE.CylinderGeometry(1, 1, 1.0, 3), paint, 0, 0.1, 3.0, 0, 0, 0, 2.4 / Math.sqrt(3), 1, 1.8 / 1.5);
  b.block(2.45, 0.15, 6.1, '#e8e2d2', 0, 0.55, 0);
  b.block(1.6, 1.3, 1.6, '#e8e2d2', 0, 0.6, -1.2);
  b.box(1.2, 0.4, 0.05, '#2a2d30', 0, 1.5, -0.39);
  b.cyl(0.07, 0.08, 4.5, 5, '#5a4a38', 0, 2.8, 1.0);
  b.blob(0.45, '#7a6b55', 0.5, 0.75, 1.8, 1.2, 0.5, 1.0);
  return b.build();
}
