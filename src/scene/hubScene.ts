import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GameScene } from '../render/sceneManager';
import { applyEraLook, SkyDome } from '../world/eraLook';
import { GeoBuilder } from '../world/kit/builder';
import { bauhausBlock, ottomanBuilding, stoneVillageHouse } from '../world/kit/buildings';
import { Crowd, figureGeometry, FigureMaterial } from '../world/kit/figures';
import { createKitMaterials } from '../world/kit/materials';
import { cypressTree, palmTree } from '../world/kit/nature';
import { DEFAULT_WORLD_QUALITY, densityCount, type WorldQuality } from '../world/quality';
import { RELIEF_PINS, ReliefMaterial, reliefGeometry } from '../world/reliefMap';
import { ResourceBag } from '../world/resources';
import { bakePlacements } from '../world/scatter';
import { Rng } from '../world/rng';

/** Things in the hub the UI can point at (raycast targets carry userData.hubId). */
export type HubTargetId = 'map' | 'shelves' | 'window' | 'desk';

export interface HubTarget {
  readonly id: HubTargetId;
  readonly labelKey: string;
  readonly object: THREE.Object3D;
}

export interface HubScene extends GameScene {
  readonly targets: readonly HubTarget[];
  /** Map pins in world space with locale keys (for tooltips). */
  readonly pins: readonly { readonly id: string; readonly labelKey: string; readonly position: THREE.Vector3 }[];
  readonly resources: ResourceBag;
  /** Brightens the relief map (or nothing) to show focus. */
  setHighlight(id: HubTargetId | null): void;
  /** When true (default) the scene drives its own gentle camera drift. */
  autoCamera: boolean;
}

export interface HubOptions {
  readonly quality?: WorldQuality;
}

// Room layout (meters). Floor at y=0; the window looks out over the city from the back wall.
const ROOM = { minX: -9, maxX: 9, minZ: -12, maxZ: 10, height: 6.6 };
const WINDOW = { minX: -3.2, maxX: 3.2, minY: 1.3, maxY: 5.5 };
const TABLE = { x: 0, z: -2.2, w: 5.4, d: 3.4, h: 0.95 };
const MAP = { w: 4.7, d: 2.7, heightScale: 0.13 };
const CITY_GROUND = -9;

const WOOD_DARK = '#4a3122';
const WOOD = '#6b4a32';
const WOOD_WARM = '#7c5638';
const PLASTER = '#9a8670';
const STONE = '#b3a084';

