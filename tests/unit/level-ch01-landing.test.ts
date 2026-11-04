import { describe, expect, it } from 'vitest';
import { effectiveParams } from '../../src/core/difficulty';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { FIXED_DT } from '../../src/core/loop';
import { Telegraph, telegraphSeconds } from '../../src/gameplay/core/telegraph';
import { circle } from '../../src/gameplay/core/collision';
import { Patrol } from '../../src/gameplay/modules/stealth';
import { BotInput, runBot } from '../../src/gameplay/runtime/bot';
import { MissionHost } from '../../src/gameplay/runtime/missionHost';
import type { BotStep } from '../../src/gameplay/types';
import landing, { CHECKPOINTS, FAIL, landingLocaleKeys } from '../../src/levels/ch01/night-landing';
import { BOAT_SPAWN, LIGHTS, PATROLS, SEA_GOAL, SURVIVOR_GROUPS, WATCHERS } from '../../src/levels/ch01/landing/layout';
import { RescueModel, SURVIVOR_SPEED, voiceSide, type RescueSnapshot } from '../../src/levels/ch01/landing/rescue';
import type { MissionSnapshot } from '../../src/core/mission';
import { SweepLight } from '../../src/levels/ch01/landing/sweep';
import { HEBREW } from '../../src/locales';
import { DEFAULT_WORLD_QUALITY } from '../../src/world/quality';

const light = (i: number, warning = 2.5): SweepLight => new SweepLight(LIGHTS[i] as (typeof LIGHTS)[number], () => warning);

describe('searchlight rhythm', () => {
  it('sweeps, rests dark, and announces every sweep with one tick', () => {
    const l = light(0);
    const d = l.def;
    let onTime = 0;
    let ticks = 0;
    let minHeading = Infinity;
    let maxHeading = -Infinity;
    const steps = Math.round(l.period / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      if (l.advance(FIXED_DT)) {
        ticks++;
        expect(l.on).toBe(false);
        expect(l.untilSweep).toBeLessThanOrEqual(d.tickLead + FIXED_DT);
      }
      if (l.on) {
        onTime += FIXED_DT;
        minHeading = Math.min(minHeading, l.heading);
        maxHeading = Math.max(maxHeading, l.heading);
      }
    }
    expect(ticks).toBe(2);
    expect(onTime).toBeCloseTo(2 * d.sweepTime, 0);
    expect(minHeading).toBeGreaterThanOrEqual(d.heading - d.arc - 1e-6);
    expect(maxHeading).toBeLessThanOrEqual(d.heading + d.arc + 1e-6);
  });

  it('is deterministic after reset and the two lights are staggered', () => {
    const a = light(0);
    const b = light(0);
    for (let i = 0; i < 500; i++) a.advance(FIXED_DT);
    a.reset();
    for (let i = 0; i < 123; i++) {
      a.advance(FIXED_DT);
      b.advance(FIXED_DT);
      expect(a.heading).toBeCloseTo(b.heading, 9);
      expect(a.on).toBe(b.on);
    }
    expect((LIGHTS[1] as (typeof LIGHTS)[number]).offset).not.toBe((LIGHTS[0] as (typeof LIGHTS)[number]).offset);
  });

  it('lights points in the beam, not out of range, and rocks block it', () => {
    const l = light(0);
    l.advance(0.01);
    while (!l.on) l.advance(FIXED_DT);
    const d = l.def;
    // Walk the beam to its center.
    while (Math.abs(l.heading - d.heading) > 0.01) l.advance(FIXED_DT);
    const px = d.x - 40;
    expect(l.sees(px, d.z, [])).toBe(true);
    expect(l.sees(d.x - d.range - 5, d.z, [])).toBe(false);
    expect(l.sees(d.x + 20, d.z, [])).toBe(false);
    expect(l.sees(px, d.z, [circle(d.x - 20, d.z, 3)])).toBe(false);
  });

  it('a sitting boat is seen on Challenge and Normal but not on Story (telegraph scaling)', () => {
    const seenOn = (warning: number): boolean => {
      const l = light(0, warning);
      const t = new Telegraph(() => warning);
      const px = l.def.x - 40;
      let seen = false;
      for (let i = 0; i < (l.period * 3) / FIXED_DT && !seen; i++) {
        l.advance(FIXED_DT);
        if (t.update(FIXED_DT, l.sees(px, l.def.z, []))) seen = true;
      }
      return seen;
    };
    expect(seenOn(telegraphSeconds(effectiveParams('challenge', { moreTime: false, extraCheckpoint: false })))).toBe(true);
    expect(seenOn(telegraphSeconds(effectiveParams('normal', { moreTime: false, extraCheckpoint: false })))).toBe(true);
    expect(seenOn(telegraphSeconds(effectiveParams('story', { moreTime: false, extraCheckpoint: false })))).toBe(false);
  });
});

