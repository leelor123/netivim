/**
 * The ONE owner of the in-game screen layout.
 *
 * The screen is split into named regions; every overlay (UI HUD, gameplay HUD, level overlays,
 * touch controls, captions, toasts) places itself with the region's CSS custom properties and
 * never invents its own position. Regions never intersect (unit-tested for every supported
 * viewport and touch size), so two overlays in different regions cannot overlap; an overlay
 * that owns a region keeps its content inside it (max sizes + overflow rules in CSS).
 *
 *   +-----------+--------------------------+-------------+
 *   | system    |  notice (tutorial line)  |  objective  |
 *   |           |  hint                    |  (+ meter)  |
 *   |           |  toast                   |-------------|
 *   |           |                          |  panel      |   (level side panel, e.g. planning table)
 *   |           |  toolbar (touch actions) |             |
 *   |           |  prompt                  |             |
 *   | stick     |  captions                |  actions    |   (stick/actions swap when left-handed)
 *   +-----------+--------------------------+-------------+
 *
 * Geometry is computed here (pure, testable) and written to :root as --rg-<region>-x/y/w/h
 * (from the top-left) and --rg-<region>-r/b (distance from the right / bottom edge), in CSS px.
 * Safe areas (notch, rounded corners) are measured once per resize with an env() probe.
 */

export const REGIONS = ['system', 'objective', 'panel', 'notice', 'hint', 'toast', 'toolbar', 'prompt', 'captions', 'stick', 'actions'] as const;
export type Region = (typeof REGIONS)[number];

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Insets {
  readonly t: number;
  readonly r: number;
  readonly b: number;
  readonly l: number;
}

export interface Viewport {
  readonly w: number;
  readonly h: number;
  readonly safe?: Insets;
  /** settings.controls.touchSize (0.75-1.5). */
  readonly touchScale?: number;
  /** Side of the virtual stick (the action buttons take the other bottom corner). */
  readonly stickSide?: 'left' | 'right';
  /** UI text scale (settings.accessibility.uiTextSize, 1-1.4): text rows and the side column grow with it. */
  readonly textScale?: number;
}

/** Layout constants (CSS px). Touch sizes are at touchScale 1. */
export const LAYOUT = {
  edge: 12,
  gap: 10,
  /** HUD icon button (pause, save): at least the 44 px touch target. */
  button: 44,
  buttonGap: 8,
  /** One slim text line (notice, hint, toast). */
  row: 36,
  objectiveMin: 190,
  objectiveMax: 320,
  objectiveVw: 0.28,
  objectiveVh: 0.3,
  /** The two centre columns never get wider than this (long lines are hard to read). */
  centerMax: 760,
  prompt: 40,
  /** Touch action bar: 48 px targets plus a little air. */
  toolbar: 52,
  /** Level side panel width cap. */
  panelMax: 260,
  captionsMin: 84,
  captionsMax: 170,
  captionsVh: 0.3,
  /** Joystick ring diameter and the free margin around its idle position. */
  stick: 128,
  stickPad: 20,
  /** Action cluster (interact + alt). */
  actionsW: 168,
  actionsH: 128,
} as const;

const NO_INSETS: Insets = { t: 0, r: 0, b: 0, l: 0 };

/**
 * The text scale the regions can really honour. Rows (notice, hint, toast, prompt) grow with the
 * text, but never so far that the captions region would fall under its minimum height; on a short
 * screen the scale steps down towards 1 instead. Region-hosted text uses this value (--rg-ts).
 */
export function regionTextScale(vp: Viewport): number {
  const want = Math.max(1, vp.textScale ?? 1);
  if (want === 1) return 1;
  const floor = Math.min(LAYOUT.captionsMin, build(vp, 1).captions.h);
  for (const c of [want, (want + 1) / 2, 1]) if (build(vp, c).captions.h >= floor - 1e-6) return c;
  return 1;
}

/** Computes every region for a viewport. Pure. */
export function computeRegions(vp: Viewport): Record<Region, Rect> {
  return build(vp, regionTextScale(vp));
}

