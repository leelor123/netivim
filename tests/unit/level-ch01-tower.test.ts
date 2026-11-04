import { describe, expect, it } from 'vitest';
import { CH01 } from '../../src/content/ch01/chapter';
import { MISSION_SCRIPTS, TWO_LENSES } from '../../src/content/ch01/dialogue';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { FIXED_DT } from '../../src/core/loop';
import { HEBREW } from '../../src/locales';
import { analyzeMission } from '../../src/core/mission';
import { loadChapter, loadLevel } from '../../src/gameplay/registry';
import { BotInput, runBot } from '../../src/gameplay/runtime/bot';
import { MissionHost } from '../../src/gameplay/runtime/missionHost';
import type { PlayerController } from '../../src/gameplay/runtime/player';
import type { AnyLevelDefinition } from '../../src/gameplay/types';
import { DEFAULT_WORLD_QUALITY } from '../../src/world/quality';
import type { TowerLevel } from '../../src/levels/ch01/tower-stockade';
import { APPROACH, DECISIONS } from '../../src/levels/ch01/tower-stockade';
import { Planner } from '../../src/levels/ch01/tower/planner';
import {
  CART_PIECES,
  FAIL_ORDER,
  FAIL_TIME_OUT,
  FAIL_UNFILLED,
  GATE_CELLS,
  GRID_H,
  GRID_W,
  isRingCell,
  parseSnapshot,
  PIECES,
  PIECE_COUNTS,
  restartFraction,
  RING,
  SOLUTION,
  STAGE_START,
  STAGES,
  STAKE_COUNT,
  STATION_CELLS,
  STATION_COUNT,
  sunsetReason,
  TowerSim,
} from '../../src/levels/ch01/tower/rules';
import { duskAmount, segmentIndex, SKY_KEYS } from '../../src/levels/ch01/tower/skyClock';

const stocked = (): TowerSim => {
  const sim = new TowerSim();
  sim.resetTo('walls', 0.12);
  return sim;
};

describe('tower layout and frames', () => {
  it('has a closed ring of wall cells with a two-cell gate', () => {
    expect(RING.length).toBe(2 * (GRID_W + GRID_H) - 4 - GATE_CELLS.length);
    for (const [gx, gy] of GATE_CELLS) expect(isRingCell(gx, gy)).toBe(false);
    expect(RING.filter((c) => c.kind === 'corner')).toHaveLength(4);
  });

  it('supplies exactly enough frame cells to cover the ring', () => {
    const cells = PIECES.reduce((n, p) => n + p.cells.length, 0);
    expect(cells).toBe(RING.length);
    expect(PIECES).toHaveLength(Object.values(PIECE_COUNTS).reduce((a, b) => a + b, 0));
    expect(CART_PIECES.flat().sort()).toEqual(PIECES.map((p) => p.id).sort());
  });

  it('the stored solution solves the puzzle and covers every ring cell once', () => {
    const sim = stocked();
    sim.puzzle.reset();
    for (const unloaded of [0, 1, 2, 3]) sim.unloaded[unloaded] = true;
    for (const [id, p] of Object.entries(SOLUTION)) expect(sim.placeFrame(id, p), id).toBeNull();
    expect(sim.walled).toBe(true);
    for (const c of RING) expect(sim.frameAt(c.cx, c.cy), c.cx + ',' + c.cy).not.toBeNull();
  });

  it('rejects frames that overlap, leave the ring, block the gate or are still on the cart', () => {
    const sim = new TowerSim();
    sim.resetTo('walls', 0.12);
    sim.puzzle.reset();
    sim.unloaded.fill(false);
    sim.unloaded[1] = true;
    expect(sim.placeFrame('l4-0', { x: 2, y: 0, rot: 0 })).toBeNull();
    expect(sim.placeFrame('l4-1', { x: 4, y: 0, rot: 0 })).toBe('gameplay.puzzle.overlap');
    expect(sim.placeFrame('l3-0', { x: 3, y: 3, rot: 0 })).toBe('gameplay.puzzle.blocked');
    expect(sim.placeFrame('l3-1', { x: 5, y: GRID_H - 1, rot: 0 })).toBe('gameplay.puzzle.blocked');
    expect(sim.placeFrame('l4-1', { x: GRID_W - 2, y: 0, rot: 0 })).toBe('gameplay.puzzle.outside');
    expect(sim.placeFrame('l2-0', { x: 0, y: 5, rot: 1 })).toBe('levels.ch01.tower.plan.notUnloaded');
  });

  it('frames cannot be placed outside the planning stage and a partial wall is not solved', () => {
    const sim = new TowerSim();
    expect(sim.placeFrame('l4-0', { x: 2, y: 0, rot: 0 })).toBe('levels.ch01.tower.plan.notNow');
    sim.resetTo('walls', 0.12);
    sim.puzzle.reset();
    sim.unloaded.fill(true);
    sim.placeFrame('l4-0', { x: 2, y: 0, rot: 0 });
    expect(sim.walled).toBe(false);
    expect(sim.removeFrame('l4-0')).toBe(true);
    expect(sim.puzzle.placedCount).toBe(0);
  });

  it('cart unloading only works at dawn and once per cart', () => {
    const sim = new TowerSim();
    expect(sim.unload(0)).toBe(true);
    expect(sim.unload(0)).toBe(false);
    expect(sim.isAvailable('corner-0')).toBe(true);
    expect(sim.isAvailable('l4-0')).toBe(false);
    sim.stage = 'walls';
    expect(sim.unload(1)).toBe(false);
  });

  it('corner stakes are tied at dawn only, once each, and a restart keeps them', () => {
    const sim = new TowerSim();
    expect(sim.stake(0)).toBe(true);
    expect(sim.stake(0)).toBe(false);
    expect(sim.stakedCount).toBe(1);
    for (let i = 1; i < STAKE_COUNT; i++) sim.stake(i);
    expect(sim.allStaked).toBe(true);
    sim.stage = 'walls';
    const fresh = new TowerSim();
    fresh.stage = 'walls';
    expect(fresh.stake(0)).toBe(false);
    fresh.restore(sim.snapshot());
    expect(fresh.allStaked).toBe(true);
    const again = new TowerSim();
    again.resetTo('gravel', STAGE_START.gravel);
    expect(again.allStaked).toBe(true);
    again.resetTo('dusk', STAGE_START.dusk);
    expect(again.neighbor).toBe(false);
    again.resetTo('lenses', 1);
    expect(again.neighbor).toBe(true);
  });
});