describe('patrol paths', () => {
  const lane = (id: string): Patrol => new Patrol(PATROLS.find((p) => p.id === id) as (typeof PATROLS)[number], () => 2.5);

  it('a patrol boat sees ahead inside its cone and never behind it', () => {
    const p = lane('lane-1');
    for (let i = 0; i < 6 / FIXED_DT; i++) p.update(FIXED_DT);
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    expect(p.sees(p.x + fx * 20, p.z + fz * 20, [])).toBe(true);
    expect(p.sees(p.x - fx * 4, p.z - fz * 4, [])).toBe(false);
    expect(p.sees(p.x + fx * 20 - fz * 40, p.z + fz * 20 + fx * 40, [])).toBe(false);
  });

  it('the patrol shuttles between its end points, pausing and turning around', () => {
    const p = lane('lane-1');
    const def = p.def;
    const a = def.path[0] as readonly [number, number];
    const b = def.path[1] as readonly [number, number];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const first = Math.atan2(b[0] - a[0], b[1] - a[1]);
    expect(p.heading).toBeCloseTo(first, 6);
    let turned = false;
    for (let t = 0; t < (2 * len) / def.speed / FIXED_DT + 400; t++) {
      p.update(FIXED_DT);
      if (Math.abs(Math.abs(p.heading - first) - Math.PI) < 1e-6) turned = true;
    }
    expect(turned).toBe(true);
  });

  it('is identical after reset (every checkpoint restarts the rhythm)', () => {
    const p = lane('lane-2');
    const q = lane('lane-2');
    for (let i = 0; i < 1000; i++) p.update(FIXED_DT);
    p.reset();
    for (let i = 0; i < 400; i++) {
      p.update(FIXED_DT);
      q.update(FIXED_DT);
    }
    expect(p.x).toBeCloseTo(q.x, 9);
    expect(p.z).toBeCloseTo(q.z, 9);
  });

  it('the tutorial patrol never reaches the first leg of the route', () => {
    const p = new Patrol(PATROLS[0] as (typeof PATROLS)[number], () => 2.5);
    const dx = SEA_GOAL.x - BOAT_SPAWN.x;
    const dz = SEA_GOAL.z - BOAT_SPAWN.z;
    for (let t = 0; t < 120 / FIXED_DT; t++) {
      p.update(FIXED_DT);
      if (t % 30 !== 0) continue;
      for (let k = 0; k <= 22; k++) expect(p.sees(BOAT_SPAWN.x + (dx * k) / 22, BOAT_SPAWN.z + (dz * k) / 22, [])).toBe(false);
    }
  });

  it('beach watchers see less far than a patrol boat (shorter, narrower cone)', () => {
    const w = WATCHERS[0] as (typeof WATCHERS)[number];
    const boat = PATROLS[1] as (typeof PATROLS)[number];
    expect(w.viewRange).toBeLessThan(boat.viewRange);
    expect(w.viewHalfAngle).toBeLessThanOrEqual(boat.viewHalfAngle + 0.05);
  });
});

