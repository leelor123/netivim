import * as THREE from 'three';
import { CH00_CHAPTER } from '../../content/ch00/chapter';
import { MISSION_LINES, OBJECTIVE_KEYS, speakerKey } from '../../content/ch00/dialogue';
import type { ArchiveItem } from '../../content/schema';
import { turnToward } from '../../gameplay/core/movement';
import { DEFAULT_ORBIT } from '../../gameplay/core/orbit';
import { LevelWorld } from '../../gameplay/runtime/levelKit';
import { PlayerController } from '../../gameplay/runtime/player';
import { defineLevel, type BotStep, type FailureInfo, type Level, type LevelContext, type Line } from '../../gameplay/types';
import { provenanceScreen } from '../../gameplay/ui/codex';
import { Crowd, figureGeometry, FigureMaterial } from '../../world/kit/figures';
import { SORT_CARDS, LabelSorter, type CardId, type SortCommand, type SortOutcome } from './shared/labels';
import {
  ARRIVE_RADIUS,
  FURNITURE,
  INTERACT_RADIUS,
  SPAWNS,
  SPOTS,
  freshProgress,
  progressFor,
  promptFor,
  type ArchiveEvent,
  type ArchiveState,
  type Progress,
} from './shared/layout';
import { ArchiveOverlay } from './shared/overlay';
import { buildArchiveRoom } from './shared/room';
import { createViewerSheet } from './shared/sheet';

/**
 * Prologue mission 1, "The Archive at Night" (EXP tutorial, about 12 minutes). Teaches move, look,
 * interact, codex, the 3D archive viewer with its provenance card, pause and save, Two Lenses and
 * the three content labels, guided by Noa and Dr. Samir Haddad (fictional composites, labeled).
 * No clocks, no way to lose; the only soft fail is a first mislabeled card, which explains itself.
 */

export const MISSION_ID = 'archive-at-night';
const LEVEL_ID = 'archive-night';
const BASEL_ID = 'basel-program';
const LEDGER_CODEX_ID = 'jaffa-jerusalem-railway';
const p = (k: string): string => 'levels.ch00.archive.' + k;

type S = ArchiveState;
type E = ArchiveEvent;
type Modal = 'none' | 'codex' | 'lens' | 'viewer' | 'sorter';

/** Test / QA access to a built level. */
export interface ArchiveLevel extends Level {
  readonly qa: {
    /** Opens the pause menu and writes a manual save, as the player would. */
    pauseAndSave(): void;
    readonly progress: Readonly<Progress>;
    readonly modal: Modal;
    readonly sorter: LabelSorter;
  };
}

const FAILURES: Readonly<Record<string, FailureInfo>> = {
  'label-basel': { whatHappenedKey: 'ch00.fail.label-basel.body', sources: ['P-044'], label: 'documented', hintKey: 'ch00.fail.label-basel.hint' },
  'label-guides': { whatHappenedKey: 'ch00.fail.label-guides.body', sources: [], label: 'composite', hintKey: 'ch00.fail.label-guides.hint' },
};

const objectiveKeys = OBJECTIVE_KEYS[MISSION_ID] ?? [];
const okey = (i: number): string => objectiveKeys[i] ?? '';

const lineMs = (text: string): number => Math.max(3200, text.length * 75);

function isSnapshot(v: unknown): v is { x: number; z: number; progress: Progress } {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.x === 'number' && typeof o.z === 'number' && typeof o.progress === 'object' && o.progress !== null && Array.isArray((o.progress as Progress).placed);
}

