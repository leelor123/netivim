import { afterEach, describe, expect, it } from 'vitest';
import { AudioEngine } from '../../src/audio/engine';
import { EraScore } from '../../src/audio/score';
import { MoodMachine, type MoodLayer } from '../../src/audio/mood';
import {
  MODES,
  MelodyWalker,
  REST,
  STEPS_PER_BAR,
  TITLE_PHRASES,
  eraProfile,
  eraToYear,
  layerKey,
  scaleNote,
} from '../../src/audio/theory';
import { Rng } from '../../src/audio/util';
import { generateLoopableNoise } from '../../src/audio/noise';
import { FakeAudioContext, asAudioContext } from '../../src/audio/testing/fakeAudio';

class FakeLayer implements MoodLayer {
  fadeInSeconds = 4;
  faded: 'in' | 'out' | null = null;
  disposed = false;
  scheduled: number[] = [];
  constructor(readonly key: string) {}
  fadeIn(): void {
    this.faded = 'in';
  }
  fadeOut(): void {
    this.faded = 'out';
  }
  schedule(until: number): void {
    this.scheduled.push(until);
  }
  stopScheduling(): void {
    // not needed
  }
  dispose(): void {
    this.disposed = true;
  }
}

function machine(): { m: MoodMachine<FakeLayer>; layers: FakeLayer[] } {
  const layers: FakeLayer[] = [];
  const m = new MoodMachine<FakeLayer>((key) => {
    const l = new FakeLayer(key);
    layers.push(l);
    return l;
  });
  return { m, layers };
}

describe('MoodMachine crossfade state machine', () => {
  it('starts idle, fades in the first mood, settles to steady', () => {
    const { m, layers } = machine();
    expect(m.state).toBe('idle');
    expect(m.request('a:calm', 0)).toBe('started');
    expect(m.state).toBe('crossfading');
    m.update(5, 5.6);
    expect(m.state).toBe('steady');
    expect(layers[0]?.scheduled).toEqual([5.6]);
  });

  it('ignores a repeated request for what already plays', () => {
    const { m, layers } = machine();
    m.request('a:calm', 0);
    expect(m.request('a:calm', 1)).toBe('unchanged');
    expect(layers).toHaveLength(1);
  });

  it('crossfades to a new mood and disposes the old layer only after its fade', () => {
    const { m, layers } = machine();
    m.request('a:calm', 0);
    m.update(5, 6);
    expect(m.request('a:tense', 10)).toBe('crossfade');
    expect(m.state).toBe('crossfading');
    expect(layers[0]?.faded).toBe('out');
    expect(layers[1]?.faded).toBe('in');
    m.update(11, 12);
    expect(layers[0]?.disposed).toBe(false);
    m.update(20, 21);
    expect(layers[0]?.disposed).toBe(true);
    expect(m.state).toBe('steady');
    expect(m.layerCount).toBe(1);
  });

  it('keeps the number of simultaneous layers bounded under rapid changes', () => {
    const { m, layers } = machine();
    for (let i = 0; i < 6; i++) m.request('k' + i, i * 0.1);
    expect(m.layerCount).toBeLessThanOrEqual(3);
    expect(layers.filter((l) => l.disposed).length).toBeGreaterThanOrEqual(3);
    expect(m.currentKey).toBe('k5');
  });

  it('stop fades everything out and returns to idle', () => {
    const { m } = machine();
    m.request('a:calm', 0);
    m.update(5, 6);
    m.stop(6);
    expect(m.state).toBe('crossfading');
    m.update(20, 21);
    expect(m.state).toBe('idle');
  });
});

