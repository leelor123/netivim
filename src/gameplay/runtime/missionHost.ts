import type { ContentLabel } from '../../content/schema';
import { effectiveParams, type AssistOption, type DifficultyLevel, type DifficultyParams } from '../../core/difficulty';
import type { EventBus } from '../../core/events';
import type { GameEvents, UnlockKind } from '../../core/gameEvents';
import type { Action } from '../../core/input/types';
import { MissionRuntime, type MissionDefinition, type MissionSnapshot } from '../../core/mission';
import type { WorldQuality } from '../../world/quality';
import { InteractionSystem } from '../core/interaction';
import type { DecisionDef } from '../core/ledger';
import type { LogisticsModel } from '../modules/logistics';
import { ObjectiveTracker } from '../core/objectives';
import { AssistPolicy } from '../core/progress';
import { telegraphSeconds } from '../core/telegraph';
import type { AnyLevelDefinition, FailureInfo, Level, LevelContext, LevelInput, Line, MissionControl } from '../types';

/** The mission as a level sees it (live getters over the host). */
class Control implements MissionControl {
  constructor(private readonly host: MissionHost) {}
  send(e: string): boolean {
    return this.host.send(e);
  }
  fail(reason: string): void {
    this.host.fail(reason);
  }
  get state(): string {
    return this.host.state;
  }
  get checkpoint(): string {
    return this.host.checkpoint;
  }
}

export type MissionPhase = 'idle' | 'running' | 'decision' | 'failed' | 'complete';

export interface FailureReport {
  readonly reasonKey: string;
  /** Null only when a level fails with an unlisted reason (a bug the solvability test catches). */
  readonly info: FailureInfo | null;
  readonly failures: number;
  /** Assist options to offer now (empty: no offer). Never applied without the player's choice. */
  readonly assistOptions: readonly AssistOption[];
}

export interface MissionHostHooks {
  onFailed(report: FailureReport): void;
  onDecision(def: DecisionDef, choose: (optionId: string) => void): void;
  onComplete(): void;
  onPlan(model: LogisticsModel, confirm: () => void): void;
  onHint?(hintKey: string): void;
  onAlert?(level: number): void;
  onSay?(lines: readonly Line[], label: ContentLabel | null): void;
}

export interface MissionHostOptions {
  readonly def: AnyLevelDefinition;
  readonly bus: EventBus<GameEvents>;
  readonly input: LevelInput;
  readonly difficulty: () => DifficultyLevel;
  readonly headless: boolean;
  readonly quality: WorldQuality;
  readonly reducedMotion: () => boolean;
  readonly t: (key: string, params?: Readonly<Record<string, string | number>>) => string;
  readonly glyph: (action: Action) => string;
  /** Records a decision into the Choice Ledger (save.choices). */
  readonly recordChoice: (def: DecisionDef, optionId: string) => void;
  readonly hooks: MissionHostHooks;
  /** Exact state from a manual or mission-start save. */
  readonly snapshot?: MissionSnapshot | null;
}

interface SnapshotData {
  readonly level: unknown;
  readonly objectives: Record<string, number>;
  readonly assists: AssistOption[];
}

function isSnapshotData(v: unknown): v is SnapshotData {
  return typeof v === 'object' && v !== null && 'objectives' in v && 'assists' in v && Array.isArray((v as SnapshotData).assists);
}

/**
 * Runs one level: the mission FSM (core MissionRuntime), objectives, interactions, decisions,
 * soft failure with instant retry, in-memory checkpoints and adaptive assists. No DOM: the
 * browser and the QA bot plug in through hooks, so the same code runs in both.
 */
export class MissionHost {
  phase: MissionPhase = 'idle';
  readonly objectives: ObjectiveTracker;
  readonly interactions = new InteractionSystem();
  readonly assists = new AssistPolicy();
  level: Level | null = null;
  private runtime: MissionRuntime<string, string>;
  private readonly failuresAt = new Map<string, number>();
  private checkpointProgress: Record<string, number> = {};
  private sayQueue: Line[] = [];
  private sayTimer = 0;
  /** The line last shown by the say queue and the seconds it holds the queue (may be extended). */
  private sayCurrent: { textKey: string; sec: number } | null = null;
  private readonly offExtend: () => void;
  /** Content label of the lines being said (shown as a chip in the caption). */
  private sayLabel: ContentLabel | null = null;
  private lastFailure: FailureReport | null = null;
  private readonly ctx: LevelContext;
  private disposed = false;
  private touchBar = false;

