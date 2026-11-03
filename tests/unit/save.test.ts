import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { fnv1a32 } from '../../src/core/save/checksum';
import { decodeEnvelope, encodeEnvelope, MAX_ENVELOPE_CHARS, SaveTooLargeError } from '../../src/core/save/envelope';
import { bindExitTriggers } from '../../src/core/save/lifecycle';
import { SaveManager } from '../../src/core/save/saveManager';
import { createNewSave, isSaveData, migrate, type SaveData } from '../../src/core/save/schema';
import { readSlot, slotKey, writeSlot } from '../../src/core/save/slots';
import { MemoryAsyncStore, MemoryStore, type SyncStore } from '../../src/core/save/stores';

const any = (): boolean => true;

describe('checksum and envelope', () => {
  it('fnv1a32 is stable and sensitive', () => {
    expect(fnv1a32('')).toBe('811c9dc5');
    expect(fnv1a32('abc')).not.toBe(fnv1a32('abd'));
  });

  it('round-trips a payload', () => {
    const raw = encodeEnvelope({ a: 1 }, 3, 1000);
    expect(decodeEnvelope(raw)).toMatchObject({ seq: 3, t: 1000, payload: { a: 1 } });
  });

  it('rejects truncated, tampered and garbage data without throwing', () => {
    const raw = encodeEnvelope({ a: 1 }, 1, 1);
    const tampered = JSON.stringify({ ...(JSON.parse(raw) as object), data: JSON.stringify({ a: 2 }) });
    expect(decodeEnvelope(raw.slice(0, raw.length - 5))).toBeNull();
    expect(decodeEnvelope(tampered)).toBeNull();
    expect(decodeEnvelope('not json')).toBeNull();
    expect(decodeEnvelope('null')).toBeNull();
    expect(decodeEnvelope('')).toBeNull();
    expect(decodeEnvelope(null)).toBeNull();
  });

  it('refuses oversized saves', () => {
    expect(() => encodeEnvelope({ big: 'x'.repeat(MAX_ENVELOPE_CHARS) }, 1, 1)).toThrow(SaveTooLargeError);
  });
});

describe('double-buffered slots', () => {
  it('alternates buffers and increases seq', () => {
    const s = new MemoryStore();
    expect(writeSlot(s, 'auto', { n: 1 }, 1, any)).toMatchObject({ buffer: 'A', seq: 1 });
    expect(writeSlot(s, 'auto', { n: 2 }, 2, any)).toMatchObject({ buffer: 'B', seq: 2 });
    expect(writeSlot(s, 'auto', { n: 3 }, 3, any)).toMatchObject({ buffer: 'A', seq: 3 });
    expect(readSlot(s, 'auto', any)?.env.payload).toEqual({ n: 3 });
  });

  it('survives a torn write: the previous save is still loaded', () => {
    const s = new MemoryStore();
    writeSlot(s, 'auto', { n: 1 }, 1, any);
    writeSlot(s, 'auto', { n: 2 }, 2, any);
    // Simulate the app being killed halfway through writing buffer A.
    const full = encodeEnvelope({ n: 3 }, 3, 3);
    s.setItem(slotKey('auto', 'A'), full.slice(0, Math.floor(full.length / 2)));
    expect(readSlot(s, 'auto', any)?.env.payload).toEqual({ n: 2 });
    // The next write repairs the damaged buffer, not the good one.
    expect(writeSlot(s, 'auto', { n: 4 }, 4, any).buffer).toBe('A');
    expect(readSlot(s, 'auto', any)?.env.payload).toEqual({ n: 4 });
  });

  it('skips a buffer whose payload fails the schema check', () => {
    const s = new MemoryStore();
    writeSlot(s, 'x', { ok: true }, 1, any);
    s.setItem(slotKey('x', 'B'), encodeEnvelope({ ok: false }, 9, 9));
    const r = readSlot(s, 'x', (p) => (p as { ok: boolean }).ok);
    expect(r?.env.payload).toEqual({ ok: true });
  });

  it('honors a minimum sequence', () => {
    const s = new MemoryStore();
    expect(writeSlot(s, 'auto', {}, 1, any, 41).seq).toBe(42);
  });
});

