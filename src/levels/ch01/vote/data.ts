import type { DecisionDef } from '../../../gameplay/core/ledger';
import { VOTE_STATEMENT_KEYS } from '../../../content/ch01/dialogue';

/**
 * Data of Chapter 1 mission 3, "The Vote" (29 Nov 1947): ids, layout, decisions and the exact
 * locale keys used for sourced lines. Pure (no three.js), shared by the level, the bot script and
 * the tests. Facts are never written here: every factual line is an existing key from
 * src/locales/he/ch01.json; the composite characters (src/locales/he/levels-ch01-vote.json) only
 * speak feelings and hesitations.
 */

export const L = (k: string): string => 'levels.ch01.vote.' + k;

export type VoteState = 'map' | 'statements' | 'visits' | 'note' | 'vote';
export type VoteEvent = 'mapDone' | 'statementsDone' | 'visitsDone' | 'noteDone' | 'heard';

export type Party = 'yishuv' | 'palestinians' | 'arabstates' | 'britain';
export const PARTIES: readonly Party[] = ['yishuv', 'palestinians', 'arabstates', 'britain'];

export type PlaceId = 'yishuv' | 'palestinians' | 'britain';
export const PLACES: readonly PlaceId[] = ['yishuv', 'palestinians', 'britain'];

/** Statement i (ch01.vote.s.*) belongs to PARTIES[i]; the cards are laid out in this shuffled order. */
export const CARD_SLOT_OF_PARTY: readonly number[] = [2, 0, 3, 1];
export function statementKey(party: Party): string {
  return VOTE_STATEMENT_KEYS[PARTIES.indexOf(party)] as string;
}

export const MAP_LAYERS = [
  { id: 'zones', titleKey: L('layer.zones'), factKey: 'ch01.vote.map1' },
  { id: 'people', titleKey: L('layer.people'), factKey: 'ch01.vote.map2' },
  { id: 'jerusalem', titleKey: L('layer.jerusalem'), factKey: 'ch01.vote.map3' },
  { id: 'peel', titleKey: L('layer.peel'), factKey: 'ch01.fact.peel-zones' },
] as const;
export type MapLayerId = (typeof MAP_LAYERS)[number]['id'];

export interface QuestionDef {
  readonly promptKey: string;
  /** What the composite person says first (feeling, no facts). */
  readonly humanKey: string;
  /** The sourced line shown next (existing ch01 key). */
  readonly factKey: string;
  readonly unlock?: { readonly kind: 'codex' | 'fact' | 'archive'; readonly id: string };
}

export interface PlaceDef {
  readonly id: PlaceId;
  readonly speakerKey: string;
  readonly greetKey: string;
  /** Composite person's closing words after the advice is logged (feelings only, no facts). */
  readonly farewellKey: string;
  readonly questions: readonly QuestionDef[];
  readonly adviceId: string;
  readonly listenOptionId: PlaceId;
}

const q = (place: PlaceId, n: number, factKey: string, unlock?: QuestionDef['unlock']): QuestionDef => ({
  promptKey: L('ask.' + place + '.' + String(n)),
  humanKey: L('human.' + place + '.' + String(n)),
  factKey,
  ...(unlock ? { unlock } : {}),
});

export const PLACE_DEFS: Readonly<Record<PlaceId, PlaceDef>> = {
  yishuv: {
    id: 'yishuv',
    speakerKey: L('speaker.yishuv'),
    greetKey: L('greet.yishuv'),
    farewellKey: L('farewell.yishuv'),
    questions: [q('yishuv', 1, 'ch01.lens.partition.zionist'), q('yishuv', 2, 'ch01.vote.s.yishuv'), q('yishuv', 3, 'ch01.vote.map3')],
    adviceId: 'the-vote-advice-yishuv',
    listenOptionId: 'yishuv',
  },
  palestinians: {
    id: 'palestinians',
    speakerKey: L('speaker.palestinians'),
    greetKey: L('greet.palestinians'),
    farewellKey: L('farewell.palestinians'),
    questions: [q('palestinians', 1, 'ch01.vote.s.palestinians'), q('palestinians', 2, 'ch01.vote.map2'), q('palestinians', 3, 'ch01.vote.s.arabstates')],
    adviceId: 'the-vote-advice-palestinians',
    listenOptionId: 'palestinians',
  },
  britain: {
    id: 'britain',
    speakerKey: L('speaker.britain'),
    greetKey: L('greet.britain'),
    farewellKey: L('farewell.britain'),
    questions: [
      q('britain', 1, 'ch01.vote.s.britain'),
      q('britain', 2, 'ch01.fact.uk-abstained', { kind: 'fact', id: 'uk-abstained' }),
      q('britain', 3, 'ch01.vote.map3'),
    ],
    adviceId: 'the-vote-advice-britain',
    listenOptionId: 'britain',
  },
};

