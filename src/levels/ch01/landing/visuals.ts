import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Collider } from '../../../gameplay/core/collision';
import type { LevelWorld } from '../../../gameplay/runtime/levelKit';
import { ERA_LOOKS, type EraLook } from '../../../world/eraLook';
import { Crowd, figureGeometry, FigureMaterial } from '../../../world/kit/figures';
import { bakePlacements } from '../../../world/scatter';
import { SURVIVOR_SCALE, type RescueModel, type SurvivorKind } from './rescue';

/** Visual building blocks for Night Landing. Everything is tracked by the world's ResourceBag. */

/** Moonlit night: the archive-night look with a softer moon and a low sea mist. */
export const NIGHT_LOOK: EraLook = {
  ...ERA_LOOKS.archiveNight,
  skyTop: '#060a16',
  skyHorizon: '#2a3d63',
  skyBottom: '#10151f',
  sunElevation: 32,
  sunAzimuth: 70,
  sunColor: '#b3c6f0',
  sunIntensity: 1.05,
  hemiSky: '#3c4f7c',
  hemiGround: '#221c15',
  hemiIntensity: 0.62,
  fogColor: '#121a2c',
  fogNear: 45,
  fogFar: 230,
};

/** Dawn tones the sky and fog drift toward as the timer runs down (never fully day). */
export const DAWN = {
  skyTop: '#2a3556',
  skyHorizon: '#c58f6a',
  skyBottom: '#3a3a44',
  fog: '#4a4a5a',
  hemiSky: '#8a8ca8',
} as const;

/** Applies the night look on top of the world's own era look (lights, fog, sky). */
export function applyNight(world: LevelWorld): void {
  const look = NIGHT_LOOK;
  world.sun.color.set(look.sunColor);
  world.sun.intensity = look.sunIntensity;
  world.hemi.color.set(look.hemiSky);
  world.hemi.groundColor.set(look.hemiGround);
  world.hemi.intensity = look.hemiIntensity;
  const k = world.opts.quality.renderDistance;
  if (world.scene.background instanceof THREE.Color) world.scene.background.set(look.fogColor);
  if (world.scene.fog instanceof THREE.Fog) {
    world.scene.fog.color.set(look.fogColor);
    world.scene.fog.near = look.fogNear * k;
    world.scene.fog.far = look.fogFar * k;
  }
  world.sun.position.copy(world.sun.target.position).addScaledVector(world.sunDirection, 120);
  world.sky.set(look, world.sunDirection);
}

/** Allocation-free sky/fog/light blend toward dawn (0 = deep night). */
export class DawnBlend {
  private readonly night = {
    top: new THREE.Color(NIGHT_LOOK.skyTop),
    horizon: new THREE.Color(NIGHT_LOOK.skyHorizon),
    bottom: new THREE.Color(NIGHT_LOOK.skyBottom),
    fog: new THREE.Color(NIGHT_LOOK.fogColor),
    hemi: new THREE.Color(NIGHT_LOOK.hemiSky),
  };
  private readonly dawn = {
    top: new THREE.Color(DAWN.skyTop),
    horizon: new THREE.Color(DAWN.skyHorizon),
    bottom: new THREE.Color(DAWN.skyBottom),
    fog: new THREE.Color(DAWN.fog),
    hemi: new THREE.Color(DAWN.hemiSky),
  };
  private last = -1;

  constructor(private readonly world: LevelWorld) {}

  set(amount: number): void {
    const a = Math.round(Math.min(1, Math.max(0, amount)) * 200) / 200;
    if (a === this.last) return;
    this.last = a;
    const u = this.world.sky.mesh.material.uniforms as Record<string, { value: THREE.Color }>;
    (u.uTop as { value: THREE.Color }).value.lerpColors(this.night.top, this.dawn.top, a);
    (u.uHorizon as { value: THREE.Color }).value.lerpColors(this.night.horizon, this.dawn.horizon, a);
    (u.uBottom as { value: THREE.Color }).value.lerpColors(this.night.bottom, this.dawn.bottom, a);
    const scene = this.world.scene;
    if (scene.fog instanceof THREE.Fog) scene.fog.color.lerpColors(this.night.fog, this.dawn.fog, a);
    if (scene.background instanceof THREE.Color) scene.background.lerpColors(this.night.fog, this.dawn.fog, a);
    this.world.hemi.color.lerpColors(this.night.hemi, this.dawn.hemi, a);
  }
}

