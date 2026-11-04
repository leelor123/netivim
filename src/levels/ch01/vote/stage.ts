import * as THREE from 'three';
import { box, circle, type Collider } from '../../../gameplay/core/collision';
import { LevelWorld } from '../../../gameplay/runtime/levelKit';
import { eraGrade } from '../../../world/eraLook';
import { Crowd, figureGeometry, FigureMaterial } from '../../../world/kit/figures';
import { GeoBuilder } from '../../../world/kit/builder';
import { bauhausBlock, stoneVillageHouse } from '../../../world/kit/buildings';
import { cypressTree, oliveTree } from '../../../world/kit/nature';
import type { WorldQuality } from '../../../world/quality';
import type { RoadSpec } from '../../../world/roads';
import { CARD_SPOTS, CARD_TABLE, COURT, HALL, HOME, NOTE_DESK, NOTE_POINTS, OFFICE, PARTIES, RADIO, ROOMS, SIGN, STATION_X_OF_PARTY, TABLE, TALLY, type RoomSpec } from './data';

/**
 * The 3D set of "The Vote": a late-1940s night with a secretariat hall (map table, statement
 * cards, folders), a Tel Aviv home, an Arab town courtyard, a British office and a small square
 * with a street radio. Everything is built once at level build time; per-frame work is limited to
 * animating shared materials (no allocation).
 */

const WALL_H = 3.4;
const GLOW_WARM: [number, number, number] = [2.6, 1.7, 0.7];
const GLOW_RADIO: [number, number, number] = [3, 2.2, 0.9];
const CARD_COLORS = ['#d9b44a', '#7aa6c2', '#c27a66', '#8fb58a'];
const PARTY_COLORS = ['#4f77a8', '#5b8a5e', '#4a8a8a', '#a8584f'];

export interface NpcSpec {
  readonly variant: number;
  readonly x: number;
  readonly z: number;
  readonly faceX: number;
  readonly faceZ: number;
  readonly scale?: number;
}

/** Composite people. Variants are the 1940s wardrobe of the world kit. */
export const NPCS: readonly NpcSpec[] = [
  // Tel Aviv home.
  { variant: 2, x: -31.2, z: 4.6, faceX: -29.6, faceZ: 2.4 },
  { variant: 1, x: -28.2, z: 4.6, faceX: -29.6, faceZ: 2.4 },
  { variant: 0, x: -33.4, z: 3.4, faceX: -30, faceZ: 3, scale: 0.62 },
  // Arab town courtyard.
  { variant: 3, x: 32.8, z: 8.0, faceX: 32.8, faceZ: 5 },
  { variant: 2, x: 36.4, z: 7.2, faceX: 32.8, faceZ: 5 },
  { variant: 0, x: 33.4, z: 2.4, faceX: 32.8, faceZ: 5, scale: 0.62 },
  // British office.
  { variant: 1, x: -1.2, z: 34.0, faceX: 0, faceZ: 29 },
  { variant: 1, x: 2.6, z: 34.0, faceX: 0, faceZ: 29, scale: 1.04 },
  // The square at the radio: neighbors of all communities.
  { variant: 2, x: -2.4, z: 2.2, faceX: 0, faceZ: 4.2 },
  { variant: 3, x: 2.6, z: 2.4, faceX: 0, faceZ: 4.2 },
  { variant: 1, x: 1.2, z: 6.6, faceX: 0, faceZ: 4.2 },
  { variant: 0, x: -1.6, z: 6.2, faceX: 0, faceZ: 4.2, scale: 0.64 },
];

export interface VoteStage {
  readonly world: LevelWorld;
  readonly layerGroups: THREE.Group[];
  readonly cards: THREE.Mesh[];
  readonly page: THREE.Mesh;
  /** Party-position slips on the note desk (PARTIES order). */
  readonly points: THREE.Mesh[];
  readonly colliders: Collider[];
  floorY(room: RoomSpec): number;
  /** Radio glow level 0..1 (broadcast on). */
  setRadio(level: number): void;
  tick(elapsed: number, reducedMotion: boolean): void;
}

