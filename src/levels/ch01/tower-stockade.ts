import { MISSION_SCRIPTS, SPEAKER_KEYS } from '../../content/ch01/dialogue';
import type { Action } from '../../core/input/types';
import type { Interactable, InteractableKind } from '../../gameplay/core/interaction';
import { MissionTimer } from '../../gameplay/core/telegraph';
import { LevelWorld, type Marker } from '../../gameplay/runtime/levelKit';
import { PlayerController } from '../../gameplay/runtime/player';
import { defineLevel, type BotStep, type FailureInfo, type Level, type LevelContext, type Line } from '../../gameplay/types';
import { Crew } from './tower/crew';
import { Planner } from './tower/planner';
import {
  CART_COUNT,
  CART_SPOTS,
  CENTER_X,
  CENTER_Z,
  CHECKPOINT_STAGES,
  DAY_SECONDS,
  EXTRA_CHECKPOINT_STAGES,
  FAIL_ORDER,
  FAIL_TIME_OUT,
  FAIL_UNFILLED,
  FENCE_LEGS,
  fenceSpot,
  GATE_IN,
  GATE_OUT,
  GRAVEL_PILE,
  JUG_SPOT,
  LIGHT_CRATE,
  LOADS_PER_TRIP,
  MEAL_SPOT,
  PIECES,
  parseSnapshot,
  restartFraction,
  RING,
  SECTION_COUNT,
  SECTION_PILE,
  SOLUTION,
  SPAWN,
  STAGES,
  STATION_COUNT,
  STATION_SPOTS,
  SUN_METER_FROM,
  sunsetReason,
  TABLE_SPOT,
  TOWER_BASE,
  TowerSim,
  type Spot,
  type Stage,
} from './tower/rules';
import { duskAmount, SkyClock } from './tower/skyClock';
import { SiteView } from './tower/site';
import { LensesPanel, PlanningPanel } from './tower/ui';

/**
 * Mission 1 of Chapter 1, "Tower and Stockade (1937)" (PZL, about 15 minutes). One day from dawn to
 * sunset: unload the prefabricated frames, plan the double wooden wall on the planning table,
 * fill it with gravel in a bucket chain, raise the tower, string the fence, mount the
 * searchlight and switch it on before the sun sets, then hear the Two Lenses on land.
 *
 * DOCUMENTED (C1-065): prefabricated wood, a double wall filled with gravel, a tower, within a
 * day. RECONSTRUCTED: the site, the team, the order of the stages, the fence and the searchlight.
 * The team members are FICTIONAL COMPOSITES. Nobody is harmed and nothing violent is shown; the
 * beam sweeps the approaches south of the compound, never the village on the hill.
 */

type E = 'unloaded' | 'walled' | 'filled' | 'raised' | 'fenced' | 'lit' | 'reviewed';

/** Handles the QA bot and tests use on the built level. */
export interface TowerLevel extends Level {
  readonly sim: TowerSim;
  /** Planning-table cursor and selection (read by tests). */
  readonly planner: Planner;
  /** Plays the planning table with the stored solution (bot). */
  botPlan(): void;
}

const FOREMAN = 'levels.ch01.tower.speaker.foreman';
const WORKER = 'levels.ch01.tower.speaker.worker';
const K = 'levels.ch01.tower.';
const FINALE_SECONDS = 30;
const SKIP_AFTER = 3;
/**
 * Touch paths for actions the touch buttons and the action bar do not carry
 * (checked by tests/unit/touchPaths.test.ts).
 */
export const TOUCH_ALTERNATIVES: Partial<Record<Action, string>> = {
  up: 'planning: the stick moves the cursor (handlePlanning reads input.move)',
  down: 'planning: the stick moves the cursor (handlePlanning reads input.move)',
  left: 'planning: the stick moves the cursor (handlePlanning reads input.move)',
  right: 'planning: the stick moves the cursor (handlePlanning reads input.move)',
};

