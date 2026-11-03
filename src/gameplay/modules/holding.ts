import { scheduleThreat, type ScheduledThreat } from '../core/telegraph';

/**
 * Holding a position (HLD), non-graphic: keep supplies, morale and repairs going and run the
 * evacuation queue until relief arrives. Pressure waves are always announced ahead of time
 * (telegraph) and damage structures, never people on screen.
 */

export interface HoldingSection {
  readonly id: string;
  readonly labelKey: string;
}

export interface HoldingScenario {
  readonly sections: readonly HoldingSection[];
  /** Seconds to hold until relief (scaled by the difficulty timer scale: shorter is easier). */
  readonly holdSeconds: number;
  readonly startSupplies: number;
  /** People waiting to be evacuated at the start. */
  readonly evacuees: number;
  /** Seconds between pressure waves (before the telegraph). */
  readonly waveEvery: number;
  /** Integrity lost per wave on the target section (0-1). */
  readonly waveDamage: number;
  readonly repairCost: number;
  readonly repairAmount: number;
  readonly distributeCost: number;
  /** Morale gained per distribution. */
  readonly distributeMorale: number;
  /** Morale lost per second, plus more for each broken section. */
  readonly moraleDecay: number;
  /** Seconds the evacuation vehicle needs between trips, and people per trip. */
  readonly evacCooldown: number;
  readonly evacPerTrip: number;
}

export type HoldingOutcome = 'holding' | 'held' | 'faltering';

export interface HoldingParams {
  readonly timerScale: number;
  readonly resourceScale: number;
  readonly telegraph: number;
}

export class HoldingPosition {
  supplies = 0;
  morale = 1;
  elapsed = 0;
  waiting = 0;
  evacuated = 0;
  evacReadyIn = 0;
  readonly integrity = new Map<string, number>();
  /** Announced next wave: UI shows the warning from warnAt, damage lands at hitAt. */
  nextWave: ScheduledThreat | null = null;
  private waveIndex = 0;

  constructor(
    readonly scenario: HoldingScenario,
    private readonly params: () => HoldingParams,
  ) {
    this.reset();
  }

  /** Relief arrives sooner on easier levels (timerScale > 1 means more time, so divide). */
  get holdSeconds(): number {
    return this.scenario.holdSeconds / Math.max(0.5, this.params().timerScale);
  }

  reset(): void {
    const s = this.scenario;
    this.supplies = Math.round(s.startSupplies * this.params().resourceScale);
    this.morale = 1;
    this.elapsed = 0;
    this.waiting = s.evacuees;
    this.evacuated = 0;
    this.evacReadyIn = 0;
    this.waveIndex = 0;
    for (const sec of s.sections) this.integrity.set(sec.id, 1);
    this.scheduleNext();
  }

  get warningActive(): boolean {
    return this.nextWave !== null && this.elapsed >= this.nextWave.warnAt;
  }

  /** Section the next wave targets (announced with the warning). */
  get nextTarget(): string | null {
    if (!this.nextWave) return null;
    return this.nextWave.id;
  }

  repair(sectionId: string): boolean {
    const cur = this.integrity.get(sectionId);
    if (cur === undefined || cur >= 1 || this.supplies < this.scenario.repairCost) return false;
    this.supplies -= this.scenario.repairCost;
    this.integrity.set(sectionId, Math.min(1, cur + this.scenario.repairAmount));
    return true;
  }

  distribute(): boolean {
    if (this.supplies < this.scenario.distributeCost || this.morale >= 1) return false;
    this.supplies -= this.scenario.distributeCost;
    this.morale = Math.min(1, this.morale + this.scenario.distributeMorale);
    return true;
  }

  evacuate(): boolean {
    if (this.waiting <= 0 || this.evacReadyIn > 0) return false;
    const n = Math.min(this.waiting, this.scenario.evacPerTrip);
    this.waiting -= n;
    this.evacuated += n;
    this.evacReadyIn = this.scenario.evacCooldown;
    return true;
  }

  update(dt: number): HoldingOutcome {
    this.elapsed += dt;
    this.evacReadyIn = Math.max(0, this.evacReadyIn - dt);
    const wave = this.nextWave;
    if (wave && this.elapsed >= wave.hitAt) {
      const cur = this.integrity.get(wave.id) ?? 0;
      this.integrity.set(wave.id, Math.max(0, cur - this.scenario.waveDamage));
      this.scheduleNext();
    }
    let broken = 0;
    for (const v of this.integrity.values()) if (v <= 0) broken++;
    this.morale = Math.max(0, this.morale - dt * this.scenario.moraleDecay * (1 + broken));
    if (this.morale <= 0) return 'faltering';
    if (this.elapsed >= this.holdSeconds && this.waiting === 0) return 'held';
    return 'holding';
  }

  private scheduleNext(): void {
    const sections = this.scenario.sections;
    if (sections.length === 0) {
      this.nextWave = null;
      return;
    }
    const target = sections[this.waveIndex % sections.length] as HoldingSection;
    this.waveIndex++;
    this.nextWave = scheduleThreat(target.id, this.elapsed, this.elapsed + this.scenario.waveEvery, this.params().telegraph);
  }
}
