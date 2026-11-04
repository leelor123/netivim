import type { Game } from '../game';
import type { FocusManager } from './focusManager';
import type { ScreenManager } from './screenManager';
import type { UiScreen } from './uiScreen';
import { button, type ButtonOptions } from './widgets';
import { h, nextId } from './dom';

/** Everything a screen needs; created once by installUI. */
export interface UiContext {
  readonly game: Game;
  readonly t: Game['i18n']['t'];
  readonly rtl: boolean;
  readonly screens: ScreenManager<UiScreen>;
  readonly focus: FocusManager;
  /** Closes the pause menu and resumes play (resuming is owned by the UI). */
  resume(): void;
  /** Leaves gameplay for the title screen (no prompt; callers decide). */
  exitToTitle(): void;
  formatDateTime(ms: number): string;
}

export interface Panel {
  readonly el: HTMLElement;
  readonly body: HTMLElement;
  readonly header: HTMLElement;
}

/** Paper sheet with a title, an optional back button and a scrolling body. */
export function panel(ctx: UiContext, title: string, opts: { back?: boolean; wide?: boolean; label?: string } = {}): Panel {
  const titleId = nextId('title');
  const header = h('header', { class: 'nv-panel__head' }, h('h2', { class: 'nv-panel__title', text: title, attrs: { id: titleId } }));
  if (opts.back) {
    const back = button(ctx.t('ui.common.back'), () => ctx.screens.back(), { variant: 'quiet', key: 'back' });
    back.classList.add('nv-back');
    header.prepend(back);
  }
  const body = h('div', { class: 'nv-panel__body' });
  const sheet = h('section', { class: 'nv-panel' + (opts.wide ? ' nv-panel--wide' : ''), attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId } }, header, body);
  const el = h('div', { class: 'nv-stage' }, sheet);
  return { el, body, header };
}

export interface DialogAction extends ButtonOptions {
  readonly label: string;
  readonly run: () => void;
}

/** Modal confirmation dialog; the first action gets focus unless `focusIndex` says otherwise. */
export function dialog(id: string, title: string, body: string, actions: readonly DialogAction[], focusIndex = 0): UiScreen {
  const titleId = 'nv-dlg-' + id;
  const buttons = actions.map((a) => button(a.label, a.run, a));
  const card = h(
    'div',
    { class: 'nv-dialog', attrs: { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': titleId } },
    h('h2', { class: 'nv-dialog__title', text: title, attrs: { id: titleId } }),
    body ? h('p', { class: 'nv-dialog__body', text: body }) : null,
    h('div', { class: 'nv-dialog__actions' }, ...buttons),
  );
  const el = h('div', { class: 'nv-scrim' }, card);
  return { id, el, modal: true, initialFocus: () => buttons[focusIndex] ?? null };
}
