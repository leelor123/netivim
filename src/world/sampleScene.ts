import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GameScene } from '../render/sceneManager';
import type { BiomeId } from './biomes';
import { applyEraLook, SkyDome, type EraId } from './eraLook';
import { stoneVillageHouse } from './kit/buildings';
import { Crowd, figureGeometry, FigureMaterial } from './kit/figures';
import { createKitMaterials } from './kit/materials';
import { cypressTree, oliveTree, pineTree, rock, sabraHedge } from './kit/nature';
import { barrel, crate, sack, terraceWall } from './kit/props';
import { bus1940s, donkeyCart, sandwichTruck, truck1940s } from './kit/vehicles';
import { fbm } from './noise';
import { DEFAULT_WORLD_QUALITY, densityCount, type WorldQuality } from './quality';
import { ResourceBag } from './resources';
import { bakePlacements, instancesFrom, scatterOnTerrain, type Placement } from './scatter';
import { Rng } from './rng';
import { Terrain } from './terrain';

export interface SampleSceneOptions {
  readonly era?: EraId;
  readonly biome?: BiomeId;
  readonly quality?: WorldQuality;
  readonly seed?: string;
}

/** A GameScene built from the world kit, with handles for tests and tools. */
export interface WorldScene extends GameScene {
  readonly terrain: Terrain;
  readonly resources: ResourceBag;
  /** Instance counts per vegetation layer (density follows settings). */
  readonly vegetationCounts: Readonly<Record<string, number>>;
  /** When true (default) the scene drives its own camera. */
  autoCamera: boolean;
}

const TERRAIN_SIZE = 384;
const ROAD: readonly (readonly [number, number])[] = [
  [-30, -200],
  [-5, -140],
  [-35, -80],
  [0, -20],
  [35, 35],
  [15, 100],
  [50, 160],
  [40, 200],
];
const VILLAGE = { x: -95, z: 25, radius: 34 };
const CONVOY = [
  { kind: 'sandwich', gap: 0 },
  { kind: 'truck', gap: 11 },
  { kind: 'sandwich', gap: 22 },
  { kind: 'bus', gap: 34 },
  { kind: 'sandwich', gap: 46 },
] as const;

/**
 * Sample level: 1948 Judean hills with a winding convoy road (in the spirit of the road to
 * Jerusalem), a stone village, terraces, olive groves and pines, a slow convoy and villagers.
 */
