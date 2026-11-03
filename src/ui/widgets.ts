import { focusable, h, nextId } from './dom';
import { cycleOption, sliderFraction, sliderFromPointer, stepSlider, type SliderSpec } from './logic';

/**
 * Horizontal adjusters for focused controls: the FocusManager sends left/right presses here
 * as a logical delta (+1 = more / next) instead of moving focus.
 */
const adjusters = new WeakMap<HTMLElement, (delta: -1 | 1) => void>();

export function adjusterFor(el: HTMLElement): ((delta: -1 | 1) => void) | undefined {
  return adjusters.get(el);
}

export interface ButtonOptions {
  readonly variant?: 'primary' | 'quiet' | 'danger';
  readonly sub?: string;
  readonly disabled?: boolean;
  readonly key?: string;
}

export function button(label: string, onClick: () => void, opts: ButtonOptions = {}): HTMLButtonElement {
  const b = focusable(h('button', { class: 'nv-btn' + (opts.variant ? ' nv-btn--' + opts.variant : ''), attrs: { type: 'button' } }));
  b.append(h('span', { class: 'nv-btn__label', text: label }));
  if (opts.sub) b.append(h('span', { class: 'nv-btn__sub', text: opts.sub }));
  if (opts.disabled) b.disabled = true;
  if (opts.key) b.dataset.key = opts.key;
  b.addEventListener('click', () => {
    if (!b.disabled) onClick();
  });
  return b;
}

interface RowParts {
  readonly row: HTMLElement;
  readonly labelId: string;
}

function row(label: string, key: string, note?: string): RowParts {
  const labelId = nextId('lbl');
  const r = h('div', { class: 'nv-row' }, h('span', { class: 'nv-row__label', text: label, attrs: { id: labelId } }));
  if (note) r.append(h('span', { class: 'nv-row__note', text: note }));
  r.dataset.row = key;
  return { row: r, labelId };
}

export interface SliderOptions extends SliderSpec {
  readonly label: string;
  readonly key: string;
  readonly rtl: boolean;
  readonly get: () => number;
  readonly set: (v: number) => void;
  readonly format: (v: number) => string;
}

/** Slider row: D-pad left/right steps, tap or drag on the track sets the value. */
export function sliderRow(o: SliderOptions): HTMLElement {
  const { row: r, labelId } = row(o.label, o.key);
  const control = focusable(
    h('div', {
      class: 'nv-slider',
      attrs: { role: 'slider', tabindex: '0', 'aria-labelledby': labelId, 'aria-valuemin': String(o.min), 'aria-valuemax': String(o.max), 'aria-orientation': 'horizontal' },
    }),
  );
  control.dataset.key = o.key;
  const fill = h('span', { class: 'nv-slider__fill' });
  const thumb = h('span', { class: 'nv-slider__thumb' });
  const track = h('span', { class: 'nv-slider__track' }, fill, thumb);
  const value = h('span', { class: 'nv-slider__value' });
  control.append(track, value);
  const paint = (v: number): void => {
    const pct = String(sliderFraction(v, o) * 100) + '%';
    fill.style.inlineSize = pct;
    thumb.style.insetInlineStart = pct;
    const text = o.format(v);
    value.textContent = text;
    control.setAttribute('aria-valuenow', String(v));
    control.setAttribute('aria-valuetext', text);
  };
  const apply = (v: number): void => {
    if (v === o.get()) return;
    o.set(v);
    paint(o.get());
  };
  adjusters.set(control, (d) => apply(stepSlider(o.get(), d, o)));
  const fromPointer = (e: PointerEvent): void => {
    const rect = track.getBoundingClientRect();
    apply(sliderFromPointer(e.clientX, rect.left, rect.width, o.rtl, o));
  };
  control.addEventListener('pointerdown', (e) => {
    control.setPointerCapture(e.pointerId);
    fromPointer(e);
  });
  control.addEventListener('pointermove', (e) => {
    if (control.hasPointerCapture(e.pointerId)) fromPointer(e);
  });
  paint(o.get());
  r.append(control);
  return r;
}

