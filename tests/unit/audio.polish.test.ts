import { afterEach, describe, expect, it, vi } from 'vitest';
import { BEDS, CUES } from '../../src/audio/cues';
import { AudioEngine } from '../../src/audio/engine';
import { shapeMood } from '../../src/audio/intensity';
import { ScoreLayer } from '../../src/audio/layer';
import { Narrator, type SpeechLike } from '../../src/audio/narration';
import { EraScore } from '../../src/audio/score';
import { SfxPlayer } from '../../src/audio/sfx';
import { FakeAudioContext, asAudioContext } from '../../src/audio/testing/fakeAudio';
import { MOODS, MotifComposer, REST, STEPS_PER_BAR, eraProfile, layerKey, missionYear, resolveEra } from '../../src/audio/theory';
import { Rng } from '../../src/audio/util';
import { createI18n } from '../../src/core/i18n';

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const engines: AudioEngine[] = [];
afterEach(() => {
  for (const e of engines.splice(0)) e.dispose();
  vi.useRealTimers();
});

async function setup(gateFadeMs = 0): Promise<{ fake: FakeAudioContext; engine: AudioEngine }> {
  const fake = new FakeAudioContext();
  const engine = new AudioEngine({ createContext: () => asAudioContext(fake), seed: 5, gateFadeMs });
  engines.push(engine);
  engine.unlock();
  await flush();
  return { fake, engine };
}

const targetOf = (p: unknown): number => (p as { target: number }).target;

describe('era mapping for the Prologue and Chapter 1', () => {
  it('puts every mission in its own musical era', () => {
    expect(eraProfile(1895).id).toBe('ottoman');
    expect(eraProfile(1937).id).toBe('mandate');
    expect(eraProfile(1946).id).toBe('late-mandate');
    expect(eraProfile(1947).id).toBe('late-mandate');
    expect(eraProfile(1).id).toBe('late-mandate');
    expect(eraProfile(0).id).toBe('ottoman');
  });

  it('lets a mission year win over a coarse chapter number, never over an explicit year', () => {
    expect(missionYear('tower-stockade')).toBe(1937);
    expect(missionYear('night-landing')).toBe(1946);
    expect(missionYear('archive-night')).toBeNull();
    expect(resolveEra(0, 1895)).toBe(1895);
    expect(resolveEra(1947, 1895)).toBe(1947);
    expect(resolveEra(1, null)).toBe(1);
  });

  it('keys gentle layers separately', () => {
    expect(layerKey('tense', 1946, true)).not.toBe(layerKey('tense', 1946));
  });
});

describe('MotifComposer', () => {
  const bars = (seed: number, count = 32): Int16Array[] => {
    const c = new MotifComposer(new Rng(seed));
    const out: Int16Array[] = [];
    for (let i = 0; i < count; i++) {
      const bar = new Int16Array(STEPS_PER_BAR);
      c.nextBar([0, 3, 4, 0][i % 4] ?? 0, 0.5, { barInPhrase: i % 4, section: Math.floor(i / 8) % 2, energy: 0.4 + (i % 5) * 0.12 }, bar);
      out.push(bar);
    }
    return out;
  };

  it('is deterministic per seed and differs between seeds', () => {
    expect(bars(4).map((b) => [...b])).toEqual(bars(4).map((b) => [...b]));
    expect(bars(4).map((b) => [...b])).not.toEqual(bars(9).map((b) => [...b]));
  });

  it('keeps notes in a singable range, states the motif, and ends phrases on a held note', () => {
    const all = bars(11);
    const notes = all.flatMap((b) => [...b]).filter((d) => d !== REST);
    expect(notes.length).toBeGreaterThan(40);
    expect(Math.min(...notes)).toBeGreaterThanOrEqual(-2);
    expect(Math.max(...notes)).toBeLessThanOrEqual(11);
    const first = all[0] as Int16Array;
    expect([...first].filter((d) => d !== REST).length).toBeGreaterThanOrEqual(4);
    for (let i = 3; i < all.length; i += 4) expect((all[i] as Int16Array)[4]).not.toBe(REST);
  });

  it('leaves breathing bars at low energy over many seeds', () => {
    let silent = 0;
    for (let seed = 1; seed < 40; seed++) {
      const c = new MotifComposer(new Rng(seed));
      const bar = new Int16Array(STEPS_PER_BAR);
      c.nextBar(0, 0.3, { barInPhrase: 2, section: 0, energy: 0.3 }, bar);
      if (![...bar].some((d) => d !== REST)) silent++;
    }
    expect(silent).toBeGreaterThan(3);
  });
});

