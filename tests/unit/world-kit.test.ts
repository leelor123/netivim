import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as buildings from '../../src/world/kit/buildings';
import * as nature from '../../src/world/kit/nature';
import * as props from '../../src/world/kit/props';
import * as vehicles from '../../src/world/kit/vehicles';
import { Crowd, figureGeometry, FigureMaterial, ERA_OUTFITS } from '../../src/world/kit/figures';
import { ERA_IDS } from '../../src/world/eraLook';
import { PRESET_QUALITY } from '../../src/world/quality';
import { createSampleScene } from '../../src/world/sampleScene';
import { createHubScene } from '../../src/scene/hubScene';
import { reliefGeometry } from '../../src/world/reliefMap';

function expectValid(name: string, g: THREE.BufferGeometry): void {
  const pos = g.attributes.position;
  const normal = g.attributes.normal;
  const color = g.attributes.color;
  expect(pos, name).toBeDefined();
  expect(normal, name).toBeDefined();
  expect(color, name).toBeDefined();
  if (!pos || !normal || !color) return;
  expect(g.index, name + ' is non-indexed').toBeNull();
  expect(pos.count % 3, name).toBe(0);
  expect(pos.count).toBeGreaterThan(0);
  expect(normal.count).toBe(pos.count);
  expect(color.count).toBe(pos.count);
  expect(Array.from(pos.array).every(Number.isFinite), name + ' positions finite').toBe(true);
  expect(Array.from(color.array).every(Number.isFinite), name + ' colors finite').toBe(true);
  let badNormals = 0;
  for (let i = 0; i < normal.count; i++) {
    const len = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
    // Degenerate slivers give zero normals; everything else must be unit length.
    if (!(len === 0 || Math.abs(len - 1) < 1e-3)) badNormals++;
  }
  expect(badNormals, name + ' normals').toBe(0);
  expect(g.boundingBox?.min.y ?? 0, name + ' sits near the ground').toBeGreaterThan(-6);
}

const KIT: Record<string, (o: { era: (typeof ERA_IDS)[number]; seed: string }) => THREE.BufferGeometry> = {
  stoneVillageHouse: buildings.stoneVillageHouse,
  ottomanBuilding: buildings.ottomanBuilding,
  templerHouse: buildings.templerHouse,
  bauhausBlock: buildings.bauhausBlock,
  kibbutzHut: buildings.kibbutzHut,
  waterTower: buildings.waterTower,
  stockadeWall: buildings.stockadeWall,
  watchtower: buildings.watchtower,
  tent: buildings.tent,
  transitHut: buildings.transitHut,
  truck1940s: vehicles.truck1940s,
  bus1940s: vehicles.bus1940s,
  sandwichTruck: vehicles.sandwichTruck,
  donkeyCart: vehicles.donkeyCart,
  immigrantShip: vehicles.immigrantShip,
  fishingBoat: vehicles.fishingBoat,
  oliveTree: nature.oliveTree,
  citrusTree: nature.citrusTree,
  cypressTree: nature.cypressTree,
  palmTree: nature.palmTree,
  eucalyptusTree: nature.eucalyptusTree,
  pineTree: nature.pineTree,
  sabraHedge: nature.sabraHedge,
  rock: nature.rock,
  fence: props.fence,
  crate: props.crate,
  sack: props.sack,
  barrel: props.barrel,
  terraceWall: props.terraceWall,
};

