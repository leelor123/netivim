import { describe, expect, it } from 'vitest';
import { box } from '../../src/gameplay/core/collision';
import { ConvoyModel, Polyline, type Hazard } from '../../src/gameplay/modules/convoy';
import { HoldingPosition, type HoldingScenario } from '../../src/gameplay/modules/holding';
import { LogisticsModel, scaleResources, type LogisticsScenario } from '../../src/gameplay/modules/logistics';
import { GridPuzzle, rotateCell, snapToCell } from '../../src/gameplay/modules/puzzle';
import { Patrol, StealthField } from '../../src/gameplay/modules/stealth';

const DT = 1 / 60;

const logistics: LogisticsScenario = {
  available: { supplies: 100, people: 30, vehicles: 4, hours: 6 },
  routes: [
    { id: 'main', labelKey: 'r.main', hoursPerTrip: 2, supplyPerTrip: 10, peoplePerTrip: 2, maxVehicles: 2, riskKey: 'r.risk' },
    { id: 'track', labelKey: 'r.track', hoursPerTrip: 3, supplyPerTrip: 6, peoplePerTrip: 4 },
  ],
  goal: { supplies: 70, people: 20 },
};

describe('logistics model', () => {
  it('assigns vehicles within limits and evaluates deliveries over the time budget', () => {
    const m = new LogisticsModel(logistics);
    expect(m.assign('main', 1)).toBe(true);
    expect(m.assign('main', 1)).toBe(true);
    expect(m.assign('main', 1)).toBe(false); // narrow road
    expect(m.assign('track', 1)).toBe(true);
    expect(m.assign('track', 1)).toBe(true);
    expect(m.assign('track', 1)).toBe(false); // no vehicles left
    expect(m.vehiclesFree).toBe(0);
    const r = m.evaluate();
    // main: 2 vehicles x 3 trips x 10 = 60; track: 2 x 2 x 6 = 24 -> 84 supplies.
    expect(r.suppliesDelivered).toBe(84);
    expect(r.peopleMoved).toBe(2 * 3 * 2 + 2 * 2 * 4);
    expect(r.meetsGoal).toBe(true);
    expect(m.assign('main', -1)).toBe(true);
    expect(m.evaluate().meetsGoal).toBe(false);
  });

  it('scales resources by difficulty and solves greedily', () => {
    expect(scaleResources(logistics.available, 0.8)).toMatchObject({ supplies: 80, vehicles: 3 });
    expect(scaleResources(logistics.available, 0.1).vehicles).toBe(1);
    const m = new LogisticsModel(logistics, 1);
    expect(m.solveGreedy()).toBe(true);
    expect(m.evaluate().meetsGoal).toBe(true);
    const impossible = new LogisticsModel({ ...logistics, goal: { supplies: 1000, people: 0 } });
    expect(impossible.solveGreedy()).toBe(false);
  });
});

describe('stealth', () => {
  it('patrols walk their loop', () => {
    const p = new Patrol({ id: 'g', path: [[0, 0], [10, 0]], speed: 2, viewRange: 8, viewHalfAngle: 0.5 }, () => 2);
    for (let i = 0; i < 60; i++) p.update(DT);
    expect(p.x).toBeCloseTo(2, 1);
    for (let i = 0; i < 600; i++) p.update(DT);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(10);
  });

  it('vision cone respects range, angle and occluders', () => {
    const p = new Patrol({ id: 'g', path: [[0, 0], [0, 10]], speed: 0, viewRange: 8, viewHalfAngle: 0.5 }, () => 2);
    expect(p.sees(0, 5, [])).toBe(true);
    expect(p.sees(0, 9, [])).toBe(false);
    expect(p.sees(5, 1, [])).toBe(false);
    expect(p.sees(0, -3, [])).toBe(false);
    expect(p.sees(0, 5, [box(0, 2.5, 1, 0.3)])).toBe(false);
  });

  it('being seen is only reported after the full telegraph time, on every difficulty', () => {
    for (const warn of [2, 2.5, 4]) {
      const f = new StealthField([{ id: 'g', path: [[0, 0], [0, 10]], speed: 0, viewRange: 8, viewHalfAngle: 0.6 }], () => warn);
      let t = 0;
      let status = f.update(DT, 0, 4);
      while (status !== 'seen') {
        expect(status).toBe('warning');
        t += DT;
        status = f.update(DT, 0, 4);
      }
      expect(t + DT).toBeGreaterThanOrEqual(warn - 1e-6);
      expect(f.alert).toBe(1);
    }
  });

  it('stepping out of sight or hiding lets the meter drain', () => {
    const f = new StealthField([{ id: 'g', path: [[0, 0], [0, 10]], speed: 0, viewRange: 8, viewHalfAngle: 0.6 }], () => 2);
    for (let i = 0; i < 90; i++) f.update(DT, 0, 4);
    expect(f.alert).toBeGreaterThan(0.5);
    for (let i = 0; i < 90; i++) f.update(DT, 0, 4, true);
    expect(f.alert).toBe(0);
    f.reset();
    expect(f.update(DT, 20, 20)).toBe('clear');
  });
});

