import type { ContentLabel } from '../schema';

/**
 * Dialogue, briefing / debrief, objectives, hints, failure texts and Two Lenses pairs for
 * Chapter 1. Everything is a locale key (src/locales/he/ch01.json). Noa and Dr. Samir Haddad are
 * FICTIONAL COMPOSITES; lines with facts carry source IDs.
 */

export type SpeakerId = 'noa' | 'samir' | 'narrator';

export interface DialogueLine {
  readonly speaker: SpeakerId;
  readonly textKey: string;
  readonly label: ContentLabel;
  readonly sources: readonly string[];
}

export interface FailureText {
  readonly id: string;
  /** "What really happened" text shown after a failure. */
  readonly textKey: string;
  readonly label: ContentLabel;
  readonly sources: readonly string[];
}

export interface MissionScript {
  readonly missionId: string;
  readonly briefing: readonly DialogueLine[];
  readonly debrief: readonly DialogueLine[];
  readonly objectiveKeys: readonly string[];
  readonly checkpointKeys: readonly string[];
  readonly hintKeys: readonly string[];
  readonly failures: readonly FailureText[];
  /** A warm human moment (RECONSTRUCTED or composite). */
  readonly momentKey: string;
}

export interface Lens {
  readonly whoKey: string;
  readonly textKey: string;
}

/** Accepted facts first, then each narrative in its own terms, then shared ground. */
export interface TwoLenses {
  readonly id: string;
  readonly topicKey: string;
  readonly factsKey: string;
  readonly lenses: readonly Lens[];
  readonly sharedKey: string;
  readonly sources: readonly string[];
}

const line = (speaker: SpeakerId, textKey: string, sources: readonly string[] = []): DialogueLine => ({
  speaker,
  textKey,
  // Noa and Samir are composites; the narrator states sourced facts (documented) or framing (reconstructed).
  label: speaker === 'narrator' ? (sources.length > 0 ? 'documented' : 'reconstructed') : 'composite',
  sources,
});

const keys = (prefix: string, names: readonly string[]): string[] => names.map((n) => prefix + n);

const failure = (id: string, textKey: string, sources: readonly string[], label: ContentLabel = 'documented'): FailureText => ({ id, textKey, label, sources });

const P = (short: string): string => 'ch01.' + short + '.';

export const MISSION_SCRIPTS: readonly MissionScript[] = [
  {
    missionId: 'tower-and-stockade',
    briefing: [
      line('noa', P('tower') + 'b1', ['C1-058']),
      line('samir', P('tower') + 'b2', ['C1-108']),
      line('noa', P('tower') + 'b3', ['C1-065']),
      line('samir', P('tower') + 'b4', ['C1-101', 'C1-103']),
      line('noa', P('tower') + 'b5'),
    ],
    debrief: [
      line('noa', P('tower') + 'd1', ['C1-065']),
      line('samir', P('tower') + 'd2', ['C1-101', 'C1-103']),
      line('noa', P('tower') + 'd3', ['C1-102', 'C1-103']),
      line('samir', P('tower') + 'd4'),
    ],
    objectiveKeys: keys(P('tower'), ['o1', 'o2', 'o3', 'o4', 'o5']),
    checkpointKeys: keys(P('tower'), ['cp1', 'cp2', 'cp3', 'cp4', 'cp5']),
    hintKeys: keys(P('tower'), ['h1', 'h2', 'h3']),
    failures: [
      failure('time-out', P('tower') + 'f1', ['C1-065']),
      failure('unfilled-wall', P('tower') + 'f2', ['C1-065']),
      failure('wrong-order', P('tower') + 'f3', ['C1-065'], 'reconstructed'),
    ],
    momentKey: P('tower') + 'moment',
  },
  {
    missionId: 'night-landing',
    briefing: [
      line('noa', P('landing') + 'b1', ['C1-055']),
      line('samir', P('landing') + 'b2', ['C1-002', 'C1-101']),
      line('noa', P('landing') + 'b3'),
      line('narrator', P('landing') + 'b4'),
      line('samir', P('landing') + 'b5', ['C1-055']),
    ],
    debrief: [
      line('noa', P('landing') + 'd1', ['C1-055']),
      line('samir', P('landing') + 'd2', ['C1-002', 'C1-101']),
      line('noa', P('landing') + 'd3'),
    ],
    objectiveKeys: keys(P('landing'), ['o1', 'o2', 'o3', 'o4', 'o5']),
    checkpointKeys: keys(P('landing'), ['cp1', 'cp2', 'cp3', 'cp4', 'cp5']),
    hintKeys: keys(P('landing'), ['h1', 'h2', 'h3']),
    failures: [
      failure('spotted', P('landing') + 'f1', ['C1-055']),
      failure('too-late', P('landing') + 'f2', ['C1-055']),
      failure('intercepted', P('landing') + 'f3', ['C1-055']),
    ],
    momentKey: P('landing') + 'moment',
  },
  {
    missionId: 'the-vote',
    briefing: [
      line('noa', P('vote') + 'b1', ['C1-060']),
      line('samir', P('vote') + 'b2', ['C1-060']),
      line('noa', P('vote') + 'b3'),
      line('samir', P('vote') + 'b4'),
      line('noa', P('vote') + 'b5', ['C1-060']),
    ],
    debrief: [
      line('noa', P('vote') + 'd1', ['C1-060', 'C1-057']),
      line('samir', P('vote') + 'd2', ['C1-101']),
      line('noa', P('vote') + 'd3', ['C1-060']),
    ],
    objectiveKeys: keys(P('vote'), ['o1', 'o2', 'o3', 'o4', 'o5']),
    checkpointKeys: keys(P('vote'), ['cp1', 'cp2', 'cp3', 'cp4', 'cp5']),
    hintKeys: keys(P('vote'), ['h1', 'h2', 'h3']),
    failures: [
      failure('icj-misread', P('vote') + 'f1', ['C1-101']),
      failure('result-change', P('vote') + 'f2', ['C1-060', 'C1-101']),
      failure('jerusalem-missed', P('vote') + 'f3', ['C1-060']),
    ],
    momentKey: P('vote') + 'moment',
  },
];

