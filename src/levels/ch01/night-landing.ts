import * as THREE from 'three';
import { box, circle, type Collider } from '../../gameplay/core/collision';
import { CharacterMotor, DEFAULT_MOTOR, type MotorParams } from '../../gameplay/core/movement';
import { MissionTimer } from '../../gameplay/core/telegraph';
import { Patrol } from '../../gameplay/modules/stealth';
import { LevelWorld, type Marker } from '../../gameplay/runtime/levelKit';
import { PlayerController } from '../../gameplay/runtime/player';
import { defineLevel, type BotStep, type FailureInfo, type Level, type LevelContext, type Line, type PlayerView } from '../../gameplay/types';
import { watchtower } from '../../world/kit/buildings';
import { rock, palmTree, sabraHedge } from '../../world/kit/nature';
import { sack, crate } from '../../world/kit/props';
import { fishingBoat, immigrantShip, truck1940s } from '../../world/kit/vehicles';
import {
  BEACH_START,
  BOAT_RADIUS,
  BOAT_SPAWN,
  BUNDLES,
  CHILD_FIND_RADIUS,
  CHILD_VOICE_GAP,
  CHILD_VOICE_RANGE,
  COVE,
  DUNE_COVER,
  HOLLOW,
  LAUNCH,
  LIGHTS,
  LOST_CHILD,
  PATROLS,
  PATROLS_GOAL,
  SEA_BOUNDS,
  SEA_GOAL,
  SEA_ROCKS,
  SHIP_POS,
  SHORE_ROUTE,
  SURVIVOR_GROUPS,
  TERRAIN_SIZE,
  TIMERS,
  TRUCKS,
  WATCHERS,
  WATER_LEVEL,
  WITH_YOU_RADIUS,
} from './landing/layout';
import { RescueModel, voiceSide, type RescueSnapshot } from './landing/rescue';
import { SweepLight } from './landing/sweep';
import { applyNight, BoatVisual, ConeFan, DawnBlend, placeAt, SurvivorViews, WatcherViews } from './landing/visuals';

/**
 * Night Landing (Aliyah Bet, 1946), mission 2 of Chapter 1. Phase 1: pilot a small boat from the
 * ship to the cove between patrol boats and shore searchlights (telegraphed cones; being seen is a
 * soft fail). Phase 2: on the beach, guide survivors (FICTIONAL COMPOSITES) to the volunteers.
 * Staging is RECONSTRUCTED; the documented facts live in the locale texts (C1-055, C1-002, C1-101).
 * Nobody is ever harmed and nothing violent is shown: being seen only restarts the checkpoint.
 */

export type LandingState = 'sea' | 'patrols' | 'lights' | 'landing' | 'shore' | 'hide';
export type LandingEvent = 'approach' | 'crossed' | 'cove' | 'ashore' | 'gathered' | 'hidden';
type S = LandingState;
type E = LandingEvent;

export const LANDING_MISSION_ID = 'night-landing';
const R = 'levels.ch01.landing.';

export const FAIL = {
  patrol: R + 'fail.patrol',
  beam: R + 'fail.beam',
  watch: R + 'fail.watch',
  dawn: R + 'fail.dawn',
  intercepted: R + 'fail.intercepted',
} as const;

const SAMIR = 'ch01.speaker.samir';
const PASSENGER = 'ch01.speaker.passenger';
const line = (textKey: string, durationMs = 4800, speakerKey: string | null = null): Line => ({ textKey, speakerKey, durationMs });

const LINES = {
  steer: [line(R + 'tip.steer', 6500)],
  cone: [line(R + 'tip.cone', 7000)],
  policy: [line('ch01.landing.b2', 9000, SAMIR)],
  beam: [line(R + 'tip.beam', 7500)],
  dark: [line(R + 'tip.dark', 3500)],
  order: [line(R + 'tip.order', 4500)],
  moment: [line('ch01.landing.moment', 7000)],
  whisperChildren: [line(R + 'whisper.children', 4200, PASSENGER)],
  whisperElders: [line(R + 'whisper.elders', 4200, PASSENGER)],
  whisperAdults: [line(R + 'whisper.adults', 4200, PASSENGER)],
  bundles: [line(R + 'tip.bundles', 5500)],
  child: [line(R + 'tip.child', 5500)],
  gather: [line(R + 'tip.gather', 5500)],
  volunteers: [line(R + 'tip.volunteers', 6500)],
  bundleGiven: [line(R + 'tip.bundleGiven', 3000)],
  childFound: [line(R + 'tip.childFound', 3500)],
  dawn1: [line(R + 'tip.dawn1', 4500)],
  dawn2: [line(R + 'tip.dawn2', 4500)],
  arab: [line('ch01.landing.d2', 9000, SAMIR)],
  voice: {
    ahead: [line(R + 'voice.ahead', 3600)],
    behind: [line(R + 'voice.behind', 3600)],
    left: [line(R + 'voice.left', 3600)],
    right: [line(R + 'voice.right', 3600)],
  },
  hints: [[line('ch01.landing.h1', 6500)], [line('ch01.landing.h2', 6500)], [line('ch01.landing.h3', 6500)]],
} as const;

/** Every locale key this level shows (subtitles, prompts, objectives, failures), for tests. */
export function landingLocaleKeys(): string[] {
  const keys = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>;
      if (typeof o.textKey === 'string') {
        keys.add(o.textKey);
        if (typeof o.speakerKey === 'string') keys.add(o.speakerKey);
      } else Object.values(o).forEach(walk);
    }
  };
  walk(LINES);
  for (const k of ['prompt.help', 'prompt.bundle', 'prompt.child']) keys.add(R + k);
  for (const k of Object.values(FAIL)) keys.add(k);
  return [...keys];
}

