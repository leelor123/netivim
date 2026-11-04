import * as THREE from 'three';
import { box, circle } from '../../../gameplay/core/collision';
import type { LevelWorld } from '../../../gameplay/runtime/levelKit';
import { GeoBuilder } from '../../../world/kit/builder';
import { cypressTree } from '../../../world/kit/nature';
import { Rng } from '../../../world/rng';
import { FURNITURE as F, ROOM, SPOTS } from './layout';

const WOOD_DARK = '#4a3122';
const WOOD = '#6b4a32';
const WOOD_WARM = '#7c5638';
const PLASTER = '#9a8670';
const STONE = '#b3a084';
const PAPER = '#efe4c9';

/** Moving / glowing parts the level animates; everything is owned by the world's ResourceBag. */
export interface ArchiveRoom {
  readonly lampGlow: THREE.Mesh;
  readonly lampLight: THREE.PointLight;
  readonly drawer: THREE.Mesh;
  readonly ledgerGlow: THREE.Mesh;
  readonly cabinetDoor: THREE.Group;
  readonly lensA: THREE.Mesh;
  readonly lensB: THREE.Mesh;
  readonly tableSheet: THREE.Mesh;
  readonly tableGlow: THREE.Mesh;
  readonly tableLight: THREE.PointLight;
  readonly guides: { readonly noa: THREE.Vector3; readonly samir: THREE.Vector3 };
  readonly lights: readonly THREE.Light[];
}

function mesh(world: LevelWorld, g: THREE.BufferGeometry, glow = false): THREE.Mesh {
  const m = new THREE.Mesh(world.bag.geometry(g), glow ? world.mats.glow : world.mats.solid);
  world.scene.add(m);
  return m;
}

function bookcase(b: GeoBuilder, x: number, z: number, len: number, facing: number, rng: Rng): void {
  const depth = 0.5;
  const h = 3.6;
  b.box(depth, h, 0.07, WOOD, x, h / 2, z - len / 2);
  b.box(depth, h, 0.07, WOOD, x, h / 2, z + len / 2);
  b.box(0.04, h, len, WOOD_DARK, x - facing * (depth / 2 - 0.02), h / 2, z);
  b.box(depth + 0.06, 0.1, len + 0.1, WOOD_DARK, x, h + 0.05, z);
  const palette = ['#6b2a22', '#2e4a3a', '#2c3b5a', '#7a5a2a', '#4a2f3a', '#8a6a3a', '#b08a5a', '#8f9aa5'];
  for (let s = 0; s < 6; s++) {
    const y = 0.3 + s * 0.6;
    b.box(depth, 0.05, len, WOOD_WARM, x, y, z);
    let zz = z - len / 2 + 0.12;
    while (zz < z + len / 2 - 0.3) {
      const w = rng.range(0.18, 0.4);
      const bh = rng.range(0.28, 0.5);
      b.box(depth * 0.7, bh, w, rng.pick(palette), x + facing * 0.04, y + 0.025 + bh / 2, zz + w / 2);
      zz += w + 0.02;
    }
  }
}

function desk(b: GeoBuilder, x: number, z: number, hw: number, hd: number): void {
  b.box(hw * 2, 0.08, hd * 2, WOOD_WARM, x, 0.78, z);
  b.box(hw * 2 - 0.2, 0.14, hd * 2 - 0.2, WOOD_DARK, x, 0.67, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, 0.74, 0.08, WOOD_DARK, x + sx * (hw - 0.1), 0.37, z + sz * (hd - 0.1));
}

/**
 * The night archive: hub-style warm hall (plank floor, beams, pendant lamps, bookcases, a tall
 * window onto the night) around a small playable route, plus a stone porch outside.
 */
