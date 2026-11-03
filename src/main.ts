import * as THREE from 'three';
import './style.css';
import he from './locales/he.json';
import { createI18n } from './core/i18n';
import { hasWebGL2 } from './core/webgl';
import { createTitleScene } from './scene/titleScene';
import { bindAndroidBackButton } from './platform/android';

const i18n = createI18n('he', he);
document.documentElement.lang = i18n.locale;
document.documentElement.dir = i18n.dir;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function showFatal(messageKey: string): void {
  const overlay = el('div', 'overlay');
  overlay.setAttribute('role', 'alert');
  overlay.append(el('p', 'fatal', i18n.t(messageKey)));
  document.body.append(overlay);
}

function start(): void {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const title = createTitleScene();
  const timer = new THREE.Timer();
  timer.connect(document);

  ui.append(
    el('h1', 'title', i18n.t('app.title')),
    el('p', 'subtitle', i18n.t('app.subtitle')),
    el('p', 'meta', i18n.t('app.version', { version: __APP_VERSION__ })),
  );

  const pause = el('div', 'overlay');
  pause.hidden = true;
  pause.setAttribute('role', 'dialog');
  pause.append(el('p', '', i18n.t('pause.title')), el('p', 'meta', i18n.t('pause.hint')));
  document.body.append(pause);

  const resize = (): void => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    title.resize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', resize);
  resize();

  const frame = (): void => {
    timer.update();
    if (!pause.hidden) return;
    title.update(timer.getElapsed());
    renderer.render(title.scene, title.camera);
  };
  renderer.setAnimationLoop(frame);

  // three.js rebuilds GPU resources itself on restore; the loop just stops and restarts.
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    renderer.setAnimationLoop(null);
  });
  canvas.addEventListener('webglcontextrestored', () => renderer.setAnimationLoop(frame));

  void bindAndroidBackButton(() => {
    pause.hidden = !pause.hidden;
  });
}

if (hasWebGL2()) {
  start();
} else {
  showFatal('error.noWebgl2');
}
