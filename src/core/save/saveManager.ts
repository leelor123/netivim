import type { EventBus } from '../events';
import type { GameEvents, SaveSlotId } from '../gameEvents';
import { decodeEnvelope } from './envelope';
import { isSaveData, migrate, type SaveData } from './schema';
import { readSlot, readSlotAsync, slotKey, SLOT_PREFIX, writeSlot, type SlotRead } from './slots';
import type { AsyncStore, SyncStore } from './stores';

export type GameSlot = Exclude<SaveSlotId, 'settings'>;
export const GAME_SLOTS: readonly GameSlot[] = ['auto', 'manual-1', 'manual-2', 'manual-3'];
export const MANUAL_SLOTS: readonly GameSlot[] = ['manual-1', 'manual-2', 'manual-3'];

export interface SaveManagerDeps {
  readonly bus: EventBus<GameEvents>;
  /** Synchronous primary store (localStorage); exit-time writes go here first. */
  readonly primary: SyncStore;
  /** Async mirrors (IndexedDB, Capacitor Preferences) that survive WebView data loss. */
  readonly mirrors: readonly AsyncStore[];
  readonly now: () => number;
  /** Exact current game state. */
  readonly snapshot: () => SaveData;
  /** True while in a mission or cutscene (BRIEF 8.B). */
  readonly isVolatile: () => boolean;
}

export interface LoadedSave {
  readonly slot: GameSlot;
  readonly savedAt: number;
  readonly data: SaveData;
}

/** Accept current-version saves directly, and older ones if they migrate cleanly. */
const acceptsGameSave = (p: unknown): boolean => isSaveData(p) || migrate(p) !== null;

function errorText(e: unknown): string {
  return e instanceof Error ? e.name + ': ' + e.message : String(e);
}

/**
 * Implements BRIEF section 8: manual saves anywhere, exit auto-saves that never overwrite the
 * last stable save with unsaved mid-mission state, safe-moment auto-saves, mirrors and recovery.
 */
export class SaveManager {
  private volatileNow = false;
  /** A manual save happened since the current mission or cutscene began. */
  private manualSinceVolatileStart = false;
  /** Exact state of the last manual save in the current mission/cutscene period (BRIEF 8.C). */
  private lastManualThisPeriod: SaveData | null = null;
  private dirtyFlag = false;
  private ready = false;
  private readonly mirrorChain = new Map<AsyncStore, Promise<void>>();
  private readonly pending = new Set<Promise<void>>();
  /** Highest sequence number seen per slot in any store, so numbering never goes backwards. */
  private readonly knownSeq = new Map<GameSlot, number>();

  constructor(private readonly deps: SaveManagerDeps) {
    this.volatileNow = deps.isVolatile();
  }

  get dirty(): boolean {
    return this.dirtyFlag;
  }

  /** Call on every flow change. Entering a new mission or cutscene period resets the manual flag. */
  onFlowChanged(): void {
    const v = this.deps.isVolatile();
    if (v && !this.volatileNow) {
      this.manualSinceVolatileStart = false;
      this.lastManualThisPeriod = null;
      this.setDirty(true);
    }
    if (!v) this.setDirty(false);
    this.volatileNow = v;
  }

  /** Mid-mission progress happened (objective, checkpoint): the HUD shows "unsaved". */
  markDirty(): void {
    if (this.volatileNow) this.setDirty(true);
  }