describe('save schema', () => {
  it('accepts a new save and rejects broken shapes', () => {
    const ok = createNewSave(5);
    expect(isSaveData(ok)).toBe(true);
    expect(isSaveData({ ...ok, difficulty: 'impossible' })).toBe(false);
    expect(isSaveData({ ...ok, completedMissions: [1] })).toBe(false);
    expect(isSaveData({ ...ok, stats: { playSeconds: -1, peopleHelped: 0 } })).toBe(false);
    expect(isSaveData({ ...ok, resume: { screen: 'mission', chapterId: null, mission: null } })).toBe(false);
    expect(isSaveData(null)).toBe(false);
  });

  it('migrates old versions step by step and rejects unknown ones', () => {
    const v0 = { version: 0, created: 7 };
    const table = {
      0: (d: Record<string, unknown>) => ({ ...createNewSave(d.created as number), version: 1 }),
    };
    expect(migrate(v0, table)?.createdAt).toBe(7);
    expect(migrate({ version: -5 }, table)).toBeNull();
    expect(migrate({ version: 0 }, {})).toBeNull();
    expect(migrate('junk')).toBeNull();
  });
});

interface Harness {
  mgr: SaveManager;
  primary: SyncStore;
  mirror: MemoryAsyncStore;
  vol: { value: boolean };
  state: { save: SaveData };
  events: string[];
  bus: EventBus<GameEvents>;
}

function makeManager(opts: { primary?: SyncStore; mirror?: MemoryAsyncStore } = {}): Harness {
  const bus = new EventBus<GameEvents>();
  const primary = opts.primary ?? new MemoryStore();
  const mirror = opts.mirror ?? new MemoryAsyncStore();
  const vol = { value: false };
  const state = { save: createNewSave(1) };
  let clock = 1000;
  const events: string[] = [];
  bus.on('save:written', ({ slot, reason }) => events.push('written:' + slot + ':' + reason));
  bus.on('save:failed', ({ slot }) => events.push('failed:' + slot));
  const mgr = new SaveManager({
    bus,
    primary,
    mirrors: [mirror],
    now: () => ++clock,
    snapshot: () => state.save,
    isVolatile: () => vol.value,
  });
  return { mgr, primary, mirror, vol, state, events, bus };
}

function withMission(save: SaveData, state: string): SaveData {
  return { ...save, resume: { screen: 'briefing', chapterId: 'ch02', mission: { missionId: 'm1', state, checkpoint: 'start', data: null } } };
}

function enterVolatile(h: Harness): void {
  h.vol.value = true;
  h.mgr.onFlowChanged();
}

describe('SaveManager: BRIEF 8.H exit matrix', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeManager();
  });

  it('in menus: exit saves', () => {
    h.state.save = { ...h.state.save, completedMissions: ['a'] };
    expect(h.mgr.onExit('pagehide')).toBe(true);
    expect(h.mgr.load('auto')?.data.completedMissions).toEqual(['a']);
  });

  it('mid-mission without a manual save: exit does NOT overwrite the stable save', () => {
    h.state.save = withMission(h.state.save, 'start');
    h.mgr.autosave('mission-start');
    enterVolatile(h);
    h.state.save = withMission(h.state.save, 'deep-inside');
    expect(h.mgr.onExit('visibilitychange')).toBe(false);
    expect(h.mgr.load('auto')?.data.resume.mission?.state).toBe('start');
  });

  it('mid-mission after a manual save: exit saves the exact state', () => {
    enterVolatile(h);
    h.state.save = withMission(h.state.save, 'after-manual');
    expect(h.mgr.saveManual('manual-2')).toBe(true);
    h.state.save = withMission(h.state.save, 'later');
    expect(h.mgr.onExit('pagehide')).toBe(true);
    expect(h.mgr.load('auto')?.data.resume.mission?.state).toBe('later');
    expect(h.mgr.load('manual-2')?.data.resume.mission?.state).toBe('after-manual');
  });

  it('mid-cutscene without a manual save: exit does not overwrite', () => {
    h.mgr.autosave('hub');
    enterVolatile(h);
    expect(h.mgr.onExit('freeze')).toBe(false);
  });

  it('a new mission resets the manual-save permission', () => {
    enterVolatile(h);
    h.mgr.saveManual();
    h.vol.value = false;
    h.mgr.onFlowChanged();
    enterVolatile(h);
    expect(h.mgr.canAutosave).toBe(false);
  });
});