/** A flat fan on the water or the sand: a patrol's vision cone or a searchlight beam. */
export class ConeFan {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly calm = new THREE.Color('#ffe6a0');
  private readonly alarm = new THREE.Color('#ff6a3a');

  constructor(world: LevelWorld, halfAngle: number, segments = 14) {
    const pos = new Float32Array((segments + 2) * 3);
    const index: number[] = [];
    pos.set([0, 0, 0], 0);
    for (let i = 0; i <= segments; i++) {
      const a = -halfAngle + (2 * halfAngle * i) / segments;
      pos.set([Math.sin(a), 0, Math.cos(a)], (i + 1) * 3);
      if (i < segments) index.push(0, i + 2, i + 1);
    }
    const geometry = world.bag.geometry(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setIndex(index);
    const material = world.bag.material(new THREE.MeshBasicMaterial({ color: this.calm, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, fog: false }));
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    world.scene.add(this.mesh);
  }

  /** Color and strength follow the exposure meter (0 calm .. 1 about to be seen). */
  setLevel(level: number, pulse: boolean, elapsed: number): void {
    const l = Math.round(level * 20) / 20;
    this.mesh.material.color.lerpColors(this.calm, this.alarm, l);
    const base = 0.17 + 0.3 * l;
    this.mesh.material.opacity = pulse && l > 0 ? base + Math.sin(elapsed * 9) * 0.05 : base;
  }

  place(x: number, y: number, z: number, heading: number, range: number): void {
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.y = heading;
    this.mesh.scale.set(range, 1, range);
  }
}

/**
 * Static set dressing merged into one mesh per material (one draw call instead of one per prop).
 * add() bakes a kit geometry at an explicit height (sea props float on the water level);
 * addGround() puts it on the terrain and registers its collider, like LevelWorld.place.
 * flush() once after the last prop. The geometries are consumed.
 */
export class StaticBatch {
  private readonly parts: THREE.BufferGeometry[] = [];

  constructor(
    private readonly world: LevelWorld,
    private readonly material: THREE.Material,
    private readonly name: string,
  ) {}

  add(geometry: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, scale = 1): void {
    const [baked] = bakePlacements(geometry, [{ x, y, z, ry, scale }]);
    geometry.dispose();
    if (!baked) throw new Error('bake failed');
    this.parts.push(baked);
  }

  addGround(geometry: THREE.BufferGeometry, x: number, z: number, ry = 0, collider?: Collider): void {
    this.add(geometry, x, this.world.heightAt(x, z), z, ry);
    if (collider) this.world.colliders.push(collider);
  }

  flush(): THREE.Mesh | null {
    if (this.parts.length === 0) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const g of this.parts) g.dispose();
    this.parts.length = 0;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(this.world.bag.geometry(merged), this.material);
    mesh.name = this.name;
    mesh.castShadow = this.world.opts.quality.shadows;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.world.scene.add(mesh);
    return mesh;
  }
}

/** A movable boat mesh (the geometry is the kit boat; the lamp is a small unlit glow). */
export class BoatVisual {
  readonly group = new THREE.Group();
  private readonly hull: THREE.Mesh;

  constructor(world: LevelWorld, geometry: THREE.BufferGeometry, scale: number, lampColor: string | null, lampHeight = 3.1) {
    this.hull = new THREE.Mesh(world.bag.geometry(geometry), world.mats.lift);
    this.hull.castShadow = world.opts.quality.shadows;
    this.hull.scale.setScalar(scale);
    this.group.add(this.hull);
    if (lampColor) {
      const lamp = new THREE.Mesh(
        world.bag.geometry(new THREE.SphereGeometry(0.22, 8, 6)),
        world.bag.material(new THREE.MeshBasicMaterial({ color: lampColor, fog: false })),
      );
      lamp.position.set(0, lampHeight * scale, 0.9 * scale);
      this.group.add(lamp);
    }
    world.scene.add(this.group);
  }

  set(x: number, y: number, z: number, heading: number, roll = 0): void {
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, heading, roll);
  }
}

/** Instanced survivors (three crowds by kind) driven by the pure RescueModel. */
export class SurvivorViews {
  private readonly crowds = new Map<SurvivorKind, Crowd>();
  private readonly crowdList: Crowd[] = [];
  private readonly slot: number[] = [];
  private readonly volunteers: Crowd;
  private readonly kinds: readonly SurvivorKind[] = ['child', 'elder', 'adult'];