describe('Era Score theory', () => {
  it('shifts instrumentation by era', () => {
    expect(eraProfile(1890).lead).toBe('oud');
    expect(eraProfile(1930).lead).toBe('oud');
    expect(eraProfile(1948).lead).toBe('accordion');
    expect(eraProfile(1973).lead).toBe('piano');
    expect(eraProfile(2020).pad).toBe('synth');
    expect(eraProfile(1890).modes.tense).toBe('hijaz');
  });

  it('accepts chapter numbers as well as years', () => {
    expect(eraToYear(2)).toBe(1948);
    expect(eraToYear(99)).toBe(2025);
    expect(eraToYear(1967)).toBe(1967);
    expect(eraToYear(Number.NaN)).toBe(2000);
  });

  it('keys layers by profile and mood, not by the exact year', () => {
    expect(layerKey('calm', 1950)).toBe(layerKey('calm', 1960));
    expect(layerKey('calm', 1950)).not.toBe(layerKey('calm', 1980));
    expect(layerKey('calm', 1950)).not.toBe(layerKey('tense', 1950));
  });

  it('wraps scale degrees across octaves', () => {
    const m = MODES.ionian;
    expect(scaleNote(60, m, 0)).toBe(60);
    expect(scaleNote(60, m, 7)).toBe(72);
    expect(scaleNote(60, m, -1)).toBe(59);
  });

  it('generates deterministic but varied melody', () => {
    const run = (seed: number): number[] => {
      const w = new MelodyWalker(new Rng(seed));
      const out = new Int16Array(STEPS_PER_BAR);
      const all: number[] = [];
      for (let bar = 0; bar < 16; bar++) {
        w.nextBar(bar % 4, 0.6, out);
        all.push(...out);
      }
      return all;
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
    const notes = run(7).filter((d) => d !== REST);
    expect(notes.length).toBeGreaterThan(10);
    expect(Math.min(...notes)).toBeGreaterThanOrEqual(-4);
    expect(Math.max(...notes)).toBeLessThanOrEqual(15);
  });

  it('plays the fixed title phrases first, then varies them', () => {
    const w = new MelodyWalker(new Rng(3), TITLE_PHRASES);
    const out = new Int16Array(STEPS_PER_BAR);
    w.nextBar(0, 0.4, out);
    expect([...out]).toEqual([...(TITLE_PHRASES[0] ?? [])]);
  });
});

describe('noise loops', () => {
  it('is bounded and has no jump at the loop point', () => {
    for (const kind of ['white', 'pink', 'brown'] as const) {
      const n = generateLoopableNoise(kind, 8000, 1000, 5);
      expect(n).toHaveLength(8000);
      expect(Math.max(...n.map(Math.abs))).toBeLessThan(2);
    }
    const b = generateLoopableNoise('brown', 8000, 1000, 5);
    expect(Math.abs((b[0] ?? 0) - (b[7999] ?? 0))).toBeLessThan(0.1);
  });
});

describe('EraScore on a fake context', () => {
  const engines: AudioEngine[] = [];
  afterEach(() => {
    for (const e of engines.splice(0)) e.dispose();
  });

  function setup(seed = 1): { fake: FakeAudioContext; engine: AudioEngine; score: EraScore } {
    const fake = new FakeAudioContext();
    const engine = new AudioEngine({ createContext: () => asAudioContext(fake), seed });
    engines.push(engine);
    engine.unlock();
    return { fake, engine, score: new EraScore(engine) };
  }

  it('schedules notes with lookahead and never twice for the same window', () => {
    const { fake, score } = setup();
    score.setMood('calm', 1948);
    score.tick(0);
    const first = fake.oscillators.length;
    expect(first).toBeGreaterThan(0);
    score.tick(0);
    expect(fake.oscillators.length).toBe(first);
    for (let t = 1; t <= 12; t += 0.5) {
      fake.currentTime = t;
      score.tick(t);
    }
    expect(fake.oscillators.length).toBeGreaterThan(first);
  });

  it('produces the same notes for the same seed and different notes for another', () => {
    const freqs = (seed: number): number[] => {
      const { fake, score } = setup(seed);
      score.setMood('reflective', 1990);
      for (let t = 0; t < 12; t += 0.5) {
        fake.currentTime = t;
        score.tick(t);
      }
      return fake.oscillators.map((o) => o.frequency.value);
    };
    expect(freqs(11)).toEqual(freqs(11));
    expect(freqs(11)).not.toEqual(freqs(12));
  });

  it('crossfades between moods and the era instrument changes the layer key', () => {
    const { fake, score } = setup();
    score.setMood('calm', 1900);
    expect(score.currentKey).toBe('ottoman:calm');
    score.setMood('calm', 1900);
    expect(score.layerCount).toBe(1);
    score.setMood('tense', 1900);
    expect(score.layerCount).toBe(2);
    score.setMood('tense', 2020);
    expect(score.currentKey).toBe('contemporary:tense');
    fake.currentTime = 30;
    score.tick(30);
    expect(score.layerCount).toBe(1);
    expect(score.state).toBe('steady');
  });

  it('plays the title theme and replaces it when a mood arrives', () => {
    const { score } = setup();
    score.playTitle();
    expect(score.currentKey).toBe('title');
    score.setMood('calm', 1948);
    expect(score.currentKey).toBe('founding:calm');
  });
});
