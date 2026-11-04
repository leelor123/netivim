import * as THREE from 'three';
import type { ContentLabel } from '../../content/schema';
import { CH00_ID } from '../../content/ch00/chapter';
import { FAILURES, HINT_KEYS, MISSION_LINES, speakerKey, type DialogueLine } from '../../content/ch00/dialogue';
import { Telegraph, MissionTimer } from '../../gameplay/core/telegraph';
import type { Interactable } from '../../gameplay/core/interaction';
import { LevelWorld, type Marker } from '../../gameplay/runtime/levelKit';
import { PlayerController } from '../../gameplay/runtime/player';
import { defineLevel, type BotStep, type FailureInfo, type Level, type LevelContext, type Line } from '../../gameplay/types';
import { Cart } from './jaffa/cart';
import { Folk, folkColliders } from './jaffa/folk';
import * as L from './jaffa/layout';
import { createPlan, ROUTE_MAIN } from './jaffa/plan';
import { buildScenery, trainGeometry } from './jaffa/scenery';

/**
 * Mission 2 of the Prologue, "Letters from Jaffa" (LOG, about 18 minutes): a courier day from the
 * Jaffa port to a First Aliyah colony, an Arab village, the Jaffa station and an Old Yishuv house
 * in Jerusalem, on foot (leading a donkey cart) and by train. Content labels follow
 * src/content/ch00/missions.md: the day, the route and every conversation are RECONSTRUCTED,
 * every character is a FICTIONAL COMPOSITE, the setting facts are DOCUMENTED (see chapter.ts).
 * Nobody is harmed and nobody is chased: the only pressures are two soft cues (a field warning
 * and the station bell) that always give at least the telegraph time of the difficulty.
 */

export type S =
  | 'port_start'
  | 'market'
  | 'loaded'
  | 'road_colony'
  | 'road_mid'
  | 'colony_delivered'
  | 'path_mid'
  | 'village_arrival'
  | 'village_delivered'
  | 'station'
  | 'jerusalem_delivered';
export type E = 'briefed' | 'marketDone' | 'cartReady' | 'halfway' | 'colonyDone' | 'junction' | 'atVillage' | 'villageDone' | 'atStation' | 'boarded' | 'lettersDone';

export const MISSION_ID = 'letters-from-jaffa';
const k = (s: string): string => 'levels.ch00.jaffa.' + s;
const NARRATOR = speakerKey('narrator');
const RIDE_SECONDS = 7;
const RIDE_SECONDS_REDUCED = 0.8;
const PI = Math.PI;

/** Failure reasons (ids of FAILURES in the Prologue content). */
export const FAIL = {
  missedTrain: 'missed-train',
  wrongAddressee: 'wrong-addressee',
  fieldCrossing: 'field-crossing',
  colonyNoParts: 'colony-no-parts',
} as const;

const failures: Record<string, FailureInfo> = {};
for (const f of FAILURES) {
  if (f.missionId !== MISSION_ID) continue;
  failures[f.id] = { whatHappenedKey: f.whatReallyHappenedKey, sources: f.sources, label: f.label, hintKey: f.hintKey };
}

interface Flags {
  tags: boolean[];
  /** The three quay talks. */
  talks: boolean[];
  planned: boolean;
  /** The plan put a cart on the main road (the road with a well). */
  planMain: boolean;
  watered: boolean;
  wayfarer: boolean;
  colonyGiven: boolean;
  tea: boolean;
  parts: boolean;
  parcel: boolean;
  letter: boolean;
  vendor: boolean;
  wellRead: boolean;
  listening: boolean;
  listened: boolean;
  villageDelivered: boolean;
  coffee: boolean;
  stationParcel: boolean;
  ticket: boolean;
  jerusalemDelivered: boolean;
  sat: boolean;
}

const freshFlags = (): Flags => ({
  tags: [false, false, false, false],
  talks: [false, false, false],
  planned: false,
  planMain: false,
  watered: false,
  wayfarer: false,
  colonyGiven: false,
  tea: false,
  parts: false,
  parcel: false,
  letter: false,
  vendor: false,
  wellRead: false,
  listening: false,
  listened: false,
  villageDelivered: false,
  coffee: false,
  stationParcel: false,
  ticket: false,
  jerusalemDelivered: false,
  sat: false,
});

interface SavedData {
  readonly x: number;
  readonly z: number;
  readonly flags: Flags;
}

function isSaved(v: unknown): v is SavedData {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Partial<SavedData>;
  return typeof d.x === 'number' && typeof d.z === 'number' && typeof d.flags === 'object' && d.flags !== null && Array.isArray(d.flags.tags);
}

type Spawn = { readonly x: number; readonly z: number; readonly heading: number };

