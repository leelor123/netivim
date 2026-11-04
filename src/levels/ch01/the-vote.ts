import { circle } from '../../gameplay/core/collision';
import type { Marker } from '../../gameplay/runtime/levelKit';
import { PlayerController } from '../../gameplay/runtime/player';
import type { Interactable } from '../../gameplay/core/interaction';
import { defineLevel, type BotStep, type Level, type LevelContext, type Line } from '../../gameplay/types';
import {
  ASK_RADIUS,
  BOT_CHOICES,
  CARD_SLOT_OF_PARTY,
  CARD_SPOTS,
  DECISIONS,
  DECISION_LISTEN,
  DECISION_NEIGHBOR,
  DECISION_PREPARE,
  FAILURE_COUNT,
  FAILURE_JERUSALEM,
  FAILURE_STATEMENT,
  HALL,
  HOME,
  L,
  MAP_LAYERS,
  NEIGHBOR,
  NOTE_DESK,
  NOTE_POINTS,
  OFFICE,
  PARTIES,
  PLACES,
  PLACE_DEFS,
  PLACE_ENTRY,
  PLACE_SPOTS,
  POINT_RADIUS,
  RADIO,
  ROUTE_PLACE,
  SIGN,
  CHECKPOINT_SPAWN,
  SPEAK_MS,
  STATION_X_OF_PARTY,
  TABLE,
  TALLY,
  statementKey,
  type PlaceId,
  type VoteEvent,
  type VoteState,
} from './vote/data';
import { partyOfSlot, VoteModel } from './vote/model';
import { buildVoteStage, NPCS } from './vote/stage';

/**
 * Chapter 1, mission 3: "The Vote" (29 Nov 1947), a decision mission. The player is a composite
 * secretariat staffer preparing a briefing note: reads a schematic partition map on a planning
 * table, matches statements to their parties, listens to composite people in a Tel Aviv home, an
 * Arab town courtyard and a British office, logs advice decisions to the Choice Ledger, and ends
 * at a street radio where the historical result is read. The result cannot be changed.
 */

const SPEAKER_NARRATOR = 'ch01.speaker.narrator';
const SPEAKER_RADIO = 'ch01.speaker.radio';
const IDLE_HINT_SECONDS = 70;
const TALLY_WINDOW = 6;

const line = (textKey: string, speakerKey: string | null, durationMs = SPEAK_MS): Line => ({ textKey, speakerKey, durationMs });

interface Timer {
  t: number;
  fn: () => void;
}

type VoteLevel = Level & { warp(x: number, z: number): void };

