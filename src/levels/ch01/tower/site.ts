import * as THREE from 'three';
import { box, circle, type Collider } from '../../../gameplay/core/collision';
import type { Cell } from '../../../gameplay/modules/puzzle';
import type { LevelWorld } from '../../../gameplay/runtime/levelKit';
import { stoneVillageHouse, tent } from '../../../world/kit/buildings';
import { oliveTree, rock } from '../../../world/kit/nature';
import { Rng } from '../../../world/rng';
import * as M from './models';
import { Puff } from './puff';
import {
  CART_SPOTS,
  CELL,
  cellX,
  cellZ,
  FENCE_GATE_HALF,
  FENCE_POSTS,
  GRAVEL_PILE,
  JUG_SPOT,
  LIGHT_CRATE,
  MEAL_SPOT,
  NEIGHBOR_SPOT,
  RING,
  SIGN_SPOT,
  SECTION_COUNT,
  SECTION_PILE,
  STATION_CELLS,
  STATION_COUNT,
  TABLE_SPOT,
  TENT_SPOTS,
  TOWER_BASE,
  type Carry,
  type TowerSim,
} from './rules';

/**
 * Everything the player sees on the work site and how it follows the TowerSim: instanced wall
 * modules and gravel (one draw call each), carts, the planning ghost, the tower sections, the
 * fence, the searchlight with its beam, lit windows and the carried item. Targets are set from
 * the sim (sync); update() eases toward them. Nothing allocates after construction.
 */

const m4 = new THREE.Matrix4();
const q4 = new THREE.Quaternion();
const p3 = new THREE.Vector3();
const s3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const CORNER_RY = [0, -Math.PI / 2, Math.PI, Math.PI / 2] as const;
const ERA = 'mandate1940' as const;

class Inst {
  readonly mesh: THREE.InstancedMesh;
  private dirty = false;

