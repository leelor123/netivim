import type * as THREE from 'three';
import type { EventBus } from '../core/events';
import type { GameEvents } from '../core/gameEvents';
import { catmullRomVec3, distVec3, ease, lerpVec3, type Vec3Out } from './math';
import type {
  AudioMood,
  CameraKey,
  CutsceneDefinition,
  CutsceneOverlay,
  DepthOfFieldTarget,
  DofKey,
  FadeColor,
  FadeItem,
  LetterboxItem,
  TitleCardItem,
} from './types';

const EPS = 1e-9;
const DEFAULT_FOV = 50;
/** A camera segment faster than this is "fast" and gets replaced by a cut in reduced-motion mode. */
export const FAST_POSITION_SPEED = 8;
export const FAST_TARGET_SPEED = 12;
export const FAST_FOV_SPEED = 12;
/** Half width in seconds of the dip-to-black around a reduced-motion cut. */
const DIP_HALF_SEC = 0.25;
const TITLE_RAMP_SEC = 0.5;

type EmitItem =
  | { t: number; prio: number; kind: 'sub-show'; textKey: string; speakerKey: string | null; durationMs: number; voice: boolean }
  | { t: number; prio: number; kind: 'sub-clear' }
  | { t: number; prio: number; kind: 'cue'; cue: string; intensity: number | undefined }
  | { t: number; prio: number; kind: 'mood'; mood: AudioMood; era: number }
  | { t: number; prio: number; kind: 'event'; name: string };

export interface CompiledCutscene {
  readonly id: string;
  readonly durationSec: number;
  readonly emits: readonly EmitItem[];
  readonly cameraKeys: readonly CameraKey[];
  readonly fovs: readonly number[];
  readonly shakes: readonly number[];
  readonly catmull: boolean;
  /** Per camera segment i (key i to i+1): too fast for reduced-motion mode. */
  readonly fast: readonly boolean[];
  readonly dofKeys: readonly DofKey[];
  readonly fades: readonly FadeItem[];
  readonly letterbox: readonly LetterboxItem[];
  readonly titles: readonly TitleCardItem[];
}

const byT = <T extends { t: number }>(a: T, b: T): number => a.t - b.t;

/** Flattens the tracks into sorted, ready-to-sample arrays. Runs once per play (not per frame). */
export function compileCutscene(def: CutsceneDefinition): CompiledCutscene {
  const emits: EmitItem[] = [];
  let cameraKeys: CameraKey[] = [];
  let catmull = false;
  let dofKeys: DofKey[] = [];
  const fades: FadeItem[] = [];
  const letterbox: LetterboxItem[] = [];
  const titles: TitleCardItem[] = [];
  for (const track of def.tracks) {
    switch (track.kind) {
      case 'camera':
        cameraKeys = [...track.keys].sort(byT);
        catmull = track.path === 'catmull-rom';
        break;
      case 'dof':
        dofKeys = [...track.keys].sort(byT);
        break;
      case 'fade':
        fades.push(...track.items);
        break;
      case 'letterbox':
        letterbox.push(...track.items);
        break;
      case 'title':
        titles.push(...track.items);
        break;
      case 'subtitles':
        for (const s of track.items) {
          emits.push({ t: s.t, prio: 1, kind: 'sub-show', textKey: s.textKey, speakerKey: s.speakerKey, durationMs: s.durationMs, voice: s.voice });
          // The clear sorts before a show that starts at the same instant.
          emits.push({ t: s.t + s.durationMs / 1000, prio: 0, kind: 'sub-clear' });
        }
        break;
      case 'audio':
        for (const a of track.items) {
          if (a.cue !== undefined) emits.push({ t: a.t, prio: 1, kind: 'cue', cue: a.cue, intensity: a.intensity });
          if (a.mood !== undefined) emits.push({ t: a.t, prio: 1, kind: 'mood', mood: a.mood, era: a.era ?? 0 });
        }
        break;
      case 'events':
        for (const e of track.items) emits.push({ t: e.t, prio: 1, kind: 'event', name: e.name });
        break;
    }
  }
  // Array.prototype.sort is stable, so equal (t, prio) keep authoring order.
  emits.sort((a, b) => a.t - b.t || a.prio - b.prio);
  fades.sort(byT);
  letterbox.sort(byT);
  titles.sort(byT);

  const fovs: number[] = [];
  const shakes: number[] = [];
  let lastFov = DEFAULT_FOV;
  for (const k of cameraKeys) {
    lastFov = k.fov ?? lastFov;
    fovs.push(lastFov);
    shakes.push(k.shake ?? 0);
  }
  const fast: boolean[] = [];
  for (let i = 0; i + 1 < cameraKeys.length; i++) {
    const a = cameraKeys[i];
    const b = cameraKeys[i + 1];
    if (!a || !b) continue;
    const dur = Math.max(b.t - a.t, EPS);
    fast.push(
      distVec3(a.position, b.position) / dur > FAST_POSITION_SPEED ||
        distVec3(a.target, b.target) / dur > FAST_TARGET_SPEED ||
        Math.abs((fovs[i + 1] ?? lastFov) - (fovs[i] ?? lastFov)) / dur > FAST_FOV_SPEED,
    );
  }
  return { id: def.id, durationSec: def.durationSec, emits, cameraKeys, fovs, shakes, catmull, fast, dofKeys, fades, letterbox, titles };
}

