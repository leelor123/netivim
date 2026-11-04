import { Capacitor, registerPlugin } from '@capacitor/core';
import { browserSpeech, webSpeechBackend, type SpeechBackend } from '../audio/narration';
import { NATIVE_TTS_PLUGIN, nativeSpeechBackend, type NativeTtsPlugin } from './nativeTts';

export interface SpeechPlatform {
  isNativePlatform(): boolean;
  isPluginAvailable(name: string): boolean;
  nativePlugin(): NativeTtsPlugin;
  web(): SpeechBackend;
}

/**
 * The Android WebView has no Web Speech synthesis, so the app speaks through the native TTS
 * plugin when it runs natively and the plugin is registered; everywhere else (browser, dev,
 * tests) it uses speechSynthesis.
 */
export function selectSpeechBackend(p: SpeechPlatform): SpeechBackend {
  if (p.isNativePlatform() && p.isPluginAvailable(NATIVE_TTS_PLUGIN)) return nativeSpeechBackend(p.nativePlugin());
  return p.web();
}

const realPlatform: SpeechPlatform = {
  isNativePlatform: () => Capacitor.isNativePlatform(),
  isPluginAvailable: (name) => Capacitor.isPluginAvailable(name),
  nativePlugin: () => registerPlugin<NativeTtsPlugin>(NATIVE_TTS_PLUGIN),
  web: () => {
    const s = browserSpeech();
    return webSpeechBackend(s.synth, s.createUtterance);
  },
};

let shared: SpeechBackend | null = null;

/** One backend per app, shared by the Narrator and the audio settings' voice hint. */
export function sharedSpeechBackend(): SpeechBackend {
  shared ??= selectSpeechBackend(realPlatform);
  return shared;
}