describe('planning table', () => {
  const planned = (): { sim: TowerSim; planner: Planner } => {
    const sim = new TowerSim();
    sim.resetTo('walls', 0.12);
    sim.puzzle.reset();
    const planner = new Planner(sim);
    return { sim, planner };
  };

  it('turns the frame so it fits on a side wall and cycles only through frame types that are left', () => {
    const { planner } = planned();
    planner.cycleType(1);
    expect(planner.type).toBe('l4');
    planner.moveTo(0, 2);
    expect(planner.fits).toBe(true);
    expect(planner.rot % 2).toBe(1);
    planner.moveTo(2, 0);
    expect(planner.rot).toBe(0);
    expect(planner.fits).toBe(true);
    expect(planner.place().ok).toBe(true);
    expect(planner.remaining('l4')).toBe(1);
  });

  it('can solve the whole puzzle through the planner API, lift a frame and clear the board', () => {
    const { sim, planner } = planned();
    for (const [id, p] of Object.entries(SOLUTION)) {
      planner.type = id.split('-')[0] as typeof planner.type;
      planner.moveTo(p.x, p.y);
      planner.rot = p.rot;
      const r = planner.place();
      expect(r.ok, id + ' ' + String(r.reasonKey)).toBe(true);
    }
    expect(sim.walled).toBe(true);
    planner.moveTo(2, 0);
    expect(planner.pickUp()).toBe(true);
    expect(sim.walled).toBe(false);
    planner.clear();
    expect(sim.puzzle.placedCount).toBe(0);
  });

  it('reports why a frame does not fit instead of placing it', () => {
    const { planner } = planned();
    planner.moveTo(5, 4);
    const r = planner.place();
    expect(r.ok).toBe(false);
    expect(r.reasonKey).toBe('gameplay.puzzle.blocked');
  });
});