/** The Vote: party statements, each in its own terms (keys ch01.vote.s.*), plus map notes. */
export const VOTE_STATEMENT_KEYS: readonly string[] = [
  'ch01.vote.s.yishuv',
  'ch01.vote.s.palestinians',
  'ch01.vote.s.arabstates',
  'ch01.vote.s.britain',
];
export const VOTE_MAP_KEYS: readonly string[] = ['ch01.vote.map1', 'ch01.vote.map2', 'ch01.vote.map3'];

const lens = (who: 'zionist' | 'palestinian' | 'british', textKey: string): Lens => ({ whoKey: 'ch01.lens.' + who, textKey });

const twoLenses = (id: string, sources: readonly string[], extra: readonly ('british')[] = []): TwoLenses => ({
  id,
  topicKey: 'ch01.lens.' + id + '.topic',
  factsKey: 'ch01.lens.' + id + '.facts',
  lenses: [
    lens('zionist', 'ch01.lens.' + id + '.zionist'),
    lens('palestinian', 'ch01.lens.' + id + '.palestinian'),
    ...extra.map((w) => lens(w, 'ch01.lens.' + id + '.' + w)),
  ],
  sharedKey: 'ch01.lens.' + id + '.shared',
  sources,
});

export const TWO_LENSES: readonly TwoLenses[] = [
  twoLenses('1929', ['C1-059', 'C1-101', 'C1-105']),
  twoLenses('revolt', ['C1-058', 'C1-059', 'C1-101', 'C1-103']),
  twoLenses('land', ['C1-064', 'C1-065', 'C1-101', 'C1-102', 'C1-103']),
  twoLenses('immigration', ['C1-002', 'C1-059', 'C1-055', 'C1-101'], ['british']),
  twoLenses('partition', ['C1-058', 'C1-060', 'C1-101']),
];

/** Speaker display-name keys. */
export const SPEAKER_KEYS: Readonly<Record<SpeakerId, string>> = {
  noa: 'ch01.speaker.noa',
  samir: 'ch01.speaker.samir',
  narrator: 'ch01.speaker.narrator',
};

/** Every locale key referenced by this file, for tests. */
export function dialogueKeys(): string[] {
  const out: string[] = [...Object.values(SPEAKER_KEYS), ...VOTE_STATEMENT_KEYS, ...VOTE_MAP_KEYS];
  for (const m of MISSION_SCRIPTS) {
    for (const l of [...m.briefing, ...m.debrief]) out.push(l.textKey);
    out.push(...m.objectiveKeys, ...m.checkpointKeys, ...m.hintKeys, m.momentKey);
    for (const f of m.failures) out.push(f.textKey);
  }
  for (const t of TWO_LENSES) {
    out.push(t.topicKey, t.factsKey, t.sharedKey);
    for (const l of t.lenses) out.push(l.whoKey, l.textKey);
  }
  return out;
}
