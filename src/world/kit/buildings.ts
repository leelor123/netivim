import * as THREE from 'three';
import { eraGrade, type EraId } from '../eraLook';
import { Rng } from '../rng';
import { GeoBuilder } from './builder';

/** Options shared by kit functions. Every result is deterministic for a given seed. */
export interface KitOptions {
  readonly era?: EraId;
  readonly seed?: number | string;
}

export function kitBuilder(o: KitOptions, jitter = 0.1, limbs = false): GeoBuilder {
  return new GeoBuilder({ grade: eraGrade(o.era ?? 'modern'), jitter, seed: o.seed ?? 1, limbs });
}

const DARK = '#2b2522';
const WOOD = '#6e4f34';
const SHUTTER_GREEN = '#4f6b55';
const SHUTTER_BLUE = '#4d6f86';
const TILE = '#b45a3c';

/** A row of window openings on one wall face (dark insets with optional shutters). */
function windowRow(
  b: GeoBuilder,
  count: number,
  span: number,
  y: number,
  w: number,
  h: number,
  face: { x: number; z: number; alongX: boolean },
  shutter: string | null,
): void {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * span;
    const x = face.alongX ? face.x + t : face.x;
    const z = face.alongX ? face.z : face.z + t;
    const ww = face.alongX ? w : 0.08;
    const wd = face.alongX ? 0.08 : w;
    b.box(ww, h, wd, DARK, x, y, z);
    if (shutter) {
      const off = w * 0.75;
      if (face.alongX) {
        b.box(w * 0.5, h, 0.06, shutter, x - off, y, z);
        b.box(w * 0.5, h, 0.06, shutter, x + off, y, z);
      } else {
        b.box(0.06, h, w * 0.5, shutter, x, y, z - off);
        b.box(0.06, h, w * 0.5, shutter, x, y, z + off);
      }
    }
  }
}

/** Traditional Arab village house: thick stone walls, flat roof with parapet, optional dome. */
export function stoneVillageHouse(o: KitOptions & { dome?: boolean; stories?: 1 | 2 } = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'stone-house');
  const b = kitBuilder(o, 0.14);
  const w = r.range(5, 7);
  const d = r.range(4.5, 6);
  const stories = o.stories ?? (r.chance(0.25) ? 2 : 1);
  const h = 3.1 * stories;
  const stone = r.pick(['#d9c9a6', '#cdb894', '#e0d3b6', '#c8b08a']);
  b.block(w, h, d, stone, 0, 0, 0);
  b.block(w + 0.1, 0.35, d + 0.1, stone, 0, h, 0);
  b.block(w - 0.5, 0.15, d - 0.5, '#bfae8e', 0, h + 0.05, 0);
  const dome = o.dome ?? r.chance(0.4);
  if (dome) b.dome(Math.min(w, d) * 0.32, stone, 0, h, 0, 8);
  // Arched door and small windows.
  b.box(1.0, 2.0, 0.1, DARK, -w * 0.18, 1.0, d / 2);
  b.cyl(0.5, 0.5, 0.1, 6, DARK, -w * 0.18, 2.0, d / 2, Math.PI / 2);
  for (let s = 0; s < stories; s++) {
    windowRow(b, 2, w * 0.5, 1.9 + s * 3.1, 0.55, 0.75, { x: 0, z: -d / 2 - 0.01, alongX: true }, null);
    windowRow(b, 1, 0, 1.9 + s * 3.1, 0.55, 0.75, { x: w * 0.25, z: d / 2 + 0.01, alongX: true }, r.chance(0.5) ? SHUTTER_BLUE : null);
  }
  if (r.chance(0.6)) {
    // Outdoor stair to the roof.
    for (let i = 0; i < 6; i++) b.block(0.9, (i + 1) * (h / 6), 0.5, stone, w / 2 + 0.45, 0, -d / 2 + 0.4 + i * 0.5);
  }
  if (r.chance(0.5)) b.dome(0.6, '#b49c78', -w / 2 - 1.2, 0, d / 2 - 0.8, 6); // taboun oven
  return b.build();
}

