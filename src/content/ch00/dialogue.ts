import type { ContentLabel } from '../schema';

/**
 * Prologue dialogue, narration, briefing, debrief, hints and failure texts (locale keys only).
 * Guides Noa and Dr. Samir Haddad and all NPCs are FICTIONAL COMPOSITES.
 */

export type Speaker = 'noa' | 'samir' | 'narrator' | 'habib' | 'debora' | 'jamila' | 'eliyahu';

export const speakerKey = (s: Speaker): string => 'ch00.speaker.' + s;

export interface DialogueLine {
  readonly key: string;
  readonly speaker: Speaker;
}

const line = (key: string, speaker: Speaker): DialogueLine => ({ key: 'ch00.' + key, speaker });

export const GUIDES_NOTE_KEY = 'ch00.hub.guides.note';
export const NPC_LABEL_KEY = 'ch00.label.composite-npc';

export const HUB_LINES: Readonly<Record<string, readonly DialogueLine[]>> = {
  welcome: [line('hub.welcome.noa', 'noa'), line('hub.welcome.samir', 'samir')],
  idle: [
    line('hub.idle.noa.1', 'noa'),
    line('hub.idle.samir.1', 'samir'),
    line('hub.idle.noa.2', 'noa'),
    line('hub.idle.samir.2', 'samir'),
    line('hub.idle.noa.3', 'noa'),
    line('hub.idle.samir.3', 'samir'),
  ],
  return: [line('hub.return.noa', 'noa')],
  choose: [line('hub.choose.noa', 'noa')],
  afterArchive: [line('hub.after.archive.noa', 'noa'), line('hub.after.archive.samir', 'samir')],
  afterJaffa: [line('hub.after.jaffa.noa', 'noa'), line('hub.after.jaffa.samir', 'samir')],
  chapterComplete: [line('hub.chapter.complete.noa', 'noa'), line('hub.chapter.complete.samir', 'samir')],
};

/** Mission lines keyed by mission id, then by checkpoint id. */
export const MISSION_LINES: Readonly<Record<string, Readonly<Record<string, readonly DialogueLine[]>>>> = {
  'archive-at-night': {
    arrival: [line('line.archive.arrival.noa', 'noa')],
    reading_room: [line('line.archive.reading_room.samir', 'samir')],
    codex_ledger: [line('line.archive.codex_ledger.noa', 'noa')],
    first_document: [line('line.archive.first_document.noa', 'noa'), line('line.archive.first_document.samir', 'samir')],
    labels_table: [line('line.archive.labels_table.samir', 'samir'), line('line.archive.labels_table.noa', 'noa')],
    document_opens: [line('line.archive.document_opens.noa', 'noa'), line('line.archive.document_opens.samir', 'samir')],
  },
  'letters-from-jaffa': {
    port_start: [line('line.jaffa.port_start.habib', 'habib'), line('line.jaffa.port_start.narrator', 'narrator')],
    loaded: [line('line.jaffa.loaded.habib', 'habib')],
    road_colony: [line('line.jaffa.road_colony.narrator', 'narrator')],
    colony_delivered: [line('line.jaffa.colony_delivered.debora', 'debora')],
    village_arrival: [line('line.jaffa.village_arrival.narrator', 'narrator')],
    village_delivered: [line('line.jaffa.village_delivered.jamila', 'jamila')],
    station: [line('line.jaffa.station.narrator', 'narrator')],
    jerusalem_delivered: [line('line.jaffa.jerusalem_delivered.eliyahu', 'eliyahu')],
    complete: [
      line('line.jaffa.complete.noa', 'noa'),
      line('line.jaffa.complete.samir', 'samir'),
      line('line.jaffa.codex.noa', 'noa'),
      line('line.jaffa.lens.samir', 'samir'),
    ],
  },
};

export const TUTORIAL_STEPS = ['move', 'look', 'interact', 'codex', 'archive', 'pause', 'labels'] as const;
export const tutorialKey = (step: string): string => 'ch00.tut.' + step;
export const TUTORIAL_DONE_KEY = 'ch00.tut.done';

export const OBJECTIVE_KEYS: Readonly<Record<string, readonly string[]>> = {
  'archive-at-night': [1, 2, 3, 4, 5, 6].map((n) => 'ch00.obj.archive.' + String(n)),
  'letters-from-jaffa': [1, 2, 3, 4, 5, 6].map((n) => 'ch00.obj.jaffa.' + String(n)),
};

