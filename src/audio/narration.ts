import type { I18n } from '../core/i18n';
import { clamp } from './util';

/** The slice of SpeechSynthesis we use (lets tests inject a fake). */
export interface SpeechLike {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
}

export interface NarratorDeps {
  /** Null when the platform has no SpeechSynthesis. */
  synth: SpeechLike | null;
  createUtterance: ((text: string) => SpeechSynthesisUtterance) | null;
  i18n: I18n;
  /** Live settings: voice on/off and the narration / master levels. */
  getLevels(): { voice: boolean; narration: number; master: number };
  /** Called when speech starts or ends (used to duck the music). */
  onSpeaking?(speaking: boolean): void;
}

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

/**
 * Speaks subtitle lines in Hebrew when a Hebrew voice exists. With no voice (or no
 * SpeechSynthesis at all) it stays silent; subtitles are shown by the UI regardless.
 */
export class Narrator {
  private speaking = false;

  constructor(private readonly deps: NarratorDeps) {}

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Whether a Hebrew voice is currently available. */
  get hasVoice(): boolean {
    try {
      return this.deps.synth ? pickHebrewVoice(this.deps.synth.getVoices()) !== null : false;
    } catch {
      return false;
    }
  }

  onSubtitle(p: { textKey: string; voice: boolean }): void {
    const { synth, createUtterance, i18n } = this.deps;
    if (!p.voice || !synth || !createUtterance) return;
    const levels = this.deps.getLevels();
    if (!levels.voice) return;
    const volume = clamp(levels.narration * levels.master, 0, 1);
    if (volume <= 0 || !i18n.has(p.textKey)) return;
    try {
      const voice = pickHebrewVoice(synth.getVoices());
      if (!voice) return;
      const text = i18n.t(p.textKey);
      this.cancel();
      const u = createUtterance(text);
      u.lang = 'he-IL';
      u.voice = voice;
      u.volume = volume;
      u.rate = 0.95;
      u.onstart = () => this.setSpeaking(true);
      u.onend = () => this.setSpeaking(false);
      u.onerror = () => this.setSpeaking(false);
      synth.speak(u);
    } catch {
      this.setSpeaking(false);
    }
  }

  /** Stops speech immediately (subtitle:clear, pause, app hidden, voice switched off). */
  cancel(): void {
    try {
      this.deps.synth?.cancel();
    } catch {
      // Cancelling must never throw into the game.
    }
    this.setSpeaking(false);
  }

  private setSpeaking(v: boolean): void {
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
