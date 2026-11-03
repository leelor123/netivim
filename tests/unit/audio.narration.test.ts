import { describe, expect, it, vi } from 'vitest';
import { createI18n } from '../../src/core/i18n';
import { Narrator, pickHebrewVoice, type SpeechLike } from '../../src/audio/narration';

function voice(lang: string, extra: Partial<SpeechSynthesisVoice> = {}): SpeechSynthesisVoice {
  return { lang, name: lang, default: false, localService: false, voiceURI: lang, ...extra } as SpeechSynthesisVoice;
}

class FakeUtterance {
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  volume = 1;
  rate = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

function setup(voices: SpeechSynthesisVoice[], levels = { voice: true, narration: 0.8, master: 0.5 }) {
  const spoken: FakeUtterance[] = [];
  const synth: SpeechLike = {
    speak: (u) => spoken.push(u as unknown as FakeUtterance),
    cancel: vi.fn(),
    getVoices: () => voices,
  };
  const ducks: boolean[] = [];
  const narrator = new Narrator({
    synth,
    createUtterance: (t) => new FakeUtterance(t) as unknown as SpeechSynthesisUtterance,
    i18n: createI18n('he', { 'line.one': 'שלום עולם' }),
    getLevels: () => levels,
    onSpeaking: (s) => ducks.push(s),
  });
  return { narrator, spoken, synth, ducks, levels };
}

describe('pickHebrewVoice', () => {
  it('returns null when there is no Hebrew voice', () => {
    expect(pickHebrewVoice([voice('en-US'), voice('ar-SA')])).toBeNull();
    expect(pickHebrewVoice([])).toBeNull();
  });

  it('prefers he-IL, accepts underscores and the legacy iw code', () => {
    expect(pickHebrewVoice([voice('iw-IL'), voice('he_IL')])?.lang).toBe('he_IL');
    expect(pickHebrewVoice([voice('en-US'), voice('iw')])?.lang).toBe('iw');
    expect(pickHebrewVoice([voice('he'), voice('he-IL')])?.lang).toBe('he-IL');
  });

  it('prefers an on-device voice over a network one of the same language', () => {
    const net = voice('he-IL', { name: 'net' });
    const local = voice('he-IL', { name: 'local', localService: true });
    expect(pickHebrewVoice([net, local])?.name).toBe('local');
  });
});

describe('Narrator', () => {
  it('speaks the resolved Hebrew text at narration x master volume', () => {
    const { narrator, spoken, ducks } = setup([voice('he-IL')]);
    narrator.onSubtitle({ textKey: 'line.one', voice: true });
    expect(spoken).toHaveLength(1);
    expect(spoken[0]?.text).toBe('שלום עולם');
    expect(spoken[0]?.lang).toBe('he-IL');
    expect(spoken[0]?.volume).toBeCloseTo(0.4);
    spoken[0]?.onstart?.();
    expect(narrator.isSpeaking).toBe(true);
    spoken[0]?.onend?.();
    expect(ducks).toEqual([true, false]);
  });

  it('stays silent without a Hebrew voice', () => {
    const { narrator, spoken } = setup([voice('en-US')]);
    narrator.onSubtitle({ textKey: 'line.one', voice: true });
    expect(spoken).toHaveLength(0);
    expect(narrator.hasVoice).toBe(false);
  });

  it('respects the voice flag, the settings switch, zero volume and unknown keys', () => {
    const a = setup([voice('he-IL')]);
    a.narrator.onSubtitle({ textKey: 'line.one', voice: false });
    a.narrator.onSubtitle({ textKey: 'missing.key', voice: true });
    expect(a.spoken).toHaveLength(0);
    a.levels.voice = false;
    a.narrator.onSubtitle({ textKey: 'line.one', voice: true });
    expect(a.spoken).toHaveLength(0);
    a.levels.voice = true;
    a.levels.narration = 0;
    a.narrator.onSubtitle({ textKey: 'line.one', voice: true });
    expect(a.spoken).toHaveLength(0);
  });

  it('cancels the previous line before speaking and on demand', () => {
    const { narrator, synth, spoken } = setup([voice('he-IL')]);
    narrator.onSubtitle({ textKey: 'line.one', voice: true });
    narrator.onSubtitle({ textKey: 'line.one', voice: true });
    expect(spoken).toHaveLength(2);
    expect(synth.cancel).toHaveBeenCalledTimes(2);
    spoken[1]?.onstart?.();
    narrator.cancel();
    expect(narrator.isSpeaking).toBe(false);
  });

  it('never throws when SpeechSynthesis is missing or misbehaves', () => {
    const missing = new Narrator({
      synth: null,
      createUtterance: null,
      i18n: createI18n('he', { k: 'x' }),
      getLevels: () => ({ voice: true, narration: 1, master: 1 }),
    });
    expect(() => missing.onSubtitle({ textKey: 'k', voice: true })).not.toThrow();
    expect(() => missing.cancel()).not.toThrow();
    expect(missing.hasVoice).toBe(false);

    const broken = new Narrator({
      synth: {
        speak: () => {
          throw new Error('speak failed');
        },
        cancel: () => {
          throw new Error('cancel failed');
        },
        getVoices: () => [voice('he-IL')],
      },
      createUtterance: (t) => new FakeUtterance(t) as unknown as SpeechSynthesisUtterance,
      i18n: createI18n('he', { k: 'x' }),
      getLevels: () => ({ voice: true, narration: 1, master: 1 }),
    });
    expect(() => broken.onSubtitle({ textKey: 'k', voice: true })).not.toThrow();
    expect(() => broken.cancel()).not.toThrow();
  });
});
