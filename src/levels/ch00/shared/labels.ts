/** Pure model of the label-sorting step: three cards, three trays, keyboard / controller driven. */

export type LabelId = 'documented' | 'reconstructed' | 'composite';
export type CardId = 'basel' | 'guides' | 'jaffa';

export const TRAYS: readonly LabelId[] = ['documented', 'reconstructed', 'composite'];

export interface SortCard {
  readonly id: CardId;
  readonly textKey: string;
  readonly answer: LabelId;
  /** Mission failure reason shown the first time this card is misplaced (null: inline hint only). */
  readonly failureReason: string | null;
  readonly hintKey: string;
}

export const SORT_CARDS: readonly SortCard[] = [
  { id: 'basel', textKey: 'levels.ch00.archive.sort.card.basel', answer: 'documented', failureReason: 'label-basel', hintKey: 'ch00.fail.label-basel.hint' },
  { id: 'guides', textKey: 'levels.ch00.archive.sort.card.guides', answer: 'composite', failureReason: 'label-guides', hintKey: 'ch00.fail.label-guides.hint' },
  { id: 'jaffa', textKey: 'levels.ch00.archive.sort.card.jaffa', answer: 'reconstructed', failureReason: null, hintKey: 'levels.ch00.archive.sort.hint.jaffa' },
];

export type SortCommand = 'next' | 'prev' | 'confirm' | 'back';

export interface SortOutcome {
  readonly kind: 'none' | 'moved' | 'picked' | 'released' | 'placed' | 'wrong' | 'close';
  readonly card: SortCard | null;
  /** For 'wrong': true the first time this card is misplaced. */
  readonly first: boolean;
}

const NONE: SortOutcome = { kind: 'none', card: null, first: false };

export class LabelSorter {
  /** Cards placed correctly, in placement order. */
  readonly placed: CardId[] = [];
  /** Index into the unplaced cards. */
  cardCursor = 0;
  trayCursor = 0;
  held: SortCard | null = null;
  constructor(
    placed: readonly string[] = [],
    /** Shared across retries so the failure card appears only for the first mistake. */
    private readonly mistakes: Set<CardId> = new Set<CardId>(),
  ) {
    for (const id of placed) if (SORT_CARDS.some((c) => c.id === id)) this.placed.push(id as CardId);
  }

  get complete(): boolean {
    return this.placed.length === SORT_CARDS.length;
  }

  unplaced(): SortCard[] {
    return SORT_CARDS.filter((c) => !this.placed.includes(c.id));
  }

  trayOf(id: CardId): LabelId | null {
    return this.placed.includes(id) ? (SORT_CARDS.find((c) => c.id === id)?.answer ?? null) : null;
  }

  get mistakeCount(): number {
    return this.mistakes.size;
  }

  step(cmd: SortCommand): SortOutcome {
    const rest = this.unplaced();
    if (this.held === null) {
      if (cmd === 'back') return { kind: 'close', card: null, first: false };
      if (rest.length === 0) return NONE;
      if (cmd === 'next' || cmd === 'prev') {
        this.cardCursor = (this.cardCursor + (cmd === 'next' ? 1 : rest.length - 1)) % rest.length;
        return { kind: 'moved', card: null, first: false };
      }
      const card = rest[this.cardCursor % rest.length] ?? null;
      if (!card) return NONE;
      this.held = card;
      this.trayCursor = 0;
      return { kind: 'picked', card, first: false };
    }
    const card = this.held;
    if (cmd === 'back') {
      this.held = null;
      return { kind: 'released', card, first: false };
    }
    if (cmd === 'next' || cmd === 'prev') {
      this.trayCursor = (this.trayCursor + (cmd === 'next' ? 1 : TRAYS.length - 1)) % TRAYS.length;
      return { kind: 'moved', card: null, first: false };
    }
    this.held = null;
    if (TRAYS[this.trayCursor] === card.answer) {
      this.placed.push(card.id);
      this.cardCursor = 0;
      return { kind: 'placed', card, first: false };
    }
    const first = !this.mistakes.has(card.id);
    this.mistakes.add(card.id);
    return { kind: 'wrong', card, first };
  }
}