function build(ctx: LevelContext<VoteEvent>): VoteLevel {
  const stage = buildVoteStage(ctx.quality);
  const world = stage.world;
  const model = new VoteModel();
  const player = new PlayerController(world, ctx.input, ctx.reducedMotion, { era: 'mandate1940', variant: 1 });
  for (const n of NPCS) world.colliders.push(circle(n.x, n.z, 0.38, 1.8));

  const timers: Timer[] = [];
  const schedule = (seconds: number, fn: () => void): void => {
    timers.push({ t: seconds, fn });
  };

  let planning = false;
  let layer = -1;
  let carried = -1;
  let idle = 0;
  let finale = -1;
  let neighborChoice = '';
  let tallyWindow = 0;
  let zone: 'town-night' | 'interior' = 'town-night';
  const greeted: Record<PlaceId, boolean> = { yishuv: false, palestinians: false, britain: false };
  const markers = new Map<string, Marker>();
  const items: Interactable[] = [];

  const track = (it: Interactable, color: string): Interactable => {
    const added = ctx.interactions.add(it);
    items.push(added);
    markers.set(added.id, world.addMarker(added.x, added.z, color));
    return added;
  };
  /** A logged decision: a paper sound and a light pulse so the choice feels registered. */
  const decide = (id: string, onChosen: (optionId: string) => void): void =>
    ctx.decide(id, (optionId) => {
      ctx.bus.emit('audio:cue', { cue: 'ui.save' });
      if (!ctx.headless) ctx.bus.emit('haptics:pulse', { strength: 'light', durationMs: 90 });
      onChosen(optionId);
    });
  const touch = (): void => {
    idle = 0;
  };
  const mood = (m: 'calm' | 'tense' | 'reflective'): void => ctx.bus.emit('audio:mood', { mood: m, era: 1947 });
  const speak = (lines: readonly Line[], label: 'documented' | 'composite' | 'reconstructed'): void => {
    touch();
    ctx.say(lines, label);
  };
  /** A composite person speaks first, then the sourced line follows (two labels, one at a time). */
  const answer = (speakerKey: string, humanKey: string, factKey: string, unlockFn?: () => void): void => {
    speak([line(humanKey, speakerKey, 4200)], 'composite');
    schedule(4.3, () => {
      speak([line(factKey, SPEAKER_NARRATOR, 7600)], 'documented');
      unlockFn?.();
    });
  };

  // ---- interactables -------------------------------------------------------------------
  // The HUD prompt only refreshes when focus changes, so the table is three interactables on one
  // spot (open, next layer, close); switching which one is enabled refreshes the prompt.
  const tableItem = (id: string, promptKey: string): Interactable =>
    track({ id, kind: 'generic', x: TABLE.x, z: TABLE.z, radius: 3.4, promptKey, enabled: false, onInteract: () => onTable() }, '#f2c14e');
  const table = tableItem('vote-table', L('prompt.table'));
  const tableNext = tableItem('vote-table-next', L('prompt.tableNext'));
  const tableClose = tableItem('vote-table-close', L('prompt.tableClose'));
  const cards = CARD_SPOTS.map((p, slot) =>
    track({ id: 'vote-card-' + String(slot), kind: 'pickup', x: p.x, z: p.z, radius: ASK_RADIUS, promptKey: L('prompt.card.' + String(slot + 1)), enabled: false, onInteract: () => onCard(slot) }, '#f2c14e'),
  );
  const stations = PARTIES.map((party, i) =>
    track(
      { id: 'vote-station-' + party, kind: 'generic', x: STATION_X_OF_PARTY[i] ?? 0, z: -38.4, radius: 1.2, promptKey: L('prompt.station.' + party), enabled: false, onInteract: () => onStation(i) },
      '#8ec5ff',
    ),
  );
  const sign = track({ id: 'vote-sign', kind: 'generic', x: SIGN.x, z: SIGN.z, radius: 2.4, promptKey: L('prompt.listen'), enabled: false, onInteract: () => onSign() }, '#f2c14e');
  const asks = PLACES.map((place) =>
    PLACE_SPOTS[place].questions.map((p, n) =>
      track({ id: 'vote-ask-' + place + '-' + String(n), kind: 'generic', x: p.x, z: p.z, radius: ASK_RADIUS, promptKey: PLACE_DEFS[place].questions[n]?.promptKey ?? '', enabled: false, onInteract: () => onAsk(place, n) }, '#8ec5ff'),
    ),
  );
  const advices = PLACES.map((place) => {
    const p = PLACE_SPOTS[place].advice;
    return track({ id: 'vote-advice-' + place, kind: 'generic', x: p.x, z: p.z, radius: 1.0, promptKey: L('prompt.advice'), enabled: false, onInteract: () => onAdvice(place) }, '#f2c14e');
  });
  const points = PARTIES.map((party, i) => {
    const p = NOTE_POINTS[i] ?? NOTE_DESK;
    return track({ id: 'vote-point-' + party, kind: 'pickup', x: p.x, z: p.z, radius: POINT_RADIUS, promptKey: L('prompt.point.' + party), enabled: false, onInteract: () => onPoint(i) }, '#f2c14e');
  });
  const pageIt = track(
    { id: 'vote-page', kind: 'pickup', x: NOTE_DESK.jerusalem.x, z: NOTE_DESK.jerusalem.z, radius: 0.9, promptKey: L('prompt.page'), enabled: false, onInteract: () => onPage() },
    '#f2c14e',
  );
  const submitIt = track(
    { id: 'vote-submit', kind: 'generic', x: NOTE_DESK.typewriter.x, z: NOTE_DESK.typewriter.z, radius: 0.9, promptKey: L('prompt.submit'), enabled: false, onInteract: () => onSubmit() },
    '#f2c14e',
  );
  const neighborIt = track({ id: 'vote-neighbor', kind: 'generic', x: NEIGHBOR.x + 0.4, z: NEIGHBOR.z - 1.0, radius: 1.3, promptKey: L('prompt.neighbor'), enabled: false, onInteract: () => onNeighbor() }, '#f2c14e');
  const radioIt = track({ id: 'vote-radio', kind: 'lantern', x: RADIO.x, z: RADIO.z - 1.2, radius: 1.3, promptKey: L('prompt.radio'), enabled: false, onInteract: () => onRadio() }, '#f2c14e');
  const tallyIt = track({ id: 'vote-tally', kind: 'generic', x: TALLY.x, z: TALLY.z - 1.1, radius: 1.1, promptKey: L('prompt.tally'), enabled: false, onInteract: () => onTally() }, '#b8b0a0');

  const offFocus = ctx.interactions.onFocus((next) => {
    for (const [id, m] of markers) m.setHighlight(next?.id === id);
  });

  function refresh(): void {
    const st = ctx.mission.state;
    for (const it of items) it.enabled = false;
    if (st === 'map') {
      const last = layer >= MAP_LAYERS.length - 1;
      table.enabled = !planning;
      tableNext.enabled = planning && !last;
      tableClose.enabled = planning && last;
    }
    if (st === 'statements') {
      for (let k = 0; k < cards.length; k++) {
        const done = model.delivered[PARTIES.indexOf(partyOfSlot(k))] ?? false;
        (cards[k] as Interactable).enabled = carried < 0 && !done;
      }
      for (const s of stations) s.enabled = carried >= 0;
    }
    if (st === 'visits') {
      sign.enabled = !model.listened;
      PLACES.forEach((place, pi) => {
        for (const a of asks[pi] ?? []) a.enabled = model.listened && !model.advised[place];
        (advices[pi] as Interactable).enabled = model.listened && model.canAdvise(place);
      });
    }
    if (st === 'note') {
      pageIt.enabled = !model.jerusalem;
      points.forEach((pt, i) => {
        pt.enabled = !model.points[i];
      });
      submitIt.enabled = true;
    }
    if (st === 'vote') {
      const going = finale >= 0;
      neighborIt.enabled = neighborChoice === '' && !going;
      radioIt.enabled = neighborChoice !== '' && !going;
      tallyIt.enabled = !going;
    }
    for (const [id, m] of markers) m.setVisible(ctx.interactions.get(id)?.enabled ?? false);
    stage.cards.forEach((c, k) => {
      c.visible = !(model.delivered[PARTIES.indexOf(partyOfSlot(k))] ?? false) && carried !== k;
    });
    stage.page.visible = !model.jerusalem;
    stage.points.forEach((m, i) => {
      m.visible = !(model.points[i] ?? false);
    });
  }

  function send(e: VoteEvent): void {
    ctx.mission.send(e);
    touch();
    refresh();
  }

  // ---- cp1: the map table ---------------------------------------------------------------
  function showLayer(i: number): void {
    layer = i;
    stage.layerGroups.forEach((g, k) => {
      g.visible = k === i;
    });
    model.seeLayer(i);
    ctx.objectives.progress('o1', model.layersSeen);
    const def = MAP_LAYERS[i];
    if (!def) return;
    const lines = [line(def.titleKey, SPEAKER_NARRATOR, 4200), line(def.factKey, null, 7600)];
    if (def.id === 'jerusalem') {
      lines.push(line('ch01.archive.res181.desc', null, 9000));
      ctx.unlock('archive', 'res181');
      ctx.unlock('codex', 'res-181');
    }
    if (def.id === 'peel') ctx.unlock('codex', 'peel-commission');
    speak(lines, 'documented');
  }
  function setPlanning(on: boolean): void {
    planning = on;
    const rig = player.rig;
    if (on) {
      rig.mode = 'planning';
      rig.plan.x = TABLE.x;
      rig.plan.z = TABLE.z;
      rig.plan.minHeight = 6;
      rig.plan.maxHeight = 16;
      rig.plan.height = 11.5;
      rig.plan.panSpeed = 4;
      // Touch: the stick pans and the interact button turns the layers; zoom gets two buttons.
      ctx.touchActions([
        { scroll: 1, label: ctx.t('gameplay.touch.zoomIn') },
        { scroll: -1, label: ctx.t('gameplay.touch.zoomOut') },
      ]);
    } else {
      rig.mode = 'follow';
      rig.snapBehind(0);
      ctx.touchActions(null);
      for (const g of stage.layerGroups) g.visible = false;
    }
    refresh();
  }
  function onTable(): void {
    touch();
    if (!planning) {
      setPlanning(true);
      showLayer(0);
      refresh();
      return;
    }
    if (layer < MAP_LAYERS.length - 1) {
      showLayer(layer + 1);
      refresh();
      return;
    }
    setPlanning(false);
    decide(DECISION_PREPARE, () => send('mapDone'));
  }

  // ---- cp2: statement cards -------------------------------------------------------------
  function onCard(slot: number): void {
    if (!model.pickCard(slot)) return;
    carried = slot;
    refresh();
    const party = partyOfSlot(slot);
    speak([line(L('say.card'), SPEAKER_NARRATOR, 3200), line(statementKey(party), null, 7200)], 'documented');
  }
  function onStation(i: number): void {
    const party = PARTIES[i];
    if (!party) return;
    const r = model.deliver(party);
    touch();
    if (r === 'ok') {
      carried = -1;
      ctx.objectives.progress('o2', model.deliveredCount);
      ctx.bus.emit('audio:cue', { cue: 'paper.rustle', intensity: 0.7 });
      if (!ctx.headless) ctx.bus.emit('haptics:pulse', { strength: 'light', durationMs: 70 });
      if (model.deliveredCount >= PARTIES.length) send('statementsDone');
      else refresh();
    } else if (r === 'retry') {
      speak([line(L('say.retry'), SPEAKER_NARRATOR, 5200)], 'reconstructed');
    } else if (r === 'fail') {
      ctx.mission.fail(FAILURE_STATEMENT);
    }
  }

  // ---- cp3: the visits ------------------------------------------------------------------
  function onSign(): void {
    decide(DECISION_LISTEN, () => {
      model.listened = true;
      refresh();
      mood('reflective');
    });
  }
  function onAsk(place: PlaceId, n: number): void {
    const def = PLACE_DEFS[place];
    const q = def.questions[n];
    if (!q) return;
    const first = model.ask(place, n);
    if (first) ctx.objectives.progress('o3', model.placesWithQuestion());
    answer(def.speakerKey, q.humanKey, q.factKey, () => {
      if (q.unlock) ctx.unlock(q.unlock.kind, q.unlock.id);
    });
    refresh();
  }
  function onAdvice(place: PlaceId): void {
    if (!model.canAdvise(place)) return;
    decide(PLACE_DEFS[place].adviceId, () => {
      model.advised[place] = true;
      touch();
      schedule(1.5, () => speak([line(PLACE_DEFS[place].farewellKey, PLACE_DEFS[place].speakerKey, 5200)], 'composite'));
      if (model.placesDone() >= PLACES.length) send('visitsDone');
      else refresh();
    });
  }

  // ---- cp4: the note --------------------------------------------------------------------
  function onPage(): void {
    model.jerusalem = true;
    ctx.unlock('archive', 'res181');
    speak([line(L('say.page'), SPEAKER_NARRATOR, 4200), line('ch01.vote.map3', null, 6200), line('ch01.archive.res181.desc', null, 9000)], 'documented');
    refresh();
  }
  function onPoint(i: number): void {
    const party = PARTIES[i];
    if (!party || !model.addPoint(i)) return;
    ctx.objectives.progress('o4', model.pointsCount);
    ctx.bus.emit('audio:cue', { cue: 'paper.rustle', intensity: 0.6 });
    speak([line(L('say.point'), SPEAKER_NARRATOR, 3600), line(statementKey(party), null, 7200)], 'documented');
    refresh();
  }
  function onSubmit(): void {
    const r = model.submit();
    touch();
    if (r === 'ok') {
      speak([line(L('say.noteOk'), SPEAKER_NARRATOR, 5200)], 'reconstructed');
      send('noteDone');
    } else if (r === 'points') {
      speak([line(L('say.notePoints'), SPEAKER_NARRATOR, 6200)], 'reconstructed');
    } else if (r === 'warn') {
      speak([line(L('say.noteWarn'), SPEAKER_NARRATOR, 6200)], 'reconstructed');
    } else {
      ctx.mission.fail(FAILURE_JERUSALEM);
    }
  }

  // ---- cp5: the radio -------------------------------------------------------------------
  function onNeighbor(): void {
    decide(DECISION_NEIGHBOR, (optionId) => {
      neighborChoice = optionId;
      refresh();
    });
  }
  function onRadio(): void {
    startBroadcast(-1);
  }
  /**
   * Turns the radio on and reads the result. `remaining` < 0 starts the broadcast from its first
   * line; otherwise (a restored save) it resumes at the line in progress at that remaining time.
   */
  function startBroadcast(remaining: number): void {
    ctx.objectives.progress('o5', 1);
    stage.setRadio(1);
    ctx.bus.emit('audio:cue', { cue: 'radio.static', intensity: 0.8 });
    ctx.bus.emit('audio:cue', { cue: 'crowd.murmur', intensity: 0.35 });
    mood('tense');
    const reaction = L('neighbor.' + neighborChoice);
    const lines: Line[] = [
      line(L('radio.announce'), SPEAKER_RADIO, 6200),
      line(statementKey('yishuv'), null, 6400),
      line(statementKey('palestinians'), null, 7200),
      line(statementKey('arabstates'), null, 7200),
      line(statementKey('britain'), null, 4200),
      line(reaction, L('speaker.neighbor'), 5600),
      line('ch01.vote.moment', SPEAKER_NARRATOR, 7000),
    ];
    const total = lines.reduce((sum, l) => sum + l.durationMs, 0) / 1000;
    let from = 0;
    if (remaining >= 0) {
      // Skip the lines that finished before the save; the one in progress is read again in full.
      const elapsed = total - Math.min(total, remaining);
      let end = 0;
      while (from < lines.length - 1 && end + (lines[from] as Line).durationMs / 1000 <= elapsed) {
        end += (lines[from] as Line).durationMs / 1000;
        from++;
      }
    }
    const rest = lines.slice(from);
    finale = rest.reduce((sum, l) => sum + l.durationMs, 0) / 1000;
    speak(rest, 'reconstructed');
    refresh();
  }
  function onTally(): void {
    touch();
    if (tallyWindow > 0) {
      ctx.mission.fail(FAILURE_COUNT);
      return;
    }
    tallyWindow = TALLY_WINDOW;
    speak([line(L('say.tally'), SPEAKER_NARRATOR, 6000)], 'reconstructed');
  }

  // ---- loop -----------------------------------------------------------------------------
  function insideRoom(x: number, z: number): boolean {
    for (const r of [HALL, HOME, OFFICE]) if (Math.abs(x - r.cx) < r.w / 2 && Math.abs(z - r.cz) < r.d / 2) return true;
    return false;
  }
  const hintFor = (st: string): string | null =>
    st === 'map' ? L('hint.map') : st === 'statements' ? 'ch01.vote.h1' : st === 'visits' ? L('hint.visits') : st === 'note' ? 'ch01.vote.h2' : st === 'vote' ? L('hint.vote') : null;

  world.onVisual((_dt, elapsed) => {
    stage.tick(elapsed, ctx.reducedMotion());
    for (const m of markers.values()) m.animate(elapsed, ctx.reducedMotion());
  });

  const scene = world.gameScene(() => {
    offFocus();
    ctx.bus.emit('audio:cue', { cue: 'ambience.none' });
    ctx.bus.emit('audio:cue', { cue: 'crowd.murmur', intensity: 0 });
  });

  return {
    scene,
    player,
    update(dt) {
      player.update(dt);
      const st = ctx.mission.state;
      if (planning) {
        const p = player.rig.plan;
        p.x = Math.min(TABLE.x + 1.2, Math.max(TABLE.x - 1.2, p.x));
        p.z = Math.min(TABLE.z + 1, Math.max(TABLE.z - 1, p.z));
      }
      for (let i = timers.length - 1; i >= 0; i--) {
        const tm = timers[i] as Timer;
        tm.t -= dt;
        if (tm.t <= 0) {
          timers.splice(i, 1);
          tm.fn();
        }
      }
      if (tallyWindow > 0) tallyWindow = Math.max(0, tallyWindow - dt);
      if (st === 'visits' && model.listened) {
        for (const place of PLACES) {
          const e = PLACE_ENTRY[place];
          if (!greeted[place] && Math.hypot(player.x - e.x, player.z - e.z) < e.talkRadius) {
            greeted[place] = true;
            speak([line(PLACE_DEFS[place].greetKey, PLACE_DEFS[place].speakerKey, 5600)], 'composite');
          }
        }
      }
      if (finale >= 0) {
        finale -= dt;
        if (finale < 0) {
          finale = -1;
          send('heard');
        }
      }
      const inside = insideRoom(player.x, player.z);
      const z = inside ? 'interior' : 'town-night';
      if (z !== zone) {
        zone = z;
        ctx.bus.emit('audio:cue', { cue: 'ambience.' + z });
      }
      idle += dt;
      if (idle > IDLE_HINT_SECONDS && finale < 0) {
        idle = 0;
        const hk = hintFor(st);
        if (hk) ctx.say([line(hk, SPEAKER_NARRATOR, 7000)], 'reconstructed');
      }
    },
    enterCheckpoint(checkpoint, data) {
      const st = checkpoint as VoteState;
      timers.length = 0;
      if (planning) ctx.touchActions(null);
      planning = false;
      player.rig.mode = 'follow';
      for (const g of stage.layerGroups) g.visible = false;
      layer = -1;
      carried = -1;
      finale = -1;
      neighborChoice = '';
      tallyWindow = 0;
      idle = 0;
      for (const p of PLACES) greeted[p] = false;
      stage.setRadio(0);
      model.resetTo(st);
      const saved = data as { model?: Parameters<VoteModel['restore']>[0]; x?: number; z?: number; neighbor?: string; carried?: number; finale?: number; yaw?: number } | null;
      if (saved?.model) {
        model.restore(saved.model);
        carried = saved.carried ?? -1;
        neighborChoice = saved.neighbor ?? '';
      }
      // A save taken while the radio plays resumes the broadcast (cues, o5, the line in progress
      // and the rest), not a silent radio. Started after the ambience/mood resets below.
      const resume = st === 'vote' && saved?.model && typeof saved.finale === 'number' && saved.finale >= 0 ? saved.finale : -1;
      if (saved && typeof saved.x === 'number' && typeof saved.z === 'number') player.spawn(saved.x, saved.z, typeof saved.yaw === 'number' ? saved.yaw : CHECKPOINT_SPAWN[st].heading);
      else {
        const sp = CHECKPOINT_SPAWN[st];
        player.spawn(sp.x, sp.z, sp.heading);
      }
      ctx.bus.emit('audio:cue', { cue: 'ambience.town-night' });
      ctx.bus.emit('audio:cue', { cue: 'crowd.murmur', intensity: 0 });
      mood(st === 'vote' ? 'tense' : st === 'visits' ? 'reflective' : 'calm');
      if (resume >= 0) startBroadcast(resume);
      else refresh();
    },
    warp: (x, z) => player.spawn(x, z, 0),
    snapshotData: () => ({ model: model.snapshot(), x: player.x, z: player.z, neighbor: neighborChoice, carried, finale, yaw: player.rig.orbit.yaw }),
    dispose: () => scene.dispose(),
  };
}

