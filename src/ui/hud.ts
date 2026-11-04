import type { Game } from '../game';
import { h } from './dom';
import { ToastGate, toastPlacement } from './toastGate';

const TOAST_MS = 2600;

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

/**
 * HUD layer: "unsaved progress" chip (save:dirty-changed), manual Save during missions
 * (BRIEF 8.C), a touch pause button, and the toast status region (save:written / save:failed).
 */
export function createHud(game: Game, onSave: () => void, onPause: () => void): Hud {
  const { t } = game.i18n;
  const unsaved = h('span', { class: 'nv-chip nv-chip--unsaved', text: t('ui.hud.unsaved') });
  unsaved.hidden = !game.save.dirty;
  const save = h('button', { class: 'nv-hudbtn', text: t('ui.hud.save'), attrs: { type: 'button' } });
  save.dataset.touchUi = '';
  save.addEventListener('click', onSave);
  const pause = h('button', { class: 'nv-hudbtn nv-hudbtn--icon', attrs: { type: 'button', 'aria-label': t('ui.hud.pause') } }, h('span', { class: 'nv-pauseicon', attrs: { 'aria-hidden': 'true' } }));
  pause.dataset.touchUi = '';
  pause.addEventListener('click', onPause);
  const bar = h('div', { class: 'nv-hud__bar' }, unsaved, save, pause);
  bar.hidden = true;

  const toastEl = h('div', { class: 'nv-toast', attrs: { role: 'status', 'aria-live': 'polite' } });
  const el = h('div', { class: 'nv-hud' }, bar);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const gate = new ToastGate(({ text, tone }) => hud.toast(text, tone));

  const offs = [
    game.bus.on('save:dirty-changed', ({ dirty }) => {
      unsaved.hidden = !dirty;
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
      toastEl.textContent = text;
      toastEl.dataset.tone = tone;
      toastEl.dataset.place = toastPlacement(gate.isMenuOpen);
      toastEl.classList.add('is-shown');
      toastTimer = setTimeout(() => {
        toastEl.classList.remove('is-shown');
        toastEl.textContent = '';
      }, TOAST_MS);
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
      for (const off of offs) off();
      toastEl.remove();
      el.remove();
    },
  };
  return hud;
}
