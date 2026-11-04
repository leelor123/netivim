import type { ChapterContent, ContentLabel, Fact, MissionMeta } from '../../content/schema';
import type { AssistOption } from '../../core/difficulty';
import type { Action } from '../../core/input/types';
import { h } from '../../ui/dom';
import { scrollableAttrs } from '../../ui/scrollRouting';
import type { DecisionDef, LedgerRow } from '../core/ledger';
import type { Recap } from '../core/progress';
import { QuizSession } from '../core/quiz';
import type { FailureReport } from '../runtime/missionHost';
import type { BriefingMap } from '../types';
import { activeKey, findByKey, focusables, gpButton, type GpScreen } from './host';

/** replaceChildren that skips null / false children. */
export function fill(el: HTMLElement, ...children: (Node | null | false)[]): void {
  el.replaceChildren(...children.filter((c): c is Node => !!c));
}

export type T = (key: string, params?: Readonly<Record<string, string | number>>) => string;

/** Label chip (BRIEF 5): documented / reconstructed / fictional composite. */
export function labelChip(t: T, label: ContentLabel): HTMLElement {
  return h('span', { class: 'gp-label gp-label--' + label, text: t('gameplay.label.' + label) });
}

export function sourcesLine(t: T, sources: readonly string[]): HTMLElement | null {
  return sources.length === 0 ? null : h('p', { class: 'gp-sources', text: t('gameplay.sources', { ids: sources.join(', ') }) });
}

function sheet(id: string, title: string, ...children: (Node | null)[]): { el: HTMLElement; body: HTMLElement } {
  const body = h('div', { class: 'gp-sheet__body', attrs: scrollableAttrs(title) }, ...children);
  const el = h('section', { class: 'gp-sheet gp-sheet--' + id, attrs: { role: 'dialog', 'aria-label': title } }, h('h2', { class: 'gp-sheet__title', text: title }), body);
  return { el: h('div', { class: 'gp-stage' }, el), body };
}

function actions(...buttons: (HTMLElement | null)[]): HTMLElement {
  return h('div', { class: 'gp-actions' }, ...buttons);
}

export interface HubMenuOptions {
  readonly canContinue: boolean;
  readonly onChapters: () => void;
  readonly onContinue: () => void;
  readonly onCodex: () => void;
  readonly onArchive: () => void;
}

export function hubMenuScreen(t: T, o: HubMenuOptions): GpScreen {
  const s = sheet(
    'hub',
    t('gameplay.hub.title'),
    h('p', { class: 'gp-lead', text: t('gameplay.hub.lead') }),
    actions(
      o.canContinue ? gpButton(t('gameplay.hub.continue'), o.onContinue, { primary: true, key: 'continue' }) : null,
      gpButton(t('gameplay.hub.chapters'), o.onChapters, { primary: !o.canContinue, key: 'chapters' }),
      gpButton(t('gameplay.hub.codex'), o.onCodex, { key: 'codex' }),
      gpButton(t('gameplay.hub.archive'), o.onArchive, { key: 'archive' }),
    ),
  );
  return { id: 'hub', el: s.el };
}

export function recapScreen(t: T, r: Recap, onContinue: () => void, onHub: () => void): GpScreen {
  const list = h('ul', { class: 'gp-list' });
  r.missionTitleKeys.forEach((k, i) => {
    const sum = r.missionSummaryKeys[i];
    list.append(h('li', {}, h('strong', { text: t(k) }), sum ? h('span', { class: 'gp-dim', text: ' ' + t(sum) }) : null));
  });
  const s = sheet(
    'recap',
    t('gameplay.recap.title'),
    h('p', { class: 'gp-kicker', text: t(r.chapterTitleKey) }),
    r.missionTitleKeys.length > 0 ? list : h('p', { class: 'gp-dim', text: t('gameplay.recap.fresh') }),
    r.choicesMade > 0 ? h('p', { text: t('gameplay.recap.choices', { n: r.choicesMade }) }) : null,
    r.nextTitleKey ? h('p', { class: 'gp-lead', text: t(r.resumesMission ? 'gameplay.recap.resume' : 'gameplay.recap.next', { title: t(r.nextTitleKey) }) }) : null,
    actions(gpButton(t('gameplay.recap.continue'), onContinue, { primary: true, key: 'recap-continue' }), gpButton(t('gameplay.recap.hub'), onHub, { key: 'recap-hub' })),
  );
  return { id: 'recap', el: s.el, back: onHub };
}