// ---- bot script ------------------------------------------------------------------------
const walk = (x: number, z: number, within = 0.5): BotStep => ({ kind: 'walkTo', x, z, within });
const tap: BotStep = { kind: 'press', action: 'interact' };
const choose = (id: string): BotStep => ({ kind: 'choose', optionId: BOT_CHOICES[id] ?? '' });

function visitSteps(place: PlaceId): BotStep[] {
  const route = ROUTE_PLACE[place];
  const spots = PLACE_SPOTS[place];
  const q0 = spots.questions[0] ?? { x: 0, z: 0 };
  const steps: BotStep[] = [walk(2, -8, 0.8), walk(0, -2, 1.2)];
  for (const [x, z] of route) steps.push(walk(x, z, 0.6));
  steps.push(walk(q0.x, q0.z, 0.4), tap, { kind: 'wait', seconds: 0.2 }, walk(spots.advice.x, spots.advice.z, 0.4), tap, choose(PLACE_DEFS[place].adviceId));
  for (const [x, z] of [...route].reverse()) steps.push(walk(x, z, 0.6));
  return steps;
}

const MAP_STEPS: BotStep[] = [walk(-1, -41.5, 0.8), walk(TABLE.stand.x, TABLE.stand.z, 0.5), tap, tap, tap, tap, tap, choose(DECISION_PREPARE)];