describe('ScoreLayer richness and gentleness', () => {
  function layer(mood: 'calm' | 'tense', era: number, opts: { gentle?: boolean; sparse?: boolean; seed?: number } = {}): { fake: FakeAudioContext; l: ScoreLayer } {
    const fake = new FakeAudioContext();
    const ctx = asAudioContext(fake);
    const l = new ScoreLayer(ctx, ctx.destination, { key: layerKey(mood, era, opts.gentle === true), mood, era, title: false, gentle: opts.gentle === true }, opts.seed ?? 1);
    if (opts.sparse) l.setSparse(true);
    return { fake, l };
  }
  const play = (f: FakeAudioContext, l: ScoreLayer, seconds: number): void => {
    for (let t = 0; t <= seconds; t += 0.5) {
      f.currentTime = t;
      l.schedule(t + 0.6);
    }
  };

  it('plays hand drum and shimmer in the Ottoman era but thins out while someone speaks', () => {
    const a = layer('calm', 1895);
    play(a.fake, a.l, 40);
    const b = layer('calm', 1895, { sparse: true });
    play(b.fake, b.l, 40);
    expect(a.fake.oscillators.length).toBeGreaterThan(b.fake.oscillators.length * 1.15);
  });

  it('has no drum or shimmer in the late-mandate nights', () => {
    const night = layer('calm', 1946);
    play(night.fake, night.l, 40);
    const day = layer('calm', 1895);
    play(day.fake, day.l, 40);
    expect(night.fake.oscillators.length).toBeLessThan(day.fake.oscillators.length);
  });

  it('varies the energy arc and stays finite', () => {
    const { fake, l } = layer('calm', 1937);
    const seen = new Set<number>();
    for (let t = 0; t <= 120; t += 0.5) {
      fake.currentTime = t;
      l.schedule(t + 0.6);
      seen.add(Math.round(l.currentEnergy * 100));
    }
    expect(seen.size).toBeGreaterThan(5);
    for (const v of seen) {
      expect(v).toBeGreaterThanOrEqual(40);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('gentle drops the heartbeat pulse and softens the tense mood', () => {
    expect(shapeMood(MOODS.tense, 'standard')).toBe(MOODS.tense);
    const g = shapeMood(MOODS.tense, 'gentle');
    expect(g.pulse).toBe(false);
    expect(g.leadVel).toBeLessThan(MOODS.tense.leadVel);
    const std = layer('tense', 1946);
    play(std.fake, std.l, 30);
    const soft = layer('tense', 1946, { gentle: true });
    play(soft.fake, soft.l, 30);
    expect(soft.fake.oscillators.length).toBeLessThan(std.fake.oscillators.length);
  });

  it('keeps the output level below full scale', () => {
    const { fake, l } = layer('calm', 1895);
    l.fadeIn(0, 4);
    const out = fake.gains[1];
    expect(out && targetOf(out.gain)).toBeLessThan(0.8);
  });
});

describe('EraScore mission awareness', () => {
  it('uses the mission year for a coarse chapter number', async () => {
    const { engine } = await setup();
    const score = new EraScore(engine);
    score.startMission('night-landing');
    score.setMood('tense', 1);
    expect(score.currentKey).toBe('late-mandate:tense');
  });

  it('falls back to a bed-implied mood only when the level sent none', async () => {
    const { engine } = await setup();
    const score = new EraScore(engine);
    score.startMission('tower-stockade');
    score.noteBed('village');
    expect(score.currentKey).toBe('mandate:calm');
    score.noteBed('night');
    expect(score.currentKey).toBe('mandate:reflective');
    const other = new EraScore(engine);
    other.startMission('tower-stockade');
    other.setMood('hopeful', 1937);
    other.noteBed('night');
    expect(other.currentKey).toBe('mandate:hopeful');
    const none = new EraScore(engine);
    none.startMission('archive-night');
    none.noteBed('night');
    expect(none.currentKey).toBeNull();
  });

  it('crossfades to the gentle variant when the setting changes, and settles into the debrief', async () => {
    const { engine } = await setup();
    const score = new EraScore(engine);
    score.setMood('tense', 1946);
    score.setContentIntensity('gentle');
    expect(score.currentKey).toBe('late-mandate:tense:gentle');
    score.settleTo('reflective');
    expect(score.currentKey).toBe('late-mandate:reflective:gentle');
  });

  it('thins the current and future layers while sparse', async () => {
    const { engine } = await setup();
    const score = new EraScore(engine);
    score.setSparse(true);
    score.setMood('calm', 1895);
    expect(score.isSparse).toBe(true);
    score.tick(0);
    expect(engine.context).not.toBeNull();
  });
});

describe('ducking under narration and captions', () => {
  it('dips music lightly for captions, deeply for narration, and ambience a little', async () => {
    const { engine } = await setup();
    const b = engine.buses;
    engine.setCaptionDuck(true);
    expect(targetOf(b?.musicDuck.gain)).toBeCloseTo(0.72);
    expect(targetOf(b?.ambienceDuck.gain)).toBeCloseTo(0.9);
    engine.setDucked(true);
    expect(targetOf(b?.musicDuck.gain)).toBeCloseTo(0.5);
    expect(targetOf(b?.ambienceDuck.gain)).toBeCloseTo(0.75);
    engine.setDucked(false);
    expect(targetOf(b?.musicDuck.gain)).toBeCloseTo(0.72);
    engine.setCaptionDuck(false);
    expect(targetOf(b?.musicDuck.gain)).toBe(1);
    expect(targetOf(b?.ambienceDuck.gain)).toBe(1);
  });

  it('applies a duck requested before the context exists', () => {
    const fake = new FakeAudioContext();
    const engine = new AudioEngine({ createContext: () => asAudioContext(fake), gateFadeMs: 0 });
    engines.push(engine);
    engine.setCaptionDuck(true);
    engine.unlock();
    expect(targetOf(engine.buses?.musicDuck.gain)).toBeCloseTo(0.72);
  });

  it('releases the duck even if the platform never reports the end of speech', () => {
    vi.useFakeTimers();
    const ducks: boolean[] = [];
    const synth: SpeechLike = { speak: () => undefined, cancel: () => undefined, getVoices: () => [{ lang: 'he-IL', name: 'h', default: true, localService: true, voiceURI: 'h' } as SpeechSynthesisVoice] };
    const narrator = new Narrator({
      synth,
      createUtterance: () => ({}) as SpeechSynthesisUtterance,
      i18n: createI18n('he', { k: 'שלום' }),
      getLevels: () => ({ voice: true, narration: 1, master: 1 }),
      onSpeaking: (s) => ducks.push(s),
    });
    narrator.onSubtitle({ textKey: 'k', voice: true });
    // The utterance never fires onstart/onend: nothing ducked, nothing stuck.
    vi.advanceTimersByTime(20000);
    expect(narrator.isSpeaking).toBe(false);
    expect(ducks.every((d) => !d)).toBe(true);
  });
});

describe('smooth suspend and resume', () => {
  it('fades the gate out before suspending and back in after resuming', async () => {
    const { fake, engine } = await setup(90);
    vi.useFakeTimers();
    const gate = engine.buses?.gate.gain;
    engine.setPaused(true);
    expect(targetOf(gate)).toBe(0);
    expect(fake.state).toBe('running');
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(fake.suspendCalls).toBe(1);
    engine.setPaused(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(fake.state).toBe('running');
    expect(targetOf(gate)).toBe(1);
  });

  it('cancels a pending suspend when sound is wanted again within the fade', async () => {
    const { fake, engine } = await setup(90);
    vi.useFakeTimers();
    engine.setHidden(true);
    engine.setHidden(false);
    vi.advanceTimersByTime(200);
    await Promise.resolve();
    expect(fake.suspendCalls).toBe(0);
    expect(fake.state).toBe('running');
    expect(targetOf(engine.buses?.gate.gain)).toBe(1);
  });
});

describe('beds and sustained cues', () => {
  it('every bed uses only known loops and one-shot events', () => {
    for (const [name, bed] of Object.entries(BEDS)) {
      for (const l of bed.loops) expect(CUES[l.cue]?.kind, name + ' loop ' + l.cue).toBe('loop');
      for (const ev of bed.events) {
        expect(CUES[ev.cue], name + ' event ' + ev.cue).toBeDefined();
        expect(ev.maxGap).toBeGreaterThanOrEqual(ev.minGap);
      }
    }
    for (const bed of ['harbor', 'dusk', 'beach', 'town-night']) expect(BEDS[bed]).toBeDefined();
  });

  it('a bed change keeps the loops two beds share instead of restarting them', async () => {
    const { fake, engine } = await setup();
    const sfx = new SfxPlayer(engine);
    sfx.setBed('village');
    const before = fake.sources.length;
    expect(sfx.activeLoops()).toContain('bed:wind');
    sfx.setBed('dusk');
    // dusk shares wind and crowd.murmur with village: no new buffer sources for them.
    expect(fake.sources.length).toBe(before);
    expect(sfx.activeLoops().sort()).toEqual(['bed:crowd.murmur', 'bed:wind']);
    sfx.setBed('none');
    expect(sfx.activeLoops()).toEqual([]);
  });

  it('stopWorldLoops ends engines and crowds but not the bed', async () => {
    const { engine } = await setup();
    const sfx = new SfxPlayer(engine);
    sfx.setBed('sea');
    sfx.handleCue('engine.ship', 0.8);
    expect(sfx.activeLoops()).toContain('engine.ship');
    sfx.stopWorldLoops(0.5);
    expect(sfx.activeLoops()).not.toContain('engine.ship');
    expect(sfx.activeLoops().some((k) => k.startsWith('bed:'))).toBe(true);
  });

  it('plays every new distant one-shot without throwing', async () => {
    const { engine } = await setup();
    const sfx = new SfxPlayer(engine);
    for (const cue of ['gull', 'hammer', 'cart.creak', 'rigging', 'owl', 'horn.far', 'room.settle', 'footsteps.distant']) {
      expect(sfx.handleCue(cue, 0.7), cue).toBe(true);
    }
    for (const cue of ['surf', 'radio.hum']) expect(sfx.handleCue(cue, 0.7), cue).toBe(true);
  });
});
