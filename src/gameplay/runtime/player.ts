import type * as THREE from 'three';
import { Crowd, figureGeometry, FigureMaterial } from '../../world/kit/figures';
import type { EraId } from '../../world/eraLook';
import { CharacterMotor, DEFAULT_MOTOR, type MotorParams } from '../core/movement';
import { applyLook, DEFAULT_ORBIT, orbitPosition, safeDistance, smoothDistance, type OrbitParams, type OrbitState } from '../core/orbit';
import type { LevelInput, PlayerView } from '../types';
import type { LevelWorld } from './levelKit';

export type CameraMode = 'follow' | 'planning' | 'vehicle';

/**
 * Camera rig with three modes: third-person orbit (right stick, collision-safe distance),
 * top-down planning table (stick pans, triggers zoom) and vehicle follow (behind a heading).
 * Reduced motion: no lag on follow, no pulsing, slower look speed.
 */
export class CameraRig {
  mode: CameraMode = 'follow';
  readonly orbit: OrbitState = { yaw: 0, pitch: 0.35, distance: DEFAULT_ORBIT.distance };
  params: OrbitParams = DEFAULT_ORBIT;
  /** Planning table center and height. */
  readonly plan = { x: 0, z: 0, height: 60, minHeight: 20, maxHeight: 120, panSpeed: 30 };
  /** Vehicle follow target (set each step by the level). */
  readonly vehicle = { x: 0, y: 0, z: 0, heading: 0, distance: 14, height: 6 };
  private readonly pos = { x: 0, y: 0, z: 0 };
  private vYaw = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly world: Pick<LevelWorld, 'heightAt' | 'colliders'>,
    private readonly reducedMotion: () => boolean,
  ) {}

  /** Yaw used for camera-relative movement. */
  get yaw(): number {
    return this.mode === 'planning' ? Math.PI : this.mode === 'vehicle' ? this.vYaw : this.orbit.yaw;
  }

  /** Puts the camera behind a heading at once (spawn, checkpoint). */
  snapBehind(heading: number): void {
    this.orbit.yaw = heading;
    this.vYaw = heading;
    this.orbit.distance = this.params.distance;
  }

  update(dt: number, input: LevelInput, tx: number, ty: number, tz: number): void {
    const rm = this.reducedMotion();
    if (this.mode === 'follow') {
      const k = rm ? 0.6 : 1;
      applyLook(this.orbit, input.look.x * k, input.look.y * k, dt, this.params);
      const headY = ty + 1.5;
      const safe = safeDistance(tx, headY, tz, this.orbit.yaw, this.orbit.pitch, this.params.distance, this.world.heightAt, this.world.colliders, this.params);
      this.orbit.distance = smoothDistance(this.orbit.distance, safe, dt, rm);
      orbitPosition(tx, headY, tz, this.orbit, this.pos);
      this.camera.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.camera.lookAt(tx, headY, tz);
      return;
    }
    if (this.mode === 'planning') {
      const p = this.plan;
      p.x += input.move.x * p.panSpeed * dt * (p.height / 60);
      p.z += input.move.y * p.panSpeed * dt * (p.height / 60);
      p.height = Math.min(p.maxHeight, Math.max(p.minHeight, p.height - input.scroll * 40 * dt));
      this.camera.position.set(p.x, p.height, p.z + p.height * 0.25);
      this.camera.lookAt(p.x, 0, p.z);
      return;
    }
    const v = this.vehicle;
    // Follow the vehicle heading; reduced motion snaps instead of swinging.
    const d = Math.atan2(Math.sin(v.heading - this.vYaw), Math.cos(v.heading - this.vYaw));
    this.vYaw += rm ? d : d * Math.min(1, dt * 2);
    const x = v.x - Math.sin(this.vYaw) * v.distance;
    const z = v.z - Math.cos(this.vYaw) * v.distance;
    const y = Math.max(v.y + v.height, this.world.heightAt(x, z) + 1.5);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(v.x, v.y + 1.5, v.z);
  }
}

/**
 * The playable character: a stylized figure from the world kit (one instanced draw call, shader
 * rig for walking) driven by the CharacterMotor from game input, with the camera rig.
 */
export class PlayerController implements PlayerView {
  readonly motor: CharacterMotor;
  readonly rig: CameraRig;
  private readonly crowd: Crowd;
  private readonly figureMaterial: FigureMaterial;
  /** When false, stick input is ignored (dialogs, planning mode). */
  controllable = true;

  constructor(
    world: LevelWorld,
    private readonly input: LevelInput,
    reducedMotion: () => boolean,
    opts: { era?: EraId; variant?: number; motor?: MotorParams } = {},
  ) {
    this.motor = new CharacterMotor(opts.motor ?? DEFAULT_MOTOR);
    this.motor.colliders = world.colliders;
    this.motor.bounds = world.bounds;
    this.motor.heightAt = world.heightAt;
    this.figureMaterial = world.bag.track(new FigureMaterial());
    const geo = world.bag.geometry(figureGeometry({ era: opts.era ?? world.opts.era, variant: opts.variant ?? 0, seed: 'player' }));
    this.crowd = new Crowd(geo, this.figureMaterial, 1);
    this.crowd.mesh.frustumCulled = false;
    world.bag.track(this.crowd);
    world.scene.add(this.crowd.mesh);
    this.rig = new CameraRig(world.camera, world, reducedMotion);
    world.onVisual((_dt, elapsed) => this.figureMaterial.update(elapsed));
  }

  get x(): number {
    return this.motor.x;
  }

  get z(): number {
    return this.motor.z;
  }

  get cameraYaw(): number {
    return this.rig.yaw;
  }

  spawn(x: number, z: number, heading: number): void {
    this.motor.place(x, z, heading);
    this.rig.snapBehind(heading);
    this.syncVisual();
    this.rig.update(0, this.input, this.motor.x, this.motor.y, this.motor.z);
  }

  update(dt: number): void {
    const move = this.controllable && this.rig.mode === 'follow' ? this.input.move : ZERO;
    this.motor.update(dt, move.x, move.y, this.rig.yaw);
    this.syncVisual();
    this.rig.update(dt, this.input, this.motor.x, this.motor.y, this.motor.z);
  }

  private syncVisual(): void {
    const m = this.motor;
    this.crowd.set(0, m.x, m.y, m.z, m.heading, m.walk, 0);
    this.crowd.markMoved();
    this.crowd.gait.needsUpdate = true;
  }
}

const ZERO = Object.freeze({ x: 0, y: 0 });