describe('gravel, tower, fence and searchlight rules', () => {
  it('passes gravel in trips of two loads and fills each station once', () => {
    const sim = new TowerSim();
    sim.resetTo('gravel', 0.25);
    expect(sim.fillStation(0)).toBe('empty');
    expect(sim.takeGravel()).toBe(true);
    expect(sim.takeGravel()).toBe(false);
    expect(sim.fillStation(0)).toBe('ok');
    expect(sim.fillStation(0)).toBe('filled');
    expect(sim.fillStation(1)).toBe('ok');
    expect(sim.carry).toBe('none');
    expect(sim.fillStation(2)).toBe('empty');
    for (let k = 2; k < STATION_COUNT; k += 2) {
      sim.takeGravel();
      sim.fillStation(k);
      sim.fillStation(k + 1);
    }
    expect(sim.allFilled).toBe(true);
  });

  it('station cells partition the ring', () => {
    const all = STATION_CELLS.flat();
    expect(all).toHaveLength(RING.length);
    expect(new Set(all).size).toBe(RING.length);
  });

  it('raises the tower section by section and cannot take the light before it stands', () => {
    const sim = new TowerSim();
    sim.resetTo('tower', 0.45);
    expect(sim.placeSection()).toBe(false);
    for (let i = 0; i < 3; i++) {
      expect(sim.takeSection()).toBe(true);
      expect(sim.takeSection()).toBe(false);
      expect(sim.placeSection()).toBe(true);
    }
    expect(sim.takeSection()).toBe(false);
    expect(sim.towerReady).toBe(true);
    expect(sim.takeLight()).toBe(false);
  });

  it('strings the fence legs in order, mounts the light and only then can it be switched on', () => {
    const sim = new TowerSim();
    sim.resetTo('fence', 0.62);
    expect(sim.stringFence(1)).toBe(false);
    for (let leg = 0; leg < 4; leg++) expect(sim.stringFence(leg)).toBe(true);
    expect(sim.fenceDone).toBe(true);
    expect(sim.mountLight()).toBe(false);
    expect(sim.takeLight()).toBe(true);
    expect(sim.mountLight()).toBe(true);
    sim.stage = 'dusk';
    expect(sim.switchOn(), 'not before the man at the field edge was heard').toBe(false);
    expect(sim.hearNeighbor()).toBe(true);
    expect(sim.hearNeighbor()).toBe(false);
    expect(sim.switchOn()).toBe(true);
    expect(sim.switchOn()).toBe(false);
  });

  it('every checkpoint restart is a consistent world', () => {
    for (const stage of STAGES) {
      const sim = new TowerSim();
      sim.resetTo(stage, STAGE_START[stage]);
      const after = (s: (typeof STAGES)[number]): boolean => STAGES.indexOf(stage) > STAGES.indexOf(s);
      expect(sim.walled).toBe(after('walls'));
      expect(sim.allFilled).toBe(after('gravel'));
      expect(sim.towerReady).toBe(after('tower'));
      expect(sim.fenceDone).toBe(after('fence'));
      expect(sim.lightMounted).toBe(after('fence'));
      expect(sim.allUnloaded).toBe(after('dawn'));
    }
  });
});

describe('the day', () => {
  it('stages start in order and the sun keys cover the whole day', () => {
    const starts = STAGES.map((s) => STAGE_START[s]);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    expect(SKY_KEYS[0]?.t).toBe(0);
    expect(SKY_KEYS[SKY_KEYS.length - 1]?.t).toBe(1);
    for (let i = 1; i < SKY_KEYS.length; i++) expect((SKY_KEYS[i]?.t ?? 0) > (SKY_KEYS[i - 1]?.t ?? 0)).toBe(true);
    expect(segmentIndex(-1)).toBe(0);
    expect(segmentIndex(2)).toBe(SKY_KEYS.length - 2);
    expect(duskAmount(0.5)).toBe(0);
    expect(duskAmount(1)).toBe(1);
  });

  it('a restart never starts later than the stage nominal time and an unfilled wall is named at sunset', () => {
    expect(restartFraction('gravel', undefined)).toBe(STAGE_START.gravel);
    expect(restartFraction('gravel', 0.1)).toBe(0.1);
    expect(restartFraction('gravel', 0.9)).toBe(STAGE_START.gravel);
    expect(sunsetReason('gravel')).toBe(FAIL_UNFILLED);
    expect(sunsetReason('tower')).toBe(FAIL_TIME_OUT);
  });

  it('snapshots round trip and junk is rejected', () => {
    const sim = new TowerSim();
    sim.resetTo('gravel', 0.3);
    sim.takeGravel();
    sim.fillStation(2);
    const snap = parseSnapshot({ x: 1, z: 2, sim: sim.snapshot() });
    expect(snap).not.toBeNull();
    const other = new TowerSim();
    if (snap) other.restore(snap);
    expect(other.filled[2]).toBe(true);
    expect(other.loads).toBe(1);
    expect(other.walled).toBe(true);
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot({ sim: { stage: 'nope' } })).toBeNull();
    expect(parseSnapshot({ x: 1 })).toBeNull();
  });
});

