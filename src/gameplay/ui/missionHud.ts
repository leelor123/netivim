import type { ContentLabel } from '../../content/schema';
import type { Game } from '../../game';
import { glyphFor } from '../../ui/glyphs';
import { h } from '../../ui/dom';
import type { Interactable } from '../core/interaction';
import type { ObjectiveView } from '../core/objectives';
import type { MissionHost } from '../runtime/missionHost';
import { labelChip, type T } from './screens';

/**
 * In-mission HUD (no data-screen, so the UI keeps its Save / pause chrome): current objective
 * with step progress, the interaction prompt with the device glyph, a danger meter, an accepted
 * hint and the label of a playing testimony.
 */
export class MissionHud {
  readonly el: HTMLElement;
  private readonly objective = h('p', { class: 'gp-hud__objective' });
  private readonly steps = h('span', { class: 'gp-hud__steps' });
  private readonly prompt = h('p', { class: 'gp-hud__prompt' });
  private readonly glyph = h('kbd', { class: 'gp-hud__glyph' });
  private readonly verb = h('span', {});
  private readonly meter = h('div', { class: 'gp-hud__meter', attrs: { role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100' } });
  private readonly meterFill = h('span', { class: 'gp-hud__meterfill' });
  private readonly hint = h('p', { class: 'gp-hud__hint' });
  private readonly testimony = h('p', { class: 'gp-hud__testimony' });
  private readonly offs: (() => void)[] = [];
  private focused: Interactable | null = null;
  private lastAlert = -1;

  constructor(
    private readonly game: Game,
    private readonly t: T,
  ) {
    this.prompt.append(this.glyph, this.verb);
    this.prompt.hidden = true;
    this.meter.append(this.meterFill);
    this.meter.hidden = true;
    this.hint.hidden = true;
    this.testimony.hidden = true;
    this.el = h(
      'div',
      { class: 'gp-hud', attrs: { dir: game.i18n.dir } },
      h('div', { class: 'gp-hud__panel', attrs: { 'aria-live': 'polite' } }, h('p', { class: 'gp-hud__label', text: t('gameplay.hud.objective') }), this.objective, this.steps),
      this.hint,
      this.testimony,
      this.meter,
      this.prompt,
    );
    this.offs.push(game.bus.on('input:device-changed', () => this.renderPrompt()));
  }

  attach(host: MissionHost): void {
    document.body.append(this.el);
    this.offs.push(
      host.objectives.subscribe((v) => this.renderObjective(v)),
      host.interactions.onFocus((next) => {
        this.focused = next;
        this.renderPrompt();
      }),
    );
  }

  setVisible(v: boolean): void {
    this.el.hidden = !v;
  }

  showHint(key: string): void {
    this.hint.textContent = this.t('gameplay.hud.hint', { hint: this.t(key) });
    this.hint.hidden = false;
  }

  showTestimony(label: ContentLabel | null): void {
    if (!label) {
      this.testimony.hidden = true;
      return;
    }
    this.testimony.replaceChildren(document.createTextNode(this.t('gameplay.hud.testimony') + ' '), labelChip(this.t, label));
    this.testimony.hidden = false;
  }

  /** Danger meter 0-1 (stealth notice, hazards); hidden at 0. Cheap to call every step. */
  setAlert(level: number): void {
    const v = Math.round(Math.max(0, Math.min(1, level)) * 20) / 20;
    if (v === this.lastAlert) return;
    this.lastAlert = v;
    this.meter.hidden = v <= 0;
    this.meterFill.style.inlineSize = String(v * 100) + '%';
    this.meter.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    this.meter.classList.toggle('is-high', v >= 0.6);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.el.remove();
  }

  private renderObjective(v: ObjectiveView | null): void {
    this.objective.textContent = v ? this.t(v.textKey) : '';
    this.steps.textContent = v && v.total > 1 ? this.t('gameplay.hud.steps', { done: v.done, total: v.total }) : '';
  }

  private renderPrompt(): void {
    const it = this.focused;
    this.prompt.hidden = !it;
    if (!it) return;
    const input = this.game.input;
    this.glyph.textContent = glyphFor('interact', input.device, input.family).label;
    this.verb.textContent = ' ' + this.t(it.promptKey);
  }
}
