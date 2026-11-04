import type { Collider } from '../../../gameplay/core/collision';
import { circle } from '../../../gameplay/core/collision';
import type { LevelWorld } from '../../../gameplay/runtime/levelKit';
import { Crowd, figureGeometry, FigureMaterial } from '../../../world/kit/figures';
import {
  DEBORA,
  ELIYAHU,
  HABIB,
  JAMILA,
  MARKET_PORTER,
  MARKET_RUNNER,
  MARKET_WATER,
  OVEN_WOMAN,
  ROAD_WAYFARER,
  STATIONMASTER,
  VENDOR,
} from './layout';

/**
 * The people of the level: labeled composite characters standing at their posts, farmers at the
 * well, children playing in the village, a few walkers in the old town. One instanced draw call
 * per outfit. Reduced motion keeps everybody standing.
 */

export type FolkRole = 'stand' | 'pace' | 'circle';

export interface FolkSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Outfit variant 0-3 of the 1890s wardrobe. */
  readonly variant: 0 | 1 | 2 | 3;
  readonly role: FolkRole;
  /** Facing for stand; pace goal x/z or circle radius. */
  readonly heading?: number;
  readonly toX?: number;
  readonly toZ?: number;
  readonly radius?: number;
  readonly speed?: number;
  readonly scale?: number;
  /** Solid for the player (named characters). */
  readonly solid?: boolean;
}

const PI_HALF = Math.PI / 2;
const face = (from: { x: number; z: number }, to: { x: number; z: number }): number => Math.atan2(to.x - from.x, to.z - from.z);

export const FOLK: readonly FolkSpec[] = [
  // Jaffa
  { id: 'habib', x: HABIB.x, z: HABIB.z, variant: 0, role: 'stand', heading: Math.PI, solid: true },
  { id: 'vendor', x: VENDOR.x, z: VENDOR.z, variant: 0, role: 'stand', heading: Math.PI, solid: true },
  { id: 'market-porter', x: MARKET_PORTER.x, z: MARKET_PORTER.z, variant: 2, role: 'stand', heading: face(MARKET_PORTER, { x: -62, z: 8 }), solid: true },
  { id: 'market-water', x: MARKET_WATER.x, z: MARKET_WATER.z, variant: 1, role: 'stand', heading: face(MARKET_WATER, { x: -58, z: 14 }), solid: true },
  { id: 'market-runner', x: MARKET_RUNNER.x, z: MARKET_RUNNER.z, variant: 3, role: 'stand', heading: face(MARKET_RUNNER, { x: -60, z: -4 }), scale: 0.78, solid: true },
  { id: 'porter-1', x: -70, z: 2, variant: 2, role: 'pace', toX: -60, toZ: 14, speed: 1.1 },
  { id: 'porter-2', x: -80, z: -2, variant: 0, role: 'pace', toX: -72, toZ: -10, speed: 0.9 },
  { id: 'shopper-1', x: -52, z: 28, variant: 3, role: 'pace', toX: -38, toZ: 30, speed: 0.8 },
  { id: 'shopper-2', x: -40, z: 18, variant: 1, role: 'pace', toX: -50, toZ: 15, speed: 0.7 },
  // The road to Rishon LeZion
  { id: 'wayfarer', x: ROAD_WAYFARER.x, z: ROAD_WAYFARER.z, variant: 0, role: 'stand', heading: face(ROAD_WAYFARER, { x: -14.5, z: 85.5 }), solid: true },
  // Rishon LeZion
  { id: 'debora', x: DEBORA.x, z: DEBORA.z, variant: 3, role: 'stand', heading: face(DEBORA, { x: 76, z: 148 }), solid: true },
  { id: 'farmer-1', x: 94, z: 160, variant: 2, role: 'stand', heading: face({ x: 94, z: 160 }, { x: 92, z: 157 }) },
  { id: 'farmer-2', x: 90.2, z: 154.6, variant: 2, role: 'stand', heading: face({ x: 90.2, z: 154.6 }, { x: 92, z: 157 }) },
  { id: 'farmer-3', x: 104, z: 158, variant: 2, role: 'pace', toX: 112, toZ: 152, speed: 0.9 },
  { id: 'colonist', x: 82, z: 142, variant: 3, role: 'pace', toX: 96, toZ: 146, speed: 0.8 },
  { id: 'field-farmer', x: 112, z: 132, variant: 2, role: 'stand', heading: face({ x: 112, z: 132 }, { x: 80, z: 150 }) },
  // The village
  { id: 'jamila', x: JAMILA.x, z: JAMILA.z, variant: 1, role: 'stand', heading: face(JAMILA, { x: 66, z: 62 }), solid: true },
  { id: 'kid-guide', x: 64.6, z: 61.6, variant: 3, role: 'stand', heading: 1.2, scale: 0.7 },
  { id: 'oven-woman', x: OVEN_WOMAN.x, z: OVEN_WOMAN.z, variant: 3, role: 'stand', heading: face(OVEN_WOMAN, { x: 80, z: 45 }), solid: true },
  { id: 'neighbor-v', x: 77, z: 69, variant: 1, role: 'stand', heading: face({ x: 77, z: 69 }, { x: 66, z: 64 }), solid: true },
  { id: 'kid-1', x: 68, z: 66, variant: 3, role: 'circle', radius: 3, speed: 2.4, scale: 0.68 },
  { id: 'kid-2', x: 68, z: 66, variant: 1, role: 'circle', radius: 2.2, speed: -2.9, scale: 0.62 },
  { id: 'kid-3', x: 61, z: 56, variant: 2, role: 'circle', radius: 2.6, speed: 2.1, scale: 0.7 },
  { id: 'wedding-1', x: 72, z: 49, variant: 3, role: 'pace', toX: 76, toZ: 52, speed: 0.6 },
  { id: 'wedding-2', x: 78, z: 49.5, variant: 1, role: 'pace', toX: 71, toZ: 50.5, speed: 0.5 },
  { id: 'villager-field', x: 92, z: 62, variant: 2, role: 'pace', toX: 100, toZ: 70, speed: 0.7 },
  // Jaffa station
  { id: 'stationmaster', x: STATIONMASTER.x, z: STATIONMASTER.z, variant: 0, role: 'stand', heading: face(STATIONMASTER, { x: 14, z: 42 }), solid: true },
  { id: 'passenger-1', x: 6, z: 43, variant: 3, role: 'stand', heading: 1.4 },
  { id: 'passenger-2', x: 15, z: 43.4, variant: 2, role: 'stand', heading: 2.8 },
  // Jerusalem
  { id: 'eliyahu', x: ELIYAHU.x, z: ELIYAHU.z, variant: 1, role: 'stand', heading: face(ELIYAHU, { x: 138, z: -127 }), solid: true },
  { id: 'neighbor-j', x: 148.4, z: -130, variant: 3, role: 'stand', heading: -PI_HALF, solid: true },
  { id: 'walker-j', x: 126, z: -116, variant: 0, role: 'pace', toX: 134, toZ: -124, speed: 0.8 },
];

