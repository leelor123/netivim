import { afterEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from '../../src/core/i18n';
import { Narrator, webSpeechBackend, type SpeechBackend } from '../../src/audio/narration';
import { nativeSpeechBackend, type NativeTtsEvent, type NativeTtsPlugin } from '../../src/platform/nativeTts';
import { selectSpeechBackend, type SpeechPlatform } from '../../src/platform/speech';
import { VoiceHint, type HintFlagStore } from '../../src/ui/voiceHint';

/** In-memory stand-in for android/.../NativeTtsPlugin.java. */
class FakeNativeTts implements NativeTtsPlugin {
  available = true;
  rejectSpeak = false;
  readonly spoken: { text: string; rate: number; volume: number; id: string }[] = [];
  stops = 0;
  checks = 0;
  private readonly listeners = new Map<NativeTtsEvent, ((e: { id?: string }) => void)[]>();

  isAvailable(): Promise<{ available: boolean }> {
    this.checks += 1;
    return Promise.resolve({ available: this.available });
  }
  speak(o: { text: string; rate: number; volume: number; id: string }): Promise<void> {
    this.spoken.push(o);
    return this.rejectSpeak ? Promise.reject(new Error('NO_VOICE')) : Promise.resolve();
  }
  stop(): Promise<void> {
    this.stops += 1;
    return Promise.resolve();
  }
  addListener(event: NativeTtsEvent, fn: (e: { id?: string }) => void): Promise<{ remove(): Promise<void> }> {
    const list = this.listeners.get(event) ?? [];
    list.push(fn);
    this.listeners.set(event, list);
    return Promise.resolve({ remove: () => Promise.resolve() });
  }
  /** Fires a native event as the Java listener would. */
  emit(event: NativeTtsEvent, id: string): void {
    for (const fn of this.listeners.get(event) ?? []) fn({ id });
  }
  idOf(i: number): string {
    const s = this.spoken[i];
    if (!s) throw new Error('nothing spoken at ' + String(i));
    return s.id;
  }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

async function nativeSetup(levels = { voice: true, narration: 0.8, master: 0.5 }) {
  const plugin = new FakeNativeTts();
  const backend = nativeSpeechBackend(plugin);
  await flush(); // initial isAvailable()
  const ducks: boolean[] = [];
  const narrator = new Narrator({
    backend,
    i18n: createI18n('he', { 'line.one': 'שלום עולם', 'line.two': 'שורה שנייה' }),
    getLevels: () => levels,
    onSpeaking: (s) => ducks.push(s),
  });
  return { plugin, backend, narrator, ducks, levels };
}

function platform(over: Partial<SpeechPlatform>, plugin = new FakeNativeTts()): SpeechPlatform & { web: ReturnType<typeof vi.fn> } {
  const web = vi.fn((): SpeechBackend => webSpeechBackend(null, null));
  return { isNativePlatform: () => false, isPluginAvailable: () => false, nativePlugin: () => plugin, ...over, web };
}

describe('selectSpeechBackend', () => {
  it('uses the native plugin only when running natively and the plugin is registered', () => {
    expect(selectSpeechBackend(platform({ isNativePlatform: () => true, isPluginAvailable: (n) => n === 'NetivimTts' })).kind).toBe('native');
  });

  it('falls back to speechSynthesis in the browser or without the plugin', () => {
    const browser = platform({});
    expect(selectSpeechBackend(browser).kind).not.toBe('native');
    expect(browser.web).toHaveBeenCalledTimes(1);
    const noPlugin = platform({ isNativePlatform: () => true });
    expect(selectSpeechBackend(noPlugin).kind).not.toBe('native');
    expect(noPlugin.web).toHaveBeenCalledTimes(1);
  });

  it('reports none for the web backend without SpeechSynthesis', () => {
    expect(webSpeechBackend(null, null).kind).toBe('none');
  });
});

describe('native speech backend', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('learns voice availability from isAvailable()', async () => {
    const plugin = new FakeNativeTts();
    plugin.available = false;
    const backend = nativeSpeechBackend(plugin);
    expect(backend.hasVoice()).toBe(false);
    await flush();
    expect(backend.hasVoice()).toBe(false);
    plugin.available = true;
    expect(await backend.checkVoice()).toBe(true);
    expect(backend.hasVoice()).toBe(true);
  });

  it('speaks with the narration volume, rate and a fresh id; maps start / done to the ducking', async () => {
    const { plugin, narrator, ducks } = await nativeSetup();
    narrator.onSubtitle({ textKey: 'line.one', voice: true });
    expect(plugin.spoken).toHaveLength(1);
    expect(plugin.spoken[0]?.text).toBe('שלום עולם');
    expect(plugin.spoken[0]?.volume).toBeCloseTo(0.4);
    expect(plugin.spoken[0]?.rate).toBeCloseTo(0.95);
    plugin.emit('start', plugin.idOf(0));
    expect(narrator.isSpeaking).toBe(true);
    plugin.emit('done', plugin.idOf(0));
    expect(narrator.isSpeaking).toBe(false);
    expect(ducks).toEqual([true, false]);
  });

  it('maps error to the end of the line', async () => {
    const { plugin, narrator } = await nativeSetup();
    narrator.onSubtitle({ textKey: 'line.one', voice: true });
    plugin.emit('start', plugin.idOf(0));
    plugin.emit('error', plugin.idOf(0));
    expect(narrator.isSpeaking).toBe(false);
  });

  it('ignores stale events of a replaced line', async () => {
    const { plugin, narrator, ducks } = await nativeSetup();
    narrator.onSubtitle({ textKey: 'line.one', voice: true });
    plugin.emit('start', plugin.idOf(0));
    narrator.onSubtitle({ textKey: 'line.two', voice: true });
    expect(plugin.idOf(1)).not.toBe(plugin.idOf(0));
    plugin.emit('start', plugin.idOf(1));
    // The flushed first line reports its end only now.
    plugin.emit('done', plugin.idOf(0));
    plugin.emit('error', plugin.idOf(0));
    plugin.emit('start', plugin.idOf(0));
    expect(narrator.isSpeaking).toBe(true);
    expect(ducks).toEqual([true, false, true]);
    plugin.emit('done', plugin.idOf(1));
    expect(ducks).toEqual([true, false, true, false]);
  });

  it('ignores events after cancel() and stops the engine', async () => {
    const { plugin, narrator, ducks } = await nativeSetup();
    narrator.onSubtitle({ textKey: 'line.one', voice: true });
    const stopsBefore = plugin.stops;
    narrator.cancel();
    expect(plugin.stops).toBe(stopsBefore + 1);
    plugin.emit('start', plugin.idOf(0));
    plugin.emit('done', plugin.idOf(0));
    expect(narrator.isSpeaking).toBe(false);
    expect(ducks).toEqual([]);
  });

  it('ignores events with unknown or missing ids', async () => {
    const { plugin, narrator } = await nativeSetup();
    narrator.onSubtitle({ textKey: 'line.one', voice: true });
    plugin.emit('start', plugin.idOf(0));
    plugin.emit('done', 'someone-else');
    plugin.emit('done', '');
    expect(narrator.isSpeaking).toBe(true);
  });

  it('arms the failsafe on start, so a missing done still releases the ducking', async () => {
    const { plugin, narrator } = await nativeSetup();
    vi.useFakeTimers();
    narrator.onSubtitle({ textKey: 'line.one', voice: true });
    vi.advanceTimersByTime(20_000);
    plugin.emit('start', plugin.idOf(0));
    vi.advanceTimersByTime(1_000);
    expect(narrator.isSpeaking).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(narrator.isSpeaking).toBe(false);
  });

  it('honours audio.voice and the narration level, and stays silent without a voice', async () => {
    const a = await nativeSetup();
    a.levels.voice = false;
    a.narrator.onSubtitle({ textKey: 'line.one', voice: true });
    a.levels.voice = true;
    a.levels.narration = 0;
    a.narrator.onSubtitle({ textKey: 'line.one', voice: true });
    expect(a.plugin.spoken).toHaveLength(0);

    const b = await nativeSetup();
    b.plugin.available = false;
    await b.backend.checkVoice();
    b.narrator.onSubtitle({ textKey: 'line.one', voice: true });
    expect(b.plugin.spoken).toHaveLength(0);
    expect(b.narrator.hasVoice).toBe(false);
  });

  it('a rejected speak ends the line and re-checks availability', async () => {
    const { plugin, narrator } = await nativeSetup();
    plugin.rejectSpeak = true;
    plugin.available = false;
    const checks = plugin.checks;
    narrator.onSubtitle({ textKey: 'line.one', voice: true });
    await flush();
    expect(narrator.isSpeaking).toBe(false);
    expect(plugin.checks).toBe(checks + 1);
    expect(narrator.hasVoice).toBe(false);
  });
});

describe('VoiceHint', () => {
  const memFlag = (): HintFlagStore & { value: boolean } => {
    const f = { value: false, get: () => f.value, set: () => { f.value = true; } };
    return f;
  };
  const el = (): HTMLElement => ({ hidden: false, textContent: '' }) as unknown as HTMLElement;

  it('shows once when the native backend has no Hebrew voice, and stays for the session', async () => {
    const plugin = new FakeNativeTts();
    plugin.available = false;
    const backend = nativeSpeechBackend(plugin);
    const flag = memFlag();
    const hint = new VoiceHint(() => backend, flag);
    const a = el();
    hint.attach(a, 'hint');
    expect(a.hidden).toBe(true);
    await flush();
    expect(a.hidden).toBe(false);
    expect(a.textContent).toBe('hint');
    expect(flag.value).toBe(true);
    // Re-render in the same session: still shown.
    const b = el();
    hint.attach(b, 'hint');
    expect(b.hidden).toBe(false);
    // A later launch (new instance, flag stored): never again.
    const c = el();
    new VoiceHint(() => backend, flag).attach(c, 'hint');
    await flush();
    expect(c.hidden).toBe(true);
  });

  it('stays hidden with a voice, or on the web backend', async () => {
    const plugin = new FakeNativeTts();
    const withVoice = el();
    new VoiceHint(() => nativeSpeechBackend(plugin), memFlag()).attach(withVoice, 'hint');
    await flush();
    expect(withVoice.hidden).toBe(true);
    const web = el();
    new VoiceHint(() => webSpeechBackend(null, null), memFlag()).attach(web, 'hint');
    await flush();
    expect(web.hidden).toBe(true);
  });
});
