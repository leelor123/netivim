import type { I18n } from '../core/i18n';
import type { FrameStats } from './renderPipeline';

const INT_TABLE_SIZE = 10000;
const TENTHS_TABLE_SIZE = 1000;
/** The overlay refreshes 4 times per second: readable, and nearly free. */
const REFRESH_MS = 250;

let intStrings: string[] | null = null;
let tenthStrings: string[] | null = null;

/** Number -> string through prebuilt tables, so refreshing the overlay allocates no strings. */
function intText(n: number): string {
  intStrings ??= Array.from({ length: INT_TABLE_SIZE }, (_, i) => String(i));
  const i = Math.max(0, Math.min(INT_TABLE_SIZE - 1, Math.round(n)));
  return intStrings[i] ?? '';
}

function tenthsText(n: number): string {
  tenthStrings ??= Array.from({ length: TENTHS_TABLE_SIZE }, (_, i) => (i / 10).toFixed(1));
  const i = Math.max(0, Math.min(TENTHS_TABLE_SIZE - 1, Math.round(n * 10)));
  return tenthStrings[i] ?? '';
}

interface MemoryPerformance {
  readonly memory?: { readonly usedJSHeapSize: number };
}

type Field = 'fps' | 'frameTime' | 'drawCalls' | 'triangles' | 'geometries' | 'textures' | 'programs' | 'heap' | 'resolution' | 'preset';
const FIELDS: readonly Field[] = ['preset', 'fps', 'frameTime', 'drawCalls', 'triangles', 'geometries', 'textures', 'programs', 'heap', 'resolution'];

/**
 * Debug overlay (settings.graphics.debugOverlay): frame time, fps, draw calls, triangles,
 * geometries, textures, shader programs, JS heap (when the browser exposes it). DOM only,
 * textContent/Text nodes only, values written through cached strings only when they change.
 */
export class DebugOverlay {
  readonly root: HTMLElement;
  private readonly values = new Map<Field, Text>();
  private readonly shown = new Map<Field, string>();
  private lastRefresh = -Infinity;
  private resolutionKey = -1;
  private presetText = '';

  constructor(private readonly i18n: I18n) {
    const root = document.createElement('div');
    root.className = 'gfx-debug';
    root.setAttribute('aria-hidden', 'true');
    root.dataset.testid = 'graphics-debug';
    const title = document.createElement('div');
    title.className = 'gfx-debug-title';
    title.textContent = i18n.t('graphics.debug.title');
    root.append(title);
    for (const f of FIELDS) {
      const row = document.createElement('div');
      row.className = 'gfx-debug-row';
      row.dataset.field = f;
      const label = document.createElement('span');
      label.className = 'gfx-debug-label';
      label.textContent = i18n.t('graphics.debug.' + f);
      const value = document.createElement('span');
      value.className = 'gfx-debug-value';
      const text = document.createTextNode('-');
      value.append(text);
      row.append(label, value);
      root.append(row);
      this.values.set(f, text);
    }
    this.root = root;
  }

  /** Name of the preset in effect (null = Custom). Called on settings changes, not per frame. */
  setPreset(preset: string | null): void {
    this.presetText = this.i18n.t('graphics.preset.' + (preset ?? 'custom'));
    this.set('preset', this.presetText);
  }

  /** Per-frame call; does real work only every REFRESH_MS. */
  update(stats: FrameStats, nowMs: number): void {
    if (nowMs - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = nowMs;
    this.set('fps', intText(stats.fps));
    this.set('frameTime', tenthsText(stats.frameMs));
    this.set('drawCalls', intText(stats.calls));
    this.set('triangles', intText(stats.triangles / 1000));
    this.set('geometries', intText(stats.geometries));
    this.set('textures', intText(stats.textures));
    this.set('programs', intText(stats.programs));
    const mem = (performance as MemoryPerformance).memory;
    this.set('heap', mem ? intText(mem.usedJSHeapSize / 1048576) : '-');
    const key = stats.width * 100000 + stats.height;
    if (key !== this.resolutionKey) {
      // Changes only on resize or resolution-scale changes.
      this.resolutionKey = key;
      this.set('resolution', String(stats.width) + 'x' + String(stats.height));
    }
  }

  dispose(): void {
    this.root.remove();
  }

  private set(field: Field, text: string): void {
    if (this.shown.get(field) === text) return;
    this.shown.set(field, text);
    const node = this.values.get(field);
    if (node) node.nodeValue = text;
  }
}