describe('SaveManager: reliability', () => {
  it('tracks the unsaved-progress flag', () => {
    const h = makeManager();
    const flags: boolean[] = [];
    h.bus.on('save:dirty-changed', ({ dirty }) => flags.push(dirty));
    enterVolatile(h);
    expect(h.mgr.dirty).toBe(true);
    h.mgr.saveManual();
    expect(h.mgr.dirty).toBe(false);
    h.mgr.markDirty();
    expect(h.mgr.dirty).toBe(true);
    h.vol.value = false;
    h.mgr.onFlowChanged();
    expect(flags).toEqual([true, false, true, false]);
  });

  it('reports a full or blocked storage instead of throwing', () => {
    const broken: SyncStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
      keys: () => [],
    };
    const h = makeManager({ primary: broken });
    expect(h.mgr.saveManual()).toBe(false);
    expect(h.events).toEqual(['failed:manual-1']);
  });

  it('reports a store that silently drops writes', () => {
    const dropping: SyncStore = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, keys: () => [] };
    const h = makeManager({ primary: dropping });
    expect(h.mgr.autosave('x')).toBe(false);
  });

  it('mirrors every write and restores from the mirror after WebView data loss', async () => {
    const mirror = new MemoryAsyncStore('prefs');
    const a = makeManager({ mirror });
    a.state.save = { ...a.state.save, medals: ['planner'] };
    a.mgr.autosave('chapter-complete');
    await a.mgr.flushMirrors();
    // Fresh primary (storage cleared), same mirror.
    const b = makeManager({ mirror });
    expect(b.mgr.load('auto')).toBeNull();
    await b.mgr.hydrateFromMirrors();
    expect(b.mgr.load('auto')?.data.medals).toEqual(['planner']);
  });

  it('never lets an older mirror copy win over newer progress', async () => {
    const mirror = new MemoryAsyncStore();
    const a = makeManager({ mirror });
    for (let i = 0; i < 5; i++) a.mgr.autosave('x');
    await a.mgr.flushMirrors();
    const b = makeManager({ mirror });
    await b.mgr.hydrateFromMirrors();
    b.state.save = { ...b.state.save, medals: ['newest'] };
    b.mgr.autosave('y');
    await b.mgr.flushMirrors();
    const c = makeManager({ mirror });
    await c.mgr.hydrateFromMirrors();
    expect(c.mgr.load('auto')?.data.medals).toEqual(['newest']);
  });

  it('loadNewest picks the most recent slot', () => {
    const h = makeManager();
    h.state.save = { ...h.state.save, medals: ['old'] };
    h.mgr.saveManual('manual-3');
    h.state.save = { ...h.state.save, medals: ['new'] };
    h.mgr.autosave('x');
    expect(h.mgr.loadNewest()).toMatchObject({ slot: 'auto', data: { medals: ['new'] } });
  });

  it('ignores corrupted data and falls back to the other buffer', () => {
    const h = makeManager();
    h.state.save = { ...h.state.save, medals: ['good'] };
    h.mgr.autosave('1');
    h.primary.setItem(slotKey('auto', 'B'), JSON.stringify({ v: 1, seq: 99, t: 1, sum: 'bad', data: '{}' }));
    expect(h.mgr.load('auto')?.data.medals).toEqual(['good']);
  });

  it('resetAll removes saves everywhere and keeps unrelated keys', async () => {
    const h = makeManager();
    h.mgr.autosave('x');
    await h.mgr.flushMirrors();
    h.primary.setItem('unrelated', 'keep');
    await h.mgr.resetAll();
    expect(h.mgr.loadNewest()).toBeNull();
    expect(h.primary.getItem('unrelated')).toBe('keep');
    expect(h.mirror.map.size).toBe(0);
  });
});

describe('exit triggers', () => {
  it('fires on hidden visibility, pagehide and freeze, and unbinds', () => {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const seen: string[] = [];
    const off = bindExitTriggers(win, doc, (t) => seen.push(t));
    doc.dispatchEvent(new Event('visibilitychange'));
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('pagehide'));
    doc.dispatchEvent(new Event('freeze'));
    off();
    win.dispatchEvent(new Event('pagehide'));
    expect(seen).toEqual(['visibilitychange', 'pagehide', 'freeze']);
  });
});
