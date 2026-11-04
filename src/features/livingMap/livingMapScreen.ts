import { eraAnchorYear, ERAS, type Era } from '../../content/eras';
import type { GameScene } from '../../render/sceneManager';
import { formatYears, h, type Translate } from '../timeline/format';
import type { AnalogInput, HostedScreen, ScreenAction } from '../timeline/screen';
import { clampPosition, nearestIndex, scrubWithStick, stepIndex, yearAtPosition } from '../timeline/scrub';
import './livingMap.css';
import { layerHasGeometry, lineLayersAt } from './layers';
import { scrollBy, SCROLL_DEAD, SCROLL_SPEED } from '../../ui/scrollRouting';
import { LabelCollider, makeTextMeasurer } from './labelLayout';
import { LensState, type Lens } from './lenses';
import { LivingMapScene } from './mapScene';
import { MARKERS, markersVisibleAt } from './markers';
import { RELIEF_EXAGGERATION } from './relief';

/** Where the map's 3D scene is shown. The game provides one that wraps SceneManager. */
export interface MapSceneHost {
  show(scene: GameScene): void;
  hide(scene: GameScene): void;
}

export interface LivingMapOptions {
  readonly t: Translate;
  readonly rtl: boolean;
  readonly host: MapSceneHost;
  readonly reducedMotion?: () => boolean;
  readonly viewport?: () => { readonly width: number; readonly height: number };
  readonly lensState?: LensState;
  readonly initialIndex?: number;
  readonly onBack?: () => void;
  /** Smaller terrain grid (tests). */
  readonly grid?: { readonly cols: number; readonly rows: number };
}

export type ScrubListener = (position: number, year: number, index: number) => void;

const ORBIT_PX = 0.006;
const STICK_HOLD_SECONDS = 0.3;
const ZOOM_STEP_IN = 0.8;
const ZOOM_STEP_OUT = 1.25;
/** Horizontal padding (7px each side) plus a little slack around the measured text. */
const LABEL_CHROME_PX = 18;
/** D-pad up / down scroll the side panel by this much per press. */
const PANEL_STEP_PX = 90;

/**
 * Living Map screen: 3D relief (LivingMapScene) plus DOM labels, lens controls and source panel.
 * Era position is a float chapter index shared with the timeline (see linkTimelineToMap).
 */
export class LivingMapScreen implements HostedScreen {
  readonly lenses: LensState;
  /** True while a timeline drives the era position: the map then never self-scrubs or snaps. */
  linked = false;
  private readonly anchors = ERAS.map(eraAnchorYear);
  private readonly count = ERAS.length;
  private readonly listeners = new Set<ScrubListener>();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private position: number;
  private scene: LivingMapScene | null = null;
  private root: HTMLElement | null = null;
  private labels: HTMLElement[] = [];
  private collider: LabelCollider | null = null;
  private panel: HTMLElement | null = null;
  private cleanups: Array<() => void> = [];
  private shownIndex = -1;
  private labelFrames = 0;
  private lastRig = { az: NaN, polar: NaN, dist: NaN };
  private pinchDist = 0;
  private stickHeld = 0;
  private readonly labelPos = { x: 0, y: 0 };
  private unsubLens: (() => void) | null = null;
  private layerKey = '';

  constructor(private readonly opts: LivingMapOptions) {
    this.lenses = opts.lensState ?? new LensState();
    this.position = clampPosition(opts.initialIndex ?? 0, this.count);
  }