/** Late-Ottoman urban building: two stories, arched windows, cornice, red-tile hip roof. */
export function ottomanBuilding(o: KitOptions = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'ottoman');
  const b = kitBuilder(o, 0.08);
  const w = r.range(9, 12);
  const d = r.range(7.5, 9);
  const stone = r.pick(['#dcc8a2', '#e2d2b0', '#d2bc94']);
  b.block(w, 7.4, d, stone, 0, 0, 0);
  b.block(w + 0.3, 0.3, d + 0.3, '#c9b48d', 0, 3.6, 0);
  b.block(w + 0.4, 0.35, d + 0.4, '#c9b48d', 0, 7.4, 0);
  b.pyramid(w + 0.6, 2.4, d + 0.6, TILE, 0, 7.75, 0);
  for (const fy of [1.9, 5.5]) {
    for (const side of [-1, 1]) {
      const z = (side * d) / 2 + side * 0.01;
      for (let i = 0; i < 4; i++) {
        const x = (i / 3 - 0.5) * w * 0.7;
        b.box(0.8, 1.5, 0.08, DARK, x, fy, z);
        b.cyl(0.4, 0.4, 0.08, 6, DARK, x, fy + 0.75, z, Math.PI / 2);
        b.box(1.0, 0.1, 0.2, '#c9b48d', x, fy - 0.8, z);
      }
    }
  }
  // Balcony over the entrance.
  b.block(2.6, 0.18, 1.0, '#c9b48d', 0, 3.7, d / 2 + 0.5);
  for (let i = 0; i < 6; i++) b.block(0.06, 0.9, 0.06, '#3d3a36', -1.25 + i * 0.5, 3.88, d / 2 + 0.98);
  b.box(1.4, 2.4, 0.1, '#4a3324', 0, 1.2, d / 2 + 0.02);
  return b.build();
}

/** Templer (German colony) house: light stone, steep red gable roof, chimney, garden steps. */
export function templerHouse(o: KitOptions = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'templer');
  const b = kitBuilder(o, 0.08);
  const w = r.range(8, 10);
  const d = r.range(7, 8.5);
  const stone = r.pick(['#e8dcc0', '#ddd0b0']);
  b.block(w, 4.4, d, stone, 0, 0, 0);
  b.block(w + 0.2, 0.25, d + 0.2, '#cbbd9c', 0, 0, 0);
  b.gable(d + 0.6, 3.6, w + 0.6, TILE, 0, 4.4, 0, Math.PI / 2);
  b.block(0.7, 2.4, 0.7, '#cfc2a3', w * 0.25, 5.0, -d * 0.15);
  // Gable-end attic window and front windows with green shutters.
  b.box(0.7, 0.9, 0.08, DARK, w / 2 + 0.31, 5.4, 0);
  windowRow(b, 3, w * 0.6, 2.3, 0.75, 1.3, { x: 0, z: d / 2 + 0.01, alongX: true }, SHUTTER_GREEN);
  windowRow(b, 3, w * 0.6, 2.3, 0.75, 1.3, { x: 0, z: -d / 2 - 0.01, alongX: true }, SHUTTER_GREEN);
  b.box(1.1, 2.3, 0.1, WOOD, -w * 0.32, 1.4, d / 2 + 0.02);
  for (let i = 0; i < 3; i++) b.block(1.6, 0.25 * (3 - i), 0.4, '#cbbd9c', -w * 0.32, 0, d / 2 + 0.2 + i * 0.4);
  return b.build();
}

/** Tel Aviv "Bauhaus" (International Style) apartment block on pilotis with ribbon balconies. */
export function bauhausBlock(o: KitOptions & { floors?: number } = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'bauhaus');
  const b = kitBuilder(o, 0.05);
  const floors = o.floors ?? r.int(3, 4);
  const fh = 3;
  const w = r.range(12, 16);
  const d = r.range(9, 11);
  const era = o.era ?? 'modern';
  const plaster = era === 'mandate1940' ? '#f4f0e6' : era === 'modern' ? '#f1ede4' : '#e4dccb';
  // Pilotis ground floor: columns and a recessed lobby.
  for (const x of [-w / 2 + 0.4, 0, w / 2 - 0.4]) for (const z of [-d / 2 + 0.4, d / 2 - 0.4]) b.block(0.35, fh, 0.35, plaster, x, 0, z);
  b.block(w * 0.35, fh, d * 0.5, '#d9d0bd', -w * 0.15, 0, 0);
  b.block(w, (floors - 1) * fh, d, plaster, 0, fh, 0);
  b.block(w + 0.2, 0.25, d + 0.2, plaster, 0, floors * fh, 0);
  // Ribbon balconies with solid parapets and a dark strip of window behind each.
  for (let f = 1; f < floors; f++) {
    const y = f * fh;
    b.block(w * 0.7, 0.18, 1.3, plaster, w * 0.1, y, d / 2 + 0.65);
    b.block(w * 0.7, 0.9, 0.12, plaster, w * 0.1, y + 0.18, d / 2 + 1.25);
    b.box(w * 0.62, 1.3, 0.08, DARK, w * 0.1, y + 1.5, d / 2 + 0.02);
    b.box(w * 0.5, 0.9, 0.08, DARK, 0, y + 1.6, -d / 2 - 0.02);
  }
  // Rounded stair tower with a tall thermometer window.
  b.cyl(1.6, 1.6, floors * fh + 0.8, 12, plaster, -w / 2 + 0.6, (floors * fh + 0.8) / 2, d / 2 - 1.2);
  b.box(0.35, floors * fh - 1.5, 0.1, DARK, -w / 2 + 0.6, (floors * fh) / 2 + 0.5, d / 2 + 0.38);
  b.block(3.5, 2.2, 3, plaster, w / 4, floors * fh, -d / 4);
  return b.build();
}