const BOAT_MOTOR: MotorParams = { maxSpeed: 5, accel: 1.5, turnRate: 2.5, radius: BOAT_RADIUS };
const WALK_MOTOR: MotorParams = DEFAULT_MOTOR;
const LOADED_MOTOR: MotorParams = { ...DEFAULT_MOTOR, maxSpeed: 3.5 };

/** Closing beat length: the 9 s Samir line plus a short silence. */
const REST_SECONDS = 10;
const CONE_SEA_Y = 0.55;
const CONE_LAND_Y = 0.45;
/** Boat origin height so the kit boat sits in the water. */
const BOAT_ORIGIN_Y = 0.35;

/** Saved extra level data (exact manual save). */
interface LandingSave {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly carried: number;
  readonly delivered: number;
  readonly bundlesTaken: readonly boolean[];
  /** Where the survivors are (absent in saves from older versions). */
  readonly rescue?: RescueSnapshot;
}

function isRescueSnapshot(v: unknown): v is RescueSnapshot {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.landed === 'number' && Array.isArray(o.survivors) && o.survivors.every((e: unknown) => typeof e === 'object' && e !== null && typeof (e as Record<string, unknown>).x === 'number' && typeof (e as Record<string, unknown>).z === 'number' && typeof (e as Record<string, unknown>).state === 'string');
}

function isSave(v: unknown): v is LandingSave {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.x === 'number' && typeof o.z === 'number' && typeof o.heading === 'number' && typeof o.carried === 'number' && typeof o.delivered === 'number' && Array.isArray(o.bundlesTaken);
}

export const CHECKPOINTS: readonly S[] = ['sea', 'patrols', 'lights', 'landing', 'shore'];
const PLAYING: readonly string[] = ['sea', 'patrols', 'lights', 'landing', 'shore', 'hide'];
const isPlaying = (s: string): s is S => PLAYING.includes(s);