function roadsFor(): RoadSpec[] {
  const lane = (points: [number, number][], width = 3.2): RoadSpec => ({ points, width, shoulder: 2, color: '#6f6552' });
  const pad = (cx: number, cz: number, r: number, color: string): RoadSpec => ({ points: [[cx - 1.5, cz], [cx + 1.5, cz]], width: r * 2, shoulder: 3, color });
  return [
    lane([[0, -35], [0, -22], [0, -9]]),
    lane([[-8, 3], [-24, 4]]),
    lane([[8, 3], [26, 4]]),
    lane([[0, 10], [0, 25.5]]),
    pad(SQUARE_C.x, SQUARE_C.z, 11, '#7d7260'),
    pad(HALL.cx, HALL.cz, 12.6, '#5a4a39'),
    pad(HOME.cx, HOME.cz, 8.6, '#5a4a39'),
    pad(OFFICE.cx, OFFICE.cz, 8.6, '#5a4a39'),
    pad(COURT.cx, COURT.cz, 9.6, '#7d7260'),
  ];
}
const SQUARE_C = { x: 0, z: 2 };

export function buildVoteStage(quality: WorldQuality): VoteStage {
  const world = new LevelWorld({ seed: 'the-vote-1947', era: 'archiveNight', grade: 'mandate', biome: 'coastalPlain', size: 128, quality, waterLevel: null, roads: roadsFor() });
  const era = 'mandate1940' as const;
  const bag = world.bag;
  const grade = eraGrade(era);
  const solid = new GeoBuilder({ grade, jitter: 0.07, seed: 'vote-solid' });
  const glow = new GeoBuilder({ jitter: 0, seed: 'vote-glow' });
  const colliders = world.colliders;

  // Night look: dim cool moon, warm interiors do the lighting.
  world.sun.intensity = 1.1;
  world.sun.color.set('#9db4e8');
  world.hemi.intensity = 1.1;
  world.hemi.color.set('#8a9cc8');
  world.hemi.groundColor.set('#2a2118');

  // Flat floors: pads flatten the terrain; players follow a constant floor height inside rooms.
  const floors = new Map<string, number>();
  for (const r of ROOMS) floors.set(r.id, world.terrain.heightAt(r.cx, r.cz));
  const baseHeight = world.heightAt;
  world.heightAt = (x: number, z: number): number => {
    for (const r of ROOMS) {
      if (Math.abs(x - r.cx) <= r.w / 2 + 0.3 && Math.abs(z - r.cz) <= r.d / 2 + 0.3) return floors.get(r.id) ?? 0;
    }
    return baseHeight(x, z);
  };
  const fy = (r: RoomSpec): number => floors.get(r.id) ?? 0;

  const wallColor: Record<string, string> = { hall: '#cbc2aa', home: '#d6c7a6', office: '#b9b29c', court: '#b7a98c' };
  const floorColor: Record<string, string> = { hall: '#6b5640', home: '#7d6246', office: '#5f4b38', court: '#7d7260' };

  const room = (r: RoomSpec, h: number, thick = 0.4): void => {
    const H = fy(r);
    solid.block(r.w, 0.06, r.d, floorColor[r.id] ?? '#6b5640', r.cx, H - 0.04, r.cz);
    for (const side of ['n', 's', 'e', 'w'] as const) {
      const alongX = side === 'n' || side === 's';
      const len = alongX ? r.w : r.d;
      const fixed = side === 'n' ? r.cz + r.d / 2 : side === 's' ? r.cz - r.d / 2 : side === 'e' ? r.cx + r.w / 2 : r.cx - r.w / 2;
      const center = alongX ? r.cx : r.cz;
      const spans: [number, number][] = [];
      if (r.door.side === side) {
        const g0 = center + r.door.offset - r.door.width / 2;
        const g1 = center + r.door.offset + r.door.width / 2;
        spans.push([center - len / 2, g0], [g1, center + len / 2]);
        if (h > 2) {
          const mid = (g0 + g1) / 2;
          if (alongX) solid.block(r.door.width, h - 2.5, thick, wallColor[r.id] ?? '#ccc', mid, H + 2.5, fixed);
          else solid.block(thick, h - 2.5, r.door.width, wallColor[r.id] ?? '#ccc', fixed, H + 2.5, mid);
        }
      } else spans.push([center - len / 2, center + len / 2]);
      for (const [a, c] of spans) {
        const l = c - a;
        const mid = (a + c) / 2;
        if (alongX) {
          solid.block(l, h, thick, wallColor[r.id] ?? '#ccc', mid, H, fixed);
          colliders.push(box(mid, fixed, l / 2, thick / 2, h));
        } else {
          solid.block(thick, h, l, wallColor[r.id] ?? '#ccc', fixed, H, mid);
          colliders.push(box(fixed, mid, thick / 2, l / 2, h));
        }
      }
    }
  };
  room(HALL, WALL_H);
  room(HOME, WALL_H);
  room(OFFICE, WALL_H);
  room(COURT, 1.3, 0.5);

  // Lit windows in the walls (glow) so the street shows life behind them.
  const windowGlow = (x: number, y: number, z: number, alongX: boolean): void => {
    if (alongX) glow.box(1.1, 1.2, 0.12, GLOW_WARM, x, y, z);
    else glow.box(0.12, 1.2, 1.1, GLOW_WARM, x, y, z);
  };
  const hFloor = fy(HOME);
  windowGlow(HOME.cx - 6.02, hFloor + 1.8, HOME.cz - 2.6, false);
  windowGlow(HOME.cx - 6.02, hFloor + 1.8, HOME.cz + 2.6, false);
  windowGlow(OFFICE.cx - 3, fy(OFFICE) + 1.8, OFFICE.cz + 4.52, true);
  windowGlow(OFFICE.cx + 3, fy(OFFICE) + 1.8, OFFICE.cz + 4.52, true);
  windowGlow(HALL.cx - 5, fy(HALL) + 1.8, HALL.cz - 7.02, true);
  windowGlow(HALL.cx + 5, fy(HALL) + 1.8, HALL.cz - 7.02, true);

  // ---- Hall -----------------------------------------------------------------------------
  const hy = fy(HALL);
  // Planning table.
  solid.block(TABLE.hw * 2, 0.12, TABLE.hd * 2, '#6e4f34', TABLE.x, hy + 0.85, TABLE.z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) solid.block(0.22, 0.85, 0.22, '#5a412b', TABLE.x + sx * (TABLE.hw - 0.3), hy, TABLE.z + sz * (TABLE.hd - 0.3));
  solid.block(TABLE.hw * 2 - 0.4, 0.04, TABLE.hd * 2 - 0.4, '#d9ceb0', TABLE.x, hy + 0.97, TABLE.z);
  colliders.push(box(TABLE.x, TABLE.z, TABLE.hw + 0.1, TABLE.hd + 0.1, 1));
  // Card table.
  solid.block(CARD_TABLE.hw * 2, 0.1, CARD_TABLE.hd * 2, '#6e4f34', CARD_TABLE.x, hy + 0.8, CARD_TABLE.z);
  solid.block(CARD_TABLE.hw * 2 - 0.3, 0.8, 0.12, '#5a412b', CARD_TABLE.x, hy, CARD_TABLE.z);
  colliders.push(box(CARD_TABLE.x, CARD_TABLE.z, CARD_TABLE.hw, CARD_TABLE.hd, 1));
  // Folder cabinets, color-coded per party along the south wall.
  PARTIES.forEach((_, i) => {
    const x = STATION_X_OF_PARTY[i] ?? 0;
    solid.block(1.6, 1.5, 0.8, '#7b756a', x, hy, HALL.cz + HALL.d / 2 - 1);
    solid.block(1.62, 0.18, 0.82, PARTY_COLORS[i] ?? '#888', x, hy + 1.5, HALL.cz + HALL.d / 2 - 1);
    colliders.push(box(x, HALL.cz + HALL.d / 2 - 1, 0.8, 0.4, 1.7));
  });
  // Lamp and bookshelves.
  solid.block(0.1, 1.9, 0.1, '#3a3028', -9, hy, -49);
  glow.sphere(0.22, 8, 6, GLOW_WARM, -9, hy + 2, -49);
  solid.block(3, 2.2, 0.5, '#5a412b', 0, hy, HALL.cz - HALL.d / 2 + 0.5);
  colliders.push(box(0, HALL.cz - HALL.d / 2 + 0.5, 1.5, 0.3, 2.2));

  // ---- Square: note desk, radio, tally board, sign, benches, lamps ---------------------------
  const sy = world.terrain.heightAt(0, 2);
  solid.block(5, 0.1, 1.4, '#6e4f34', NOTE_DESK.x - 0.7, sy + 0.8, NOTE_DESK.z);
  solid.block(4.8, 0.8, 0.1, '#5a412b', NOTE_DESK.x - 0.7, sy, NOTE_DESK.z);
  colliders.push(box(NOTE_DESK.x - 0.7, NOTE_DESK.z, 2.5, 0.7, 1));
  solid.block(0.5, 0.2, 0.4, '#2e2a28', NOTE_DESK.typewriter.x, sy + 0.9, NOTE_DESK.z);
  // Radio on a small table.
  solid.block(1.4, 0.08, 0.9, '#6e4f34', RADIO.x, sy + 0.9, RADIO.z);
  solid.block(0.1, 0.9, 0.1, '#5a412b', RADIO.x - 0.5, sy, RADIO.z - 0.3);
  solid.block(0.1, 0.9, 0.1, '#5a412b', RADIO.x + 0.5, sy, RADIO.z + 0.3);
  solid.block(0.9, 0.5, 0.4, '#5a3a24', RADIO.x, sy + 0.98, RADIO.z);
  colliders.push(circle(RADIO.x, RADIO.z, 0.9, 1));
  // Tally board and sign.
  solid.block(0.1, 2.2, 0.1, '#4a3a2c', TALLY.x - 0.9, sy, TALLY.z);
  solid.block(0.1, 2.2, 0.1, '#4a3a2c', TALLY.x + 0.9, sy, TALLY.z);
  solid.block(2.1, 1.1, 0.1, '#2f3a34', TALLY.x, sy + 1.1, TALLY.z);
  colliders.push(box(TALLY.x, TALLY.z, 1, 0.2, 2));
  solid.block(0.12, 2.6, 0.12, '#4a3a2c', SIGN.x, world.terrain.heightAt(SIGN.x, SIGN.z), SIGN.z);
  for (const [dx, ry] of [[-0.55, 0.15], [0.55, -0.15]] as const) solid.box(1.0, 0.3, 0.06, '#c2b28a', SIGN.x + dx, world.terrain.heightAt(SIGN.x, SIGN.z) + 2.2, SIGN.z, ry);
  colliders.push(circle(SIGN.x, SIGN.z, 0.3, 2.6));
  // Street lamps.
  const lampPosts: [number, number][] = [[-6, -10], [6, -10], [-7, 8], [7, 8], [2.6, -26], [2.6, 18]];
  for (const [lx, lz] of lampPosts) {
    const gy = world.terrain.heightAt(lx, lz);
    solid.block(0.12, 3.4, 0.12, '#2f2c28', lx, gy, lz);
    glow.sphere(0.26, 8, 6, GLOW_WARM, lx, gy + 3.5, lz);
    colliders.push(circle(lx, lz, 0.2, 3.4));
  }

  // ---- Home ----------------------------------------------------------------------------
  const my = fy(HOME);
  solid.block(2.6, 0.1, 1.5, '#6e4f34', HOME.cx, my + 0.78, HOME.cz + 2.3);
  solid.block(2.4, 0.78, 0.1, '#5a412b', HOME.cx, my, HOME.cz + 2.3);
  colliders.push(box(HOME.cx, HOME.cz + 2.3, 1.3, 0.75, 1));
  solid.block(2.2, 0.5, 0.9, '#7c5a48', HOME.cx - 3.4, my, HOME.cz + 3.1);
  solid.block(2.2, 0.5, 0.2, '#6a4a3a', HOME.cx - 3.4, my + 0.5, HOME.cz + 3.45);
  colliders.push(box(HOME.cx - 3.4, HOME.cz + 3.1, 1.1, 0.45, 1));
  solid.block(1.3, 1.1, 0.45, '#5a412b', HOME.cx - 5.6, my, HOME.cz - 0.2);
  solid.block(0.5, 0.3, 0.3, '#5a3a24', HOME.cx - 5.6, my + 1.1, HOME.cz - 0.2);
  glow.box(0.32, 0.1, 0.05, GLOW_RADIO, HOME.cx - 5.35, my + 1.3, HOME.cz - 0.2);
  colliders.push(box(HOME.cx - 5.6, HOME.cz - 0.2, 0.65, 0.3, 1.5));
  solid.block(3.4, 0.02, 2.2, '#8a4f44', HOME.cx, my, HOME.cz + 0.6);
  glow.sphere(0.2, 8, 6, GLOW_WARM, HOME.cx + 4.8, my + 1.9, HOME.cz + 3.4);
  solid.block(0.08, 1.9, 0.08, '#3a3028', HOME.cx + 4.8, my, HOME.cz + 3.4);

  // ---- Office --------------------------------------------------------------------------
  const oy = fy(OFFICE);
  solid.block(3.2, 0.1, 1.4, '#4a3426', OFFICE.cx, oy + 0.8, OFFICE.cz + 2.8);
  solid.block(3.0, 0.8, 1.2, '#3e2c20', OFFICE.cx, oy, OFFICE.cz + 2.8);
  colliders.push(box(OFFICE.cx, OFFICE.cz + 2.8, 1.6, 0.7, 1));
  for (const x of [-4.8, -3.6, 3.6, 4.8]) {
    solid.block(1, 1.7, 0.6, '#6f7a74', OFFICE.cx + x, oy, OFFICE.cz + 3.9);
    colliders.push(box(OFFICE.cx + x, OFFICE.cz + 3.9, 0.5, 0.3, 1.7));
  }
  // Abstract wall map (no geography claimed).
  solid.box(2.6, 1.5, 0.06, '#d8cfb4', OFFICE.cx, oy + 2.2, OFFICE.cz + 4.45);
  solid.box(2.2, 1.1, 0.04, '#8c9a86', OFFICE.cx, oy + 2.2, OFFICE.cz + 4.42);
  glow.sphere(0.2, 8, 6, GLOW_WARM, OFFICE.cx + 1.4, oy + 1.2, OFFICE.cz + 2.8);

  // ---- Courtyard -----------------------------------------------------------------------
  const cy = fy(COURT);
  solid.block(5.5, 3.6, 0.8, '#bfae8c', COURT.cx + 1.6, cy, COURT.cz + COURT.d / 2 - 0.6);
  colliders.push(box(COURT.cx + 1.6, COURT.cz + COURT.d / 2 - 0.6, 2.75, 0.4, 3.6));
  glow.box(1.0, 1.1, 0.1, GLOW_WARM, COURT.cx + 0.4, cy + 2.1, COURT.cz + COURT.d / 2 - 1.02);
  glow.box(1.0, 1.1, 0.1, GLOW_WARM, COURT.cx + 2.9, cy + 2.1, COURT.cz + COURT.d / 2 - 1.02);
  solid.cyl(0.8, 0.9, 0.9, 10, '#9a8d76', COURT.cx + 4.4, cy + 0.45, COURT.cz - 2.4);
  colliders.push(circle(COURT.cx + 4.4, COURT.cz - 2.4, 0.95, 1));
  solid.block(2.6, 0.4, 0.5, '#6e4f34', COURT.cx - 1.8, cy, COURT.cz + 1.4);
  glow.sphere(0.2, 8, 6, GLOW_WARM, COURT.cx - 5.2, cy + 2.2, COURT.cz + 3);
  solid.block(0.08, 2.2, 0.08, '#3a3028', COURT.cx - 5.2, cy, COURT.cz + 3);

  // ---- Backdrop buildings and trees (kit) -----------------------------------------------
  const place = (g: THREE.BufferGeometry, x: number, z: number, ry: number, col?: Collider): void => {
    world.place(g, x, z, ry, col);
  };
  place(bauhausBlock({ era, seed: 'bh1', floors: 4 }), -32, 24, 0, box(-32, 24, 7, 5.5, 12));
  place(bauhausBlock({ era, seed: 'bh2', floors: 3 }), -50, 8, Math.PI / 2, box(-50, 8, 5.5, 7, 9));
  place(bauhausBlock({ era, seed: 'bh3', floors: 3 }), -48, -14, Math.PI / 2, box(-48, -14, 5.5, 7, 9));
  place(stoneVillageHouse({ era, seed: 'sh1', stories: 2 }), 46, 8, -Math.PI / 2, box(46, 8, 3.2, 3.2, 6));
  place(stoneVillageHouse({ era, seed: 'sh2' }), 38, 22, Math.PI, box(38, 22, 3.2, 3, 3.5));
  place(stoneVillageHouse({ era, seed: 'sh3', dome: true }), 22, 18, Math.PI, box(22, 18, 3.2, 3, 3.5));
  place(stoneVillageHouse({ era, seed: 'sh4' }), 44, -12, -Math.PI / 2, box(44, -12, 3.2, 3, 3.5));
  const trees: [number, number][] = [[-14, -16], [14, -18], [16, 14], [-16, 16], [24, -6], [-22, -8]];
  trees.forEach(([x, z], i) => place(oliveTree({ era, seed: 'ot' + String(i) }), x, z, i, circle(x, z, 0.6)));
  const cypress: [number, number][] = [[10, -28], [-10, -30], [8, 20], [-8, 22]];
  cypress.forEach(([x, z], i) => place(cypressTree({ era, seed: 'cy' + String(i) }), x, z, i, circle(x, z, 0.5)));
  place(oliveTree({ era, seed: 'court-olive' }), COURT.cx - 3.8, COURT.cz - 3.6, 0.7, circle(COURT.cx - 3.8, COURT.cz - 3.6, 0.6));

  // Merge the hand-built geometry: one solid mesh and one glow mesh.
  const solidMesh = new THREE.Mesh(bag.geometry(solid.build()), world.mats.solid);
  solidMesh.castShadow = quality.shadows;
  solidMesh.receiveShadow = true;
  solidMesh.matrixAutoUpdate = false;
  const glowMesh = new THREE.Mesh(bag.geometry(glow.build()), world.mats.glow);
  glowMesh.matrixAutoUpdate = false;
  world.scene.add(solidMesh, glowMesh);

  // Radio dial: its own glow material so the broadcast can brighten it.
  const dialMat = bag.material(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.0, 0.3), transparent: true, opacity: 0.55 }));
  const dial = new THREE.Mesh(bag.geometry(new THREE.PlaneGeometry(0.5, 0.18)), dialMat);
  dial.position.set(RADIO.x, sy + 1.2, RADIO.z - 0.21);
  dial.rotation.y = Math.PI;
  world.scene.add(dial);

  // ---- Map-table layers (schematic, flat, not geographic) --------------------------------
  const layerGroups: THREE.Group[] = [];
  const flat = (g: THREE.Group, w: number, d: number, x: number, z: number, color: string): void => {
    const m = bag.material(new THREE.MeshBasicMaterial({ color }));
    const mesh = new THREE.Mesh(bag.geometry(new THREE.BoxGeometry(w, 0.04, d)), m);
    mesh.position.set(x, 0, z);
    g.add(mesh);
  };
  const top = hy + 1.03;
  const mk = (build: (g: THREE.Group) => void): void => {
    const g = new THREE.Group();
    g.position.set(TABLE.x, top, TABLE.z);
    build(g);
    g.visible = false;
    world.scene.add(g);
    layerGroups.push(g);
  };
  // Zones: two proposed areas and a small separate square for Jerusalem.
  mk((g) => {
    flat(g, 1.5, 1.9, -0.9, 0, '#5f86b8');
    flat(g, 1.3, 1.9, 0.9, 0, '#6a9a62');
    flat(g, 0.3, 0.3, 0, 0, '#e0b84a');
  });
  // People and land: two pairs of bars, attributed in the subtitle.
  mk((g) => {
    flat(g, 0.5, 1.4, -1.4, 0, '#6a9a62');
    flat(g, 0.5, 0.49, -0.8, 0.455, '#5f86b8');
    flat(g, 0.5, 1.4, 0.8, 0, '#6a9a62');
    flat(g, 0.5, 0.1, 1.4, 0.65, '#5f86b8');
  });
  // Jerusalem: a gold ring-like frame alone.
  mk((g) => {
    flat(g, 1.1, 0.12, 0, -0.5, '#e0b84a');
    flat(g, 1.1, 0.12, 0, 0.5, '#e0b84a');
    flat(g, 0.12, 1.0, -0.55, 0, '#e0b84a');
    flat(g, 0.12, 1.0, 0.55, 0, '#e0b84a');
  });
  // Peel 1937, for comparison: a different arrangement.
  mk((g) => {
    flat(g, 1.0, 1.9, -1.2, 0, '#5f86b8');
    flat(g, 2.0, 1.9, 0.5, 0, '#6a9a62');
  });

  // Statement cards and the Jerusalem page (paper blocks that vanish when used).
  const cards: THREE.Mesh[] = CARD_SPOTS.map((p, i) => {
    const m = bag.material(new THREE.MeshStandardMaterial({ color: CARD_COLORS[i] ?? '#ddd', roughness: 0.9 }));
    const mesh = new THREE.Mesh(bag.geometry(new THREE.BoxGeometry(0.7, 0.04, 0.5)), m);
    mesh.position.set(p.x, hy + 0.87, -46.1);
    mesh.rotation.y = (i - 1.5) * 0.12;
    world.scene.add(mesh);
    return mesh;
  });
  const pageMat = bag.material(new THREE.MeshStandardMaterial({ color: '#e0b84a', roughness: 0.9 }));
  const page = new THREE.Mesh(bag.geometry(new THREE.BoxGeometry(0.7, 0.04, 0.5)), pageMat);
  page.position.set(NOTE_DESK.jerusalem.x, sy + 0.87, NOTE_DESK.z);
  world.scene.add(page);
  const points: THREE.Mesh[] = NOTE_POINTS.map((p, i) => {
    const m = bag.material(new THREE.MeshStandardMaterial({ color: CARD_COLORS[i] ?? '#ddd', roughness: 0.9 }));
    const mesh = new THREE.Mesh(bag.geometry(new THREE.BoxGeometry(0.4, 0.03, 0.34)), m);
    mesh.position.set(p.x, sy + 0.86, NOTE_DESK.z);
    mesh.rotation.y = (i - 1.5) * 0.1;
    world.scene.add(mesh);
    return mesh;
  });

  // ---- Light: warm points in each interior and at the radio --------------------------------
  const lights: THREE.PointLight[] = [];
  const addLight = (x: number, y: number, z: number, intensity: number, dist: number): THREE.PointLight => {
    const l = new THREE.PointLight('#ffcf8a', intensity, dist, 1.6);
    l.position.set(x, y, z);
    world.scene.add(l);
    lights.push(l);
    return l;
  };
  addLight(HALL.cx, hy + 3, HALL.cz, 70, 30);
  addLight(HOME.cx, my + 3, HOME.cz, 55, 22);
  addLight(OFFICE.cx, oy + 3, OFFICE.cz, 55, 22);
  addLight(COURT.cx, cy + 3.2, COURT.cz, 45, 22);
  const radioLight = addLight(RADIO.x, sy + 2.6, RADIO.z, 20, 14);
  addLight(2.6, sy + 3.6, -24, 10, 14);
  addLight(NOTE_DESK.x, sy + 2.6, NOTE_DESK.z, 12, 10);

  // ---- People --------------------------------------------------------------------------
  const figureMat = bag.track(new FigureMaterial());
  const variants = [...new Set(NPCS.map((n) => n.variant))];
  for (const v of variants) {
    const list = NPCS.filter((n) => n.variant === v);
    const crowd = new Crowd(bag.geometry(figureGeometry({ era, variant: v, seed: 'npc' + String(v) })), figureMat, list.length);
    crowd.mesh.castShadow = quality.shadows;
    list.forEach((n, i) => crowd.set(i, n.x, world.heightAt(n.x, n.z), n.z, Math.atan2(n.faceX - n.x, n.faceZ - n.z), 0, i * 1.7, n.scale ?? 1));
    crowd.setDirty();
    bag.track(crowd);
    world.scene.add(crowd.mesh);
  }
  world.onVisual((_dt, elapsed) => figureMat.update(elapsed));

  let radioLevel = 0;
  return {
    world,
    layerGroups,
    cards,
    page,
    points,
    colliders,
    floorY: fy,
    setRadio(level: number): void {
      radioLevel = level;
      dialMat.opacity = 0.55 + 0.45 * level;
      radioLight.intensity = 20 + 14 * level;
    },
    tick(elapsed: number, rm: boolean): void {
      const pulse = rm ? 0 : Math.sin(elapsed * 2.2) * 0.05 * (0.4 + radioLevel);
      dialMat.opacity = 0.55 + 0.45 * radioLevel + pulse;
    },
  };
}
