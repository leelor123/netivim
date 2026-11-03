import { createNewSave } from '../../core/save/schema';
import { HISTORY_COVERED_UP_TO, formatCoverageDate } from '../coverage';
import { dialog, type UiContext } from '../context';
import { h } from '../dom';
import type { UiScreen } from '../uiScreen';
import { button } from '../widgets';
import { chaptersScreen } from './chapters';
import { infoScreen } from './info';
import { settingsScreen } from './settings';

/** Title / main menu (root screen while the flow is on "title"). */
export function titleScreen(ctx: UiContext): UiScreen {
  const { t, game } = ctx;
  const newest = game.save.loadNewest();

  const startNew = (): void => {
    game.setState(createNewSave(Date.now()));
    ctx.withUi(() => game.flow.send('openHub'));
  };

  const cont = button(
    t('ui.menu.continue'),
    () => {
      const latest = game.save.loadNewest();
      if (!latest) return;
      game.setState(latest.data);
      ctx.withUi(() => game.flow.send('openHub'));
    },
    { variant: 'primary', key: 'continue', disabled: !newest, sub: newest ? ctx.formatDateTime(newest.savedAt) : t('ui.menu.continueEmpty') },
  );
  const fresh = button(
    t('ui.menu.newGame'),
    () => {
      if (!game.save.loadNewest()) {
        startNew();
        return;
      }
      ctx.screens.push(
        dialog('new-game', t('ui.newGame.title'), t('ui.newGame.body'), [
          { label: t('ui.common.cancel'), run: () => ctx.screens.pop() },
          { label: t('ui.newGame.confirm'), run: startNew, variant: 'danger' },
        ]),
      );
    },
    newest ? { key: 'new-game' } : { key: 'new-game', variant: 'primary' },
  );
  const chapters = button(t('ui.menu.chapters'), () => ctx.screens.push(chaptersScreen(ctx)), { key: 'chapters' });
  const settings = button(t('ui.menu.settings'), () => ctx.screens.push(settingsScreen(ctx)), { key: 'settings' });
  const archive = button(
    t('ui.menu.archive'),
    () => ctx.screens.push(infoScreen(ctx, 'archive', t('ui.archive.title'), [t('ui.archive.body'), t('ui.archive.empty')])),
    { key: 'archive', variant: 'quiet' },
  );
  const credits = button(
    t('ui.menu.credits'),
    () => ctx.screens.push(infoScreen(ctx, 'credits', t('ui.credits.title'), [t('ui.credits.body'), t('ui.credits.fonts')])),
    { key: 'credits', variant: 'quiet' },
  );

  const menu = h(
    'nav',
    { class: 'nv-menu', attrs: { 'aria-label': t('ui.menu.label') } },
    h('div', { class: 'nv-menu__primary' }, cont, fresh),
    h('div', { class: 'nv-menu__grid' }, chapters, settings, archive, credits),
  );
  const brand = h(
    'div',
    { class: 'nv-brand' },
    h('p', { class: 'nv-brand__kicker', text: t('app.subtitle') }),
    h('h1', { class: 'title nv-brand__title', text: t('app.title') }),
    h('p', { class: 'nv-brand__rule', attrs: { 'aria-hidden': 'true' } }),
    h('p', { class: 'nv-brand__covered', text: t('ui.coveredUpTo', { date: formatCoverageDate(HISTORY_COVERED_UP_TO) }) }),
    h('p', { class: 'nv-brand__version', text: t('app.version', { version: __APP_VERSION__ }) }),
  );
  const el = h('div', { class: 'nv-title' }, brand, h('div', { class: 'nv-title__card' }, menu));
  return {
    id: 'title',
    el,
    root: true,
    initialFocus: () => (cont.disabled ? fresh : cont),
  };
}
