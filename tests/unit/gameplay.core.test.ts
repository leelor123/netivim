import { describe, expect, it } from 'vitest';
import { box, circle, pushOut, resolveCircle, segmentBlocked } from '../../src/gameplay/core/collision';
import { InteractionSystem, type Interactable } from '../../src/gameplay/core/interaction';
import { CharacterMotor, stickToward, turnToward, wrapAngle } from '../../src/gameplay/core/movement';
import { ObjectiveTracker } from '../../src/gameplay/core/objectives';
import { DEFAULT_ORBIT, applyLook, safeDistance, smoothDistance } from '../../src/gameplay/core/orbit';
import { MIN_TELEGRAPH_SECONDS, MissionTimer, scheduleThreat, Telegraph, telegraphSeconds } from '../../src/gameplay/core/telegraph';
import { DIFFICULTY } from '../../src/core/difficulty';

const DT = 1 / 60;

describe('movement', () => {
  it('accelerates smoothly toward full speed in the camera forward direction', () => {
    const m = new CharacterMotor();
    m.place(0, 0, 0);
    m.update(DT, 0, -1, 0);
    expect(m.speed).toBeGreaterThan(0);
    expect(m.speed).toBeLessThan(m.params.maxSpeed);
    for (let i = 0; i < 120; i++) m.update(DT, 0, -1, 0);
    expect(m.speed).toBeCloseTo(m.params.maxSpeed, 2);
    expect(m.z).toBeGreaterThan(5);
    expect(Math.abs(m.x)).toBeLessThan(1e-6);
    expect(m.heading).toBeCloseTo(0, 3);
  });

  it('is camera relative: yaw PI/2 turns forward into +x', () => {
    const m = new CharacterMotor();
    m.place(0, 0, 0);
    for (let i = 0; i < 60; i++) m.update(DT, 0, -1, Math.PI / 2);
    expect(m.x).toBeGreaterThan(2);
    expect(Math.abs(m.z)).toBeLessThan(1e-6);
  });

  it('follows the terrain height', () => {
    const m = new CharacterMotor();
    m.heightAt = (x) => x * 0.5;
    m.place(0, 0, 0);
    for (let i = 0; i < 60; i++) m.update(DT, 0, -1, Math.PI / 2);
    expect(m.y).toBeCloseTo(m.x * 0.5, 6);
  });

  it('stops when the stick is released and does not jitter its heading', () => {
    const m = new CharacterMotor();
    m.place(0, 0, 1);
    for (let i = 0; i < 30; i++) m.update(DT, 1, 0, 0);
    const h = m.heading;
    for (let i = 0; i < 120; i++) m.update(DT, 0, 0, 0);
    expect(m.speed).toBeLessThan(0.01);
    expect(m.heading).toBeCloseTo(h, 1);
  });

  it('wraps and turns angles along the shortest arc', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(wrapAngle(3.1));
  });

  it('stickToward points the motor at the target for any camera yaw', () => {
    for (const yaw of [0, 1, -2, 3]) {
      const m = new CharacterMotor();
      m.place(0, 0, 0);
      const s = { x: 0, y: 0 };
      for (let i = 0; i < 400; i++) {
        stickToward(m.x, m.z, 5, -7, yaw, s);
        m.update(DT, s.x, s.y, yaw);
      }
      expect(Math.hypot(m.x - 5, m.z + 7)).toBeLessThan(0.3);
    }
  });
});

