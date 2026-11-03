import { LogisticsModel, type LogisticsScenario } from '../../../gameplay/modules/logistics';

/**
 * The morning plan at the merchants' office: which way the carts go, how many, in how many
 * daylight hours. Water is part of every route (a well on the road, or none in the dunes), shown
 * as the route risk that the planner prints before the player commits. All numbers are game
 * balance, not historical claims.
 *
 * Supplies are units of weight (the well parts are the heavy part of the day), vehicles are carts
 * and a pack donkey, hours are the daylight hours left for one round of trips.
 */

const k = (s: string): string => 'levels.ch00.jaffa.plan.' + s;

export const ROUTE_MAIN = 'main-road';
export const ROUTE_DUNES = 'dunes';
export const ROUTE_PACK = 'pack';

export const PLAN_SCENARIO: LogisticsScenario = {
  available: { supplies: 20, people: 0, vehicles: 3, hours: 5 },
  routes: [
    { id: ROUTE_MAIN, labelKey: k('route.main'), hoursPerTrip: 4, supplyPerTrip: 8, peoplePerTrip: 0, maxVehicles: 2, riskKey: k('risk.main') },
    { id: ROUTE_DUNES, labelKey: k('route.dunes'), hoursPerTrip: 3, supplyPerTrip: 5, peoplePerTrip: 0, riskKey: k('risk.dunes') },
    { id: ROUTE_PACK, labelKey: k('route.pack'), hoursPerTrip: 2.5, supplyPerTrip: 3, peoplePerTrip: 0, maxVehicles: 1, riskKey: k('risk.pack') },
  ],
  goal: { supplies: 12, people: 0 },
};

/** A fresh model for the planner; resourceScale comes from the difficulty parameters. */
export function createPlan(resourceScale: number): LogisticsModel {
  return new LogisticsModel(PLAN_SCENARIO, resourceScale);
}