describe('asset kit', () => {
  it('every asset builds valid flat-shaded geometry in every era', () => {
    for (const [name, make] of Object.entries(KIT)) {
      for (const era of ERA_IDS) {
        const g = make({ era, seed: name + era });
        expectValid(name + '/' + era, g);
        g.dispose();
      }
    }
  }, 60_000);

  it('assets are deterministic per seed and vary across seeds', () => {
    const a = buildings.stoneVillageHouse({ seed: 'x' });
    const b = buildings.stoneVillageHouse({ seed: 'x' });
    const c = buildings.stoneVillageHouse({ seed: 'y' });
    expect(Array.from(a.attributes.position?.array ?? [])).toEqual(Array.from(b.attributes.position?.array ?? []));
    expect(Array.from(a.attributes.position?.array ?? [])).not.toEqual(Array.from(c.attributes.position?.array ?? []));
  });

  it('fences come in wood, wire and stone', () => {
    for (const kind of ['wood', 'wire', 'stone'] as const) expectValid('fence-' + kind, props.fence({ kind, length: 5 }));
    expectValid('bell tent', buildings.tent({ kind: 'bell' }));
  });

  it('figures carry rig limb ids for every era and variant', () => {
    for (const era of ERA_IDS) {
      for (let v = 0; v < ERA_OUTFITS[era].length; v++) {
        const g = figureGeometry({ era, variant: v });
        expectValid('figure-' + era + v, g);
        const limb = g.attributes.aLimb;
        expect(limb?.count).toBe(g.attributes.position?.count);
        const ids = new Set(Array.from(limb?.array ?? []));
        expect([...ids].sort()).toEqual([0, 1, 2, 3, 4]);
        const box = g.boundingBox;
        expect(box && box.max.y > 1.6 && box.max.y < 2.0).toBe(true);
        g.dispose();
      }
    }
  });

  it('a crowd is one instanced draw with per-instance gait', () => {
    const mat = new FigureMaterial();
    const crowd = new Crowd(figureGeometry({ era: 'war1948' }), mat, 12);
    crowd.set(3, 1, 2, 3, 0.5, 1, 0.25);
    crowd.setDirty();
    expect(crowd.mesh.count).toBe(12);
    expect(crowd.gait.getX(3)).toBeCloseTo(0.25);
    expect(crowd.gait.getY(3)).toBe(1);
    crowd.dispose();
    mat.dispose();
  });

  it('relief map geometry is valid', () => {
    const g = reliefGeometry(4, 2, 40, 20, 0.1);
    expectValid('relief', g);
    g.dispose();
  });
});

function collectResources(root: THREE.Object3D): { geometries: Set<THREE.BufferGeometry>; materials: Set<THREE.Material> } {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = o as Partial<THREE.Mesh>;
    if (m.geometry) geometries.add(m.geometry);
    const mat = m.material;
    for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) materials.add(x);
  });
  return { geometries, materials };
}

function watchDisposal(res: { geometries: Set<THREE.BufferGeometry>; materials: Set<THREE.Material> }): Set<unknown> {
  const disposed = new Set<unknown>();
  for (const g of res.geometries) g.addEventListener('dispose', () => disposed.add(g));
  for (const m of res.materials) m.addEventListener('dispose', () => disposed.add(m));
  return disposed;
}

describe('world scenes (no GPU)', () => {
  it('sample scene vegetation counts follow the density setting', () => {
    const counts = [0, 0.5, 1].map((vegetation) => {
      const s = createSampleScene({ quality: { ...PRESET_QUALITY.high, vegetation } });
      const c = { ...s.vegetationCounts };
      s.dispose();
      return c;
    });
    const [none, half, full] = counts;
    expect(none?.olive).toBe(0);
    expect(none?.pine).toBe(0);
    expect(half?.olive ?? 0).toBeGreaterThan(0);
    expect(full?.olive ?? 0).toBeGreaterThan(half?.olive ?? 0);
    expect(full?.pine ?? 0).toBeGreaterThan(half?.pine ?? 0);
    expect(full?.rocks ?? 0).toBeGreaterThan(none?.rocks ?? 0);
  }, 60_000);

  it('sample scene updates and disposes everything it created', () => {
    const s = createSampleScene({ quality: PRESET_QUALITY.medium });
    s.resize(800, 400);
    for (let i = 0; i < 30; i++) s.update(1 / 60, i / 60);
    expect(s.camera.position.toArray().every(Number.isFinite)).toBe(true);
    const res = collectResources(s.scene);
    expect(res.geometries.size).toBeGreaterThan(10);
    const disposed = watchDisposal(res);
    s.dispose();
    for (const g of res.geometries) expect(disposed.has(g), g.type + ' disposed').toBe(true);
    for (const m of res.materials) expect(disposed.has(m), m.name + ' disposed').toBe(true);
    expect(s.resources.isDisposed).toBe(true);
  }, 60_000);

  it('hub builds at every preset, animates, and disposes everything', () => {
    for (const preset of ['battery', 'ultra'] as const) {
      const hub = createHubScene({ quality: PRESET_QUALITY[preset] });
      hub.resize(1280, 720);
      hub.setHighlight('map');
      for (let i = 0; i < 20; i++) hub.update(1 / 60, i / 60);
      expect(hub.targets.map((t) => t.id)).toEqual(['map', 'shelves', 'window', 'desk']);
      expect(hub.pins.length).toBeGreaterThan(3);
      const lights = hub.scene.children.filter((o) => o instanceof THREE.PointLight).length;
      if (preset === 'battery') expect(lights).toBe(1);
      else expect(lights).toBe(4);
      const res = collectResources(hub.scene);
      const disposed = watchDisposal(res);
      hub.dispose();
      for (const g of res.geometries) expect(disposed.has(g)).toBe(true);
      for (const m of res.materials) expect(disposed.has(m), m.name).toBe(true);
    }
  }, 60_000);
});