/** Solid colliders for the named characters (registered in headless runs too). */
export function folkColliders(): Collider[] {
  return FOLK.filter((f) => f.solid).map((f) => circle(f.x, f.z, 0.5, 1.8));
}

interface Slot {
  readonly spec: FolkSpec;
  readonly crowd: Crowd;
  readonly index: number;
  /** Pace: length of the pace; precomputed. */
  readonly length: number;
  readonly phase: number;
}

export class Folk {
  private readonly material: FigureMaterial;
  private readonly crowds: Crowd[] = [];
  private readonly slots: Slot[] = [];

  constructor(
    private readonly world: LevelWorld,
    private readonly reducedMotion: () => boolean,
  ) {
    this.material = world.bag.track(new FigureMaterial());
    const byVariant: FolkSpec[][] = [[], [], [], []];
    for (const f of FOLK) (byVariant[f.variant] as FolkSpec[]).push(f);
    byVariant.forEach((specs, variant) => {
      if (specs.length === 0) return;
      const geo = figureGeometry({ era: 'ottoman1890', variant, seed: 'folk' + String(variant) });
      const crowd = new Crowd(geo, this.material, specs.length);
      crowd.mesh.frustumCulled = false;
      world.bag.track(crowd);
      world.scene.add(crowd.mesh);
      this.crowds.push(crowd);
      specs.forEach((spec, index) => {
        const length = spec.role === 'pace' ? Math.hypot((spec.toX ?? spec.x) - spec.x, (spec.toZ ?? spec.z) - spec.z) : 0;
        this.slots.push({ spec, crowd, index, length, phase: (index * 0.37 + variant * 0.19) % 1 });
      });
    });
    this.update(0);
    for (const c of this.crowds) c.setDirty();
    world.onVisual((_dt, elapsed) => {
      this.material.update(elapsed);
      this.update(elapsed);
    });
  }

  /** Positions everyone for a point in time (pure function of elapsed: no per-frame state). */
  private update(elapsed: number): void {
    const rm = this.reducedMotion();
    const world = this.world;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i] as Slot;
      const sp = s.spec;
      let x = sp.x;
      let z = sp.z;
      let heading = sp.heading ?? 0;
      let walk = 0;
      if (!rm && sp.role === 'pace' && s.length > 0.5) {
        const t = elapsed * (sp.speed ?? 1) / s.length + s.phase;
        const phase = t * Math.PI;
        const k = 0.5 - 0.5 * Math.cos(phase);
        const dx = (sp.toX ?? sp.x) - sp.x;
        const dz = (sp.toZ ?? sp.z) - sp.z;
        x = sp.x + dx * k;
        z = sp.z + dz * k;
        const dir = Math.sin(phase) >= 0 ? 1 : -1;
        heading = Math.atan2(dx * dir, dz * dir);
        walk = 1;
      } else if (!rm && sp.role === 'circle') {
        const r = sp.radius ?? 2;
        const a = elapsed * (sp.speed ?? 2) / r + s.phase * 6;
        x = sp.x + Math.cos(a) * r;
        z = sp.z + Math.sin(a) * r;
        const dir = (sp.speed ?? 1) >= 0 ? 1 : -1;
        heading = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
        walk = 1;
      } else if (sp.role !== 'stand') {
        heading = 0;
      }
      s.crowd.set(s.index, x, world.heightAt(x, z), z, heading, walk, s.phase * 6.28, sp.scale ?? 1);
    }
    for (let i = 0; i < this.crowds.length; i++) {
      const c = this.crowds[i] as Crowd;
      c.markMoved();
      c.gait.needsUpdate = true;
    }
  }
}
