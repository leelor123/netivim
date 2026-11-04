import type { I18n } from '../core/i18n';
import { DoubleConfirm } from './skipConfirm';
import './cinematics.css';
import type { CutsceneOverlay, FadeColor } from './types';

/** Longest hold shown on the ring, kept in sync with SkipHold's default. */
const RING_RADIUS = 18;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const SVG_NS = 'http://www.w3.org/2000/svg';

export interface DomOverlay extends CutsceneOverlay {
  readonly root: HTMLElement;
  /** True while the on-screen skip button is held by a pointer. */
  readonly pointerHeld: boolean;
  setReducedMotion(reduced: boolean): void;
  /** True once when the skip button was activated twice in a row (tap-tap alternative to the hold). */
  consumeSkipRequest(): boolean;
  dispose(): void;
}

/**
 * DOM layer for fades, letterbox bars, title cards and the skip ring. Writes to the DOM only
 * when a value changes, so a steady cutscene frame touches nothing.
 */
export function createDomOverlay(i18n: I18n, parent: HTMLElement = document.body): DomOverlay {
  const root = document.createElement('div');
  root.className = 'cine';
  root.hidden = true;

  const fade = document.createElement('div');
  fade.className = 'cine-fade';
  fade.setAttribute('aria-hidden', 'true');
  const barTop = document.createElement('div');
  barTop.className = 'cine-bar cine-bar-top';
  barTop.setAttribute('aria-hidden', 'true');
  const barBottom = document.createElement('div');
  barBottom.className = 'cine-bar cine-bar-bottom';
  barBottom.setAttribute('aria-hidden', 'true');
  const card = document.createElement('p');
  card.className = 'cine-card';
  card.setAttribute('role', 'status');

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'cine-skip';
  skip.dataset.touchUi = '';
  skip.tabIndex = -1;
  skip.setAttribute('aria-label', i18n.t('cinematics.skip.name'));
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 44 44');
  svg.setAttribute('class', 'cine-ring');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(SVG_NS, 'circle');
  const bar = document.createElementNS(SVG_NS, 'circle');
  for (const c of [track, bar]) {
    c.setAttribute('cx', '22');
    c.setAttribute('cy', '22');
    c.setAttribute('r', String(RING_RADIUS));
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke-width', '4');
  }
  track.setAttribute('class', 'cine-ring-track');
  bar.setAttribute('class', 'cine-ring-bar');
  bar.setAttribute('stroke-dasharray', String(RING_LENGTH));
  bar.setAttribute('stroke-dashoffset', String(RING_LENGTH));
  svg.append(track, bar);
  const label = document.createElement('span');
  label.className = 'cine-skip-label';
  label.textContent = i18n.t('cinematics.skip.label');
  skip.append(svg, label);

  root.append(fade, barTop, barBottom, card, skip);
  parent.append(root);

  let held = false;
  const down = (): void => {
    held = true;
  };
  const up = (): void => {
    held = false;
  };
  skip.addEventListener('pointerdown', down);
  skip.addEventListener('pointerup', up);
  skip.addEventListener('pointercancel', up);
  skip.addEventListener('pointerleave', up);
  const confirm = new DoubleConfirm();
  let skipRequested = false;
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  skip.addEventListener('click', () => {
    if (confirm.press(performance.now())) {
      skipRequested = true;
      label.textContent = i18n.t('cinematics.skip.label');
      return;
    }
    label.textContent = i18n.t('cinematics.skip.again');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      label.textContent = i18n.t('cinematics.skip.label');
    }, 1500);
  });

  let lastAmount = -1;
  let lastColor: FadeColor | '' = '';
  let lastBars: boolean | null = null;
  let lastKey: string | null | undefined;
  let lastAlpha = -1;
  let lastProgress = -1;

  return {
    root,
    get pointerHeld() {
      return held;
    },
    setFade(amount, color) {
      if (color !== lastColor) {
        fade.dataset.color = color;
        lastColor = color;
      }
      if (Math.abs(amount - lastAmount) > 0.002) {
        fade.style.opacity = amount.toFixed(3);
        lastAmount = amount;
      }
    },
    setLetterbox(on) {
      if (on === lastBars) return;
      lastBars = on;
      root.classList.toggle('cine-letterbox', on);
      // Lets the subtitle / toast layer sit above the bars (ui.css reads html[data-letterbox]).
      document.documentElement.toggleAttribute('data-letterbox', on);
    },
    setTitleCard(textKey, alpha) {
      if (textKey !== lastKey) {
        card.textContent = textKey === null ? '' : i18n.t(textKey);
        lastKey = textKey;
      }
      if (Math.abs(alpha - lastAlpha) > 0.01) {
        card.style.opacity = alpha.toFixed(2);
        lastAlpha = alpha;
      }
    },
    setSkipProgress(progress) {
      if (Math.abs(progress - lastProgress) < 0.005) return;
      lastProgress = progress;
      bar.setAttribute('stroke-dashoffset', String(RING_LENGTH * (1 - progress)));
      root.classList.toggle('cine-skip-active', progress > 0);
    },
    setActive(active) {
      root.hidden = !active;
      if (!active) {
        document.documentElement.removeAttribute('data-letterbox');
        held = false;
        confirm.reset();
        skipRequested = false;
        lastAmount = -1;
        lastBars = null;
        lastKey = undefined;
        lastAlpha = -1;
        lastProgress = -1;
      }
    },
    setReducedMotion(reduced) {
      root.classList.toggle('cine-reduced', reduced);
    },
    consumeSkipRequest() {
      const r = skipRequested;
      skipRequested = false;
      return r;
    },
    dispose() {
      clearTimeout(hintTimer);
      document.documentElement.removeAttribute('data-letterbox');
      root.remove();
    },
  };
}