export interface CutsceneHost {
  readonly bus: Pick<EventBus<GameEvents>, 'emit'>;
  /** Camera of the active scene; read when a cutscene starts. */
  getCamera(): THREE.PerspectiveCamera | null;
  isReducedMotion(): boolean;
  readonly overlay: CutsceneOverlay;
  getDepthOfFieldTarget?(): DepthOfFieldTarget | null;
}

export type SceneEventListener = (name: string, timeSec: number) => void;
export type EndListener = (id: string, skipped: boolean) => void;

const EMPTY: Record<string, never> = {};

/**
 * Plays one cutscene at a time. Time only advances through update(dt), which the game calls
 * from its fixed-step hook, so it pauses with the game and is identical at every frame rate.
 * Sampling reuses scratch objects: no allocation per update.
 */
export class CutscenePlayer {
  private cs: CompiledCutscene | null = null;
  private cam: THREE.PerspectiveCamera | null = null;
  private savedFov = DEFAULT_FOV;
  private shownFov = Number.NaN;
  private timeSec = 0;
  private cursor = 0;
  private subtitleShown = false;
  private dofApplied = false;
  private lastFocus = Number.NaN;
  private lastAperture = Number.NaN;
  private readonly pos: Vec3Out = { x: 0, y: 0, z: 0 };
  private readonly tgt: Vec3Out = { x: 0, y: 0, z: 0 };
  private readonly listeners = new Set<SceneEventListener>();
  private readonly endListeners = new Set<EndListener>();

  constructor(private readonly host: CutsceneHost) {}

  get playing(): boolean {
    return this.cs !== null;
  }

  get currentId(): string | null {
    return this.cs?.id ?? null;
  }

  get time(): number {
    return this.timeSec;
  }

  get progress(): number {
    return this.cs ? Math.min(1, this.timeSec / this.cs.durationSec) : 0;
  }