export function buildArchiveRoom(world: LevelWorld): ArchiveRoom {
  // Interior floor must be flat: hide the terrain and use a level plane for walking.
  world.terrain.group.visible = false;
  world.heightAt = () => 0;
  const rng = new Rng('archive-night');
  const { minX, maxX, minZ, maxZ, height, doorHalf, wall } = ROOM;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const q = world.opts.quality;

  const shell = new GeoBuilder({ jitter: 0.08, seed: 'an-shell' });
  const props = new GeoBuilder({ jitter: 0.06, seed: 'an-props' });
  const glow = new GeoBuilder({ seed: 'an-glow' });

  // Plank floor and rug.
  const planks = Math.round(w / 0.3);
  const fr = rng.fork('floor');
  for (let i = 0; i < planks; i++) {
    const x = minX + (i + 0.5) * (w / planks);
    let z = minZ;
    while (z < maxZ - 0.01) {
      const len = Math.min(maxZ - z, fr.range(2.2, 4.4));
      shell.box(w / planks - 0.012, 0.06, len - 0.01, fr.pick(['#5a3d2a', '#634330', '#553826', '#6b4935', '#5e4130']), x, -0.03, z + len / 2);
      z += len;
    }
  }
  shell.box(7, 0.015, 15, '#5b1f1c', 0, 0.008, 6);
  shell.box(6.5, 0.017, 14.5, '#7a2e25', 0, 0.01, 6);
  shell.box(6, 0.019, 14, '#6a2722', 0, 0.012, 6);
  // Outside: dark street stone and the porch slabs.
  shell.box(70, 0.4, 70, '#15171d', 0, -0.25, -20);
  shell.box(12, 0.12, 8.4, '#6f6859', 0, -0.04, -10.2);
  for (let i = 0; i < 6; i++) shell.box(1.9, 0.02, 8.2, i % 2 ? '#7d7565' : '#736c5d', -5 + i * 2, 0.025, -10.2);

  // Walls: front wall with the door gap, sides, back, ceiling with beams.
  const t = wall;
  const zf = minZ - t / 2;
  shell.box(maxX - doorHalf, height, t, PLASTER, (maxX + doorHalf) / 2, height / 2, zf);
  shell.box(maxX - doorHalf, height, t, PLASTER, (minX - doorHalf) / 2, height / 2, zf);
  shell.box(doorHalf * 2 + 0.4, height - 3.1, t, PLASTER, 0, (height + 3.1) / 2, zf);
  shell.box(0.25, 3.1, t + 0.1, WOOD_DARK, -doorHalf - 0.1, 1.55, zf);
  shell.box(0.25, 3.1, t + 0.1, WOOD_DARK, doorHalf + 0.1, 1.55, zf);
  shell.box(t, height, d, PLASTER, minX - t / 2, height / 2, (minZ + maxZ) / 2);
  shell.box(t, height, d, PLASTER, maxX + t / 2, height / 2, (minZ + maxZ) / 2);
  shell.box(w + 2 * t, height, t, PLASTER, 0, height / 2, maxZ + t / 2);
  shell.box(w, 1.1, 0.06, WOOD_DARK, 0, 0.55, maxZ - 0.03);
  shell.box(0.06, 1.1, d, WOOD_DARK, minX + 0.03, 0.55, (minZ + maxZ) / 2);
  shell.box(0.06, 1.1, d, WOOD_DARK, maxX - 0.03, 0.55, (minZ + maxZ) / 2);
  shell.box(w + 2 * t, 0.3, d + 2 * t, '#3b2a20', 0, height + 0.15, (minZ + maxZ) / 2);
  for (let z = minZ + 1.5; z < maxZ; z += 2.6) shell.box(w, 0.35, 0.3, WOOD_DARK, 0, height - 0.17, z);
  shell.box(0.3, 0.3, d, WOOD_DARK, 0, height - 0.42, (minZ + maxZ) / 2);
  for (const x of [-5.2, 5.2]) for (const z of [-2, 7, 13]) {
    shell.box(0.55, height, 0.55, STONE, x, height / 2, z);
    shell.box(0.75, 0.25, 0.75, '#a08c70', x, 0.12, z);
    shell.box(0.75, 0.25, 0.75, '#a08c70', x, height - 0.65, z);
  }
  // Tall back window onto the night.
  shell.box(4.0, 0.16, 0.5, STONE, 0, 1.25, maxZ - 0.1);
  for (const x of [-2.1, 2.1]) shell.box(0.2, 3.4, 0.4, STONE, x, 3.0, maxZ - 0.1);
  glow.box(3.8, 3.2, 0.06, [0.25, 0.4, 0.85], 0, 3.0, maxZ - 0.03);
  for (const x of [-1.2, 0, 1.2]) props.box(0.07, 3.2, 0.1, WOOD_DARK, x, 3.0, maxZ - 0.1);
  for (const y of [2.0, 3.0, 4.0]) props.box(3.8, 0.07, 0.1, WOOD_DARK, 0, y, maxZ - 0.1);
  // Door leaf stands open and a warm spill of light on the porch.
  props.box(0.08, 3.0, 1.2, WOOD, -doorHalf + 0.1, 1.5, minZ + 0.7);
  glow.box(2.4, 0.01, 4, [1.1, 0.7, 0.3], 0, 0.04, -8);

  // Furniture with colliders.
  const cols = world.colliders;
  const wallH = height;
  cols.push(box((maxX + doorHalf) / 2, minZ - t / 2, (maxX - doorHalf) / 2, t / 2, wallH));
  cols.push(box((minX - doorHalf) / 2, minZ - t / 2, (maxX - doorHalf) / 2, t / 2, wallH));
  cols.push(box(minX - t / 2, (minZ + maxZ) / 2, t / 2, d / 2, wallH));
  cols.push(box(maxX + t / 2, (minZ + maxZ) / 2, t / 2, d / 2, wallH));
  cols.push(box(0, maxZ + t / 2, w / 2, t / 2, wallH));
  // Porch rail and street lamp posts keep the player on the stone.
  cols.push(box(-6.2, -10.2, 0.2, 4.2, 1.2));
  cols.push(box(6.2, -10.2, 0.2, 4.2, 1.2));
  cols.push(box(0, -14.4, 6.2, 0.2, 1.2));
  for (const sx of [-1, 1]) {
    props.box(0.25, 1.1, 8.4, STONE, sx * 6.2, 0.55, -10.2);
  }
  props.box(12.4, 1.1, 0.25, STONE, 0, 0.55, -14.4);
  props.box(0.14, 3.2, 0.14, '#1e1a16', 3.5, 1.6, -8.2);
  glow.sphere(0.2, 8, 6, [4.5, 3.0, 1.3], 3.5, 3.3, -8.2);

  // Bookcases along the walls (kept clear of the interaction spots).
  const br = rng.fork('books');
  const cases: readonly (readonly [number, number, number, number])[] = [
    [minX + 0.4, -3, 3.2, 1],
    [minX + 0.4, 6.2, 3.2, 1],
    [minX + 0.4, 10, 2.4, 1],
    [maxX - 0.4, -3, 3.2, -1],
    [maxX - 0.4, 12, 3.4, -1],
  ];
  for (const [x, z, len, facing] of cases) {
    bookcase(props, x, z, len, facing, br);
    cols.push(box(x, z, 0.3, len / 2, 3.6));
  }

  // Reading desk with the banker's lamp (shade is dynamic).
  desk(props, F.lampDesk.x, F.lampDesk.z, F.lampDesk.hw, F.lampDesk.hd);
  cols.push(box(F.lampDesk.x, F.lampDesk.z, F.lampDesk.hw, F.lampDesk.hd, 1));
  props.cyl(0.1, 0.12, 0.04, 8, '#8c6a32', F.lampDesk.x - 0.3, 0.84, F.lampDesk.z);
  props.cyl(0.015, 0.015, 0.35, 4, '#8c6a32', F.lampDesk.x - 0.3, 1.0, F.lampDesk.z);
  for (let i = 0; i < 4; i++) props.box(0.3, 0.012, 0.42, rng.pick(['#e8e1cf', '#ddd3bc', '#f0ead8']), F.lampDesk.x + 0.5, 0.83 + i * 0.013, F.lampDesk.z + 0.1, rng.range(-0.3, 0.3));
  props.box(0.5, 0.05, 0.4, '#2d2d2b', F.lampDesk.x + 0.2, 0.84, F.lampDesk.z - 0.1);
  const lampG = new GeoBuilder({ seed: 'an-lamp' });
  lampG.add(new THREE.CylinderGeometry(0.06, 0.18, 0.14, 10, 1, false, 0, Math.PI), [0.25, 1.4, 0.55], 0, 0, 0, 0, 0, Math.PI / 2);
  lampG.sphere(0.05, 6, 4, [6, 4.5, 2.2], 0.02, -0.04, 0);
  const lampGlow = mesh(world, lampG.build(), true);
  lampGlow.position.set(F.lampDesk.x - 0.3, 1.2, F.lampDesk.z);
  lampGlow.visible = false;
  // Unlit shade (visible while the lamp is off).
  props.add(new THREE.CylinderGeometry(0.06, 0.18, 0.14, 10, 1, false, 0, Math.PI), '#2f4a3a', F.lampDesk.x - 0.3, 1.2, F.lampDesk.z, 0, 0, Math.PI / 2);

  // Drawer cabinet; the drawer front slides out.
  desk(props, F.drawerCabinet.x, F.drawerCabinet.z, F.drawerCabinet.hw, F.drawerCabinet.hd);
  props.box(F.drawerCabinet.hw * 2, 0.5, F.drawerCabinet.hd * 2, WOOD, F.drawerCabinet.x, 0.4, F.drawerCabinet.z);
  cols.push(box(F.drawerCabinet.x, F.drawerCabinet.z, F.drawerCabinet.hw, F.drawerCabinet.hd, 1));
  const drawerG = new GeoBuilder({ seed: 'an-drawer', jitter: 0.06 });
  drawerG.box(1.4, 0.3, 0.06, WOOD_WARM, 0, 0, 0).box(0.14, 0.04, 0.05, '#8c6a32', 0, 0, -0.05);
  // cardamom tin inside, visible when open
  drawerG.cyl(0.09, 0.09, 0.07, 10, '#9a6b2a', 0.3, 0.02, 0.2);
  const drawer = mesh(world, drawerG.build());
  drawer.position.set(F.drawerCabinet.x, 0.4, F.drawerCabinet.z - F.drawerCabinet.hd - 0.03);

  // Ledger desk with the railway ledger; a blue glow marks it until scanned.
  desk(props, F.ledgerDesk.x, F.ledgerDesk.z, F.ledgerDesk.hw, F.ledgerDesk.hd);
  cols.push(box(F.ledgerDesk.x, F.ledgerDesk.z, F.ledgerDesk.hw, F.ledgerDesk.hd, 1));
  props.box(0.5, 0.06, 0.38, '#2c3b5a', F.ledgerDesk.x, 0.85, F.ledgerDesk.z);
  props.box(0.46, 0.03, 0.34, PAPER, F.ledgerDesk.x, 0.895, F.ledgerDesk.z);
  props.cyl(0.07, 0.05, 0.1, 8, '#d8d2c4', F.ledgerDesk.x + 0.7, 0.87, F.ledgerDesk.z - 0.1);
  const ledgerG = new GeoBuilder({ seed: 'an-ledger' });
  ledgerG.box(0.58, 0.01, 0.46, [0.3, 0.9, 1.7], 0, 0, 0);
  const ledgerGlow = mesh(world, ledgerG.build(), true);
  ledgerGlow.position.set(F.ledgerDesk.x, 0.925, F.ledgerDesk.z);

  // Two Lenses stand: a bench with an amber and a blue lens on brass stands.
  desk(props, F.lensStand.x, F.lensStand.z, F.lensStand.hw, F.lensStand.hd);
  cols.push(box(F.lensStand.x, F.lensStand.z, F.lensStand.hw, F.lensStand.hd, 1));
  const lensGeo = (c: [number, number, number]): THREE.BufferGeometry => {
    const g = new GeoBuilder({ seed: 'an-lens' });
    g.cyl(0.02, 0.02, 0.3, 6, '#8c6a32', 0, 0.15, 0);
    g.add(new THREE.TorusGeometry(0.2, 0.025, 6, 20), '#8c6a32', 0, 0.45, 0);
    g.add(new THREE.CircleGeometry(0.18, 20), c, 0, 0.45, 0, 0, Math.PI, 0);
    return g.build();
  };
  const lensA = mesh(world, lensGeo([2.2, 1.3, 0.35]), true);
  lensA.position.set(SPOTS.lensA.x, 0.82, F.lensStand.z);
  const lensB = mesh(world, lensGeo([0.5, 1.2, 2.2]), true);
  lensB.position.set(SPOTS.lensB.x, 0.82, F.lensStand.z);

  // Locked document cabinet with an opening door.
  const dc = F.docCabinet;
  props.box(dc.hw * 2, 2.0, dc.hd * 2, WOOD, dc.x, 1.0, dc.z);
  props.box(dc.hw * 2 + 0.1, 0.1, dc.hd * 2 + 0.1, WOOD_DARK, dc.x, 2.05, dc.z);
  props.box(dc.hw * 2 - 0.3, 1.7, 0.06, '#1d140e', dc.x, 1.0, dc.z - dc.hd + 0.02);
  props.box(dc.hw * 2 - 0.5, 0.04, dc.hd, PAPER, dc.x, 0.7, dc.z - 0.1);
  cols.push(box(dc.x, dc.z, dc.hw, dc.hd, 2.1));
  const doorG = new GeoBuilder({ seed: 'an-door', jitter: 0.06 });
  doorG.box(dc.hw - 0.05, 1.8, 0.06, WOOD_WARM, (dc.hw - 0.05) / 2, 0, 0).box(0.08, 0.2, 0.06, '#8c6a32', dc.hw - 0.25, 0, -0.04);
  const cabinetDoor = new THREE.Group();
  cabinetDoor.add(mesh(world, doorG.build()));
  cabinetDoor.position.set(dc.x - dc.hw, 1.0, dc.z - dc.hd - 0.03);
  world.scene.add(cabinetDoor);

  // Labels table with three trays, the sheet and its glow.
  const lt = F.labelsTable;
  desk(props, lt.x, lt.z, lt.hw, lt.hd);
  cols.push(box(lt.x, lt.z, lt.hw, lt.hd, 1));
  const trayColors = ['#2f5d3a', '#7a5a1d', '#5a3d6b'];
  trayColors.forEach((c, i) => {
    const tx = lt.x + (i - 1) * 1.1;
    props.box(0.9, 0.06, 0.7, c, tx, 0.84, lt.z + 0.1);
    props.box(0.8, 0.02, 0.6, '#d9ceb0', tx, 0.875, lt.z + 0.1);
  });
  const sheetG = new GeoBuilder({ seed: 'an-sheet' });
  sheetG.box(0.34, 0.012, 0.48, PAPER, 0, 0, 0);
  const tableSheet = mesh(world, sheetG.build());
  tableSheet.position.set(lt.x, 0.905, lt.z - 0.7);
  const tableGlowG = new GeoBuilder({ seed: 'an-tglow' });
  tableGlowG.box(0.4, 0.01, 0.54, [2.4, 1.9, 1.0], 0, 0, 0);
  const tableGlow = mesh(world, tableGlowG.build(), true);
  tableGlow.position.set(lt.x, 0.9, lt.z - 0.7);
  tableGlow.visible = false;

  // Pendant lamps (glow only) and a few ladders / crates for the lived-in feel.
  for (const [x, z, drop] of [[0, 5, 2.4], [0, 11, 2.2], [0, -1, 2.2]] as const) {
    const y = height - drop;
    props.cyl(0.012, 0.012, drop, 4, '#1e1a16', x, height - drop / 2, z);
    props.add(new THREE.CylinderGeometry(0.12, 0.55, 0.32, 12, 1), '#2f4a3a', x, y - 0.1, z);
    props.add(new THREE.CylinderGeometry(0.56, 0.56, 0.03, 12, 1), '#c9a35a', x, y - 0.26, z);
    glow.sphere(0.11, 8, 6, [5.5, 3.6, 1.7], x, y - 0.2, z);
  }
  for (let i = 0; i < 3; i++) props.box(0.55, 0.4, 0.4, '#a58457', 8.1, 0.2 + i * 0.4, 6.4, rng.range(-0.2, 0.2));
  cols.push(box(8.1, 6.4, 0.35, 0.3, 1.2));

  // Display plinths: three label cases by the west wall and a newspaper nook by the east wall.
  for (const f of [F.caseA, F.caseB, F.caseC, F.nook]) {
    props.box(f.hw * 2, 0.9, f.hd * 2, WOOD_DARK, f.x, 0.45, f.z);
    props.box(f.hw * 2 - 0.1, 0.03, f.hd * 2 - 0.1, PAPER, f.x, 0.92, f.z);
    cols.push(box(f.x, f.z, f.hw, f.hd, 1));
  }

  // Guides stand at fixed spots; they are drawn by the level as figures.
  cols.push(circle(F.noa.x, F.noa.z, 0.45, 1.8), circle(F.samir.x, F.samir.z, 0.45, 1.8));

  // Cypresses and the night beyond the porch.
  for (let i = 0; i < 6; i++) {
    const x = -22 + i * 9 + rng.range(-1.5, 1.5);
    world.place(cypressTree({ era: 'modern', seed: 'an-cy' + String(i) }), x, -22 + rng.range(-2, 2), rng.range(0, 6));
  }

  const shellMesh = mesh(world, shell.build());
  shellMesh.receiveShadow = true;
  const propsMesh = mesh(world, props.build());
  propsMesh.castShadow = q.shadows;
  propsMesh.receiveShadow = true;
  mesh(world, glow.build(), true);

  // Lights: warm key over the table, lamp, hall pendants and the porch.
  const lights: THREE.Light[] = [];
  const lampLight = new THREE.PointLight('#ffcf8a', 0, 9, 2);
  lampLight.position.set(F.lampDesk.x - 0.3, 1.5, F.lampDesk.z);
  const key = new THREE.SpotLight('#ffcf8a', 55, 14, 0.9, 0.6, 2);
  key.position.set(lt.x, height - 0.5, lt.z - 1);
  key.target.position.set(lt.x, 0, lt.z);
  key.castShadow = q.shadows;
  const tableLight = new THREE.PointLight('#ffd9a0', 0, 5, 2);
  tableLight.position.set(lt.x, 1.5, lt.z - 0.7);
  const hall = new THREE.PointLight('#ffbf73', 40, 14, 2);
  hall.position.set(0, height - 2.6, 5);
  const porch = new THREE.PointLight('#ffb866', 30, 10, 2);
  porch.position.set(3.5, 3.2, -8.2);
  lights.push(lampLight, key, tableLight, hall, porch);
  world.scene.add(lampLight, key, key.target, tableLight, hall, porch);
  world.hemi.intensity = q.tier >= 2 ? 1.1 : 1.8;
  world.hemi.color.set('#6b5a4a');
  world.hemi.groundColor.set('#2a1c14');
  world.sun.intensity = 0.12;

  return {
    lampGlow,
    lampLight,
    drawer,
    ledgerGlow,
    cabinetDoor,
    lensA,
    lensB,
    tableSheet,
    tableGlow,
    tableLight,
    guides: { noa: new THREE.Vector3(F.noa.x, 0, F.noa.z), samir: new THREE.Vector3(F.samir.x, 0, F.samir.z) },
    lights,
  };
}
