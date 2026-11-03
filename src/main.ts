import './style.css';
import { HEBREW } from './locales';
import { createI18n } from './core/i18n';
import { hasWebGL2 } from './core/webgl';
import { startGame, type Game } from './game';
import { installUI } from './ui/install';

declare global {
  interface Window {
    /** E2E test hook; only present in builds made with VITE_TEST_HOOKS=1. */
    __netivim?: Game;
  }
}

const i18n = createI18n('he', HEBREW);
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
  // Menus, pause and HUD are installed by the UI system below (src/ui/install.ts).
  const game = startGame(canvas, i18n, () => undefined);
  // SYSTEM INSTALLS (one line per system; see docs/CONTRACTS.md section 11)
  installUI(game);
  // END SYSTEM INSTALLS
  if (import.meta.env.VITE_TEST_HOOKS === '1') window.__netivim = game;
}

if (hasWebGL2()) {
  boot();
} else {
  showFatal('error.noWebgl2');
}