  constructor(
    private readonly world: LevelWorld,
    model: RescueModel,
    volunteerSpots: readonly { readonly x: number; readonly z: number; readonly heading: number }[],
  ) {
    const mat = world.bag.track(new FigureMaterial(world.opts.era));
    world.onVisual((_dt, elapsed) => mat.update(elapsed));
    const counts: Record<SurvivorKind, number> = { child: 0, elder: 0, adult: 0 };
    for (const s of model.survivors) {
      this.slot.push(counts[s.kind]);
      counts[s.kind]++;
    }
    this.kinds.forEach((kind, i) => {
      const geo = world.bag.geometry(figureGeometry({ era: 'mandate1940', variant: i + 1, seed: 'landing-' + kind }));
      const crowd = new Crowd(geo, mat, counts[kind]);
      crowd.mesh.frustumCulled = false;
      world.bag.track(crowd);
      world.scene.add(crowd.mesh);
      this.crowds.set(kind, crowd);
      this.crowdList.push(crowd);
    });
    const vgeo = world.bag.geometry(figureGeometry({ era: 'mandate1940', variant: 0, seed: 'landing-volunteer' }));
    this.volunteers = new Crowd(vgeo, mat, volunteerSpots.length);
    this.volunteers.mesh.frustumCulled = false;
    world.bag.track(this.volunteers);
    world.scene.add(this.volunteers.mesh);
    volunteerSpots.forEach((v, i) => this.volunteers.set(i, v.x, world.heightAt(v.x, v.z), v.z, v.heading, 0, i * 1.7));
    this.volunteers.setDirty();
  }

  /** Writes every survivor into its crowd (no allocation). */
  sync(model: RescueModel, boatDeckY: number): void {
    for (let i = 0; i < model.survivors.length; i++) {
      const s = model.survivors[i];
      if (!s) continue;
      const crowd = this.crowds.get(s.kind);
      if (!crowd) continue;
      const ground = this.world.heightAt(s.x, s.z);
      const y = s.state === 'boat' ? boatDeckY : Math.max(ground, -0.25);
      // Still on the ship (a later trip): out of sight.
      crowd.set(this.slot[i] as number, s.x, y, s.z, s.heading, s.walk, i * 1.3, s.state === 'ship' ? 0.0001 : SURVIVOR_SCALE[s.kind]);
    }
    for (let c = 0; c < this.crowdList.length; c++) {
      const crowd = this.crowdList[c] as Crowd;
      crowd.markMoved();
      crowd.gait.needsUpdate = true;
    }
  }
}

/** Lantern bearers on the beach: an instanced figure each plus a small unlit lantern. */
export class WatcherViews {
  private readonly crowd: Crowd;
  private readonly lamps: THREE.Mesh[] = [];

  constructor(
    private readonly world: LevelWorld,
    count: number,
  ) {
    const mat = world.bag.track(new FigureMaterial(world.opts.era));
    world.onVisual((_dt, elapsed) => mat.update(elapsed));
    const geo = world.bag.geometry(figureGeometry({ era: 'mandate1940', variant: 3, seed: 'landing-watcher' }));
    this.crowd = new Crowd(geo, mat, count);
    this.crowd.mesh.frustumCulled = false;
    world.bag.track(this.crowd);
    world.scene.add(this.crowd.mesh);
    const lampGeo = world.bag.geometry(new THREE.SphereGeometry(0.16, 8, 6));
    const lampMat = world.bag.material(new THREE.MeshBasicMaterial({ color: '#ffd27a', fog: false }));
    for (let i = 0; i < count; i++) {
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      world.scene.add(lamp);
      this.lamps.push(lamp);
    }
  }

  set(visible: boolean): void {
    this.crowd.mesh.visible = visible;
    for (const l of this.lamps) l.visible = visible;
  }

  /** Places watcher i (no allocation). */
  place(i: number, x: number, z: number, heading: number, walking: boolean): void {
    const y = this.world.heightAt(x, z);
    this.crowd.set(i, x, y, z, heading, walking ? 0.5 : 0, i * 2.1);
    this.crowd.markMoved();
    this.crowd.gait.needsUpdate = true;
    const lamp = this.lamps[i];
    if (lamp) lamp.position.set(x + Math.cos(heading) * 0.45, y + 1.0, z - Math.sin(heading) * 0.45);
  }
}