function build(ctx: LevelContext<E>): Level {
  const world = new LevelWorld({ seed: 'night-landing', era: 'archiveNight', biome: 'coastalPlain', size: TERRAIN_SIZE, quality: ctx.quality, waterLevel: WATER_LEVEL, grade: 'archive' });
  applyNight(world);
  const era = 'archiveNight' as const;

  // ---- static set dressing ---------------------------------------------------------------
  const seaColliders: Collider[] = [];
  placeAt(world, immigrantShip({ era, seed: 'landing-ship' }), SHIP_POS.x, 1.8, SHIP_POS.z, SHIP_POS.ry);
  SEA_ROCKS.forEach((r, i) => {
    placeAt(world, rock({ era, seed: 'sea-rock-' + String(i), size: r.r * 0.78, color: '#4b5058' }), r.x, -0.9, r.z, i * 1.7);
    seaColliders.push(circle(r.x, r.z, r.r));
  });
  // A few moored fishing boats as scenery (outside the route).
  [[-112, 152, 0.4], [-100, 128, 2.2], [-172, 40, 1.1]].forEach(([x, z, ry], i) => {
    placeAt(world, fishingBoat({ era, seed: 'moored-' + String(i) }), x as number, -0.2, z as number, ry as number);
  });
  // Sandbar line south of the cove keeps the boat in the channel.
  for (let x = -184; x <= -92; x += 11) placeAt(world, rock({ era, seed: 'bar-' + String(x), size: 2.2, color: '#6b6a5e' }), x, -0.8, SEA_BOUNDS.minZ - 3, x * 0.1);

  // Beach: dune cover (blocks a watcher's sight), hedges, palms, bundles.
  DUNE_COVER.forEach((d, i) => {
    world.place(rock({ era, seed: 'dune-cover-' + String(i), size: d.r * 0.8, color: '#8a826c' }), d.x, d.z, i, circle(d.x, d.z, d.r, 3));
  });
  for (const [x, z, ry] of [[-50, -8, 0.6], [-30, -34, 2.2], [-66, -20, 1.3]] as const) {
    world.place(sabraHedge({ era, seed: 'hedge-' + String(x), length: 5 }), x, z, ry, circle(x, z, 1.6, 1.5));
  }
  for (const [x, z] of [[-16, -26], [-2, -18], [4, -4], [-40, 4]] as const) world.place(palmTree({ era, seed: 'palm-' + String(x) }), x, z, x * 0.2, circle(x, z, 0.5));
  world.place(truck1940s({ era, seed: 'truck-a', covered: true }), TRUCKS.x - 2, TRUCKS.z + 3, 0.5, box(TRUCKS.x - 2, TRUCKS.z + 3, 1.3, 3, 3));
  world.place(truck1940s({ era, seed: 'truck-b', covered: true }), TRUCKS.x + 3, TRUCKS.z - 2, 0.9, box(TRUCKS.x + 3, TRUCKS.z - 2, 1.3, 3, 3));
  world.place(crate({ era }), TRUCKS.x + 1, TRUCKS.z + 5, 0.3);

  // Shore searchlight towers (the lamp is the beam origin).
  const lampMat = world.bag.material(new THREE.MeshBasicMaterial({ color: '#fff2c8', fog: false }));
  const lampGeo = world.bag.geometry(new THREE.SphereGeometry(0.5, 8, 6));
  const lanternGeo = world.bag.geometry(new THREE.SphereGeometry(0.28, 8, 6));
  const lanternMat = world.bag.material(new THREE.MeshBasicMaterial({ color: '#ffd27a', fog: false }));
  const glow = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    world.scene.add(m);
    return m;
  };
  const towers = LIGHTS.map((l, i) => {
    world.place(watchtower({ era, seed: 'tower-' + String(i) }), l.x, l.z, Math.PI / 2, circle(l.x, l.z, 2.4, 14));
    return glow(lampGeo, lampMat, l.x - 0.4, world.heightAt(l.x, l.z) + 13.6, l.z);
  });
  for (const t of towers) t.visible = false;
  // Volunteer lanterns by the trucks.
  glow(lanternGeo, lanternMat, TRUCKS.x - 3.5, world.heightAt(TRUCKS.x - 3.5, TRUCKS.z + 1) + 1.6, TRUCKS.z + 1);
  glow(lanternGeo, lanternMat, TRUCKS.x + 1.5, world.heightAt(TRUCKS.x + 1.5, TRUCKS.z - 3) + 1.6, TRUCKS.z - 3);

  // ---- actors ----------------------------------------------------------------------------
  const player = new PlayerController(world, ctx.input, ctx.reducedMotion, { era: 'mandate1940', variant: 0 });
  player.spawn(BEACH_START.x, BEACH_START.z, BEACH_START.heading);
  const boat = new CharacterMotor(BOAT_MOTOR);
  boat.colliders = seaColliders;
  boat.bounds = SEA_BOUNDS;
  boat.heightAt = () => WATER_LEVEL;
  const boatViz = new BoatVisual(world, fishingBoat({ era, seed: 'launch' }), 1.35, '#ffd27a', 2.6);

  const rescue = new RescueModel({ groups: SURVIVOR_GROUPS, landingX: BEACH_START.x - 3, landingZ: BEACH_START.z - 1, lostChild: LOST_CHILD });
  const views = new SurvivorViews(world, rescue, [
    { x: TRUCKS.x - 5, z: TRUCKS.z + 1, heading: 1.2 },
    { x: TRUCKS.x + 4, z: TRUCKS.z - 4, heading: 4.4 },
    { x: TRUCKS.x - 1, z: TRUCKS.z + 6, heading: 2.6 },
  ]);

  // Patrol boats and their cones.
  const warn = (): number => ctx.telegraph();
  const patrols = PATROLS.map((d) => new Patrol(d, warn));
  const patrolViz = patrols.map((p, i) => ({
    cone: new ConeFan(world, p.def.viewHalfAngle),
    boat: new BoatVisual(world, fishingBoat({ era, seed: 'patrol-' + String(i) }), 1.7, '#ffe9b0', 2.9),
    heading: p.heading,
  }));
  const lights = LIGHTS.map((d) => new SweepLight(d, warn));
  const lightCones = lights.map((l) => new ConeFan(world, l.def.halfAngle, 10));
  const watchers = WATCHERS.map((d) => new Patrol(d, warn));
  const watcherCones = watchers.map((p) => new ConeFan(world, p.def.viewHalfAngle));
  const watcherViews = new WatcherViews(world, watchers.length);
  watcherViews.set(false);
  const duneOccluders: Collider[] = DUNE_COVER.map((d) => circle(d.x, d.z, d.r));

  // Markers and interactables.
  const markers: Record<string, Marker> = {
    sea: world.addMarker(SEA_GOAL.x, SEA_GOAL.z, '#f2c14e'),
    cross: world.addMarker(PATROLS_GOAL.x, PATROLS_GOAL.z, '#f2c14e'),
    cove: world.addMarker(COVE.x, COVE.z, '#f2c14e'),
    trucks: world.addMarker(TRUCKS.x, TRUCKS.z, '#f2c14e'),
    hollow: world.addMarker(HOLLOW.x, HOLLOW.z, '#9fd6a8'),
    child: world.addMarker(LOST_CHILD.x, LOST_CHILD.z, '#ffd9a0'),
  };
  for (const m of Object.values(markers)) m.setVisible(false);
  for (const m of [markers.sea, markers.cross, markers.cove] as Marker[]) m.group.position.y = WATER_LEVEL + 0.2;

  const bundleMeshes = BUNDLES.map((b, i) => world.place(sack({ era, seed: 'bundle-' + String(i) }), b.x, b.z, i * 1.9));
  const bundleTaken = BUNDLES.map(() => false);
  let carried = 0;
  let delivered = 0;

  const launchItem = ctx.interactions.add({
    id: 'landing-launch',
    kind: 'generic',
    x: BEACH_START.x - 3,
    z: BEACH_START.z - 1,
    radius: 5,
    promptKey: R + 'prompt.help',
    enabled: false,
    onInteract: () => landWave(),
  });
  const bundleItems = BUNDLES.map((b, i) =>
    ctx.interactions.add({
      id: 'landing-bundle-' + String(i),
      kind: 'pickup',
      x: b.x,
      z: b.z,
      radius: 2.4,
      promptKey: R + 'prompt.bundle',
      enabled: false,
      onInteract: () => takeBundle(i),
    }),
  );
  const childItem = ctx.interactions.add({
    id: 'landing-child',
    kind: 'lantern',
    x: LOST_CHILD.x,
    z: LOST_CHILD.z,
    radius: CHILD_FIND_RADIUS,
    promptKey: R + 'prompt.child',
    enabled: false,
    onInteract: () => foundChild(),
  });
  const offFocus = ctx.interactions.onFocus((next) => {
    markers.child?.setHighlight(next === childItem);
    markers.trucks?.setHighlight(false);
  });

  // ---- state -----------------------------------------------------------------------------
  const dawn = new DawnBlend(world);
  const timers = {
    landing: new MissionTimer(TIMERS.landing, () => ctx.params().timerScale),
    shore: new MissionTimer(TIMERS.shore, () => ctx.params().timerScale),
    hide: new MissionTimer(TIMERS.landing, () => ctx.params().timerScale),
  };
  let clock = 0;
  let onFoot = false;
  let lastState: S | '' = '';
  let waveCooldown = 0;
  let voiceClock = 0;
  let idle = 0;
  let cohesionClock = 0;
  let dawnSaid = 0;
  let engineClock = 0;
  let consecutiveSeen = 0;
  let seenAt = '';
  /** Seconds left of the closing breath in the hollow (-1: not started); the dawn timer waits for it. */
  let restLeft = -1;
  let momentPlayed = false;
  const warned = patrols.map(() => false);
  let watchWarned = false;
  const alertOut = { v: 0 };
  /** Unlocks are announced once per run (a retry must not repeat the toast). */
  const unlocked = new Set<string>();
  const unlockOnce = (kind: 'codex' | 'archive' | 'testimony' | 'fact', id: string): void => {
    if (unlocked.has(kind + ':' + id)) return;
    unlocked.add(kind + ':' + id);
    ctx.unlock(kind, id);
  };

  const view: PlayerView = {
    get x(): number {
      return onFoot ? player.x : boat.x;
    },
    get z(): number {
      return onFoot ? player.z : boat.z;
    },
    get cameraYaw(): number {
      return player.rig.yaw;
    },
  };

  const emit = (cue: string, intensity?: number): void => {
    if (ctx.headless) return;
    ctx.bus.emit('audio:cue', intensity === undefined ? { cue } : { cue, intensity });
  };
  const say = (lines: readonly Line[], composite = false): void => {
    ctx.say(lines, composite ? 'composite' : undefined);
    idle = 0;
  };

  function failSeen(kind: 'patrol' | 'beam' | 'watch'): void {
    const cp = ctx.mission.checkpoint;
    consecutiveSeen = seenAt === cp ? consecutiveSeen + 1 : 1;
    seenAt = cp;
    ctx.mission.fail(consecutiveSeen >= 3 ? FAIL.intercepted : FAIL[kind]);
  }

  function carryOnBoat(): void {
    const h = boat.heading;
    const sx = Math.sin(h);
    const cx = Math.cos(h);
    for (let i = 0; i < rescue.survivors.length; i++) {
      const s = rescue.survivors[i];
      if (!s || s.state !== 'boat') continue;
      const lz = ((i % 6) - 2.5) * 0.85;
      const lx = (Math.floor(i / 6) - 0.5) * 0.9;
      s.x = boat.x + lx * cx + lz * sx;
      s.z = boat.z - lx * sx + lz * cx;
      s.heading = h;
    }
  }

  function enterSea(): void {
    onFoot = false;
    player.rig.mode = 'vehicle';
    player.rig.vehicle.distance = 17;
    player.rig.vehicle.height = 7.5;
    boatViz.group.scale.setScalar(1);
  }

  function setObjectivesFor(s: S): void {
    const o = ctx.objectives;
    if (s === 'landing' || s === 'shore' || s === 'hide') o.progress('o3', 3);
    if (s === 'hide') {
      o.progress('o4', 3);
      o.progress('o5', 0);
    }
  }

  function resetBeach(s: S): void {
    onFoot = true;
    player.rig.mode = 'follow';
    player.controllable = true;
    carried = 0;
    delivered = 0;
    for (let i = 0; i < bundleTaken.length; i++) bundleTaken[i] = false;
    for (let i = 0; i < bundleMeshes.length; i++) (bundleMeshes[i] as THREE.Mesh).visible = s === 'shore';
    player.motor.params = WALK_MOTOR;
    boatViz.set(LAUNCH.x, BOAT_ORIGIN_Y, LAUNCH.z, LAUNCH.ry);
    boatViz.group.scale.setScalar(1);
    voiceClock = 0;
    cohesionClock = 0;
    waveCooldown = 0;
    rescue.reset(LAUNCH.x, LAUNCH.z);
    launchItem.enabled = false;
    childItem.enabled = false;
    for (const b of bundleItems) b.enabled = false;
  }

  function landWave(): void {
    if (waveCooldown > 0 || rescue.arriving || rescue.allLanded) return;
    const wave = rescue.landNext();
    if (wave < 0) return;
    ctx.objectives.progress('o3', rescue.landed);
    waveCooldown = 3.2;
    idle = 0;
    emit('footsteps.sand', 0.6);
    if (wave === 0) {
      unlockOnce('testimony', 'passenger');
      say(LINES.whisperChildren, true);
    } else if (wave === 1) say(LINES.whisperElders, true);
    else say(LINES.whisperAdults, true);
  }

  function takeBundle(i: number): void {
    if (bundleTaken[i]) return;
    bundleTaken[i] = true;
    (bundleMeshes[i] as THREE.Mesh).visible = false;
    (bundleItems[i] as { enabled: boolean }).enabled = false;
    carried++;
    ctx.objectives.progress('o4', delivered + carried + (rescue.childFound ? 1 : 0));
    player.motor.params = LOADED_MOTOR;
    idle = 0;
  }

  function foundChild(): void {
    if (!rescue.findChild()) return;
    childItem.enabled = false;
    markers.child?.setVisible(false);
    ctx.objectives.progress('o4', delivered + carried + 1);
    say(LINES.childFound, true);
  }

  /**
   * Enters a mission state. `place` is true for checkpoint entries (start, retry, saved game), which
   * put every actor at its checkpoint position; false for the natural step from one state to the next.
   */
  function enterState(s: S, place: boolean): void {
    clock = 0;
    idle = 0;
    dawnSaid = 0;
    restLeft = -1;
    watchWarned = false;
    for (const m of Object.values(markers)) m.setVisible(false);
    if (s === 'sea' || s === 'patrols' || s === 'lights') {
      enterSea();
      for (const p of patrols) p.reset();
      warned.fill(false);
      for (const l of lights) l.reset();
      for (const t of towers) t.visible = s === 'lights';
      markers.sea?.setVisible(s === 'sea');
      markers.cross?.setVisible(s === 'patrols');
      markers.cove?.setVisible(s === 'lights');
      if (place) {
        rescue.reset(0, 0);
        const at = s === 'sea' ? BOAT_SPAWN : s === 'patrols' ? { x: SEA_GOAL.x, z: SEA_GOAL.z - 6, heading: Math.PI } : { x: PATROLS_GOAL.x, z: PATROLS_GOAL.z, heading: Math.PI };
        boat.place(at.x, at.z, at.heading);
        player.rig.snapBehind(at.heading);
        carryOnBoat();
      }
      emit('ambience.sea');
      if (!ctx.headless) ctx.bus.emit('audio:mood', { mood: 'tense', era: 1 });
      if (s === 'sea') {
        unlockOnce('codex', 'aliyah-bet');
        say(LINES.steer);
      } else if (s === 'patrols') {
        unlockOnce('codex', 'white-paper');
        unlockOnce('archive', 'white-paper');
        say(LINES.policy, true);
      } else say(LINES.beam);
    } else {
      for (const t of towers) t.visible = false;
      if (s === 'landing') {
        resetBeach(s);
        player.spawn(BEACH_START.x, BEACH_START.z, BEACH_START.heading);
        rescue.reset(LAUNCH.x, LAUNCH.z);
        launchItem.enabled = true;
        timers.landing.reset();
        say(LINES.order);
      } else if (s === 'shore') {
        if (place) {
          resetBeach(s);
          player.spawn(BEACH_START.x, BEACH_START.z, BEACH_START.heading);
          rescue.setAllWaiting();
        }
        rescue.beginEscort();
        bundleItems.forEach((item, i) => {
          item.enabled = !bundleTaken[i];
          (bundleMeshes[i] as THREE.Mesh).visible = !bundleTaken[i];
        });
        childItem.enabled = true;
        for (const w of watchers) w.reset();
        timers.shore.reset();
        markers.trucks?.setVisible(true);
        say(LINES.bundles);
      } else {
        if (place) {
          resetBeach(s);
          rescue.setAllFollowing(TRUCKS.x, TRUCKS.z - 4);
          delivered = BUNDLES.length;
          player.spawn(TRUCKS.x, TRUCKS.z - 6, 0);
        }
        for (const w of watchers) w.reset();
        timers.hide.reset();
        markers.hollow?.setVisible(true);
        say(LINES.volunteers);
      }
      emit('ambience.night');
      emit('engine.ship', 0);
      if (!ctx.headless) ctx.bus.emit('audio:mood', { mood: s === 'hide' ? 'hopeful' : 'tense', era: 1 });
    }
    setObjectivesFor(s);
    lastState = s;
  }

  // ---- per-step logic ----------------------------------------------------------------------
  function patrolWarnings(): void {
    for (let i = 0; i < patrols.length; i++) {
      const p = patrols[i] as Patrol;
      const w = p.telegraph.phase === 'warning';
      if (w && !warned[i]) {
        emit('distant.rumble', 0.7);
        if (!ctx.headless) ctx.bus.emit('haptics:pulse', { strength: 'light', durationMs: 120 });
      }
      warned[i] = w;
    }
  }

  function updateSea(dt: number, s: S): void {
    const m = boat;
    m.update(dt, ctx.input.move.x, ctx.input.move.y, player.rig.yaw);
    player.rig.vehicle.x = m.x;
    player.rig.vehicle.y = WATER_LEVEL;
    player.rig.vehicle.z = m.z;
    player.rig.vehicle.heading = m.heading;
    player.rig.update(dt, ctx.input, m.x, WATER_LEVEL, m.z);
    carryOnBoat();

    let alert = 0;
    let seen: 'patrol' | 'beam' | null = null;
    for (let i = 0; i < patrols.length; i++) {
      const p = patrols[i] as Patrol;
      p.update(dt);
      const exposed = p.sees(m.x, m.z, seaColliders);
      if (p.telegraph.update(dt, exposed)) seen = 'patrol';
      alert = Math.max(alert, p.telegraph.phase === 'triggered' ? 1 : p.telegraph.level);
    }
    patrolWarnings();
    if (s === 'lights') {
      for (let i = 0; i < lights.length; i++) {
        const l = lights[i] as SweepLight;
        if (l.advance(dt)) emit('ui.move', 0.9);
        if (l.expose(dt, l.sees(m.x, m.z, seaColliders))) seen = 'beam';
        alert = Math.max(alert, l.telegraph.phase === 'triggered' ? 1 : l.telegraph.level);
      }
    }
    alertOut.v = alert;
    if (seen) {
      failSeen(seen);
      return;
    }
    engineClock += dt;
    if (engineClock > 0.25) {
      engineClock = 0;
      emit('engine.ship', 0.25 + 0.6 * Math.min(1, m.speed / BOAT_MOTOR.maxSpeed));
    }
    // Calm beat on open water: the scarf moment (COMPOSITE), once, after the steering tip is done.
    if (s === 'sea' && !momentPlayed && clock > 9) {
      momentPlayed = true;
      say(LINES.moment, true);
    }
    if (s === 'sea' && Math.hypot(m.x - SEA_GOAL.x, m.z - SEA_GOAL.z) <= SEA_GOAL.radius) {
      ctx.mission.send('approach');
    } else if (s === 'patrols' && Math.hypot(m.x - PATROLS_GOAL.x, m.z - PATROLS_GOAL.z) <= PATROLS_GOAL.radius) {
      ctx.mission.send('crossed');
    } else if (s === 'lights' && Math.hypot(m.x - COVE.x, m.z - COVE.z) <= COVE.radius) {
      ctx.mission.send('cove');
    }
  }

  function updateDawn(s: S): void {
    const t = s === 'landing' ? timers.landing : s === 'shore' ? timers.shore : timers.hide;
    const f = 1 - t.remaining / t.duration;
    const base = s === 'landing' ? 0 : s === 'shore' ? 0.12 : 0.45;
    const span = s === 'landing' ? 0.12 : s === 'shore' ? 0.38 : 0.25;
    dawn.set(base + span * f);
    if (f > 0.55 && dawnSaid < 1) {
      dawnSaid = 1;
      say(LINES.dawn1);
    } else if (f > 0.82 && dawnSaid < 2) {
      dawnSaid = 2;
      say(LINES.dawn2);
    }
  }

  function stepTimer(dt: number, s: S): boolean {
    const t = s === 'landing' ? timers.landing : s === 'shore' ? timers.shore : timers.hide;
    return t.update(dt);
  }

  function updateLanding(dt: number): void {
    player.update(dt);
    rescue.update(dt, player.x, player.z, player.motor.heading);
    waveCooldown = Math.max(0, waveCooldown - dt);
    launchItem.enabled = waveCooldown <= 0 && !rescue.arriving && !rescue.allLanded;
    if (rescue.allLanded && !rescue.arriving) ctx.mission.send('ashore');
  }

  function updateShore(dt: number, s: S): void {
    player.update(dt);
    const heading = player.motor.heading;
    rescue.update(dt, player.x, player.z, heading);

    // Land watchers: the leader and the tail of the group can be seen.
    let alert = 0;
    let seen = false;
    const tail = rescue.tail(player.x, player.z);
    for (let i = 0; i < watchers.length; i++) {
      const w = watchers[i] as Patrol;
      w.update(dt);
      const exposed = w.sees(player.x, player.z, duneOccluders) || (tail !== null && w.sees(tail.x, tail.z, duneOccluders));
      if (w.telegraph.update(dt, exposed)) seen = true;
      alert = Math.max(alert, w.telegraph.phase === 'triggered' ? 1 : w.telegraph.level);
      const warning = w.telegraph.phase === 'warning';
      if (warning && !watchWarned) {
        emit('distant.rumble', 0.5);
        if (!ctx.headless) ctx.bus.emit('haptics:pulse', { strength: 'light', durationMs: 120 });
      }
      watchWarned = warning;
    }
    alertOut.v = alert;
    if (seen) {
      failSeen('watch');
      return;
    }

    if (s === 'shore') {
      // The lost child calls in a whisper: the subtitle names the side the voice comes from.
      const lost = rescue.lostChild;
      if (lost) {
        const d = Math.hypot(lost.x - player.x, lost.z - player.z);
        voiceClock += dt;
        markers.child?.setVisible(d < 14);
        if (d < CHILD_VOICE_RANGE && voiceClock >= CHILD_VOICE_GAP) {
          voiceClock = 0;
          const side = voiceSide(player.x, player.z, player.rig.yaw, lost.x, lost.z);
          ctx.say(LINES.voice[side], 'composite');
          if (!ctx.headless) ctx.bus.emit('haptics:pulse', { strength: 'light', durationMs: 90 });
        }
      }
      // Deliver bundles at the trucks.
      const inTrucks = Math.hypot(player.x - TRUCKS.x, player.z - TRUCKS.z) <= TRUCKS.radius;
      if (inTrucks && carried > 0) {
        delivered += carried;
        carried = 0;
        player.motor.params = WALK_MOTOR;
        ctx.objectives.progress('o4', delivered + (rescue.childFound ? 1 : 0));
        say(LINES.bundleGiven);
      }
      // Cohesion hint when the group falls far behind.
      if (rescue.cohesion(player.x, player.z) > 16) {
        cohesionClock += dt;
        if (cohesionClock > 7) {
          cohesionClock = -8;
          say(LINES.gather);
        }
      } else cohesionClock = Math.max(0, cohesionClock);
      if (inTrucks) {
        if (delivered >= BUNDLES.length && rescue.everyoneWithYou(player.x, player.z, WITH_YOU_RADIUS)) {
          ctx.mission.send('gathered');
        } else if (idle > 9) {
          say(carried + delivered < BUNDLES.length ? LINES.bundles : !rescue.childFound ? LINES.child : LINES.gather);
        }
      }
    } else {
      const safe = rescue.settle(HOLLOW.x, HOLLOW.z, HOLLOW.radius);
      ctx.objectives.progress('o5', safe);
      if (safe >= rescue.total && restLeft < 0) {
        // A closing breath: everyone is hidden, the dawn timer stops mattering, and Samir's
        // line on the Arab concern (multi-perspective) is heard in full before the mission ends.
        restLeft = REST_SECONDS;
        say(LINES.arab);
        unlockOnce('fact', 'intercepted');
      }
      if (restLeft >= 0) {
        restLeft -= dt;
        if (restLeft < 0) ctx.mission.send('hidden');
      }
    }
  }

  function stuckHint(dt: number, s: S): void {
    idle += dt;
    if (idle < ctx.params().hintDelaySeconds) return;
    idle = 0;
    ctx.say(s === 'lights' ? LINES.hints[0] : s === 'patrols' || s === 'sea' ? LINES.hints[1] : LINES.hints[2]);
  }

  function visuals(s: S): void {
    const reduced = ctx.reducedMotion();
    const sea = s === 'sea' || s === 'patrols' || s === 'lights';
    for (let i = 0; i < patrolViz.length; i++) {
      const pv = patrolViz[i];
      const p = patrols[i];
      if (!pv || !p) continue;
      pv.cone.mesh.visible = sea;
      pv.boat.group.visible = true;
      // Smooth the drawn heading only; the logic heading stays exact.
      let dh = Math.atan2(Math.sin(p.heading - pv.heading), Math.cos(p.heading - pv.heading));
      dh *= Math.min(1, 0.2);
      pv.heading += dh;
      pv.boat.set(p.x, BOAT_ORIGIN_Y + (reduced ? 0 : Math.sin(clock * 1.3 + i) * 0.05), p.z, pv.heading, reduced ? 0 : Math.sin(clock * 0.9 + i) * 0.03);
      pv.cone.place(p.x, CONE_SEA_Y, p.z, p.heading, p.def.viewRange);
      pv.cone.setLevel(p.telegraph.level, !reduced, clock);
    }
    for (let i = 0; i < lightCones.length; i++) {
      const l = lights[i] as SweepLight;
      const c = lightCones[i] as ConeFan;
      c.mesh.visible = s === 'lights' && l.on;
      if (!c.mesh.visible) continue;
      c.place(l.def.x - 0.4, CONE_SEA_Y, l.def.z, l.heading, l.def.range);
      c.setLevel(l.telegraph.level, !reduced, clock);
    }
    const shore = s === 'shore' || s === 'hide';
    watcherViews.set(shore);
    for (let i = 0; i < watcherCones.length; i++) {
      const w = watchers[i] as Patrol;
      const cone = watcherCones[i] as ConeFan;
      cone.mesh.visible = shore;
      if (!shore) continue;
      cone.place(w.x, world.heightAt(w.x, w.z) + CONE_LAND_Y, w.z, w.heading, w.def.viewRange);
      cone.setLevel(w.telegraph.level, !reduced, clock);
      watcherViews.place(i, w.x, w.z, w.heading, true);
    }
    if (!onFoot) {
      boatViz.set(boat.x, BOAT_ORIGIN_Y + (reduced ? 0 : Math.sin(clock * 1.6) * 0.07), boat.z, boat.heading, reduced ? 0 : Math.sin(clock * 1.1) * 0.035);
    }
    views.sync(rescue, onFoot ? 0.45 : BOAT_ORIGIN_Y + 0.55);
  }

  const level: Level = {
    scene: world.gameScene(() => {
      offFocus();
    }),
    player: view,
    update(dt) {
      const s = ctx.mission.state as S;
      if (!isPlaying(s)) return;
      if (s !== lastState) enterState(s, false);
      clock += dt;
      if (s === 'sea' || s === 'patrols' || s === 'lights') updateSea(dt, s);
      else if (s === 'landing') updateLanding(dt);
      else updateShore(dt, s);
      if (ctx.mission.state === s) {
        if (s === 'landing' || s === 'shore' || s === 'hide') {
          updateDawn(s);
          if (stepTimer(dt, s) && restLeft < 0) ctx.mission.fail(FAIL.dawn);
        } else dawn.set(0);
      }
      ctx.alert(alertOut.v);
      if (ctx.mission.state === s) stuckHint(dt, s);
      visuals(s);
    },
    enterCheckpoint(checkpoint, data) {
      const s = checkpoint as S;
      enterState(s, true);
      alertOut.v = 0;
      const saved = isSave(data) ? data : null;
      if (saved) {
        if (onFoot) player.spawn(saved.x, saved.z, saved.heading);
        else {
          boat.place(saved.x, saved.z, saved.heading);
          player.rig.snapBehind(saved.heading);
          carryOnBoat();
        }
        carried = saved.carried;
        delivered = saved.delivered;
        if (isRescueSnapshot(saved.rescue) && rescue.restore(saved.rescue) && s === 'shore') {
          childItem.enabled = rescue.lostChild !== null;
        }
        if (carried > 0) player.motor.params = LOADED_MOTOR;
        saved.bundlesTaken.forEach((taken, i) => {
          bundleTaken[i] = taken;
          const mesh = bundleMeshes[i];
          if (mesh) mesh.visible = !taken && s === 'shore';
          const item = bundleItems[i];
          if (item) item.enabled = !taken && s === 'shore';
        });
      }
      visuals(s);
    },
    snapshotData(): LandingSave {
      return {
        x: view.x,
        z: view.z,
        heading: onFoot ? player.motor.heading : boat.heading,
        carried,
        delivered,
        bundlesTaken: [...bundleTaken],
        rescue: rescue.snapshot(),
      };
    },
    dispose() {
      if (!ctx.headless) {
        emit('engine.ship', 0);
        emit('ambience.none');
      }
      level.scene.dispose();
    },
  };
  return level;
}