/** Prefab wooden kibbutz hut (tzrif) on blocks with a corrugated gable roof. */
export function kibbutzHut(o: KitOptions = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'hut');
  const b = kitBuilder(o, 0.12);
  const w = r.range(8, 11);
  const d = 4.5;
  const plank = r.pick(['#8a6a48', '#7d5e40', '#94744f']);
  for (const x of [-w / 2 + 0.3, 0, w / 2 - 0.3]) for (const z of [-d / 2 + 0.3, d / 2 - 0.3]) b.block(0.4, 0.4, 0.4, '#8f8a80', x, 0, z);
  b.block(w, 2.6, d, plank, 0, 0.4, 0);
  b.gable(d + 0.6, 1.2, w + 0.6, '#8e9496', 0, 3.0, 0, Math.PI / 2);
  windowRow(b, 3, w * 0.6, 2.0, 0.8, 0.8, { x: 0, z: d / 2 + 0.01, alongX: true }, plank);
  b.box(0.9, 2.0, 0.08, '#5a412b', w * 0.4, 1.4, d / 2 + 0.02);
  for (let i = 0; i < 2; i++) b.block(1.1, 0.2 * (2 - i), 0.35, '#8f8a80', w * 0.4, 0, d / 2 + 0.2 + i * 0.35);
  return b.build();
}

/** Concrete kibbutz water tower: tank on a tapering shaft with a ladder. */
export function waterTower(o: KitOptions = {}): THREE.BufferGeometry {
  const b = kitBuilder(o, 0.08);
  const concrete = '#b9b2a4';
  b.cyl(1.1, 1.6, 9, 8, concrete, 0, 4.5, 0);
  b.cyl(3.0, 2.4, 3.2, 10, concrete, 0, 10.6, 0);
  b.cyl(3.1, 3.1, 0.3, 10, '#a8a194', 0, 12.3, 0);
  b.cone(3.1, 0.8, 10, '#a8a194', 0, 12.85, 0);
  for (let i = 0; i < 18; i++) b.box(0.5, 0.05, 0.05, '#4a4744', 0, 0.5 + i * 0.5, 1.6 - (i / 18) * 0.45);
  b.box(0.05, 9, 0.05, '#4a4744', -0.25, 4.5, 1.4);
  b.box(0.05, 9, 0.05, '#4a4744', 0.25, 4.5, 1.4);
  b.box(0.6, 0.8, 0.05, DARK, 0, 1.0, 1.58);
  return b.build();
}

/** Tower-and-stockade wall frame: double plank wall filled with gravel, corner posts and a gate. */
export function stockadeWall(o: KitOptions & { side?: number } = {}): THREE.BufferGeometry {
  const b = kitBuilder(o, 0.1);
  const side = o.side ?? 34;
  const h = 2.2;
  const plank = '#8b6c4a';
  const half = side / 2;
  for (const [x, z, ry] of [
    [0, -half, 0],
    [0, half, 0],
    [-half, 0, Math.PI / 2],
    [half, 0, Math.PI / 2],
  ] as const) {
    const gate = z === half;
    const len = gate ? side / 2 - 2 : side;
    const offsets = gate ? [-(side / 4 + 1), side / 4 + 1] : [0];
    for (const off of offsets) {
      const cx = ry === 0 ? x + off : x;
      const cz = ry === 0 ? z : z + off;
      const ox = ry === 0 ? 0 : 0.35;
      const oz = ry === 0 ? 0.35 : 0;
      b.block(ry === 0 ? len : 0.12, h, ry === 0 ? 0.12 : len, plank, cx - ox, 0, cz - oz);
      b.block(ry === 0 ? len : 0.12, h, ry === 0 ? 0.12 : len, plank, cx + ox, 0, cz + oz);
      b.block(ry === 0 ? len : 0.6, 0.1, ry === 0 ? 0.6 : len, '#a49883', cx, h - 0.1, cz);
      for (let i = 0; i <= Math.floor(len / 3); i++) {
        const t = -len / 2 + (i * len) / Math.floor(len / 3);
        b.block(0.2, h + 0.3, 0.2, '#6b5038', ry === 0 ? cx + t : cx + ox + 0.1, 0, ry === 0 ? cz + oz + 0.1 : cz + t);
      }
    }
  }
  // Gate leaves standing open.
  b.block(1.9, h, 0.1, '#6b5038', -1.9, 0, half + 0.9, 0.9);
  b.block(1.9, h, 0.1, '#6b5038', 1.9, 0, half + 0.9, -0.9);
  return b.build();
}