describe('level definition', () => {
  const load = (): Promise<AnyLevelDefinition> => loadLevel('tower-stockade');

  it('is registered, has a sound machine and the five content checkpoints', async () => {
    const def = await load();
    expect(analyzeMission(def.mission).ok).toBe(true);
    expect(def.mission.checkpoints).toHaveLength(5);
    expect(def.mission.gameplayType).toBe('PZL');
    expect(def.extraCheckpoints).toContain('lenses');
    const script = MISSION_SCRIPTS.find((m) => m.missionId === def.missionId);
    expect(script?.checkpointKeys).toHaveLength(def.mission.checkpoints.length);
    expect(def.objectives.map((o) => o.textKey)).toEqual(script?.objectiveKeys);
  });

  it('lists every failure with a source, a label and existing text', async () => {
    const def = await load();
    expect(Object.keys(def.failures).sort()).toEqual([FAIL_ORDER, FAIL_TIME_OUT, FAIL_UNFILLED].sort());
    for (const info of Object.values(def.failures)) {
      expect(HEBREW[info.whatHappenedKey]).toBeTruthy();
      expect(HEBREW[info.hintKey]).toBeTruthy();
      if (info.label === 'documented') expect(info.sources.length).toBeGreaterThan(0);
    }
    expect(def.failures[FAIL_ORDER]?.label).toBe('reconstructed');
  });

  it('every locale key the level uses exists in Hebrew', () => {
    const keys = [
      'levels.ch01.tower.context',
      ...['corner', 'l4', 'l3', 'l2', 'l1'].map((t) => 'levels.ch01.tower.piece.' + t),
      ...['unload', 'plan', 'gravel', 'fill', 'section', 'place', 'fence', 'lightCrate', 'mount', 'switch', 'water', 'meal', 'early', 'stake', 'sign', 'neighbor', 'rest'].map((p) => 'levels.ch01.tower.prompt.' + p),
      ...['unloaded', 'walled', 'filled', 'towerUp', 'fenced', 'warn', 'water', 'meal1', 'meal2', 'stakeFirst', 'unloadedFirst', 'stakedFirst', 'dusk', 'halfway', 'sec2', 'towerCheer', 'cheer'].map((s) => 'levels.ch01.tower.say.' + s),
      ...['sign.1', 'sign.2', 'neighbor.intro', 'neighbor.outro', 'rest.1', 'rest.2', 'rest.3', 'rest.4', 'rest.5'].map((s) => 'levels.ch01.tower.' + s),
      ...['timeout', 'unfilled', 'order'].map((r) => 'levels.ch01.tower.fail.' + r),
      ...['title', 'controls', 'progress', 'fits', 'nofit', 'none', 'notNow', 'notUnloaded'].map((p) => 'levels.ch01.tower.plan.' + p),
      ...['kicker', 'accepted', 'shared', 'continue'].map((p) => 'levels.ch01.tower.lenses.' + p),
      'levels.ch01.tower.speaker.foreman',
      'levels.ch01.tower.speaker.worker',
      'levels.ch01.tower.speaker.neighbor',
      'levels.ch01.tower.map.carts',
      'levels.ch01.tower.map.table',
      'levels.ch01.tower.map.gate',
      'levels.ch01.tower.map.tower',
      'ch01.tower.moment',
    ];
    for (const d of DECISIONS) {
      keys.push(d.promptKey, d.historical.textKey);
      for (const o of d.options) keys.push(o.labelKey, o.consequenceKey);
    }
    for (const k of keys) expect(HEBREW[k], k).toBeTruthy();
    const land = TWO_LENSES.find((x) => x.id === 'land');
    expect(land?.lenses).toHaveLength(2);
  });

  it('wording rule: the context says within a day, never overnight', () => {
    const text = HEBREW['levels.ch01.tower.context'] ?? '';
    expect(text).toContain('בתוך יום');
    expect(text).not.toContain('בן לילה');
    expect(text).not.toContain('בלילה');
  });

  it('the Ch01 chapter lists the three levels in order and its first level is registered', async () => {
    const chapter = await loadChapter('ch01');
    expect(chapter.levels).toEqual(['tower-stockade', 'night-landing', 'the-vote']);
    expect(chapter.timelineId).toBe('ch01');
    expect(chapter.content).toBe(CH01);
    expect(chapter.cutsceneId).toBe('ch01.stockade-and-radio');
    expect(HEBREW[chapter.briefingContextKey]).toBeTruthy();
    expect(chapter.content.missions[0]?.id).toBe((await load()).missionId);
  });
});