/** Planning-table actions on the touch action bar (order as shown, reading right to left). */
const PLAN_TOUCH: readonly (readonly [Action, string])[] = [
  ['tabPrev', 'prevType'],
  ['tabNext', 'nextType'],
  ['alt', 'rotate'],
  ['confirm', 'place'],
  ['interact', 'lift'],
  ['map', 'clear'],
  ['back', 'exit'],
];

const STAGE_SPAWN: Readonly<Record<Stage, Spot>> = {
  dawn: SPAWN,
  walls: { x: -12, z: 12.5 },
  gravel: { x: 0, z: 3.4 },
  tower: { x: -1.5, z: 1 },
  fence: { x: 4.5, z: -4.2 },
  dusk: { x: 4.5, z: -4.2 },
  lenses: { x: 4.5, z: -4.2 },
};

/** Where players and the bot stand to use things (outside the colliders). */
export const APPROACH = {
  cart: (i: number): Spot => ({ x: (CART_SPOTS[i] as Spot).x, z: (CART_SPOTS[i] as Spot).z + 2.3 }),
  table: { x: TABLE_SPOT.x, z: TABLE_SPOT.z + 2.2 },
  gravel: { x: GRAVEL_PILE.x, z: GRAVEL_PILE.z + 2.4 },
  sections: { x: SECTION_PILE.x, z: SECTION_PILE.z + 2.3 },
  tower: { x: TOWER_BASE.x - 2.2, z: TOWER_BASE.z + 1.9 },
  crate: { x: LIGHT_CRATE.x, z: LIGHT_CRATE.z + 2.3 },
} as const;

const line = (textKey: string, speakerKey: string | null, durationMs: number): Line => ({ textKey, speakerKey, durationMs });
const totalSeconds = (lines: readonly Line[]): number => lines.reduce((n, l) => n + l.durationMs, 0) / 1000;

const SCRIPT = MISSION_SCRIPTS.find((m) => m.missionId === 'tower-and-stockade');
const DEBRIEF: readonly Line[] = (SCRIPT?.debrief ?? []).map((d) => line(d.textKey, SPEAKER_KEYS[d.speaker], 6500));
const BRIEFING: readonly Line[] = (SCRIPT?.briefing ?? []).map((d) => line(d.textKey, SPEAKER_KEYS[d.speaker], 6000));

interface Target {
  readonly it: Interactable;
  readonly marker: Marker | null;
  rule(): boolean;
}

