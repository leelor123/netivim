import type { SpeechBackend } from '../audio/narration';

const SHOWN_KEY = 'netivim.voiceHintShown';

export interface HintFlagStore {
  get(): boolean;
  set(): void;
}

/** "Hint already shown" flag in localStorage; blocked storage just means it may show again. */
export function localHintFlag(): HintFlagStore {
  return {
    get() {
      try {
        return window.localStorage.getItem(SHOWN_KEY) === '1';
      } catch {
        return false;
      }
    },
    set() {
      try {
        window.localStorage.setItem(SHOWN_KEY, '1');
      } catch {
        // Storage blocked: the hint may appear once more on the next launch.
      }
    },
  };
}

/**
 * One-time, non-blocking hint in the audio settings when the phone has no Hebrew TTS voice.
 * Only for the native backend (the text points to the phone's settings). The first time the
 * check finds no voice the flag is stored; the hint then stays for the rest of that session
 * (tab re-renders) and never shows on later launches.
 */
export class VoiceHint {
  private showing = false;

  constructor(
    private readonly backend: () => SpeechBackend,
    private readonly flag: HintFlagStore,
  ) {}

  /** Fills `el` (kept hidden otherwise) with `text` when the hint applies. Never throws. */
  attach(el: HTMLElement, text: string): void {
    el.hidden = true;
    const show = (): void => {
      el.textContent = text;
      el.hidden = false;
    };
    if (this.showing) {
      show();
      return;
    }
    try {
      if (this.flag.get()) return;
      const backend = this.backend();
      if (backend.kind !== 'native') return;
      backend
        .checkVoice()
        .then((ok) => {
          if (ok) return;
          if (!this.showing) {
            this.showing = true;
            this.flag.set();
          }
          show();
        })
        .catch(() => undefined);
    } catch {
      // The hint is optional; settings must open regardless.
    }
  }
}
