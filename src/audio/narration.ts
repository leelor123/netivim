import type { I18n } from '../core/i18n';
import { clamp } from './util';

/** The slice of SpeechSynthesis we use (lets tests inject a fake). */
export interface SpeechLike {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
}

/** One line for a speech backend. Volume 0..1; rate 1 = normal. */
export interface SpeakRequest {
  readonly text: string;
  readonly rate: number;
  readonly volume: number;
}

/** Lifecycle of one spoken line. onEnd covers done, error and stop. */
export interface SpeechHandlers {
  onStart(): void;
  onEnd(): void;
}

/**
 * Where speech comes from: the browser's speechSynthesis ('web'), the Android TTS engine through
 * the NetivimTts plugin ('native', src/platform/nativeTts.ts), or nothing ('none').
 */
export interface SpeechBackend {
  readonly kind: 'web' | 'native' | 'none';
  /** Best current knowledge; may be false until an async check has finished. */
  hasVoice(): boolean;
  /** Asks the platform again (the player may have installed a voice) and resolves the answer. */
  checkVoice(): Promise<boolean>;
  /** Starts speaking `req`, replacing anything queued. May throw; the Narrator catches. */
  speak(req: SpeakRequest, handlers: SpeechHandlers): void;
  /** Stops at once. Late events of the stopped line may still arrive. */
  cancel(): void;
}

interface NarratorCommon {
  i18n: I18n;
  /** Live settings: voice on/off and the narration / master levels. */
  getLevels(): { voice: boolean; narration: number; master: number };
  /** Called when speech starts or ends (used to duck the music). */
  onSpeaking?(speaking: boolean): void;
}

/** Either a ready backend, or the raw SpeechSynthesis pieces (wrapped in a web backend). */
export type NarratorDeps = NarratorCommon &
  (
    | { backend: SpeechBackend }
    | {
        /** Null when the platform has no SpeechSynthesis. */
        synth: SpeechLike | null;
        createUtterance: ((text: string) => SpeechSynthesisUtterance) | null;
      }
  );

function normalizeLang(lang: string): string {
  return lang.replace('_', '-').toLowerCase();
}

/** Prefers he-IL, then any Hebrew voice (he, iw); local voices beat network ones. Null if none. */
export function pickHebrewVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = 0;
  for (const v of voices) {
    const lang = normalizeLang(v.lang ?? '');
    let score = 0;
    if (lang === 'he-il') score = 3;
    else if (lang === 'he' || lang.startsWith('he-')) score = 2;
    else if (lang === 'iw' || lang.startsWith('iw-')) score = 1;
    if (score === 0) continue;
    if (v.localService) score += 0.5;
    if (v.default) score += 0.1;
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}

/** Speech through the browser's SpeechSynthesis. With no synth it is a silent 'none' backend. */
export function webSpeechBackend(
  synth: SpeechLike | null,
  createUtterance: ((text: string) => SpeechSynthesisUtterance) | null,
): SpeechBackend {
  const hasVoice = (): boolean => {
    try {
      return synth ? pickHebrewVoice(synth.getVoices()) !== null : false;
    } catch {
      return false;
    }
  };
  return {
    kind: synth && createUtterance ? 'web' : 'none',
    hasVoice,
    checkVoice: () => Promise.resolve(hasVoice()),
    speak(req, handlers) {
      if (!synth || !createUtterance) return;
      const voice = pickHebrewVoice(synth.getVoices());
      if (!voice) return;
      const u = createUtterance(req.text);
      u.lang = 'he-IL';
      u.voice = voice;
      u.volume = req.volume;
      u.rate = req.rate;
      u.onstart = () => handlers.onStart();
      u.onend = () => handlers.onEnd();
      u.onerror = () => handlers.onEnd();
      synth.speak(u);
    },
    cancel() {
      synth?.cancel();
    },
  };
}

/**
 * Speaks subtitle lines in Hebrew when a Hebrew voice exists. With no voice (or no speech
 * backend at all) it stays silent; subtitles are shown by the UI regardless.
 */
export class Narrator {
  private speaking = false;
  private failsafe: ReturnType<typeof setTimeout> | null = null;
  /** Token of the line whose events may change state; null when nothing is queued or speaking. */
  private current: object | null = null;
  private readonly backend: SpeechBackend;

  constructor(private readonly deps: NarratorDeps) {
    this.backend = 'backend' in deps ? deps.backend : webSpeechBackend(deps.synth, deps.createUtterance);
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Which platform speaks ('none' when there is no speech at all). */
  get backendKind(): SpeechBackend['kind'] {
    return this.backend.kind;
  }

  /** Whether a Hebrew voice is currently available. */
  get hasVoice(): boolean {
    try {
      return this.backend.hasVoice();
    } catch {
      return false;
    }
  }

  onSubtitle(p: { textKey: string; voice: boolean }): void {
    const { i18n } = this.deps;
    if (!p.voice) return;
    const levels = this.deps.getLevels();
    if (!levels.voice) return;
    const volume = clamp(levels.narration * levels.master, 0, 1);
    if (volume <= 0 || !i18n.has(p.textKey)) return;
    try {
      if (!this.backend.hasVoice()) return;
      const text = i18n.t(p.textKey);
      this.cancel();
      // Stopping delivers the previous line's end / error asynchronously, often after this one
      // started: every handler acts only while its line is the current one.
      const token = {};
      this.current = token;
      this.backend.speak(
        { text, rate: 0.95, volume },
        {
          onStart: () => {
            if (this.current !== token) return;
            // Armed on start (not on speak) so a slow engine start does not eat into the estimate.
            // Some engines never report the end; this releases the ducking after a generous estimate.
            this.clearFailsafe();
            this.failsafe = setTimeout(() => {
              if (this.current === token) this.setSpeaking(false);
            }, Math.max(3000, text.length * 110 + 2000));
            this.setSpeaking(true);
          },
          onEnd: () => this.finish(token),
        },
      );
    } catch {
      this.current = null;
      this.setSpeaking(false);
    }
  }

  /** Stops speech immediately (subtitle:clear, pause, app hidden, voice switched off). */
  cancel(): void {
    // Cleared first: the cancelled line's late events must find it is no longer current.
    this.current = null;
    try {
      this.backend.cancel();
    } catch {
      // Cancelling must never throw into the game.
    }
    this.setSpeaking(false);
  }

  /** End of the line `token`; ignored unless it is still the current line. */
  private finish(token: object): void {
    if (this.current !== token) return;
    this.current = null;
    this.setSpeaking(false);
  }

  private clearFailsafe(): void {
    if (this.failsafe !== null) {
      clearTimeout(this.failsafe);
      this.failsafe = null;
    }
  }

  private setSpeaking(v: boolean): void {
    if (!v) this.clearFailsafe();
    if (this.speaking === v) return;
    this.speaking = v;
    this.deps.onSpeaking?.(v);
  }
}

/** Builds the real dependencies from the browser, tolerating a missing SpeechSynthesis. */
export function browserSpeech(): { synth: SpeechLike | null; createUtterance: ((text: string) => SpeechSynthesisUtterance) | null } {
  const g = globalThis as { speechSynthesis?: SpeechSynthesis; SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance };
  if (!g.speechSynthesis || typeof g.SpeechSynthesisUtterance !== 'function') return { synth: null, createUtterance: null };
  const Utt = g.SpeechSynthesisUtterance;
  return { synth: g.speechSynthesis, createUtterance: (text) => new Utt(text) };
}