export function contentNoteScreen(t: T, chapterTitleKey: string, onChoose: (mode: 'gentle' | 'standard') => void, onBack: () => void): GpScreen {
  const s = sheet(
    'note',
    t('gameplay.note.title'),
    h('p', { class: 'gp-kicker', text: t(chapterTitleKey) }),
    h('p', { text: t('gameplay.note.body') }),
    h('p', { class: 'gp-dim', text: t('gameplay.note.choice') }),
    actions(
      gpButton(t('gameplay.note.standard'), () => onChoose('standard'), { primary: true, key: 'note-standard', sub: t('gameplay.note.standard.sub') }),
      gpButton(t('gameplay.note.gentle'), () => onChoose('gentle'), { key: 'note-gentle', sub: t('gameplay.note.gentle.sub') }),
      gpButton(t('gameplay.common.back'), onBack, { key: 'note-back' }),
    ),
  );
  return { id: 'content-note', el: s.el, back: onBack };
}

const POINT_COLORS: Readonly<Record<string, string>> = { start: '#7fb3d5', goal: '#f2c14e', item: '#c39bd3', danger: '#e07a5f', poi: '#d9d2c5' };

/** Draws the briefing map on a 2D canvas (no WebGL). */
export function drawBriefingMap(canvas: HTMLCanvasElement, map: BriefingMap): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const k = w / map.size;
  const toX = (x: number): number => w / 2 + x * k;
  const toY = (z: number): number => w / 2 - z * k;
  ctx.fillStyle = '#e8dcc0';
  ctx.fillRect(0, 0, w, w);
  ctx.strokeStyle = 'rgba(90,70,40,0.25)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo((w * i) / 8, 0);
    ctx.lineTo((w * i) / 8, w);
    ctx.moveTo(0, (w * i) / 8);
    ctx.lineTo(w, (w * i) / 8);
    ctx.stroke();
  }
  ctx.strokeStyle = '#8a6a3e';
  ctx.lineWidth = 3;
  for (const r of map.routes ?? []) {
    ctx.beginPath();
    r.forEach(([x, z], i) => (i === 0 ? ctx.moveTo(toX(x), toY(z)) : ctx.lineTo(toX(x), toY(z))));
    ctx.stroke();
  }
  for (const p of map.points) {
    ctx.fillStyle = POINT_COLORS[p.kind] ?? '#fff';
    ctx.strokeStyle = '#2b2118';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(toX(p.x), toY(p.z), p.kind === 'goal' ? 9 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

export interface BriefingOptions {
  readonly chapter: ChapterContent;
  readonly mission: MissionMeta;
  /** Context paragraph; omitted when the mission has none of its own and is not the first. */
  readonly contextKey: string | null;
  readonly map: BriefingMap | null;
  readonly difficultyKey: string;
  readonly resumes: boolean;
  readonly onStart: () => void;
  readonly onBack: () => void;
}

export function briefingScreen(t: T, o: BriefingOptions): GpScreen {
  const goals = h('ul', { class: 'gp-list' });
  for (const g of o.mission.learningGoalKeys) goals.append(h('li', { text: t(g) }));
  let canvas: HTMLCanvasElement | null = null;
  if (o.map) {
    canvas = h('canvas', { class: 'gp-map', attrs: { width: '320', height: '320', role: 'img', 'aria-label': t('gameplay.briefing.map') } });
    drawBriefingMap(canvas, o.map);
  }
  const text = h(
    'div',
    { class: 'gp-col' },
    h('p', { class: 'gp-kicker' }, document.createTextNode(t(o.chapter.titleKey) + ' · '), labelChip(t, o.mission.label)),
    h('h3', { class: 'gp-subtitle', text: t(o.mission.titleKey) }),
    h('p', { class: 'gp-lead', text: t(o.mission.summaryKey) }),
    o.contextKey ? h('p', { text: t(o.contextKey) }) : null,
    h('h4', { text: t('gameplay.briefing.goals') }),
    goals,
    sourcesLine(t, o.mission.sources),
    h('p', { class: 'gp-dim', text: t('gameplay.briefing.difficulty', { level: t(o.difficultyKey) }) }),
  );
  const s = sheet(
    'briefing',
    t('gameplay.briefing.title'),
    h('div', { class: 'gp-split' }, text, canvas),
    actions(
      gpButton(t(o.resumes ? 'gameplay.briefing.resume' : 'gameplay.briefing.start'), o.onStart, { primary: true, key: 'start-mission' }),
      gpButton(t('gameplay.common.back'), o.onBack, { key: 'briefing-back' }),
    ),
  );
  return { id: 'briefing', el: s.el, back: o.onBack };
}

const ASSIST_KEYS: Readonly<Record<AssistOption, string>> = {
  hint: 'gameplay.assist.hint',
  moreTime: 'gameplay.assist.moreTime',
  extraCheckpoint: 'gameplay.assist.extraCheckpoint',
};

/** Levels fail with a bare id or a locale key; the card shows it only when it resolves to real text. */
export function failureReasonText(t: T, reasonKey: string): string | null {
  const text = t(reasonKey);
  return text !== reasonKey ? text : null;
}

/** Failure card: what really happened (sourced, labeled), one hint, instant retry, assist offer. */
export function failureScreen(t: T, r: FailureReport, onRetry: () => void, onAssist: (o: AssistOption) => void): GpScreen {
  const info = r.info;
  const offer = r.assistOptions.length > 0;
  const reasonText = failureReasonText(t, r.reasonKey);
  const s = sheet(
    'failure',
    t('gameplay.failure.title'),
    reasonText ? h('p', { class: 'gp-lead', text: reasonText }) : null,
    info ? h('h3', { class: 'gp-subtitle' }, document.createTextNode(t('gameplay.failure.what') + ' '), labelChip(t, info.label)) : null,
    info ? h('p', { text: t(info.whatHappenedKey) }) : null,
    info ? sourcesLine(t, info.sources) : null,
    info ? h('p', { class: 'gp-hint', text: t('gameplay.failure.hint', { hint: t(info.hintKey) }) }) : null,
    offer ? h('p', { class: 'gp-dim', text: t('gameplay.assist.offer') }) : null,
    offer ? actions(...r.assistOptions.map((o) => gpButton(t(ASSIST_KEYS[o]), () => onAssist(o), { key: 'assist-' + o }))) : null,
    actions(gpButton(t(offer ? 'gameplay.assist.decline' : 'gameplay.failure.retry'), onRetry, { primary: true, key: 'retry' })),
  );
  return { id: 'failure', el: s.el, back: onRetry };
}

/** Decision dialog: options, then the consequence, then continue. */
export function decisionScreen(t: T, def: DecisionDef, onDone: (optionId: string) => void): GpScreen {
  const body = h('div', { class: 'gp-col' });
  const s = sheet('decision', t('gameplay.decision.title'), body);
  const showOptions = (): void => {
    fill(body, 
      h('p', { class: 'gp-lead', text: t(def.promptKey) }),
      def.contextKey ? h('p', { text: t(def.contextKey) }) : null,
      actions(
        ...def.options.map((o) =>
          gpButton(t(o.labelKey), () => {
            fill(body, 
              h('p', { class: 'gp-lead', text: t(o.labelKey) }),
              h('p', { text: t(o.consequenceKey) }),
              actions(gpButton(t('gameplay.common.continue'), () => onDone(o.id), { primary: true, key: 'decision-continue' })),
            );
            focusables(body)[0]?.focus();
          }, { key: 'option-' + o.id }),
        ),
      ),
    );
  };
  showOptions();
  return { id: 'decision', el: s.el };
}

export function ledgerList(t: T, rows: readonly LedgerRow[]): HTMLElement {
  const list = h('div', { class: 'gp-ledger' });
  for (const r of rows) {
    const hist = r.decision.historical;
    const histOption = hist.optionId ? r.decision.options.find((o) => o.id === hist.optionId) : null;
    list.append(
      h(
        'article',
        { class: 'gp-ledger__row' + (r.matchesHistory ? ' is-match' : '') },
        h('h4', { text: t(r.decision.promptKey) }),
        h('p', {}, h('strong', { text: t('gameplay.ledger.yours') + ' ' }), document.createTextNode(r.chosen ? t(r.chosen.labelKey) : t('gameplay.ledger.none'))),
        r.chosen ? h('p', { class: 'gp-dim', text: t(r.chosen.consequenceKey) }) : null,
        h('p', {}, h('strong', { text: t('gameplay.ledger.history') + ' ' }), histOption ? document.createTextNode(t(histOption.labelKey) + ' · ') : null, labelChip(t, hist.label)),
        h('p', { text: t(hist.textKey) }),
        sourcesLine(t, hist.sources),
        h('p', { class: 'gp-badge', text: t(r.matchesHistory ? 'gameplay.ledger.same' : 'gameplay.ledger.different') }),
      ),
    );
  }
  return list;
}

export function debriefScreen(t: T, titleKey: string, rows: readonly LedgerRow[], chapterEnd: boolean, onContinue: () => void): GpScreen {
  const s = sheet(
    'debrief',
    t('gameplay.debrief.title'),
    h('p', { class: 'gp-kicker', text: t(titleKey) }),
    h('p', { class: 'gp-lead', text: t(chapterEnd ? 'gameplay.debrief.chapterDone' : 'gameplay.debrief.missionDone') }),
    rows.length > 0 ? h('h3', { class: 'gp-subtitle', text: t('gameplay.ledger.title') }) : null,
    rows.length > 0 ? ledgerList(t, rows) : null,
    actions(gpButton(t(chapterEnd ? 'gameplay.debrief.toQuiz' : 'gameplay.debrief.next'), onContinue, { primary: true, key: 'debrief-continue' })),
  );
  return { id: 'debrief', el: s.el };
}

export interface QuizResult {
  readonly stars: number;
  readonly correct: number;
  readonly total: number;
}

/** Forgiving quiz plus Did You Know facts; finishing never depends on the score. */
export function quizScreen(t: T, chapter: ChapterContent, facts: readonly Fact[], onFinish: (r: QuizResult) => void): GpScreen {
  const session = new QuizSession(chapter.quiz);
  const body = h('div', { class: 'gp-col' });
  const s = sheet('quiz', t('gameplay.quiz.title'), body);
  const focusFirst = (): void => focusables(body)[0]?.focus();
  /** After a re-render, keep focus on the same control when it still exists (else the first one). */
  const refocus = (key: string | undefined): void => {
    const same = key ? findByKey(body, key) : null;
    if (same && !(same as HTMLButtonElement).disabled) same.focus();
    else focusFirst();
  };

  const renderEnd = (): void => {
    const sc = session.score();
    const factList = h('ul', { class: 'gp-list' });
    for (const f of facts) factList.append(h('li', {}, document.createTextNode(t(f.textKey) + ' '), labelChip(t, f.label)));
    fill(body, 
      h('p', { class: 'gp-stars', text: '★'.repeat(sc.stars) + '☆'.repeat(3 - sc.stars), attrs: { role: 'img', 'aria-label': t('gameplay.quiz.stars', { n: sc.stars }) } }),
      h('p', { class: 'gp-lead', text: t('gameplay.quiz.score', { correct: sc.correct, total: sc.total }) }),
      facts.length > 0 ? h('h3', { class: 'gp-subtitle', text: t('gameplay.quiz.didYouKnow') }) : null,
      facts.length > 0 ? factList : null,
      actions(gpButton(t('gameplay.quiz.finish'), () => onFinish({ stars: sc.stars, correct: sc.correct, total: sc.total }), { primary: true, key: 'quiz-finish' })),
    );
    focusFirst();
  };

  const render = (feedback: string | null): void => {
    const prevKey = activeKey(body);
    const q = session.current;
    if (!q) {
      renderEnd();
      return;
    }
    const resolved = session.resolved;
    const opts = q.optionKeys.map((k, i) => {
      const b = gpButton(t(k), () => {
        if (session.resolved) return;
        const r = session.answer(i);
        render(r.correct ? t(r.firstTry ? 'gameplay.quiz.correctFirst' : 'gameplay.quiz.correct') : r.triesLeft > 0 ? t('gameplay.quiz.tryAgain') : t('gameplay.quiz.reveal'));
      }, { key: 'answer-' + String(i) });
      if (session.isWrongPick(i)) b.classList.add('is-wrong');
      if (resolved && i === q.correctIndex) b.classList.add('is-right');
      if (resolved || session.isWrongPick(i)) b.disabled = true;
      return b;
    });
    fill(body, 
      h('p', { class: 'gp-dim', text: t('gameplay.quiz.progress', { n: session.position + 1, total: session.questions.length }) }),
      h('p', { class: 'gp-lead', text: t(q.promptKey) }),
      actions(...opts),
      feedback ? h('p', { class: 'gp-feedback', text: feedback, attrs: { role: 'status' } }) : null,
      resolved ? h('p', { text: t(q.explanationKey) }) : null,
      actions(
        resolved
          ? gpButton(t('gameplay.quiz.next'), () => {
              session.next();
              render(null);
            }, { primary: true, key: 'quiz-next' })
          : gpButton(t('gameplay.quiz.skip'), () => {
              session.next();
              render(null);
            }, { key: 'quiz-skip' }),
      ),
    );
    refocus(prevKey);
  };
  render(null);
  return { id: 'quiz', el: s.el };
}

/** Thin wrapper so feature screens (timeline) live on the gameplay stack. */
export interface HostedFeature {
  mount(root: HTMLElement): void;
  unmount(): void;
  onAction(action: Action & ('confirm' | 'back' | 'left' | 'right' | 'tabPrev' | 'tabNext' | 'alt')): boolean;
  update?(dt: number, analog: { moveX: number; moveY: number; lookX: number; lookY: number; scroll: number }): void;
}

const FEATURE_ACTIONS = new Set<Action>(['confirm', 'back', 'left', 'right', 'tabPrev', 'tabNext', 'alt']);

export function featureScreen(id: string, feature: HostedFeature): GpScreen {
  const el = h('div', { class: 'gp-feature' });
  return {
    id,
    el,
    mountInto(root) {
      root.append(el);
      feature.mount(el);
    },
    unmountFrom() {
      feature.unmount();
      el.remove();
    },
    onAction(a) {
      if (!FEATURE_ACTIONS.has(a)) return a === 'up' || a === 'down';
      return feature.onAction(a as 'confirm');
    },
    update: (dt, analog) => feature.update?.(dt, analog),
  };
}