function build(ctx: LevelContext<E>): ArchiveLevel {
  const { t } = ctx;
  const headless = ctx.headless;
  const world = new LevelWorld({ seed: LEVEL_ID, era: 'archiveNight', biome: 'coastalPlain', size: 64, quality: ctx.quality, waterLevel: null });
  const room = buildArchiveRoom(world);
  const player = new PlayerController(world, ctx.input, ctx.reducedMotion, { era: 'archiveNight' });
  player.rig.params = { ...DEFAULT_ORBIT, distance: 4.4, maxPitch: 0.75 };
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  // ---- guides (static figures that turn toward the player) ----
  const figMat = world.bag.track(new FigureMaterial('archiveNight'));
  const noa = world.bag.track(new Crowd(figureGeometry({ era: 'archiveNight', variant: 1, seed: 'noa' }), figMat, 1));
  const samir = world.bag.track(new Crowd(figureGeometry({ era: 'archiveNight', variant: 2, seed: 'samir' }), figMat, 1));
  for (const c of [noa, samir]) {
    c.mesh.frustumCulled = false;
    world.scene.add(c.mesh);
  }
  let noaHeading = 0;
  let samirHeading = 0;

  // ---- viewer sheet (3D document) ----
  const baselItem = CH00_CHAPTER.archive.find((a): a is ArchiveItem => a.id === BASEL_ID);
  if (!baselItem) throw new Error('basel-program archive item missing');
  const sheet = createViewerSheet(
    world,
    headless ? null : { title: t(baselItem.titleKey), body: t(baselItem.descriptionKey), stamp: t('gameplay.label.' + baselItem.label), license: t('gameplay.license.' + baselItem.license) },
  );
  sheet.root.position.set(FURNITURE.docCabinet.x, 1.65, 13.5);
  sheet.root.rotation.y = (Math.PI * 3) / 4;

  // ---- state ----
  let progress: Progress = freshProgress();
  let modal: Modal = 'none';
  let justOpened = false;
  let stateTime = 0;
  let lookAccum = 0;
  let sorter = new LabelSorter([], new Set<CardId>());
  const mistakes = new Set<CardId>();
  let sorterMessage = '';
  let finale = -1;
  let inside = false;
  let stepTimer = 0;
  const view = { time: 0, rot: 0, blend: 0, yaw: 0, pitch: 0, open: false, ready: false };
  const vis = { lamp: 0, drawer: 0, door: 0, flicker: 0, glow: 0 };
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3(FURNITURE.docCabinet.x + 0.9, 1.65, 12.5);
  const sheetPos = new THREE.Vector3();
  let card: HTMLElement | null = null;
  let hudPause: HTMLElement | null = null;

  /** Touch has no map button: tapping the codex tutorial line opens it (set by the overlay). */
  let tappedCodex = false;
  const overlay = headless
    ? null
    : new ArchiveOverlay({
        t,
        glyph: (a) => ctx.glyph(a),
        onClose: () => closeModal(),
        onPromptTap: () => {
          tappedCodex = true;
        },
        onSorterClick: (kind, index) => {
          if (modal !== 'sorter') return;
          if (kind === 'card') {
            if (sorter.held) return;
            sorter.cardCursor = index;
            sortCommand('confirm');
          } else if (sorter.held) {
            sorter.trayCursor = index;
            sortCommand('confirm');
          }
        },
      });

  // ---- helpers ----
  const stateNow = (): S => ctx.mission.state as S;
  const say = (keys: readonly (readonly [string, string])[]): void => {
    // Noa and Samir are composite characters: every line carries that label in the caption.
    ctx.say(
      keys.map(([key, sp]): Line => ({ textKey: key, speakerKey: speakerKey(sp as 'noa' | 'samir'), durationMs: lineMs(t(key)) })),
      'composite',
    );
  };
  const missionLines = (state: string): void => {
    const src = MISSION_LINES[MISSION_ID]?.[state] ?? [];
    if (src.length > 0) say(src.map((l) => [l.key, l.speaker] as const));
  };
  const cue = (name: string, intensity?: number): void => ctx.bus.emit('audio:cue', intensity === undefined ? { cue: name } : { cue: name, intensity });

  // ---- interactables ----
  interface Spot {
    readonly id: string;
    readonly marker: ReturnType<LevelWorld['addMarker']>;
    readonly it: ReturnType<typeof ctx.interactions.add>;
    on(): boolean;
  }
  const spots: Spot[] = [];
  const addSpot = (id: string, at: { x: number; z: number }, promptKey: string, color: string, on: () => boolean, action: () => void): void => {
    const marker = world.addMarker(at.x, at.z, color);
    const it = ctx.interactions.add({
      id,
      kind: 'generic',
      x: at.x,
      z: at.z,
      radius: INTERACT_RADIUS,
      promptKey,
      enabled: false,
      onInteract: () => {
        if (modal !== 'none' || finale >= 0) return;
        action();
      },
    });
    spots.push({ id, marker, it, on });
  };
  const refresh = (): void => {
    for (const s of spots) {
      const on = s.on();
      s.it.enabled = on;
      s.marker.setVisible(on);
    }
    overlayPrompt();
  };
  const overlayPrompt = (): void => {
    overlay?.setPrompt(modal === 'none' && finale < 0 ? promptFor(stateNow(), progress) : null);
  };

  const send = (event: E): void => {
    if (!ctx.mission.send(event)) return;
    stateTime = 0;
    const s = stateNow();
    if (s === 'lenses') say([[p('line.lens.samir'), 'samir'], [p('line.lens.noa'), 'noa']]);
    else if (s === 'document_opens') say([[p('line.sorted.noa'), 'noa']]);
    else missionLines(s);
    refresh();
  };

  addSpot('door', SPOTS.door, 'gameplay.prompt.use', '#f2c14e', () => false, () => undefined);
  addSpot('lamp', SPOTS.lamp, p('prompt.lamp'), '#f2c14e', () => stateNow() === 'reading_room' && !progress.lamp, () => {
    progress.lamp = true;
    vis.flicker = 1.6;
    cue('ui.toggle');
    say([[p('line.lamp.noa'), 'noa']]);
    refresh();
  });
  addSpot('drawer', SPOTS.drawer, p('prompt.drawer'), '#f2c14e', () => stateNow() === 'reading_room' && progress.lamp && !progress.drawer, () => {
    progress.drawer = true;
    cue('paper.rustle');
    ctx.objectives.progress('room', 1);
    say([[p('line.drawer.samir'), 'samir'], [p('line.drawer.noa'), 'noa']]);
    send('warmed');
  });
  addSpot('ledger', SPOTS.ledger, p('prompt.ledger'), '#7fd6ff', () => stateNow() === 'codex_ledger' && !progress.ledger, () => {
    progress.ledger = true;
    cue('paper.rustle');
    ctx.unlock('codex', LEDGER_CODEX_ID);
    say([['ch00.line.archive.codex_ledger.noa', 'noa'], [p('line.tea.noa'), 'noa']]);
    refresh();
  });
  addSpot('cabinet', SPOTS.cabinet, p('prompt.cabinet'), '#f2c14e', () => stateNow() === 'first_document' && !progress.documentRead, () => openViewer());
  addSpot('lensA', SPOTS.lensA, p('prompt.lensA'), '#f0a63a', () => stateNow() === 'lenses', () => openLens('a'));
  addSpot('lensB', SPOTS.lensB, p('prompt.lensB'), '#5aa8f0', () => stateNow() === 'lenses', () => openLens('b'));
  addSpot('table', SPOTS.table, p('prompt.labels'), '#f2c14e', () => stateNow() === 'labels_table', () => openSorter());
  addSpot('glow', SPOTS.table, p('prompt.glow'), '#ffe9a8', () => stateNow() === 'document_opens' && finale < 0, () => startFinale());
  const offFocus = ctx.interactions.onFocus((next) => {
    for (const s of spots) s.marker.setHighlight(s.it === next);
  });

  // ---- modals ----
  const closeHint = (): string => t(p('panel.closeHint'), { glyph: ctx.glyph('back') });
  function open(m: Modal): void {
    modal = m;
    justOpened = true;
    overlayPrompt();
  }
  function openCodex(): void {
    const entry = CH00_CHAPTER.codex.find((c) => c.id === LEDGER_CODEX_ID);
    if (!entry) return;
    cue('paper.rustle');
    open('codex');
    overlay?.showSheet({
      title: t(entry.titleKey),
      kicker: t(p('panel.codexNew')) + ' · ' + t('gameplay.codex.cat.' + entry.category) + ' · ' + String(entry.year),
      label: entry.label,
      paragraphs: [t(entry.bodyKey), t('gameplay.sources', { ids: entry.sources.join(', ') })],
      footer: closeHint(),
    });
  }
  function openLens(which: 'a' | 'b'): void {
    if (which === 'a') progress.lensA = true;
    else progress.lensB = true;
    cue('ui.toggle');
    open('lens');
    const both = progress.lensA && progress.lensB;
    const paragraphs = [t(p('lens.' + which + '.body'))];
    if (both) paragraphs.push(t(p('lens.common')), t(p('lens.limits')));
    else paragraphs.push(t(p('lens.second')));
    overlay?.showSheet({ title: t(p('lens.title')) + ': ' + t(p('lens.' + which + '.title')), kicker: t(p('lens.example')), label: 'composite', paragraphs: [t(p('lens.intro')), ...paragraphs], footer: closeHint() });
  }
  function openViewer(): void {
    cue('paper.rustle');
    ctx.unlock('archive', BASEL_ID);
    open('viewer');
    view.open = true;
    view.time = 0;
    view.rot = 0;
    view.yaw = 0;
    view.pitch = 0;
    view.ready = false;
    sheet.root.visible = true;
    if (overlay) {
      card = provenanceScreen(t, { item: baselItem as ArchiveItem, chapterTitleKey: CH00_CHAPTER.titleKey }, () => closeModal()).el;
      overlay.showViewer(card, t('gameplay.archive.rotate'));
    }
  }
  function openSorter(): void {
    if (!progress.saved) {
      ctx.bus.emit('ui:toast', { textKey: p('tut.sortNeedSave') });
      return;
    }
    sorterMessage = '';
    open('sorter');
    overlay?.renderSorter(sorter, sorterMessage);
  }
  function closeModal(): void {
    const m = modal;
    if (m === 'none') return;
    if (m === 'viewer') {
      if (!view.ready) {
        // Closing early is allowed; reading counts once the player has had a look around.
        modal = 'none';
        view.open = false;
        overlay?.hideViewer();
        overlayPrompt();
        return;
      }
      modal = 'none';
      view.open = false;
      overlay?.hideViewer();
      progress.documentRead = true;
      overlayPrompt();
      send('document_read');
      return;
    }
    modal = 'none';
    overlay?.hideSheet();
    overlay?.hideSorter();
    overlayPrompt();
    if (m === 'codex') {
      progress.codexOpened = true;
      send('codex_read');
    } else if (m === 'lens') {
      if (progress.lensA && progress.lensB) send('lenses_seen');
    }
  }
  function sortCommand(cmd: SortCommand): void {
    const out: SortOutcome = sorter.step(cmd);
    if (out.kind === 'close') {
      closeModal();
      return;
    }
    if (out.kind === 'placed' && out.card) {
      cue('ui.confirm');
      sorterMessage = t(p('sort.right'));
      progress.placed = [...sorter.placed];
      if (sorter.complete) {
        closeModal();
        send('sorted');
        return;
      }
    } else if (out.kind === 'wrong' && out.card) {
      cue('ui.error');
      sorterMessage = t(p('sort.wrong')) + ' ' + t(out.card.hintKey);
      if (out.first && out.card.failureReason) {
        closeModal();
        ctx.mission.fail(out.card.failureReason);
        return;
      }
    } else if (out.kind === 'picked' || out.kind === 'released') sorterMessage = '';
    overlay?.renderSorter(sorter, sorterMessage);
  }
  function startFinale(): void {
    finale = 0;
    player.controllable = false;
    cue('paper.rustle');
    ctx.bus.emit('audio:mood', { mood: 'hopeful', era: 0 });
    missionLines('document_opens');
    overlayPrompt();
  }

  const modalInput = (fresh: boolean): void => {
    const inp = ctx.input;
    if (fresh) return;
    if (modal === 'sorter') {
      if (inp.justPressed('left')) sortCommand(rtl ? 'next' : 'prev');
      else if (inp.justPressed('right')) sortCommand(rtl ? 'prev' : 'next');
      else if (inp.justPressed('up')) sortCommand('prev');
      else if (inp.justPressed('down')) sortCommand('next');
      else if (inp.justPressed('confirm') || inp.justPressed('interact')) sortCommand('confirm');
      else if (inp.justPressed('back')) sortCommand('back');
      return;
    }
    if (modal === 'viewer') {
      return;
    }
    if (inp.justPressed('confirm') || inp.justPressed('back') || inp.justPressed('interact') || inp.justPressed('map')) closeModal();
  };

  // ---- bus ----
  const offs: (() => void)[] = [
    ctx.bus.on('flow:pause-changed', ({ paused }) => {
      if (paused && stateNow() === 'labels_table') progress.paused = true;
    }),
    ctx.bus.on('save:written', ({ slot }) => {
      if (slot.startsWith('manual')) {
        progress.paused = true;
        progress.saved = true;
        refreshPauseGlow();
        overlayPrompt();
      }
    }),
    ctx.bus.on('save:failed', ({ slot }) => {
      // A broken save target must never trap the tutorial.
      if (slot.startsWith('manual')) {
        progress.paused = true;
        progress.saved = true;
        refreshPauseGlow();
        overlayPrompt();
      }
    }),
  ];

  function refreshPauseGlow(): void {
    if (headless) return;
    hudPause ??= document.querySelector<HTMLElement>('.nv-hudbtn--icon');
    hudPause?.classList.toggle('an-pause-glow', stateNow() === 'labels_table' && !progress.saved && modal === 'none');
  }

  // ---- visuals ----
  const rm = ctx.reducedMotion;
  const chase = (cur: number, target: number, dt: number, rate: number): number => (rm() ? target : cur + (target - cur) * Math.min(1, dt * rate));
  world.onVisual((dt, elapsed) => {
    vis.lamp = chase(vis.lamp, progress.lamp ? 1 : 0, dt, 5);
    vis.drawer = chase(vis.drawer, progress.drawer ? 1 : 0, dt, 4);
    vis.door = chase(vis.door, view.open ? 1 : progress.documentRead ? 1 : 0, dt, 3);
    vis.glow = chase(vis.glow, finale >= 0 || stateNow() === 'document_opens' ? 1 : 0, dt, 1.5);
    if (vis.flicker > 0) vis.flicker = Math.max(0, vis.flicker - dt);
    const flick = vis.flicker > 0 && !rm() ? 0.55 + 0.45 * Math.sin(elapsed * 38) : 1;
    room.lampGlow.visible = vis.lamp > 0.05;
    room.lampLight.intensity = vis.lamp * 36 * flick;
    room.drawer.position.z = FURNITURE.drawerCabinet.z - FURNITURE.drawerCabinet.hd - 0.03 - vis.drawer * 0.45;
    room.ledgerGlow.visible = stateNow() === 'codex_ledger' && !progress.ledger;
    room.cabinetDoor.rotation.y = vis.door * 1.9;
    room.lensA.scale.setScalar(progress.lensA ? 1 : 1 + (rm() ? 0 : Math.sin(elapsed * 3) * 0.04));
    room.lensB.scale.setScalar(progress.lensB ? 1 : 1 + (rm() ? 0 : Math.sin(elapsed * 3 + 1) * 0.04));
    room.tableGlow.visible = vis.glow > 0.05;
    room.tableLight.intensity = vis.glow * 6;
    room.tableSheet.position.y = 0.905 + (rm() ? 0 : vis.glow * 0.18);
    room.tableGlow.position.y = room.tableSheet.position.y - 0.005;
    for (const s of spots) if (s.marker.group.visible) s.marker.animate(elapsed, rm());
    figMat.update(elapsed);
    const k = rm() ? 1 : Math.min(1, dt * 4);
    noaHeading = turnToward(noaHeading, Math.atan2(player.x - FURNITURE.noa.x, player.z - FURNITURE.noa.z), k * 3);
    samirHeading = turnToward(samirHeading, Math.atan2(player.x - FURNITURE.samir.x, player.z - FURNITURE.samir.z), k * 3);
    noa.set(0, FURNITURE.noa.x, 0, FURNITURE.noa.z, noaHeading, 0, 0);
    samir.set(0, FURNITURE.samir.x, 0, FURNITURE.samir.z, samirHeading, 0, 0);
    noa.markMoved();
    samir.markMoved();
  });

  const scene = world.gameScene(() => {
    offFocus();
    for (const off of offs) off();
    overlay?.dispose();
    // Leaving the level (exit to the hub, title) must not leave its room bed playing.
    cue('ambience.none');
    if (!headless) document.querySelector('.nv-hudbtn--icon')?.classList.remove('an-pause-glow');
  });

  const level: ArchiveLevel = {
    scene,
    player,
    qa: {
      pauseAndSave() {
        ctx.bus.emit('flow:pause-changed', { paused: true });
        ctx.bus.emit('save:written', { slot: 'manual-1', reason: 'qa' });
        ctx.bus.emit('flow:pause-changed', { paused: false });
      },
      get progress() {
        return progress;
      },
      get modal() {
        return modal;
      },
      get sorter() {
        return sorter;
      },
    },
    update(dt) {
      stateTime += dt;
      const fresh = justOpened;
      justOpened = false;
      if (modal !== 'none') modalInput(fresh);
      else if (finale < 0 && (ctx.input.justPressed('map') || tappedCodex) && stateNow() === 'codex_ledger' && progress.ledger) openCodex();
      tappedCodex = false;
      player.controllable = modal === 'none' && finale < 0;
      player.update(dt);
      const s = stateNow();

      // Footsteps and the doorway: outside the night, inside the room tone.
      const nowInside = player.z > -5.6;
      if (nowInside !== inside) {
        inside = nowInside;
        cue(inside ? 'ambience.interior' : 'ambience.night');
      }
      stepTimer -= dt;
      if (stepTimer <= 0 && player.motor.speed > 1) {
        stepTimer = 0.46;
        cue(inside ? 'footsteps.stone' : 'footsteps.sand', 0.5);
      }

      // Tutorial detection (never gates progress except where the objective says so).
      if (!progress.moved) {
        const sp = SPAWNS[s];
        if (Math.hypot(player.x - sp.x, player.z - sp.z) > 2) progress.moved = true;
      }
      if (!progress.looked) {
        // Stick look is a rate (scaled by dt); drag look is already an angle (about 0.25 rad of drag
        // counts like 0.4 s of full stick).
        lookAccum += (Math.abs(ctx.input.look.x) + Math.abs(ctx.input.look.y)) * dt + (Math.abs(ctx.input.lookDrag.x) + Math.abs(ctx.input.lookDrag.y)) * 1.6;
        if (lookAccum >= 0.4 || (s === 'reading_room' && stateTime >= 12)) progress.looked = true;
      }
      if (s === 'arrival' && Math.hypot(player.x - SPOTS.door.x, player.z - SPOTS.door.z) <= ARRIVE_RADIUS) {
        ctx.objectives.progress('enter', 1);
        send('entered');
      }

      if (modal === 'viewer') updateViewer(dt, fresh);
      else if (view.blend > 0) view.blend = rm() ? 0 : Math.max(0, view.blend - dt / 0.6);
      if (view.blend > 0) poseViewerCamera();
      if (!view.open && view.blend <= 0 && sheet.root.visible) sheet.root.visible = false;

      if (finale >= 0) {
        finale += dt;
        const total = rm() ? 3 : 6;
        overlay?.setWash(rm() ? (finale > 1.5 ? 1 : 0) : Math.min(1, Math.max(0, (finale - 1.5) / 3.5)));
        if (finale >= total && stateNow() === 'document_opens') send('glowed');
      }
      overlayPrompt();
      refreshPauseGlow();
    },
    enterCheckpoint(checkpoint, data) {
      const state = (STATE_SET.has(checkpoint) ? checkpoint : 'arrival') as S;
      if (modal !== 'none') {
        modal = 'none';
        view.open = false;
        overlay?.hideSheet();
        overlay?.hideSorter();
        overlay?.hideViewer();
      }
      finale = -1;
      overlay?.setWash(0);
      view.blend = 0;
      sheet.root.visible = false;
      player.controllable = true;
      const saved = isSnapshot(data) ? data : null;
      progress = saved ? saved.progress : progressFor(state, progress);
      sorter = new LabelSorter(progress.placed, mistakes);
      const sp = SPAWNS[state];
      if (saved) player.spawn(saved.x, saved.z, sp.heading);
      else player.spawn(sp.x, sp.z, sp.heading);
      stateTime = 0;
      lookAccum = 0;
      inside = player.z > -5.6;
      // Visual state snaps to the checkpoint.
      vis.lamp = progress.lamp ? 1 : 0;
      vis.drawer = progress.drawer ? 1 : 0;
      vis.door = progress.documentRead ? 1 : 0;
      vis.glow = state === 'document_opens' ? 1 : 0;
      vis.flicker = 0;
      cue(inside ? 'ambience.interior' : 'ambience.night');
      ctx.bus.emit('audio:mood', { mood: 'reflective', era: 0 });
      missionLines(state);
      refresh();
    },
    snapshotData: () => ({ x: player.x, z: player.z, progress: { ...progress, placed: [...progress.placed] } }),
    dispose: () => scene.dispose(),
  };

  function updateViewer(dt: number, fresh: boolean): void {
    view.time += dt;
    const inp = ctx.input;
    const lx = inp.look.x + inp.move.x;
    const ly = inp.look.y + inp.move.y;
    const dy = -lx * dt * 1.5 - inp.lookDrag.x;
    const dp = ly * dt * 1.2 + inp.lookDrag.y;
    view.yaw = Math.max(-1.2, Math.min(1.2, view.yaw + dy));
    view.pitch = Math.max(-0.5, Math.min(0.6, view.pitch + dp));
    view.rot += Math.abs(dy) + Math.abs(dp);
    const sway = rm() ? 0 : Math.sin(view.time * 0.6) * 0.02;
    sheet.pivot.rotation.set(view.pitch, view.yaw + sway, 0);
    view.blend = rm() ? 1 : Math.min(1, view.blend + dt / 0.7);
    const ready = view.rot >= 0.8 || view.time >= 6;
    if (ready && !view.ready) {
      view.ready = true;
      overlay?.setViewerHint(t(p('panel.closeHint'), { glyph: ctx.glyph('back') }));
    }
    if (fresh) return;
    if (inp.justPressed('confirm') || inp.justPressed('back') || inp.justPressed('interact')) closeModal();
  }
  function poseViewerCamera(): void {
    const cam = world.camera;
    const b = view.blend * view.blend * (3 - 2 * view.blend);
    cam.position.lerp(camPos, b);
    sheetPos.copy(sheet.root.position);
    camTarget.set(player.x, 1.5, player.z).lerp(sheetPos, b);
    cam.lookAt(camTarget);
  }

  return level;
}