export const DECISION_PREPARE = 'the-vote-prepare';
export const DECISION_LISTEN = 'the-vote-listen';
export const DECISION_NEIGHBOR = 'the-vote-neighbor';

export const FAILURE_STATEMENT = 'icj-misread';
export const FAILURE_COUNT = 'result-change';
export const FAILURE_JERUSALEM = 'jerusalem-missed';

const opt = (id: string, d: string): { id: string; labelKey: string; consequenceKey: string } => ({ id, labelKey: L('d.' + d + '.' + id), consequenceKey: L('d.' + d + '.' + id + '.result') });

export const DECISIONS: readonly DecisionDef[] = [
  {
    id: DECISION_PREPARE,
    promptKey: L('d.prepare.prompt'),
    contextKey: L('d.prepare.context'),
    options: [opt('numbers', 'prepare'), opt('jerusalem', 'prepare'), opt('voices', 'prepare')],
    historical: { optionId: null, textKey: L('d.prepare.history'), sources: ['C1-060', 'C1-057'], label: 'reconstructed' },
  },
  {
    id: DECISION_LISTEN,
    promptKey: L('d.listen.prompt'),
    options: [opt('yishuv', 'listen'), opt('palestinians', 'listen'), opt('britain', 'listen')],
    historical: { optionId: null, textKey: L('d.listen.history'), sources: ['C1-060', 'C1-101'], label: 'reconstructed' },
  },
  {
    id: 'the-vote-advice-yishuv',
    promptKey: L('d.yishuv.prompt'),
    options: [opt('reserve', 'yishuv'), opt('all', 'yishuv'), opt('reject', 'yishuv')],
    historical: { optionId: 'reserve', textKey: L('d.yishuv.history'), sources: ['C1-058', 'C1-060', 'C1-101'], label: 'documented' },
  },
  {
    id: 'the-vote-advice-palestinians',
    promptKey: L('d.palestinians.prompt'),
    options: [opt('court', 'palestinians'), opt('accept', 'palestinians'), opt('reject', 'palestinians')],
    historical: { optionId: 'court', textKey: L('d.palestinians.history'), sources: ['C1-101'], label: 'documented' },
  },
  {
    id: 'the-vote-advice-britain',
    promptKey: L('d.britain.prompt'),
    options: [opt('abstain', 'britain'), opt('for', 'britain'), opt('against', 'britain')],
    historical: { optionId: 'abstain', textKey: 'ch01.fact.uk-abstained', sources: ['C1-060'], label: 'documented' },
  },
  {
    id: DECISION_NEIGHBOR,
    promptKey: L('d.neighbor.prompt'),
    options: [opt('honest', 'neighbor'), opt('promise', 'neighbor'), opt('quiet', 'neighbor')],
    historical: { optionId: null, textKey: L('d.neighbor.history'), sources: ['C1-101'], label: 'reconstructed' },
  },
];

/** Best-effort order of options as the bot picks them: the documented one where there is one. */
export const BOT_CHOICES: Readonly<Record<string, string>> = {
  [DECISION_PREPARE]: 'voices',
  [DECISION_LISTEN]: 'yishuv',
  'the-vote-advice-yishuv': 'reserve',
  'the-vote-advice-palestinians': 'court',
  'the-vote-advice-britain': 'abstain',
  [DECISION_NEIGHBOR]: 'honest',
};

// ---- layout (meters; +z is north, heading 0 faces +z) -------------------------------------

export interface RoomSpec {
  readonly id: string;
  readonly cx: number;
  readonly cz: number;
  readonly w: number;
  readonly d: number;
  /** Door gap center on the wall: which side and where. */
  readonly door: { readonly side: 'n' | 's' | 'e' | 'w'; readonly offset: number; readonly width: number };
}

export const HALL: RoomSpec = { id: 'hall', cx: 0, cz: -43, w: 20, d: 14, door: { side: 'n', offset: 0, width: 3.4 } };
export const HOME: RoomSpec = { id: 'home', cx: -30, cz: 4, w: 12, d: 9, door: { side: 'e', offset: 0, width: 3 } };
export const OFFICE: RoomSpec = { id: 'office', cx: 0, cz: 30, w: 12, d: 9, door: { side: 's', offset: 0, width: 3 } };
/** Courtyard of the Arab town: low wall, gap on the west side. */
export const COURT: RoomSpec = { id: 'court', cx: 32, cz: 4, w: 14, d: 11, door: { side: 'w', offset: 0, width: 3.4 } };
export const ROOMS: readonly RoomSpec[] = [HALL, HOME, OFFICE, COURT];

