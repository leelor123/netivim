import * as THREE from 'three';
import { resolveCircle } from '../../../gameplay/core/collision';
import { turnToward } from '../../../gameplay/core/movement';
import type { LevelWorld } from '../../../gameplay/runtime/levelKit';
import { kitBuilder } from '../../../world/kit/buildings';
import { donkeyCart } from '../../../world/kit/vehicles';
import { CART_CAPACITY, WEIGHT_LETTER, WEIGHT_PARCEL, WEIGHT_PARTS } from './layout';

/** The courier leads the donkey: the cart trails the player on a short leash. */
const LEASH = 3.9;
const SPEED = 5.2;
const TURN = 4;
const RADIUS = 1.0;
const CATCH_UP = 40;

/** Four floating parts of the cart-load display; set() shows what is on the cart. */
export class Cart {
  readonly group = new THREE.Group();
  x = 0;
  z = 0;
  heading = 0;
  load = 0;
  private readonly cargoParts: THREE.Mesh;
  private readonly cargoParcel: THREE.Mesh;
  private readonly cargoLetter: THREE.Mesh;
  private readonly fill: THREE.Mesh;
  private readonly fillMaterial: THREE.MeshBasicMaterial;
  private readonly p = { x: 0, z: 0 };
  private shownLoad = -1;

  constructor(private readonly world: LevelWorld) {
    const mats = world.mats;
    const body = new THREE.Mesh(world.bag.geometry(donkeyCart({ era: 'ottoman1890', seed: 'cart', load: false })), mats.solid);
    body.castShadow = world.opts.quality.shadows;
    this.group.add(body);

    const parts = kitBuilder({ era: 'ottoman1890', seed: 'parts' }, 0.1);
    parts.block(0.95, 0.5, 0.8, '#4f565a', 0, 0.78, -0.8);
    for (let i = 0; i < 3; i++) parts.cyl(0.11, 0.11, 1.2, 8, '#6a7074', -0.35 + i * 0.35, 1.38, -0.8, Math.PI / 2);
    this.cargoParts = this.mesh(parts.build());

    const parcel = kitBuilder({ era: 'ottoman1890', seed: 'parcel' }, 0.1);
    parcel.block(0.6, 0.4, 0.5, '#c9b48d', 0.2, 1.65, -0.8);
    parcel.box(0.64, 0.05, 0.08, '#7a5a3c', 0.2, 1.85, -0.8);
    this.cargoParcel = this.mesh(parcel.build());

    const letter = kitBuilder({ era: 'ottoman1890', seed: 'letter' }, 0.05);
    letter.box(0.4, 0.04, 0.28, '#efe7d4', -0.3, 1.88, -0.7, 0.3);
    letter.box(0.1, 0.045, 0.1, '#a3322a', -0.3, 1.9, -0.7, 0.3);
    this.cargoLetter = this.mesh(letter.build());

    const back = new THREE.Mesh(world.bag.geometry(new THREE.BoxGeometry(2, 0.12, 0.12)), world.bag.material(new THREE.MeshBasicMaterial({ color: '#2b2522' })));
    back.position.set(0, 2.7, -0.6);
    this.fillMaterial = world.bag.material(new THREE.MeshBasicMaterial({ color: '#4fa37a' }));
    this.fill = new THREE.Mesh(world.bag.geometry(new THREE.BoxGeometry(1, 0.16, 0.16).translate(0.5, 0, 0)), this.fillMaterial);
    this.fill.position.set(-1, 2.7, -0.6);
    this.group.add(back, this.fill);
    world.scene.add(this.group);
    this.set(false, false, false);
  }

  private mesh(geometry: THREE.BufferGeometry): THREE.Mesh {
    const m = new THREE.Mesh(this.world.bag.geometry(geometry), this.world.mats.solid);
    m.castShadow = this.world.opts.quality.shadows;
    this.group.add(m);
    return m;
  }

  /** Puts the cart at a spot (checkpoint, spawn). */
  place(x: number, z: number, heading: number): void {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.sync();
  }

  /** Shows the load and updates the capacity bar. */
  set(parts: boolean, parcel: boolean, letter: boolean): void {
    this.cargoParts.visible = parts;
    this.cargoParcel.visible = parcel;
    this.cargoLetter.visible = letter;
    this.load = (parts ? WEIGHT_PARTS : 0) + (parcel ? WEIGHT_PARCEL : 0) + (letter ? WEIGHT_LETTER : 0);
    if (this.load === this.shownLoad) return;
    this.shownLoad = this.load;
    const frac = Math.min(1, this.load / CART_CAPACITY);
    this.fill.scale.x = Math.max(0.001, 2 * frac);
    this.fillMaterial.color.set(frac >= 1 ? '#d8a14a' : '#4fa37a');
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  /** Follows the leader on its leash (fixed step). */
  update(dt: number, leaderX: number, leaderZ: number): void {
    let dx = leaderX - this.x;
    let dz = leaderZ - this.z;
    let d = Math.hypot(dx, dz);
    if (d > CATCH_UP) {
      // The donkey is never lost (a resumed save, a checkpoint): it stands behind the courier again.
      this.x = leaderX - Math.sin(this.heading) * LEASH;
      this.z = leaderZ - Math.cos(this.heading) * LEASH;
      dx = leaderX - this.x;
      dz = leaderZ - this.z;
      d = Math.hypot(dx, dz);
    }
    if (d > 0.05) this.heading = turnToward(this.heading, Math.atan2(dx, dz), TURN * dt);
    if (d > LEASH) {
      const step = Math.min(d - LEASH, SPEED * dt);
      this.p.x = this.x + (dx / d) * step;
      this.p.z = this.z + (dz / d) * step;
      resolveCircle(this.p, RADIUS, this.world.colliders, this.world.bounds);
      this.x = this.p.x;
      this.z = this.p.z;
    }
    this.sync();
  }

  distanceTo(x: number, z: number): number {
    return Math.hypot(this.x - x, this.z - z);
  }

  private sync(): void {
    this.group.position.set(this.x, this.world.heightAt(this.x, this.z), this.z);
    this.group.rotation.y = this.heading;
  }
}
