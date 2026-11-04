import { describe, expect, it } from 'vitest';
import chapter from '../../src/levels/ch00/chapter';
import { allDialogueKeys } from '../../src/content/ch00/dialogue';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { FIXED_DT } from '../../src/core/loop';
import { HEBREW } from '../../src/locales';
import { DEFAULT_WORLD_QUALITY } from '../../src/world/quality';
import { loadChapter, loadLevel, CHAPTER_SLOTS, chapterForSlot } from '../../src/gameplay/registry';
import { stickToward } from '../../src/gameplay/core/movement';
import { BotInput, runBot } from '../../src/gameplay/runtime/bot';
import { MissionHost } from '../../src/gameplay/runtime/missionHost';
import archive, { type ArchiveLevel } from '../../src/levels/ch00/archive-night';
import { LabelSorter, SORT_CARDS } from '../../src/levels/ch00/shared/labels';
import { SPAWNS, STATE_ORDER, SPOTS, freshProgress, progressFor, promptFor } from '../../src/levels/ch00/shared/layout';

function host(difficulty: 'story' | 'normal' | 'challenge' = 'normal', at?: { state: string; data: unknown }) {
  const bus = new EventBus<GameEvents>();
  const input = new BotInput();
  const failures: string[] = [];
  const h = new MissionHost({
    def: archive,
    bus,
    input,
    difficulty: () => difficulty,
    ...(at ? { snapshot: { missionId: archive.missionId, state: at.state, checkpoint: at.state, data: at.data } } : {}),
    headless: true,
    quality: { ...DEFAULT_WORLD_QUALITY, shadows: false },
    reducedMotion: () => false,
    t: (k) => k,
    glyph: (a) => a,
    recordChoice: () => undefined,
    hooks: { onFailed: (r) => failures.push(r.reasonKey), onDecision: () => undefined, onComplete: () => undefined, onPlan: () => undefined },
  });
  h.start();
  const level = h.level as ArchiveLevel;
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      input.beginStep();
      h.update(FIXED_DT);
    }
  };
  return { h, level, step, failures, input };
}

/** Starts the level at the lenses state with the player standing at (x, z). */
function atLenses(x: number, z: number) {
  const g = host('normal', { state: 'lenses', data: null });
  g.level.enterCheckpoint('lenses', { x, z, progress: progressFor('lenses', null) });
  g.step(5);
  return g;
}