const holding: HoldingScenario = {
  sections: [
    { id: 'north', labelKey: 'n' },
    { id: 'south', labelKey: 's' },
  ],
  holdSeconds: 60,
  startSupplies: 10,
  evacuees: 6,
  waveEvery: 10,
  waveDamage: 0.5,
  repairCost: 1,
  repairAmount: 0.5,
  distributeCost: 1,
  distributeMorale: 0.3,
  moraleDecay: 0.01,
  evacCooldown: 5,
  evacPerTrip: 3,
};

describe('holding position', () => {
  it('announces each wave at least the telegraph time before it lands', () => {
    const h = new HoldingPosition(holding, () => ({ timerScale: 1, resourceScale: 1, telegraph: 4 }));
    const wave = h.nextWave;
    expect(wave).not.toBeNull();
    if (!wave) return;
    expect(wave.hitAt - wave.warnAt).toBeGreaterThanOrEqual(4);
    while (h.elapsed < wave.warnAt) h.update(DT);
    expect(h.warningActive).toBe(true);
    while (h.elapsed < wave.hitAt) h.update(DT);
    h.update(DT);
    expect(h.integrity.get('north')).toBeCloseTo(0.5);
  });

  it('repairs, distributes and evacuates, and holds until relief', () => {
    const h = new HoldingPosition(holding, () => ({ timerScale: 1, resourceScale: 1, telegraph: 2 }));
    let outcome = h.update(0);
    let t = 0;
    while (outcome === 'holding' && t < 200) {
      for (const [id, v] of h.integrity) if (v < 1) h.repair(id);
      if (h.morale < 0.8) h.distribute();
      h.evacuate();
      outcome = h.update(DT);
      t += DT;
    }
    expect(outcome).toBe('held');
    expect(h.evacuated).toBe(6);
    expect(h.waiting).toBe(0);
  });

  it('falters softly when morale runs out (no one is harmed on screen)', () => {
    const h = new HoldingPosition({ ...holding, moraleDecay: 0.2 }, () => ({ timerScale: 1, resourceScale: 1, telegraph: 2 }));
    let outcome = h.update(0);
    for (let i = 0; i < 60 * 30 && outcome === 'holding'; i++) outcome = h.update(DT);
    expect(outcome).toBe('faltering');
  });

  it('easier levels shorten the hold and give more supplies', () => {
    const story = new HoldingPosition(holding, () => ({ timerScale: 1.6, resourceScale: 1.5, telegraph: 4 }));
    expect(story.holdSeconds).toBeLessThan(60);
    expect(story.supplies).toBe(15);
  });
});

