/**
 * Logistics model (LOG/PLN missions, BRIEF mandatory system 7): supplies, people, vehicles and
 * time. The player assigns vehicles to routes; the plan is evaluated deterministically.
 */

export interface Resources {
  readonly supplies: number;
  readonly people: number;
  readonly vehicles: number;
  /** Hours available. */
  readonly hours: number;
}

export interface LogisticsRoute {
  readonly id: string;
  readonly labelKey: string;
  /** Hours for one round trip. */
  readonly hoursPerTrip: number;
  /** Supply units one vehicle carries per trip. */
  readonly supplyPerTrip: number;
  /** People one vehicle carries per trip. */
  readonly peoplePerTrip: number;
  /** Optional cap on vehicles (a narrow road). */
  readonly maxVehicles?: number;
  /** Locale key describing a known danger on this route (telegraphed in the planner). */
  readonly riskKey?: string;
}

export interface LogisticsGoal {
  readonly supplies: number;
  readonly people: number;
}

export interface LogisticsScenario {
  readonly available: Resources;
  readonly routes: readonly LogisticsRoute[];
  readonly goal: LogisticsGoal;
}

export interface PlanResult {
  readonly vehiclesUsed: number;
  readonly suppliesDelivered: number;
  readonly peopleMoved: number;
  readonly meetsGoal: boolean;
  /** Problems as locale keys (empty when the plan is valid). */
  readonly problems: readonly string[];
}

/** Difficulty resourceScale applies to supplies and vehicles (never below 1 vehicle). */
export function scaleResources(r: Resources, resourceScale: number): Resources {
  return {
    supplies: Math.round(r.supplies * resourceScale),
    people: r.people,
    vehicles: Math.max(1, Math.round(r.vehicles * resourceScale)),
    hours: r.hours,
  };
}

export class LogisticsModel {
  private readonly assigned = new Map<string, number>();
  available: Resources;

  constructor(
    readonly scenario: LogisticsScenario,
    resourceScale = 1,
  ) {
    this.available = scaleResources(scenario.available, resourceScale);
  }

  vehiclesOn(routeId: string): number {
    return this.assigned.get(routeId) ?? 0;
  }

  get vehiclesFree(): number {
    let used = 0;
    for (const v of this.assigned.values()) used += v;
    return this.available.vehicles - used;
  }

  /** Adds or removes one vehicle on a route; returns false when not possible. */
  assign(routeId: string, delta: 1 | -1): boolean {
    const route = this.scenario.routes.find((r) => r.id === routeId);
    if (!route) return false;
    const cur = this.vehiclesOn(routeId);
    const next = cur + delta;
    if (next < 0) return false;
    if (delta > 0 && (this.vehiclesFree <= 0 || (route.maxVehicles !== undefined && next > route.maxVehicles))) return false;
    this.assigned.set(routeId, next);
    return true;
  }

  reset(): void {
    this.assigned.clear();
  }

  evaluate(): PlanResult {
    const problems: string[] = [];
    let vehiclesUsed = 0;
    let supplies = 0;
    let people = 0;
    for (const r of this.scenario.routes) {
      const v = this.vehiclesOn(r.id);
      if (v === 0) continue;
      vehiclesUsed += v;
      const trips = Math.floor(this.available.hours / r.hoursPerTrip + 1e-9);
      if (trips === 0) problems.push('gameplay.logistics.problem.tooSlow');
      supplies += v * trips * r.supplyPerTrip;
      people += v * trips * r.peoplePerTrip;
    }
    supplies = Math.min(supplies, this.available.supplies);
    people = Math.min(people, this.available.people);
    if (vehiclesUsed > this.available.vehicles) problems.push('gameplay.logistics.problem.vehicles');
    const goal = this.scenario.goal;
    const meetsGoal = problems.length === 0 && supplies >= goal.supplies && people >= goal.people;
    return { vehiclesUsed, suppliesDelivered: supplies, peopleMoved: people, meetsGoal, problems };
  }

  /** A plan that meets the goal if one exists (greedy over routes; used by the QA bot and hints). */
  solveGreedy(): boolean {
    this.reset();
    const order = [...this.scenario.routes].sort((a, b) => b.supplyPerTrip + b.peoplePerTrip - (a.supplyPerTrip + a.peoplePerTrip) || a.hoursPerTrip - b.hoursPerTrip);
    let progress = true;
    while (!this.evaluate().meetsGoal && progress) {
      progress = false;
      for (const r of order) {
        if (this.assign(r.id, 1)) {
          progress = true;
          if (this.evaluate().meetsGoal) return true;
        }
      }
    }
    return this.evaluate().meetsGoal;
  }
}
