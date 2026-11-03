/** Layout, states and pure tutorial logic of "The Archive at Night" (meters, +z is forward at yaw 0). */

export type ArchiveState = 'arrival' | 'reading_room' | 'codex_ledger' | 'first_document' | 'lenses' | 'labels_table' | 'document_opens';
export type ArchiveEvent = 'entered' | 'warmed' | 'codex_read' | 'document_read' | 'lenses_seen' | 'sorted' | 'glowed';

export const STATE_ORDER: readonly ArchiveState[] = ['arrival', 'reading_room', 'codex_ledger', 'first_document', 'lenses', 'labels_table', 'document_opens'];

export const ROOM = { minX: -9, maxX: 9, minZ: -6, maxZ: 16, height: 5, doorHalf: 1.3, wall: 0.4 } as const;

export interface Spot {
  readonly x: number;
  readonly z: number;
}

export const SPAWNS: Readonly<Record<ArchiveState, Spot & { readonly heading: number }>> = {
  arrival: { x: 0, z: -12.5, heading: 0 },
  reading_room: { x: 0, z: -3.2, heading: 0 },
  codex_ledger: { x: 3, z: 4.8, heading: 0 },
  first_document: { x: 4, z: 9.4, heading: 0 },
  lenses: { x: -5, z: 10.2, heading: 0 },
  labels_table: { x: -1, z: 9.2, heading: 0 },
  document_opens: { x: 2, z: 9.8, heading: 0 },
};

/** Interaction spots (where the player stands) and the furniture they belong to. */
export const SPOTS = {
  door: { x: 0, z: -4.2 },
  lamp: { x: 6, z: 1.5 },
  drawer: { x: -6.5, z: 1.5 },
  ledger: { x: 6.2, z: 7.4 },
  cabinet: { x: -7, z: 12.9 },
  lensA: { x: -3.4, z: 8.2 },
  lensB: { x: -1.6, z: 8.2 },
  table: { x: 2, z: 11.2 },
} as const;

export const FURNITURE = {
  lampDesk: { x: 6, z: 3, hw: 1.3, hd: 0.6 },
  drawerCabinet: { x: -6.5, z: 2.8, hw: 0.9, hd: 0.4 },
  ledgerDesk: { x: 6.2, z: 8.8, hw: 1.2, hd: 0.6 },
  lensStand: { x: -2.5, z: 9.4, hw: 1.4, hd: 0.4 },
  docCabinet: { x: -7, z: 14.8, hw: 1.2, hd: 0.5 },
  labelsTable: { x: 2, z: 13.5, hw: 2.2, hd: 1.2 },
  noa: { x: -3.2, z: 5 },
  samir: { x: 4.6, z: 12.4 },
} as const;

export const ARRIVE_RADIUS = 1.3;
export const INTERACT_RADIUS = 1.6;

/** Everything the tutorial remembers (also stored in an exact manual save). */
export interface Progress {
  moved: boolean;
  looked: boolean;
  lamp: boolean;
  drawer: boolean;
  ledger: boolean;
  codexOpened: boolean;
  documentRead: boolean;
  lensA: boolean;
  lensB: boolean;
  paused: boolean;
  saved: boolean;
  /** Card ids placed correctly. */
  placed: string[];
}

export function freshProgress(): Progress {
  return { moved: false, looked: false, lamp: false, drawer: false, ledger: false, codexOpened: false, documentRead: false, lensA: false, lensB: false, paused: false, saved: false, placed: [] };
}

/** Progress implied by being at a state: everything before it is done. */
export function progressFor(state: ArchiveState, previous: Progress | null): Progress {
  const i = STATE_ORDER.indexOf(state);
  const p = freshProgress();
  p.moved = i >= 1;
  p.looked = i >= 1;
  p.lamp = i >= 2;
  p.drawer = i >= 2;
  p.ledger = i >= 3;
  p.codexOpened = i >= 3;
  p.documentRead = i >= 4;
  p.lensA = i >= 5;
  p.lensB = i >= 5;
  if (i >= 6) {
    p.paused = true;
    p.saved = true;
    p.placed = ['basel', 'guides', 'jaffa'];
  } else if (state === 'labels_table' && previous) {
    // A retry keeps the save step: the player should never have to save twice.
    p.paused = previous.paused;
    p.saved = previous.saved;
  }
  return p;
}

export interface PromptSpec {
  readonly key: string;
  /** Action whose glyph is shown next to the text, or null. */
  readonly action: 'interact' | 'map' | 'pause' | 'back' | null;
}

const P = (key: string, action: PromptSpec['action']): PromptSpec => ({ key, action });
const MOVE = P('ch00.tut.move', null);
const LOOK = P('ch00.tut.look', null);
const INTERACT = P('ch00.tut.interact', 'interact');
const DRAWER = P('levels.ch00.archive.tut.drawer', 'interact');
const CODEX = P('ch00.tut.codex', 'map');
const ARCHIVE = P('ch00.tut.archive', 'interact');
const LENSES = P('levels.ch00.archive.tut.lenses', 'interact');
const PAUSE = P('ch00.tut.pause', 'pause');
const LABELS = P('ch00.tut.labels', 'interact');
const GLOW = P('levels.ch00.archive.tut.glow', 'interact');

/** The one tutorial prompt that fits the current state (null: nothing to teach right now). */
export function promptFor(state: string, p: Readonly<Progress>): PromptSpec | null {
  switch (state) {
    case 'arrival':
      return p.moved ? null : MOVE;
    case 'reading_room':
      if (!p.looked) return LOOK;
      if (!p.lamp) return INTERACT;
      return p.drawer ? null : DRAWER;
    case 'codex_ledger':
      return p.ledger ? CODEX : INTERACT;
    case 'first_document':
      return ARCHIVE;
    case 'lenses':
      return LENSES;
    case 'labels_table':
      return p.saved ? LABELS : PAUSE;
    case 'document_opens':
      return GLOW;
    default:
      return null;
  }
}