  get mapScene(): LivingMapScene | null {
    return this.scene;
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

  get activeLens(): Lens | null {
    return this.lenses.active(this.currentEra.id);
  }

  addScrubListener(fn: ScrubListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  mount(root: HTMLElement): void {
    if (this.root) return;
    const { t } = this.opts;
    const el = h('section', 'lm', '', { 'data-screen': 'living-map', role: 'region', 'aria-label': t('timeline.map.title') });
    el.dir = this.opts.rtl ? 'rtl' : 'ltr';
    const gesture = h('div', 'lm-gesture');
    const labelBox = h('div', 'lm-labels', '', { 'aria-hidden': 'true' });
    this.labels = MARKERS.map((m) => {
      const label = h('span', 'lm-label', t(m.nameKey), { 'data-marker': m.id, 'data-sources': m.sources.join(' ') });
      label.hidden = true;
      return label;
    });
    labelBox.append(...this.labels);
    const kindWeight = { city: 3, site: 2, settlement: 1 } as const;
    const collider = new LabelCollider(
      MARKERS.length,
      MARKERS.map((m) => kindWeight[m.kind]),
    );
    this.collider = collider;
    // Panel is a named, focusable region so keyboard / AT users can reach and scroll it.
    const panel = h('aside', 'lm-panel', '', { 'aria-live': 'polite', tabindex: '0', 'aria-label': t('timeline.map.panel') });
    // Single-pointer zoom alternative to the two-finger pinch (WCAG 2.5.1), 48px targets.
    const zoomIn = h('button', 'lm-zoom-btn', '+', { type: 'button', 'aria-label': t('timeline.map.zoomIn'), 'data-action': 'zoom-in' });
    const zoomOut = h('button', 'lm-zoom-btn', '−', { type: 'button', 'aria-label': t('timeline.map.zoomOut'), 'data-action': 'zoom-out' });
    zoomIn.addEventListener('click', () => this.zoomBy(ZOOM_STEP_IN));
    zoomOut.addEventListener('click', () => this.zoomBy(ZOOM_STEP_OUT));
    const zoom = h('div', 'lm-zoom', '', { role: 'group', 'aria-label': t('timeline.map.zoomGroup') });
    zoom.append(zoomIn, zoomOut);
    el.append(gesture, labelBox, zoom, panel);
    root.append(el);
    this.root = el;
    this.panel = panel;
    this.measureLabels();
    // Web fonts change glyph widths: measure again once they are ready.
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (this.root !== el) return;
        this.measureLabels();
        this.labelFrames = Math.max(this.labelFrames, 2);
      });
    }