  constructor(world: LevelWorld, geo: THREE.BufferGeometry, material: THREE.Material, readonly count: number, shadows = true) {
    this.mesh = new THREE.InstancedMesh(world.bag.geometry(geo), material, count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadows && world.opts.quality.shadows;
    this.mesh.receiveShadow = true;
    world.bag.track(this.mesh);
    world.scene.add(this.mesh);
    for (let i = 0; i < count; i++) this.set(i, 0, 0, 0, 0, 0, 0, 0);
    this.flush();
  }

  set(i: number, x: number, y: number, z: number, ry: number, sx: number, sy: number, sz: number): void {
    p3.set(x, y, z);
    q4.setFromAxisAngle(UP, ry);
    s3.set(sx, sy, sz);
    this.mesh.setMatrixAt(i, m4.compose(p3, q4, s3));
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const ease = (t: number): number => t * t * (3 - 2 * t);
/** Ease out with a small overshoot (peaks near 1.1), 0 at 0 and 1 at 1. */
const backOut = (t: number): number => {
  const u = t - 1;
  return 1 + 2.2 * u * u * u + 1.2 * u * u;
};

/** Moves each value toward its target by at most `delta`; true when anything moved. */
function approach(cur: Float32Array, to: Float32Array, delta: number): boolean {
  let moved = false;
  for (let i = 0; i < cur.length; i++) {
    const a = cur[i] ?? 0;
    const b = to[i] ?? 0;
    if (a === b) continue;
    cur[i] = a + Math.sign(b - a) * Math.min(Math.abs(b - a), delta);
    moved = true;
  }
  return moved;
}

export class SiteView {
  private readonly walls: Inst;
  private readonly corners: Inst;
  private readonly gravel: Inst;
  private readonly gravelCorners: Inst;
  private readonly outline: Inst;
  private readonly carts: Inst;
  private readonly loads: Inst;
  private readonly ghost: Inst;
  private readonly cursor: Inst;
  private readonly ghostMat: THREE.MeshBasicMaterial;
  private readonly slot: { corner: boolean; index: number }[] = [];
  private readonly ground: Float32Array;
  private readonly rise: Float32Array;
  private readonly riseTo: Float32Array;
  private readonly fill: Float32Array;
  private readonly fillTo: Float32Array;
  private readonly loadScale = new Float32Array(CART_SPOTS.length).fill(1);
  private readonly loadTo = new Float32Array(CART_SPOTS.length).fill(1);
  private readonly sections: THREE.Mesh[] = [];
  private readonly secRise = new Float32Array(SECTION_COUNT);
  private readonly secTo = new Float32Array(SECTION_COUNT);
  private readonly towerY: number;
  private readonly legs: { mesh: THREE.Mesh; leg: number }[] = [];
  private readonly legRise = new Float32Array(4);
  private readonly legTo = new Float32Array(4);
  private readonly sectionPile: THREE.Mesh;
  private readonly lightCrate: THREE.Mesh;
  private readonly lamp: THREE.Mesh;
  private lampTo = 0;
  private lampRise = 0;
  private readonly blanket: THREE.Mesh;
  private readonly carry: Record<Exclude<Carry, 'none'>, THREE.Mesh>;
  private carrying: Carry = 'none';
  readonly spot: THREE.SpotLight;
  private readonly beam: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private litTo = 0;
  private litLevel = 0;
  private readonly glow: Inst;
  private glowCount = 0;
  private readonly lampPos = new THREE.Vector3();
  private readonly dyn: Collider[] = [];
  private instant = true;
  /** Dust and spark bursts for building feedback. */
  readonly puff: Puff;

  constructor(
    private readonly world: LevelWorld,
    private readonly reduced: () => boolean,
  ) {
    const mats = world.mats;
    this.puff = new Puff(world, reduced);
    const n = RING.length;
    this.ground = new Float32Array(n);
    this.rise = new Float32Array(n);
    this.riseTo = new Float32Array(n);
    this.fill = new Float32Array(n);
    this.fillTo = new Float32Array(n);
    let straight = 0;
    RING.forEach((c, i) => {
      this.ground[i] = world.heightAt(c.x, c.z);
      if (c.kind === 'corner') this.slot.push({ corner: true, index: c.corner });
      else this.slot.push({ corner: false, index: straight++ });
    });
    this.walls = new Inst(world, M.wallModule(), mats.solid, straight);
    this.corners = new Inst(world, M.cornerModule(), mats.solid, 4);
    this.gravel = new Inst(world, M.gravelStraight(), mats.solid, straight, false);
    this.gravelCorners = new Inst(world, M.gravelCorner(), mats.solid, 4, false);
    this.outline = new Inst(world, M.outlineTile(), mats.solid, n, false);

    this.carts = new Inst(world, M.cart(), mats.solid, CART_SPOTS.length);
    this.loads = new Inst(world, M.cartLoad(), mats.solid, CART_SPOTS.length);
    CART_SPOTS.forEach((c, i) => {
      const ry = i % 2 === 0 ? 0.25 : -0.2;
      const y = world.heightAt(c.x, c.z);
      this.carts.set(i, c.x, y, c.z, ry, 1, 1, 1);
      this.loads.set(i, c.x, y, c.z, ry, 1, 1, 1);
    });
    this.carts.flush();
    this.loads.flush();

    this.ghostMat = world.bag.material(new THREE.MeshBasicMaterial({ color: 0x7fd36a, transparent: true, opacity: 0.65, depthWrite: false }));
    const tile = world.bag.geometry(new THREE.BoxGeometry(CELL - 0.3, 0.12, CELL - 0.3).translate(0, 0.06, 0));
    this.ghost = new Inst(world, tile, this.ghostMat, 4, false);
    this.ghost.mesh.count = 0;
    const cursorMat = world.bag.material(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    const cursorTile = world.bag.geometry(new THREE.BoxGeometry(CELL, 0.05, CELL).translate(0, 0.03, 0));
    this.cursor = new Inst(world, cursorTile, cursorMat, 1, false);
    this.cursor.mesh.visible = false;

    // Tower sections (local y is absolute above the base) and the lamp head.
    this.towerY = world.heightAt(TOWER_BASE.x, TOWER_BASE.z);
    for (let k = 0; k < SECTION_COUNT; k++) {
      const mesh = new THREE.Mesh(world.bag.geometry(M.towerSection(k)), mats.solid);
      mesh.castShadow = world.opts.quality.shadows;
      mesh.receiveShadow = true;
      mesh.position.set(TOWER_BASE.x, this.towerY, TOWER_BASE.z);
      mesh.visible = false;
      world.scene.add(mesh);
      this.sections.push(mesh);
    }
    this.lamp = new THREE.Mesh(world.bag.geometry(M.lampHead()), mats.solid);
    this.lamp.visible = false;
    world.scene.add(this.lamp);
    this.lampPos.set(TOWER_BASE.x, this.towerY + M.TOWER_TOP_Y + 0.35, TOWER_BASE.z);
    this.lamp.position.copy(this.lampPos);

    // Searchlight: a real spot light plus a soft additive cone so the beam reads in the dusk haze.
    this.spot = new THREE.SpotLight(0xffeccc, 0, 70, 0.32, 0.55, 1.3);
    this.spot.castShadow = false;
    this.spot.position.copy(this.lampPos);
    world.scene.add(this.spot, this.spot.target);
    const beamMat = world.bag.material(new THREE.MeshBasicMaterial({ color: 0xffe9b8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.beam = new THREE.Mesh(world.bag.geometry(M.beamCone(46, 3.4)), beamMat);
    this.beam.rotation.order = 'YXZ';
    this.beam.position.copy(this.lampPos);
    this.beam.visible = false;
    world.scene.add(this.beam);

    // Fence legs between the posts (the south leg leaves a gap for the gate).
    FENCE_POSTS.forEach((a, k) => {
      const b = FENCE_POSTS[(k + 1) % FENCE_POSTS.length] as (typeof FENCE_POSTS)[number];
      const post = new THREE.Mesh(world.bag.geometry(M.fencePost()), mats.solid);
      post.position.set(a.x, world.heightAt(a.x, a.z), a.z);
      post.castShadow = world.opts.quality.shadows;
      world.scene.add(post);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const ry = Math.atan2(-(b.z - a.z), b.x - a.x);
      const south = Math.abs(a.z - b.z) < 1e-6 && a.z > 0;
      const pieces = south ? 2 : 1;
      for (let j = 0; j < pieces; j++) {
        const seg = south ? len / 2 - FENCE_GATE_HALF : len;
        const t = south ? (j === 0 ? 0.5 - (FENCE_GATE_HALF + seg / 2) / len : 0.5 + (FENCE_GATE_HALF + seg / 2) / len) : 0.5;
        const mx = a.x + (b.x - a.x) * t;
        const mz = a.z + (b.z - a.z) * t;
        const mesh = new THREE.Mesh(world.bag.geometry(M.fenceLeg(seg)), mats.solid);
        mesh.position.set(mx, world.heightAt(mx, mz), mz);
        mesh.rotation.y = ry;
        mesh.visible = false;
        world.scene.add(mesh);
        this.legs.push({ mesh, leg: k });
      }
    });

    // Fixed props with colliders.
    const era = { era: ERA } as const;
    CART_SPOTS.forEach((c, i) => world.colliders.push(box(c.x + 0.4, c.z, 1.5, 0.95, 1.2 + i * 0)));
    world.place(M.planningTable(), TABLE_SPOT.x, TABLE_SPOT.z, 0.2, box(TABLE_SPOT.x, TABLE_SPOT.z, 1.3, 0.8, 1));
    world.place(M.gravelPile(), GRAVEL_PILE.x, GRAVEL_PILE.z, 0.3, circle(GRAVEL_PILE.x, GRAVEL_PILE.z, 1.5, 1.4));
    this.sectionPile = world.place(M.sectionPile(), SECTION_PILE.x, SECTION_PILE.z, 0.1, box(SECTION_PILE.x, SECTION_PILE.z, 1.3, 1.1, 1));
    this.lightCrate = world.place(M.lightCrate(), LIGHT_CRATE.x, LIGHT_CRATE.z, 0.4, circle(LIGHT_CRATE.x, LIGHT_CRATE.z, 0.7, 1.2));
    world.place(M.jug(), JUG_SPOT.x, JUG_SPOT.z, 0, circle(JUG_SPOT.x, JUG_SPOT.z, 0.6, 1));
    world.place(M.signboard(), SIGN_SPOT.x, SIGN_SPOT.z, 0.15, box(SIGN_SPOT.x, SIGN_SPOT.z, 1.1, 0.4, 1));
    world.colliders.push(circle(NEIGHBOR_SPOT.x, NEIGHBOR_SPOT.z, 0.6, 1.8));
    this.blanket = world.place(M.mealBlanket(), MEAL_SPOT.x, MEAL_SPOT.z, 0.2);
    this.blanket.visible = false;
    TENT_SPOTS.forEach((t, i) => world.place(tent({ ...era, seed: 'tent-' + String(i) }), t.x, t.z, 0, box(t.x, t.z, 1.6, 2.1, 2)));
    // Corner stakes with red rags on the outside of the ring corners.
    for (const [sx, sz] of [
      [cellX(0) - 1.4, cellZ(0) - 1.4],
      [cellX(11) + 1.4, cellZ(0) - 1.4],
      [cellX(11) + 1.4, cellZ(8) + 1.4],
      [cellX(0) - 1.4, cellZ(8) + 1.4],
    ] as const) {
      world.place(M.stake(), sx, sz, sx * 0.3);
    }

    // Scenery: olive trees and rocks around the edges, and the village on the hill.
    const rng = new Rng('tower-scenery');
    const trees: readonly (readonly [number, number])[] = [
      [-26, -6], [-24, -20], [24, -8], [27, 4], [22, -24], [-30, 10], [30, 14], [-20, 22], [18, 24], [-8, -26], [6, -27], [34, -14], [-34, -12], [0, 27], [-38, 0], [38, -4],
    ];
    trees.forEach(([x, z], i) => world.place(oliveTree({ ...era, seed: 'olive-' + String(i) }), x, z, rng.range(0, 6), circle(x, z, 0.7, 3)));
    for (const [x, z, s] of [
      [-22, 14, 1.1], [21, 16, 0.9], [-19, -26, 1.3], [26, -20, 1.0], [13, -24, 0.8], [-31, -4, 1.2],
    ] as const) {
      world.place(rock({ ...era, seed: 'rock-' + String(x), size: s }), x, z, rng.range(0, 6), circle(x, z, s * 0.9, 1.2));
    }
    const glowSpots: { x: number; y: number; z: number; ry: number }[] = [];
    const houses: readonly (readonly [number, number, number, string])[] = [
      [-52, -40, 0.35, 'village-a'],
      [-45, -47, -0.4, 'village-b'],
      [-58, -48, 0.8, 'village-c'],
      [-50, -52, 0.1, 'village-d'],
    ];
    for (const [x, z, ry, seed] of houses) {
      world.place(stoneVillageHouse({ ...era, seed }), x, z, ry, box(x, z, 3.4, 3.1, 4));
      // Same random draw order as stoneVillageHouse: width, then depth.
      const r = new Rng(seed);
      const w = r.range(5, 7);
      const d = r.range(4.5, 6);
      const lx = w * 0.25;
      const lz = d / 2 + 0.05;
      glowSpots.push({ x: x + lx * Math.cos(ry) + lz * Math.sin(ry), y: world.heightAt(x, z) + 1.9, z: z - lx * Math.sin(ry) + lz * Math.cos(ry), ry });
    }
    // Lanterns on the compound (appear at dusk).
    for (const [x, z] of [
      [-2.2, 4.4],
      [2.2, 4.4],
      [-4.4, -6.2],
      [4.4, -5.8],
    ] as const) {
      world.place(M.lampPost(), x, z, 0);
      glowSpots.push({ x: x + 0.3, y: world.heightAt(x, z) + 2.85, z, ry: 0 });
    }
    this.glow = new Inst(world, M.windowGlow(), mats.glow, glowSpots.length, false);
    glowSpots.forEach((g, i) => this.glow.set(i, g.x, g.y, g.z, g.ry, 1, 1, 1));
    this.glow.flush();
    this.glowCount = glowSpots.length;
    this.glow.mesh.visible = false;

    // Carried items follow the player.
    this.carry = {
      gravel: this.carryMesh(M.bucket()),
      section: this.carryMesh(M.carriedBeam()),
      light: this.carryMesh(M.lampHead()),
    };

    // Mark the wall cells on the ground.
    RING.forEach((c, i) => this.outline.set(i, c.x, this.ground[i] ?? 0, c.z, 0, 1, 1, 1));
    this.outline.flush();
  }

  private carryMesh(geo: THREE.BufferGeometry): THREE.Mesh {
    const mesh = new THREE.Mesh(this.world.bag.geometry(geo), this.world.mats.solid);
    mesh.visible = false;
    this.world.scene.add(mesh);
    return mesh;
  }

  /** Ring slot of the cell covered by station k's first cell, used by tests. */
  stationRing(k: number): readonly number[] {
    return (STATION_CELLS[k] ?? []).map((c) => RING.indexOf(c));
  }

  /** Moves every visual target to match the sim. `snap` jumps there at once (checkpoint restart). */
  sync(sim: TowerSim, snap: boolean): void {
    const covered = new Set<number>();
    if (sim.puzzle.placedCount > 0) {
      for (const id of Object.keys(sim.snapshot().placed)) {
        const pl = sim.puzzle.placementOf(id);
        if (!pl) continue;
        for (const [cx, cy] of sim.puzzle.cellsOf(id, pl)) {
          const idx = RING.findIndex((c) => c.cx === cx && c.cy === cy);
          if (idx >= 0) covered.add(idx);
        }
      }
    }
    for (let i = 0; i < RING.length; i++) this.riseTo[i] = covered.has(i) ? 1 : 0;
    for (let k = 0; k < STATION_COUNT; k++) for (const c of STATION_CELLS[k] ?? []) this.fillTo[RING.indexOf(c)] = sim.filled[k] ? 1 : 0;
    for (let i = 0; i < CART_SPOTS.length; i++) this.loadTo[i] = sim.unloaded[i] ? 0 : 1;
    for (let k = 0; k < SECTION_COUNT; k++) this.secTo[k] = sim.sections > k ? 1 : 0;
    for (let k = 0; k < 4; k++) this.legTo[k] = sim.fence > k ? 1 : 0;
    this.lampTo = sim.lightMounted ? 1 : 0;
    this.litTo = sim.lit ? 1 : 0;
    this.sectionPile.visible = sim.sections + (sim.carry === 'section' ? 1 : 0) < SECTION_COUNT;
    this.lightCrate.visible = !sim.lightMounted && sim.carry !== 'light';
    this.blanket.visible = STAGE_AFTER_NOON.includes(sim.stage);
    this.setCarry(sim.carry);
    if (snap) {
      this.rise.set(this.riseTo);
      this.fill.set(this.fillTo);
      this.loadScale.set(this.loadTo);
      this.secRise.set(this.secTo);
      this.legRise.set(this.legTo);
      this.lampRise = this.lampTo;
      this.litLevel = this.litTo;
    }
    this.instant = snap;
    this.applyColliders(sim);
    this.paint();
  }

  setCarry(c: Carry): void {
    this.carrying = c;
    this.carry.gravel.visible = c === 'gravel';
    this.carry.section.visible = c === 'section';
    this.carry.light.visible = c === 'light';
  }

  /** Planning ghost: the cells the selected frame would cover. */
  setGhost(cells: readonly Cell[], fits: boolean, cursor: Cell | null): void {
    this.ghostMat.color.setHex(fits ? 0x7fd36a : 0xe0604a);
    this.ghost.mesh.count = cells.length;
    cells.forEach(([cx, cy], i) => this.ghost.set(i, cellX(cx), this.world.heightAt(cellX(cx), cellZ(cy)) + 0.05, cellZ(cy), 0, 1, 1, 1));
    this.ghost.flush();
    this.ghost.mesh.visible = cells.length > 0;
    if (cursor) {
      this.cursor.set(0, cellX(cursor[0]), this.world.heightAt(cellX(cursor[0]), cellZ(cursor[1])) + 0.02, cellZ(cursor[1]), 0, 1, 1, 1);
      this.cursor.flush();
      this.cursor.mesh.visible = true;
    }
  }

  hideGhost(): void {
    this.ghost.mesh.visible = false;
    this.cursor.mesh.visible = false;
  }

  /** Replaces the dynamic colliders (placed wall cells, the standing tower). */
  private applyColliders(sim: TowerSim): void {
    for (const c of this.dyn) {
      const i = this.world.colliders.indexOf(c);
      if (i >= 0) this.world.colliders.splice(i, 1);
    }
    this.dyn.length = 0;
    for (let i = 0; i < RING.length; i++) {
      if (this.riseTo[i] !== 1) continue;
      const c = RING[i];
      if (c) this.dyn.push(box(c.x, c.z, CELL / 2, CELL / 2, 2.4));
    }
    if (sim.sections > 0 || sim.carry === 'section') this.dyn.push(box(TOWER_BASE.x, TOWER_BASE.z, 1.55, 1.55, 6));
    for (const c of this.dyn) this.world.colliders.push(c);
  }

  /** Writes the instance matrices from the current eased values. */
  private paint(): void {
    for (let i = 0; i < RING.length; i++) {
      const c = RING[i];
      const sl = this.slot[i];
      if (!c || !sl) continue;
      const g = this.ground[i] ?? 0;
      // Walls overshoot a little and settle: the frame "snaps" into place.
      const r = backOut(this.rise[i] ?? 0);
      const ry = c.kind === 'corner' ? (CORNER_RY[c.corner] ?? 0) : c.kind === 'v' ? Math.PI / 2 : 0;
      const fl = ease(this.fill[i] ?? 0);
      const wall = c.kind === 'corner' ? this.corners : this.walls;
      const gr = c.kind === 'corner' ? this.gravelCorners : this.gravel;
      // Hidden pieces collapse to a point: a flat (zero-height) box would shade as black.
      if (r > 0.001) wall.set(sl.index, c.x, g, c.z, ry, 1, r, 1);
      else wall.set(sl.index, c.x, g, c.z, ry, 0, 0, 0);
      if (fl > 0.001) gr.set(sl.index, c.x, g + 0.1, c.z, ry, 1, fl, 1);
      else gr.set(sl.index, c.x, g + 0.1, c.z, ry, 0, 0, 0);
      const o = Math.max(0, 1 - r);
      if (o > 0.001) this.outline.set(i, c.x, g + 0.03, c.z, 0, o, 1, o);
      else this.outline.set(i, c.x, g + 0.03, c.z, 0, 0, 0, 0);
    }
    for (const part of [this.walls, this.corners, this.gravel, this.gravelCorners, this.outline]) part.flush();
    CART_SPOTS.forEach((c, i) => {
      const y = this.world.heightAt(c.x, c.z);
      const s = ease(this.loadScale[i] ?? 0);
      if (s > 0.001) this.loads.set(i, c.x, y, c.z, i % 2 === 0 ? 0.25 : -0.2, 1, s, 1);
      else this.loads.set(i, c.x, y, c.z, 0, 0, 0, 0);
    });
    this.loads.flush();
    for (let k = 0; k < SECTION_COUNT; k++) {
      const mesh = this.sections[k];
      if (!mesh) continue;
      const r = ease(this.secRise[k] ?? 0);
      mesh.visible = r > 0.001;
      mesh.position.y = this.towerY - (1 - r) * 9;
    }
    for (const { mesh, leg } of this.legs) {
      const r = ease(this.legRise[leg] ?? 0);
      mesh.visible = r > 0.001;
      mesh.scale.x = Math.max(0.001, r);
    }
    this.lamp.visible = this.lampRise > 0.001;
    this.lamp.scale.setScalar(Math.max(0.001, ease(this.lampRise)));
  }

  /**
   * Visual step: eases the values and moves the beam and the carried item.
   * `dusk` is 0-1 (windows, lanterns); `bearing` is the searchlight yaw.
   */
  update(dt: number, elapsed: number, px: number, py: number, pz: number, heading: number, dusk: number): void {
    const speed = this.instant || this.reduced() ? 1000 : 1;
    this.puff.update(dt);
    let moving = false;
    if (approach(this.rise, this.riseTo, 2.2 * speed * dt)) moving = true;
    if (approach(this.fill, this.fillTo, 0.9 * speed * dt)) moving = true;
    if (approach(this.loadScale, this.loadTo, 4 * speed * dt)) moving = true;
    if (approach(this.secRise, this.secTo, 0.9 * speed * dt)) moving = true;
    if (approach(this.legRise, this.legTo, 1.4 * speed * dt)) moving = true;
    if (this.lampRise !== this.lampTo) {
      this.lampRise += Math.sign(this.lampTo - this.lampRise) * Math.min(Math.abs(this.lampTo - this.lampRise), 3 * speed * dt);
      moving = true;
    }
    if (moving) this.paint();
    this.instant = false;

    // Searchlight.
    if (this.litLevel !== this.litTo) this.litLevel += Math.sign(this.litTo - this.litLevel) * Math.min(Math.abs(this.litTo - this.litLevel), 0.6 * speed * dt);
    const on = this.litLevel > 0.001;
    this.spot.intensity = 380 * this.litLevel;
    this.beam.visible = on;
    this.beam.material.opacity = 0.13 * this.litLevel;
    if (on) {
      // Sweep slowly over the approaches south of the compound (never toward the village).
      const yaw = this.reduced() ? 0.2 : Math.sin(elapsed * 0.45) * 0.85 + 0.2;
      const pitch = 0.2;
      this.beam.rotation.set(pitch, yaw, 0);
      const cp = Math.cos(pitch);
      this.spot.target.position.set(this.lampPos.x + Math.sin(yaw) * cp * 30, this.lampPos.y - Math.sin(pitch) * 30, this.lampPos.z + Math.cos(yaw) * cp * 30);
      this.lamp.rotation.y = yaw;
    }
    this.glow.mesh.visible = dusk > 0.35 && this.glowCount > 0;

    // Carried item above the player's head.
    if (this.carrying !== 'none') {
      const m = this.carry[this.carrying];
      m.position.set(px, py + 2.0, pz);
      m.rotation.y = heading;
    }
  }
}

const STAGE_AFTER_NOON: readonly string[] = ['tower', 'fence', 'dusk', 'lenses'];