function buildRoom(b: GeoBuilder, rng: Rng): void {
  const { minX, maxX, minZ, maxZ, height } = ROOM;
  const w = maxX - minX;
  const d = maxZ - minZ;
  // Plank floor.
  const planks = Math.round(w / 0.3);
  for (let i = 0; i < planks; i++) {
    const x = minX + (i + 0.5) * (w / planks);
    let z = minZ;
    while (z < maxZ - 0.01) {
      const len = Math.min(maxZ - z, rng.range(2.2, 4.4));
      b.box(w / planks - 0.012, 0.06, len - 0.01, rng.pick(['#5a3d2a', '#634330', '#553826', '#6b4935', '#5e4130']), x, -0.03, z + len / 2);
      z += len;
    }
  }
  // Rug under the table.
  b.box(TABLE.w + 2.2, 0.015, TABLE.d + 2.2, '#5b1f1c', TABLE.x, 0.008, TABLE.z);
  b.box(TABLE.w + 1.6, 0.017, TABLE.d + 1.6, '#7a2e25', TABLE.x, 0.01, TABLE.z);
  b.box(TABLE.w + 1.2, 0.019, TABLE.d + 1.2, '#6a2722', TABLE.x, 0.012, TABLE.z);
  // Back wall around the window.
  const t = 0.4;
  const z0 = minZ - t / 2;
  b.box(WINDOW.minX - minX, height, t, PLASTER, (minX + WINDOW.minX) / 2, height / 2, z0);
  b.box(maxX - WINDOW.maxX, height, t, PLASTER, (maxX + WINDOW.maxX) / 2, height / 2, z0);
  b.box(WINDOW.maxX - WINDOW.minX, WINDOW.minY, t, PLASTER, 0, WINDOW.minY / 2, z0);
  b.box(WINDOW.maxX - WINDOW.minX, height - WINDOW.maxY, t, PLASTER, 0, (height + WINDOW.maxY) / 2, z0);
  // Side and front walls with wood wainscot.
  b.box(t, height, d, PLASTER, minX - t / 2, height / 2, (minZ + maxZ) / 2);
  b.box(t, height, d, PLASTER, maxX + t / 2, height / 2, (minZ + maxZ) / 2);
  b.box(w + 2 * t, height, t, PLASTER, 0, height / 2, maxZ + t / 2);
  b.box(w, 1.1, 0.06, WOOD_DARK, 0, 0.55, minZ + 0.03);
  b.box(w, 1.1, 0.06, WOOD_DARK, 0, 0.55, maxZ - 0.03);
  b.box(w, 0.08, 0.1, WOOD, 0, 1.12, minZ + 0.05);
  // Ceiling with heavy beams.
  b.box(w + 2 * t, 0.3, d + 2 * t, '#3b2a20', 0, height + 0.15, (minZ + maxZ) / 2);
  for (let z = minZ + 1.5; z < maxZ; z += 2.6) b.box(w, 0.35, 0.3, WOOD_DARK, 0, height - 0.17, z);
  b.box(0.3, 0.3, d, WOOD_DARK, 0, height - 0.42, (minZ + maxZ) / 2);
  // Stone pillars framing the window and the hall.
  for (const x of [WINDOW.minX - 0.45, WINDOW.maxX + 0.45]) b.box(0.6, height, 0.5, STONE, x, height / 2, minZ + 0.1);
  for (const x of [-5.2, 5.2]) for (const z of [-7.5, 3.5]) {
    b.box(0.55, height, 0.55, STONE, x, height / 2, z);
    b.box(0.75, 0.25, 0.75, '#a08c70', x, 0.12, z);
    b.box(0.75, 0.25, 0.75, '#a08c70', x, height - 0.65, z);
  }
  // Window frame, mullions and a deep stone sill.
  const ww = WINDOW.maxX - WINDOW.minX;
  const wh = WINDOW.maxY - WINDOW.minY;
  const cy = (WINDOW.minY + WINDOW.maxY) / 2;
  b.box(ww + 0.3, 0.16, 0.7, STONE, 0, WINDOW.minY - 0.05, minZ + 0.1);
  for (const x of [WINDOW.minX, -ww / 6, ww / 6, WINDOW.maxX]) b.box(0.1, wh, 0.14, WOOD_DARK, x, cy, minZ - 0.1);
  for (const y of [WINDOW.minY + 0.05, WINDOW.minY + wh * 0.35, WINDOW.minY + wh * 0.7, WINDOW.maxY]) b.box(ww, 0.09, 0.14, WOOD_DARK, 0, y, minZ - 0.1);
}

interface ShelfSlot {
  x: number;
  y: number;
  z: number;
  /** +1 shelves on the left wall face +x, -1 on the right wall face -x. */
  facing: number;
}

function buildShelves(b: GeoBuilder, slots: ShelfSlot[]): void {
  const boards = [0.35, 1.05, 1.75, 2.45, 3.15, 3.85];
  const bay = 2.3;
  const depth = 0.5;
  for (const side of [-1, 1]) {
    const x = side === -1 ? ROOM.minX + depth / 2 + 0.05 : ROOM.maxX - depth / 2 - 0.05;
    for (let z = ROOM.minZ + 0.9; z + bay < ROOM.maxZ - 0.5; z += bay) {
      b.box(depth, 4.3, 0.07, WOOD, x, 2.15, z);
      b.box(depth, 4.3, 0.07, WOOD, x, 2.15, z + bay);
      b.box(0.04, 4.3, bay, WOOD_DARK, x + (side * depth) / 2, 2.15, z + bay / 2);
      b.box(depth + 0.06, 0.1, bay + 0.08, WOOD_DARK, x, 4.35, z + bay / 2);
      for (const y of boards) {
        b.box(depth, 0.05, bay, WOOD_WARM, x, y, z + bay / 2);
        for (let k = 0; k < 6; k++) slots.push({ x, y: y + 0.025, z: z + 0.22 + k * 0.37, facing: -side });
      }
    }
  }
}