    const scene = new LivingMapScene({ ...(this.opts.reducedMotion ? { reducedMotion: this.opts.reducedMotion } : {}), ...(this.opts.grid ? { grid: this.opts.grid } : {}) });
    this.scene = scene;
    this.opts.host.show(scene);
    this.bindGestures(gesture);
    this.unsubLens = this.lenses.onChange(() => this.refresh(true));
    this.refresh(true);
  }

  unmount(): void {
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
    this.unsubLens?.();
    this.unsubLens = null;
    this.pointers.clear();
    if (this.scene) {
      this.opts.host.hide(this.scene);
      this.scene.dispose();
      this.scene = null;
    }
    this.root?.remove();
    this.root = null;
    this.panel = null;
    this.labels = [];
    this.collider = null;
    this.shownIndex = -1;
    this.layerKey = '';
  }

  /** Float chapter index (shared with the timeline). */
  setPosition(p: number, notify = true): void {
    const next = clampPosition(p, this.count);
    if (next === this.position && this.shownIndex === this.index) return;
    this.position = next;
    this.refresh(false);
    if (notify) for (const fn of this.listeners) fn(this.position, this.currentYear, this.index);
  }

  setLens(id: 'independence' | 'nakba'): boolean {
    return this.lenses.set(this.currentEra.id, id);
  }

  toggleLens(step: 1 | -1 = 1): Lens | null {
    return this.lenses.cycle(this.currentEra.id, step);
  }

  onAction(action: ScreenAction): boolean {
    switch (action) {
      case 'left':
      case 'right':
        this.setPosition(stepIndex(this.index, action, this.count, this.opts.rtl));
        return true;
      case 'tabPrev':
        this.toggleLens(-1);
        return true;
      case 'tabNext':
      case 'alt':
      case 'confirm':
        this.toggleLens(1);
        return true;
      case 'up':
      case 'down':
        return this.scrollPanel((action === 'up' ? -1 : 1) * PANEL_STEP_PX);
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

  /** Scrolls the side panel (D-pad up / down, left stick vertical). The camera keeps the right stick. */
  scrollPanel(delta: number): boolean {
    return this.panel ? scrollBy(this.panel, delta) : false;
  }

  update(dt: number, analog: AnalogInput): void {
    const scene = this.scene;
    if (!scene) return;
    const reduced = this.opts.reducedMotion?.() ?? false;
    if (this.linked) {
      // The linked timeline owns the era position.
    } else if (Math.abs(analog.moveX) > 0.15) {
      this.stickHeld += dt;
      if (this.stickHeld > STICK_HOLD_SECONDS) this.setPosition(scrubWithStick(this.position, analog.moveX, dt, this.count, this.opts.rtl));
    } else if (this.releaseStick() && this.position !== Math.round(this.position)) {
      const target = Math.round(this.position);
      this.setPosition(reduced || Math.abs(target - this.position) < 0.005 ? target : this.position + (target - this.position) * Math.min(1, dt * 12));
    }
    if (Math.abs(analog.moveY) > SCROLL_DEAD) this.scrollPanel(analog.moveY * SCROLL_SPEED * dt);
    scene.rig.applyAnalog(dt, analog.lookX, analog.lookY, analog.scroll, reduced);
    const rig = scene.rig;
    if (rig.azimuth !== this.lastRig.az || rig.polar !== this.lastRig.polar || rig.distance !== this.lastRig.dist) {
      this.lastRig.az = rig.azimuth;
      this.lastRig.polar = rig.polar;
      this.lastRig.dist = rig.distance;
      this.labelFrames = Math.max(this.labelFrames, 2);
    }
    if (this.labelFrames > 0) {
      this.labelFrames--;
      this.placeLabels();
    }
  }

  /** Zoom by a factor (< 1 in, > 1 out); the +/- buttons use this. */
  zoomBy(factor: number): void {
    this.scene?.rig.zoom(factor);
  }

  /** Measures the real rendered width of every label once (cached per string), not 8px per char. */
  private measureLabels(): void {
    const collider = this.collider;
    const first = this.labels[0];
    if (!collider || !first) return;
    const font = getComputedStyle(first).font;
    const measure = makeTextMeasurer(font || '700 14px sans-serif');
    MARKERS.forEach((m, i) => {
      collider.width[i] = measure(this.opts.t(m.nameKey)) + LABEL_CHROME_PX;
    });
  }

  /** Resets the hold timer once the stick is back at rest; always true so it chains in an else-if. */
  private releaseStick(): boolean {
    this.stickHeld = 0;
    return true;
  }

  private viewport(): { width: number; height: number } {
    return this.opts.viewport ? this.opts.viewport() : { width: window.innerWidth, height: window.innerHeight };
  }

  private placeLabels(): void {
    const scene = this.scene;
    if (!scene) return;
    const collider = this.collider;
    if (!collider) return;
    const { width, height } = this.viewport();
    for (let i = 0; i < this.labels.length; i++) {
      const show = scene.labelScreenPosition(i, width, height, this.labelPos);
      collider.visible[i] = show ? 1 : 0;
      collider.x[i] = this.labelPos.x;
      collider.y[i] = this.labelPos.y;
    }
    collider.resolve();
    for (let i = 0; i < this.labels.length; i++) {
      const label = this.labels[i] as HTMLElement;
      const show = collider.visible[i] === 1;
      if (label.hidden === show) label.hidden = !show;
      if (show) label.style.transform = 'translate(' + Math.round(collider.x[i] as number) + 'px,' + Math.round(collider.y[i] as number) + 'px) translate(-50%,-100%)';
    }
  }

  private bindGestures(layer: HTMLElement): void {
    const down = (e: PointerEvent): void => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        layer.setPointerCapture(e.pointerId);
      } catch {
        // Capture is a nicety; synthetic or stale pointers may not support it.
      }
      if (this.pointers.size === 2) this.pinchDist = this.currentPinch();
    };
    const move = (e: PointerEvent): void => {
      const prev = this.pointers.get(e.pointerId);
      const rig = this.scene?.rig;
      if (!prev || !rig) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      prev.x = e.clientX;
      prev.y = e.clientY;
      if (this.pointers.size === 1) {
        rig.orbit(-dx * ORBIT_PX, -dy * ORBIT_PX * 0.8);
      } else if (this.pointers.size === 2) {
        const d = this.currentPinch();
        if (this.pinchDist > 0 && d > 0) rig.zoom(this.pinchDist / d);
        this.pinchDist = d;
      }
    };
    const up = (e: PointerEvent): void => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
    };
    const wheel = (e: WheelEvent): void => {
      e.preventDefault();
      this.scene?.rig.zoom(Math.exp(e.deltaY * 0.001));
    };
    layer.addEventListener('pointerdown', down);
    layer.addEventListener('pointermove', move);
    layer.addEventListener('pointerup', up);
    layer.addEventListener('pointercancel', up);
    layer.addEventListener('wheel', wheel, { passive: false });
    this.cleanups.push(() => {
      layer.removeEventListener('pointerdown', down);
      layer.removeEventListener('pointermove', move);
      layer.removeEventListener('pointerup', up);
      layer.removeEventListener('pointercancel', up);
      layer.removeEventListener('wheel', wheel);
    });
  }

  private currentPinch(): number {
    const pts = [...this.pointers.values()];
    const a = pts[0];
    const b = pts[1];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** Pushes the year to the 3D scene and redraws the panel when the era or lens changed. */
  private refresh(force: boolean): void {
    if (!this.scene || !this.root) return;
    const year = this.currentYear;
    this.scene.setYear(year);
    const layers = lineLayersAt(year);
    const layerKey = layers.map((l) => l.id).join('|');
    if (layerKey !== this.layerKey) {
      this.layerKey = layerKey;
      this.scene.setLineLayers(layers);
    }
    this.root.dataset.year = String(Math.round(year));
    this.root.dataset.era = this.currentEra.id;
    this.labelFrames = 40;
    const lens = this.activeLens;
    this.root.dataset.lens = lens ? lens.id : '';
    const noted = new Set<string>();
    for (const m of markersVisibleAt(year)) if (lens && m.notes?.[lens.id]) noted.add(m.id);
    this.scene.setHighlights(noted);
    if (!force && this.shownIndex === this.index && this.panel?.dataset.lens === (lens?.id ?? '')) return;
    this.shownIndex = this.index;
    this.renderPanel(lens, year);
  }

  private renderPanel(lens: Lens | null, year: number): void {
    const panel = this.panel;
    if (!panel) return;
    const { t } = this.opts;
    const era = this.currentEra;
    panel.replaceChildren();
    panel.dataset.lens = lens?.id ?? '';
    panel.append(h('h2', 'lm-era', t(era.titleKey)), h('p', 'lm-year', formatYears(era.years)));

    const lensBox = h('section', 'lm-lens', '', { 'data-lens-box': lens ? lens.id : 'none' });
    if (lens) {
      lensBox.append(
        h('h3', 'lm-lens-label', t(lens.labelKey)),
        h('p', 'lm-lens-body', t(lens.bodyKey)),
        h('p', 'lm-sources', t('timeline.sources', { ids: lens.sources.join(', ') })),
      );
      const btn = h('button', 'lm-btn', t('timeline.lens.toggle'), { type: 'button', 'data-focusable': '', 'data-action': 'toggle-lens' });
      btn.addEventListener('click', () => this.toggleLens(1));
      lensBox.append(btn);
    } else {
      lensBox.append(h('p', 'lm-muted', t('timeline.lens.none')));
      }
    panel.append(lensBox);

    const visible = markersVisibleAt(year);
    if (lens) {
      const list = h('ul', 'lm-notes');
      for (const m of visible) {
        const n = m.notes?.[lens.id];
        if (!n) continue;
        const li = h('li', 'lm-note', '', { 'data-marker': m.id });
        li.append(h('strong', '', t(m.nameKey) + ': '), h('span', '', t(n.textKey)), h('span', 'lm-sources', t('timeline.sources', { ids: n.sources.join(', ') })));
        list.append(li);
      }
      if (list.childElementCount > 0) panel.append(list);
    }

    const layers = lineLayersAt(year);
    if (layers.length > 0) {
      const box = h('section', 'lm-layers');
      for (const layer of layers) {
        const text = t(layer.labelKey) + (layer.simplified ? ' (' + t('timeline.layer.simplified') + ')' : '') + (layerHasGeometry(layer) ? '' : ' — ' + t('timeline.layer.pending'));
        box.append(h('p', 'lm-layer', text, { 'data-layer': layer.id }), h('p', 'lm-sources', t('timeline.sources', { ids: layer.sources.join(', ') })));
      }
      panel.append(box);
    }

    // Always open: a <details> toggle cannot be operated with a controller, but scrolling can.
    const places = h('section', 'lm-places');
    places.append(h('h3', 'lm-places-title', t('timeline.map.places', { n: visible.length })));
    for (const m of visible) {
      places.append(
        h('p', 'lm-place', t(m.nameKey) + ' · ' + t('timeline.label.' + m.label) + ' · ' + t('timeline.sources', { ids: m.sources.join(', ') }), { 'data-marker': m.id }),
      );
    }
    panel.append(places);
    panel.append(h('p', 'lm-muted', t('timeline.map.reliefNote', { n: RELIEF_EXAGGERATION })));
    if (this.opts.onBack) {
      const back = h('button', 'lm-btn', t('timeline.map.back'), { type: 'button', 'data-focusable': '', 'data-action': 'back' });
      back.addEventListener('click', () => this.opts.onBack?.());
      panel.append(back);
    }
  }
}
