import { Crowd, figureGeometry, FigureMaterial } from '../../../world/kit/figures';
import type { LevelWorld } from '../../../gameplay/runtime/levelKit';
import { CREW_ANCHORS, CREW_COUNT, NEIGHBOR_SPOT, TOWER_BASE, type Spot, type Stage } from './rules';

/** He faces the tower. */
const NEIGHBOR_HEADING = Math.atan2(TOWER_BASE.x - NEIGHBOR_SPOT.x, TOWER_BASE.z - NEIGHBOR_SPOT.z);

/**
 * The work team: labeled FICTIONAL COMPOSITE figures (two instanced crowds, one draw call each)
 * that walk between two anchors per stage, pause, and turn back. A child from a nearby
 * settlement can walk in with water. No allocation after construction.
 */

const SPEED = 1.5;
const PAUSE = 1.1;
const GIRL = CREW_COUNT;

interface Walker {
  x: number;
  z: number;
  heading: number;
  pause: number;
  toB: boolean;
  phase: number;
}

export class Crew {
  private readonly crowdA: Crowd;
  private readonly crowdB: Crowd;
  /** One man from the village on the hill, standing at the field's edge from dusk. */
  private readonly crowdC: Crowd;
  private neighborVisible = false;
  private readonly walkers: Walker[] = [];
  private anchors: readonly Spot[] = CREW_ANCHORS.dawn;
  /** Girl who brings water: walks from `from` to `to` while `girlActive`. */
  private girlActive = false;
  private girlFrom: Spot = { x: 0, z: 0 };
  private girlTo: Spot = { x: 0, z: 0 };
  private girlT = 0;
  private readonly material: FigureMaterial;

  constructor(private readonly world: LevelWorld) {
    this.material = world.bag.track(new FigureMaterial(world.opts.era));
    const era = 'mandate1940' as const;
    const geoA = world.bag.geometry(figureGeometry({ era, variant: 1, seed: 'crew-a' }));
    const geoB = world.bag.geometry(figureGeometry({ era, variant: 2, seed: 'crew-b' }));
    this.crowdA = world.bag.track(new Crowd(geoA, this.material, 3));
    this.crowdB = world.bag.track(new Crowd(geoB, this.material, 4));
    const geoC = world.bag.geometry(figureGeometry({ era, variant: 3, seed: 'neighbor' }));
    this.crowdC = world.bag.track(new Crowd(geoC, this.material, 1));
    for (const c of [this.crowdA, this.crowdB, this.crowdC]) {
      c.mesh.frustumCulled = false;
      world.scene.add(c.mesh);
    }
    for (let i = 0; i < CREW_COUNT + 1; i++) this.walkers.push({ x: 0, z: 0, heading: 0, pause: 0, toB: true, phase: i * 1.7 });
    this.setStage('dawn', true);
    this.hideGirl();
    world.onVisual((dt, elapsed) => this.update(dt, elapsed));
  }

  /** Switches the anchors; `snap` teleports the team (checkpoint restart). */
  setStage(stage: Stage, snap: boolean): void {
    this.anchors = CREW_ANCHORS[stage];
    this.neighborVisible = stage === 'dusk' || stage === 'lenses';
    for (let i = 0; i < CREW_COUNT; i++) {
      const w = this.walkers[i] as Walker;
      const a = this.anchors[i * 2] as Spot;
      w.toB = true;
      w.pause = snap ? 0 : 0.2 * i;
      if (snap) {
        w.x = a.x;
        w.z = a.z;
      }
    }
  }

  /** The child with the water jug walks to `to` and stays. */
  startGirl(from: Spot, to: Spot): void {
    this.girlActive = true;
    this.girlFrom = from;
    this.girlTo = to;
    this.girlT = 0;
    const g = this.walkers[GIRL] as Walker;
    g.x = from.x;
    g.z = from.z;
  }

  hideGirl(): void {
    this.girlActive = false;
    const g = this.walkers[GIRL] as Walker;
    g.x = 0;
    g.z = -400;
    this.crowdB.set(3, 0, -400, -400, 0, 0, 0, 0.0001);
    this.crowdB.markMoved();
  }

  private update(dt: number, elapsed: number): void {
    for (let i = 0; i < CREW_COUNT; i++) {
      const w = this.walkers[i] as Walker;
      const target = this.anchors[i * 2 + (w.toB ? 1 : 0)] as Spot;
      let walk = 0;
      if (w.pause > 0) {
        w.pause -= dt;
      } else {
        const dx = target.x - w.x;
        const dz = target.z - w.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.15) {
          w.toB = !w.toB;
          w.pause = PAUSE;
        } else {
          const step = Math.min(d, SPEED * dt);
          w.x += (dx / d) * step;
          w.z += (dz / d) * step;
          w.heading = Math.atan2(dx, dz);
          walk = 1;
        }
      }
      const crowd = i < 3 ? this.crowdA : this.crowdB;
      const slot = i < 3 ? i : i - 3;
      crowd.set(slot, w.x, this.world.heightAt(w.x, w.z), w.z, w.heading, walk, w.phase);
    }
    if (this.girlActive) {
      const g = this.walkers[GIRL] as Walker;
      this.girlT = Math.min(1, this.girlT + (dt * SPEED) / Math.max(1, Math.hypot(this.girlTo.x - this.girlFrom.x, this.girlTo.z - this.girlFrom.z)));
      g.x = this.girlFrom.x + (this.girlTo.x - this.girlFrom.x) * this.girlT;
      g.z = this.girlFrom.z + (this.girlTo.z - this.girlFrom.z) * this.girlT;
      g.heading = Math.atan2(this.girlTo.x - this.girlFrom.x, this.girlTo.z - this.girlFrom.z);
      this.crowdB.set(3, g.x, this.world.heightAt(g.x, g.z), g.z, g.heading, this.girlT < 1 ? 1 : 0, 0.5, 0.82);
    }
    if (this.neighborVisible) this.crowdC.set(0, NEIGHBOR_SPOT.x, this.world.heightAt(NEIGHBOR_SPOT.x, NEIGHBOR_SPOT.z), NEIGHBOR_SPOT.z, NEIGHBOR_HEADING, 0, 0.3);
    else this.crowdC.set(0, 0, -400, -400, 0, 0, 0, 0.0001);
    this.crowdA.markMoved();
    this.crowdB.markMoved();
    this.crowdC.markMoved();
    this.crowdA.gait.needsUpdate = true;
    this.crowdB.gait.needsUpdate = true;
    this.crowdC.gait.needsUpdate = true;
    this.material.update(elapsed);
  }
}
