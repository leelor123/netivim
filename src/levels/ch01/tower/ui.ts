import { TWO_LENSES } from '../../../content/ch01/dialogue';
import { h } from '../../../ui/dom';
import { scrollableAttrs } from '../../../ui/scrollRouting';
import type { Planner } from './planner';
import { PIECE_COUNTS, PIECE_TYPES, type PieceType } from './rules';
import './tower.css';

/** DOM overlays of the level (text only through textContent; never innerHTML). */

type T = (key: string, params?: Readonly<Record<string, string | number>>) => string;
type Glyph = (action: 'confirm' | 'back' | 'interact' | 'alt' | 'map' | 'tabPrev' | 'tabNext') => string;

/** Frame chooser and key help shown while the player is at the planning table. */
export class PlanningPanel {
  readonly el: HTMLElement;
  private readonly chips = new Map<PieceType, { chip: HTMLElement; count: HTMLElement }>();
  private readonly status = h('p', { class: 'ch01t-plan__status', attrs: { 'aria-live': 'polite' } });
  private readonly progress = h('p', { class: 'ch01t-plan__progress' });
  private lastVersion = -1;

  constructor(
    private readonly t: T,
    glyph: Glyph,
  ) {
    const row = h('div', { class: 'ch01t-plan__chips' });
    for (const type of PIECE_TYPES) {
      const count = h('span', { class: 'ch01t-chip__count' });
      const chip = h('span', { class: 'ch01t-chip', attrs: { 'data-type': type } }, h('span', { class: 'ch01t-chip__name', text: t('levels.ch01.tower.piece.' + type) }), count);
      this.chips.set(type, { chip, count });
      row.append(chip);
    }
    const controls = h('p', {
      class: 'ch01t-plan__controls',
      text: t('levels.ch01.tower.plan.controls', {
        confirm: glyph('confirm'),
        alt: glyph('alt'),
        interact: glyph('interact'),
        tabs: glyph('tabPrev') + '/' + glyph('tabNext'),
        map: glyph('map'),
        back: glyph('back'),
      }),
    });
    this.el = h('div', { class: 'ch01t-plan', attrs: { 'data-screen': 'tower-plan', role: 'region', 'aria-label': t('levels.ch01.tower.plan.title') } }, h('p', { class: 'ch01t-plan__title', text: t('levels.ch01.tower.plan.title') }), row, this.progress, this.status, controls);
    this.el.hidden = true;
  }

  attach(): void {
    document.body.append(this.el);
  }

  show(on: boolean): void {
    this.el.hidden = !on;
    this.lastVersion = -1;
  }

  /** Cheap: only touches the DOM when the planner changed. */
  update(p: Planner, message: string | null): void {
    if (p.version === this.lastVersion && message === null) return;
    this.lastVersion = p.version;
    for (const type of PIECE_TYPES) {
      const c = this.chips.get(type);
      if (!c) continue;
      c.count.textContent = String(p.remaining(type)) + '/' + String(PIECE_COUNTS[type]);
      c.chip.classList.toggle('is-selected', type === p.type);
      c.chip.classList.toggle('is-empty', p.remaining(type) === 0);
    }
    this.progress.textContent = this.t('levels.ch01.tower.plan.progress', { placed: p.placedCount, total: PIECE_TYPES.reduce((n, ty) => n + PIECE_COUNTS[ty], 0) });
    this.status.textContent = message ?? this.t(p.fits ? 'levels.ch01.tower.plan.fits' : 'levels.ch01.tower.plan.nofit');
    this.status.classList.toggle('is-bad', message !== null || !p.fits);
  }

  dispose(): void {
    this.el.remove();
  }
}

/** The "Two Lenses" panel on land (TWO_LENSES id `land`): accepted facts, each narrative, shared ground. */
export class LensesPanel {
  readonly el: HTMLElement;
  private readonly button: HTMLButtonElement;

  constructor(t: T, onContinue: () => void) {
    const topic = TWO_LENSES.find((x) => x.id === 'land');
    if (!topic) throw new Error('TWO_LENSES land missing');
    const lenses = h('div', { class: 'ch01t-lenses__cols' });
    for (const lens of topic.lenses) {
      lenses.append(h('section', { class: 'ch01t-lens' }, h('h3', { text: t(lens.whoKey) }), h('p', { text: t(lens.textKey) })));
    }
    this.button = h('button', { class: 'gp-btn gp-btn--primary', text: t('levels.ch01.tower.lenses.continue'), attrs: { type: 'button', 'data-key': 'tower-lenses-continue' } });
    this.button.addEventListener('click', onContinue);
    const body = h(
      'div',
      { class: 'gp-sheet__body', attrs: scrollableAttrs(t(topic.topicKey)) },
      h('p', { class: 'gp-kicker', text: t('levels.ch01.tower.lenses.kicker') }),
      h('h3', { class: 'gp-subtitle', text: t('levels.ch01.tower.lenses.accepted') }),
      h('p', { text: t(topic.factsKey) }),
      lenses,
      h('h3', { class: 'gp-subtitle', text: t('levels.ch01.tower.lenses.shared') }),
      h('p', { text: t(topic.sharedKey) }),
      h('p', { class: 'gp-sources', text: t('gameplay.sources', { ids: topic.sources.join(', ') }) }),
    );
    this.el = h(
      'div',
      { class: 'ch01t-lenses', attrs: { 'data-screen': 'tower-lenses' } },
      h('section', { class: 'gp-sheet gp-sheet--wide', attrs: { role: 'dialog', 'aria-label': t(topic.topicKey) } }, h('h2', { class: 'gp-sheet__title', text: t(topic.topicKey) }), body, h('div', { class: 'gp-sheet__foot' }, h('div', { class: 'gp-actions' }, this.button))),
    );
    this.el.hidden = true;
  }

  attach(): void {
    document.body.append(this.el);
  }

  show(on: boolean): void {
    this.el.hidden = !on;
    if (on) this.button.focus({ preventScroll: true });
  }

  dispose(): void {
    this.el.remove();
  }
}

export type { T as UiT };