describe('rescue logic', () => {
  const spec = { groups: SURVIVOR_GROUPS, landingX: -76, landingZ: -54, lostChild: { x: -75, z: -34 }, shelter: { x: -5.5, z: 1.5 } };

  it('carries the children and elders first; the adults wait on the ship for the second trip', () => {
    const m = new RescueModel(spec);
    m.reset(-86, -56, 0);
    expect(m.survivors.filter((s) => s.state === 'boat').every((s) => s.kind !== 'adult')).toBe(true);
    expect(m.survivors.filter((s) => s.state === 'ship').length).toBe(4);
    m.landNext();
    m.landNext();
    expect(m.tripLanded(0)).toBe(true);
    expect(m.tripLanded(1)).toBe(false);
    m.beginEscort();
    expect(m.survivors.filter((s) => s.state === 'following').length).toBe(6);
    // Volunteers take the first load to the shelter, where it stays safe for good.
    m.handOff();
    for (let t = 0; t < 60 / FIXED_DT; t++) m.update(FIXED_DT, -20, -10, 0);
    expect(m.survivors.filter((s) => s.trip === 0 && s.state === 'safe').length).toBe(6);
    // Second trip: first load sheltered, adults aboard, the boat carries only them.
    m.reset(-86, -56, 1);
    expect(m.survivors.filter((s) => s.state === 'boat').every((s) => s.kind === 'adult')).toBe(true);
    expect(m.survivors.filter((s) => s.state === 'safe').length).toBe(6);
    expect(m.landed).toBe(2);
    expect(m.tripLanded(0)).toBe(true);
    expect(m.snapshot().survivors.length).toBe(m.total);
    const snap = m.snapshot();
    const n = new RescueModel(spec);
    expect(n.restore(snap)).toBe(true);
    expect(n.restore({ landed: 0, survivors: snap.survivors.map((v) => ({ ...v, state: 'nonsense' as never })) })).toBe(false);
  });

  it('lands children first, then elders, then adults, and only three waves', () => {
    const m = new RescueModel(spec);
    m.reset(-86, -56);
    const waves = [m.landNext(), m.landNext(), m.landNext(), m.landNext()];
    expect(waves).toEqual([0, 1, 2, -1]);
    expect(m.allLanded).toBe(true);
    const first = new RescueModel(spec);
    first.reset(-86, -56);
    first.landNext();
    const ashore = first.survivors.filter((s) => s.state === 'ashore');
    expect(ashore.length).toBe(3);
    expect(ashore.every((s) => s.kind === 'child')).toBe(true);
  });

  it('survivors walk ashore at their own pace; elders are the slowest walkers', () => {
    const m = new RescueModel(spec);
    m.reset(-86, -56);
    m.landNext();
    m.landNext();
    const start = m.survivors.map((s) => ({ x: s.x, z: s.z }));
    for (let t = 0; t < 2 / FIXED_DT; t++) m.update(FIXED_DT, -73, -53, 0);
    const moved = (kind: string): number => {
      const i = m.survivors.findIndex((s) => s.kind === kind && s.state === 'ashore');
      const s = m.survivors[i];
      const o = start[i];
      return s && o ? Math.hypot(s.x - o.x, s.z - o.z) : 0;
    };
    expect(moved('child')).toBeCloseTo(SURVIVOR_SPEED.child * 2, 0);
    expect(moved('elder')).toBeCloseTo(SURVIVOR_SPEED.elder * 2, 0);
    expect(moved('elder')).toBeLessThan(moved('child'));
    for (let t = 0; t < 20 / FIXED_DT; t++) m.update(FIXED_DT, -73, -53, 0);
    expect(m.arriving).toBe(false);
  });

  it('followers keep up at their speed: elders lag the leader, the group is never harmed', () => {
    const m = new RescueModel(spec);
    m.setAllWaiting();
    m.beginEscort();
    let x = -76;
    for (let t = 0; t < 8 / FIXED_DT; t++) {
      x += 4.2 * FIXED_DT;
      m.update(FIXED_DT, x, -54, Math.PI / 2);
    }
    const dist = (kind: string): number => Math.max(...m.survivors.filter((s) => s.kind === kind && s.state === 'following').map((s) => x - s.x));
    expect(dist('elder')).toBeGreaterThan(dist('adult'));
    expect(m.cohesion(x, -54)).toBeGreaterThan(8);
    expect(m.everyoneWithYou(x, -54, 11)).toBe(false);
    // The leader stops: everybody catches up, then counts as "with you" (child still lost).
    for (let t = 0; t < 20 / FIXED_DT; t++) m.update(FIXED_DT, x, -54, Math.PI / 2);
    expect(m.withYou(x, -54, 11)).toBe(m.followers);
    expect(m.everyoneWithYou(x, -54, 11)).toBe(false);
    expect(m.childFound).toBe(false);
    expect(SURVIVOR_SPEED.elder).toBeLessThan(SURVIVOR_SPEED.child);
    expect(SURVIVOR_SPEED.child).toBeLessThan(SURVIVOR_SPEED.adult);
  });

  it('the lost child joins when found; everyone settles in the hollow', () => {
    const m = new RescueModel(spec);
    m.setAllWaiting();
    m.beginEscort();
    expect(m.lostChild).not.toBeNull();
    expect(m.findChild()).toBe(true);
    expect(m.findChild()).toBe(false);
    expect(m.childFound).toBe(true);
    for (let t = 0; t < 70 / FIXED_DT; t++) m.update(FIXED_DT, -10, -2, 0);
    expect(m.everyoneWithYou(-10, -2, 11)).toBe(true);
    expect(m.settle(-10, -2, 5.5)).toBe(m.total);
    expect(m.safeCount).toBe(m.total);
  });

  it('names the side a voice comes from relative to the view', () => {
    expect(voiceSide(0, 0, 0, 0, 10)).toBe('ahead');
    expect(voiceSide(0, 0, 0, 0, -10)).toBe('behind');
    expect(voiceSide(0, 0, 0, -10, 1)).toBe('right');
    expect(voiceSide(0, 0, 0, 10, 1)).toBe('left');
    expect(voiceSide(0, 0, Math.PI / 2, 10, 0)).toBe('ahead');
  });
});