const CARD_STEPS: BotStep[] = [
  walk(0, -41.5, 0.8),
  ...PARTIES.flatMap((_, i): BotStep[] => {
    const spot = CARD_SPOTS[CARD_SLOT_OF_PARTY[i] ?? 0] ?? { x: 0, z: 0 };
    return [walk(0, -41.5, 1), walk(spot.x, spot.z, 0.35), tap, walk(STATION_X_OF_PARTY[i] ?? 0, -38.4, 0.4), tap];
  }),
];

const VISIT_STEPS: BotStep[] = [walk(0, -37, 1), walk(0, -34, 0.8), walk(SIGN.x, SIGN.z - 1.3, 0.5), tap, choose(DECISION_LISTEN), ...PLACES.flatMap(visitSteps), walk(0, -2, 1.2)];

const returnToSquare: BotStep = {
  kind: 'do',
  label: 'walk back to the square (shortcut for the bot)',
  run: (level) => {
    const p = level.player;
    if (p && Math.hypot(p.x - NOTE_DESK.x, p.z - NOTE_DESK.z) > 10) (level as VoteLevel).warp(-4, -1.5);
  },
};

const NOTE_STEPS: BotStep[] = [
  returnToSquare,
  ...PARTIES.flatMap((_, i): BotStep[] => {
    const p = NOTE_POINTS[i] ?? NOTE_DESK;
    return [walk(p.x, p.z + 0.35, 0.3), tap];
  }),
  walk(NOTE_DESK.jerusalem.x, NOTE_DESK.jerusalem.z + 0.35, 0.35),
  tap,
  walk(NOTE_DESK.typewriter.x, NOTE_DESK.typewriter.z + 0.35, 0.35),
  tap,
];

