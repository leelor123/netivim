/**
 * Convoy escort (CNV): vehicles follow a polyline route made of segments; at forks the player
 * chooses the next segment. Hazards (roadblocks, ambush warnings) are active in time windows
 * and always announced at least `telegraph` seconds before they start; entering an active
 * hazard is a soft fail. The player can hold the convoy to wait a hazard out.
 */

export type Point2 = readonly [number, number];

/** Polyline with arc-length lookup; pointAt writes into `out` (no allocation). */
export class Polyline {
  readonly length: number;
  private readonly cum: number[];

  constructor(readonly points: readonly Point2[]) {
    if (points.length < 2) throw new Error('Polyline needs 2 points');
    this.cum = [0];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1] as Point2;
      const b = points[i] as Point2;
      total += Math.hypot(b[0] - a[0], b[1] - a[1]);
      this.cum.push(total);
    }
    this.length = total;
  }

  pointAt(distance: number, out: { x: number; z: number; heading: number }): void {
    const d = Math.min(this.length, Math.max(0, distance));
    let i = 1;
    while (i < this.cum.length - 1 && (this.cum[i] as number) < d) i++;
    const a = this.points[i - 1] as Point2;
    const b = this.points[i] as Point2;
    const c0 = this.cum[i - 1] as number;
    const seg = (this.cum[i] as number) - c0;
    const t = seg > 0 ? (d - c0) / seg : 0;
    out.x = a[0] + (b[0] - a[0]) * t;
    out.z = a[1] + (b[1] - a[1]) * t;
    out.heading = Math.atan2(b[0] - a[0], b[1] - a[1]);
  }
}

export interface RouteSegment {
  readonly id: string;
  readonly points: readonly Point2[];
  /** Segment ids that may follow; empty means this segment ends at the destination. */
  readonly next: readonly string[];
  readonly labelKey?: string;
}

export interface Hazard {
  readonly id: string;
  readonly segmentId: string;
  /** Mission time window in which the segment is unsafe. */
  readonly from: number;
  readonly to: number;
  readonly labelKey: string;
}

export interface ConvoyScenario {
  readonly segments: readonly RouteSegment[];
  readonly start: string;
  /** Meters per second. */
  readonly speed: number;
  /** Vehicles and the spacing between them (meters). */
  readonly vehicles: number;
  readonly spacing: number;
  readonly hazards: readonly Hazard[];
}

export type ConvoyStatus = 'moving' | 'holding' | 'awaitingChoice' | 'arrived' | 'hazard';

export class ConvoyModel {
  time = 0;
  /** Distance of the lead vehicle along the current segment. */
  along = 0;
  segment: RouteSegment;
  holding = false;
  status: ConvoyStatus = 'moving';
  private readonly lines = new Map<string, Polyline>();
  private chosenNext: string | null = null;
  /** Segments already driven, for trailing vehicles. */
  private readonly history: string[] = [];

  constructor(
    readonly scenario: ConvoyScenario,
    private readonly telegraph: () => number,
  ) {
    for (const s of scenario.segments) this.lines.set(s.id, new Polyline(s.points));
    this.segment = this.seg(scenario.start);
    this.reset();
  }

  reset(): void {
    this.time = 0;
    this.along = 0;
    this.segment = this.seg(this.scenario.start);
    this.holding = false;
    this.status = 'moving';
    this.chosenNext = null;
    this.history.length = 0;
  }

  line(id: string): Polyline {
    const l = this.lines.get(id);
    if (!l) throw new Error('Unknown segment ' + id);
    return l;
  }

  /** Hazard that is active on a segment at time t, if any. */
  activeHazard(segmentId: string, t = this.time): Hazard | null {
    return this.scenario.hazards.find((h) => h.segmentId === segmentId && t >= h.from && t < h.to) ?? null;
  }

  /** Hazards whose warning is showing now (from - telegraph .. to). */
  warnings(out: Hazard[]): Hazard[] {
    out.length = 0;
    const tel = this.telegraph();
    for (const h of this.scenario.hazards) if (this.time >= h.from - tel && this.time < h.to) out.push(h);
    return out;
  }

  /** The player picks the next segment at a fork (allowed any time before arriving there). */
  choose(segmentId: string): boolean {
    if (!this.segment.next.includes(segmentId)) return false;
    this.chosenNext = segmentId;
    if (this.status === 'awaitingChoice') this.status = this.holding ? 'holding' : 'moving';
    return true;
  }

  setHolding(hold: boolean): void {
    this.holding = hold;
    if (this.status === 'moving' || this.status === 'holding') this.status = hold ? 'holding' : 'moving';
  }

  get pendingChoice(): readonly string[] {
    return this.segment.next.length > 1 && this.chosenNext === null ? this.segment.next : [];
  }

  update(dt: number): ConvoyStatus {
    if (this.status === 'arrived' || this.status === 'hazard') return this.status;
    this.time += dt;
    if (this.status === 'awaitingChoice' || this.holding) return this.status;
    const line = this.line(this.segment.id);
    this.along += this.scenario.speed * dt;
    if (this.activeHazard(this.segment.id)) {
      this.status = 'hazard';
      return this.status;
    }
    if (this.along >= line.length) {
      const next = this.segment.next.length === 1 ? (this.segment.next[0] as string) : this.chosenNext;
      if (this.segment.next.length === 0) {
        this.along = line.length;
        this.status = 'arrived';
        return this.status;
      }
      if (next === null) {
        this.along = line.length;
        this.status = 'awaitingChoice';
        return this.status;
      }
      this.history.push(this.segment.id);
      this.along -= line.length;
      this.segment = this.seg(next);
      this.chosenNext = null;
      if (this.activeHazard(this.segment.id)) this.status = 'hazard';
    }
    return this.status;
  }

  /** World position of vehicle i (0 = lead), following the driven route. */
  vehicleAt(i: number, out: { x: number; z: number; heading: number }): void {
    let d = this.along - i * this.scenario.spacing;
    let segId = this.segment.id;
    let h = this.history.length - 1;
    while (d < 0 && h >= 0) {
      segId = this.history[h] as string;
      d += this.line(segId).length;
      h--;
    }
    this.line(segId).pointAt(d, out);
  }

  private seg(id: string): RouteSegment {
    const s = this.scenario.segments.find((x) => x.id === id);
    if (!s) throw new Error('Unknown segment ' + id);
    return s;
  }
}
