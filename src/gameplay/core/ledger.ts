import type { ContentLabel } from '../../content/schema';
import type { SaveData } from '../../core/save/schema';

/** Decisions with consequences (DEC missions) and the Choice Ledger (DESIGN feature 6). */

export interface DecisionOption {
  readonly id: string;
  readonly labelKey: string;
  /** What this choice leads to in the game (shown after choosing and in the debrief). */
  readonly consequenceKey: string;
}

export interface HistoricalDecision {
  /** The option that matches what was really decided, or null when none of them does. */
  readonly optionId: string | null;
  /** Sourced text: what was decided and what followed for every side. */
  readonly textKey: string;
  readonly sources: readonly string[];
  readonly label: ContentLabel;
}

export interface DecisionDef {
  /** Globally unique (kebab-case, prefixed by the mission): the key in save.choices. */
  readonly id: string;
  readonly promptKey: string;
  readonly contextKey?: string;
  readonly options: readonly DecisionOption[];
  readonly historical: HistoricalDecision;
}

export interface LedgerRow {
  readonly decision: DecisionDef;
  readonly chosen: DecisionOption | null;
  /** True when the player chose what was historically decided. */
  readonly matchesHistory: boolean;
}

export function validateDecision(d: DecisionDef): string[] {
  const out: string[] = [];
  if (d.options.length < 2) out.push(d.id + ': needs at least 2 options');
  const ids = new Set(d.options.map((o) => o.id));
  if (ids.size !== d.options.length) out.push(d.id + ': duplicate option ids');
  if (d.historical.optionId !== null && !ids.has(d.historical.optionId)) out.push(d.id + ': historical option is not an option');
  if (d.historical.label === 'documented' && d.historical.sources.length === 0) out.push(d.id + ': documented history needs sources');
  return out;
}

/** Returns a new save with the choice recorded (save.choices: decisionId -> optionId). */
export function recordChoice(state: SaveData, decision: DecisionDef, optionId: string): SaveData {
  if (!decision.options.some((o) => o.id === optionId)) throw new Error('Unknown option ' + optionId + ' for ' + decision.id);
  return { ...state, choices: { ...state.choices, [decision.id]: optionId } };
}

/** Ledger rows for the debrief: the player's choice next to the historical decision. */
export function ledgerRows(decisions: readonly DecisionDef[], choices: Readonly<Record<string, string>>): LedgerRow[] {
  return decisions.map((decision) => {
    const chosenId = Object.hasOwn(choices, decision.id) ? choices[decision.id] : undefined;
    const chosen = decision.options.find((o) => o.id === chosenId) ?? null;
    return { decision, chosen, matchesHistory: chosen !== null && chosen.id === decision.historical.optionId };
  });
}