  constructor(private readonly o: MissionHostOptions) {
    this.objectives = new ObjectiveTracker(o.def.objectives, (objectiveKey) => o.bus.emit('mission:objective', { missionId: o.def.missionId, objectiveKey }));
    this.runtime = new MissionRuntime(this.missionDef(), o.bus);
    this.offExtend = o.bus.on('subtitle:extend', ({ textKey, durationMs }) => this.onSubtitleExtend(textKey, durationMs));
    this.ctx = {
      bus: o.bus,
      input: o.input,
      params: () => this.params,
      difficulty: o.difficulty,
      telegraph: () => telegraphSeconds(this.params),
      mission: new Control(this),
      objectives: this.objectives,
      interactions: this.interactions,
      decide: (id, onChosen) => this.decide(id, onChosen),
      plan: (model, onConfirm) => this.plan(model, onConfirm),
      say: (lines, label) => this.say(lines, label ?? null),
      unlock: (kind: UnlockKind, id: string) => o.bus.emit('unlock:item', { kind, id }),
      alert: (level) => o.hooks.onAlert?.(level),
      glyph: o.glyph,
      t: o.t,
      quality: o.quality,
      reducedMotion: o.reducedMotion,
      headless: o.headless,
      touchActions: (items) => {
        this.touchBar = items !== null;
        o.bus.emit('ui:touch-actions', { items });
      },
    };
  }

  get def(): AnyLevelDefinition {
    return this.o.def;
  }

  get params(): DifficultyParams {
    return effectiveParams(this.o.difficulty(), { moreTime: this.assists.accepted.has('moreTime'), extraCheckpoint: this.assists.accepted.has('extraCheckpoint') });
  }

  get state(): string {
    return this.runtime.state;
  }

  get checkpoint(): string {
    return this.runtime.checkpoint;
  }

  get context(): LevelContext {
    return this.ctx;
  }

  get failure(): FailureReport | null {
    return this.lastFailure;
  }

  /** Builds the level and enters the first checkpoint (or the saved exact state). */
  start(): Level {
    if (this.level) throw new Error('Mission already started');
    const level = this.o.def.build(this.ctx);
    this.level = level;
    const t = this.o.def.mission.machine.transitions as Record<string, unknown>;
    const raw = this.o.snapshot && this.o.snapshot.missionId === this.o.def.missionId ? this.o.snapshot : null;
    // A save from an older version may name a state that was renamed: start the mission fresh.
    const snap = raw && Object.hasOwn(t, raw.state) && Object.hasOwn(t, raw.checkpoint) ? raw : null;
    let levelData: unknown = null;
    if (snap && isSnapshotData(snap.data)) {
      for (const a of snap.data.assists) this.assists.accept(a);
      if (this.assists.accepted.has('extraCheckpoint')) this.runtime = new MissionRuntime(this.missionDef(), this.o.bus);
      levelData = snap.data.level;
    }
    this.runtime.start(snap ?? undefined);
    if (snap && isSnapshotData(snap.data)) this.objectives.resetProgress(snap.data.objectives);
    else this.objectives.resetProgress();
    this.checkpointProgress = this.objectives.progressSnapshot();
    this.objectives.syncState(this.runtime.state);
    level.enterCheckpoint(snap ? snap.state : this.runtime.checkpoint, levelData);
    this.phase = this.runtime.isComplete ? 'complete' : 'running';
    return level;
  }

  /** Simulated seconds this host has stepped (diagnostics and tests). */
  simTime = 0;

  /** One fixed simulation step. */
  update(dt: number): void {
    this.simTime += dt;
    this.tickSay(dt);
    if (this.phase !== 'running' || !this.level) return;
    const p = this.level.player;
    if (p) this.interactions.update(p.x, p.z, this.o.input.justPressed('interact'));
    if (this.phase !== 'running') return;
    this.level.update(dt);
  }

  send(event: string): boolean {
    if (this.phase !== 'running' && this.phase !== 'decision') return false;
    const before = this.runtime.checkpoint;
    const ok = this.runtime.send(event);
    if (!ok) return false;
    if (this.runtime.checkpoint !== before) this.checkpointProgress = this.objectives.progressSnapshot();
    this.objectives.syncState(this.runtime.state);
    if (this.runtime.isComplete) {
      this.phase = 'complete';
      this.o.hooks.onComplete();
    }
    return true;
  }

  fail(reasonKey: string): void {
    if (this.phase !== 'running' && this.phase !== 'decision') return;
    this.runtime.fail(reasonKey);
    const cp = this.runtime.checkpoint;
    const n = (this.failuresAt.get(cp) ?? 0) + 1;
    this.failuresAt.set(cp, n);
    this.phase = 'failed';
    const hasExtra = (this.o.def.extraCheckpoints ?? []).length > 0;
    const offer = this.assists.shouldOffer(cp, n, hasExtra) ? this.assists.available(hasExtra) : [];
    const info = Object.hasOwn(this.o.def.failures, reasonKey) ? (this.o.def.failures[reasonKey] ?? null) : null;
    this.lastFailure = { reasonKey, info, failures: n, assistOptions: offer };
    this.o.hooks.onFailed(this.lastFailure);
  }

