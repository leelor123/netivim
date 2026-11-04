import type { ContentLabel } from '../../../content/schema';
import { h } from '../../../ui/dom';
import { scrollableAttrs } from '../../../ui/scrollRouting';
import { SORT_CARDS, TRAYS, type LabelId, type LabelSorter } from './labels';
import type { PromptSpec } from './layout';
import './archive.css';

type T = (key: string, params?: Readonly<Record<string, string | number>>) => string;

export interface OverlayDeps {
  readonly t: T;
  readonly glyph: (action: 'interact' | 'map' | 'pause' | 'back') => string;
  readonly onClose: () => void;
  readonly onSorterClick: (kind: 'card' | 'tray', index: number) => void;
  /** Touch: a tap on the tutorial line performs its action when no on-screen button has it (codex). */
  readonly onPromptTap?: (action: 'map') => void;
}

export interface SheetContent {
  readonly title: string;
  readonly kicker?: string;
  readonly label?: ContentLabel;
  readonly paragraphs: readonly string[];
  readonly footer: string;
}

/**
 * DOM layer of the level: the tutorial line (screen region "notice", src/ui/layout.ts), small
 * modal sheets, the sorter and the finale wash. Captions (guide lines with their label chip) go
 * through the shared caption component, never through this overlay.
 */
export class ArchiveOverlay {
  readonly root: HTMLElement;
  private readonly bannerGlyph = h('kbd', { class: 'gp-hud__glyph' });
  private readonly bannerText = h('span', {});
  private readonly banner = h('p', { class: 'an-banner', attrs: { 'aria-live': 'polite' } });
  private readonly sheetHost = h('div', { class: 'an-stage', attrs: { hidden: '' } });
  private readonly sorterHost = h('div', { class: 'an-stage', attrs: { hidden: '' } });
  private readonly viewerHost = h('div', { class: 'an-viewer', attrs: { hidden: '' } });
  private readonly wash = h('div', { class: 'an-wash' });
  private lastPrompt: PromptSpec | null = null;
  private lastGlyph = '';

  constructor(private readonly d: OverlayDeps) {
    this.banner.append(this.bannerGlyph, this.bannerText);
    this.banner.hidden = true;
    this.banner.addEventListener('click', () => {
      if (this.lastPrompt?.action === 'map') this.d.onPromptTap?.('map');
    });
    this.root = h('div', { class: 'an-root', attrs: { dir: 'rtl' } }, this.banner, this.sheetHost, this.sorterHost, this.viewerHost, this.wash);
    // The level turns the confirm key into the sorter action; stop the browser acting a second time.
    const swallow = (e: KeyboardEvent): void => {
      if ((e.code === 'Enter' || e.code === 'Space') && e.target instanceof HTMLButtonElement) e.preventDefault();
    };
    this.sorterHost.addEventListener('keydown', swallow);
    this.sorterHost.addEventListener('keyup', swallow);
    document.body.append(this.root);
  }

  setPrompt(spec: PromptSpec | null): void {
    const glyph = spec?.action ? this.d.glyph(spec.action) : '';
    if (spec === this.lastPrompt && glyph === this.lastGlyph) return;
    this.lastPrompt = spec;
    this.lastGlyph = glyph;
    this.banner.hidden = !spec;
    if (!spec) return;
    // A new line fades in, then settles to a quieter look (CSS; none with reduced motion).
    this.banner.classList.remove('is-fresh');
    void this.banner.offsetWidth;
    this.banner.classList.add('is-fresh');
    if (spec.action === 'map') this.banner.dataset.tappable = '';
    else delete this.banner.dataset.tappable;
    this.bannerGlyph.hidden = !spec.action;
    this.bannerGlyph.textContent = glyph;
    this.bannerText.textContent = this.d.t(spec.key);
  }

  chip(label: ContentLabel): HTMLElement {
    return h('span', { class: 'gp-label gp-label--' + label, text: this.d.t('gameplay.label.' + label) });
  }

