import type { Game } from '../../game';
import { glyphFor } from '../../ui/glyphs';
import { h } from '../../ui/dom';
import type { Interactable } from '../core/interaction';
import type { ObjectiveView } from '../core/objectives';
import type { MissionHost } from '../runtime/missionHost';
import type { T } from './screens';

/**
 * In-mission HUD (no data-screen, so the UI keeps its Save / pause chrome), placed by the screen
 * regions of src/ui/layout.ts: the objective with step progress and the danger meter (region
 * "objective"), an accepted hint ("hint") and the interaction prompt with the device glyph
 * ("prompt"). The label of a playing testimony is shown in the caption itself (src/ui/subtitles.ts).
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
  private readonly offs: (() => void)[] = [];
  private focused: Interactable | null = null;
  private lastAlert = -1;
  private announced = false;

  constructor(
    private readonly game: Game,
    private readonly t: T,
  ) {
    this.prompt.append(this.glyph, this.verb);
    this.prompt.hidden = true;
    this.meter.append(this.meterFill);
    this.meter.hidden = true;
    this.hint.hidden = true;
    this.el = h(
      'div',
      { class: 'gp-hud', attrs: { dir: game.i18n.dir } },
      h(
        'div',
        { class: 'gp-hud__side' },
        h('div', { class: 'gp-hud__panel', attrs: { 'aria-live': 'polite' } }, h('p', { class: 'gp-hud__label', text: t('gameplay.hud.objective') }), this.objective, this.steps),
        this.meter,
      ),
      this.hint,
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
    if (this.focused) this.game.bus.emit('ui:interact-available', { available: false });
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
    if (!!it !== this.announced) {
      this.announced = !!it;
      this.game.bus.emit('ui:interact-available', { available: this.announced });
    }
    if (!it) return;
    const input = this.game.input;
    this.glyph.textContent = glyphFor('interact', input.device, input.family).label;
    this.verb.textContent = ' ' + this.t(it.promptKey);
  }
}