  /**
   * Call once the existing save has been hydrated and loaded into the game state. Until then
   * every write is refused: an exit event during boot would otherwise store the blank initial
   * state over the player's real save.
   */
  markReady(): void {
    this.ready = true;
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** Manual Save button (pause menu / HUD): always allowed once ready, stores the exact state. */
  saveManual(slot: GameSlot = 'manual-1'): boolean {
    if (!this.ready) return false;
    const ok = this.write(slot, this.deps.snapshot(), 'manual');
    if (ok && this.volatileNow) {
      this.manualSinceVolatileStart = true;
      this.lastManualThisPeriod = this.deps.snapshot();
    }
    if (ok) this.setDirty(false);
    return ok;
  }

  /** The state saved by the last manual save in the current (or just ended) mission period, if any. */
  get manualSaveThisPeriod(): SaveData | null {
    return this.lastManualThisPeriod;
  }

  /** True when an auto-save right now would respect BRIEF 8.B. */
  get canAutosave(): boolean {
    return this.ready && (!this.volatileNow || this.manualSinceVolatileStart);
  }

  /** Safe-moment or exit auto-save into the auto slot. Returns false when skipped or failed. */
  autosave(reason: string): boolean {
    if (!this.canAutosave) return false;
    return this.write('auto', this.deps.snapshot(), reason);
  }

  /** Exit triggers: visibilitychange, pagehide, freeze, Capacitor pause. Synchronous. */
  onExit(trigger: string): boolean {
    return this.autosave('exit:' + trigger);
  }

  load(slot: GameSlot): LoadedSave | null {
    const r = this.safeRead(slot);
    if (!r) return null;
    const data = migrate(r.env.payload);
    return data ? { slot, savedAt: r.env.t, data } : null;
  }

  /** Newest save across all game slots (for Continue). */
  loadNewest(): LoadedSave | null {
    let best: LoadedSave | null = null;
    for (const slot of GAME_SLOTS) {
      const s = this.load(slot);
      if (s && (!best || s.savedAt > best.savedAt)) best = s;
    }
    return best;
  }

  /**
   * At boot: if a mirror holds a newer valid envelope than the primary (for example after the
   * WebView storage was cleared), copy it back into the primary.
   */
  async hydrateFromMirrors(): Promise<void> {
    for (const mirror of this.deps.mirrors) {
      for (const slot of GAME_SLOTS) {
        let remote: SlotRead | null;
        try {
          remote = await readSlotAsync(mirror, slot, acceptsGameSave);
        } catch {
          continue;
        }
        if (!remote) continue;
        this.knownSeq.set(slot, Math.max(this.knownSeq.get(slot) ?? 0, remote.env.seq));
        const local = this.safeRead(slot);
        if (local && local.env.seq >= remote.env.seq) continue;
        try {
          this.deps.primary.setItem(slotKey(slot, remote.buffer), remote.env.raw);
        } catch (e) {
          this.deps.bus.emit('save:failed', { slot, reason: 'hydrate', error: errorText(e) });
        }
      }
    }
  }

  /** Resolves when every mirror write started so far has settled. */
  async flushMirrors(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }

  /** Data-reset option: removes every save from the primary and all mirrors. */
  async resetAll(): Promise<void> {
    try {
      for (const key of this.deps.primary.keys()) if (key.startsWith(SLOT_PREFIX)) this.deps.primary.removeItem(key);
    } catch {
      // Storage may be blocked; mirrors are still cleared below.
    }
    const jobs: Promise<void>[] = [];
    for (const m of this.deps.mirrors) {
      for (const slot of GAME_SLOTS) for (const b of ['A', 'B'] as const) jobs.push(m.remove(slotKey(slot, b)));
    }
    await Promise.allSettled(jobs);
    this.manualSinceVolatileStart = false;
    this.setDirty(false);
  }

  private safeRead(slot: GameSlot): SlotRead | null {
    try {
      return readSlot(this.deps.primary, slot, acceptsGameSave);
    } catch {
      return null;
    }
  }

  private write(slot: GameSlot, data: SaveData, reason: string): boolean {
    let raw: string;
    let buffer: 'A' | 'B';
    try {
      // Mirrors may know a higher seq (e.g. primary was wiped); never go backwards.
      const w = writeSlot(this.deps.primary, slot, data, this.deps.now(), acceptsGameSave, this.knownSeq.get(slot) ?? 0);
      this.knownSeq.set(slot, w.seq);
      raw = w.raw;
      buffer = w.buffer;
    } catch (e) {
      this.deps.bus.emit('save:failed', { slot, reason, error: errorText(e) });
      return false;
    }
    for (const mirror of this.deps.mirrors) {
      // Writes to one mirror are chained so they land in order (no older envelope wins a race).
      const previous = this.mirrorChain.get(mirror) ?? Promise.resolve();
      const job: Promise<void> = previous
        .then(() => mirror.set(slotKey(slot, buffer), raw))
        .catch((e: unknown) => this.deps.bus.emit('save:failed', { slot, reason: 'mirror:' + mirror.name, error: errorText(e) }))
        .finally(() => this.pending.delete(job));
      this.mirrorChain.set(mirror, job);
      this.pending.add(job);
    }
    // Defensive read-back: a store that silently dropped the write is a failure.
    const check = decodeEnvelope(this.readRaw(slotKey(slot, buffer)));
    if (!check) {
      this.deps.bus.emit('save:failed', { slot, reason, error: 'read-back mismatch' });
      return false;
    }
    this.deps.bus.emit('save:written', { slot, reason });
    return true;
  }

  private readRaw(key: string): string | null {
    try {
      return this.deps.primary.getItem(key);
    } catch {
      return null;
    }
  }

  private setDirty(d: boolean): void {
    if (d === this.dirtyFlag) return;
    this.dirtyFlag = d;
    this.deps.bus.emit('save:dirty-changed', { dirty: d });
  }
}