  showSheet(c: SheetContent): void {
    const body = h('div', { class: 'gp-sheet__body', attrs: scrollableAttrs(c.title) });
    if (c.kicker || c.label) {
      const k = h('p', { class: 'gp-kicker' });
      if (c.kicker) k.append(document.createTextNode(c.kicker + ' '));
      if (c.label) k.append(this.chip(c.label));
      body.append(k);
    }
    for (const p of c.paragraphs) body.append(h('p', { text: p }));
    body.append(h('p', { class: 'gp-dim', text: c.footer }));
    const close = h('button', { class: 'gp-btn gp-btn--primary', text: this.d.t('gameplay.common.back'), attrs: { type: 'button' } });
    close.addEventListener('click', this.d.onClose);
    body.append(h('div', { class: 'gp-actions' }, close));
    this.sheetHost.replaceChildren(h('section', { class: 'gp-sheet an-sheet', attrs: { role: 'dialog', 'aria-label': c.title } }, h('h2', { class: 'gp-sheet__title', text: c.title }), body));
    this.sheetHost.hidden = false;
    close.focus({ preventScroll: true });
  }

  hideSheet(): void {
    this.sheetHost.hidden = true;
    this.sheetHost.replaceChildren();
  }

  /** The archive provenance card next to the 3D document. */
  showViewer(card: HTMLElement, hint: string): void {
    this.viewerHost.replaceChildren(card, h('p', { class: 'an-viewerhint', text: hint }));
    this.viewerHost.hidden = false;
  }

  setViewerHint(hint: string): void {
    const p = this.viewerHost.querySelector('.an-viewerhint');
    if (p) p.textContent = hint;
  }

  hideViewer(): void {
    this.viewerHost.hidden = true;
    this.viewerHost.replaceChildren();
  }

  get viewerOpen(): boolean {
    return !this.viewerHost.hidden;
  }

  renderSorter(s: LabelSorter, message: string): void {
    const t = this.d.t;
    const cards = h('div', { class: 'an-cards' });
    const rest = s.unplaced();
    rest.forEach((c, i) => {
      const held = s.held?.id === c.id;
      const b = h('button', { class: 'gp-btn an-card' + (i === s.cardCursor && !s.held ? ' is-cursor' : '') + (held ? ' is-held' : ''), text: t(c.textKey), attrs: { type: 'button' } });
      b.addEventListener('click', () => this.d.onSorterClick('card', i));
      if (i === s.cardCursor && !s.held) b.setAttribute('aria-current', 'true');
      cards.append(b);
    });
    if (rest.length === 0) cards.append(h('p', { class: 'gp-lead', text: t('levels.ch00.archive.sort.done') }));
    const trays = h('div', { class: 'an-trays' });
    TRAYS.forEach((tray: LabelId, i) => {
      const placedHere = SORT_CARDS.filter((c) => s.trayOf(c.id) === tray);
      const b = h('button', { class: 'gp-btn an-tray an-tray--' + tray + (s.held && i === s.trayCursor ? ' is-cursor' : ''), attrs: { type: 'button' } }, h('strong', { text: t('gameplay.label.' + tray) }), ...placedHere.map((c) => h('span', { class: 'an-placed', text: t(c.textKey) })));
      b.addEventListener('click', () => this.d.onSorterClick('tray', i));
      if (s.held && i === s.trayCursor) b.setAttribute('aria-current', 'true');
      trays.append(b);
    });
    const close = h('button', { class: 'gp-btn', text: t('gameplay.common.back'), attrs: { type: 'button' } });
    close.addEventListener('click', this.d.onClose);
    const hint = s.held ? t('levels.ch00.archive.sort.pickTray') : t('levels.ch00.archive.sort.pickCard');
    this.sorterHost.replaceChildren(
      h(
        'section',
        { class: 'gp-sheet an-sheet', attrs: { role: 'dialog', 'aria-label': t('levels.ch00.archive.sort.title') } },
        h('h2', { class: 'gp-sheet__title', text: t('levels.ch00.archive.sort.title') }),
        h('div', { class: 'gp-sheet__body', attrs: scrollableAttrs(t('levels.ch00.archive.sort.title')) }, h('p', { class: 'gp-dim', text: hint }), cards, trays, h('p', { class: 'gp-feedback', text: message, attrs: { 'aria-live': 'polite' } }), h('div', { class: 'gp-actions' }, close)),
      ),
    );
    this.sorterHost.hidden = false;
    // The DOM is rebuilt per step, so put real focus back on the cursor item (screen readers + ring).
    this.sorterHost.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true });
  }

  hideSorter(): void {
    this.sorterHost.hidden = true;
    this.sorterHost.replaceChildren();
  }

  get sorterOpen(): boolean {
    return !this.sorterHost.hidden;
  }

  /** Finale light wash, 0 (clear) to 1 (full). */
  setWash(v: number): void {
    this.wash.style.opacity = v.toFixed(2);
  }

  dispose(): void {
    this.root.remove();
  }
}
