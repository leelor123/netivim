import type { SpeechBackend, SpeechHandlers } from '../audio/narration';

/** Name under which android/.../NativeTtsPlugin.java registers itself. */
export const NATIVE_TTS_PLUGIN = 'NetivimTts';

export type NativeTtsEvent = 'start' | 'done' | 'error';

export interface NativeTtsListenerHandle {
  remove(): Promise<void>;
}

/** JS face of NativeTtsPlugin (android.speech.tts.TextToSpeech, offline Hebrew voices only). */
export interface NativeTtsPlugin {
  /** Resolves once the engine finished starting. available: an offline Hebrew voice is installed. */
  isAvailable(): Promise<{ available: boolean; ready?: boolean }>;
  /** Rejects when the engine is not ready or there is no voice; nothing is queued for later. */
  speak(options: { text: string; rate: number; volume: number; id: string }): Promise<void>;
  stop(): Promise<void>;
  addListener(event: NativeTtsEvent, listener: (e: { id?: string }) => void): Promise<NativeTtsListenerHandle>;
}

/**
 * Speech backend over the native plugin. Engine events carry the utterance id; an event whose
 * id is not the live one (a stopped or replaced line) is dropped here, and the Narrator's own
 * current-line guard drops anything that still slips through.
 */
export function nativeSpeechBackend(plugin: NativeTtsPlugin): SpeechBackend {
  let available = false;
  let seq = 0;
  const live = new Map<string, SpeechHandlers>();

  const end = (id: string): void => {
    const h = live.get(id);
    if (!h) return;
    live.delete(id);
    h.onEnd();
  };
  const listen = (event: NativeTtsEvent, fn: (id: string) => void): void => {
    try {
      plugin.addListener(event, (e) => fn(typeof e.id === 'string' ? e.id : '')).catch(() => undefined);
    } catch {
      // A missing listener only costs the end event; the Narrator's failsafe covers it.
    }
  };
  listen('start', (id) => live.get(id)?.onStart());
  listen('done', end);
  listen('error', end);

  const checkVoice = async (): Promise<boolean> => {
    try {
      const r = await plugin.isAvailable();
      available = r.available === true;
    } catch {
      available = false;
    }
    return available;
  };
  void checkVoice();

  return {
    kind: 'native',
    hasVoice: () => available,
    checkVoice,
    speak(req, handlers) {
      seq += 1;
      const id = 'nv-' + String(seq);
      // The engine flushes the previous line; its late "done" finds no handlers.
      live.clear();
      live.set(id, handlers);
      plugin.speak({ text: req.text, rate: req.rate, volume: req.volume, id }).catch(() => {
        end(id);
        // Not ready or the voice went away: re-ask so the next line does not try in vain.
        void checkVoice();
      });
    },
    cancel() {
      live.clear();
      plugin.stop().catch(() => undefined);
    },
  };
}