describe('grid puzzle', () => {
  const def = {
    width: 4,
    height: 3,
    blocked: [[3, 2]] as const,
    pieces: [
      { id: 'wall', labelKey: 'w', cells: [[0, 0], [1, 0], [2, 0]] as const },
      { id: 'tower', labelKey: 't', cells: [[0, 0], [0, 1]] as const },
    ],
  };

  it('snaps, rotates, rejects overlaps / outside / blocked and detects solved', () => {
    expect(snapToCell(2.4, 3.6, 0, 0, 1.2)).toEqual([2, 3]);
    expect(rotateCell([1, 0], 1)).toEqual([-0, 1]);
    const p = new GridPuzzle(def);
    expect(p.place('wall', { x: 0, y: 0, rot: 0 })).toBe(true);
    expect(p.check('tower', { x: 1, y: 0, rot: 0 })).toBe('gameplay.puzzle.overlap');
    expect(p.check('tower', { x: 0, y: 2, rot: 0 })).toBe('gameplay.puzzle.outside');
    expect(p.check('tower', { x: 3, y: 1, rot: 0 })).toBe('gameplay.puzzle.blocked');
    expect(p.solved).toBe(false);
    expect(p.place('tower', { x: 3, y: 0, rot: 0 })).toBe(true);
    expect(p.solved).toBe(true);
    const target = new GridPuzzle({ ...def, target: { tower: { x: 0, y: 1, rot: 3 } } });
    target.place('wall', { x: 0, y: 0, rot: 0 });
    target.place('tower', { x: 3, y: 0, rot: 0 });
    expect(target.solved).toBe(false);
    target.remove('tower');
    expect(target.place('tower', { x: 0, y: 1, rot: -1 })).toBe(true);
    expect(target.solved).toBe(true);
  });
});

describe('convoy', () => {
  const scenario = (hazards: Hazard[]) => ({
    start: 'a',
    speed: 10,
    vehicles: 3,
    spacing: 8,
    hazards,
    segments: [
      { id: 'a', points: [[0, 0], [0, 50]] as const, next: ['north', 'south'] },
      { id: 'north', points: [[0, 50], [0, 100]] as const, next: ['end'] },
      { id: 'south', points: [[0, 50], [20, 100]] as const, next: ['end'] },
      { id: 'end', points: [[0, 100], [0, 120]] as const, next: [] },
    ],
  });

  it('polyline lookups are by arc length', () => {
    const l = new Polyline([[0, 0], [3, 4], [3, 10]]);
    expect(l.length).toBe(11);
    const o = { x: 0, z: 0, heading: 0 };
    l.pointAt(7, o);
    expect(o).toMatchObject({ x: 3, z: 6 });
  });

  it('waits at a fork for the player, then follows the chosen route to arrival', () => {
    const c = new ConvoyModel(scenario([]), () => 2);
    let s = c.update(0);
    for (let i = 0; i < 600 && s === 'moving'; i++) s = c.update(DT);
    expect(s).toBe('awaitingChoice');
    expect(c.pendingChoice).toEqual(['north', 'south']);
    expect(c.choose('end')).toBe(false);
    expect(c.choose('south')).toBe(true);
    for (let i = 0; i < 2000 && s !== 'arrived'; i++) s = c.update(DT);
    expect(s).toBe('arrived');
    const v = { x: 0, z: 0, heading: 0 };
    c.vehicleAt(2, v);
    expect(v.z).toBeLessThan(120);
  });

  it('hazards are warned ahead; routing around or holding avoids them', () => {
    const hz: Hazard = { id: 'block', segmentId: 'north', from: 4, to: 30, labelKey: 'hz' };
    const warn: Hazard[] = [];
    const c = new ConvoyModel(scenario([hz]), () => 3);
    c.update(0);
    c.time = 0.9;
    expect(c.warnings(warn)).toHaveLength(0);
    c.time = 1.1;
    expect(c.warnings(warn)).toHaveLength(1);
    c.choose('north');
    let s = c.status;
    for (let i = 0; i < 2000 && s !== 'arrived' && s !== 'hazard'; i++) s = c.update(DT);
    expect(s).toBe('hazard');
    c.reset();
    c.choose('south');
    s = c.status;
    for (let i = 0; i < 2000 && s !== 'arrived' && s !== 'hazard'; i++) s = c.update(DT);
    expect(s).toBe('arrived');
    c.reset();
    c.setHolding(true);
    for (let i = 0; i < 60 * 31; i++) c.update(DT);
    c.setHolding(false);
    c.choose('north');
    s = c.status;
    for (let i = 0; i < 4000 && s !== 'arrived' && s !== 'hazard'; i++) s = c.update(DT);
    expect(s).toBe('arrived');
  });
});