function build(vp: Viewport, ts: number): Record<Region, Rect> {
  const row = Math.ceil(LAYOUT.row * ts);
  const promptH = Math.ceil(LAYOUT.prompt * ts);
  const s = vp.safe ?? NO_INSETS;
  const k = vp.touchScale ?? 1;
  const L = Math.max(LAYOUT.edge, s.l);
  const R = Math.max(LAYOUT.edge, s.r);
  const T = Math.max(LAYOUT.edge, s.t);
  const B = Math.max(LAYOUT.edge, s.b);
  const g = LAYOUT.gap;
  const W = vp.w;
  const H = vp.h;

  // Bottom corners: stick and action buttons.
  const stickSize = LAYOUT.stick * k + LAYOUT.stickPad * 2;
  const aw = LAYOUT.actionsW * k;
  const ah = LAYOUT.actionsH * k;
  const stickLeft = (vp.stickSide ?? 'left') === 'left';
  const stick: Rect = { x: stickLeft ? L : W - R - stickSize, y: H - B - stickSize, w: stickSize, h: stickSize };
  const actions: Rect = { x: stickLeft ? W - R - aw : L, y: H - B - ah, w: aw, h: ah };
  const bottomLeftTop = stickLeft ? stick.y : actions.y;
  const bottomRightTop = stickLeft ? actions.y : stick.y;

  // Top corners: system buttons (left) and the objective (right), never reaching the bottom corners.
  const sysW = LAYOUT.button * 2 + LAYOUT.buttonGap;
  const system: Rect = { x: L, y: T, w: sysW, h: Math.max(0, Math.min(LAYOUT.button, bottomLeftTop - g - T)) };
  const objW = Math.min(LAYOUT.objectiveMax * ts, Math.max(LAYOUT.objectiveMin * ts, W * LAYOUT.objectiveVw * ts));
  const objective: Rect = { x: W - R - objW, y: T, w: objW, h: Math.max(0, Math.min(H * LAYOUT.objectiveVh, bottomRightTop - g - T)) };

  // Centre columns, symmetric around the screen centre so text stays centred.
  const column = (leftEdge: number, rightEdge: number): { x: number; w: number } => {
    const half = Math.max(0, Math.min(LAYOUT.centerMax / 2, W / 2 - Math.max(leftEdge, W - rightEdge) - g));
    return { x: W / 2 - half, w: half * 2 };
  };
  const leftBox = stickLeft ? stick : actions;
  const rightBox = stickLeft ? actions : stick;
  // The top lines also stay clear of a bottom corner that is tall enough to reach them.
  const topBottom = T + row * 3 + g * 2;
  const top = column(Math.max(system.x + system.w, leftBox.y < topBottom + g ? leftBox.x + leftBox.w : 0), Math.min(objective.x, rightBox.y < topBottom + g ? rightBox.x : W));
  const notice: Rect = { x: top.x, y: T, w: top.w, h: row };
  const hint: Rect = { x: top.x, y: notice.y + notice.h + g, w: top.w, h: row };
  const toast: Rect = { x: top.x, y: hint.y + hint.h + g, w: top.w, h: row };

  // Level side panel: the right column under the objective, down to the bottom-right corner.
  const panelW = Math.min(objW, LAYOUT.panelMax * ts);
  const panelY = objective.y + objective.h + g;
  const panelH = Math.max(0, bottomRightTop - g - panelY);
  const panel: Rect = { x: W - R - panelW, y: panelY, w: panelW, h: panelH };

  // Bottom column: between the bottom corners and left of the side panel. Not symmetric: the
  // panel takes room on the right only, and captions keep as much width as possible.
  const bLeft = leftBox.x + leftBox.w + g;
  const bRight = Math.min(rightBox.x, panelH > 0 ? panel.x : W) - g;
  const bW = Math.max(0, Math.min(LAYOUT.centerMax, bRight - bLeft));
  const bottom = { x: bLeft + (bRight - bLeft - bW) / 2, w: bW };
  // Bottom-up: captions, prompt, toolbar. Captions give way first on short screens so the
  // toolbar always keeps its full 48 px targets.
  const fixedAbove = topBottom + g + LAYOUT.toolbar + g + promptH + g;
  const capH = Math.max(0, Math.min(LAYOUT.captionsMax, Math.max(LAYOUT.captionsMin, H * LAYOUT.captionsVh), H - B - fixedAbove));
  const captions: Rect = { x: bottom.x, y: H - B - capH, w: bottom.w, h: capH };
  const prompt: Rect = { x: bottom.x, y: captions.y - g - promptH, w: bottom.w, h: promptH };
  const toolbarY = Math.max(topBottom + g, prompt.y - g - LAYOUT.toolbar);
  const toolbar: Rect = { x: bottom.x, y: toolbarY, w: bottom.w, h: Math.max(0, prompt.y - g - toolbarY) };

  return { system, objective, panel, notice, hint, toast, toolbar, prompt, captions, stick, actions };
}