function build(ctx: LevelContext<E>): TowerLevel {
  const era = 'mandate1940' as const;
  const world = new LevelWorld({ seed: 'ch01-tower', era, biome: 'jordanValley', size: 128, quality: ctx.quality, waterLevel: null });
  const sim = new TowerSim();
  const player = new PlayerController(world, ctx.input, ctx.reducedMotion, { era });
  const site = new SiteView(world, ctx.reducedMotion);
  const sky = new SkyClock(world);
  const crew = new Crew(world);
  const planner = new Planner(sim);
  const planPanel = ctx.headless ? null : new PlanningPanel(ctx.t, (a) => ctx.glyph(a));
  const lensesPanel = ctx.headless ? null : new LensesPanel(ctx.t, () => review());
  planPanel?.attach();
  lensesPanel?.attach();

  let timer = new MissionTimer(DAY_SECONDS, () => ctx.params().timerScale);
  let clockStart = 0;
  const recorded: Partial<Record<Stage, number>> = {};
  let planning = false;
  let breakLeft = 0;
  let finaleT = -1;
  let finaleFrom = 0.9;
  let panelShown = false;
  let skipOffered = false;
  let briefed = false;
  let bed = '';
  let planMessage: string | null = null;
  let planMessageT = 0;
  let stickRepeat = 0;
  let lastAlert = -1;
  let disposed = false;
  const unlocked = new Set<string>();

  const cue = (name: string): void => ctx.bus.emit('audio:cue', { cue: name });
  const unlockOnce = (kind: Parameters<LevelContext['unlock']>[0], id: string): void => {
    if (unlocked.has(kind + ':' + id)) return;
    unlocked.add(kind + ':' + id);
    ctx.unlock(kind, id);
  };
  const say = (lines: readonly Line[], label: Parameters<LevelContext['say']>[1] = 'composite'): void => ctx.say(lines, label);

  // ---- objectives and state changes ---------------------------------------------------------

  const syncObjectives = (): void => {
    ctx.objectives.progress('o1', sim.unloaded.filter(Boolean).length);
    ctx.objectives.progress('o2', sim.puzzle.placedCount);
    ctx.objectives.progress('o3', sim.filledCount);
    ctx.objectives.progress('o4', sim.sections + sim.fence + (sim.lightMounted ? 1 : 0));
    ctx.objectives.progress('o5', sim.lit ? 1 : 0);
  };

  const changed = (): void => {
    site.sync(sim, false);
    syncObjectives();
  };

  const advance = (event: E): void => {
    syncObjectives();
    if (!ctx.mission.send(event)) return;
    const next = ctx.mission.state as Stage;
    if (STAGES.includes(next)) {
      sim.stage = next;
      recorded[next] = sim.clock;
      crew.setStage(next, false);
    }
    site.sync(sim, false);
  };

  const review = (): void => {
    if (sim.stage !== 'lenses') return;
    lensesPanel?.show(false);
    player.controllable = true;
    advance('reviewed');
  };

  // ---- planning table -----------------------------------------------------------------------

  const drawPlan = (): void => {
    site.setGhost(planner.ghost, planner.fits, [planner.cx, planner.cy]);
    planPanel?.update(planner, planMessage);
  };

  const enterPlanning = (): void => {
    if (planning || sim.stage !== 'walls') return;
    planning = true;
    player.controllable = false;
    const rig = player.rig;
    rig.mode = 'planning';
    // Absolute camera height: a little above the site, looking down at the whole ring. The view
    // is shifted south so the ring sits above the frame chooser panel.
    const ground = world.heightAt(CENTER_X, CENTER_Z);
    rig.plan.x = CENTER_X;
    rig.plan.z = CENTER_Z + 5.5;
    rig.plan.minHeight = ground + 18;
    rig.plan.maxHeight = ground + 80;
    rig.plan.height = ground + 30;
    rig.plan.panSpeed = 0;
    planner.reset();
    planMessage = null;
    planPanel?.show(true);
    // Touch path for every planning action (the stick moves the cursor; BRIEF 7: fully playable by touch).
    ctx.touchActions(PLAN_TOUCH.map(([action, key]) => ({ action, label: ctx.t(K + 'touch.' + key) })));
    drawPlan();
  };

  const leavePlanning = (): void => {
    if (!planning) return;
    planning = false;
    player.controllable = true;
    player.rig.mode = 'follow';
    player.rig.snapBehind(player.motor.heading);
    planPanel?.show(false);
    ctx.touchActions(null);
    site.hideGhost();
  };

  const finishPlanning = (): void => {
    leavePlanning();
    unlockOnce('fact', 'prefab');
    syncObjectives();
    site.sync(sim, false);
    cue('ui.confirm');
    say([line(K + 'say.walled', FOREMAN, 5500)]);
    advance('walled');
  };

  const planOutcome = (reason: string | null): void => {
    planMessage = reason === null ? null : ctx.t(reason);
    planMessageT = reason === null ? 0 : 1.8;
    if (reason !== null) cue('ui.error');
  };

  const handlePlanning = (dt: number): void => {
    const inp = ctx.input;
    let dx = 0;
    let dy = 0;
    if (inp.justPressed('left')) dx = -1;
    else if (inp.justPressed('right')) dx = 1;
    else if (inp.justPressed('up')) dy = -1;
    else if (inp.justPressed('down')) dy = 1;
    const mx = inp.move.x;
    const my = inp.move.y;
    if (Math.abs(mx) > 0.55 || Math.abs(my) > 0.55) {
      stickRepeat -= dt;
      if (stickRepeat <= 0 && dx === 0 && dy === 0) {
        if (Math.abs(mx) >= Math.abs(my)) dx = mx > 0 ? 1 : -1;
        else dy = my > 0 ? 1 : -1;
        stickRepeat = 0.17;
      }
    } else stickRepeat = 0;
    if (dx !== 0 || dy !== 0) {
      planner.move(dx, dy);
      planMessage = null;
    }
    if (inp.justPressed('alt')) planner.rotate();
    if (inp.justPressed('tabNext')) planner.cycleType(1);
    if (inp.justPressed('tabPrev')) planner.cycleType(-1);
    if (inp.justPressed('interact') && planner.pickUp()) {
      cue('ui.toggle');
      changed();
    }
    if (inp.justPressed('map')) {
      planner.clear();
      changed();
    }
    if (inp.justPressed('confirm')) {
      const r = planner.place();
      planOutcome(r.reasonKey);
      if (r.ok) {
        cue('ui.confirm');
        changed();
        if (sim.walled) {
          finishPlanning();
          return;
        }
      }
    }
    if (inp.justPressed('back')) {
      leavePlanning();
      return;
    }
    if (planMessageT > 0) {
      planMessageT -= dt;
      if (planMessageT <= 0) planMessage = null;
    }
    drawPlan();
  };

  // ---- interactables ------------------------------------------------------------------------

  const targets: Target[] = [];
  const add = (
    id: string,
    kind: InteractableKind,
    at: Spot,
    radius: number,
    promptKey: string,
    rule: () => boolean,
    onInteract: () => void,
    marker: string | null = '#f2c14e',
  ): Interactable => {
    const it = ctx.interactions.add({ id, kind, x: at.x, z: at.z, radius, promptKey: K + 'prompt.' + promptKey, enabled: false, onInteract });
    targets.push({ it, marker: marker ? world.addMarker(at.x, at.z, marker) : null, rule });
    targets[targets.length - 1]?.marker?.setVisible(false);
    return it;
  };

  const afterUse = (): void => {
    cue('ui.confirm');
    changed();
  };

  for (let i = 0; i < CART_COUNT; i++) {
    add(
      'cart-' + String(i),
      'pickup',
      CART_SPOTS[i] as Spot,
      3.4,
      'unload',
      () => sim.stage === 'dawn' && sim.unloaded[i] === false,
      () => {
        if (!sim.unload(i)) return;
        afterUse();
        if (sim.allUnloaded) {
          say([line(K + 'say.unloaded', FOREMAN, 7000)]);
          advance('unloaded');
        }
      },
    );
  }
  add('table', 'generic', TABLE_SPOT, 3.2, 'plan', () => sim.stage === 'walls' && !planning, enterPlanning);
  add(
    'gravel-pile',
    'pickup',
    GRAVEL_PILE,
    3.4,
    'gravel',
    () => sim.stage === 'gravel' && (sim.carry === 'none' || sim.carry === 'gravel') && sim.loads < LOADS_PER_TRIP,
    () => {
      if (sim.takeGravel()) afterUse();
    },
  );
  for (let k = 0; k < STATION_COUNT; k++) {
    add(
      'station-' + String(k),
      'marker',
      STATION_SPOTS[k] as Spot,
      2.8,
      'fill',
      () => sim.stage === 'gravel' && sim.loads > 0 && sim.filled[k] === false,
      () => {
        if (sim.fillStation(k) !== 'ok') return;
        afterUse();
        if (sim.allFilled) {
          unlockOnce('testimony', 'settler');
          say([line(K + 'say.filled', FOREMAN, 5000)]);
          advance('filled');
        }
      },
    );
  }
  const sections = add(
    'sections',
    'pickup',
    SECTION_PILE,
    3.2,
    'section',
    () => (sim.stage === 'gravel' && !sim.allFilled) || (sim.stage === 'tower' && sim.carry === 'none' && sim.sections < SECTION_COUNT),
    () => {
      if (sim.stage === 'gravel') {
        // Starting the tower on an unfilled wall: warned once, then it fails (wrong order).
        if (!sim.warned) {
          sim.warned = true;
          say([line(K + 'say.warn', FOREMAN, 7000)]);
        } else ctx.mission.fail(FAIL_ORDER);
        return;
      }
      if (sim.takeSection()) afterUse();
    },
  );
  const base = add(
    'tower-base',
    'marker',
    TOWER_BASE,
    3.9,
    'place',
    () => (sim.stage === 'tower' && sim.carry === 'section') || (sim.stage === 'fence' && sim.carry === 'light') || (sim.stage === 'dusk' && sim.lightMounted && !sim.lit),
    () => {
      if (sim.stage === 'tower' && sim.placeSection()) {
        afterUse();
        if (sim.towerReady) {
          say([line(K + 'say.towerUp', FOREMAN, 5500)]);
          advance('raised');
        }
      } else if (sim.stage === 'fence' && sim.mountLight()) {
        afterUse();
        checkFenced();
      } else if (sim.stage === 'dusk' && sim.switchOn()) {
        switchOn();
      }
    },
  );
  const post = add(
    'fence-post',
    'marker',
    fenceSpot(0),
    3.4,
    'fence',
    () => sim.stage === 'fence' && sim.fence < FENCE_LEGS,
    () => {
      if (!sim.stringFence(sim.fence)) return;
      afterUse();
      checkFenced();
    },
  );
  add(
    'light-crate',
    'pickup',
    LIGHT_CRATE,
    3.2,
    'lightCrate',
    () => sim.stage === 'fence' && sim.carry === 'none' && !sim.lightMounted,
    () => {
      if (sim.takeLight()) afterUse();
    },
  );
  add(
    'water-jug',
    'generic',
    JUG_SPOT,
    3.2,
    'water',
    () => (sim.stage === 'gravel' || sim.stage === 'tower' || sim.stage === 'fence') && !sim.water,
    () => {
      sim.water = true;
      const lines = [line('ch01.tower.moment', null, 8000), line(K + 'say.water', FOREMAN, 4500)];
      say(lines, 'reconstructed');
      breakLeft = totalSeconds(lines) + 1;
      crew.startGirl({ x: -22, z: 13 }, { x: JUG_SPOT.x - 1.4, z: JUG_SPOT.z + 1.2 });
      cue('ui.toggle');
    },
    '#8fd0a8',
  );
  add(
    'meal',
    'generic',
    MEAL_SPOT,
    3.2,
    'meal',
    () => (sim.stage === 'tower' || sim.stage === 'fence') && !sim.meal,
    () => {
      sim.meal = true;
      const lines = [line(K + 'say.meal1', FOREMAN, 7500), line(K + 'say.meal2', WORKER, 7000)];
      say(lines, 'reconstructed');
      breakLeft = totalSeconds(lines) + 1;
      cue('ui.toggle');
    },
    '#8fd0a8',
  );

  function checkFenced(): void {
    if (sim.fenceDone && sim.lightMounted) {
      say([line(K + 'say.fenced', FOREMAN, 5500)]);
      advance('fenced');
    }
  }

  function switchOn(): void {
    finaleFrom = sim.clock;
    syncObjectives();
    cue('ui.confirm');
    unlockOnce('codex', 'tel-amal');
    unlockOnce('testimony', 'tenant');
    unlockOnce('archive', 'peel');
    site.sync(sim, false);
    advance('lit');
    setBed('night');
    if (ctx.headless) {
      finaleT = FINALE_SECONDS;
      return;
    }
    finaleT = 0;
    player.controllable = false;
    say(DEBRIEF, 'composite');
  }

  const refreshTargets = (): void => {
    base.promptKey = K + 'prompt.' + (sim.stage === 'fence' ? 'mount' : sim.stage === 'dusk' ? 'switch' : 'place');
    sections.promptKey = K + 'prompt.' + (sim.stage === 'gravel' ? 'early' : 'section');
    const leg = fenceSpot(Math.min(sim.fence, FENCE_LEGS - 1));
    post.x = leg.x;
    post.z = leg.z;
    for (const t of targets) {
      const on = t.rule();
      if (t.it.enabled !== on) {
        t.it.enabled = on;
        t.marker?.setVisible(on);
      }
      if (t.it === post && t.marker) t.marker.group.position.set(leg.x, world.heightAt(leg.x, leg.z) + 0.05, leg.z);
    }
  };

  const offFocus = ctx.interactions.onFocus((next) => {
    for (const t of targets) t.marker?.setHighlight(t.it === next);
  });

  // ---- visuals --------------------------------------------------------------------------------

  world.onVisual((dt, elapsed) => {
    sky.apply(sim.clock);
    site.update(dt, elapsed, player.x, player.motor.y, player.z, player.motor.heading, duskAmount(sim.clock));
    for (const t of targets) t.marker?.animate(elapsed, ctx.reducedMotion());
  });

  const setBed = (name: string): void => {
    if (bed === name) return;
    bed = name;
    cue('ambience.' + name);
  };

  const scene = world.gameScene(() => {
    if (disposed) return;
    disposed = true;
    offFocus();
    planPanel?.dispose();
    lensesPanel?.dispose();
    site.spot.dispose();
    cue('ambience.none');
  });

  // ---- level interface ------------------------------------------------------------------------

  const startClock = (from: number): void => {
    clockStart = from;
    timer = new MissionTimer((1 - from) * DAY_SECONDS, () => ctx.params().timerScale);
  };

  const level: TowerLevel = {
    scene,
    player,
    sim,
    planner,
    update(dt) {
      player.update(dt);
      const stage = sim.stage;
      if (stage === 'lenses') {
        updateFinale(dt);
        return;
      }
      if (planning) handlePlanning(dt);
      if (breakLeft > 0) breakLeft -= dt;
      else if (!planning) {
        const out = timer.update(dt);
        sim.clock = clockStart + (1 - clockStart) * (1 - timer.remaining / timer.duration);
        if (out || sim.clock >= 1) {
          leavePlanning();
          ctx.mission.fail(sunsetReason(stage));
          return;
        }
      }
      refreshTargets();
      const meter = sim.clock >= SUN_METER_FROM ? (sim.clock - SUN_METER_FROM) / (1 - SUN_METER_FROM) : 0;
      if (Math.abs(meter - lastAlert) > 0.01) {
        lastAlert = meter;
        ctx.alert(meter);
      }
      setBed(sim.clock >= 0.8 ? 'night' : 'village');
    },
    enterCheckpoint(checkpoint, data) {
      const snap = parseSnapshot(data);
      const stage = (STAGES as readonly string[]).includes(checkpoint) ? (checkpoint as Stage) : 'dawn';
      leavePlanning();
      if (snap) sim.restore(snap);
      else sim.resetTo(stage, restartFraction(stage, recorded[stage]));
      if (recorded[sim.stage] === undefined) recorded[sim.stage] = sim.clock;
      startClock(sim.clock);
      planner.reset();
      planMessage = null;
      breakLeft = 0;
      finaleT = sim.stage === 'lenses' ? FINALE_SECONDS : -1;
      panelShown = false;
      if (skipOffered) ctx.touchActions(null);
      skipOffered = false;
      lensesPanel?.show(false);
      lastAlert = -1;
      bed = '';
      const saved = data as { x?: unknown; z?: unknown } | null;
      const at = STAGE_SPAWN[sim.stage];
      if (saved && typeof saved.x === 'number' && typeof saved.z === 'number') player.spawn(saved.x, saved.z, SPAWN.heading);
      else player.spawn(at.x, at.z, SPAWN.heading);
      player.controllable = true;
      site.hideGhost();
      site.sync(sim, true);
      crew.hideGirl();
      crew.setStage(sim.stage, true);
      sky.apply(sim.clock);
      syncObjectives();
      refreshTargets();
      setBed(sim.clock >= 0.8 ? 'night' : 'village');
      if (sim.stage === 'dawn' && !snap) {
        unlockOnce('codex', 'arab-revolt');
        unlockOnce('codex', 'peel-commission');
        unlockOnce('codex', 'tower-and-stockade');
        if (!briefed) {
          briefed = true;
          say(BRIEFING, 'composite');
        }
      }
    },
    snapshotData: () => ({ x: player.x, z: player.z, sim: sim.snapshot() }),
    botPlan() {
      enterPlanning();
      for (const [id, p] of Object.entries(SOLUTION)) sim.placeFrame(id, p);
      changed();
      if (sim.walled) finishPlanning();
    },
    dispose: () => scene.dispose(),
  };

  function updateFinale(dt: number): void {
    if (finaleT < 0) return;
    finaleT += dt;
    // After the switch the sun runs down to the horizon while the debrief is spoken.
    const f = Math.min(1, finaleT / FINALE_SECONDS);
    sim.clock = Math.min(1, finaleFrom + (1 - finaleFrom) * f * f * (3 - 2 * f));
    ctx.alert(0);
    if (ctx.headless) {
      review();
      return;
    }
    if (!panelShown && finaleT > SKIP_AFTER && !skipOffered) {
      skipOffered = true;
      ctx.touchActions([{ action: 'confirm', label: ctx.t(K + 'touch.skip') }]);
    }
    if (!panelShown && (finaleT >= FINALE_SECONDS || (finaleT > SKIP_AFTER && ctx.input.justPressed('confirm')))) {
      panelShown = true;
      if (skipOffered) ctx.touchActions(null);
      lensesPanel?.show(true);
    } else if (panelShown && ctx.input.justPressed('confirm')) review();
  }

  return level;
}

