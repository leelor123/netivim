import { chapterStatus, eraAnchorYear, ERAS, type ChapterId, type ChapterStatus, type Era } from '../../content/eras';
import './timeline.css';
import { formatEventDate, formatYears, h, type Translate } from './format';
import type { AnalogInput, HostedScreen, ScreenAction } from './screen';
import { clampPosition, fractionFromPosition, nearestIndex, positionFromClientX, scrubWithStick, stepIndex, yearAtPosition } from './scrub';

export interface TimelineOptions {
  readonly t: Translate;
  /** True for Hebrew. Time then runs right to left. */
  readonly rtl: boolean;
  /** Chapter IDs completed so far (game.getState().completedChapters). */
  readonly getCompletedChapters: () => readonly string[];
  /** Called with the chapter ID when the player picks an unlocked or completed chapter. */
  readonly onSelect: (id: ChapterId) => void;
  /** Called whenever the scrub position changes (float chapter index, interpolated year, nearest index). */
  readonly onScrub?: (position: number, year: number, index: number) => void;
  readonly onBack?: () => void;
  readonly reducedMotion?: () => boolean;
  readonly initialIndex?: number;
  /** Docked strip under the map: hides the title and detail panel. */
  readonly embedded?: boolean;
}

const DRAG_THRESHOLD_PX = 6;
const SNAP_RATE = 12;
const STICK_HOLD_SECONDS = 0.3;

/**
 * Horizontal, scrubbable timeline of all chapters. Plain DOM; host with mount/unmount/onAction.
 * Time runs along the reading direction: right to left in Hebrew (the first chapter is at the right).
 */
export class TimelineScreen implements HostedScreen {
  private readonly anchors = ERAS.map(eraAnchorYear);
  private readonly count = ERAS.length;
  private position: number;
  private root: HTMLElement | null = null;
  private thumb: HTMLElement | null = null;
  private detail: HTMLElement | null = null;
  private statusLine: HTMLElement | null = null;
  private nodes: HTMLButtonElement[] = [];
  private shownIndex = -1;
  private dragging = false;
  private dragMoved = false;
  private dragStartX = 0;
  private stickHeld = 0;
  private cleanups: Array<() => void> = [];
  private readonly listeners = new Set<(position: number, year: number, index: number) => void>();

  constructor(private readonly opts: TimelineOptions) {
    this.position = clampPosition(opts.initialIndex ?? 0, this.count);
  }

  get index(): number {
    return nearestIndex(this.position, this.count);
  }

  get currentPosition(): number {
    return this.position;
  }

  get currentYear(): number {
    return yearAtPosition(this.position, this.anchors);
  }

  get currentEra(): Era {
    return ERAS[this.index] as Era;
  }

  statusOf(index: number): ChapterStatus {
    return chapterStatus(index, new Set(this.opts.getCompletedChapters()));
  }

  mount(root: HTMLElement): void {
    if (this.root) return;
    const { t } = this.opts;
    const section = h('section', 'tl', '', { 'data-screen': 'timeline', role: 'region', 'aria-label': t('timeline.title') });
    section.dir = this.opts.rtl ? 'rtl' : 'ltr';
    if (this.opts.embedded) section.dataset.embedded = 'true';
    const title = h('h2', 'tl-title', t('timeline.title'));
    const hint = h('p', 'tl-hint', t('timeline.hint'));

    const track = h('div', 'tl-track', '', { role: 'group', 'aria-label': t('timeline.track') });
    track.append(h('div', 'tl-rail'));
    const thumb = h('div', 'tl-thumb', '', { 'aria-hidden': 'true' });
    track.append(thumb);
    this.nodes = ERAS.map((era, i) => this.buildNode(era, i));
    track.append(...this.nodes);

    const detail = h('div', 'tl-detail', '', { 'aria-live': 'polite' });
    const status = h('p', 'tl-status', '', { role: 'status' });
    section.append(title, hint, track, detail, status);
    root.append(section);

    this.root = section;
    this.thumb = thumb;
    this.detail = detail;
    this.statusLine = status;
    this.bindPointer(track);
    this.refresh(true);
  }

