import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CH00_TWO_LENSES } from '../../src/content/ch00/chapter';
import { FAILURES } from '../../src/content/ch00/dialogue';
import { DIFFICULTY, type DifficultyLevel } from '../../src/core/difficulty';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { analyzeMission, type MissionSnapshot } from '../../src/core/mission';
import { contains } from '../../src/gameplay/core/collision';
import { LogisticsModel } from '../../src/gameplay/modules/logistics';
import { loadLevel } from '../../src/gameplay/registry';
import { BotInput, runBot } from '../../src/gameplay/runtime/bot';
import { MissionHost } from '../../src/gameplay/runtime/missionHost';
import type { PlayerController } from '../../src/gameplay/runtime/player';
import type { AnyLevelDefinition, BotStep } from '../../src/gameplay/types';
import { FOLK } from '../../src/levels/ch00/jaffa/folk';
import * as L from '../../src/levels/ch00/jaffa/layout';
import { createPlan, PLAN_SCENARIO, ROUTE_DUNES, ROUTE_MAIN, ROUTE_PACK } from '../../src/levels/ch00/jaffa/plan';
import { HEBREW } from '../../src/locales';
import { FIELDS } from '../../src/levels/ch00/jaffa/layout';
import { FIXED_DT } from '../../src/core/loop';
import { DEFAULT_WORLD_QUALITY } from '../../src/world/quality';

const DIFFICULTIES: readonly DifficultyLevel[] = ['story', 'normal', 'challenge'];
const interact: BotStep = { kind: 'press', action: 'interact' };
const walk = (p: L.Pt, within = 1.1): BotStep => ({ kind: 'walkTo', x: p.x, z: p.z, within });

async function def(): Promise<AnyLevelDefinition> {
  return loadLevel('jaffa-letters');
}

/** Same level, one checkpoint's script replaced. */
function withScript(base: AnyLevelDefinition, checkpoint: string, steps: readonly BotStep[]): AnyLevelDefinition {
  return { ...base, botScript: { ...base.botScript, [checkpoint]: steps } };
}

const teleport = (x: number, z: number): BotStep => ({
  kind: 'do',
  label: 'teleport',
  run: (level) => (level.player as unknown as PlayerController).spawn(x, z, 0),
});

describe('jaffa-letters: the logistics plan', () => {
  it('is solvable on every difficulty with the greedy planner', () => {
    for (const d of DIFFICULTIES) {
      const model = createPlan(DIFFICULTY[d].resourceScale);
      expect(model.solveGreedy(), d).toBe(true);
      expect(model.evaluate().meetsGoal, d).toBe(true);
    }
  });

  it('forces a real choice: no single vehicle is enough, a cart plus a second vehicle is', () => {
    const only = (id: string): boolean => {
      const m = new LogisticsModel(PLAN_SCENARIO, 1);
      m.assign(id, 1);
      return m.evaluate().meetsGoal;
    };
    expect(only(ROUTE_PACK)).toBe(false);
    expect(only(ROUTE_MAIN)).toBe(false);
    expect(only(ROUTE_DUNES)).toBe(false);
    const m = new LogisticsModel(PLAN_SCENARIO, 1);
    m.assign(ROUTE_MAIN, 1);
    m.assign(ROUTE_DUNES, 1);
    expect(m.evaluate().meetsGoal).toBe(true);
    expect(m.vehiclesFree).toBe(1);
    expect(m.assign(ROUTE_PACK, 1)).toBe(true);
    expect(m.assign(ROUTE_PACK, 1)).toBe(false);
  });

  it('caps the main road at two carts and prints a water risk for every route', () => {
    const m = new LogisticsModel(PLAN_SCENARIO, 1.5);
    expect(m.assign(ROUTE_MAIN, 1)).toBe(true);
    expect(m.assign(ROUTE_MAIN, 1)).toBe(true);
    expect(m.assign(ROUTE_MAIN, 1)).toBe(false);
    for (const r of PLAN_SCENARIO.routes) {
      expect(r.riskKey, r.id).toBeTruthy();
      expect(HEBREW[r.riskKey ?? ''], r.id).toBeTruthy();
      expect(HEBREW[r.labelKey], r.id).toBeTruthy();
    }
  });
});