describe('collision', () => {
  it('pushes a circle out of a box and a circle', () => {
    const p = { x: 0.9, z: 0 };
    expect(pushOut(p, 0.5, box(0, 0, 1, 1))).toBe(true);
    expect(p.x).toBeCloseTo(1.5);
    const q = { x: 0.5, z: 0 };
    expect(pushOut(q, 0.5, circle(0, 0, 0.5))).toBe(true);
    expect(Math.hypot(q.x, q.z)).toBeCloseTo(1);
    const r = { x: 5, z: 5 };
    expect(pushOut(r, 0.5, box(0, 0, 1, 1))).toBe(false);
  });

  it('a walking motor never ends inside a wall and slides along it', () => {
    const m = new CharacterMotor();
    m.colliders = [box(0, 3, 50, 0.5)];
    m.place(0, 0, 0);
    for (let i = 0; i < 240; i++) {
      m.update(DT, 0.3, -1, 0);
      expect(m.z).toBeLessThanOrEqual(2.5 - m.params.radius + 1e-6);
    }
    // Stick right at yaw 0 is -x (camera looks along +z).
    expect(m.x).toBeLessThan(-0.5);
  });

  it('keeps the circle inside the level bounds', () => {
    const p = { x: 100, z: -100 };
    resolveCircle(p, 0.5, [], { minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
    expect(p).toEqual({ x: 9.5, z: -9.5 });
  });

  it('line of sight is blocked by boxes and circles', () => {
    expect(segmentBlocked(-5, 0, 5, 0, box(0, 0, 1, 1))).toBe(true);
    expect(segmentBlocked(-5, 3, 5, 3, box(0, 0, 1, 1))).toBe(false);
    expect(segmentBlocked(-5, 0, 5, 0, circle(0, 0.5, 1))).toBe(true);
  });
});

describe('orbit camera', () => {
  it('pulls in before a wall and before the ground, eases back out', () => {
    const free = safeDistance(0, 1.5, 0, 0, 0.3, 6, () => 0, []);
    expect(free).toBeGreaterThan(5);
    const walled = safeDistance(0, 1.5, 0, 0, 0.1, 6, () => 0, [box(0, -2.5, 3, 0.5, 4)]);
    expect(walled).toBeLessThan(2.5);
    const steep = safeDistance(0, 1.5, 0, 0, -0.3, 6, (_x, z) => -z * 2, []);
    expect(steep).toBeLessThan(free);
    expect(smoothDistance(5, 2, DT, false)).toBe(2);
    expect(smoothDistance(2, 5, DT, false)).toBeLessThan(5);
  });

  it('clamps pitch', () => {
    const s = { yaw: 0, pitch: 0, distance: 5 };
    applyLook(s, 0, 10, 10);
    expect(s.pitch).toBe(DEFAULT_ORBIT.maxPitch);
  });
});

describe('interaction', () => {
  it('focuses the nearest enabled item in radius and runs it on interact', () => {
    const sys = new InteractionSystem();
    const used: string[] = [];
    const mk = (id: string, x: number, enabled = true): Interactable => ({ id, kind: 'generic', x, z: 0, radius: 2, promptKey: 'p', enabled, onInteract: () => used.push(id) });
    sys.add(mk('a', 1.5));
    sys.add(mk('b', 0.5));
    sys.add(mk('c', 0.1, false));
    const focus: (string | null)[] = [];
    sys.onFocus((n) => focus.push(n?.id ?? null));
    expect(sys.update(10, 0, true)).toBeNull();
    sys.update(0, 0, false);
    expect(sys.focused?.id).toBe('b');
    sys.update(0, 0, true);
    expect(used).toEqual(['b']);
    sys.setEnabled('b', false);
    sys.update(0, 0, false);
    expect(sys.focused?.id).toBe('a');
    expect(focus).toEqual(['b', 'a']);
    expect(() => sys.add(mk('a', 0))).toThrow();
  });
});

describe('objectives', () => {
  it('follows mission states, tracks steps and reports changes', () => {
    const changed: string[] = [];
    const tr = new ObjectiveTracker(
      [
        { id: 'load', textKey: 'k.load', states: ['load'], steps: 3 },
        { id: 'drive', textKey: 'k.drive', states: ['drive', 'pass'] },
      ],
      (id) => changed.push(id),
    );
    const views: (string | null)[] = [];
    tr.subscribe((v) => views.push(v ? v.id + ':' + String(v.done) + '/' + String(v.total) : null));
    tr.syncState('load');
    tr.progress('load', 2);
    tr.progress('load', 9);
    expect(tr.isDone('load')).toBe(true);
    tr.syncState('drive');
    tr.syncState('pass');
    expect(changed).toEqual(['load', 'drive']);
    expect(views).toEqual([null, 'load:0/3', 'load:2/3', 'load:3/3', 'drive:0/1']);
    tr.resetProgress({ load: 1 });
    expect(tr.isDone('load')).toBe(false);
  });
});

describe('telegraph (fair danger)', () => {
  it('never triggers before the minimum warning time on any difficulty', () => {
    for (const p of Object.values(DIFFICULTY)) {
      const secs = telegraphSeconds(p);
      expect(secs).toBeGreaterThanOrEqual(MIN_TELEGRAPH_SECONDS);
      const tg = new Telegraph(() => secs);
      let t = 0;
      while (!tg.update(DT, true)) {
        t += DT;
        expect(t).toBeLessThan(secs + DT);
      }
      expect(t + DT).toBeGreaterThanOrEqual(secs - 1e-6);
    }
    expect(telegraphSeconds(DIFFICULTY.story)).toBeGreaterThanOrEqual(4);
  });

  it('drains when the player is no longer exposed', () => {
    const tg = new Telegraph(() => 2);
    for (let i = 0; i < 60; i++) tg.update(DT, true);
    expect(tg.phase).toBe('warning');
    for (let i = 0; i < 60; i++) tg.update(DT, false);
    expect(tg.phase).toBe('idle');
    expect(tg.level).toBe(0);
  });

  it('schedules a threat no earlier than the telegraph allows', () => {
    const s = scheduleThreat('x', 10, 11, 2.5);
    expect(s.hitAt - s.warnAt).toBeGreaterThanOrEqual(2.5);
    expect(s.warnAt).toBeGreaterThanOrEqual(10);
    const later = scheduleThreat('y', 0, 30, 2);
    expect(later).toEqual({ id: 'y', warnAt: 28, hitAt: 30 });
  });

  it('mission timers follow the difficulty scale, also when it changes mid-run', () => {
    let scale = 1;
    const timer = new MissionTimer(10, () => scale);
    for (let i = 0; i < 300; i++) timer.update(DT);
    expect(timer.remaining).toBeCloseTo(5, 3);
    scale = 2;
    expect(timer.remaining).toBeCloseTo(10, 3);
    let steps = 0;
    while (!timer.update(DT)) steps++;
    expect(steps * DT).toBeCloseTo(10, 1);
  });
});
