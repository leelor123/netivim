import type { Game } from '../game';
import { h } from './dom';
import { ToastGate, toastPlacement } from './toastGate';

const TOAST_MS = 2600;
/** A warning stays at least this long, then until the next input (so it cannot vanish unread). */
const WARN_MIN_MS = 2600;

const padPressed = (): boolean => {
  try {
    for (const p of navigator.getGamepads?.() ?? []) if (p?.buttons.some((b) => b.pressed)) return true;
  } catch {
    /* no gamepad API */
  }
  return false;
};

export interface Hud {
  readonly el: HTMLElement;
  /** The toast status region. Lives in the top layer (above cutscene bars and gameplay sheets). */
  readonly toastEl: HTMLElement;
  /** Shows a short message in the status region (replaces the previous one). */
  toast(text: string, tone?: 'ok' | 'warn'): void;
  setVisible(visible: boolean, inMission: boolean): void;
  /** While a menu is open, notices from other systems wait and toasts move to the top. */
  setMenuOpen(open: boolean): void;
  dispose(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Small line icon built with DOM APIs (no innerHTML). */
function icon(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'nv-hudicon');
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

/**
 * HUD layer in the "system" screen region (src/ui/layout.ts): one small pause icon and, during
 * missions, a manual Save icon (BRIEF 8.C) whose dot is the "unsaved progress" indicator
 * (BRIEF 8.E, save:dirty-changed). Plus the toast status region (save:written / save:failed).
 */
export function createHud(game: Game, onSave: () => void, onPause: () => void): Hud {
  const { t } = game.i18n;
  const dot = h('span', { class: 'nv-hud__dot', attrs: { 'aria-hidden': 'true' } });
  const save = h('button', { class: 'nv-hudbtn nv-hudbtn--save', attrs: { type: 'button' } }, icon(['M5 4h11l3 3v13H5z', 'M8 4v5h7V4', 'M8 20v-6h8v6']), dot);
  // Not touch-only: on a controller it stays as a quiet indicator while progress is unsaved.
  save.addEventListener('click', onSave);
  const syncDirty = (dirty: boolean): void => {
    dot.hidden = !dirty;
    save.classList.toggle('is-dirty', dirty);
    save.setAttribute('aria-label', dirty ? t('ui.hud.save') + ' · ' + t('ui.hud.unsaved') : t('ui.hud.save'));
  };
  syncDirty(game.save.dirty);
  const pause = h('button', { class: 'nv-hudbtn nv-hudbtn--icon', attrs: { type: 'button', 'aria-label': t('ui.hud.pause') } }, h('span', { class: 'nv-pauseicon', attrs: { 'aria-hidden': 'true' } }));
  pause.dataset.touchUi = '';
  pause.addEventListener('click', onPause);
  // Physical order (pause at the screen corner) regardless of the text direction.
  const bar = h('div', { class: 'nv-hud__bar', attrs: { dir: 'ltr' } }, pause, save);
  bar.hidden = true;

  const toastText = h('span', { class: 'nv-toast__text' });
  const toastEl = h('div', { class: 'nv-toast', attrs: { role: 'status', 'aria-live': 'polite' } }, toastText);
  const el = h('div', { class: 'nv-hud' }, bar);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let warnPoll: ReturnType<typeof setInterval> | undefined;
  let stopWarn: (() => void) | undefined;
  const hide = (): void => {
    stopWarn?.();
    toastEl.classList.remove('is-shown');
    toastText.textContent = '';
  };
  const gate = new ToastGate(({ text, tone }) => hud.toast(text, tone));

  const offs = [
    game.bus.on('save:dirty-changed', ({ dirty }) => {
      syncDirty(dirty);
    }),
    game.bus.on('save:written', ({ reason }) => {
      if (reason.startsWith('exit:')) return;
      gate.request(t(reason === 'manual' ? 'ui.toast.saved' : 'ui.toast.autosaved'));
    }),
    // Notices from other systems (e.g. graphics quality changes).
    game.bus.on('ui:toast', ({ textKey, params }) => gate.request(t(textKey, params), 'ok', true)),
    game.bus.on('save:failed', ({ reason }) => {
      // Mirror and hydrate problems are recovered silently; the primary write failing is not.
      if (reason.startsWith('mirror:') || reason === 'hydrate') return;
      hud.toast(t('ui.toast.failed'), 'warn');
    }),
  ];

  const hud: Hud = {
    el,
    toastEl,
    toast(text, tone = 'ok') {
      clearTimeout(toastTimer);
      stopWarn?.();
      toastText.textContent = text;
      toastEl.dataset.tone = tone;
      toastEl.dataset.place = toastPlacement(gate.isMenuOpen);
      toastEl.classList.add('is-shown');
      if (tone !== 'warn') {
        toastTimer = setTimeout(hide, TOAST_MS);
        return;
      }
      // Warnings (e.g. save failed) wait for the next key, tap or pad press after a minimum time.
      const shownAt = performance.now();
      const dismiss = (): void => {
        if (performance.now() - shownAt >= WARN_MIN_MS) hide();
      };
      window.addEventListener('keydown', dismiss, true);
      window.addEventListener('pointerdown', dismiss, true);
      warnPoll = setInterval(() => {
        if (padPressed()) dismiss();
      }, 150);
      stopWarn = () => {
        window.removeEventListener('keydown', dismiss, true);
        window.removeEventListener('pointerdown', dismiss, true);
        clearInterval(warnPoll);
        stopWarn = undefined;
      };
    },
    setMenuOpen(open) {
      toastEl.dataset.place = toastPlacement(open);
      gate.setMenuOpen(open);
    },
    setVisible(visible, inMission) {
      bar.hidden = !visible;
      save.hidden = !inMission;
    },
    dispose() {
      clearTimeout(toastTimer);
      stopWarn?.();
      for (const off of offs) off();
      toastEl.remove();
      el.remove();
    },
  };
  return hud;
}