function build(ctx: LevelContext<E>): Level {
  const world = new LevelWorld({
    seed: L.WORLD_SEED,
    era: 'ottoman1890',
    biome: 'coastalPlain',
    size: L.WORLD_SIZE,
    roads: L.ROADS,
    secondary: { biome: 'judeanHills', mask: L.hillMask },
    quality: ctx.quality,
  });
  const scenery = buildScenery(world, { headless: ctx.headless });
  world.colliders.push(...folkColliders());
  const player = new PlayerController(world, ctx.input, ctx.reducedMotion, { era: 'ottoman1890', variant: 2 });
  const cart = new Cart(world);
  if (!ctx.headless) new Folk(world, ctx.reducedMotion);

  // Train: parked at the platform, rides the rail to Jerusalem.
  const rail = scenery.rail;
  const train = new THREE.Mesh(world.bag.geometry(trainGeometry()), world.mats.solid);
  train.castShadow = ctx.quality.shadows;
  world.scene.add(train);
  const trainParkedAlong = (L.PLATFORM.cx + 3) / rail.length;
  const trainEndAlong = 0.985;
  const tmp = new THREE.Vector3();
  const placeTrain = (along: number): void => {
    const { heading } = rail.pointAt(along, tmp);
    train.position.set(tmp.x, tmp.y + 0.12, tmp.z);
    train.rotation.y = heading;
  };
  placeTrain(trainParkedAlong);

  // The guide marker shows the next place to go.
  const marker: Marker = world.addMarker(L.HABIB.x, L.HABIB.z, '#f2c14e');
  world.onVisual((_dt, elapsed) => marker.animate(elapsed, ctx.reducedMotion()));

  // ---- state -------------------------------------------------------------------------------------
  let f = freshFlags();
  let elapsed = 0;
  let wp = 0;
  let riding = false;
  let rideT = 0;
  let bellActive = false;
  let bellWarned = false;
  let lensUntil = 0;
  let queuedUntil = 0;
  let stuckT = 0;
  let habibWaitS = 0;
  let carRide: CarRide | null = null;
  let rideCheckT = 0;
  const rideHinted = new Set<string>();
  let stuckShown = false;
  let nudgeCooldown = 0;
  let fieldWarned = false;
  let lastBed = '';
  const heard = new Set<string>();
  const unlocked = new Set<string>();
  const timers: { at: number; fn: () => void }[] = [];
  const fieldTelegraph = new Telegraph(() => ctx.telegraph());
  const bell = new MissionTimer(L.BELL_SECONDS, () => ctx.params().timerScale);
  const state = (): string => ctx.mission.state;

  // ---- dialogue helpers ----------------------------------------------------------------------------
  const line = (key: string, speaker: string | null, cap?: number): Line => ({ textKey: key, speakerKey: speaker, durationMs: L.readMs(ctx.t(key), cap) });
  const fromContent = (d: DialogueLine): Line => line(d.key, speakerKey(d.speaker));
  const checkpointLines = (cp: string): Line[] => (MISSION_LINES[MISSION_ID]?.[cp] ?? []).map(fromContent);
  const seconds = (lines: readonly Line[]): number => lines.reduce((sum, l) => sum + l.durationMs, 0) / 1000;
  const later = (delay: number, fn: () => void): void => {
    timers.push({ at: elapsed + delay, fn });
  };
  /** Subtitles replace each other, except that the Two Lenses text is never cut off: later lines wait for it. */
  const say = (lines: readonly Line[], label?: ContentLabel): void => {
    if (elapsed >= lensUntil) {
      ctx.say(lines, label);
      return;
    }
    const at = Math.max(lensUntil, queuedUntil);
    queuedUntil = at + seconds(lines) + 0.3;
    later(at - elapsed + 0.2, () => ctx.say(lines, label));
  };
  /** Reward moment for a finished step: a confirm tone and a light buzz (a bigger one for a delivery). */
  const cheer = (big = false): void => {
    ctx.bus.emit('audio:cue', { cue: big ? 'ui.save' : 'ui.confirm' });
    ctx.bus.emit('haptics:pulse', { strength: big ? 'medium' : 'light', durationMs: big ? 140 : 60 });
  };
  const once = (kind: Parameters<LevelContext['unlock']>[0], id: string): void => {
    const key = kind + ':' + id;
    if (unlocked.has(key)) return;
    unlocked.add(key);
    ctx.unlock(kind, id);
  };
  const nudge = (lines: readonly Line[]): void => {
    if (nudgeCooldown > 0) return;
    nudgeCooldown = 12;
    say(lines, 'composite');
  };

  // ---- interactables ---------------------------------------------------------------------------------
  const add = (id: string, kind: Interactable['kind'], at: L.Pt, radius: number, promptKey: string, onInteract: () => void): Interactable =>
    ctx.interactions.add({ id, kind, x: at.x, z: at.z, radius, promptKey, enabled: false, onInteract });

  const lantern = (id: string, testimony: string, at: L.Pt): Interactable =>
    add('lantern-' + id, 'lantern', at, 2.4, 'gameplay.prompt.listen', () => {
      heard.add(id);
      once('testimony', testimony);
      say([line('ch00.testimony.' + testimony + '.body', 'ch00.testimony.' + testimony + '.speaker')], 'composite');
      refresh();
    });

  const tagItems = L.TAGS.map((at, i) =>
    add('tag-' + String(i), 'pickup', { x: at.x, z: at.z + 0.3 }, 2.1, k('prompt.tag'), () => {
      if (f.tags[i]) return;
      f.tags[i] = true;
      cheer();
      say([line(k('line.tag.' + String(i + 1)), NARRATOR)]);
      const n = f.tags.filter(Boolean).length;
      ctx.objectives.progress('tags', n);
      if (n >= 4) {
        advance('briefed');
      } else refresh();
    }),
  );
  const MARKET_LINES: readonly (readonly [string, string])[] = [
    ['porter', 'speaker.porter'],
    ['water', 'speaker.waterSeller'],
    ['runner', 'speaker.runner'],
  ];
  const marketItems = L.MARKET_TALKS.map((at, i) =>
    add('market-' + String(i), 'generic', at, 2.2, k('prompt.talk'), () => {
      if (f.talks[i]) return;
      f.talks[i] = true;
      cheer();
      const [name, speaker] = MARKET_LINES[i] as readonly [string, string];
      const talk = [line(k('line.market.' + name + '.1'), k(speaker)), line(k('line.market.' + name + '.2'), k(speaker))];
      say(talk, 'composite');
      ctx.objectives.progress('market', f.talks.filter(Boolean).length);
      if (f.talks.every(Boolean)) {
        // Habib's next line waits until the last talk has been read.
        habibWaitS = seconds(talk) + 0.5;
        advance('marketDone');
      } else refresh();
    }),
  );
  const vendor = add('vendor', 'generic', L.VENDOR, 2.2, k('prompt.talk'), () => {
    f.vendor = true;
    say([line(k('line.vendor.1'), k('speaker.vendor')), line(k('line.vendor.2'), k('speaker.vendor'))], 'composite');
    refresh();
  });
  const lanternClerk = lantern('clerk', 'composite-jaffa-clerk', L.LANTERN_CLERK);
  const planDesk = add('plan-desk', 'generic', { x: L.PLAN_DESK.x, z: L.PLAN_DESK.z + 0.6 }, 2.2, k('prompt.plan'), () => {
    const model = createPlan(ctx.params().resourceScale);
    ctx.plan(model, () => {
      f.planned = true;
      cheer(true);
      f.planMain = model.vehiclesOn(ROUTE_MAIN) > 0;
      syncObjectives();
      say([line(k('line.habib.planned'), speakerKey('habib')), ...checkpointLines('loaded')], 'composite');
      refresh();
    });
  });
  const loadItem = (id: 'parts' | 'parcel' | 'letter', at: L.Pt): Interactable =>
    add('load-' + id, 'pickup', at, 1.9, k('prompt.load'), () => {
      if (id !== 'parts' && !f.parts) {
        say([line(k('line.habib.order'), speakerKey('habib'))], 'composite');
        return;
      }
      f[id] = true;
      cheer();
      cart.set(f.parts, f.parcel, f.letter);
      syncObjectives();
      refresh();
    });
  const loadParts = loadItem('parts', L.LOAD_PARTS);
  const loadParcel = loadItem('parcel', L.LOAD_PARCEL);
  const loadLetter = loadItem('letter', L.LOAD_LETTER);

  const debora = add('debora', 'generic', L.DEBORA, 2.2, k('prompt.deliver'), () => {
    if (f.colonyGiven) {
      // A quiet stop: cold tea at the new well before the walk back (the second press).
      f.tea = true;
      cheer();
      ctx.objectives.progress('colony', 3);
      const cup = [
        line(k('line.debora.tea.1'), speakerKey('debora')),
        line(k('line.debora.tea.2'), k('speaker.farmer')),
        line(k('line.debora.tea.3'), NARRATOR),
      ];
      say(cup, 'composite');
      ctx.bus.emit('audio:mood', { mood: 'reflective', era: 0 });
      const tip = line(k('line.colony.petah'), NARRATOR);
      later(seconds(cup) + 0.5, () => say([tip]));
      advance('colonyDone');
      return;
    }
    if (!f.parts) {
      say([line(k('line.debora.none'), speakerKey('debora'))], 'composite');
      ctx.mission.fail(FAIL.colonyNoParts);
      return;
    }
    if (!f.watered) {
      say([line(k('line.debora.dusty'), speakerKey('debora'))], 'composite');
      return;
    }
    if (cart.distanceTo(L.DEBORA.x, L.DEBORA.z) > 12) {
      say([line(k('line.debora.wait'), speakerKey('debora'))], 'composite');
      return;
    }
    f.parts = false;
    f.letter = false;
    f.colonyGiven = true;
    cheer(true);
    cart.set(f.parts, f.parcel, f.letter);
    const lines = [...checkpointLines('colony_delivered'), line(k('line.debora.take'), speakerKey('debora')), line(k('line.debora.reply'), speakerKey('debora')), line(k('line.debora.offer'), speakerKey('debora'))];
    say(lines, 'composite');
    once('codex', 'rishon-lezion');
    once('codex', 'edmond-de-rothschild');
    // Unlocked now, not inside the later tip: a timer is lost when the player restores a save or retries.
    once('codex', 'petah-tikva');
    ctx.objectives.progress('colony', 2);
    refresh();
  });
  const roadWell = add('road-well', 'generic', L.ROAD_WELL_SIGN, 2.4, k('prompt.rest'), () => {
    f.watered = true;
    cheer();
    const lines = [
      line(k(f.planMain ? 'line.roadwell.main' : 'line.roadwell.other'), NARRATOR),
      line(k('line.roadwell.rest'), NARRATOR),
    ];
    say(lines, undefined);
    ctx.objectives.progress('colony', 1);
    refresh();
  });
  const rideSeat = add('ride', 'generic', { x: 0, z: 0 }, 2, k('prompt.ride'), () => startCarRide());
  const wayfarer = add('wayfarer', 'generic', L.ROAD_WAYFARER, 2.2, k('prompt.talk'), () => {
    f.wayfarer = true;
    say([line(k('line.wayfarer.1'), k('speaker.wayfarer')), line(k('line.wayfarer.2'), k('speaker.wayfarer'))], 'composite');
    refresh();
  });
  const wellSign = add('well-sign', 'generic', L.WELL_SIGN, 2.4, 'gameplay.prompt.read', () => {
    f.wellRead = true;
    say([line(k('line.well.fact'), NARRATOR), line(k('line.farmer.well'), k('speaker.farmer'))], 'composite');
    refresh();
  });
  const lanternColony = lantern('colony', 'composite-colony', L.LANTERN_COLONY);

  const listen = add('listen', 'generic', L.LISTEN_SPOT, 2.6, 'gameplay.prompt.listen', () => {
    f.listening = true;
    listenT = 0;
    say([line(k('line.listen.1'), NARRATOR), line(k('line.listen.2'), NARRATOR), line(k('line.listen.3'), NARRATOR)]);
    refresh();
  });
  let listenT = 0;
  const kidGuide = add('kid-guide', 'generic', { x: 64.6, z: 61.6 }, 1.9, k('prompt.talk'), () => {
    say([line(k('line.child.talk'), k('speaker.child'))], 'composite');
  });
  const jamila = add('jamila', 'generic', L.JAMILA, 2.2, k('prompt.deliver'), () => {
    if (!f.villageDelivered) {
      if (cart.distanceTo(L.JAMILA.x, L.JAMILA.z) > 12) {
        say([line(k('line.jamila.wait'), speakerKey('jamila'))], 'composite');
        return;
      }
      f.villageDelivered = true;
      cheer(true);
      f.parcel = false;
      cart.set(f.parts, f.parcel, f.letter);
      say(checkpointLines('village_delivered'), 'composite');
      ctx.objectives.progress('village', 1);
      refresh();
      return;
    }
    f.coffee = true;
    cheer();
    ctx.objectives.progress('village', 2);
    const cup = [line(k('line.jamila.coffee'), speakerKey('jamila')), line(k('line.jamila.reply'), speakerKey('jamila'))];
    say(cup, 'composite');
    startLens(seconds(cup) + 0.6);
    advance('villageDone');
  });
  const decoyVillage = add('decoy-village', 'generic', L.DECOY_VILLAGE, 1.9, k('prompt.deliver'), () => {
    say([line(k('line.neighbor.village'), k('speaker.neighborVillage'))], 'composite');
    ctx.mission.fail(FAIL.wrongAddressee);
  });
  const ovenWoman = add('oven', 'generic', L.OVEN_WOMAN, 2.2, k('prompt.talk'), () => {
    say([line(k('line.oven.talk'), k('speaker.villager'))], 'composite');
  });
  const lanternVillage = lantern('village', 'composite-village', L.LANTERN_VILLAGE);

  const stationmaster = add('stationmaster', 'generic', L.STATIONMASTER, 2, k('prompt.parcel'), () => {
    f.stationParcel = true;
    say([line(k('line.stationmaster.parcel'), k('speaker.stationmaster'))], 'composite');
    refresh();
  });
  const ticketWindow = add('ticket', 'generic', L.TICKET_WINDOW, 2, k('prompt.ticket'), () => {
    f.ticket = true;
    cheer();
    ctx.objectives.progress('station', 1);
    say([...checkpointLines('station'), line(k('line.stationmaster.ticket'), k('speaker.stationmaster'))], 'composite');
    bell.reset();
    bellActive = ctx.difficulty() !== 'story';
    bellWarned = false;
    refresh();
  });
  const trainDoor = add('train-door', 'generic', L.TRAIN_DOOR, 2.2, k('prompt.board'), () => {
    ctx.objectives.progress('station', 2);
    bellActive = false;
    ctx.alert(0);
    once('codex', 'hovevei-zion');
    advance('boarded');
    startRide();
  });

  const eliyahu = add('eliyahu', 'generic', L.ELIYAHU, 2.2, k('prompt.deliver'), () => {
    if (!f.jerusalemDelivered) {
      f.jerusalemDelivered = true;
      cheer(true);
      say(checkpointLines('jerusalem_delivered'), 'composite');
      once('codex', 'old-yishuv-halukka');
      ctx.objectives.progress('jerusalem', 1);
      eliyahu.promptKey = k('prompt.sit');
      return;
    }
    f.sat = true;
    cheer();
    ctx.objectives.progress('jerusalem', 2);
    const meal = [line(k('line.eliyahu.bread'), speakerKey('eliyahu')), line(k('line.eliyahu.thanks'), speakerKey('eliyahu'))];
    say(meal, 'composite');
    later(seconds(meal) + 0.8, finish);
    refresh();
  });
  const decoyJerusalem = add('decoy-jerusalem', 'generic', L.DECOY_JERUSALEM, 1.9, k('prompt.deliver'), () => {
    say([line(k('line.neighbor.jerusalem'), k('speaker.neighborJerusalem'))], 'composite');
    ctx.mission.fail(FAIL.wrongAddressee);
  });
  const lanternJerusalem = lantern('jerusalem', 'composite-old-yishuv', L.LANTERN_JERUSALEM);

  /** Which interactables are live right now (cheap; called on every change). */
  function refresh(): void {
    const s = state();
    tagItems.forEach((it, i) => (it.enabled = s === 'port_start' && !f.tags[i]));
    marketItems.forEach((it, i) => (it.enabled = s === 'market' && !f.talks[i]));
    const jaffa = s === 'port_start' || s === 'market' || s === 'loaded';
    vendor.enabled = jaffa && !f.vendor;
    lanternClerk.enabled = jaffa && !heard.has('clerk');
    planDesk.enabled = s === 'loaded' && !f.planned;
    loadParts.enabled = s === 'loaded' && f.planned && !f.parts;
    loadParcel.enabled = s === 'loaded' && f.planned && !f.parcel;
    loadLetter.enabled = s === 'loaded' && f.planned && !f.letter;
    const colonyZone = s === 'road_colony' || s === 'road_mid' || s === 'colony_delivered';
    const onRoad = s === 'road_colony' || s === 'road_mid';
    debora.enabled = onRoad && !f.tea;
    debora.promptKey = f.colonyGiven ? k('prompt.tea') : k('prompt.deliver');
    roadWell.enabled = onRoad && !f.watered;
    wayfarer.enabled = onRoad && !f.wayfarer;
    wellSign.enabled = colonyZone && !f.wellRead;
    lanternColony.enabled = colonyZone && !heard.has('colony');
    const village = s === 'village_arrival' || s === 'village_delivered';
    listen.enabled = s === 'village_arrival' && !f.listened && !f.listening;
    kidGuide.enabled = village;
    jamila.enabled = s === 'village_arrival';
    jamila.promptKey = f.villageDelivered ? k('prompt.coffee') : k('prompt.deliver');
    decoyVillage.enabled = s === 'village_arrival' && !f.villageDelivered;
    ovenWoman.enabled = village;
    lanternVillage.enabled = village && !heard.has('village');
    stationmaster.enabled = s === 'station' && !f.stationParcel;
    ticketWindow.enabled = s === 'station' && !f.ticket;
    trainDoor.enabled = s === 'station' && f.ticket;
    const arrived = s === 'jerusalem_delivered' && !riding;
    eliyahu.enabled = arrived && !f.sat;
    eliyahu.promptKey = f.jerusalemDelivered ? k('prompt.sit') : k('prompt.deliver');
    decoyJerusalem.enabled = arrived && !f.sat;
    lanternJerusalem.enabled = arrived && !heard.has('jerusalem');
  }

  function syncObjectives(): void {
    const o = ctx.objectives;
    o.progress('tags', f.tags.filter(Boolean).length);
    o.progress('market', f.talks.filter(Boolean).length);
    o.progress('colony', (f.watered ? 1 : 0) + (f.colonyGiven ? 1 : 0) + (f.tea ? 1 : 0));
    o.progress('cargo', (f.planned ? 1 : 0) + (f.parts ? 1 : 0) + (f.parcel ? 1 : 0) + (f.letter ? 1 : 0));
    o.progress('village', (f.villageDelivered ? 1 : 0) + (f.coffee ? 1 : 0));
    o.progress('station', (f.ticket ? 1 : 0) + (state() === 'jerusalem_delivered' ? 1 : 0));
    o.progress('jerusalem', (f.jerusalemDelivered ? 1 : 0) + (f.sat ? 1 : 0));
  }

  // ---- state changes -------------------------------------------------------------------------------------
  /** Sends a mission event and prepares whatever the new state needs. */
  function advance(event: E): void {
    if (!ctx.mission.send(event)) return;
    stuckT = 0;
    stuckShown = false;
    fieldTelegraph.reset();
    fieldWarned = false;
    ctx.alert(0);
    const s = state();
    wp = 0;
    switch (s) {
      case 'market':
        say([line(k('line.habib.market'), speakerKey('habib'))], 'composite');
        break;
      case 'loaded': {
        const briefed = line(k('line.habib.briefed'), speakerKey('habib'));
        if (habibWaitS > 0) later(habibWaitS, () => say([briefed], 'composite'));
        else say([briefed], 'composite');
        habibWaitS = 0;
        break;
      }
      case 'road_colony':
        say(checkpointLines('road_colony'));
        break;
      case 'village_arrival':
        say(checkpointLines('village_arrival'));
        break;
      case 'station':
        once('codex', 'hovevei-zion');
        say([line(k('line.station.arrive'), NARRATOR)]);
        break;
      default:
        break;
    }
    syncObjectives();
    refresh();
  }

  function finish(): void {
    once('archive', 'herzl-diary-1897');
    once('archive', 'khalidi-letters-1899');
    once('testimony', 'herzl-diary-1897');
    once('testimony', 'khalidi-letter-1899');
    const outro = checkpointLines('complete');
    say(outro, 'composite');
    later(seconds(outro) + 0.5, () => {
      ctx.mission.send('lettersDone');
    });
  }

  function startLens(delay: number): void {
    const c = (key: string, speaker: string): Line => line(key, speaker, 22000);
    const lens = [
      c('ch00.lens.land.common', 'ch00.lens.land.title'),
      c('ch00.lens.land.a.body', 'ch00.lens.land.a.title'),
      c('ch00.lens.land.b.body', 'ch00.lens.land.b.title'),
      c('ch00.lens.land.limits', 'ch00.lens.land.title'),
    ];
    lensUntil = elapsed + delay + seconds(lens) + 0.4;
    queuedUntil = lensUntil;
    ctx.bus.emit('audio:mood', { mood: 'reflective', era: 0 });
    later(delay, () => ctx.say(lens, 'documented'));
  }

  // ---- riding the cart on the open road (no dead walking) ------------------------------------------------------
  interface CarRide {
    readonly stretch: string;
    readonly pts: L.Pt[];
    readonly cum: number[];
    done: number;
    said: number;
  }
  const RIDE_SPEED = 11;
  const dist2 = (a: L.Pt, b: L.Pt): number => Math.hypot(a.x - b.x, a.z - b.z);

  /** The open stretch the player could ride right now, or null (near a place, or almost there). */
  function openStretch(): { id: string; pts: L.Pt[] } | null {
    const s = state();
    let id: string;
    let pts: L.Pt[];
    if (s === 'road_colony' || s === 'road_mid') {
      if (!f.watered) {
        id = 'a1';
        pts = [...L.WAY_TO_COLONY.slice(0, 3), L.ROAD_WELL_SIGN];
      } else if (!f.colonyGiven) {
        id = 'a2';
        pts = [...L.WAY_TO_COLONY.slice(3)];
      } else return null;
    } else if (s === 'colony_delivered' || s === 'path_mid') {
      id = 'b';
      pts = [L.WAY_TO_COLONY[6] as L.Pt, ...L.WAY_TO_VILLAGE, L.VILLAGE_GATE];
    } else if (s === 'village_delivered') {
      id = 'c';
      pts = [...L.WAY_TO_STATION];
    } else return null;
    const here: L.Pt = { x: player.x, z: player.z };
    for (const kp of L.KEY_POINTS) if (dist2(kp, here) < 7) return null;
    const end = pts[pts.length - 1] as L.Pt;
    const left = dist2(here, end);
    if (left < 18) return null;
    return { id, pts: pts.filter((p) => dist2(p, end) < left - 3) };
  }

  function startCarRide(): void {
    const o = openStretch();
    if (!o || carRide || riding) return;
    const pts: L.Pt[] = [{ x: player.x, z: player.z }, ...o.pts];
    const cum: number[] = [0];
    for (let i = 1; i < pts.length; i++) cum.push((cum[i - 1] as number) + dist2(pts[i - 1] as L.Pt, pts[i] as L.Pt));
    carRide = { stretch: o.id, pts, cum, done: 0, said: 0 };
    player.controllable = false;
    cheer();
    refresh();
  }

  function carRideStep(dt: number): void {
    const r = carRide;
    if (!r) return;
    const total = r.cum[r.cum.length - 1] as number;
    r.done = Math.min(total, r.done + RIDE_SPEED * dt);
    let i = 1;
    while (i < r.cum.length - 1 && (r.cum[i] as number) < r.done) i++;
    const a = r.pts[i - 1] as L.Pt;
    const b = r.pts[i] as L.Pt;
    const segLen = Math.max(1e-6, (r.cum[i] as number) - (r.cum[i - 1] as number));
    const u = Math.min(1, Math.max(0, (r.done - (r.cum[i - 1] as number)) / segLen));
    const x = a.x + (b.x - a.x) * u;
    const z = a.z + (b.z - a.z) * u;
    const h = Math.atan2(b.x - a.x, b.z - a.z);
    player.motor.place(x, z, h);
    cart.place(x - Math.sin(h) * 3.4, z - Math.cos(h) * 3.4, h);
    // One small thing per stretch, at a third and two thirds of the way.
    const frac = r.done / Math.max(1, total);
    const due = frac >= 0.66 ? 2 : frac >= 0.3 ? 1 : 0;
    while (r.said < due) {
      r.said++;
      const speaker = r.said === 1 ? k('speaker.passer') : null;
      say([line(k('line.ride.' + r.stretch + '.' + String(r.said)), speaker)], speaker ? 'composite' : undefined);
    }
    if (r.done >= total) {
      carRide = null;
      player.controllable = true;
      cheer();
      refresh();
    }
  }

  function startRide(): void {
    riding = true;
    rideT = 0;
    player.controllable = false;
    cart.setVisible(false);
    say([line(k('line.board'), NARRATOR)]);
    refresh();
  }

  // ---- placing the player and cart at checkpoints -----------------------------------------------------------
  function spawnAt(sp: Spawn, cartBehind = true): void {
    player.spawn(sp.x, sp.z, sp.heading);
    const back = 4.2;
    if (cartBehind) cart.place(sp.x - Math.sin(sp.heading) * back, sp.z - Math.cos(sp.heading) * back, sp.heading);
  }

  const SPAWN_LOADED: Spawn = { x: -46.5, z: -1.2, heading: PI / 2 };
  const SPAWN_ROAD: Spawn = { x: L.GATE_ROAD.x, z: L.GATE_ROAD.z, heading: 0.15 };

  function enterCheckpoint(checkpoint: string, data: unknown): void {
    timers.length = 0;
    carRide = null;
    rideCheckT = 0;
    rideHinted.clear();
    f = freshFlags();
    riding = false;
    rideT = 0;
    bellActive = false;
    bellWarned = false;
    bell.reset();
    lensUntil = 0;
    queuedUntil = 0;
    listenT = 0;
    stuckT = 0;
    stuckShown = false;
    fieldTelegraph.reset();
    fieldWarned = false;
    nudgeCooldown = 0;
    player.controllable = true;
    ctx.alert(0);
    cart.setVisible(true);
    placeTrain(trainParkedAlong);
    cart.place(L.CART_START.x, L.CART_START.z, PI / 2);

    const full = (): void => {
      f.tags = [true, true, true, true];
      f.talks = [true, true, true];
      f.planned = true;
      f.planMain = true;
      f.parts = true;
      f.parcel = true;
      f.letter = true;
    };
    const afterColony = (): void => {
      full();
      f.parts = false;
      f.letter = false;
      f.watered = true;
      f.colonyGiven = true;
      f.tea = true;
    };
    const afterVillage = (): void => {
      afterColony();
      f.parcel = false;
      f.villageDelivered = true;
      f.coffee = true;
    };
    switch (checkpoint) {
      case 'market':
        f.tags = [true, true, true, true];
        spawnAt(L.SPAWN_MARKET, false);
        break;
      case 'loaded':
        f.tags = [true, true, true, true];
        f.talks = [true, true, true];
        spawnAt(SPAWN_LOADED);
        cart.place(L.CART_START.x, L.CART_START.z, PI / 2);
        break;
      case 'road_colony':
        full();
        spawnAt(SPAWN_ROAD);
        break;
      case 'road_mid':
        full();
        spawnAt(L.SPAWN_ROAD_MID);
        break;
      case 'colony_delivered':
        afterColony();
        spawnAt(L.SPAWN_COLONY);
        break;
      case 'path_mid':
        afterColony();
        spawnAt(L.SPAWN_PATH_MID);
        break;
      case 'village_arrival':
        afterColony();
        spawnAt(L.SPAWN_VILLAGE_ARRIVAL);
        break;
      case 'village_delivered':
        afterVillage();
        spawnAt(L.SPAWN_VILLAGE_DONE);
        break;
      case 'station':
        afterVillage();
        spawnAt(L.SPAWN_STATION);
        break;
      case 'jerusalem_delivered':
        afterVillage();
        f.ticket = true;
        spawnAt(L.SPAWN_JERUSALEM, false);
        cart.setVisible(false);
        placeTrain(trainEndAlong);
        break;
      default:
        spawnAt(L.SPAWN_PORT);
        break;
    }
    if (isSaved(data)) {
      f = { ...freshFlags(), ...data.flags, tags: [...data.flags.tags], talks: Array.isArray(data.flags.talks) ? [...data.flags.talks] : [false, false, false] };
      f.listening = false;
      f.ticket = f.ticket && checkpoint === 'station';
      player.spawn(data.x, data.z, player.motor.heading);
      if (checkpoint !== 'jerusalem_delivered') cart.place(data.x - 4, data.z, 0);
      // The closing timer is not part of the save: a save taken during the meal must still finish the mission.
      if (checkpoint === 'jerusalem_delivered' && f.sat) later(0.8, finish);
    }
    cart.set(f.parts, f.parcel, f.letter);
    wp = 0;
    syncObjectives();
    refresh();
    if (!isSaved(data)) {
      if (checkpoint === 'market') say([line(k('line.habib.market'), speakerKey('habib'))], 'composite');
      if (checkpoint === 'port_start' || checkpoint === 'loaded' || checkpoint === 'road_colony' || checkpoint === 'village_arrival') say(checkpointLines(checkpoint));
      if (checkpoint === 'station') say([line(k('line.station.arrive'), NARRATOR)]);
      if (checkpoint === 'jerusalem_delivered') say([line(k('line.jerusalem.arrive'), NARRATOR)]);
    }
    emitBed(true);
    ctx.bus.emit('audio:mood', { mood: checkpoint === 'jerusalem_delivered' ? 'hopeful' : 'calm', era: 0 });
  }

  function emitBed(force = false): void {
    const bed = L.bedAt(player.x, player.z);
    if (!force && bed === lastBed) return;
    lastBed = bed;
    ctx.bus.emit('audio:cue', { cue: 'ambience.' + bed });
  }

  // ---- guide marker --------------------------------------------------------------------------------------------
  function nextOnRoute(route: readonly L.Pt[], end: L.Pt): L.Pt {
    while (wp < route.length && Math.hypot((route[wp] as L.Pt).x - player.x, (route[wp] as L.Pt).z - player.z) < 7) wp++;
    return wp < route.length ? (route[wp] as L.Pt) : end;
  }

  function guideTarget(): L.Pt {
    switch (state()) {
      case 'port_start': {
        const i = f.tags.indexOf(false);
        return i >= 0 ? (L.TAGS[i] as L.Pt) : L.HABIB;
      }
      case 'market': {
        const i = f.talks.indexOf(false);
        return i >= 0 ? (L.MARKET_TALKS[i] as L.Pt) : L.PLAN_DESK;
      }
      case 'loaded':
        if (!f.planned) return L.PLAN_DESK;
        if (!f.parts) return L.LOAD_PARTS;
        if (!f.parcel) return L.LOAD_PARCEL;
        if (!f.letter) return L.LOAD_LETTER;
        return L.GATE_ROAD;
      case 'road_colony':
      case 'road_mid':
        if (!f.watered) return L.ROAD_WELL_SIGN;
        return nextOnRoute(L.WAY_TO_COLONY, L.DEBORA);
      case 'colony_delivered':
      case 'path_mid':
        return nextOnRoute(L.WAY_TO_VILLAGE, L.VILLAGE_GATE);
      case 'village_arrival':
        return L.JAMILA;
      case 'village_delivered':
        return nextOnRoute(L.WAY_TO_STATION, L.STATION_ZONE);
      case 'station':
        return f.ticket ? L.TRAIN_DOOR : L.TICKET_WINDOW;
      default:
        return L.ELIYAHU;
    }
  }

  // ---- the simulation step -----------------------------------------------------------------------------------------
  const update = (dt: number): void => {
    elapsed += dt;
    nudgeCooldown = Math.max(0, nudgeCooldown - dt);
    for (let i = timers.length - 1; i >= 0; i--) {
      const t = timers[i] as { at: number; fn: () => void };
      if (elapsed >= t.at) {
        timers.splice(i, 1);
        t.fn();
      }
    }
    if (riding) rideStep(dt);
    carRideStep(dt);
    player.update(dt);
    if (!riding && !carRide) cart.update(dt, player.x, player.z);
    // The offer to ride: checked a few times a second, and the prompt follows the player.
    rideCheckT -= dt;
    if (rideCheckT <= 0) {
      rideCheckT = 0.25;
      const o = carRide || riding ? null : openStretch();
      rideSeat.enabled = o !== null;
      if (o && !rideHinted.has(o.id)) {
        rideHinted.add(o.id);
        nudge([line(k('line.ride.offer'), NARRATOR)]);
      }
    }
    rideSeat.x = player.x;
    rideSeat.z = player.z;
    const s = state();
    if (s === 'complete' || s === 'failed') return;
    const px = player.x;
    const pz = player.z;
    const near = (p: L.Pt, r: number): boolean => (p.x - px) ** 2 + (p.z - pz) ** 2 <= r * r;

    // Zones that move the mission on.
    if (s === 'loaded' && f.planned) {
      if (near(L.GATE_YARD, 3.4) && !(f.parts && f.parcel && f.letter)) nudge([line(k('line.habib.gate'), speakerKey('habib'))]);
      if (near(L.GATE_ROAD, 3.6)) advance('cartReady');
    } else if (s === 'loaded' && near(L.GATE_ROAD, 3.6)) {
      nudge([line(k('line.habib.noplan'), speakerKey('habib'))]);
    } else if (s === 'road_colony' && near(L.ROAD_MID, L.MID_RADIUS)) advance('halfway');
    else if ((s === 'colony_delivered') && near(L.PATH_MID, L.MID_RADIUS)) advance('junction');
    else if ((s === 'colony_delivered' || s === 'path_mid') && near(L.VILLAGE_GATE, 5)) advance('atVillage');
    else if (s === 'village_delivered' && near(L.STATION_ZONE, 5)) advance('atStation');

    // Listening in the village (optional, 20 s within earshot).
    if (f.listening) {
      if (near(L.LISTEN_SPOT, 4.6)) {
        listenT += dt;
        if (listenT >= L.LISTEN_SECONDS) {
          f.listening = false;
          f.listened = true;
          once('codex', 'ottoman-land-law');
          say([line(k('line.listen.done'), NARRATOR)]);
          refresh();
        }
      } else {
        f.listening = false;
        listenT = 0;
        refresh();
      }
    }

    // Fields: a warning of at least the telegraph time before anything counts.
    let danger = 0;
    if (!riding && !carRide && s !== 'jerusalem_delivered') {
      const exposed = scenery.inField(px, pz) || scenery.inField(cart.x, cart.z);
      if (fieldTelegraph.update(dt, exposed)) {
        fieldTelegraph.reset();
        ctx.alert(0);
        ctx.mission.fail(FAIL.fieldCrossing);
        return;
      }
      if (fieldTelegraph.phase === 'warning' && !fieldWarned && elapsed >= lensUntil) {
        fieldWarned = true;
        say([line(k('line.field.warn'), k('speaker.fieldFarmer'))], 'composite');
      }
      if (fieldTelegraph.phase === 'idle') fieldWarned = false;
      danger = fieldTelegraph.level;
    }
    // The station bell: only after the ticket, and the train waits on Story.
    if (bellActive && s === 'station' && elapsed >= lensUntil) {
      const left = bell.remaining / Math.max(1e-6, bell.duration);
      danger = Math.max(danger, Math.min(1, Math.max(0, (0.6 - left) / 0.6)));
      if (left < 0.25 && !bellWarned) {
        bellWarned = true;
        say([line(k('line.bell.warn'), NARRATOR)]);
      }
      if (bell.update(dt)) {
        bellActive = false;
        ctx.alert(0);
        ctx.mission.fail(FAIL.missedTrain);
        return;
      }
    }
    ctx.alert(danger);

    // Quiet help: after the difficulty's hint delay, say where to go (once per checkpoint).
    stuckT += dt;
    if (!stuckShown && stuckT >= ctx.params().hintDelaySeconds && elapsed >= lensUntil) {
      stuckShown = true;
      const hint = hintFor(s);
      if (hint) say([{ textKey: hint, speakerKey: null, durationMs: 6000 }]);
    }

    // Guide marker and ambience.
    const g = guideTarget();
    marker.group.position.set(g.x, world.heightAt(g.x, g.z) + 0.05, g.z);
    emitBed();
  };

  function hintFor(s: string): string | undefined {
    const own: Record<string, string> = { market: k('hint.market'), road_mid: k('hint.roadMid'), colony_delivered: k('hint.colonyDelivered'), path_mid: k('hint.colonyDelivered'), village_delivered: k('hint.villageDelivered') };
    return HINT_KEYS[MISSION_ID]?.[s] ?? own[s];
  }

  function rideStep(dt: number): void {
    rideT += dt;
    const dur = ctx.reducedMotion() ? RIDE_SECONDS_REDUCED : RIDE_SECONDS;
    const u = Math.min(1, rideT / dur);
    const eased = u * u * (3 - 2 * u);
    const along = trainParkedAlong + (trainEndAlong - trainParkedAlong) * eased;
    placeTrain(along);
    player.motor.place(train.position.x, train.position.z, train.rotation.y);
    if (u >= 1) {
      riding = false;
      player.controllable = true;
      player.spawn(L.SPAWN_JERUSALEM.x, L.SPAWN_JERUSALEM.z, L.SPAWN_JERUSALEM.heading);
      say([line(k('line.jerusalem.arrive'), NARRATOR)]);
      ctx.bus.emit('audio:mood', { mood: 'hopeful', era: 0 });
      refresh();
    }
  }

  // Leaving the level (exit to the hub, title) must not leave its environment bed playing.
  const scene = world.gameScene(() => ctx.bus.emit('audio:cue', { cue: 'ambience.none' }));
  return {
    scene,
    player,
    update,
    enterCheckpoint,
    snapshotData: (): SavedData => ({
      x: riding ? L.SPAWN_JERUSALEM.x : player.x,
      z: riding ? L.SPAWN_JERUSALEM.z : player.z,
      flags: { ...f, tags: [...f.tags] },
    }),
    dispose: () => scene.dispose(),
  };
}

