import { afterEach, describe, expect, it } from 'vitest';
import { BEDS, CUES, allCueNames } from '../../src/audio/cues';
import { AudioEngine } from '../../src/audio/engine';
import { SENSITIVE_CUES, shapeCue } from '../../src/audio/intensity';
import { SfxPlayer } from '../../src/audio/sfx';
import { FakeAudioContext, asAudioContext } from '../../src/audio/testing/fakeAudio';
import { VoiceLimiter } from '../../src/audio/voices';
import HEBREW from '../../src/locales/he/audio.json';

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const engines: AudioEngine[] = [];
afterEach(() => {
  for (const e of engines.splice(0)) e.dispose();
});

async function setup(maxVoices = 20): Promise<{ fake: FakeAudioContext; engine: AudioEngine; sfx: SfxPlayer }> {
  const fake = new FakeAudioContext();
  const engine = new AudioEngine({ createContext: () => asAudioContext(fake), seed: 3, maxVoices });
  engines.push(engine);
  engine.unlock();
  await flush();
  return { fake, engine, sfx: new SfxPlayer(engine) };
}

describe('VoiceLimiter', () => {
  it('accepts voices up to the limit and expires them by audio time', () => {
    const l = new VoiceLimiter(2);
    expect(l.acquire('a', 0, 1, 5)).not.toBeNull();
    expect(l.acquire('b', 0, 2, 5)).not.toBeNull();
    expect(l.active).toBe(2);
    l.prune(1.5);
    expect(l.active).toBe(1);
  });

  it('steals the oldest lowest-priority voice for an equal or more important one', () => {
    const l = new VoiceLimiter(2);
    let killed = '';
    l.acquire('old-low', 0, 10, 1, () => (killed = 'old-low'));
    l.acquire('high', 1, 10, 9);
    expect(l.acquire('new', 2, 10, 1)).not.toBeNull();
    expect(killed).toBe('old-low');
    expect(l.stolen).toBe(1);
    expect(l.names().sort()).toEqual(['high', 'new']);
  });

  it('rejects a less important newcomer when full of important voices', () => {
    const l = new VoiceLimiter(1);
    l.acquire('ui', 0, 10, 9);
    expect(l.acquire('steps', 1, 10, 2)).toBeNull();
    expect(l.rejected).toBe(1);
    expect(l.active).toBe(1);
  });

  it('kills voices by name and survives a throwing kill', () => {
    const l = new VoiceLimiter(4);
    l.acquire('siren.alert', 0, 10, 8, () => {
      throw new Error('x');
    });
    l.acquire('wind', 0, 10, 5);
    expect(l.killByName('siren.alert')).toBe(1);
    expect(l.names()).toEqual(['wind']);
  });
});

describe('Content Intensity', () => {
  it('leaves everything untouched in standard', () => {
    for (const cue of [...SENSITIVE_CUES, 'ui.move']) expect(shapeCue(cue, 1, 'standard')).toEqual({ play: true, gain: 1, lowpassHz: null, maxSeconds: null });
  });

  it('softens the siren and rumble in gentle, and skips a loud rumble', () => {
    const siren = shapeCue('siren.alert', 1, 'gentle');
    expect(siren.play).toBe(true);
    expect(siren.gain).toBeLessThan(0.5);
    expect(siren.lowpassHz).not.toBeNull();
    expect(siren.maxSeconds).not.toBeNull();
    expect(shapeCue('distant.rumble', 0.4, 'gentle').lowpassHz).toBeLessThan(200);
    expect(shapeCue('distant.rumble', 0.9, 'gentle').play).toBe(false);
    expect(shapeCue('ui.confirm', 1, 'gentle').gain).toBe(1);
  });

  it('applies to actual playback: quieter, filtered and shorter', async () => {
    const std = await setup();
    std.sfx.handleCue('siren.alert', 1);
    // Gains 0-7 are the buses and gate; the next one is the voice gain.
    const stdGain = std.fake.gains[8]?.gain.value ?? 0;
    const stdFilters = std.fake.filters.length;
    expect(stdGain).toBeGreaterThan(0);

    const gentle = await setup();
    gentle.sfx.setContentIntensity('gentle');
    gentle.sfx.handleCue('siren.alert', 1);
    const gentleGain = gentle.fake.gains[8]?.gain.value ?? stdGain;
    expect(gentleGain).toBeLessThan(stdGain * 0.5);
    expect(gentle.fake.filters.length).toBeGreaterThan(stdFilters);
    const lowpass = gentle.fake.filters.find((f) => f.frequency.value === 700);
    expect(lowpass).toBeDefined();
    expect(gentle.engine.limiter.names()).toContain('siren.alert');
  });

  it('skips a loud distant.rumble in gentle and stops a running siren when switching to gentle', async () => {
    const { sfx, engine } = await setup();
    sfx.setContentIntensity('gentle');
    expect(sfx.handleCue('distant.rumble', 1)).toBe(false);
    sfx.setContentIntensity('standard');
    sfx.handleCue('siren.alert', 1);
    expect(engine.limiter.names()).toContain('siren.alert');
    sfx.setContentIntensity('gentle');
    expect(engine.limiter.names()).not.toContain('siren.alert');
  });
});