// ---- bot script ---------------------------------------------------------------------------

const walk = (p: Spot, within = 0.7): BotStep => ({ kind: 'walkTo', x: p.x, z: p.z, within, timeout: 90 });
const press = (action: Action): BotStep => ({ kind: 'press', action });
const at = (x: number, z: number): Spot => ({ x, z });

function isTowerLevel(l: Level): l is TowerLevel {
  return 'botPlan' in l;
}

const PLAN_TAIL: readonly BotStep[] = [
  walk(at(-13, 14.2), 1.5),
  walk(APPROACH.table, 0.8),
  press('interact'),
  {
    kind: 'do',
    label: 'plan the wall',
    run: (l) => {
      if (isTowerLevel(l)) l.botPlan();
    },
  },
];

const TO_GATE_IN: readonly BotStep[] = [walk(GATE_OUT, 1.5), walk(GATE_IN, 1.2)];

/** One gravel trip: fill two loads at the pile, then visit two stations along a clear route. */
const gravelTrips: readonly (readonly BotStep[])[] = [
  // South side: both stations are on the way along z = 1.8.
  [walk(APPROACH.gravel, 0.8), press('interact'), walk(STATION_SPOTS[3] as Spot, 0.8), press('interact'), walk(STATION_SPOTS[4] as Spot, 0.8), press('interact')],
  // East side, around the pile and past the tent and the tower.
  [
    walk(at(-2, 2.5), 1.5),
    walk(APPROACH.gravel, 0.8),
    press('interact'),
    walk(at(2.8, 1), 1.2),
    walk(at(4.4, -5.5), 1.2),
    walk(STATION_SPOTS[1] as Spot, 0.8),
    press('interact'),
    walk(at(4.4, -5.5), 1.2),
    walk(STATION_SPOTS[2] as Spot, 0.8),
    press('interact'),
  ],
  // West side.
  [
    walk(at(8.5, 1.5), 1.2),
    walk(APPROACH.gravel, 0.8),
    press('interact'),
    walk(at(-1.5, 0.5), 1.2),
    walk(at(-4.6, -6), 1.2),
    walk(STATION_SPOTS[0] as Spot, 0.8),
    press('interact'),
    walk(at(-4.6, -6), 1.2),
    walk(STATION_SPOTS[5] as Spot, 0.8),
    press('interact'),
  ],
];

