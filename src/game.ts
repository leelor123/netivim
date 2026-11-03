import * as THREE from 'three';
import { EventBus } from './core/events';
import { GameFlow } from './core/flow';
import type { GameEvents } from './core/gameEvents';
import { GameLoop } from './core/loop';
import { InputManager } from './core/input/inputManager';
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

export interface Game {
  readonly bus: EventBus<GameEvents>;
  readonly flow: GameFlow;
  readonly input: InputManager;
  readonly save: SaveManager;
  readonly loop: GameLoop;
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
export function startGame(canvas: HTMLCanvasElement, onPauseChanged: (paused: boolean) => void): Game {
  const bus = new EventBus<GameEvents>((event, error) => {
    console.error('[netivim] handler failed for ' + event, error);
  });
  const flow = new GameFlow(bus);
  const input = new InputManager(bus, { getGamepads: readGamepads });
  input.attach(window);

  let state: SaveData = createNewSave(Date.now());
  const save = new SaveManager({
    bus,
    primary: primaryStore(),
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
  // BRIEF 7: a controller lost mid-play pauses the game.
  bus.on('input:gamepad-lost', () => {
    if (flow.isVolatile) flow.setPaused(true);
  });
  bus.on('flow:pause-changed', ({ paused }) => onPauseChanged(paused));
  void bindAndroidBackButton(() => flow.setPaused(!flow.paused));

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scenes = new SceneManager();
  scenes.switchTo(createTitleScene());
  let elapsed = 0;

  const loop = new GameLoop({
    step: (dt) => {
      input.update();
      if (input.justPressed('pause')) flow.setPaused(!flow.paused);
      elapsed += dt;
      scenes.update(dt, elapsed);
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
    // Input is still read while paused so the pause button can resume.
    if (flow.paused) {
      input.update();
      if (input.justPressed('pause') || input.justPressed('back')) flow.setPaused(false);
    }
    loop.paused = flow.paused;
    loop.advance(timer.getDelta());
    const active = scenes.active;
    if (active) renderer.render(active.scene, active.camera);
  };
  renderer.setAnimationLoop(frame);
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    renderer.setAnimationLoop(null);
  });
  canvas.addEventListener('webglcontextrestored', () => renderer.setAnimationLoop(frame));

  void save.hydrateFromMirrors().then(() => {
    const loaded = save.loadNewest();
    if (loaded) state = loaded.data;
    flow.send('ready');
  });

  return {
    bus,
    flow,
    input,
    save,
    loop,
    getState: () => state,
    setState: (s) => {
      state = s;
    },
  };
}