describe('playing the level headless', { timeout: 120000 }, () => {
  const makeHost = async (checkpoint: string, snapshot: Parameters<typeof makeHostWith>[2] = null) => makeHostWith(await loadLevel('tower-stockade'), checkpoint, snapshot);

  function makeHostWith(def: AnyLevelDefinition, checkpoint: string, snapshot: { state: string; checkpoint: string; data: unknown } | null) {
    const bus = new EventBus<GameEvents>();
    const input = new BotInput();
    const failed: string[] = [];
    const snap = snapshot ?? { state: checkpoint, checkpoint, data: null };
    const host = new MissionHost({
      def,
      bus,
      input,
      difficulty: () => 'normal',
      headless: true,
      quality: { ...DEFAULT_WORLD_QUALITY, shadows: false },
      reducedMotion: () => false,
      t: (k) => k,
      glyph: (a) => a,
      recordChoice: () => undefined,
      snapshot: { missionId: def.missionId, ...snap },
      hooks: {
        onFailed: (r) => failed.push(r.reasonKey),
        onDecision: () => undefined,
        onComplete: () => undefined,
        onPlan: () => undefined,
      },
    });
    host.start();
    const level = host.level as TowerLevel;
    const step = (seconds: number): void => {
      for (let t = 0; t < seconds; t += FIXED_DT) {
        input.beginStep();
        host.update(FIXED_DT);
      }
    };
    const tap = (a: Parameters<BotInput['tap']>[0]): void => {
      input.tap(a);
      input.beginStep();
      host.update(FIXED_DT);
    };
    const teleport = (x: number, z: number): void => (level.player as unknown as PlayerController).spawn(x, z, Math.PI);
    return { host, level, failed, step, tap, teleport, input };
  }

  it('sunset in the gravel stage fails as an unfilled wall, elsewhere as time out', async () => {
    const gravel = await makeHost('gravel');
    gravel.step(600);
    expect(gravel.failed).toEqual([FAIL_UNFILLED]);
    gravel.host.dispose();
    const dawn = await makeHost('dawn');
    dawn.step(601);
    expect(dawn.failed).toEqual([FAIL_TIME_OUT]);
    dawn.host.dispose();
  });

  it('the day does not tick while the player plans at the table', async () => {
    const h = await makeHost('walls');
    h.teleport(APPROACH.table.x, APPROACH.table.z);
    h.step(0.1);
    h.tap('interact');
    h.step(0.1);
    const before = h.level.sim.clock;
    h.step(30);
    expect(h.level.sim.clock).toBe(before);
    h.tap('back');
    h.step(5);
    expect(h.level.sim.clock).toBeGreaterThan(before);
    h.host.dispose();
  });

  it('starting the tower on an unfilled wall is warned once, then fails as wrong order', async () => {
    const h = await makeHost('gravel');
    h.teleport(APPROACH.sections.x, APPROACH.sections.z);
    h.step(0.1);
    h.tap('interact');
    h.step(0.1);
    expect(h.level.sim.warned).toBe(true);
    expect(h.failed).toEqual([]);
    h.tap('interact');
    expect(h.failed).toEqual([FAIL_ORDER]);
    h.host.dispose();
  });

  it('an exact manual save restores the work in progress and the clock', async () => {
    const a = await makeHost('gravel');
    a.level.sim.takeGravel();
    a.level.sim.fillStation(0);
    a.step(20);
    const saved = a.host.snapshot();
    a.host.dispose();
    const b = await makeHost('gravel', { state: saved.state, checkpoint: saved.checkpoint, data: saved.data });
    expect(b.level.sim.filled[0]).toBe(true);
    expect(b.level.sim.loads).toBe(1);
    expect(b.level.sim.clock).toBeGreaterThan(STAGE_START.gravel);
    b.host.dispose();
  });

  it('a retry returns to the checkpoint world and a repeated dispose is safe', async () => {
    const h = await makeHost('tower');
    h.level.sim.takeSection();
    h.level.sim.placeSection();
    h.host.fail(FAIL_TIME_OUT);
    h.host.retry();
    expect(h.level.sim.sections).toBe(0);
    expect(h.level.sim.clock).toBeCloseTo(STAGE_START.tower, 5);
    h.host.dispose();
    expect(() => h.level.dispose()).not.toThrow();
  });

  it('the bot clears the whole day on every difficulty within the sun budget', async () => {
    const def = await loadLevel('tower-stockade');
    for (const difficulty of ['story', 'normal', 'challenge'] as const) {
      const r = runBot(def, { difficulty });
      expect(r.completed, difficulty + ': ' + r.log.join(' | ')).toBe(true);
      expect(r.failures).toEqual([]);
      // Walking, planning and the finale take well under the shortest day (480 s).
      expect(r.seconds).toBeLessThan(250);
    }
  }, 120000);
});
