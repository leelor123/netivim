import type { QuizQuestion } from '../../content/schema';

/**
 * Forgiving quiz (BRIEF 4): wrong answers can be retried, every correct answer earns a reward,
 * skipping is always possible and the quiz never blocks progress.
 */

export type AnswerResult = { readonly correct: true; readonly firstTry: boolean } | { readonly correct: false; readonly triesLeft: number };

export interface QuizScore {
  readonly total: number;
  readonly correct: number;
  readonly firstTry: number;
  readonly skipped: number;
  /** Stars 0-3: rewards only, never a gate. */
  readonly stars: number;
}

/** Wrong guesses allowed per question before the answer is revealed. */
export const QUIZ_TRIES = 2;

export class QuizSession {
  private index = 0;
  private tries = 0;
  private correctCount = 0;
  private firstTryCount = 0;
  private skippedCount = 0;
  private answeredCurrent = false;
  private readonly wrongPicks = new Set<number>();

  constructor(readonly questions: readonly QuizQuestion[]) {}

  get current(): QuizQuestion | null {
    return this.questions[this.index] ?? null;
  }

  get position(): number {
    return this.index;
  }

  get finished(): boolean {
    return this.index >= this.questions.length;
  }

  /** True once the current question is resolved (answered correctly or revealed). */
  get resolved(): boolean {
    return this.answeredCurrent || this.tries >= QUIZ_TRIES;
  }

  isWrongPick(option: number): boolean {
    return this.wrongPicks.has(option);
  }

  answer(option: number): AnswerResult {
    const q = this.current;
    if (!q || this.resolved) throw new Error('No open question');
    if (option === q.correctIndex) {
      const firstTry = this.tries === 0;
      this.answeredCurrent = true;
      this.correctCount++;
      if (firstTry) this.firstTryCount++;
      return { correct: true, firstTry };
    }
    if (!this.wrongPicks.has(option)) {
      this.wrongPicks.add(option);
      this.tries++;
    }
    return { correct: false, triesLeft: Math.max(0, QUIZ_TRIES - this.tries) };
  }

  /** Moves on; an unresolved question counts as skipped (no penalty). */
  next(): void {
    if (this.finished) return;
    if (!this.resolved) this.skippedCount++;
    this.index++;
    this.tries = 0;
    this.answeredCurrent = false;
    this.wrongPicks.clear();
  }

  /** Ends the quiz right away (never blocks progress). */
  skipAll(): void {
    while (!this.finished) this.next();
  }

  score(): QuizScore {
    const total = this.questions.length;
    const ratio = total === 0 ? 1 : (this.correctCount + this.firstTryCount) / (2 * total);
    const stars = this.correctCount === 0 ? 0 : ratio >= 0.95 ? 3 : ratio >= 0.6 ? 2 : 1;
    return { total, correct: this.correctCount, firstTry: this.firstTryCount, skipped: this.skippedCount, stars };
  }
}