const STATE_SET: ReadonlySet<string> = new Set<S>(['arrival', 'reading_room', 'codex_ledger', 'first_document', 'lenses', 'labels_table', 'document_opens']);

const walk = (x: number, z: number, within = 0.5): BotStep => ({ kind: 'walkTo', x, z, within, timeout: 60 });
const press = (action: 'interact' | 'confirm' | 'map' | 'left' | 'right' | 'up' | 'down' | 'back'): BotStep => ({ kind: 'press', action });
const wait = (seconds: number): BotStep => ({ kind: 'wait', seconds });
const savePause: BotStep = { kind: 'do', label: 'pause menu and manual save', run: (l) => (l as ArchiveLevel).qa.pauseAndSave() };

/** Picks the card under the cursor and puts it into the tray `trays` steps away. */
const place = (trays: number): BotStep[] => [press('confirm'), ...Array.from({ length: trays }, () => press('right')), press('confirm')];

export default defineLevel<S, E>({
  id: LEVEL_ID,
  chapterId: CH00_CHAPTER.id,
  missionId: MISSION_ID,
  mission: {
    id: MISSION_ID,
    chapterId: CH00_CHAPTER.id,
    gameplayType: 'EXP',
    checkpoints: ['arrival', 'reading_room', 'codex_ledger', 'first_document', 'labels_table', 'document_opens'],
    machine: {
      initial: 'arrival',
      final: ['complete'],
      transitions: {
        arrival: { entered: 'reading_room' },
        reading_room: { warmed: 'codex_ledger' },
        codex_ledger: { codex_read: 'first_document' },
        first_document: { document_read: 'lenses' },
        lenses: { lenses_seen: 'labels_table' },
        labels_table: { sorted: 'document_opens' },
        document_opens: { glowed: 'complete' },
        failed: {},
        complete: {},
      },
    },
  },
  objectives: [
    { id: 'enter', textKey: okey(0), states: ['arrival'] },
    { id: 'room', textKey: p('obj.room'), states: ['reading_room'] },
    { id: 'ledger', textKey: okey(2), states: ['codex_ledger'] },
    { id: 'document', textKey: okey(3), states: ['first_document'] },
    { id: 'lenses', textKey: p('obj.lenses'), states: ['lenses'] },
    { id: 'labels', textKey: okey(4), states: ['labels_table'] },
    { id: 'glow', textKey: okey(5), states: ['document_opens'] },
  ],
  failures: FAILURES,
  botScript: {
    arrival: [walk(0, -4.2, 0.8)],
    reading_room: [walk(SPOTS.lamp.x, SPOTS.lamp.z), press('interact'), wait(0.3), walk(SPOTS.drawer.x, SPOTS.drawer.z), press('interact')],
    codex_ledger: [walk(3, 4.8), walk(SPOTS.ledger.x, SPOTS.ledger.z), press('interact'), wait(0.3), press('map'), wait(0.3), press('confirm')],
    first_document: [
      walk(0, 10.8, 0.8),
      walk(SPOTS.cabinet.x, SPOTS.cabinet.z),
      press('interact'),
      wait(7),
      press('confirm'),
      walk(-5.2, 8.2, 0.6),
      walk(SPOTS.lensA.x, SPOTS.lensA.z, 0.4),
      press('interact'),
      wait(0.3),
      press('confirm'),
      walk(SPOTS.lensB.x, SPOTS.lensB.z, 0.4),
      press('interact'),
      wait(0.3),
      press('confirm'),
    ],
    lenses: [],
    labels_table: [walk(0, 8.2, 0.6), walk(SPOTS.table.x, SPOTS.table.z), savePause, press('interact'), wait(0.3), ...place(0), ...place(2), ...place(1)],
    document_opens: [walk(SPOTS.table.x, SPOTS.table.z), press('interact'), wait(8)],
  },
  briefingMap: {
    size: 40,
    points: [
      { x: SPAWNS.arrival.x, z: SPAWNS.arrival.z, kind: 'start', labelKey: p('briefing.start') },
      { x: SPOTS.lamp.x, z: SPOTS.lamp.z, kind: 'poi', labelKey: p('briefing.lamp') },
      { x: SPOTS.ledger.x, z: SPOTS.ledger.z, kind: 'item', labelKey: p('briefing.ledger') },
      { x: SPOTS.cabinet.x, z: SPOTS.cabinet.z, kind: 'item', labelKey: p('briefing.cabinet') },
      { x: SPOTS.table.x, z: SPOTS.table.z, kind: 'goal', labelKey: p('briefing.table') },
    ],
  },
  build,
});

export { SORT_CARDS };