  unmount(): void {
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
    this.root?.remove();
    this.root = null;
    this.thumb = null;
    this.detail = null;
    this.statusLine = null;
    this.nodes = [];
    this.shownIndex = -1;
  }

  /** Moves to a float position (clamped). Used by the map link and by tests. */
  setPosition(p: number, notify = true): void {
    const next = clampPosition(p, this.count);
    if (next === this.position && this.shownIndex === this.index) return;
    this.position = next;
    this.refresh(false);
    if (notify) this.emitScrub();
  }

  setIndex(i: number): void {
    this.setPosition(i);
  }

  onAction(action: ScreenAction): boolean {
    switch (action) {
      case 'left':
      case 'right':
        this.setPosition(stepIndex(this.index, action, this.count, this.opts.rtl));
        this.focusNode();
        return true;
      case 'tabPrev':
        this.setPosition(Math.max(0, this.index - 1));
        this.focusNode();
        return true;
      case 'tabNext':
        this.setPosition(Math.min(this.count - 1, this.index + 1));
        this.focusNode();
        return true;
      case 'confirm':
        this.select(this.index);
        return true;
      case 'back':
        if (this.opts.onBack) {
          this.opts.onBack();
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  update(dt: number, analog: AnalogInput): void {
    if (!this.root || this.dragging) return;
    if (Math.abs(analog.moveX) > 0.15) {
      // A short push is handled by the left/right action (one chapter); holding scrubs continuously.
      this.stickHeld += dt;
      if (this.stickHeld > STICK_HOLD_SECONDS) this.setPosition(scrubWithStick(this.position, analog.moveX, dt, this.count, this.opts.rtl));
    } else if (this.releaseStick() && this.position !== Math.round(this.position)) {
      const target = Math.round(this.position);
      const reduced = this.opts.reducedMotion?.() ?? false;
      const next = reduced || Math.abs(target - this.position) < 0.005 ? target : this.position + (target - this.position) * Math.min(1, dt * SNAP_RATE);
      this.setPosition(next);
    }
    if (this.detail && Math.abs(analog.lookY) > 0.2) this.detail.scrollTop += analog.lookY * dt * 500;
  }

  private select(index: number): void {
    const era = ERAS[index];
    if (!era) return;
    const status = this.statusOf(index);
    if (status === 'locked') {
      if (this.statusLine) this.statusLine.textContent = this.opts.t(era.shell ? 'timeline.status.soon' : 'timeline.status.lockedMessage');
      return;
    }
    if (this.statusLine) this.statusLine.textContent = '';
    this.opts.onSelect(era.id);
  }

  private buildNode(era: Era, i: number): HTMLButtonElement {
    const { t } = this.opts;
    const node = h('button', 'tl-node', '', { type: 'button', 'data-focusable': '', 'data-chapter': era.id });
    node.append(h('span', 'tl-dot'), h('span', 'tl-node-title', t(era.titleKey.replace(/\.title$/, '.short'))), h('span', 'tl-node-years', formatYears(era.years)));
    node.addEventListener('click', () => {
      if (this.dragMoved) return;
      this.setPosition(i);
      this.select(i);
    });
    node.addEventListener('focus', () => {
      if (this.index !== i) this.setPosition(i);
    });
    return node;
  }

  private bindPointer(track: HTMLElement): void {
    const posFrom = (e: PointerEvent): number => {
      const rect = track.getBoundingClientRect();
      return positionFromClientX(e.clientX, rect.left, rect.width, this.count, this.opts.rtl);
    };
    const down = (e: PointerEvent): void => {
      this.dragging = true;
      this.dragMoved = false;
      this.dragStartX = e.clientX;
    };
    const move = (e: PointerEvent): void => {
      if (!this.dragging) return;
      if (!this.dragMoved && Math.abs(e.clientX - this.dragStartX) < DRAG_THRESHOLD_PX) return;
      if (!this.dragMoved) {
        // Capture only once it is a real drag, so a plain tap still clicks the chapter button.
        try {
          track.setPointerCapture(e.pointerId);
        } catch {
          // Capture is a nicety; synthetic or stale pointers may not support it.
        }
      }
      this.dragMoved = true;
      this.setPosition(posFrom(e));
    };
    const up = (e: PointerEvent): void => {
      if (!this.dragging) return;
      this.dragging = false;
      if (track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);
      if (this.dragMoved) {
        this.setPosition(Math.round(posFrom(e)));
        // The click that follows a drag must not select a chapter.
        window.setTimeout(() => {
          this.dragMoved = false;
        }, 0);
      }
    };
    track.addEventListener('pointerdown', down);
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', up);
    track.addEventListener('pointercancel', up);
    this.cleanups.push(() => {
      track.removeEventListener('pointerdown', down);
      track.removeEventListener('pointermove', move);
      track.removeEventListener('pointerup', up);
      track.removeEventListener('pointercancel', up);
    });
  }

  /** Resets the hold timer once the stick is back at rest; always true so it chains in an else-if. */
  private releaseStick(): boolean {
    this.stickHeld = 0;
    return true;
  }

  private focusNode(): void {
    this.nodes[this.index]?.focus({ preventScroll: true });
  }

  /** Extra scrub subscribers (the Living Map link). Returns an unsubscribe function. */
  addScrubListener(fn: (position: number, year: number, index: number) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emitScrub(): void {
    this.opts.onScrub?.(this.position, this.currentYear, this.index);
    for (const fn of this.listeners) fn(this.position, this.currentYear, this.index);
  }

  /** Redraws thumb, node states and (when the nearest chapter changed) the detail panel. */
  private refresh(force: boolean): void {
    if (!this.root || !this.thumb) return;
    // Logical offset from the start edge (right in RTL), so the same CSS works in both directions.
    this.thumb.style.insetInlineStart = fractionFromPosition(this.position, this.count) * 100 + '%';
    this.root.dataset.index = String(this.index);
    this.root.dataset.year = String(Math.round(this.currentYear));
    const idx = this.index;
    if (!force && idx === this.shownIndex) return;
    this.shownIndex = idx;
    const { t } = this.opts;
    this.nodes.forEach((node, i) => {
      const era = ERAS[i] as Era;
      const status = this.statusOf(i);
            node.dataset.status = status;
      node.dataset.current = i === idx ? 'true' : 'false';
      node.setAttribute('aria-current', i === idx ? 'true' : 'false');
      node.setAttribute('aria-disabled', status === 'locked' ? 'true' : 'false');
      node.style.insetInlineStart = (i / (this.count - 1)) * 100 + '%';
      node.setAttribute('aria-label', t(era.titleKey) + ', ' + formatYears(era.years) + ', ' + t('timeline.status.' + status));
    });
    this.renderDetail(ERAS[idx] as Era, this.statusOf(idx));
  }

  private renderDetail(era: Era, status: ChapterStatus): void {
    const detail = this.detail;
    if (!detail) return;
    const { t } = this.opts;
    detail.replaceChildren();
    const head = h('div', 'tl-detail-head');
    head.append(h('h3', 'tl-era-title', t(era.titleKey)), h('span', 'tl-era-years', formatYears(era.years)), h('span', 'tl-badge', t('timeline.status.' + status), { 'data-status': status }));
    detail.append(head, h('p', 'tl-era-summary', t(era.summaryKey)));
    if (era.events.length === 0) return;
    const list = h('ul', 'tl-events');
    for (const ev of era.events) {
      const li = h('li', 'tl-event', '', { 'data-event': ev.id });
      li.append(
        h('span', 'tl-event-date', formatEventDate(ev, t)),
        h('span', 'tl-label', t('timeline.label.' + ev.label), { 'data-label': ev.label }),
        h('span', 'tl-event-text', t(ev.textKey)),
        h('span', 'tl-sources', t('timeline.sources', { ids: ev.sources.join(', ') })),
      );
      list.append(li);
    }
    detail.append(list);
  }
}