/** True when two rectangles share any area (touching edges do not count). */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** CSS custom properties for a set of regions. */
export function regionVars(regions: Record<Region, Rect>, vp: Pick<Viewport, 'w' | 'h'>): Record<string, string> {
  const out: Record<string, string> = {};
  const px = (n: number): string => String(Math.round(n * 10) / 10) + 'px';
  for (const name of REGIONS) {
    const r = regions[name];
    out['--rg-' + name + '-x'] = px(r.x);
    out['--rg-' + name + '-y'] = px(r.y);
    out['--rg-' + name + '-w'] = px(r.w);
    out['--rg-' + name + '-h'] = px(r.h);
    out['--rg-' + name + '-r'] = px(vp.w - r.x - r.w);
    out['--rg-' + name + '-b'] = px(vp.h - r.y - r.h);
  }
  return out;
}

/** Reads the device safe-area insets through an env() probe (0 where unsupported). */
function measureSafeArea(doc: Document): Insets {
  const probe = doc.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;inset:0;' +
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  doc.body.append(probe);
  const cs = getComputedStyle(probe);
  const n = (v: string): number => Number.parseFloat(v) || 0;
  const insets = { t: n(cs.paddingTop), r: n(cs.paddingRight), b: n(cs.paddingBottom), l: n(cs.paddingLeft) };
  probe.remove();
  return insets;
}

export interface ScreenLayout {
  /** Recomputes after a change of touch size / handedness. */
  setTouch(scale: number, stickSide: 'left' | 'right'): void;
  /** Recomputes after a change of the UI text size (settings.accessibility.uiTextSize). */
  setTextScale(scale: number): void;
  /** Current regions (CSS px), e.g. for placing the idle joystick. */
  readonly regions: Record<Region, Rect>;
  dispose(): void;
}

let active: ScreenLayout | null = null;

/** The installed layout (null before installUI ran, e.g. in unit tests). */
export function activeLayout(): ScreenLayout | null {
  return active;
}

/** Writes the region variables to :root and keeps them current on resize. */
export function installScreenLayout(doc: Document = document): ScreenLayout {
  const root = doc.documentElement;
  let scale = 1;
  let side: 'left' | 'right' = 'left';
  let textScale = 1;
  let regions = computeRegions({ w: window.innerWidth, h: window.innerHeight });
  const apply = (): void => {
    const vp: Viewport = { w: window.innerWidth, h: window.innerHeight, safe: measureSafeArea(doc), touchScale: scale, stickSide: side, textScale };
    regions = computeRegions(vp);
    root.style.setProperty('--rg-ts', String(regionTextScale(vp)));
    for (const [k, v] of Object.entries(regionVars(regions, vp))) root.style.setProperty(k, v);
  };
  apply();
  window.addEventListener('resize', apply);
  const layout: ScreenLayout = {
    setTouch(s, sd) {
      if (s === scale && sd === side) return;
      scale = s;
      side = sd;
      apply();
    },
    setTextScale(ts) {
      if (ts === textScale) return;
      textScale = ts;
      apply();
    },
    get regions() {
      return regions;
    },
    dispose() {
      window.removeEventListener('resize', apply);
      if (active === layout) active = null;
    },
  };
  active = layout;
  return layout;
}