export function createSampleScene(opts: SampleSceneOptions = {}): WorldScene {
  const era = opts.era ?? 'war1948';
  const quality = opts.quality ?? DEFAULT_WORLD_QUALITY;
  const seed = opts.seed ?? 'sample-1948';
  const bag = new ResourceBag();
  const rng = new Rng(seed);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 900 * quality.renderDistance);

  const terrain = bag.track(
    new Terrain({
      seed,
      size: TERRAIN_SIZE,
      chunkSize: 64,
      cell: 2,
      biome: opts.biome ?? 'judeanHills',
      era,
      roads: [{ points: ROAD, width: 6, shoulder: 5, color: '#b59a74' }],
      lodDistance: quality.lodDistance,
      renderDistance: quality.renderDistance,
      maxDistance: 420,
    }),
  );
  scene.add(terrain.group);

  // Lights and era look.
  const hemi = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  sun.castShadow = quality.shadows;
  if (quality.shadows) {
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.5;
    const sc = sun.shadow.camera;
    sc.left = -90;
    sc.right = 90;
    sc.top = 90;
    sc.bottom = -90;
    sc.near = 1;
    sc.far = 400;
    sc.updateProjectionMatrix();
  }
  scene.add(hemi, sun, sun.target);
  const sky = bag.track(new SkyDome(800 * quality.renderDistance));
  scene.add(sky.mesh);
  const look = { scene, sun, hemi, sky, sunDistance: 180, renderDistance: quality.renderDistance, fog: quality.fog };
  applyEraLook(look, era);
  const sunOffset = new THREE.Vector3().subVectors(sun.position, sun.target.position);

  const mats = bag.track(createKitMaterials());
  const road = terrain.roads[0];
  if (!road) throw new Error('sample scene needs its road');
  const bounds = { minX: -TERRAIN_SIZE / 2 + 6, maxX: TERRAIN_SIZE / 2 - 6, minZ: -TERRAIN_SIZE / 2 + 6, maxZ: TERRAIN_SIZE / 2 - 6 };
  const nearVillage = (x: number, z: number, pad = 0): boolean => Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.radius + pad;

  // Village: houses baked into one merged mesh (one draw call).
  const houseGeos: THREE.BufferGeometry[] = [];
  const houseSpots: Placement[] = [];
  const vr = rng.fork('village');
  for (let tries = 0; tries < 200 && houseSpots.length < 14; tries++) {
    const a = vr.range(0, Math.PI * 2);
    const d = Math.sqrt(vr.next()) * VILLAGE.radius;
    const x = VILLAGE.x + Math.cos(a) * d;
    const z = VILLAGE.z + Math.sin(a) * d;
    if (houseSpots.some((h) => Math.hypot(h.x - x, h.z - z) < 9) || terrain.roadAt(x, z) > 0) continue;
    let y = Infinity;
    for (const [ox, oz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as const) y = Math.min(y, terrain.heightAt(x + ox, z + oz));
    houseSpots.push({ x, y: y - 0.3, z, ry: Math.round(vr.range(0, 4)) * (Math.PI / 2) + vr.range(-0.15, 0.15), scale: 1 });
  }
  houseSpots.forEach((spot, i) => {
    const g = stoneVillageHouse({ era, seed: seed + '-house-' + String(i) });
    houseGeos.push(...bakePlacements(g, [spot]));
    g.dispose();
  });
  const village = new THREE.Mesh(bag.geometry(mergeGeometries(houseGeos)), mats.solid);
  for (const g of houseGeos) g.dispose();
  village.castShadow = true;
  village.receiveShadow = true;
  village.name = 'village';
  village.matrixAutoUpdate = false;
  scene.add(village);
  const nearHouse = (x: number, z: number): boolean => houseSpots.some((h) => Math.hypot(h.x - x, h.z - z) < 6);

  // Vegetation layers: one instanced draw call each; counts follow settings.vegetation.
  const veg = quality.vegetation;
  const counts: Record<string, number> = {};
  const layer = (name: string, geometry: THREE.BufferGeometry, base: number, extra: Partial<Parameters<typeof scatterOnTerrain>[1]>, castShadow = true): void => {
    bag.geometry(geometry);
    const count = densityCount(base, name === 'rocks' ? 0.4 + veg * 0.6 : veg);
    counts[name] = count;
    if (count === 0) return;
    const placements = scatterOnTerrain(terrain, { count, rng: rng.fork(name), ...bounds, avoid: nearHouse, ...extra });
    counts[name] = placements.length;
    const mesh = instancesFrom(geometry, mats.solid, placements, name);
    mesh.castShadow = castShadow && quality.shadows;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  const n = terrain.noise;
  layer('olive', oliveTree({ era, seed: 'olive-a' }), 900, { maxSlope: 0.35, cluster: (x, z) => 0.5 + fbm(n.v, x * 0.012, z * 0.012, 2) * 1.6 - (nearVillage(x, z, 60) ? 0 : 0.35) });
  layer('pine', pineTree({ era, seed: 'pine-a' }), 300, { maxSlope: 0.5, minHeight: 30, cluster: (x, z) => fbm(n.b, x * 0.008, z * 0.008, 2) * 2 + 0.1 });
  layer('cypress', cypressTree({ era, seed: 'cypress-a' }), 70, { maxSlope: 0.3, cluster: (x, z) => (nearVillage(x, z, 25) ? 1 : 0.05) });
  layer('sabra', sabraHedge({ era, seed: 'sabra-a', length: 5 }), 60, { maxSlope: 0.3, cluster: (x, z) => (nearVillage(x, z, 18) && !nearVillage(x, z, -8) ? 1 : 0) });
  layer('rocks', rock({ era, seed: 'rock-a', size: 0.9 }), 650, { sink: 0.2, scaleMin: 0.5, scaleMax: 1.8, cluster: (x, z) => 0.3 + terrain.slopeAt(x, z) * 2 });

  // Terrace walls run along the contour (perpendicular to the slope).
  const wallGeo = bag.geometry(terraceWall({ era, seed: 'terrace-a', length: 9, height: 1 }));
  const wallSpots = scatterOnTerrain(terrain, { count: densityCount(160, 0.5 + veg * 0.5), rng: rng.fork('terraces'), ...bounds, maxSlope: 0.32, avoid: nearHouse, maxRoad: 0, cluster: (x, z) => (terrain.slopeAt(x, z) > 0.08 ? 0.8 : 0) });
  for (const w of wallSpots) {
    const gx = terrain.heightAt(w.x + 1, w.z) - terrain.heightAt(w.x - 1, w.z);
    const gz = terrain.heightAt(w.x, w.z + 1) - terrain.heightAt(w.x, w.z - 1);
    w.ry = Math.atan2(gz, -gx) + Math.PI / 2;
    w.y -= 0.45;
    w.scale = 1;
  }
  counts.terraces = wallSpots.length;
  if (wallSpots.length > 0) {
    const walls = instancesFrom(wallGeo, mats.solid, wallSpots, 'terraces');
    walls.receiveShadow = true;
    scene.add(walls);
  }

  // Roadside props (merged, one draw call).
  const propGeos: THREE.BufferGeometry[] = [];
  const pr = rng.fork('props');
  const roadside = new THREE.Vector3();
  for (let i = 0; i < 6; i++) {
    road.pointAt(0.2 + i * 0.12, roadside);
    const side = i % 2 ? 6.5 : -6.5;
    const parts = [crate({ era }), sack({ era }), barrel({ era, seed: 'b' + String(i) }), sack({ era })];
    parts.forEach((g, k) => {
      const x = roadside.x + side + pr.range(-1, 1) + k * 0.7;
      const z = roadside.z + pr.range(-1.5, 1.5);
      propGeos.push(...bakePlacements(g, [{ x, y: terrain.heightAt(x, z) - 0.05, z, ry: pr.range(0, 6.28), scale: 1 }]));
      g.dispose();
    });
  }
  const cartGeo = donkeyCart({ era });
  const cartX = VILLAGE.x + VILLAGE.radius + 6;
  const cartZ = VILLAGE.z - 6;
  propGeos.push(...bakePlacements(cartGeo, [{ x: cartX, y: terrain.heightAt(cartX, cartZ), z: cartZ, ry: 1.2, scale: 1 }]));
  cartGeo.dispose();
  const props = new THREE.Mesh(bag.geometry(mergeGeometries(propGeos)), mats.solid);
  for (const g of propGeos) g.dispose();
  props.castShadow = quality.shadows;
  props.receiveShadow = true;
  props.matrixAutoUpdate = false;
  props.name = 'props';
  scene.add(props);

  // Convoy: each vehicle type is one instanced mesh; positions follow the road every frame.
  const vehicleGeos = {
    sandwich: bag.geometry(sandwichTruck({ era, seed: 'sw' })),
    truck: bag.geometry(truck1940s({ era, seed: 'tr', covered: true })),
    bus: bag.geometry(bus1940s({ era, seed: 'bus' })),
  };
  const vehicleMeshes = {
    sandwich: new THREE.InstancedMesh(vehicleGeos.sandwich, mats.solid, 3),
    truck: new THREE.InstancedMesh(vehicleGeos.truck, mats.solid, 1),
    bus: new THREE.InstancedMesh(vehicleGeos.bus, mats.solid, 1),
  };
  const vehicleList = [vehicleMeshes.sandwich, vehicleMeshes.truck, vehicleMeshes.bus];
  for (const mesh of vehicleList) {
    mesh.castShadow = quality.shadows;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    bag.track(mesh);
    scene.add(mesh);
  }
  const convoySlots = CONVOY.map((c) => ({ ...c, index: 0 }));
  const perKind: Record<string, number> = {};
  for (const slot of convoySlots) {
    slot.index = perKind[slot.kind] ?? 0;
    perKind[slot.kind] = slot.index + 1;
  }

  // People: villagers idle near houses; travelers walk the road shoulder.
  const figMat = bag.track(new FigureMaterial());
  const crowdRng = rng.fork('crowd');
  const villagers: Crowd[] = [];
  const crowdCount = densityCount(36, 0.5 + veg * 0.5);
  for (let v = 0; v < 4; v++) {
    const crowd = bag.track(new Crowd(figureGeometry({ era, variant: v, seed: seed + '-fig-' + String(v) }), figMat, Math.ceil(crowdCount / 4)));
    for (let i = 0; i < crowd.mesh.count; i++) {
      const h = crowdRng.pick(houseSpots.length > 0 ? houseSpots : [{ x: VILLAGE.x, y: 0, z: VILLAGE.z, ry: 0, scale: 1 }]);
      const a = crowdRng.range(0, Math.PI * 2);
      const x = h.x + Math.cos(a) * crowdRng.range(4, 7);
      const z = h.z + Math.sin(a) * crowdRng.range(4, 7);
      crowd.set(i, x, terrain.heightAt(x, z), z, crowdRng.range(0, Math.PI * 2), 0, crowdRng.range(0, 6.28), crowdRng.range(0.92, 1.05));
    }
    crowd.setDirty();
    crowd.mesh.receiveShadow = true;
    scene.add(crowd.mesh);
    villagers.push(crowd);
  }
  const walkers = bag.track(new Crowd(figureGeometry({ era, variant: 1, seed: seed + '-walker' }), figMat, 6));
  walkers.mesh.frustumCulled = false;
  scene.add(walkers.mesh);
  counts.figures = crowdCount + 6;

  // Dust motes drifting over the road (particle density follows settings).
  const dustCount = densityCount(500, quality.particles);
  const dustPos = new Float32Array(Math.max(1, dustCount) * 3);
  const dr = rng.fork('dust');
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = dr.range(-25, 25);
    dustPos[i * 3 + 1] = dr.range(0, 8);
    dustPos[i * 3 + 2] = dr.range(-25, 25);
  }
  const dustGeo = bag.geometry(new THREE.BufferGeometry());
  const dustAttr = new THREE.BufferAttribute(dustPos, 3);
  dustGeo.setAttribute('position', dustAttr);
  dustGeo.setDrawRange(0, dustCount);
  const dustMat = bag.material(new THREE.PointsMaterial({ color: '#e8d6b0', size: 0.18, transparent: true, opacity: 0.55, depthWrite: false }));
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  dust.visible = dustCount > 0;
  scene.add(dust);
  counts.dust = dustCount;

  // Reused per-frame scratch (zero allocations in update).
  const lead = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const CONVOY_SPEED = 4;
  let convoyAlong = 0.32;

  const placeConvoy = (): void => {
    for (const slot of convoySlots) {
      const along = convoyAlong - slot.gap / road.length;
      const { heading } = road.pointAt(along < 0 ? along + 1 : along, tmp);
      tmp.y = terrain.heightAt(tmp.x, tmp.z);
      q.setFromAxisAngle(up, heading);
      vehicleMeshes[slot.kind].setMatrixAt(slot.index, m4.compose(tmp, q, one));
      if (slot.gap === 0) lead.copy(tmp);
    }
    for (const mesh of vehicleList) mesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < walkers.mesh.count; i++) {
      const along = convoyAlong - (60 + i * 3.5) / road.length;
      const { heading } = road.pointAt(along < 0 ? along + 1 : along, tmp);
      const side = i % 2 ? 4.2 : -4.2;
      const x = tmp.x + Math.cos(heading) * side;
      const z = tmp.z - Math.sin(heading) * side;
      walkers.set(i, x, terrain.heightAt(x, z), z, heading, 1, i * 1.7, 1);
    }
    walkers.markMoved();
    walkers.gait.needsUpdate = true;
  };
  placeConvoy();

  const ws: WorldScene = {
    scene,
    camera,
    terrain,
    resources: bag,
    vegetationCounts: counts,
    autoCamera: true,
    update(dt, elapsed) {
      convoyAlong += (dt * CONVOY_SPEED) / road.length;
      if (convoyAlong > 0.95) convoyAlong = 0.1;
      placeConvoy();
      figMat.update(elapsed);
      if (ws.autoCamera) {
        const a = elapsed * 0.05 + 0.6;
        camera.position.set(lead.x + Math.sin(a) * 48, lead.y + 24 + Math.sin(elapsed * 0.13) * 2, lead.z + Math.cos(a) * 48);
        lookAt.set(lead.x, lead.y + 2, lead.z);
        camera.lookAt(lookAt);
      }
      terrain.update(camera.position, dt, elapsed);
      sky.update(camera);
      // Keep the sun's shadow frustum around the action.
      sun.target.position.copy(lead);
      sun.position.copy(lead).add(sunOffset);
      sun.target.updateMatrixWorld();
      // Dust drifts up around the lead vehicle and wraps.
      for (let i = 0; i < dustCount; i++) {
        let y = (dustPos[i * 3 + 1] ?? 0) + dt * 0.4;
        if (y > 8) y = 0;
        dustPos[i * 3 + 1] = y;
      }
      dust.position.set(lead.x, lead.y, lead.z);
      if (dustCount > 0) dustAttr.needsUpdate = true;
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
  ws.update(0, 0);
  return ws;
}
