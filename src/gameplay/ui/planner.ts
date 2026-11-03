import { h } from '../../ui/dom';
import type { LogisticsModel } from '../modules/logistics';
import { gpButton, type GpScreen } from './host';
import type { T } from './screens';

/**
 * Small logistics planner (LOG / PLN): vehicles per route with +/- buttons, route risks shown up
 * front (telegraphed), live totals against the goal, confirm when the plan meets the goal.
 */
export function plannerScreen(t: T, model: LogisticsModel, onConfirm: () => void, onBack: () => void): GpScreen {
  const rows = h('div', { class: 'gp-planner' });
  const summary = h('p', { class: 'gp-lead', attrs: { role: 'status' } });
  const problems = h('p', { class: 'gp-feedback' });
  const confirm = gpButton(t('gameplay.logistics.confirm'), () => {
    if (model.evaluate().meetsGoal) onConfirm();
  }, { primary: true, key: 'plan-confirm' });

  const counts = new Map<string, HTMLElement>();
  for (const r of model.scenario.routes) {
    const count = h('output', { class: 'gp-planner__count' });
    counts.set(r.id, count);
    rows.append(
      h(
        'div',
        { class: 'gp-planner__row' },
        h('span', { class: 'gp-planner__name', text: t(r.labelKey) }),
        h('span', { class: 'gp-dim', text: t('gameplay.logistics.route', { hours: r.hoursPerTrip, supplies: r.supplyPerTrip, people: r.peoplePerTrip }) }),
        r.riskKey ? h('span', { class: 'gp-risk', text: t(r.riskKey) }) : null,
        gpButton('−', () => {
          model.assign(r.id, -1);
          render();
        }, { key: 'minus-' + r.id }),
        count,
        gpButton('+', () => {
          model.assign(r.id, 1);
          render();
        }, { key: 'plus-' + r.id }),
      ),
    );
  }

  function render(): void {
    const res = model.evaluate();
    for (const [id, el] of counts) el.textContent = String(model.vehiclesOn(id));
    const goal = model.scenario.goal;
    summary.textContent = t('gameplay.logistics.summary', {
      supplies: res.suppliesDelivered,
      goalSupplies: goal.supplies,
      people: res.peopleMoved,
      goalPeople: goal.people,
      free: model.vehiclesFree,
    });
    problems.textContent = res.problems.map((k) => t(k)).join(' ');
    confirm.disabled = !res.meetsGoal;
  }
  render();

  const el = h(
    'div',
    { class: 'gp-stage' },
    h(
      'section',
      { class: 'gp-sheet gp-sheet--wide', attrs: { role: 'dialog', 'aria-label': t('gameplay.logistics.title') } },
      h('h2', { class: 'gp-sheet__title', text: t('gameplay.logistics.title') }),
      h('div', { class: 'gp-sheet__body' }, rows, summary, problems, h('div', { class: 'gp-actions' }, confirm, gpButton(t('gameplay.common.back'), onBack, { key: 'plan-back' }))),
    ),
  );
  return { id: 'planner', el, back: onBack };
}