function buildFurniture(b: GeoBuilder, rng: Rng): void {
  const { x, z, w, d, h } = TABLE;
  // Big map table: thick top, apron, turned legs.
  b.box(w, 0.1, d, WOOD_WARM, x, h - 0.05, z);
  b.box(w - 0.3, 0.16, d - 0.3, WOOD_DARK, x, h - 0.18, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.cyl(0.08, 0.11, h - 0.2, 6, WOOD_DARK, x + sx * (w / 2 - 0.3), (h - 0.2) / 2, z + sz * (d / 2 - 0.3));
  }
  // Brass frame around the relief.
  const fw = MAP.w + 0.16;
  const fd = MAP.d + 0.16;
  b.box(fw, 0.08, 0.08, '#8c6a32', x, h + 0.04, z - fd / 2);
  b.box(fw, 0.08, 0.08, '#8c6a32', x, h + 0.04, z + fd / 2);
  b.box(0.08, 0.08, fd, '#8c6a32', x - fw / 2, h + 0.04, z);
  b.box(0.08, 0.08, fd, '#8c6a32', x + fw / 2, h + 0.04, z);
  // Chairs around the table.
  for (const [cx, cz, ry] of [
    [-1.4, z + d / 2 + 0.7, 0],
    [1.4, z + d / 2 + 0.7, 0.1],
    [x - w / 2 - 0.7, z, Math.PI / 2],
    [x + w / 2 + 0.7, z + 0.4, -Math.PI / 2],
  ] as const) {
    const cosr = Math.cos(ry);
    const sinr = Math.sin(ry);
    const at = (lx: number, lz: number): [number, number] => [cx + lx * cosr + lz * sinr, cz - lx * sinr + lz * cosr];
    const [sx, sz] = at(0, 0);
    b.box(0.5, 0.06, 0.5, WOOD, sx, 0.48, sz, ry);
    for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] as const) {
      const [px, pz] = at(lx, lz);
      b.box(0.05, 0.48, 0.05, WOOD_DARK, px, 0.24, pz, ry);
    }
    const [bx, bz] = at(0, 0.23);
    b.box(0.5, 0.55, 0.05, WOOD, bx, 0.8, bz, ry);
  }
  // Reading desk by the right wall, with typewriter and paper stacks.
  const dx = 6.6;
  const dz = 6.0;
  b.box(1.0, 0.06, 2.0, WOOD_WARM, dx, 0.78, dz);
  b.box(0.9, 0.7, 0.05, WOOD_DARK, dx, 0.4, dz - 0.95);
  b.box(0.9, 0.7, 0.05, WOOD_DARK, dx, 0.4, dz + 0.95);
  b.box(0.42, 0.14, 0.38, '#2d2d2b', dx, 0.88, dz - 0.3, 0.1);
  b.box(0.36, 0.1, 0.06, '#3c3b38', dx, 0.98, dz - 0.42, 0.1);
  for (let i = 0; i < 5; i++) b.box(0.3, 0.012, 0.42, rng.pick(['#e8e1cf', '#ddd3bc', '#f0ead8']), dx + 0.1, 0.82 + i * 0.013, dz + 0.45, rng.range(-0.15, 0.15));
  // Banker's lamp base and stem (the shade glows separately).
  b.cyl(0.1, 0.12, 0.04, 8, '#8c6a32', dx - 0.25, 0.83, dz + 0.1);
  b.cyl(0.015, 0.015, 0.35, 4, '#8c6a32', dx - 0.25, 1.0, dz + 0.1);
  // Flat-file map chest on the left.
  b.box(1.2, 1.0, 2.0, WOOD, -6.9, 0.5, 6.4);
  for (let i = 0; i < 5; i++) b.box(0.02, 0.14, 1.8, WOOD_DARK, -6.29, 0.15 + i * 0.18, 6.4);
  // Rolled maps and document crates on the floor.
  for (let i = 0; i < 4; i++) b.cyl(0.05, 0.05, 1.0, 6, rng.pick(['#e0d4b4', '#cfc09c']), -6.6 + i * 0.12, 1.1, 6.0 + i * 0.25, 0, 0.2, Math.PI / 2);
  for (let i = 0; i < 4; i++) b.box(0.55, 0.4, 0.4, '#a58457', 3.6 + (i % 2) * 0.6, 0.2 + Math.floor(i / 2) * 0.4, -10.4, rng.range(-0.2, 0.2));
  // Library ladder leaning on the left shelves.
  for (const off of [-0.25, 0.25]) b.box(0.06, 4.4, 0.06, WOOD_DARK, -8.2, 2.15, -4.0 + off, 0, 0, -0.18);
  for (let i = 0; i < 11; i++) {
    const y = 0.3 + i * 0.38;
    b.box(0.05, 0.05, 0.5, WOOD_DARK, -8.2 + (y - 2.15) * 0.18, y, -4.0);
  }
  // Papers and open folders on the map table edge.
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    b.box(0.32, 0.01, 0.44, rng.pick(['#efe8d6', '#e5dcc6', '#d8cfb8']), x + side * (w / 2 - 0.22), h + 0.005 + i * 0.002, z - 0.8 + (i % 3) * 0.6, rng.range(-0.3, 0.3));
  }
}