export const SPAWN = { x: 0, z: -41.2, heading: Math.PI };
/**
 * Where the player stands, and which way, when a checkpoint starts. The follow camera sits 6.5 m
 * behind the player, so in the 14 m deep hall the player faces along the 20 m width (west), which
 * keeps the camera clear of the walls and frames the planning table and the cards.
 */
export const CHECKPOINT_SPAWN: Readonly<Record<VoteState, { x: number; z: number; heading: number }>> = {
  map: { x: 2.5, z: -43, heading: -Math.PI / 2 },
  statements: { x: 2.5, z: -41.5, heading: -Math.PI / 2 },
  visits: { x: 0, z: -12.5, heading: 0 },
  note: { x: -4, z: -1.5, heading: 0 },
  vote: { x: 0, z: -3.5, heading: 0 },
};
export const TABLE = { x: -5.5, z: -44.5, hw: 2.2, hd: 1.3, stand: { x: -5.5, z: -41.9 } };
export const CARD_TABLE = { x: 5.2, z: -46.4, hw: 3.5, hd: 0.7 };
export const CARD_SPOTS: readonly { readonly x: number; readonly z: number }[] = [2.7, 4.3, 5.9, 7.5].map((x) => ({ x, z: -44.9 }));
export const STATION_SPOTS: readonly { readonly x: number; readonly z: number }[] = [-8, -5.4, 5.4, 8].map((x) => ({ x, z: -38.4 }));
/** Stations along the south wall, in PARTIES order. */
export const STATION_X_OF_PARTY: readonly number[] = [-8, -5.4, 5.4, 8];

export const SQUARE = { x: 0, z: 2 };
export const SIGN = { x: 0, z: -9 };
export const RADIO = { x: 0, z: 4.2 };
export const NOTE_DESK = { x: -7, z: -4, jerusalem: { x: -8.4, z: -3.2 }, typewriter: { x: -5.7, z: -3.2 } };
/** Four slips on the note desk, one per party (PARTIES order); the page and typewriter keep their spots. */
export const NOTE_POINTS: readonly { readonly x: number; readonly z: number }[] = [-10.0, -9.3, -7.7, -7.0].map((x) => ({ x, z: -3.0 }));
export const TALLY = { x: 4.6, z: 5.4 };
export const NEIGHBOR = { x: -2.4, z: 2.2 };

export const PLACE_ENTRY: Readonly<Record<PlaceId, { x: number; z: number; talkRadius: number }>> = {
  yishuv: { x: -26, z: 4, talkRadius: 4.5 },
  palestinians: { x: 28, z: 4, talkRadius: 4.5 },
  britain: { x: 0, z: 27.6, talkRadius: 4.5 },
};

/** Question and advice spots in front of the composite people. */
export const PLACE_SPOTS: Readonly<Record<PlaceId, { questions: readonly { x: number; z: number }[]; advice: { x: number; z: number } }>> = {
  yishuv: { questions: [{ x: -31.4, z: 2.4 }, { x: -29.6, z: 2.4 }, { x: -27.8, z: 2.4 }], advice: { x: -29.6, z: 0.8 } },
  palestinians: { questions: [{ x: 31, z: 6.2 }, { x: 32.8, z: 6.2 }, { x: 34.6, z: 6.2 }], advice: { x: 32.8, z: 4.4 } },
  britain: { questions: [{ x: -2.4, z: 29.6 }, { x: 0, z: 29.6 }, { x: 2.4, z: 29.6 }], advice: { x: 0, z: 31.2 } },
};

/** Walk routes the bot follows through doors (straight lines between points never cross walls). */
export const ROUTE_HALL_TO_SQUARE: readonly (readonly [number, number])[] = [
  [0, -38],
  [0, -34],
  [0, -9.8],
];
export const ROUTE_PLACE: Readonly<Record<PlaceId, readonly (readonly [number, number])[]>> = {
  yishuv: [
    [-8, 2],
    [-23.2, 4],
    [-26, 4],
  ],
  palestinians: [
    [8, 3],
    [25.2, 4],
    [28, 4],
  ],
  britain: [
    [0, 12],
    [0, 24.8],
    [0, 27.6],
  ],
};

export const POINT_RADIUS = 0.62;
export const ASK_RADIUS = 0.75;
export const SPEAK_MS = 5200;