// ---- bot script ------------------------------------------------------------------------------------------------

const walk = (p: L.Pt, within = 1.1): BotStep => ({ kind: 'walkTo', x: p.x, z: p.z, within });
const route = (pts: readonly L.Pt[], within = 2.2): BotStep[] => pts.map((p) => walk(p, within));
const interact: BotStep = { kind: 'press', action: 'interact' };
const pause = (seconds: number): BotStep => ({ kind: 'wait', seconds });
const at = (p: L.Pt, dz: number): L.Pt => ({ x: p.x, z: p.z + dz });

const toColony = (from = 0): BotStep[] => [
  ...route(L.WAY_TO_COLONY.slice(from, 3)),
  walk(L.ROAD_WELL_SIGN, 1.2),
  interact,
  pause(0.3),
  ...route(L.WAY_TO_COLONY.slice(Math.max(from, 3))),
  walk(L.DEBORA, 1.5),
  interact,
  pause(0.4),
  interact,
];
const toVillage = (from = 0): BotStep[] => [...route(L.WAY_TO_VILLAGE.slice(from)), walk(L.VILLAGE_GATE, 1.5), { kind: 'waitFor', state: 'village_arrival', timeout: 20 }];

const botScript: Record<S, readonly BotStep[]> = {
  port_start: L.TAGS.flatMap((t) => [walk(at(t, 1.0), 0.6), interact, pause(0.15)]),
  market: L.MARKET_TALKS.flatMap((t) => [walk(at(t, 1.0), 0.8), interact, pause(0.15)]),
  loaded: [
    walk(at(L.PLAN_DESK, 1.2), 0.9),
    interact,
    { kind: 'plan' },
    walk(L.LOAD_PARTS, 0.9),
    interact,
    walk(L.LOAD_PARCEL, 0.9),
    interact,
    walk(L.LOAD_LETTER, 0.9),
    interact,
    walk(L.GATE_YARD, 1.5),
    walk(L.GATE_ROAD, 1.2),
  ],
  road_colony: toColony(),
  road_mid: toColony(3),
  colony_delivered: toVillage(),
  path_mid: toVillage(3),
  village_arrival: [walk(L.JAMILA, 1.4), interact, pause(0.4), interact],
  village_delivered: [...route(L.WAY_TO_STATION), walk(L.STATION_ZONE, 1.5), { kind: 'waitFor', state: 'station', timeout: 150 }],
  station: [walk(L.STATIONMASTER, 1.3), interact, walk(L.TICKET_WINDOW, 1.2), interact, walk(L.TRAIN_DOOR, 1.2), interact],
  jerusalem_delivered: [walk(L.ELIYAHU, 1.4), interact, pause(0.4), interact, { kind: 'waitFor', state: 'complete', timeout: 120 }],
};