describe('archive-night level', () => {
  it('registers with the prologue chapter in mission order', async () => {
    expect(CHAPTER_SLOTS.prologue).toBe('prologue');
    expect(chapterForSlot('prologue')).toBe('prologue');
    const ch = await loadChapter('prologue');
    expect(ch).toBe(chapter);
    expect(ch.levels).toEqual(['archive-night', 'jaffa-letters']);
    expect(ch.content.missions[0]?.id).toBe('archive-at-night');
    const def = await loadLevel('archive-night');
    expect(def.missionId).toBe(ch.content.missions[0]?.id);
  });

  it('has Hebrew text for every key it uses', () => {
    const keys = [...allDialogueKeys(), ...Object.keys(HEBREW).filter((k) => k.startsWith('levels.ch00.archive.'))];
    for (const k of keys) expect(HEBREW[k], k).toBeTruthy();
    const objectiveKeys = archive.objectives.map((o) => o.textKey);
    for (const k of objectiveKeys) expect(HEBREW[k], k).toBeTruthy();
    for (const f of Object.values(archive.failures)) {
      expect(HEBREW[f.whatHappenedKey]).toBeTruthy();
      expect(HEBREW[f.hintKey]).toBeTruthy();
    }
    for (const p of archive.briefingMap?.points ?? []) if (p.labelKey) expect(HEBREW[p.labelKey]).toBeTruthy();
  });

  it('every state has an objective and the chain reaches complete in order', () => {
    for (const s of STATE_ORDER) expect(archive.objectives.some((o) => o.states.includes(s)), s).toBe(true);
    const r = runBot(archive, { difficulty: 'normal' });
    expect(r.completed).toBe(true);
    const cps = r.log.filter((l) => l.startsWith('checkpoint: ')).map((l) => l.slice(12));
    expect(cps).toEqual(['reading_room', 'codex_ledger', 'first_document', 'shelf_tour', 'labels_table', 'document_opens']);
    expect(r.seconds).toBeLessThan(400);
  });

  it('unlocks the ledger codex entry and the Basel archive item', () => {
    const seen: string[] = [];
    const bus = new EventBus<GameEvents>();
    bus.on('unlock:item', ({ kind, id }) => seen.push(kind + ':' + id));
    runBot(archive, { difficulty: 'normal', bus });
    expect(seen).toEqual(['codex:jaffa-jerusalem-railway', 'archive:basel-program', 'codex:herzl-first-congress']);
  });

  it('stays at the door until the player actually walks in', () => {
    const g = host();
    g.step(30);
    expect(g.h.state).toBe('arrival');
    g.h.dispose();
  });

  it('wrong tray: failure card first time, hint only after; retry resumes at the labels checkpoint', () => {
    const g = host();
    // Jump to the labels checkpoint through the real retry path: restore a snapshot-like state.
    g.h.dispose();
    const bus = new EventBus<GameEvents>();
    const input = new BotInput();
    const failures: string[] = [];
    let hostRef: MissionHost | null = null;
    hostRef = new MissionHost({
      def: archive,
      bus,
      input,
      difficulty: () => 'normal',
      headless: true,
      quality: { ...DEFAULT_WORLD_QUALITY, shadows: false },
      reducedMotion: () => false,
      t: (k) => k,
      glyph: (a) => a,
      recordChoice: () => undefined,
      snapshot: { missionId: archive.missionId, state: 'labels_table', checkpoint: 'labels_table', data: null },
      hooks: { onFailed: (r) => failures.push(r.reasonKey), onDecision: () => undefined, onComplete: () => undefined, onPlan: () => undefined },
    });
    hostRef.start();
    const lv = hostRef.level as ArchiveLevel;
    const tap = (a: Parameters<BotInput['tap']>[0]): void => {
      input.tap(a);
      input.beginStep();
      hostRef?.update(FIXED_DT);
    };
    const idle = (): void => {
      input.beginStep();
      hostRef?.update(FIXED_DT);
    };
    // Walk to the table spot by teleport-free stepping: use the player spawn then the bot-less tap.
    expect(lv.qa.progress.saved).toBe(false);
    lv.qa.pauseAndSave();
    expect(lv.qa.progress.saved).toBe(true);
    // Stand at the table.
    const player = lv.player;
    expect(player).toBeDefined();
    const stick = { x: 0, y: 0 };
    for (let i = 0; i < 1200 && Math.hypot((player?.x ?? 0) - SPOTS.table.x, (player?.z ?? 0) - SPOTS.table.z) > 0.5; i++) {
      stickToward(player?.x ?? 0, player?.z ?? 0, SPOTS.table.x, SPOTS.table.z, player?.cameraYaw ?? 0, stick);
      input.move.x = stick.x;
      input.move.y = stick.y;
      idle();
    }
    input.move.x = 0;
    input.move.y = 0;
    for (let i = 0; i < 30; i++) idle();
    tap('interact');
    expect(lv.qa.modal).toBe('sorter');
    tap('confirm');
    tap('right');
    tap('right'); // Basel card into the composite tray: wrong
    tap('confirm');
    expect(failures).toEqual(['label-basel']);
    expect(lv.qa.modal).toBe('none');
    hostRef.retry();
    expect(lv.qa.progress.saved).toBe(true);
    for (let i = 0; i < 20; i++) idle();
    expect(hostRef.phase).toBe('running');
    hostRef.dispose();
  });
});

describe('label sorter model', () => {
  it('places the three cards and reports mistakes once', () => {
    const s = new LabelSorter();
    expect(s.step('confirm').kind).toBe('picked');
    s.step('next');
    const w = s.step('confirm');
    expect(w.kind).toBe('wrong');
    expect(w.first).toBe(true);
    s.step('confirm');
    s.step('next');
    expect(s.step('confirm').first).toBe(false);
    for (const [moves, answer] of [[0, 'basel'], [2, 'guides'], [1, 'jaffa']] as const) {
      s.cardCursor = 0;
      s.step('confirm');
      for (let i = 0; i < moves; i++) s.step('next');
      const out = s.step('confirm');
      expect(out.kind, answer).toBe('placed');
    }
    expect(s.complete).toBe(true);
    expect(SORT_CARDS.map((c) => c.answer)).toEqual(['documented', 'composite', 'reconstructed']);
  });

  it('back releases a held card and closes otherwise', () => {
    const s = new LabelSorter();
    s.step('confirm');
    expect(s.step('back').kind).toBe('released');
    expect(s.step('back').kind).toBe('close');
  });
});