  /** Instant retry from the last checkpoint (always available while not complete). */
  retry(): void {
    if (this.phase === 'complete' || !this.level) return;
    this.runtime.retry();
    this.objectives.resetProgress(this.checkpointProgress);
    this.objectives.syncState(this.runtime.state);
    this.sayQueue = [];
    this.sayCurrent = null;
    this.level.enterCheckpoint(this.runtime.checkpoint, null);
    this.phase = 'running';
    this.lastFailure = null;
  }

  /** The player accepted an offered assist; it applies from the retry that follows. */
  acceptAssist(option: AssistOption): void {
    this.assists.accept(option);
    if (option === 'hint') {
      const hint = this.lastFailure?.info?.hintKey;
      if (hint) this.o.hooks.onHint?.(hint);
    }
    if (option === 'extraCheckpoint') {
      // New checkpoints count from the next time the player passes them; the retry that follows
      // still starts at the current checkpoint.
      const cp = this.runtime.checkpoint;
      this.runtime = new MissionRuntime(this.missionDef(), this.o.bus);
      this.runtime.start({ missionId: this.o.def.missionId, state: cp, checkpoint: cp, data: null });
    }
  }

  declineAssist(): void {
    const cp = this.runtime.checkpoint;
    this.assists.decline(cp, this.failuresAt.get(cp) ?? 0);
  }

  /** Exact state for a manual save (BRIEF 8.C). */
  snapshot(): MissionSnapshot {
    const data: SnapshotData = {
      level: this.level?.snapshotData?.() ?? null,
      objectives: this.objectives.progressSnapshot(),
      assists: [...this.assists.accepted],
    };
    const state = this.runtime.state === 'failed' ? this.runtime.checkpoint : this.runtime.state;
    return { missionId: this.o.def.missionId, state, checkpoint: this.runtime.checkpoint, data: this.runtime.state === 'failed' ? { ...data, level: null } : data };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.offExtend();
    this.interactions.clear();
    if (this.touchBar) this.o.bus.emit('ui:touch-actions', { items: null });
    this.level?.dispose();
    this.level = null;
  }

  private missionDef(): MissionDefinition<string, string> {
    const def = this.o.def.mission;
    if (!this.assists.accepted.has('extraCheckpoint')) return def;
    const extra = (this.o.def.extraCheckpoints ?? []).filter((c) => !def.checkpoints.includes(c));
    return { ...def, checkpoints: [...def.checkpoints, ...extra] };
  }

  private decide(id: string, onChosen: (optionId: string) => void): boolean {
    const def = this.o.def.decisions?.find((d) => d.id === id);
    if (!def) throw new Error('Unknown decision ' + id + ' in ' + this.o.def.id);
    if (this.phase !== 'running') return false;
    this.phase = 'decision';
    this.o.hooks.onDecision(def, (optionId) => {
      if (this.phase !== 'decision') return;
      this.o.recordChoice(def, optionId);
      this.phase = 'running';
      onChosen(optionId);
    });
    return true;
  }

  private plan(model: LogisticsModel, onConfirm: () => void): void {
    if (this.phase !== 'running') return;
    this.phase = 'decision';
    this.o.hooks.onPlan(model, () => {
      if (this.phase !== 'decision' || !model.evaluate().meetsGoal) return;
      this.phase = 'running';
      onConfirm();
    });
  }

  private say(lines: readonly Line[], label: ContentLabel | null): void {
    this.sayQueue = [...lines];
    this.sayLabel = label;
    this.sayTimer = 0;
    this.sayCurrent = null;
    this.o.hooks.onSay?.(lines, label);
  }

  private tickSay(dt: number): void {
    if (this.sayQueue.length === 0) return;
    this.sayTimer -= dt;
    if (this.sayTimer > 0) return;
    const line = this.sayQueue.shift() as Line;
    this.sayTimer = line.durationMs / 1000;
    this.sayCurrent = { textKey: line.textKey, sec: line.durationMs / 1000 };
    // The caption may answer synchronously with subtitle:extend (see onSubtitleExtend).
    this.o.bus.emit('subtitle:show', { textKey: line.textKey, speakerKey: line.speakerKey, durationMs: line.durationMs, voice: true, label: this.sayLabel });
  }

  /**
   * The caption needs the current line on screen for `durationMs` in total (its pages would not
   * fit the line's own duration), so the next queued line waits that much longer. Requests for a
   * line that is no longer current are ignored.
   */
  private onSubtitleExtend(textKey: string, durationMs: number): void {
    const cur = this.sayCurrent;
    if (!cur || cur.textKey !== textKey) return;
    const sec = durationMs / 1000;
    if (sec <= cur.sec) return;
    this.sayTimer += sec - cur.sec;
    cur.sec = sec;
  }
}
