import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { createI18n } from '../../src/core/i18n';
import { DEFAULT_SETTINGS } from '../../src/core/settings';
import { AudioEngine } from '../../src/audio/engine';
import { FakeAudioContext, asAudioContext } from '../../src/audio/testing/fakeAudio';
import type { Game } from '../../src/game';

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function make(): { fake: FakeAudioContext; engine: AudioEngine } {
  const fake = new FakeAudioContext();
  const engine = new AudioEngine({ createContext: () => asAudioContext(fake), seed: 1 });
  return { fake, engine };
}

const engines: AudioEngine[] = [];
afterEach(() => {
  for (const e of engines.splice(0)) e.dispose();
  vi.unstubAllGlobals();
});

describe('AudioEngine lifecycle', () => {
  it('creates no AudioContext until the first gesture, then resumes it', async () => {
    const { fake, engine } = make();
    engines.push(engine);
    expect(engine.context).toBeNull();
    expect(engine.state).toBe('none');
    engine.setPaused(false);
    expect(fake.resumeCalls).toBe(0);
    engine.unlock();
    await flush();
    expect(engine.context).not.toBeNull();
    expect(fake.resumeCalls).toBe(1);
    expect(engine.state).toBe('running');
  });

  it('survives a missing Web Audio implementation', () => {
    const engine = new AudioEngine({
      createContext: () => {
        throw new Error('no audio');
      },
    });
    engines.push(engine);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => engine.unlock()).not.toThrow();
    expect(engine.state).toBe('none');
    spy.mockRestore();
  });

  it('routes every bus through a master compressor', () => {
    const { fake, engine } = make();
    engines.push(engine);
    engine.unlock();
    const buses = engine.buses;
    expect(buses).not.toBeNull();
    expect(fake.compressors).toHaveLength(1);
    expect((buses?.master as unknown as { connections: unknown[] }).connections).toContain(fake.compressors[0]);
    expect((fake.compressors[0] as unknown as { connections: unknown[] }).connections).toContain(fake.destination);
  });

  it('suspends while paused or hidden and resumes only when neither applies', async () => {
    const { fake, engine } = make();
    engines.push(engine);
    engine.unlock();
    await flush();
    engine.setPaused(true);
    await flush();
    expect(fake.state).toBe('suspended');
    engine.setHidden(true);
    engine.setPaused(false);
    await flush();
    expect(fake.state).toBe('suspended');
    engine.setHidden(false);
    await flush();
    expect(fake.state).toBe('running');
  });

  it('recovers when the platform suspends the context on its own', async () => {
    const { fake, engine } = make();
    engines.push(engine);
    engine.unlock();
    await flush();
    const before = fake.resumeCalls;
    await fake.suspend();
    await flush();
    expect(fake.resumeCalls).toBeGreaterThan(before);
    expect(fake.state).toBe('running');
  });

  it('drives schedulers only through tick, and isolates a failing scheduler', () => {
    const { engine } = make();
    engines.push(engine);
    engine.unlock();
    const good = vi.fn();
    engine.onTick(() => {
      throw new Error('boom');
    });
    engine.onTick(good);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    engine.tick();
    spy.mockRestore();
    expect(good).toHaveBeenCalledTimes(1);
  });
});

describe('AudioEngine buses follow settings.audio', () => {
  it('applies saved levels as the initial values when the context is created', () => {
    const { engine } = make();
    engines.push(engine);
    engine.applySettings({ master: 0.5, music: 0.3, sfx: 0.6, narration: 0.2, voice: true });
    engine.unlock();
    const b = engine.buses;
    expect(b?.master.gain.value).toBeCloseTo(0.5 * 0.85);
    expect(b?.music.gain.value).toBeCloseTo(0.3);
    expect(b?.sfx.gain.value).toBeCloseTo(0.6);
    expect(b?.ambience.gain.value).toBeCloseTo(0.6);
    expect(b?.narration.gain.value).toBeCloseTo(0.2);
  });

  it('ramps (never jumps) to new levels', () => {
    const { engine } = make();
    engines.push(engine);
    engine.unlock();
    engine.applySettings({ master: 1, music: 0, sfx: 0.25, narration: 0.9, voice: false });
    const b = engine.buses;
    const param = b?.music.gain as unknown as { target: number; events: { kind: string }[] };
    expect(param.target).toBe(0);
    expect(param.events.some((e) => e.kind === 'target')).toBe(true);
    expect((b?.sfx.gain as unknown as { target: number }).target).toBeCloseTo(0.25);
  });

  it('ducks the music bus while narration speaks', () => {
    const { engine } = make();
    engines.push(engine);
    engine.unlock();
    engine.setDucked(true);
    expect((engine.buses?.musicDuck.gain as unknown as { target: number }).target).toBe(0.5);
    engine.setDucked(false);
    expect((engine.buses?.musicDuck.gain as unknown as { target: number }).target).toBe(1);
  });
});

describe('installAudio gesture and event wiring', () => {
  async function setup(): Promise<{ bus: EventBus<GameEvents>; fake: FakeAudioContext; dispose: () => void; win: EventTarget; doc: EventTarget & { visibilityState: string } }> {
    const fake = new FakeAudioContext();
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', doc);
    vi.stubGlobal('AudioContext', function Ctor() {
      return fake;
    });
    const { installAudio } = await import('../../src/audio/install');
    const bus = new EventBus<GameEvents>();
    const game = { bus, settings: { value: DEFAULT_SETTINGS }, i18n: createI18n('he', {}) } as unknown as Game;
    return { bus, fake, dispose: installAudio(game), win, doc };
  }

  it('does nothing before a gesture and wakes on keydown', async () => {
    const { bus, fake, dispose, win } = await setup();
    bus.emit('audio:cue', { cue: 'ui.confirm' });
    bus.emit('audio:mood', { mood: 'calm', era: 1948 });
    await flush();
    expect(fake.resumeCalls).toBe(0);
    expect(fake.oscillators).toHaveLength(0);
    win.dispatchEvent(new Event('keydown'));
    await flush();
    expect(fake.state).toBe('running');
    dispose();
  });

  it('starts the mood requested before the gesture once audio unlocks', async () => {
    const { bus, fake, dispose, win } = await setup();
    bus.emit('audio:mood', { mood: 'hopeful', era: 2000 });
    win.dispatchEvent(new Event('pointerdown'));
    await flush();
    fake.currentTime = 1;
    await new Promise((r) => setTimeout(r, 250));
    expect(fake.oscillators.length).toBeGreaterThan(0);
    dispose();
  });

  it('unlocks on the first gamepad input', async () => {
    const { bus, fake, dispose } = await setup();
    bus.emit('input:device-changed', { device: 'gamepad', family: 'xbox' });
    await flush();
    expect(fake.state).toBe('running');
    dispose();
  });

  it('suspends on pause and when the app is hidden', async () => {
    const { bus, fake, dispose, win, doc } = await setup();
    win.dispatchEvent(new Event('pointerdown'));
    await flush();
    bus.emit('flow:pause-changed', { paused: true });
    await flush();
    expect(fake.state).toBe('suspended');
    bus.emit('flow:pause-changed', { paused: false });
    await flush();
    expect(fake.state).toBe('running');
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(fake.state).toBe('suspended');
    dispose();
  });
});
