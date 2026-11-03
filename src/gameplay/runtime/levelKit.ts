import * as THREE from 'three';
import type { EraId as RenderEraId } from '../../render/eras';
import type { GameScene } from '../../render/sceneManager';
import type { BiomeId } from '../../world/biomes';
import { applyEraLook, SkyDome, sunDirection, ERA_LOOKS, type EraId } from '../../world/eraLook';
import { createKitMaterials, type KitMaterials } from '../../world/kit/materials';
import type { WorldQuality } from '../../world/quality';
import { ResourceBag } from '../../world/resources';
import type { RoadSpec } from '../../world/roads';
import { bakePlacements } from '../../world/scatter';
import { Terrain, type TerrainConfig } from '../../world/terrain';
import type { Bounds, Collider } from '../core/collision';

/**
 * Level-building kit: terrain with era lighting, colliders, kit props, markers and the GameScene
 * wrapper. Everything created here is tracked and freed by dispose() (idempotent).
 */

export interface LevelWorldOptions {
  readonly seed: string;
  readonly era: EraId;
  readonly biome?: BiomeId;
  /** Terrain side in meters (multiple of 32). Default 128. */
  readonly size?: number;
  readonly roads?: readonly RoadSpec[];
  /** Optional second biome blended in by mask (e.g. hills inland of a coastal plain). */
  readonly secondary?: TerrainConfig['secondary'];
  readonly waterLevel?: number | null;
  readonly quality: WorldQuality;
  /** Color grading palette for the render pipeline. */
  readonly grade?: RenderEraId;
}

const ERA_GRADE: Readonly<Record<EraId, RenderEraId>> = {
  ottoman1890: 'ottoman',
  mandate1940: 'mandate',
  war1948: 'independence',
  austerity1950: 'austerity',
  sixday1967: 'sixties',
  modern: 'modern',
  archiveNight: 'archive',
};

export class Marker {
  readonly group = new THREE.Group();
  private highlighted = false;

  constructor(
    private readonly ring: THREE.Mesh,
    private readonly beam: THREE.Mesh,
    private readonly material: THREE.MeshBasicMaterial,
    private readonly baseColor: THREE.Color,
  ) {
    this.group.add(ring, beam);
  }

  setHighlight(on: boolean): void {
    this.highlighted = on;
    this.material.color.copy(this.baseColor);
    if (on) this.material.color.multiplyScalar(1.8);
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  /** Gentle pulse (disabled for reduced motion). */
  animate(elapsed: number, reducedMotion: boolean): void {
    const s = reducedMotion ? (this.highlighted ? 1.2 : 1) : (this.highlighted ? 1.25 : 1) + Math.sin(elapsed * 3) * 0.06;
    this.ring.scale.set(s, s, s);
    this.beam.visible = !this.highlighted || reducedMotion || Math.sin(elapsed * 6) > -0.8;
  }
}

export class LevelWorld {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly terrain: Terrain;
  readonly sun = new THREE.DirectionalLight();
  readonly hemi = new THREE.HemisphereLight();
  readonly sky: SkyDome;
  readonly bag = new ResourceBag();
  readonly mats: KitMaterials;
  readonly colliders: Collider[] = [];
  readonly bounds: Bounds;
  readonly markers: Marker[] = [];
  readonly sunDirection = new THREE.Vector3();
  readonly grade: RenderEraId;
  private readonly ringGeo: THREE.RingGeometry;
  private readonly beamGeo: THREE.CylinderGeometry;
  private disposed = false;
  private readonly visualHooks: ((dt: number, elapsed: number) => void)[] = [];