  /** Generic `events` track items arrive here (e.g. move a convoy). Returns a disposer. */
  onSceneEvent(fn: SceneEventListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onEnded(fn: EndListener): () => void {
    this.endListeners.add(fn);
    return () => this.endListeners.delete(fn);
  }

  /** Starts a cutscene; one already playing is ended as skipped first. */
  play(def: CutsceneDefinition): void {
    if (this.cs) this.finish(true);
    this.cs = compileCutscene(def);
    this.cam = this.host.getCamera();
    this.savedFov = this.cam?.fov ?? DEFAULT_FOV;
    this.shownFov = Number.NaN;
    this.timeSec = 0;
    this.cursor = 0;
    this.subtitleShown = false;
    this.host.overlay.setActive(true);
    this.host.bus.emit('cutscene:started', { id: def.id });
    this.step();
  }

  /** Advances by one fixed step. */
  update(dt: number): void {
    if (!this.cs || !(dt > 0)) return;
    this.timeSec += dt;
    this.step();
  }

  /**
   * Jumps to a time. Discrete items before it (audio, scene events) are not replayed; a
   * subtitle that should be on screen is shown again with its remaining time.
   */
  seek(sec: number): void {
    const cs = this.cs;
    if (!cs) return;
    this.timeSec = Math.min(cs.durationSec, Math.max(0, sec));
    let i = 0;
    while (i < cs.emits.length && (cs.emits[i]?.t ?? Infinity) <= this.timeSec + EPS) i++;
    this.cursor = i;
    this.clearSubtitle();
    for (const e of cs.emits) {
      if (e.kind !== 'sub-show') continue;
      const end = e.t + e.durationMs / 1000;
      if (e.t <= this.timeSec + EPS && this.timeSec < end - EPS) {
        this.host.bus.emit('subtitle:show', {
          textKey: e.textKey,
          speakerKey: e.speakerKey,
          durationMs: Math.round((end - this.timeSec) * 1000),
          voice: false,
        });
        this.subtitleShown = true;
      }
    }
    this.applyVisuals();
  }

  /** Back to time 0, firing the items at t = 0 again. Does not emit cutscene:started. */
  restart(): void {
    if (!this.cs) return;
    this.clearSubtitle();
    this.timeSec = 0;
    this.cursor = 0;
    this.step();
  }

  skip(): void {
    if (this.cs) this.finish(true);
  }

  private step(): void {
    const cs = this.cs;
    if (!cs) return;
    const done = this.timeSec >= cs.durationSec - EPS;
    const limit = done ? Infinity : this.timeSec + EPS;
    while (this.cursor < cs.emits.length) {
      const item = cs.emits[this.cursor];
      if (!item || item.t > limit) break;
      this.cursor++;
      this.fire(item);
    }
    this.applyVisuals();
    if (done) this.finish(false);
  }

  private fire(item: EmitItem): void {
    const bus = this.host.bus;
    switch (item.kind) {
      case 'sub-show':
        bus.emit('subtitle:show', { textKey: item.textKey, speakerKey: item.speakerKey, durationMs: item.durationMs, voice: item.voice });
        this.subtitleShown = true;
        break;
      case 'sub-clear':
        this.clearSubtitle();
        break;
      case 'cue':
        bus.emit('audio:cue', item.intensity === undefined ? { cue: item.cue } : { cue: item.cue, intensity: item.intensity });
        break;
      case 'mood':
        bus.emit('audio:mood', { mood: item.mood, era: item.era });
        break;
      case 'event':
        for (const fn of this.listeners) fn(item.name, item.t);
        break;
    }
  }

  private clearSubtitle(): void {
    if (!this.subtitleShown) return;
    this.subtitleShown = false;
    this.host.bus.emit('subtitle:clear', EMPTY);
  }

  private applyVisuals(): void {
    const cs = this.cs;
    if (!cs) return;
    const t = Math.min(this.timeSec, cs.durationSec);
    const reduced = this.host.isReducedMotion();
    let dip = 0;
    if (this.cam && cs.cameraKeys.length > 0) dip = this.sampleCamera(cs, this.cam, t, reduced);

    // Fade layer: the latest fade item that has started defines the amount.
    let amount = 0;
    let color: FadeColor = 'black';
    for (let i = cs.fades.length - 1; i >= 0; i--) {
      const f = cs.fades[i];
      if (!f || f.t > t + EPS) continue;
      const p = Math.min(1, Math.max(0, (t - f.t) / f.durationSec));
      amount = f.direction === 'out' ? p : 1 - p;
      color = f.color;
      break;
    }
    if (dip > amount) {
      amount = dip;
      color = 'black';
    }
    const overlay = this.host.overlay;
    overlay.setFade(amount, color);

    let on = false;
    for (let i = cs.letterbox.length - 1; i >= 0; i--) {
      const l = cs.letterbox[i];
      if (l && l.t <= t + EPS) {
        on = l.on;
        break;
      }
    }
    overlay.setLetterbox(on);

    let cardKey: string | null = null;
    let cardAlpha = 0;
    for (const c of cs.titles) {
      if (t >= c.t - EPS && t < c.t + c.durationSec) {
        const ramp = Math.min(TITLE_RAMP_SEC, c.durationSec / 2);
        cardKey = c.textKey;
        cardAlpha = Math.min(1, (t - c.t) / ramp, (c.t + c.durationSec - t) / ramp);
        break;
      }
    }
    overlay.setTitleCard(cardKey, Math.max(0, cardAlpha));

    this.applyDof(cs, t);
  }

  /** Returns the reduced-motion dip amount (0..1). */
  private sampleCamera(cs: CompiledCutscene, cam: THREE.PerspectiveCamera, t: number, reduced: boolean): number {
    const keys = cs.cameraKeys;
    let i = 0;
    while (i + 1 < keys.length && (keys[i + 1]?.t ?? Infinity) <= t) i++;
    const a = keys[i];
    if (!a) return 0;
    const b = keys[i + 1];
    let dip = 0;
    let fov = cs.fovs[i] ?? DEFAULT_FOV;
    let shake = cs.shakes[i] ?? 0;
    if (!b) {
      this.pos.x = a.position[0];
      this.pos.y = a.position[1];
      this.pos.z = a.position[2];
      this.tgt.x = a.target[0];
      this.tgt.y = a.target[1];
      this.tgt.z = a.target[2];
    } else {
      const span = b.t - a.t;
      let u = span > 0 ? (t - a.t) / span : 1;
      const isFast = reduced && cs.fast[i] === true;
      if (isFast) {
        // Gentle replacement of a fast move: hold, cut at the middle, with a dip to black.
        u = u < 0.5 ? 0 : 1;
        const mid = a.t + span / 2;
        dip = Math.max(0, 1 - Math.abs(t - mid) / DIP_HALF_SEC);
      } else {
        u = ease(a.easing, u);
      }
      if (cs.catmull && !isFast) {
        const p0 = keys[i - 1] ?? a;
        const p3 = keys[i + 2] ?? b;
        catmullRomVec3(p0.position, a.position, b.position, p3.position, u, this.pos);
        catmullRomVec3(p0.target, a.target, b.target, p3.target, u, this.tgt);
      } else {
        lerpVec3(a.position, b.position, u, this.pos);
        lerpVec3(a.target, b.target, u, this.tgt);
      }
      const fa = cs.fovs[i] ?? DEFAULT_FOV;
      const fb = cs.fovs[i + 1] ?? fa;
      fov = fa + (fb - fa) * u;
      const sa = cs.shakes[i] ?? 0;
      const sb = cs.shakes[i + 1] ?? sa;
      shake = sa + (sb - sa) * u;
    }
    if (shake > 0 && !reduced) {
      this.pos.x += shake * Math.sin(t * 37.1);
      this.pos.y += shake * Math.sin(t * 43.7 + 1.3);
      this.pos.z += shake * Math.sin(t * 29.3 + 2.1);
    }
    cam.position.set(this.pos.x, this.pos.y, this.pos.z);
    // Camera.lookAt(x, y, z) reuses an internal matrix, so nothing is allocated here.
    cam.lookAt(this.tgt.x, this.tgt.y, this.tgt.z);
    if (fov !== this.shownFov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
      this.shownFov = fov;
    }
    return dip;
  }

  private applyDof(cs: CompiledCutscene, t: number): void {
    const keys = cs.dofKeys;
    const target = this.host.getDepthOfFieldTarget?.() ?? null;
    if (keys.length === 0 || !target) return;
    let i = 0;
    while (i + 1 < keys.length && (keys[i + 1]?.t ?? Infinity) <= t) i++;
    const a = keys[i];
    if (!a) return;
    const b = keys[i + 1];
    let focus = a.focusDistance;
    let aperture = a.aperture;
    if (b && b.t > a.t) {
      const u = ease(a.easing, (t - a.t) / (b.t - a.t));
      focus += (b.focusDistance - a.focusDistance) * u;
      aperture += (b.aperture - a.aperture) * u;
    }
    if (!this.dofApplied || Math.abs(focus - this.lastFocus) > 1e-4 || Math.abs(aperture - this.lastAperture) > 1e-5) {
      target.setDepthOfField(focus, aperture);
      this.lastFocus = focus;
      this.lastAperture = aperture;
      this.dofApplied = true;
    }
  }

  private finish(skipped: boolean): void {
    const cs = this.cs;
    if (!cs) return;
    this.cs = null;
    this.clearSubtitle();
    if (this.dofApplied) this.host.getDepthOfFieldTarget?.()?.clearDepthOfField();
    this.dofApplied = false;
    this.lastFocus = Number.NaN;
    this.lastAperture = Number.NaN;
    if (this.cam && this.cam.fov !== this.savedFov) {
      this.cam.fov = this.savedFov;
      this.cam.updateProjectionMatrix();
    }
    this.cam = null;
    const o = this.host.overlay;
    o.setFade(0, 'black');
    o.setLetterbox(false);
    o.setTitleCard(null, 0);
    o.setSkipProgress(0);
    o.setActive(false);
    this.host.bus.emit('cutscene:ended', { id: cs.id, skipped });
    for (const fn of this.endListeners) fn(cs.id, skipped);
  }
}

/**
 * Skip-by-holding. Needs a fresh press (the button must be seen released first) so the press
 * that opened the cutscene cannot skip it. Before the cutscene has been seen once the hold
 * takes holdSec; afterwards a press skips at once.
 */
export class SkipHold {
  private held = 0;
  private armed = false;

  constructor(private readonly holdSec = 1) {}

  /** Returns true on the update that triggers the skip. */
  update(dt: number, down: boolean, seen: boolean): boolean {
    if (!down) {
      this.armed = true;
      this.held = 0;
      return false;
    }
    if (!this.armed) return false;
    if (seen) return this.trigger();
    this.held += dt;
    if (this.held + EPS >= this.holdSec) return this.trigger();
    return false;
  }

  get progress(): number {
    return Math.min(1, this.held / this.holdSec);
  }

  reset(): void {
    this.held = 0;
    this.armed = false;
  }

  private trigger(): boolean {
    this.held = 0;
    this.armed = false;
    return true;
  }
}