export default defineLevel<S, E>({
  id: 'jaffa-letters',
  chapterId: CH00_ID,
  missionId: MISSION_ID,
  mission: {
    id: MISSION_ID,
    chapterId: CH00_ID,
    gameplayType: 'LOG',
    checkpoints: ['port_start', 'market', 'loaded', 'road_colony', 'colony_delivered', 'village_arrival', 'village_delivered', 'station', 'jerusalem_delivered'],
    machine: {
      initial: 'port_start',
      final: ['complete'],
      transitions: {
        port_start: { briefed: 'market' },
        market: { marketDone: 'loaded' },
        loaded: { cartReady: 'road_colony' },
        road_colony: { halfway: 'road_mid', colonyDone: 'colony_delivered' },
        road_mid: { colonyDone: 'colony_delivered' },
        colony_delivered: { junction: 'path_mid', atVillage: 'village_arrival' },
        path_mid: { atVillage: 'village_arrival' },
        village_arrival: { villageDone: 'village_delivered' },
        village_delivered: { atStation: 'station' },
        station: { boarded: 'jerusalem_delivered' },
        jerusalem_delivered: { lettersDone: 'complete' },
        failed: {},
        complete: {},
      },
    },
  },
  objectives: [
    { id: 'tags', textKey: 'ch00.obj.jaffa.1', states: ['port_start'], steps: 4 },
    { id: 'market', textKey: k('obj.market'), states: ['market'], steps: 3 },
    { id: 'cargo', textKey: 'ch00.obj.jaffa.2', states: ['loaded'], steps: 4 },
    { id: 'colony', textKey: 'ch00.obj.jaffa.3', states: ['road_colony', 'road_mid'], steps: 3 },
    { id: 'toVillage', textKey: k('obj.village'), states: ['colony_delivered', 'path_mid'] },
    { id: 'village', textKey: 'ch00.obj.jaffa.4', states: ['village_arrival'], steps: 2 },
    { id: 'toStation', textKey: k('obj.station'), states: ['village_delivered'] },
    { id: 'station', textKey: 'ch00.obj.jaffa.5', states: ['station'], steps: 2 },
    { id: 'jerusalem', textKey: 'ch00.obj.jaffa.6', states: ['jerusalem_delivered'], steps: 2 },
  ],
  failures,
  botScript,
  extraCheckpoints: ['road_mid', 'path_mid'],
  briefingContextKey: k('briefing.context'),
  briefingMap: {
    size: L.WORLD_SIZE,
    points: [
      { x: L.SPAWN_PORT.x, z: L.SPAWN_PORT.z, kind: 'start', labelKey: k('map.port') },
      { x: L.DEBORA.x, z: L.DEBORA.z, kind: 'goal', labelKey: k('map.colony') },
      { x: L.JAMILA.x, z: L.JAMILA.z, kind: 'goal', labelKey: k('map.village') },
      { x: L.STATION_ZONE.x, z: L.STATION_ZONE.z, kind: 'poi', labelKey: k('map.station') },
      { x: L.ELIYAHU.x, z: L.ELIYAHU.z, kind: 'goal', labelKey: k('map.jerusalem') },
    ],
    routes: [L.ROAD_MAIN_POINTS, L.PATH_VILLAGE_POINTS, L.PATH_STATION_POINTS, L.RAIL_POINTS, L.PATH_JERUSALEM_POINTS],
  },
  build,
});