  constructor(readonly opts: LevelWorldOptions) {
    const size = opts.size ?? 128;
    const q = opts.quality;
    this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.2, 700 * q.renderDistance);
    this.terrain = this.bag.track(
      new Terrain({
        seed: opts.seed,
        size,
        chunkSize: 32,
        cell: 2,
        biome: opts.biome ?? 'coastalPlain',
        era: opts.era,
        roads: opts.roads ?? [],
        ...(opts.secondary ? { secondary: opts.secondary } : {}),
        ...(opts.waterLevel !== undefined ? { waterLevel: opts.waterLevel } : {}),
        lodDistance: q.lodDistance,
        renderDistance: q.renderDistance,
      }),
    );
    this.scene.add(this.terrain.group);
    const half = size / 2 - 2;
    this.bounds = { minX: -half, maxX: half, minZ: -half, maxZ: half };

    this.sun.castShadow = q.shadows;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sky = this.bag.track(new SkyDome(600 * q.renderDistance));
    this.scene.add(this.sky.mesh);
    applyEraLook({ scene: this.scene, sun: this.sun, hemi: this.hemi, sky: this.sky, sunDistance: 120, renderDistance: q.renderDistance, fog: q.fog }, opts.era);
    sunDirection(ERA_LOOKS[opts.era], this.sunDirection);
    this.grade = opts.grade ?? ERA_GRADE[opts.era];
    this.mats = this.bag.track(createKitMaterials());
    this.ringGeo = this.bag.geometry(new THREE.RingGeometry(0.55, 0.8, 32).rotateX(-Math.PI / 2));
    this.beamGeo = this.bag.geometry(new THREE.CylinderGeometry(0.06, 0.06, 3, 8).translate(0, 1.5, 0));
  }

  heightAt = (x: number, z: number): number => this.terrain.heightAt(x, z);

  /** Places a kit geometry (merged into its own mesh) on the ground. The geometry is consumed. */
  place(geometry: THREE.BufferGeometry, x: number, z: number, ry = 0, collider?: Collider): THREE.Mesh {
    const [baked] = bakePlacements(geometry, [{ x, y: this.heightAt(x, z), z, ry, scale: 1 }]);
    geometry.dispose();
    if (!baked) throw new Error('bake failed');
    const mesh = new THREE.Mesh(this.bag.geometry(baked), this.mats.solid);
    mesh.castShadow = this.opts.quality.shadows;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);
    if (collider) this.colliders.push(collider);
    return mesh;
  }

  /** Glowing ring + beam marking a goal, an item or a lantern. */
  addMarker(x: number, z: number, color: THREE.ColorRepresentation): Marker {
    const base = new THREE.Color(color);
    const mat = this.bag.material(new THREE.MeshBasicMaterial({ color: base.clone(), transparent: true, opacity: 0.85, depthWrite: false }));
    const ring = new THREE.Mesh(this.ringGeo, mat);
    const beam = new THREE.Mesh(this.beamGeo, mat);
    const m = new Marker(ring, beam, mat, base);
    m.group.position.set(x, this.heightAt(x, z) + 0.05, z);
    this.scene.add(m.group);
    this.markers.push(m);
    return m;
  }

  /** Visual-only per-step work (animations), run from the GameScene update. */
  onVisual(fn: (dt: number, elapsed: number) => void): void {
    this.visualHooks.push(fn);
  }

  /** The GameScene handed to the SceneManager. dispose() runs `extra` then frees the world once. */
  gameScene(extra: () => void = () => undefined): GameScene {
    return {
      scene: this.scene,
      camera: this.camera,
      sun: this.sun,
      sunDirection: this.sunDirection,
      era: this.grade,
      shadowDistance: 60,
      update: (dt, elapsed) => {
        this.terrain.update(this.camera.position, dt, elapsed);
        this.sky.update(this.camera);
        for (const fn of this.visualHooks) fn(dt, elapsed);
      },
      resize: (w, h) => {
        this.camera.aspect = w / Math.max(1, h);
        this.camera.updateProjectionMatrix();
      },
      dispose: () => {
        if (this.disposed) return;
        extra();
        this.dispose();
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sun.dispose();
    this.hemi.dispose();
    this.bag.dispose();
    this.scene.clear();
  }
}