const ARC = (x: number, z: number, within = 3): BotStep => ({ kind: 'walkTo', x, z, within });
const WAIT = (seconds: number): BotStep => ({ kind: 'wait', seconds });
const TAP: BotStep = { kind: 'press', action: 'interact' };

const BUNDLE_A = BUNDLES[0] ?? { x: 0, z: 0 };
const BUNDLE_B = BUNDLES[1] ?? { x: 0, z: 0 };

/**
 * QA bot: each script is tuned to the fixed rhythms (patrols and searchlights restart at every
 * checkpoint, so the timing is the same on every run and difficulty). The unit tests check that
 * these routes are really never seen.
 */
export const BOT_SCRIPT: Readonly<Record<S, readonly BotStep[]>> = {
  sea: [ARC(SEA_GOAL.x, SEA_GOAL.z, 2.5)],
  // Hold north of the lanes until both patrols have passed, then slip behind their tails.
  patrols: [WAIT(8), ARC(PATROLS_GOAL.x, PATROLS_GOAL.z, 2.5)],
  // Stay beyond the beams' reach, then run the last stretch to the cove in a quiet window.
  lights: [ARC(-168, -20), ARC(-168, -62), WAIT(6), ARC(COVE.x, COVE.z, 2.5)],
  landing: [WAIT(0.5), TAP, WAIT(6.5), TAP, WAIT(7.5), TAP, { kind: 'waitFor', state: 'shore', timeout: 30 }],
  shore: [
    ARC(BUNDLE_A.x, BUNDLE_A.z, 1.6),
    TAP,
    ARC(BUNDLE_B.x, BUNDLE_B.z, 1.6),
    TAP,
    ARC(LOST_CHILD.x, LOST_CHILD.z, 1.8),
    TAP,
    // Wait out the watcher's walk where its cone cannot reach, then cross right behind its back.
    ARC(SHORE_ROUTE[0].x, SHORE_ROUTE[0].z, 2),
    WAIT(8),
    ARC(SHORE_ROUTE[1].x, SHORE_ROUTE[1].z, 2),
    ARC(TRUCKS.x, TRUCKS.z, 2),
    { kind: 'waitFor', state: 'hide', timeout: 60 },
    // The queue only restarts on checkpoints, so the last state's steps continue here.
    ARC(HOLLOW.x, HOLLOW.z, 1.5),
    WAIT(20),
  ],
  hide: [ARC(HOLLOW.x, HOLLOW.z, 1.5), WAIT(20)],
};