const sectionTrip: BotStep[] = [walk(APPROACH.sections, 0.8), press('interact'), walk(APPROACH.tower, 0.8), press('interact')];

// Works from inside the compound (straight through the gate) and from the south-west corner outside.
const DUSK_ROUTE: BotStep[] = [walk(GATE_OUT, 1.5), walk(GATE_IN, 1.2), walk(APPROACH.tower, 0.8), press('interact')];

const botScript: Record<Stage, readonly BotStep[]> = {
  dawn: [
    walk(APPROACH.cart(2), 0.8),
    press('interact'),
    walk(APPROACH.cart(3), 0.8),
    press('interact'),
    walk(at(0, 15.5), 1.5),
    walk(APPROACH.cart(1), 0.8),
    press('interact'),
    walk(APPROACH.cart(0), 0.8),
    press('interact'),
    ...PLAN_TAIL,
  ],
  walls: [...PLAN_TAIL],
  gravel: [...TO_GATE_IN, ...gravelTrips.flat()],
  tower: [...sectionTrip, ...sectionTrip, ...sectionTrip],
  fence: [
    walk(APPROACH.crate, 0.8),
    press('interact'),
    walk(APPROACH.tower, 0.8),
    press('interact'),
    walk(GATE_IN, 1.2),
    walk(GATE_OUT, 1.5),
    walk(at(-16, 8), 2),
    walk(fenceSpot(0), 0.8),
    press('interact'),
    walk(fenceSpot(1), 0.8),
    press('interact'),
    walk(fenceSpot(2), 0.8),
    press('interact'),
    walk(fenceSpot(3), 0.8),
    press('interact'),
  ],
  dusk: DUSK_ROUTE,
  lenses: [press('confirm')],
};