describe('level definition', () => {
  it('has nine checkpoints (two boat loads), a briefing context text, an extra checkpoint, bot scripts and an objective for every state', () => {
    expect(CHECKPOINTS).toEqual(['sea', 'patrols', 'lights', 'drop', 'return', 'crossing', 'lights2', 'landing', 'shore']);
    expect(landing.briefingContextKey).toBeTruthy();
    expect(Object.hasOwn(HEBREW, landing.briefingContextKey ?? '')).toBe(true);
    expect(landing.id).toBe('night-landing');
    expect(landing.mission.checkpoints).toEqual([...CHECKPOINTS]);
    expect(landing.extraCheckpoints).toEqual(['hide']);
    for (const s of [...CHECKPOINTS, 'hide']) {
      expect(Object.hasOwn(landing.botScript, s)).toBe(true);
      expect(landing.objectives.some((o) => o.states.includes(s))).toBe(true);
    }
  });

  it('every shown text exists in Hebrew and every failure is sourced and carries a hint', () => {
    const keys = [
      ...landingLocaleKeys(),
      ...landing.objectives.map((o) => o.textKey),
      ...Object.values(landing.failures).flatMap((f) => [f.whatHappenedKey, f.hintKey]),
      ...(landing.briefingMap?.points.flatMap((p) => (p.labelKey ? [p.labelKey] : [])) ?? []),
    ];
    for (const k of keys) expect(Object.hasOwn(HEBREW, k), k).toBe(true);
    for (const reason of Object.keys(landing.failures)) expect(Object.hasOwn(HEBREW, reason), reason).toBe(true);
    for (const info of Object.values(landing.failures)) {
      expect(info.sources).toContain('C1-055');
      expect(info.label).toBe('documented');
    }
    expect(Object.keys(landing.failures).sort()).toEqual(Object.values(FAIL).sort());
  });
});