const failure = (whatHappenedKey: string, hintKey: string): FailureInfo => ({ whatHappenedKey, sources: ['C1-055'], label: 'documented', hintKey });

export default defineLevel<S, E>({
  id: 'night-landing',
  chapterId: 'ch01',
  missionId: LANDING_MISSION_ID,
  mission: {
    id: LANDING_MISSION_ID,
    chapterId: 'ch01',
    gameplayType: 'STL',
    checkpoints: ['sea', 'patrols', 'lights', 'landing', 'shore'],
    machine: {
      initial: 'sea',
      final: ['complete'],
      transitions: {
        sea: { approach: 'patrols' },
        patrols: { crossed: 'lights' },
        lights: { cove: 'landing' },
        landing: { ashore: 'shore' },
        shore: { gathered: 'hide' },
        hide: { hidden: 'complete' },
        failed: {},
        complete: {},
      },
    },
  },
  objectives: [
    { id: 'sea', textKey: R + 'obj.sea', states: ['sea'] },
    { id: 'o1', textKey: 'ch01.landing.o1', states: ['patrols'] },
    { id: 'o2', textKey: 'ch01.landing.o2', states: ['lights'] },
    { id: 'o3', textKey: 'ch01.landing.o3', states: ['landing'], steps: 3 },
    { id: 'o4', textKey: 'ch01.landing.o4', states: ['shore'], steps: 3 },
    { id: 'o5', textKey: 'ch01.landing.o5', states: ['hide'], steps: 11 },
  ],
  failures: {
    [FAIL.patrol]: failure('ch01.landing.f1', 'ch01.landing.h2'),
    [FAIL.beam]: failure('ch01.landing.f1', 'ch01.landing.h1'),
    [FAIL.watch]: failure('ch01.landing.f1', 'ch01.landing.h1'),
    [FAIL.dawn]: failure('ch01.landing.f2', 'ch01.landing.h3'),
    [FAIL.intercepted]: failure('ch01.landing.f3', 'ch01.landing.h3'),
  },
  extraCheckpoints: ['hide'],
  botScript: BOT_SCRIPT,
  briefingMap: {
    size: TERRAIN_SIZE,
    points: [
      { x: BOAT_SPAWN.x, z: BOAT_SPAWN.z, kind: 'start', labelKey: R + 'map.start' },
      { x: SEA_GOAL.x, z: SEA_GOAL.z, kind: 'poi', labelKey: R + 'map.sea' },
      { x: -143, z: 72, kind: 'danger', labelKey: R + 'map.patrol' },
      { x: -80, z: -20, kind: 'danger', labelKey: R + 'map.light' },
      { x: COVE.x, z: COVE.z, kind: 'goal', labelKey: R + 'map.cove' },
      { x: -50, z: -33, kind: 'danger', labelKey: R + 'map.watch' },
      { x: TRUCKS.x, z: TRUCKS.z, kind: 'poi', labelKey: R + 'map.trucks' },
      { x: HOLLOW.x, z: HOLLOW.z, kind: 'goal', labelKey: R + 'map.hollow' },
    ],
    routes: [[[BOAT_SPAWN.x, BOAT_SPAWN.z], [SEA_GOAL.x, SEA_GOAL.z], [PATROLS_GOAL.x, PATROLS_GOAL.z], [COVE.x, COVE.z]], [[BEACH_START.x, BEACH_START.z], [SHORE_ROUTE[0].x, SHORE_ROUTE[0].z], [SHORE_ROUTE[1].x, SHORE_ROUTE[1].z], [TRUCKS.x, TRUCKS.z], [HOLLOW.x, HOLLOW.z]]],
  },
  build,
});