describe('tutorial logic', () => {
  it('teaches in the design order and never leaves a state without a prompt target', () => {
    const p = freshProgress();
    expect(promptFor('arrival', p)?.key).toBe('ch00.tut.move');
    expect(promptFor('reading_room', p)?.key).toBe('ch00.tut.look');
    p.looked = true;
    expect(promptFor('reading_room', p)?.key).toBe('ch00.tut.interact');
    expect(promptFor('codex_ledger', p)?.action).toBe('interact');
    p.ledger = true;
    expect(promptFor('codex_ledger', p)?.key).toBe('ch00.tut.codex');
    expect(promptFor('first_document', p)?.key).toBe('ch00.tut.archive');
    expect(promptFor('labels_table', p)?.key).toBe('ch00.tut.pause');
    p.saved = true;
    expect(promptFor('labels_table', p)?.key).toBe('ch00.tut.labels');
  });

  it('checkpoint progress marks earlier steps as done and keeps a saved retry', () => {
    const prev = progressFor('labels_table', null);
    prev.saved = true;
    prev.paused = true;
    expect(progressFor('labels_table', prev).saved).toBe(true);
    expect(progressFor('document_opens', null).placed).toHaveLength(3);
    expect(progressFor('reading_room', null).lamp).toBe(false);
    expect(progressFor('codex_ledger', null).drawer).toBe(true);
    for (const s of STATE_ORDER) expect(SPAWNS[s].z).toBeLessThan(16);
  });
});

describe('shelf tour and optional discovery', () => {
  it('teaches the tour prompt and resets the cases per checkpoint', () => {
    expect(promptFor('shelf_tour', freshProgress())?.key).toBe('levels.ch00.archive.tut.cases');
    expect(progressFor('shelf_tour', null).documentRead).toBe(true);
    expect(progressFor('shelf_tour', null).caseA).toBe(false);
    expect(progressFor('lenses', null).caseC).toBe(true);
    expect(progressFor('labels_table', null).nook).toBe(false);
  });

  it('keeps the newspaper nook optional and sets its own briefing context', () => {
    const seen: string[] = [];
    const bus = new EventBus<GameEvents>();
    bus.on('unlock:item', ({ kind, id }) => seen.push(kind + ':' + id));
    const r = runBot(archive, { difficulty: 'normal', bus, fromCheckpoint: 'shelf_tour' });
    expect(r.completed).toBe(true);
    expect(seen).not.toContain('codex:filastin-newspaper');
    expect(archive.briefingContextKey).toBe('levels.ch00.archive.context');
    expect(HEBREW['levels.ch00.archive.context']).toBeTruthy();
  });
});

describe('sheets and the opening press', () => {
  it('the press that opens a lens sheet neither closes it nor switches the lens', () => {
    const g = atLenses(SPOTS.lensA.x, SPOTS.lensA.z);
    g.input.tap('interact');
    g.step(1);
    expect(g.level.qa.modal).toBe('lens');
    expect(g.level.qa.progress.lensA).toBe(true);
    g.step(20);
    expect(g.level.qa.modal).toBe('lens');
    expect(g.level.qa.progress.lensB).toBe(false);
    g.h.dispose();
  });

  it('the first lens is always the amber one, even when the player stands nearer the blue stand', () => {
    const g = atLenses((SPOTS.lensA.x + SPOTS.lensB.x) / 2 + 0.5, SPOTS.lensA.z);
    g.input.tap('interact');
    g.step(1);
    expect(g.level.qa.modal).toBe('lens');
    expect(g.level.qa.progress.lensA).toBe(true);
    expect(g.level.qa.progress.lensB).toBe(false);
    g.h.dispose();
  });

  it('a display case sheet ignores its opening press and closes on a fresh one', () => {
    const g = host('normal', { state: 'shelf_tour', data: null });
    g.level.enterCheckpoint('shelf_tour', { x: SPOTS.caseA.x, z: SPOTS.caseA.z, progress: progressFor('shelf_tour', null) });
    g.step(5);
    g.input.tap('interact');
    g.step(1);
    expect(g.level.qa.modal).toBe('case');
    g.step(10);
    expect(g.level.qa.modal).toBe('case');
    g.input.tap('interact');
    g.step(1);
    expect(g.level.qa.modal).toBe('none');
    expect(g.level.qa.progress.caseA).toBe(true);
    g.h.dispose();
  });
});

describe('level lifecycle', () => {
  it('restores an exact manual save and disposes safely twice', () => {
    const g = host();
    const lv = g.level;
    g.step(3);
    const snap = lv.snapshotData?.() as { x: number; z: number; progress: { moved: boolean } };
    expect(snap.z).toBeCloseTo(SPAWNS.arrival.z, 0);
    lv.enterCheckpoint('arrival', { ...snap, x: 1, z: -9 });
    expect(lv.player?.x).toBeCloseTo(1, 1);
    lv.dispose();
    lv.dispose();
    g.h.dispose();
  });

  it('completes from every checkpoint and every difficulty (also with retry on failure)', () => {
    for (const d of ['story', 'normal', 'challenge'] as const) {
      for (const cp of archive.mission.checkpoints) {
        const r = runBot(archive, { difficulty: d, fromCheckpoint: cp, retryOnFail: true });
        expect(r.completed, d + ' ' + cp + ' ' + r.log.join('|')).toBe(true);
        expect(r.failures).toEqual([]);
      }
    }
  });
});