export interface ToggleOptions {
  readonly label: string;
  readonly key: string;
  readonly on: string;
  readonly off: string;
  readonly get: () => boolean;
  readonly set: (v: boolean) => void;
}

/** On/off switch: confirm or left/right flips it. */
export function toggleRow(o: ToggleOptions): HTMLElement {
  const { row: r, labelId } = row(o.label, o.key);
  const control = focusable(h('button', { class: 'nv-switch', attrs: { type: 'button', role: 'switch', 'aria-labelledby': labelId } }));
  control.dataset.key = o.key;
  const state = h('span', { class: 'nv-switch__state' });
  control.append(h('span', { class: 'nv-switch__track' }, h('span', { class: 'nv-switch__knob' })), state);
  const paint = (): void => {
    const v = o.get();
    control.setAttribute('aria-checked', String(v));
    state.textContent = v ? o.on : o.off;
  };
  const flip = (): void => {
    o.set(!o.get());
    paint();
  };
  control.addEventListener('click', flip);
  adjusters.set(control, flip);
  paint();
  r.append(control);
  return r;
}

export interface ChoiceOptions<T> {
  readonly label: string;
  readonly key: string;
  readonly options: readonly T[];
  readonly text: (v: T) => string;
  readonly get: () => T;
  readonly set: (v: T) => void;
  readonly note?: string;
  readonly prevLabel: string;
  readonly nextLabel: string;
}

/** Option picker: confirm or a tap goes to the next option, left/right cycles in reading order. */
export function choiceRow<T>(o: ChoiceOptions<T>): HTMLElement {
  const { row: r, labelId } = row(o.label, o.key, o.note);
  const valueId = nextId('val');
  const control = focusable(h('button', { class: 'nv-choice', attrs: { type: 'button', 'aria-labelledby': labelId + ' ' + valueId } }));
  control.dataset.key = o.key;
  const value = h('span', { class: 'nv-choice__value', attrs: { id: valueId } });
  // Chevrons point to the reading-order start / end; CSS mirrors them for RTL.
  const prev = h('span', { class: 'nv-choice__arrow nv-choice__arrow--prev', attrs: { 'aria-hidden': 'true', title: o.prevLabel } });
  const next = h('span', { class: 'nv-choice__arrow nv-choice__arrow--next', attrs: { 'aria-hidden': 'true', title: o.nextLabel } });
  const pips = h('span', { class: 'nv-choice__pips', attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < o.options.length; i++) pips.append(h('span', { class: 'nv-choice__pip' }));
  control.append(prev, h('span', { class: 'nv-choice__body' }, value, pips), next);
  const paint = (): void => {
    const v = o.get();
    value.textContent = o.text(v);
    const idx = o.options.indexOf(v);
    for (let i = 0; i < pips.children.length; i++) pips.children[i]?.classList.toggle('is-on', i === idx);
  };
  const go = (d: -1 | 1): void => {
    o.set(cycleOption(o.options, o.get(), d));
    paint();
  };
  prev.addEventListener('click', (e) => {
    e.stopPropagation();
    go(-1);
  });
  next.addEventListener('click', (e) => {
    e.stopPropagation();
    go(1);
  });
  control.addEventListener('click', () => go(1));
  adjusters.set(control, go);
  paint();
  r.append(control);
  return r;
}

/** A row holding a custom focusable control (e.g. a remap button). */
export function customRow(label: string, key: string, control: HTMLElement, note?: string): HTMLElement {
  const { row: r, labelId } = row(label, key, note);
  control.setAttribute('aria-labelledby', labelId + (control.id ? ' ' + control.id : ''));
  r.append(control);
  return r;
}

export function heading(text: string): HTMLElement {
  return h('h3', { class: 'nv-section', text });
}
