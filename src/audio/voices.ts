/**
 * Voice limiter: caps simultaneous sound effects so nothing piles up and clips.
 * Voices expire by audio-clock time (no timers); when full, the quietest-priority, oldest voice
 * is stolen if the newcomer matters at least as much, otherwise the newcomer is rejected.
 */
export interface VoiceHandle {
  readonly id: number;
  readonly name: string;
}

interface VoiceRecord {
  readonly id: number;
  readonly name: string;
  readonly priority: number;
  readonly startedAt: number;
  endsAt: number;
  kill: (() => void) | null;
}

export class VoiceLimiter {
  private readonly voices: VoiceRecord[] = [];
  private nextId = 1;
  /** Voices stopped early because a more important one needed the slot. */
  stolen = 0;
  /** Requests refused because the limiter was full of more important voices. */
  rejected = 0;

  constructor(readonly max: number) {
    if (max < 1) throw new RangeError('VoiceLimiter needs max >= 1');
  }

  get active(): number {
    return this.voices.length;
  }

  names(): string[] {
    return this.voices.map((v) => v.name);
  }

  /** Drops voices whose end time has passed. */
  prune(now: number): void {
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      if (v && v.endsAt <= now) this.voices.splice(i, 1);
    }
  }

  /**
   * Asks for a slot. Returns a handle, or null when refused. `kill` should fade a stolen voice
   * out quickly; it is optional for voices that are too short to matter.
   */
  acquire(name: string, now: number, endsAt: number, priority: number, kill: (() => void) | null = null): VoiceHandle | null {
    this.prune(now);
    if (this.voices.length >= this.max) {
      let victim = -1;
      for (let i = 0; i < this.voices.length; i++) {
        const v = this.voices[i];
        const cur = victim >= 0 ? this.voices[victim] : undefined;
        if (!v) continue;
        if (!cur || v.priority < cur.priority || (v.priority === cur.priority && v.startedAt < cur.startedAt)) victim = i;
      }
      const target = victim >= 0 ? this.voices[victim] : undefined;
      if (!target || target.priority > priority) {
        this.rejected++;
        return null;
      }
      this.voices.splice(victim, 1);
      this.stolen++;
      try {
        target.kill?.();
      } catch {
        // A voice that cannot be stopped is already gone.
      }
    }
    const id = this.nextId++;
    this.voices.push({ id, name, priority, startedAt: now, endsAt, kill });
    return { id, name };
  }

  /** Extends or shortens a voice (used by sustained loops, which end when stopped). */
  setEnd(handle: VoiceHandle, endsAt: number): void {
    const v = this.voices.find((x) => x.id === handle.id);
    if (v) v.endsAt = endsAt;
  }

  release(handle: VoiceHandle): void {
    const i = this.voices.findIndex((x) => x.id === handle.id);
    if (i >= 0) this.voices.splice(i, 1);
  }

  /** Stops every voice with the given name (e.g. when intensity switches to gentle). */
  killByName(name: string): number {
    let n = 0;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      if (v && v.name === name) {
        this.voices.splice(i, 1);
        n++;
        try {
          v.kill?.();
        } catch {
          // Already gone.
        }
      }
    }
    return n;
  }

  clear(): void {
    this.voices.length = 0;
  }
}
