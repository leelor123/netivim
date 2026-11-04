import type { Game } from '../game';
import { TITLE_CUE } from './cues';
import { AudioEngine, type EngineOptions } from './engine';
import { Narrator } from './narration';
import { sharedSpeechBackend } from '../platform/speech';
import { EraScore } from './score';
import { SfxPlayer } from './sfx';
import { BED_PREFIX } from './cues';

export interface AudioSystem {
  readonly engine: AudioEngine;
  readonly sfx: SfxPlayer;
  readonly score: EraScore;
  readonly narrator: Narrator;
}

declare global {
  /** Present only in test builds (VITE_TEST_HOOKS=1). */
  var __netivimAudio: AudioSystem | undefined;
}

/**
 * Installs the audio system: lazy AudioContext resumed on the first gesture, buses bound to
 * settings, the Era Score, the cue library and Hebrew narration. Returns a disposer.
 */
export function installAudio(game: Game, engineOptions: EngineOptions = {}): () => void {
  const { bus, settings } = game;
  const engine = new AudioEngine(engineOptions);
  const sfx = new SfxPlayer(engine);
  const score = new EraScore(engine);
  const narrator = new Narrator({
    // Native Android TTS in the app (the WebView has no speechSynthesis), speechSynthesis elsewhere.
    backend: sharedSpeechBackend(),
    i18n: game.i18n,
    getLevels: () => ({ voice: settings.value.audio.voice, narration: settings.value.audio.narration, master: settings.value.audio.master }),
    onSpeaking: (speaking) => {
      engine.setDucked(speaking);
      score.setSparse(speaking || captionOn);
    },
  });
  // Captions duck the music lightly even when no Hebrew voice exists; a timer releases the duck
  // if the clear event never arrives.
  let captionOn = false;
  let captionTimer: ReturnType<typeof setTimeout> | null = null;
  const setCaption = (on: boolean, holdMs = 0): void => {
    if (captionTimer !== null) {
      clearTimeout(captionTimer);
      captionTimer = null;
    }
    captionOn = on;
    engine.setCaptionDuck(on);
    score.setSparse(on || narrator.isSpeaking);
    if (on) captionTimer = setTimeout(() => setCaption(false), Math.max(1500, holdMs) + 600);
  };

  engine.applySettings(settings.value.audio);
  sfx.setContentIntensity(settings.value.accessibility.contentIntensity);
  score.setContentIntensity(settings.value.accessibility.contentIntensity);
  engine.setHidden(typeof document !== 'undefined' && document.visibilityState === 'hidden');

  const offs: (() => void)[] = [];
  offs.push(engine.onTick((now) => {
    score.tick(now);
    sfx.tick(now);
  }));
  offs.push(engine.onReady(() => {
    engine.applySettings(settings.value.audio);
    score.apply();
  }));

  // First gesture (touch, mouse, key, or a game controller) unlocks audio.
  const unlock = (): void => {
    engine.unlock();
    if (engine.state === 'running') removeGestureListeners();
  };
  const gestureEvents = ['pointerdown', 'keydown', 'touchend'] as const;
  const removeGestureListeners = (): void => {
    for (const ev of gestureEvents) window.removeEventListener(ev, unlock, true);
  };
  for (const ev of gestureEvents) window.addEventListener(ev, unlock, true);
  offs.push(bus.on('input:device-changed', ({ device }) => {
    if (device === 'gamepad') unlock();
  }));
  offs.push(bus.on('input:gamepad-connected', unlock));

  offs.push(bus.on('audio:cue', ({ cue, intensity }) => {
    if (cue === TITLE_CUE) {
      score.playTitle();
      return;
    }
    sfx.handleCue(cue, intensity);
    if (cue.startsWith(BED_PREFIX)) score.noteBed(cue.slice(BED_PREFIX.length));
  }));
  offs.push(bus.on('audio:mood', ({ mood, era }) => score.setMood(mood, era)));

  offs.push(bus.on('settings:changed', ({ key }) => {
    if (key === 'audio') {
      engine.applySettings(settings.value.audio);
      if (!settings.value.audio.voice) narrator.cancel();
    } else if (key === 'accessibility') {
      sfx.setContentIntensity(settings.value.accessibility.contentIntensity);
      score.setContentIntensity(settings.value.accessibility.contentIntensity);
    }
  }));

  offs.push(bus.on('flow:pause-changed', ({ paused }) => {
    engine.setPaused(paused);
    if (paused) {
      narrator.cancel();
      setCaption(false);
    }
  }));
  // Missions: remember the story's year for the score, and never let a mission's engines or
  // crowds outlive it. Leaving a mission for the debrief settles the music.
  offs.push(bus.on('mission:started', ({ missionId }) => {
    score.startMission(missionId);
    sfx.stopWorldLoops(0.8);
  }));
  offs.push(bus.on('flow:changed', ({ from, to }) => {
    if (from === 'mission' && to !== 'mission') sfx.stopWorldLoops(1.2);
    if (to === 'debrief') score.settleTo('reflective');
  }));
  const onVisibility = (): void => {
    const hidden = document.visibilityState === 'hidden';
    engine.setHidden(hidden);
    if (hidden) {
      narrator.cancel();
      setCaption(false);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  offs.push(bus.on('subtitle:show', (p) => {
    setCaption(true, p.durationMs);
    narrator.onSubtitle(p);
  }));
  offs.push(bus.on('subtitle:clear', () => {
    setCaption(false);
    narrator.cancel();
  }));

  const system: AudioSystem = { engine, sfx, score, narrator };
  if (import.meta.env.VITE_TEST_HOOKS === '1') globalThis.__netivimAudio = system;

  return () => {
    for (const off of offs) off();
    removeGestureListeners();
    document.removeEventListener('visibilitychange', onVisibility);
    narrator.cancel();
    if (captionTimer !== null) clearTimeout(captionTimer);
    score.dispose();
    sfx.stopAll();
    engine.dispose();
    if (globalThis.__netivimAudio === system) globalThis.__netivimAudio = undefined;
  };
}
