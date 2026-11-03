import './style.css';
import he from './locales/he.json';
import { createI18n } from './core/i18n';
import { hasWebGL2 } from './core/webgl';
import { startGame, type Game } from './game';

declare global {
  interface Window {
    /** E2E test hook; only present in builds made with VITE_TEST_HOOKS=1. */
    __netivim?: Game;
  }
}

const i18n = createI18n('he', he);
document.documentElement.lang = i18n.locale;
document.documentElement.dir = i18n.dir;
document.documentElement.dataset.input = 'touch';

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

function boot(): void {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
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

  const game = startGame(canvas, (paused) => {
    pause.hidden = !paused;
  });
  if (import.meta.env.VITE_TEST_HOOKS === '1') window.__netivim = game;
}

if (hasWebGL2()) {
  boot();
} else {
  showFatal('error.noWebgl2');
}