/** Tower-and-stockade watchtower: braced timber legs, cabin and a searchlight (no weapons). */
export function watchtower(o: KitOptions = {}): THREE.BufferGeometry {
  const b = kitBuilder(o, 0.1);
  const timber = '#7a5a3c';
  const h = 10;
  const s = 1.6;
  for (const x of [-s, s]) for (const z of [-s, s]) b.cyl(0.12, 0.16, h, 5, timber, x, h / 2, z);
  for (let k = 1; k < 4; k++) {
    const y = (k * h) / 4;
    b.box(s * 2.2, 0.1, 0.1, timber, 0, y, -s);
    b.box(s * 2.2, 0.1, 0.1, timber, 0, y, s);
    b.box(0.1, 0.1, s * 2.2, timber, -s, y, 0);
    b.box(0.1, 0.1, s * 2.2, timber, s, y, 0);
  }
  for (const z of [-s, s]) b.box(0.08, Math.hypot(h, s * 2) * 0.98, 0.08, timber, 0, h / 2, z, 0, 0, Math.atan2(s * 2, h));
  b.block(4.2, 0.2, 4.2, '#6b5038', 0, h, 0);
  b.block(3.8, 2.2, 3.8, '#8b6c4a', 0, h + 0.2, 0);
  b.box(3.0, 0.6, 0.06, DARK, 0, h + 1.7, 1.92);
  b.box(3.0, 0.6, 0.06, DARK, 0, h + 1.7, -1.92);
  b.pyramid(4.6, 1.0, 4.6, '#7d8285', 0, h + 2.4, 0);
  b.cyl(0.3, 0.25, 0.5, 8, '#3a3a3a', 0, h + 3.7, 0.1, Math.PI / 2);
  b.cyl(0.05, 0.05, 0.5, 4, '#3a3a3a', 0, h + 3.45, 0);
  // Ladder.
  for (let i = 0; i < 20; i++) b.box(0.6, 0.05, 0.05, '#5a412b', 0, 0.4 + i * 0.5, s + 0.3);
  return b.build();
}

/** Bell / ridge canvas tent. */
export function tent(o: KitOptions & { kind?: 'ridge' | 'bell' } = {}): THREE.BufferGeometry {
  const b = kitBuilder(o, 0.1);
  const canvas = o.era === 'austerity1950' ? '#b8ae94' : '#c3b48f';
  if ((o.kind ?? 'ridge') === 'bell') {
    b.cone(2.4, 3.0, 8, canvas, 0, 1.5, 0);
    b.cyl(0.04, 0.04, 3.4, 4, WOOD, 0, 1.7, 0);
    b.box(0.8, 1.3, 0.05, '#3a3226', 0, 0.65, 2.0, 0, -0.3);
  } else {
    b.gable(3.0, 2.2, 4.0, canvas, 0, 0, 0);
    b.box(1.0, 1.4, 0.04, '#3a3226', 0, 0.7, 2.01);
    for (const z of [-2.05, 2.05]) b.cyl(0.04, 0.04, 2.3, 4, WOOD, 0, 1.15, z);
  }
  return b.build();
}

/** Ma'abara transit-camp hut: corrugated tin, arched (Nissen-like) or flat with a tar roof. */
export function transitHut(o: KitOptions = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'maabara');
  const b = kitBuilder(o, 0.16);
  const tin = r.pick(['#9da2a3', '#8e9192', '#a7a399']);
  if (r.chance(0.5)) {
    b.add(halfCylinder(2.0, 6), tin, 0, 0, 0);
    b.block(1.0, 1.8, 0.05, '#5c4a36', 0, 0, 3.0);
    b.box(0.6, 0.5, 0.05, DARK, -1.0, 1.2, 3.01);
  } else {
    b.block(3.6, 2.3, 4.2, tin, 0, 0, 0);
    b.block(3.9, 0.12, 4.5, '#3d3b38', 0, 2.3, 0, 0.05);
    b.box(0.9, 1.9, 0.05, '#5c4a36', 0.8, 0.95, 2.11);
    b.box(0.6, 0.5, 0.05, DARK, -0.8, 1.4, 2.11);
  }
  b.cyl(0.08, 0.08, 1.0, 5, '#4d4a46', 1.2, 2.5, -1.0);
  return b.build();
}

function halfCylinder(r: number, len: number): THREE.BufferGeometry {
  // Upper half shell of a cylinder lying along z (Nissen-style arched hut).
  const g = new THREE.CylinderGeometry(r, r, len, 10, 1, false, -Math.PI / 2, Math.PI);
  g.rotateX(-Math.PI / 2);
  return g;
}