const VOTE_STEPS: BotStep[] = [
  walk(NEIGHBOR.x + 0.4, NEIGHBOR.z - 1.0, 0.4),
  tap,
  choose(DECISION_NEIGHBOR),
  walk(RADIO.x, RADIO.z - 1.2, 0.4),
  tap,
  { kind: 'waitFor', state: 'complete', timeout: 90 },
];

export default defineLevel<VoteState, VoteEvent>({
  id: 'the-vote',
  chapterId: 'ch01',
  missionId: 'the-vote',
  mission: {
    id: 'the-vote',
    chapterId: 'ch01',
    gameplayType: 'DEC',
    checkpoints: ['map', 'statements', 'visits', 'note', 'vote'],
    machine: {
      initial: 'map',
      final: ['complete'],
      transitions: {
        map: { mapDone: 'statements' },
        statements: { statementsDone: 'visits' },
        visits: { visitsDone: 'note' },
        note: { noteDone: 'vote' },
        vote: { heard: 'complete' },
        failed: {},
        complete: {},
      },
    },
  },
  objectives: [
    { id: 'o1', textKey: 'ch01.vote.o1', states: ['map'], steps: MAP_LAYERS.length },
    { id: 'o2', textKey: 'ch01.vote.o2', states: ['statements'], steps: PARTIES.length },
    { id: 'o3', textKey: 'ch01.vote.o3', states: ['visits'], steps: PLACES.length },
    { id: 'o4', textKey: 'ch01.vote.o4', states: ['note'], steps: PARTIES.length },
    { id: 'o5', textKey: 'ch01.vote.o5', states: ['vote'] },
  ],
  failures: {
    [FAILURE_STATEMENT]: { whatHappenedKey: 'ch01.vote.f1', sources: ['C1-101'], label: 'documented', hintKey: 'ch01.vote.h1' },
    [FAILURE_COUNT]: { whatHappenedKey: 'ch01.vote.f2', sources: ['C1-060', 'C1-101'], label: 'documented', hintKey: 'ch01.vote.h3' },
    [FAILURE_JERUSALEM]: { whatHappenedKey: 'ch01.vote.f3', sources: ['C1-060'], label: 'documented', hintKey: 'ch01.vote.h2' },
  },
  decisions: DECISIONS,
  botScript: {
    map: MAP_STEPS,
    statements: CARD_STEPS,
    visits: VISIT_STEPS,
    note: NOTE_STEPS,
    vote: VOTE_STEPS,
  },
  briefingContextKey: L('context'),
  briefingMap: {
    size: 128,
    points: [
      { x: HALL.cx, z: HALL.cz, kind: 'start', labelKey: L('map.hall') },
      { x: HOME.cx, z: HOME.cz, kind: 'poi', labelKey: L('map.home') },
      { x: 32, z: 4, kind: 'poi', labelKey: L('map.town') },
      { x: OFFICE.cx, z: OFFICE.cz, kind: 'poi', labelKey: L('map.office') },
      { x: RADIO.x, z: RADIO.z, kind: 'goal', labelKey: L('map.radio') },
    ],
  },
  build,
});