describe('SfxPlayer', () => {
  it('plays every one-shot and loop in the library without throwing', async () => {
    const { sfx, fake } = await setup(200);
    for (const name of Object.keys(CUES)) {
      fake.currentTime += 0.1;
      expect(() => sfx.handleCue(name, 0.8)).not.toThrow();
    }
    for (const bed of [...Object.keys(BEDS), 'none']) expect(() => sfx.handleCue('ambience.' + bed)).not.toThrow();
    expect(sfx.unknown.size).toBe(0);
  });

  it('records unknown cues instead of throwing', async () => {
    const { sfx } = await setup();
    expect(sfx.handleCue('nope')).toBe(false);
    expect(sfx.unknown.has('nope')).toBe(true);
  });

  it('plays nothing while the context is not running', async () => {
    const { sfx, fake } = await setup();
    await fake.suspend();
    await flush();
    // engine wants running, so it resumes; force a manual suspended state to check the guard
    fake.state = 'suspended';
    expect(sfx.handleCue('ui.confirm')).toBe(false);
  });

  it('caps simultaneous voices', async () => {
    const { sfx, engine } = await setup(3);
    for (let i = 0; i < 12; i++) sfx.handleCue('footsteps.sand', 1);
    expect(engine.limiter.active).toBeLessThanOrEqual(3);
  });

  it('keeps UI sounds when the limiter is full of lower-priority steps', async () => {
    const { sfx, engine } = await setup(2);
    sfx.handleCue('footsteps.sand', 1);
    sfx.handleCue('footsteps.sand', 1);
    expect(sfx.handleCue('ui.confirm', 1)).toBe(true);
    expect(engine.limiter.names()).toContain('ui.confirm');
  });

  it('runs sustained cues until intensity is 0 and updates pitch with speed', async () => {
    const { sfx, fake, engine } = await setup();
    expect(sfx.handleCue('engine.truck', 0.2)).toBe(true);
    expect(sfx.activeLoops()).toEqual(['engine.truck']);
    const saw = fake.oscillators.find((o) => o.type === 'sawtooth');
    const slow = saw?.frequency.target ?? 0;
    sfx.handleCue('engine.truck', 1);
    expect(saw?.frequency.target ?? 0).toBeGreaterThan(slow);
    expect(engine.limiter.names()).toContain('engine.truck');
    sfx.handleCue('engine.truck', 0);
    expect(sfx.activeLoops()).toEqual([]);
    expect(engine.limiter.names()).not.toContain('engine.truck');
  });

  it('crossfades environment beds and clears them with none', async () => {
    const { sfx } = await setup();
    sfx.handleCue('ambience.sea');
    const first = sfx.activeLoops().sort();
    expect(first).toEqual(['bed:sea', 'bed:wind']);
    sfx.handleCue('ambience.desert');
    expect(sfx.activeLoops().sort()).toEqual(['bed:wind']);
    sfx.handleCue('ambience.none');
    expect(sfx.activeLoops()).toEqual([]);
  });

  it('remembers a bed requested before audio runs', async () => {
    const fake = new FakeAudioContext();
    const engine = new AudioEngine({ createContext: () => asAudioContext(fake) });
    engines.push(engine);
    const sfx = new SfxPlayer(engine);
    sfx.handleCue('ambience.village');
    expect(sfx.currentBed).toBe('village');
    engine.unlock();
    await flush();
    sfx.tick(0);
    expect(sfx.activeLoops().length).toBeGreaterThan(0);
  });

  it('has a Hebrew label for every cue', () => {
    const dict = HEBREW as Record<string, string>;
    for (const name of allCueNames()) expect(dict['audio.cue.' + name], name).toBeTruthy();
  });
});