describe('jaffa-letters: definition and content', () => {
  it('has a sound machine with two extra checkpoints and a bot script for each', async () => {
    const d = await def();
    expect(analyzeMission(d.mission).problems).toEqual([]);
    expect(d.mission.checkpoints).toHaveLength(9);
    expect(d.extraCheckpoints).toEqual(['road_mid', 'path_mid']);
    expect(d.missionId).toBe('letters-from-jaffa');
    expect(d.mission.gameplayType).toBe('LOG');
  });

  it('lists the four design failures with card text, sources and a hint', async () => {
    const d = await def();
    expect(Object.keys(d.failures).sort()).toEqual(['colony-no-parts', 'field-crossing', 'missed-train', 'wrong-addressee']);
    for (const [reason, info] of Object.entries(d.failures)) {
      expect(HEBREW[info.whatHappenedKey], reason).toBeTruthy();
      expect(HEBREW[info.hintKey], reason).toBeTruthy();
      expect(info.sources.length, reason).toBeGreaterThan(0);
      expect(FAILURES.find((f) => f.id === reason)?.missionId).toBe('letters-from-jaffa');
    }
  });

  it('resolves every locale key it uses', () => {
    const src = readFileSync('src/levels/ch00/jaffa-letters.ts', 'utf8');
    const own = [...src.matchAll(/\bk\('([^']+)'\)/g)].map((m) => 'levels.ch00.jaffa.' + (m[1] ?? ''));
    const plan = [...src.matchAll(/'(levels\.ch00\.jaffa\.[a-zA-Z0-9.]+)'/g)].map((m) => m[1] ?? '');
    const content = [...src.matchAll(/'(ch00\.[a-zA-Z0-9.-]+)'/g)].map((m) => m[1] ?? '');
    const dynamic = [...['1', '2', '3', '4'].map((n) => 'levels.ch00.jaffa.line.tag.' + n), ...['porter', 'water', 'runner'].flatMap((w) => ['1', '2'].map((n) => 'levels.ch00.jaffa.line.market.' + w + '.' + n)), ...['porter', 'waterSeller', 'runner', 'wayfarer'].map((s) => 'levels.ch00.jaffa.speaker.' + s)];
    const missing = [...own, ...plan, ...content, ...dynamic].filter((key) => !(key in HEBREW) && !key.endsWith('.'));
    expect(missing).toEqual([]);
    const planKeys = PLAN_SCENARIO.routes.flatMap((r) => [r.labelKey, r.riskKey ?? '']);
    for (const key of planKeys) expect(key in HEBREW, key).toBe(true);
  });

  it('uses only prefixed new strings and keeps every string non-empty', () => {
    const json = JSON.parse(readFileSync('src/locales/he/levels-ch00-jaffa.json', 'utf8')) as Record<string, string>;
    for (const [key, text] of Object.entries(json)) {
      expect(key.startsWith('levels.ch00.jaffa.'), key).toBe(true);
      expect(text.trim().length, key).toBeGreaterThan(3);
    }
  });
});

describe('jaffa-letters: the layout is walkable', () => {
  it('keeps every interaction point, spawn and named character out of the colliders', async () => {
    const d = await def();
    const bus = new EventBus<GameEvents>();
    const host = new MissionHost({
      def: d,
      bus,
      input: new BotInput(),
      difficulty: () => 'normal',
      headless: true,
      quality: { ...DEFAULT_WORLD_QUALITY, shadows: false },
      reducedMotion: () => false,
      t: (key) => key,
      glyph: (a) => a,
      recordChoice: () => undefined,
      hooks: { onFailed: () => undefined, onDecision: () => undefined, onComplete: () => undefined, onPlan: () => undefined },
    });
    host.start();
    const ids = ['vendor', 'plan-desk', 'debora', 'jamila', 'stationmaster', 'ticket', 'train-door', 'eliyahu', 'listen', 'well-sign', 'oven', 'decoy-village', 'decoy-jerusalem', 'load-parts', 'load-parcel', 'load-letter', 'lantern-clerk', 'lantern-colony', 'lantern-village', 'lantern-jerusalem', 'tag-0', 'tag-3', 'market-0', 'market-1', 'market-2', 'road-well', 'wayfarer'];
    // Colliders are reachable through a player motor.
    const colliders = (host.level?.player as unknown as PlayerController).motor.colliders;
    const points: [string, number, number][] = ids.map((id) => {
      const it = host.interactions.get(id);
      expect(it, id).toBeTruthy();
      return [id, it?.x ?? 0, it?.z ?? 0];
    });
    for (const sp of ['SPAWN_PORT', 'SPAWN_COLONY', 'SPAWN_VILLAGE_ARRIVAL', 'SPAWN_VILLAGE_DONE', 'SPAWN_STATION', 'SPAWN_JERUSALEM', 'SPAWN_ROAD_MID', 'SPAWN_PATH_MID', 'SPAWN_MARKET'] as const) {
      const s = L[sp];
      points.push([sp, s.x, s.z]);
    }
    for (const [name, x, z] of points) {
      for (const c of colliders) {
        // A named character is solid at its own interaction point; everything else must be clear.
        if (c.kind === 'circle' && Math.hypot(c.x - x, c.z - z) < 0.01) continue;
        expect(contains(c, x, z), name + ' inside a collider at ' + String(c.x) + ',' + String(c.z)).toBe(false);
      }
    }
    // Every character stands inside the playable bounds.
    for (const f of FOLK) {
      expect(Math.abs(f.x), f.id).toBeLessThan(L.WORLD_SIZE / 2 - 2);
      expect(Math.abs(f.z), f.id).toBeLessThan(L.WORLD_SIZE / 2 - 2);
    }
    host.dispose();
    host.dispose();
  });

  it('keeps all fields away from the roads, the paths and the key points', () => {
    for (const f of FIELDS) {
      for (const k of L.KEY_POINTS) expect(k.x >= f.minX - 3 && k.x <= f.maxX + 3 && k.z >= f.minZ - 3 && k.z <= f.maxZ + 3, f.id).toBe(false);
      for (const route of [L.WAY_TO_COLONY, L.WAY_TO_VILLAGE, L.WAY_TO_STATION]) {
        for (const p of route) expect(p.x >= f.minX - 4 && p.x <= f.maxX + 4 && p.z >= f.minZ - 4 && p.z <= f.maxZ + 4, f.id + ' near ' + String(p.x) + ',' + String(p.z)).toBe(false);
      }
    }
  });
});

describe('jaffa-letters: the market, the roadside well and the cold tea', () => {
  it('needs the three quay talks before the planning desk, and the well and the tea around the colony delivery', async () => {
    const d = await def();
    const bus = new EventBus<GameEvents>();
    const shown: string[] = [];
    bus.on('subtitle:show', (e) => shown.push(e.textKey));
    const r = runBot(d, { difficulty: 'normal', bus });
    expect(r.completed, r.log.join(' | ')).toBe(true);
    for (const key of [
      'levels.ch00.jaffa.line.market.porter.1',
      'levels.ch00.jaffa.line.market.water.1',
      'levels.ch00.jaffa.line.market.runner.1',
      'levels.ch00.jaffa.line.roadwell.main',
      'levels.ch00.jaffa.line.debora.tea.1',
    ]) {
      expect(shown, key).toContain(key);
    }
    const at = (key: string): number => shown.indexOf(key);
    expect(at('levels.ch00.jaffa.line.market.runner.1')).toBeLessThan(at('levels.ch00.jaffa.line.habib.briefed'));
    expect(at('levels.ch00.jaffa.line.roadwell.main')).toBeLessThan(at('levels.ch00.jaffa.line.debora.tea.1'));
  });

  it('asks the courier to water at the well first, without failing, then lets the colony delivery go through', async () => {
    const d = await def();
    const bus = new EventBus<GameEvents>();
    const shown: string[] = [];
    bus.on('subtitle:show', (e) => shown.push(e.textKey));
    const noWell = withScript(d, 'road_mid', [walk(L.DEBORA, 1.5), interact, ...(d.botScript['road_mid'] ?? [])]);
    const r = runBot(noWell, { difficulty: 'normal', fromCheckpoint: 'road_mid', bus });
    expect(r.failures).toEqual([]);
    expect(r.completed, r.log.join(' | ')).toBe(true);
    expect(shown).toContain('levels.ch00.jaffa.line.debora.dusty');
  });
});

describe('jaffa-letters: soft failures', () => {
  it('fails at the colony without the well parts, then the retry has the full cart and finishes', async () => {
    const d = await def();
    const noParts = withScript(d, 'loaded', [
      walk({ x: L.PLAN_DESK.x, z: L.PLAN_DESK.z + 1 }, 0.6),
      interact,
      { kind: 'plan' },
      walk(L.LOAD_PARCEL, 0.9),
      interact,
      walk(L.LOAD_LETTER, 0.9),
      interact,
      walk(L.GATE_YARD, 1.5),
      walk(L.GATE_ROAD, 1.2),
    ]);
    const first = runBot(noParts, { difficulty: 'normal', fromCheckpoint: 'loaded', maxSeconds: 400 });
    // Parcel and letter refuse to load before the heavy parts (Habib asks for the order), so the
    // cart leaves empty and the colony says so.
    expect(first.failures.map((f) => f.reasonKey)).toEqual(['colony-no-parts']);
    expect(first.failures[0]?.info?.hintKey).toBe('ch00.fail.colony-no-parts.hint');
    const retry = runBot(noParts, { difficulty: 'normal', fromCheckpoint: 'loaded', maxSeconds: 600, retryOnFail: true });
    expect(retry.failures.map((f) => f.reasonKey)).toEqual(['colony-no-parts']);
    expect(retry.completed, retry.log.join(' | ')).toBe(true);
  });

  it('warns for at least the telegraph time before a field counts, on every difficulty', async () => {
    const d = await def();
    const f1 = FIELDS[0];
    if (!f1) throw new Error('no field');
    const cx = (f1.minX + f1.maxX) / 2;
    const cz = (f1.minZ + f1.maxZ) / 2;
    for (const difficulty of DIFFICULTIES) {
      const script = withScript(d, 'colony_delivered', [teleport(cx, cz), { kind: 'wait', seconds: 30 }]);
      const r = runBot(script, { difficulty, fromCheckpoint: 'colony_delivered', maxSeconds: 60 });
      expect(r.failures.map((f) => f.reasonKey), difficulty).toEqual(['field-crossing']);
      const warn = DIFFICULTY[difficulty].telegraphSeconds;
      expect(r.seconds, difficulty).toBeGreaterThanOrEqual(Math.max(2, warn) - 0.05);
      expect(r.seconds, difficulty).toBeLessThan(Math.max(2, warn) + 0.5);
    }
  });

  it('leaving the field in time cancels the warning', async () => {
    const d = await def();
    const f1 = FIELDS[0];
    if (!f1) throw new Error('no field');
    const script = withScript(d, 'colony_delivered', [
      teleport(f1.minX + 3, f1.minZ + 3),
      { kind: 'wait', seconds: 1.2 },
      teleport(L.SPAWN_COLONY.x, L.SPAWN_COLONY.z),
      { kind: 'wait', seconds: 8 },
      ...(d.botScript['colony_delivered'] ?? []),
    ]);
    const r = runBot(script, { difficulty: 'normal', fromCheckpoint: 'colony_delivered' });
    expect(r.failures).toEqual([]);
    expect(r.completed).toBe(true);
  });

  it('corrects a wrong door politely in the village and in Jerusalem', async () => {
    const d = await def();
    const village = withScript(d, 'village_arrival', [walk(L.DECOY_VILLAGE, 1.2), interact]);
    const rv = runBot(village, { difficulty: 'normal', fromCheckpoint: 'village_arrival', maxSeconds: 120 });
    expect(rv.failures.map((f) => f.reasonKey)).toEqual(['wrong-addressee']);
    const jerusalem = withScript(d, 'jerusalem_delivered', [walk(L.DECOY_JERUSALEM, 1.2), interact]);
    const rj = runBot(jerusalem, { difficulty: 'normal', fromCheckpoint: 'jerusalem_delivered', maxSeconds: 120 });
    expect(rj.failures.map((f) => f.reasonKey)).toEqual(['wrong-addressee']);
  });

  it('misses the train when the bell runs out on Normal and Challenge, never on Story', async () => {
    const d = await def();
    const idle = withScript(d, 'station', [walk(L.TICKET_WINDOW, 1.2), interact, { kind: 'wait', seconds: 120 }]);
    for (const difficulty of ['normal', 'challenge'] as const) {
      const r = runBot(idle, { difficulty, fromCheckpoint: 'station', maxSeconds: 120 });
      expect(r.failures.map((f) => f.reasonKey), difficulty).toEqual(['missed-train']);
      expect(r.seconds, difficulty).toBeGreaterThan(30);
    }
    const story = runBot(idle, { difficulty: 'story', fromCheckpoint: 'station', maxSeconds: 110 });
    expect(story.failures).toEqual([]);
    expect(story.completed).toBe(false);
  });

  it('retries a missed train from the station checkpoint and then boards', async () => {
    const d = await def();
    const original = d.botScript['station'] ?? [];
    const scripts: Record<string, readonly BotStep[]> = { ...d.botScript };
    // The first pass idles until the bell runs out; the retry runs the real script.
    scripts['station'] = [
      walk(L.TICKET_WINDOW, 1.2),
      interact,
      { kind: 'do', label: 'switch to the real script', run: () => void (scripts['station'] = original) },
      { kind: 'wait', seconds: 100 },
    ];
    const r = runBot({ ...d, botScript: scripts }, { difficulty: 'normal', fromCheckpoint: 'station', maxSeconds: 400, retryOnFail: true });
    expect(r.failures.map((f) => f.reasonKey)).toEqual(['missed-train']);
    expect(r.completed, r.log.join(' | ')).toBe(true);
  });
});

describe('jaffa-letters: moments and rewards', () => {
  it('shows the Two Lenses text exactly as written in the content, in order', async () => {
    const d = await def();
    const bus = new EventBus<GameEvents>();
    const shown: string[] = [];
    bus.on('subtitle:show', (e) => shown.push(e.textKey));
    const r = runBot(d, { difficulty: 'normal', fromCheckpoint: 'village_arrival', bus });
    expect(r.completed).toBe(true);
    const topic = CH00_TWO_LENSES[0];
    if (!topic) throw new Error('no lens topic');
    const lens = [topic.commonGroundKey, topic.a.bodyKey, topic.b.bodyKey, topic.limitsKey];
    const at = lens.map((key) => shown.indexOf(key));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // The lens plays before the courier leaves the village for the station.
    expect(at[3]).toBeLessThan(shown.indexOf('levels.ch00.jaffa.line.station.arrive'));
  });

  it('unlocks the codex, archive and testimonies named in the content, once each', async () => {
    const d = await def();
    const bus = new EventBus<GameEvents>();
    const unlocked: string[] = [];
    bus.on('unlock:item', (e) => unlocked.push(e.kind + ':' + e.id));
    const r = runBot(d, { difficulty: 'normal', bus });
    expect(r.completed).toBe(true);
    for (const id of [
      'codex:rishon-lezion',
      'codex:edmond-de-rothschild',
      'codex:petah-tikva',
      'codex:hovevei-zion',
      'codex:old-yishuv-halukka',
      'archive:herzl-diary-1897',
      'archive:khalidi-letters-1899',
    ]) {
      expect(unlocked.filter((u) => u === id), id).toHaveLength(1);
    }
    expect(unlocked.filter((u) => u.startsWith('codex:ottoman-land-law'))).toHaveLength(0);
  });

  it('rewards twenty seconds of listening in the village with the land-law entry', async () => {
    const d = await def();
    const bus = new EventBus<GameEvents>();
    const unlocked: string[] = [];
    bus.on('unlock:item', (e) => unlocked.push(e.kind + ':' + e.id));
    const listen = withScript(d, 'village_arrival', [
      walk({ x: L.LISTEN_SPOT.x, z: L.LISTEN_SPOT.z }, 0.8),
      interact,
      { kind: 'wait', seconds: L.LISTEN_SECONDS + 1 },
      ...(d.botScript['village_arrival'] ?? []),
    ]);
    const r = runBot(listen, { difficulty: 'normal', fromCheckpoint: 'village_arrival', bus });
    expect(r.completed).toBe(true);
    expect(unlocked).toContain('codex:ottoman-land-law');
  });

  it('collects each testimony lantern from the chapter content and labels it a composite', async () => {
    const d = await def();
    const bus = new EventBus<GameEvents>();
    const unlocked: string[] = [];
    bus.on('unlock:item', (e) => unlocked.push(e.kind + ':' + e.id));
    const lantern = withScript(d, 'village_arrival', [walk(L.LANTERN_VILLAGE, 1.2), interact, ...(d.botScript['village_arrival'] ?? [])]);
    const r = runBot(lantern, { difficulty: 'normal', fromCheckpoint: 'village_arrival', bus });
    expect(r.completed).toBe(true);
    expect(unlocked).toContain('testimony:composite-village');
  });

  it('plays the arrival of the courier day at its own pace on every difficulty (no clock before the ticket)', async () => {
    const d = await def();
    for (const difficulty of DIFFICULTIES) {
      const r = runBot(d, { difficulty });
      expect(r.completed, difficulty + ': ' + r.log.join(' | ')).toBe(true);
      expect(r.failures).toEqual([]);
      // A courier day, not a sprint: well over two minutes of simulated walking and talking.
      expect(r.seconds).toBeGreaterThan(120);
    }
  });
});

describe('jaffa-letters: lifecycle', () => {
  it('saves an exact state and resumes it, and disposes twice safely', async () => {
    const d = await def();
    const mk = (snapshot: MissionSnapshot | null): MissionHost =>
      new MissionHost({
        def: d,
        bus: new EventBus<GameEvents>(),
        input: new BotInput(),
        difficulty: () => 'normal',
        headless: true,
        quality: { ...DEFAULT_WORLD_QUALITY, shadows: false },
        reducedMotion: () => false,
        t: (key) => key,
        glyph: (a) => a,
        recordChoice: () => undefined,
        hooks: { onFailed: () => undefined, onDecision: () => undefined, onComplete: () => undefined, onPlan: () => undefined },
        snapshot,
      });
    const a = mk(null);
    a.start();
    for (let i = 0; i < 30; i++) a.update(FIXED_DT);
    const snap = a.snapshot();
    const here = { x: a.level?.player?.x ?? 0, z: a.level?.player?.z ?? 0 };
    a.dispose();
    a.dispose();
    const b = mk(JSON.parse(JSON.stringify(snap)) as typeof snap);
    b.start();
    expect(b.level?.player?.x).toBeCloseTo(here.x, 3);
    expect(b.level?.player?.z).toBeCloseTo(here.z, 3);
    expect(b.state).toBe('port_start');
    b.dispose();
  });
});
