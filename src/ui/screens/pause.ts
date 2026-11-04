import { MANUAL_SLOTS, type GameSlot } from '../../core/save/saveManager';
import { dialog, panel, type UiContext } from '../context';
import { focusable, h } from '../dom';
import { decideExit } from '../logic';
import type { UiScreen } from '../uiScreen';
import { button } from '../widgets';
import { settingsScreen } from './settings';

export interface PauseScreen extends UiScreen {
  readonly resumeButton: HTMLButtonElement;
}

/** Pause menu: Resume, Save (slot picker), Settings, Exit to title (with the BRIEF 8.E prompt). */
export function pauseScreen(ctx: UiContext): PauseScreen {
  const { t, game } = ctx;
  const p = panel(ctx, t('ui.pause.title'));
  const resume = (): void => ctx.resume();
  const resumeButton = button(t('ui.pause.resume'), resume, { variant: 'primary', key: 'resume' });

  const exit = (): void => {
    if (decideExit({ volatile: game.flow.isVolatile, dirty: game.save.dirty }) === 'exit') {
      ctx.exitToTitle();
      return;
    }
    ctx.screens.push(
      dialog('exit-prompt', t('ui.exit.title'), t('ui.exit.body'), [
        { label: t('ui.exit.saveExit'), variant: 'primary', run: () => ctx.screens.push(slotsScreen(ctx, () => ctx.exitToTitle())) },
        { label: t('ui.exit.discard'), variant: 'danger', run: () => ctx.exitToTitle() },
        { label: t('ui.common.cancel'), run: () => ctx.screens.pop() },
      ]),
    );
  };

  const openCodex = (): void => {
    ctx.resume();
    game.bus.emit('ui:open-codex', {});
  };
  // The codex lives with the chapter flow, which shows it from the hub only.
  const codexButton = game.flow.state === 'hub' ? button(t('ui.pause.codex'), openCodex, { key: 'codex' }) : null;
  const list = h(
    'div',
    { class: 'nv-stack' },
    resumeButton,
    ...(codexButton ? [codexButton] : []),
    button(t('ui.pause.save'), () => ctx.screens.push(slotsScreen(ctx)), { key: 'save' }),
    button(t('ui.pause.settings'), () => ctx.screens.push(settingsScreen(ctx)), { key: 'settings' }),
    button(t('ui.pause.exit'), exit, { key: 'exit', variant: 'quiet' }),
  );
  p.body.append(list);
  p.el.classList.add('nv-stage--pause');
  return {
    id: 'pause',
    el: p.el,
    resumeButton,
    initialFocus: () => resumeButton,
    // Back on the pause root resumes the game.
    back: () => {
      resume();
      return true;
    },
  };
}

function slotNumber(slot: GameSlot): number {
  return MANUAL_SLOTS.indexOf(slot) + 1;
}

/**
 * Manual save slots 1-3 with their time and resume point. `after` runs after a successful save
 * (e.g. exit to title); otherwise the picker closes back to the screen that opened it.
 */
export function slotsScreen(ctx: UiContext, after?: () => void): UiScreen {
  const { t, game } = ctx;
  const p = panel(ctx, t('ui.slots.title'), { back: true });
  const list = h('div', { class: 'nv-slots' });
  const buttons: HTMLButtonElement[] = [];

  const doSave = (slot: GameSlot): void => {
    if (!game.save.saveManual(slot)) return; // save:failed already shows a toast
    if (after) {
      after();
      return;
    }
    ctx.screens.popTo(screen);
    ctx.screens.pop();
  };

  for (const slot of MANUAL_SLOTS) {
    const existing = game.save.load(slot);
    const n = slotNumber(slot);
    const b = focusable(h('button', { class: 'nv-slot' + (existing ? '' : ' is-empty'), attrs: { type: 'button' } }));
    b.dataset.key = slot;
    b.append(h('span', { class: 'nv-slot__num', text: t('ui.slots.slot', { n }) }));
    if (existing) {
      const r = existing.data.resume;
      b.append(
        h('span', { class: 'nv-slot__when', text: ctx.formatDateTime(existing.savedAt) }),
        h('span', { class: 'nv-slot__where', text: r.mission ? t('ui.slots.at.mission') : t('ui.slots.at.' + r.screen) }),
      );
    } else {
      b.append(h('span', { class: 'nv-slot__when', text: t('ui.slots.empty') }));
    }
    b.addEventListener('click', () => {
      if (!existing) {
        doSave(slot);
        return;
      }
      ctx.screens.push(
        dialog('overwrite', t('ui.slots.overwriteTitle', { n }), t('ui.slots.overwriteBody'), [
          { label: t('ui.common.cancel'), run: () => ctx.screens.pop() },
          { label: t('ui.slots.overwrite'), variant: 'primary', run: () => doSave(slot) },
        ]),
      );
    });
    buttons.push(b);
    list.append(b);
  }
  p.body.append(list);
  const screen: UiScreen = { id: 'slots', el: p.el, scroller: p.body, initialFocus: () => buttons[0] ?? null };
  return screen;
}