const failures: Readonly<Record<string, FailureInfo>> = {
  [FAIL_TIME_OUT]: { whatHappenedKey: 'ch01.tower.f1', sources: ['C1-065'], label: 'documented', hintKey: 'ch01.tower.h2' },
  [FAIL_UNFILLED]: { whatHappenedKey: 'ch01.tower.f2', sources: ['C1-065'], label: 'documented', hintKey: 'ch01.tower.h1' },
  [FAIL_ORDER]: { whatHappenedKey: 'ch01.tower.f3', sources: [], label: 'reconstructed', hintKey: 'ch01.tower.h1' },
};

const ringCorners = RING.filter((c) => c.kind === 'corner').map((c) => [c.x, c.z] as const);

export default defineLevel<Stage, E>({
  id: 'tower-stockade',
  chapterId: 'ch01',
  missionId: 'tower-and-stockade',
  mission: {
    id: 'tower-and-stockade',
    chapterId: 'ch01',
    gameplayType: 'PZL',
    checkpoints: CHECKPOINT_STAGES,
    machine: {
      initial: 'dawn',
      final: ['complete'],
      transitions: {
        dawn: { unloaded: 'walls' },
        walls: { walled: 'gravel' },
        gravel: { filled: 'tower' },
        tower: { raised: 'fence' },
        fence: { fenced: 'dusk' },
        dusk: { lit: 'lenses' },
        lenses: { reviewed: 'complete' },
        failed: {},
        complete: {},
      },
    },
  },
  objectives: [
    { id: 'o1', textKey: 'ch01.tower.o1', states: ['dawn'], steps: CART_COUNT },
    { id: 'o2', textKey: 'ch01.tower.o2', states: ['walls'], steps: PIECES.length },
    { id: 'o3', textKey: 'ch01.tower.o3', states: ['gravel'], steps: STATION_COUNT },
    { id: 'o4', textKey: 'ch01.tower.o4', states: ['tower', 'fence'], steps: SECTION_COUNT + FENCE_LEGS + 1 },
    { id: 'o5', textKey: 'ch01.tower.o5', states: ['dusk', 'lenses'] },
  ],
  failures,
  botScript,
  extraCheckpoints: EXTRA_CHECKPOINT_STAGES,
  briefingMap: {
    size: 64,
    points: [
      { x: SPAWN.x, z: SPAWN.z, kind: 'start' },
      ...CART_SPOTS.map((c, i) => ({ x: c.x, z: c.z, kind: 'item' as const, ...(i === 0 ? { labelKey: K + 'map.carts' } : {}) })),
      { x: TABLE_SPOT.x, z: TABLE_SPOT.z, kind: 'poi', labelKey: K + 'map.table' },
      { x: 0, z: 4, kind: 'poi', labelKey: K + 'map.gate' },
      { x: TOWER_BASE.x, z: TOWER_BASE.z, kind: 'goal', labelKey: K + 'map.tower' },
    ],
    routes: [[...ringCorners, ringCorners[0] as readonly [number, number]].map(([x, z]) => [x, z] as const)],
  },
  build,
});
