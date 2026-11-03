import './style.css';
import { HEBREW } from './locales';
import { createI18n } from './core/i18n';
import { hasWebGL2 } from './core/webgl';
import { startGame, type Game } from './game';
import { installCinematics } from './cinematics';
import { installHaptics } from './core/input/haptics';
import { installTouchControls } from './ui/touch/touchControls';

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
  const ui = document.getElementById('ui') as HTMLElement;
  ui.append(
    el('h1', 'title', i18n.t('app.title')),
    el('p', 'subtitle', i18n.t('app.subtitle')),
    el('p', 'meta', i18n.t('app.version', { version: __APP_VERSION__ })),
  );

  // Minimal pause screen; the full pause menu (slots, settings, exit prompt) arrives in M2.
  const pause = el('div', 'overlay');
  pause.hidden = true;
  pause.setAttribute('role', 'dialog');
  pause.setAttribute('aria-modal', 'true');
  const panel = el('div', 'pause-panel');
  const resumeBtn = el('button', 'btn btn-primary', i18n.t('pause.resume'));
  const saveBtn = el('button', 'btn', i18n.t('pause.save'));
  const status = el('p', 'meta');
  status.setAttribute('role', 'status');
  panel.append(el('p', 'pause-title', i18n.t('pause.title')), resumeBtn, saveBtn, status, el('p', 'meta', i18n.t('pause.hint')));
  pause.append(panel);
  document.body.append(pause);

  const game = startGame(canvas, i18n, (paused) => {
    pause.hidden = !paused;
    status.textContent = '';
    if (paused) resumeBtn.focus();
  });
  resumeBtn.addEventListener('click', () => game.flow.setPaused(false));
  saveBtn.addEventListener('click', () => {
    status.textContent = i18n.t(game.save.saveManual('manual-1') ? 'pause.saved' : 'pause.saveFailed');
  });
  // SYSTEM INSTALLS (one line per system; see docs/CONTRACTS.md section 11)
  installCinematics(game);
  installTouchControls(game);
  installHaptics(game);
  // END SYSTEM INSTALLS
  if (import.meta.env.VITE_TEST_HOOKS === '1') window.__netivim = game;
}

if (hasWebGL2()) {
  boot();
} else {
  showFatal('error.noWebgl2');
}