describe('level play (headless)', { timeout: 60_000 }, () => {
  const idle = (cp: string, steps: BotStep[]): typeof landing => ({ ...landing, botScript: { ...landing.botScript, [cp]: steps } });
  const walk = (x: number, z: number, within = 3): BotStep => ({ kind: 'walkTo', x, z, within });

  it('the bot plays the whole mission from the first checkpoint without ever being seen', () => {
    for (const difficulty of ['story', 'normal', 'challenge'] as const) {
      const r = runBot(landing, { difficulty, maxSeconds: 900 });
      expect(r.failures, difficulty + ': ' + r.log.join(' | ')).toEqual([]);
      expect(r.completed).toBe(true);
      expect(r.log.filter((l) => l.startsWith('checkpoint'))).toEqual(CHECKPOINTS.slice(1).map((c) => 'checkpoint: ' + c));
    }
  });

  it('sitting in a searchlight beam gets the boat seen (a soft fail, never harm)', () => {
    const r = runBot(idle('lights', [walk(-128, -20), { kind: 'wait', seconds: 60 }]), { difficulty: 'challenge', fromCheckpoint: 'lights', maxSeconds: 80 });
    expect(r.completed).toBe(false);
    expect(r.failures[0]?.reasonKey).toBe(FAIL.beam);
  });

  it('crossing in front of a patrol boat gets the boat seen', () => {
    const r = runBot(idle('patrols', [walk(-146, 66), { kind: 'wait', seconds: 60 }]), { difficulty: 'challenge', fromCheckpoint: 'patrols', maxSeconds: 80 });
    expect(r.failures[0]?.reasonKey).toBe(FAIL.patrol);
  });

  it('three sightings in a row turn into the interception card', () => {
    const r = runBot(idle('lights', [walk(-128, -20), { kind: 'wait', seconds: 60 }]), { difficulty: 'challenge', fromCheckpoint: 'lights', maxSeconds: 120, retryOnFail: true });
    expect(r.failures.slice(0, 3).map((f) => f.reasonKey)).toEqual([FAIL.beam, FAIL.beam, FAIL.intercepted]);
    expect(r.failures.every((f) => f.info !== null)).toBe(true);
  });

  it('dawn arrives if nobody is helped ashore (timer scales with difficulty)', () => {
    const slow = runBot(idle('landing', [{ kind: 'wait', seconds: 600 }]), { difficulty: 'challenge', fromCheckpoint: 'landing', maxSeconds: 700 });
    const easy = runBot(idle('landing', [{ kind: 'wait', seconds: 600 }]), { difficulty: 'story', fromCheckpoint: 'landing', maxSeconds: 700 });
    expect(slow.failures[0]?.reasonKey).toBe(FAIL.dawn);
    expect(easy.failures[0]?.reasonKey).toBe(FAIL.dawn);
    expect(easy.seconds).toBeGreaterThan(slow.seconds * 1.5);
  });

  it('the beach watcher sees a group that waits in its lane', () => {
    const r = runBot(
      idle('shore', [walk(-47, -30, 2), { kind: 'wait', seconds: 60 }]),
      { difficulty: 'challenge', fromCheckpoint: 'shore', maxSeconds: 80 },
    );
    expect(r.failures[0]?.reasonKey).toBe(FAIL.watch);
  });

  function makeHost(snapshot: ConstructorParameters<typeof MissionHost>[0]['snapshot'] = null): { host: MissionHost; input: BotInput } {
    const bus = new EventBus<GameEvents>();
    const input = new BotInput();
    const host = new MissionHost({
      def: landing,
      bus,
      input,
      difficulty: () => 'normal',
      headless: true,
      quality: { ...DEFAULT_WORLD_QUALITY, shadows: false },
      reducedMotion: () => false,
      t: (k) => k,
      glyph: (a) => a,
      recordChoice: () => undefined,
      snapshot,
      hooks: { onFailed: () => undefined, onDecision: () => undefined, onComplete: () => undefined, onPlan: () => undefined },
    });
    return { host, input };
  }

  it('an exact manual save restores the place on the water and on the beach', () => {
    for (const cp of ['patrols', 'drop', 'return', 'crossing', 'landing', 'shore', 'hide'] as const) {
      const a = makeHost({ missionId: landing.missionId, state: cp, checkpoint: cp, data: null });
      a.host.start();
      for (let i = 0; i < 60; i++) {
        a.input.beginStep();
        a.input.move.y = -1;
        a.host.update(FIXED_DT);
      }
      const snap = a.host.snapshot();
      const px = a.host.level?.player?.x ?? 0;
      const pz = a.host.level?.player?.z ?? 0;
      a.host.dispose();
      const b = makeHost(snap);
      b.host.start();
      expect(b.host.level?.player?.x).toBeCloseTo(px, 3);
      expect(b.host.level?.player?.z).toBeCloseTo(pz, 3);
      b.host.dispose();
    }
  });

  it('a save taken after the elders land but before the escort begins restores into a winnable drop', () => {
    // The window: both first-trip waves are ashore (landed >= 2), someone is still walking up the
    // sand ('ashore') and nobody follows yet. Restoring there must not skip the escort start.
    type Data = { level: { rescue: RescueSnapshot } | null };
    let caught: { snap: MissionSnapshot; qi: number } | null = null;
    const base = runBot(landing, {
      difficulty: 'story',
      fromCheckpoint: 'drop',
      maxSeconds: 200,
      onStep: (host, _step, qi) => {
        if (caught || host.phase !== 'running' || host.state !== 'drop') return;
        const snap = host.snapshot();
        const rs = (snap.data as Data | null)?.level?.rescue;
        if (!rs || rs.landed < 2) return;
        if (rs.survivors.some((v) => v.state === 'ashore') && !rs.survivors.some((v) => v.state === 'following')) {
          caught = { snap: JSON.parse(JSON.stringify(snap)) as MissionSnapshot, qi };
        }
      },
    });
    expect(base.completed || base.finalState !== 'drop').toBe(true);
    const at = caught as { snap: MissionSnapshot; qi: number } | null;
    expect(at, 'no snapshot in the ashore-before-escort window').not.toBeNull();
    if (!at) return;
    const r = runBot(landing, { difficulty: 'story', snapshot: at.snap, startQueueIndex: at.qi, maxSeconds: 900 });
    expect(r.failures, r.log.join(' | ')).toEqual([]);
    expect(r.log).toContain('checkpoint: return');
    expect(r.completed, r.log.join(' | ')).toBe(true);
  });

  it('disposing twice is safe and frees the scene once', () => {
    const { host } = makeHost();
    const level = host.start();
    host.update(FIXED_DT);
    level.dispose();
    expect(() => level.dispose()).not.toThrow();
    expect(() => host.dispose()).not.toThrow();
  });

  it('reduced motion and the three difficulty settings build the same level', () => {
    for (const reduced of [false, true]) {
      const bus = new EventBus<GameEvents>();
      const host = new MissionHost({
        def: landing,
        bus,
        input: new BotInput(),
        difficulty: () => 'story',
        headless: true,
        quality: { ...DEFAULT_WORLD_QUALITY, shadows: false, fog: false },
        reducedMotion: () => reduced,
        t: (k) => k,
        glyph: (a) => a,
        recordChoice: () => undefined,
        hooks: { onFailed: () => undefined, onDecision: () => undefined, onComplete: () => undefined, onPlan: () => undefined },
      });
      host.start();
      for (let i = 0; i < 30; i++) host.update(FIXED_DT);
      expect(host.state).toBe('sea');
      host.dispose();
    }
  });
});
