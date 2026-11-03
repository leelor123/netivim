import type { GameplayType } from '../core/mission';

/** BRIEF 5: every piece of content says how it relates to the historical record. */
export type ContentLabel = 'documented' | 'reconstructed' | 'composite';

export interface Sourced {
  /** kebab-case, unique per kind. */
  readonly id: string;
  readonly label: ContentLabel;
  /** IDs from the chapter source registers (P-001, C1-001, ...). Documented items need one or more. */
  readonly sources: readonly string[];
}

export type CodexCategory = 'person' | 'place' | 'unit' | 'operation' | 'treaty' | 'organization' | 'concept' | 'event';

export interface CodexEntry extends Sourced {
  readonly category: CodexCategory;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly year: number;
}

export type ArchiveLicense = 'public-domain' | 'recreation' | 'excerpt';

export interface ArchiveItem extends Sourced {
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly provenanceKey: string;
  readonly license: ArchiveLicense;
  readonly year: number;
}

export interface Testimony extends Sourced {
  readonly speakerKey: string;
  /** Paraphrase, never an invented quote. */
  readonly bodyKey: string;
}

export interface Fact extends Sourced {
  readonly textKey: string;
}

export interface QuizQuestion extends Sourced {
  readonly promptKey: string;
  readonly optionKeys: readonly string[];
  readonly correctIndex: number;
  readonly explanationKey: string;
}

export interface MissionMeta extends Sourced {
  readonly gameplayType: GameplayType;
  readonly titleKey: string;
  readonly summaryKey: string;
  readonly minutes: number;
  readonly learningGoalKeys: readonly string[];
}

export interface ChapterContent {
  readonly id: string;
  readonly titleKey: string;
  readonly years: readonly [number, number];
  /** Show a content note before entering (BRIEF 4.11). */
  readonly contentNote: boolean;
  readonly missions: readonly MissionMeta[];
  readonly codex: readonly CodexEntry[];
  readonly archive: readonly ArchiveItem[];
  readonly testimonies: readonly Testimony[];
  readonly facts: readonly Fact[];
  readonly quiz: readonly QuizQuestion[];
}

export interface ValidationContext {
  readonly sourceIds: ReadonlySet<string>;
  readonly localeKeys: ReadonlySet<string>;
  /** Tutorial chapters may have fewer missions. */
  readonly minMissions?: number;
}
