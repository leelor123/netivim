import * as THREE from 'three';
import { EventBus } from './core/events';
import { GameFlow } from './core/flow';
import type { GameEvents } from './core/gameEvents';
import { GameLoop } from './core/loop';
import { InputManager } from './core/input/inputManager';
import { createInputSources } from './core/input/nativePad';
import type { GamepadLike } from './core/input/gamepad';
import { indexedDbStore } from './core/save/backends/indexedDbStore';
import { preferencesStore } from './core/save/backends/preferencesStore';
import { bindExitTriggers } from './core/save/lifecycle';
import { SaveManager } from './core/save/saveManager';
import { createNewSave, type SaveData } from './core/save/schema';
import { localStorageStore, MemoryStore, type AsyncStore, type SyncStore } from './core/save/stores';
import { bindAndroidBackButton, bindAndroidPause, isAndroidApp } from './platform/android';
import { SceneManager } from './render/sceneManager';
import { createTitleScene } from './scene/titleScene';
import type { I18n } from './core/i18n';
import { SettingsManager } from './core/settings';

export interface Game {
  readonly bus: EventBus<GameEvents>;
  readonly flow: GameFlow;
  readonly input: InputManager;
  readonly save: SaveManager;
  readonly loop: GameLoop;
  readonly settings: SettingsManager;
  readonly i18n: I18n;
  readonly renderer: THREE.WebGLRenderer;
  readonly scenes: SceneManager;
  /** Per-step hooks for systems installed after boot (UI, audio, missions). */
  onStep(fn: (dt: number) => void): () => void;
  /**
   * Per-frame hooks that also run while paused (input is updated first when paused).
   * The UI uses this to drive menus; the core never resumes the game by itself.
   */
  onFrame(fn: (dt: number, paused: boolean) => void): () => void;
  /** Who handles the Android Back button (the UI). Without a handler Back toggles pause. */
  setBackHandler(fn: (() => void) | null): void;
  getState(): SaveData;
  setState(s: SaveData): void;
}

function primaryStore(): SyncStore {
  try {
    const ls = window.localStorage;
    const probe = 'netivim:probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return localStorageStore(ls);
  } catch {
    // Storage blocked: keep playing; mirrors (if any) still persist.
    return new MemoryStore();
  }
}

function mirrorStores(): AsyncStore[] {
  const out: AsyncStore[] = [];
  if (typeof indexedDB !== 'undefined') out.push(indexedDbStore(indexedDB));
  if (isAndroidApp()) out.push(preferencesStore());
  return out;
}

function readGamepads(): readonly (GamepadLike | null)[] {
  return typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
}

/** Composition root: creates every core system and connects them through the event bus. */
export function startGame(canvas: HTMLCanvasElement, i18n: I18n, onPauseChanged: (paused: boolean) => void): Game {
  const bus = new EventBus<GameEvents>((event, error) => {
    console.error('[netivim] handler failed for ' + event, error);
  });
  const flow = new GameFlow(bus);
  // WebView gamepads first; the native Android bridge only fills in when the WebView sees none.
  const input = new InputManager(bus, createInputSources(readGamepads));
  input.attach(window);

  const primary = primaryStore();
  const settings = new SettingsManager(bus, primary);
  // Remapped buttons (BRIEF 7) take effect immediately and after every change.
  input.setBindings(settings.value.controls.bindings);
  bus.on('settings:changed', ({ key }) => {
    if (key === 'controls') input.setBindings(settings.value.controls.bindings);
  });
  let state: SaveData = createNewSave(Date.now());
  const save = new SaveManager({
    bus,
    primary,
    mirrors: mirrorStores(),
    now: () => Date.now(),
    snapshot: () => state,
    isVolatile: () => flow.isVolatile,
  });
  bus.on('flow:changed', () => save.onFlowChanged());
  bindExitTriggers(window, document, (trigger) => save.onExit(trigger));
  void bindAndroidPause((trigger) => save.onExit(trigger));

  // UI mode follows the last device used; CSS hides every [data-touch-ui] element on gamepad.
  bus.on('input:device-changed', ({ device, family }) => {
    document.documentElement.dataset.input = device;
    document.documentElement.dataset.padFamily = family ?? '';
  });
  // BRIEF 7: a controller lost mid-play pauses the game; reconnecting resumes it, but only if
  // that disconnect is what paused it.
  let pausedByDisconnect = false;
  bus.on('input:gamepad-lost', () => {
    if (flow.isVolatile && !flow.paused) {
      flow.setPaused(true);
      pausedByDisconnect = true;
    }
  });
  bus.on('input:gamepad-connected', () => {
    if (pausedByDisconnect && flow.paused) flow.setPaused(false);
    pausedByDisconnect = false;
  });
  bus.on('flow:pause-changed', ({ paused }) => {
    if (!paused) pausedByDisconnect = false;
  });
  bus.on('flow:pause-changed', ({ paused }) => onPauseChanged(paused));
  let backHandler: (() => void) | null = null;
  void bindAndroidBackButton(() => {
    if (backHandler) backHandler();
    else flow.setPaused(!flow.paused);
  });

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scenes = new SceneManager();
  scenes.switchTo(createTitleScene());
  let elapsed = 0;
  const stepHooks = new Set<(dt: number) => void>();
  const frameHooks = new Set<(dt: number, paused: boolean) => void>();

  const loop = new GameLoop({
    step: (dt) => {
      input.update();
      // Pausing is core behavior; resuming belongs to the pause screen (UI).
      if (input.justPressed('pause')) flow.setPaused(true);
      elapsed += dt;
      scenes.update(dt, elapsed);
      for (const fn of stepHooks) fn(dt);
    },
  });

  const resize = (): void => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    scenes.resize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', resize);
  resize();

  const timer = new THREE.Timer();
  timer.connect(document);
  const frame = (): void => {
    timer.update();
    const dt = timer.getDelta();
    const paused = flow.paused;
    // While paused the simulation stops, but input is still read so menus keep working.
    if (paused) input.update();
    for (const fn of frameHooks) fn(dt, paused);
    loop.paused = flow.paused;
    loop.advance(dt);
    const active = scenes.active;
    if (active) renderer.render(active.scene, active.camera);
  };
  renderer.setAnimationLoop(frame);
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    renderer.setAnimationLoop(null);
  });
  canvas.addEventListener('webglcontextrestored', () => renderer.setAnimationLoop(frame));

  // Saves stay locked (markReady) until the real save is loaded, so an exit during boot can
  // never overwrite it with the blank initial state. Boot always continues, even on failure.
  void save
    .hydrateFromMirrors()
    .catch((error: unknown) => {
      bus.emit('save:failed', { slot: 'auto', reason: 'hydrate', error: String(error) });
    })
    .finally(() => {
      const loaded = save.loadNewest();
      if (loaded) state = loaded.data;
      save.markReady();
      flow.send('ready');
    });

  return {
    bus,
    flow,
    input,
    save,
    loop,
    settings,
    i18n,
    renderer,
    scenes,
    onStep: (fn) => {
      stepHooks.add(fn);
      return () => stepHooks.delete(fn);
    },
    onFrame: (fn) => {
      frameHooks.add(fn);
      return () => frameHooks.delete(fn);
    },
    setBackHandler: (fn) => {
      backHandler = fn;
    },
    getState: () => state,
    setState: (s) => {
      state = s;
    },
  };
}