function buildLampsGlow(glow: GeoBuilder, solid: GeoBuilder, lamps: readonly { x: number; z: number; drop: number }[]): void {
  for (const l of lamps) {
    const y = ROOM.height - l.drop;
    solid.cyl(0.012, 0.012, l.drop, 4, '#1e1a16', l.x, ROOM.height - l.drop / 2, l.z);
    solid.add(new THREE.CylinderGeometry(0.12, 0.55, 0.32, 12, 1), '#2f4a3a', l.x, y - 0.1, l.z);
    solid.add(new THREE.CylinderGeometry(0.56, 0.56, 0.03, 12, 1), '#c9a35a', l.x, y - 0.26, l.z);
    glow.sphere(0.11, 8, 6, [5.5, 3.6, 1.7], l.x, y - 0.2, l.z);
    glow.add(new THREE.CircleGeometry(0.5, 12), [1.2, 0.85, 0.45], l.x, y - 0.255, l.z, Math.PI / 2);
  }
}

/**
 * "The Archive" hub at night: a warm hall of shelves and document boxes around a big table with a
 * glowing relief map, pendant lamps, and a tall window onto a night city. Built from the world kit.
 */
export function createHubScene(opts: HubOptions = {}): HubScene {
  const quality = opts.quality ?? DEFAULT_WORLD_QUALITY;
  const bag = new ResourceBag();
  const rng = new Rng('archive-hub');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 400);
  const mats = bag.track(createKitMaterials());

  const hemi = new THREE.HemisphereLight();
  const moon = new THREE.DirectionalLight();
  moon.target.position.set(0, 0, -2);
  const sky = bag.track(new SkyDome(320));
  scene.add(hemi, moon, moon.target, sky.mesh);
  applyEraLook({ scene, sun: moon, hemi, sky, sunDistance: 60, fog: quality.fog }, 'archiveNight');
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.near = 30;
    scene.fog.far = 230;
  }
  hemi.intensity = 1.1;
  hemi.color.set('#6b5a4a');
  hemi.groundColor.set('#2a1c14');
  moon.intensity = 0.5;
  // Moonlight comes in through the window toward the table.
  moon.position.set(-6, 26, -60);

  // Static room, shelves and furniture: one merged lit mesh.
  const solid = new GeoBuilder({ jitter: 0.08, seed: 'hub-room' });
  const glow = new GeoBuilder({ seed: 'hub-glow' });
  buildRoom(solid, rng.fork('room'));
  const slots: ShelfSlot[] = [];
  buildShelves(solid, slots);
  buildFurniture(solid, rng.fork('furniture'));
  const lamps = [
    { x: 0, z: TABLE.z, drop: 2.6 },
    { x: -6.3, z: -0.5, drop: 2.0 },
    { x: 6.3, z: -5.5, drop: 2.0 },
  ];
  buildLampsGlow(glow, solid, lamps);
  // Banker's desk lamp shade (glowing green glass) and its bulb.
  glow.add(new THREE.CylinderGeometry(0.06, 0.16, 0.12, 10, 1, false, 0, Math.PI), [0.25, 1.4, 0.55], 6.6 - 0.25, 1.2, 6.1, 0, 0, Math.PI / 2);
  glow.sphere(0.04, 6, 4, [6, 4.5, 2.2], 6.6 - 0.25, 1.15, 6.1);
  const room = new THREE.Mesh(bag.geometry(solid.build()), mats.solid);
  room.name = 'archive-room';
  room.receiveShadow = true;
  room.castShadow = quality.shadows;
  room.matrixAutoUpdate = false;
  scene.add(room);

  // Document boxes and books: two instanced meshes with per-instance color.
  const boxGeo = bag.geometry(
    new GeoBuilder({ seed: 'docbox' })
      .box(0.3, 0.29, 0.36, '#ffffff', 0, 0.145, 0)
      .box(0.31, 0.06, 0.37, '#e8e8e8', 0, 0.27, 0)
      .box(0.012, 0.09, 0.14, '#fbf6e8', 0.155, 0.15, 0)
      .build(),
  );
  const bookGeo = bag.geometry(new GeoBuilder({ seed: 'book' }).box(0.3, 0.32, 0.07, '#ffffff', 0, 0.16, 0).box(0.008, 0.25, 0.05, '#f0e6c8', 0.152, 0.17, 0).build());
  const boxColors = ['#b08a5a', '#a17c4e', '#8f9aa5', '#6f7f8f', '#c2a06c', '#7b5a3a', '#9c8f7a'];
  const bookColors = ['#6b2a22', '#2e4a3a', '#2c3b5a', '#7a5a2a', '#4a2f3a', '#3b3b3b', '#8a6a3a'];
  const sr = rng.fork('shelves');
  const boxSlots: ShelfSlot[] = [];
  const bookSlots: ShelfSlot[] = [];
  for (const slot of slots) {
    const roll = sr.next();
    if (roll < 0.12) continue;
    (roll < 0.62 ? boxSlots : bookSlots).push(slot);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  const docs = new THREE.InstancedMesh(boxGeo, mats.solid, boxSlots.length);
  boxSlots.forEach((s, i) => {
    p.set(s.x, s.y, s.z);
    q.setFromAxisAngle(up, (s.facing > 0 ? 0 : Math.PI) + sr.range(-0.06, 0.06));
    docs.setMatrixAt(i, m4.compose(p, q, sc));
    docs.setColorAt(i, color.set(sr.pick(boxColors)));
  });
  const bookCount = bookSlots.length * 4;
  const books = new THREE.InstancedMesh(bookGeo, mats.solid, bookCount);
  bookSlots.forEach((s, i) => {
    for (let k = 0; k < 4; k++) {
      const lean = k === 3 && sr.chance(0.4) ? 0.25 : 0;
      p.set(s.x, s.y, s.z - 0.12 + k * 0.08);
      q.setFromAxisAngle(up, s.facing > 0 ? 0 : Math.PI);
      sc.set(1, sr.range(0.8, 1.05), 1);
      m4.compose(p, q, sc);
      if (lean !== 0) m4.multiply(new THREE.Matrix4().makeRotationX(lean * s.facing));
      books.setMatrixAt(i * 4 + k, m4);
      books.setColorAt(i * 4 + k, color.set(sr.pick(bookColors)));
    }
  });
  sc.set(1, 1, 1);
  for (const inst of [docs, books]) {
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.castShadow = quality.shadows;
    inst.receiveShadow = true;
    inst.matrixAutoUpdate = false;
    bag.track(inst);
    scene.add(inst);
  }
  docs.name = 'document-boxes';
  books.name = 'books';
  docs.userData.hubId = 'shelves';
  books.userData.hubId = 'shelves';

  // The glowing relief map.
  const relief = bag.track(new ReliefMaterial(MAP.heightScale, MAP.d));
  const mapMesh = new THREE.Mesh(bag.geometry(reliefGeometry(MAP.w, MAP.d, quality.tier >= 2 ? 120 : 80, quality.tier >= 2 ? 70 : 46, MAP.heightScale)), relief.material);
  mapMesh.position.set(TABLE.x, TABLE.h + 0.02 + MAP.heightScale * 0.25, TABLE.z);
  mapMesh.receiveShadow = true;
  mapMesh.name = 'relief-map';
  mapMesh.userData.hubId = 'map';
  mapMesh.matrixAutoUpdate = false;
  mapMesh.updateMatrix();
  scene.add(mapMesh);
  const pins = RELIEF_PINS.map((pin) => {
    const position = new THREE.Vector3(TABLE.x + (pin.u * MAP.w) / 2, TABLE.h + 0.25, TABLE.z + (pin.v * MAP.d) / 2);
    glow.cyl(0.012, 0.012, 0.22, 4, [2.2, 1.6, 0.8], position.x, position.y - 0.05, position.z);
    glow.sphere(0.035, 8, 6, [4.5, 3.2, 1.4], position.x, position.y + 0.07, position.z);
    return { id: pin.id, labelKey: pin.labelKey, position };
  });
  // Glowing seam inside the brass frame.
  const fw = MAP.w + 0.06;
  const fd = MAP.d + 0.06;
  const seam: [number, number, number] = [1.6, 0.95, 0.35];
  glow.box(fw, 0.012, 0.02, seam, TABLE.x, TABLE.h + 0.075, TABLE.z - fd / 2);
  glow.box(fw, 0.012, 0.02, seam, TABLE.x, TABLE.h + 0.075, TABLE.z + fd / 2);
  glow.box(0.02, 0.012, fd, seam, TABLE.x - fw / 2, TABLE.h + 0.075, TABLE.z);
  glow.box(0.02, 0.012, fd, seam, TABLE.x + fw / 2, TABLE.h + 0.075, TABLE.z);

  // Night city beyond the window: kit buildings merged into one mesh; lit windows into the glow mesh.
  const cityGeos: THREE.BufferGeometry[] = [];
  const cr = rng.fork('city');
  const cityGround = new GeoBuilder({ seed: 'city-ground' });
  cityGround.box(260, 0.5, 200, '#14161c', 0, CITY_GROUND - 0.25, -110);
  cityGeos.push(cityGround.build());
  const rows = [-30, -44, -60, -80, -105];
  const winColors: [number, number, number][] = [
    [2.6, 1.7, 0.75],
    [2.2, 1.9, 1.2],
    [1.4, 1.6, 1.9],
    [2.8, 1.5, 0.6],
  ];
  rows.forEach((rz, ri) => {
    const count = 6 + ri * 2;
    for (let i = 0; i < count; i++) {
      const x = (i / (count - 1) - 0.5) * (50 + ri * 34) + cr.range(-4, 4);
      if (ri === 0 && Math.abs(x) < 9) continue;
      const pick = cr.next();
      const g = pick < 0.5 ? bauhausBlock({ era: 'modern', seed: 'city-' + String(ri) + '-' + String(i) }) : pick < 0.75 ? ottomanBuilding({ era: 'modern', seed: 'oc-' + String(ri) + '-' + String(i) }) : stoneVillageHouse({ era: 'modern', seed: 'sv-' + String(ri) + '-' + String(i), stories: 2 });
      const ry = Math.round(cr.range(0, 3)) * (Math.PI / 2);
      const s = pick < 0.5 ? cr.range(0.9, 1.3) : cr.range(1.1, 1.6);
      const z = rz + cr.range(-3, 3);
      const [baked] = bakePlacements(g, [{ x, y: CITY_GROUND, z, ry, scale: s }]);
      g.dispose();
      if (!baked) continue;
      baked.computeBoundingBox();
      const bb = baked.boundingBox;
      cityGeos.push(baked);
      if (!bb) continue;
      // Lit windows on the face toward the archive (+z), floor by floor.
      const floors = Math.max(1, Math.floor((bb.max.y - CITY_GROUND - 1) / 3));
      const cols = Math.max(1, Math.floor((bb.max.x - bb.min.x) / 2.2));
      for (let f = 0; f < floors; f++) {
        for (let c = 0; c < cols; c++) {
          if (!cr.chance(0.38)) continue;
          const wx = bb.min.x + ((c + 0.5) * (bb.max.x - bb.min.x)) / cols;
          glow.box(1.0, 1.2, 0.05, cr.pick(winColors), wx, CITY_GROUND + 1.9 + f * 3, bb.max.z + 0.12);
        }
      }
    }
  });
  // Palms and cypresses along the street below, and street lamps.
  for (let i = 0; i < 8; i++) {
    const x = -36 + i * 10 + cr.range(-1.5, 1.5);
    const g = i % 3 === 0 ? cypressTree({ era: 'modern', seed: 'cc' + String(i) }) : palmTree({ era: 'modern', seed: 'cp' + String(i) });
    cityGeos.push(...bakePlacements(g, [{ x, y: CITY_GROUND, z: -22, ry: cr.range(0, 6.28), scale: 1 }]));
    g.dispose();
    glow.sphere(0.25, 6, 4, [3.5, 2.4, 1.1], x + 5, CITY_GROUND + 5.5, -21);
  }
  const city = new THREE.Mesh(bag.geometry(mergeGeometries(cityGeos)), mats.solid);
  for (const g of cityGeos) g.dispose();
  city.name = 'night-city';
  city.userData.hubId = 'window';
  city.matrixAutoUpdate = false;
  scene.add(city);

  const glowMesh = new THREE.Mesh(bag.geometry(glow.build()), mats.glow);
  glowMesh.name = 'glow';
  glowMesh.matrixAutoUpdate = false;
  scene.add(glowMesh);

  // Window glass: a faint cool reflection layer (transparent, single pass).
  const paneMat = bag.material(new THREE.MeshStandardMaterial({ color: '#9fb8d8', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.12, depthWrite: false }));
  const panes = new THREE.Mesh(bag.geometry(new THREE.PlaneGeometry(WINDOW.maxX - WINDOW.minX, WINDOW.maxY - WINDOW.minY)), paneMat);
  panes.position.set(0, (WINDOW.minY + WINDOW.maxY) / 2, ROOM.minZ - 0.1);
  panes.name = 'window';
  panes.userData.hubId = 'window';
  panes.matrixAutoUpdate = false;
  panes.updateMatrix();
  scene.add(panes);

  // Stars above the city (particle density follows settings).
  const starCount = densityCount(700, quality.particles);
  const starPos = new Float32Array(Math.max(1, starCount) * 3);
  const st = rng.fork('stars');
  for (let i = 0; i < starCount; i++) {
    const a = st.range(-1.1, 1.1);
    const e = st.range(0.08, 0.9);
    starPos[i * 3] = Math.sin(a) * Math.cos(e) * 280;
    starPos[i * 3 + 1] = Math.sin(e) * 280;
    starPos[i * 3 + 2] = -Math.cos(a) * Math.cos(e) * 280;
  }
  const starGeo = bag.geometry(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setDrawRange(0, starCount);
  const stars = new THREE.Points(starGeo, bag.material(new THREE.PointsMaterial({ color: '#dfe6ff', size: 1.1, sizeAttenuation: false, fog: false })));
  stars.visible = starCount > 0;
  stars.frustumCulled = false;
  scene.add(stars);

  // Dust motes drifting in the lamp light over the table.
  const dustCount = densityCount(420, quality.particles);
  const dustBase = new Float32Array(Math.max(1, dustCount) * 3);
  const dustPos = new Float32Array(Math.max(1, dustCount) * 3);
  const dr = rng.fork('dust');
  for (let i = 0; i < dustCount; i++) {
    const a = dr.range(0, Math.PI * 2);
    const r = Math.sqrt(dr.next()) * 2.6;
    dustBase[i * 3] = TABLE.x + Math.cos(a) * r;
    dustBase[i * 3 + 1] = dr.range(1.1, 4.0);
    dustBase[i * 3 + 2] = TABLE.z + Math.sin(a) * r;
  }
  dustPos.set(dustBase);
  const dustGeo = bag.geometry(new THREE.BufferGeometry());
  const dustAttr = new THREE.BufferAttribute(dustPos, 3);
  dustGeo.setAttribute('position', dustAttr);
  dustGeo.setDrawRange(0, dustCount);
  const dust = new THREE.Points(
    dustGeo,
    bag.material(new THREE.PointsMaterial({ color: '#ffd9a0', size: 0.022, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })),
  );
  dust.visible = dustCount > 0;
  dust.frustumCulled = false;
  scene.add(dust);

  // The night archivist (fictional composite guide) reading by the shelves: one instanced figure.
  const figMat = bag.track(new FigureMaterial());
  const archivist = bag.track(new Crowd(figureGeometry({ era: 'archiveNight', variant: 1, seed: 'noa' }), figMat, 1));
  archivist.set(0, -6.9, 0, -1.2, 1.25, 0, 0.7, 1);
  archivist.setDirty();
  archivist.mesh.castShadow = quality.shadows;
  scene.add(archivist.mesh);

  // Lights: warm key over the table (shadowed on medium+), aisle and desk lamps by tier.
  const key = new THREE.SpotLight('#ffcf8a', 60, 14, 0.85, 0.55, 2);
  const keyLamp = lamps[0] ?? { x: 0, z: TABLE.z, drop: 2.6 };
  key.position.set(keyLamp.x, ROOM.height - keyLamp.drop - 0.2, keyLamp.z);
  key.target.position.set(TABLE.x, 0, TABLE.z);
  key.castShadow = quality.shadows;
  if (quality.shadows) {
    const size = quality.tier >= 3 ? 2048 : 1024;
    key.shadow.mapSize.set(size, size);
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    key.shadow.camera.near = 0.3;
  }
  scene.add(key, key.target);
  const mapGlow = new THREE.PointLight('#7fd6ff', 2.2, 4.5, 2);
  mapGlow.position.set(TABLE.x, TABLE.h + 0.9, TABLE.z);
  scene.add(mapGlow);
  const aisle: THREE.PointLight[] = [];
  const aisleCount = quality.tier >= 3 ? 2 : quality.tier >= 2 ? 1 : 0;
  for (let i = 0; i < aisleCount; i++) {
    const l = lamps[i + 1];
    if (!l) continue;
    const light = new THREE.PointLight('#ffbf73', 45, 12, 2);
    light.position.set(l.x, ROOM.height - l.drop - 0.25, l.z);
    aisle.push(light);
    scene.add(light);
  }
  if (quality.tier >= 3) {
    const desk = new THREE.PointLight('#c8ffb0', 3.5, 4, 2);
    desk.position.set(6.35, 1.1, 6.1);
    scene.add(desk);
  } else {
    // Without aisle lights, lift the fill so the shelves still read.
    hemi.intensity = 1.8;
  }

  const targets: HubTarget[] = [
    { id: 'map', labelKey: 'world.hub.map', object: mapMesh },
    { id: 'shelves', labelKey: 'world.hub.shelves', object: docs },
    { id: 'window', labelKey: 'world.hub.window', object: panes },
    { id: 'desk', labelKey: 'world.hub.desk', object: room },
  ];

  const lookTarget = new THREE.Vector3(TABLE.x, TABLE.h + 0.1, TABLE.z - 0.6);
  let highlightTarget = 0;
  const hub: HubScene = {
    scene,
    camera,
    targets,
    pins,
    resources: bag,
    autoCamera: true,
    setHighlight(id) {
      highlightTarget = id === 'map' ? 1 : 0;
    },
    update(dt, elapsed) {
      relief.update(elapsed);
      figMat.update(elapsed);
      const hl = relief.uniforms.uHighlight;
      hl.value += (highlightTarget - hl.value) * Math.min(1, dt * 4);
      mapGlow.intensity = 2.0 + Math.sin(elapsed * 1.7) * 0.25 + hl.value * 2;
      for (let i = 0; i < aisle.length; i++) {
        const light = aisle[i];
        if (light) light.intensity = 45 + Math.sin(elapsed * 2.3 + i * 4.1) * 0.8;
      }
      for (let i = 0; i < dustCount; i++) {
        const k = i * 3;
        const ph = i * 0.37;
        dustPos[k] = (dustBase[k] ?? 0) + Math.sin(elapsed * 0.11 + ph) * 0.35;
        dustPos[k + 1] = (dustBase[k + 1] ?? 0) + Math.sin(elapsed * 0.07 + ph * 1.3) * 0.25;
        dustPos[k + 2] = (dustBase[k + 2] ?? 0) + Math.cos(elapsed * 0.09 + ph) * 0.35;
      }
      if (dustCount > 0) dustAttr.needsUpdate = true;
      if (hub.autoCamera) {
        const a = Math.sin(elapsed * 0.045) * 0.32;
        camera.position.set(TABLE.x + Math.sin(a) * 8.6, 3.5 + Math.sin(elapsed * 0.09) * 0.15, TABLE.z + Math.cos(a) * 8.6);
        camera.lookAt(lookTarget);
      }
      sky.update(camera);
    },
    resize(width, height) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    dispose() {
      // Lights own their shadow-map render targets.
      scene.traverse((o) => {
        if (o instanceof THREE.Light) o.dispose();
      });
      bag.dispose();
      scene.clear();
    },
  };
  hub.update(0, 0);
  return hub;
}