export const BRIEFING_KEYS = {
  chapter: { title: 'ch00.brief.chapter.title', body: 'ch00.brief.chapter.body' },
  'archive-at-night': { title: 'ch00.brief.archive.title', body: 'ch00.brief.archive.body' },
  'letters-from-jaffa': { title: 'ch00.brief.jaffa.title', body: 'ch00.brief.jaffa.body' },
} as const;

export const DEBRIEF_KEYS = {
  chapter: 'ch00.debrief.chapter.body',
  'archive-at-night': 'ch00.debrief.archive.body',
  'letters-from-jaffa': 'ch00.debrief.jaffa.body',
} as const;

/** Per-checkpoint hints, offered (never forced) after repeated failures. */
export const HINT_KEYS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'archive-at-night': {
    arrival: 'ch00.hint.archive.arrival',
    reading_room: 'ch00.hint.archive.reading_room',
    codex_ledger: 'ch00.hint.archive.codex_ledger',
    first_document: 'ch00.hint.archive.first_document',
    labels_table: 'ch00.hint.archive.labels_table',
  },
  'letters-from-jaffa': {
    port_start: 'ch00.hint.jaffa.port_start',
    loaded: 'ch00.hint.jaffa.loaded',
    road_colony: 'ch00.hint.jaffa.road_colony',
    village_arrival: 'ch00.hint.jaffa.village_arrival',
    station: 'ch00.hint.jaffa.station',
    jerusalem_delivered: 'ch00.hint.jaffa.jerusalem',
  },
};

export interface FailureText {
  readonly id: string;
  readonly missionId: string;
  readonly titleKey: string;
  /** "What really happened" shown on the failure card. */
  readonly whatReallyHappenedKey: string;
  readonly hintKey: string;
  readonly label: ContentLabel;
  readonly sources: readonly string[];
}

function failure(id: string, missionId: string, label: ContentLabel, sources: readonly string[]): FailureText {
  return {
    id,
    missionId,
    titleKey: 'ch00.fail.' + id + '.title',
    whatReallyHappenedKey: 'ch00.fail.' + id + '.body',
    hintKey: 'ch00.fail.' + id + '.hint',
    label,
    sources,
  };
}

export const FAILURES: readonly FailureText[] = [
  failure('label-basel', 'archive-at-night', 'documented', ['P-044']),
  failure('label-guides', 'archive-at-night', 'composite', []),
  failure('missed-train', 'letters-from-jaffa', 'documented', ['P-055']),
  failure('wrong-addressee', 'letters-from-jaffa', 'documented', ['P-054']),
  failure('field-crossing', 'letters-from-jaffa', 'documented', ['P-053']),
  failure('colony-no-parts', 'letters-from-jaffa', 'documented', ['P-047']),
];

export const CUTSCENE_LINE_KEYS: readonly string[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => 'ch00.cut.line.' + String(n));

/** Every locale key this module references, for tests. */
export function allDialogueKeys(): string[] {
  const keys = new Set<string>();
  const add = (k: string): void => {
    keys.add(k);
  };
  for (const s of ['noa', 'samir', 'narrator', 'habib', 'debora', 'jamila', 'eliyahu'] as const) add(speakerKey(s));
  add(GUIDES_NOTE_KEY);
  add(NPC_LABEL_KEY);
  for (const group of Object.values(HUB_LINES)) for (const l of group) add(l.key);
  for (const mission of Object.values(MISSION_LINES)) for (const cp of Object.values(mission)) for (const l of cp) add(l.key);
  for (const s of TUTORIAL_STEPS) add(tutorialKey(s));
  add(TUTORIAL_DONE_KEY);
  for (const list of Object.values(OBJECTIVE_KEYS)) list.forEach(add);
  for (const b of Object.values(BRIEFING_KEYS)) {
    add(b.title);
    add(b.body);
  }
  Object.values(DEBRIEF_KEYS).forEach(add);
  for (const m of Object.values(HINT_KEYS)) Object.values(m).forEach(add);
  for (const f of FAILURES) {
    add(f.titleKey);
    add(f.whatReallyHappenedKey);
    add(f.hintKey);
  }
  CUTSCENE_LINE_KEYS.forEach(add);
  return [...keys];
}
