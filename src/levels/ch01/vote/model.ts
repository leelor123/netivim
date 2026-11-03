import { CARD_SLOT_OF_PARTY, MAP_LAYERS, PARTIES, PLACES, type Party, type PlaceId, type VoteState } from './data';

/** Pure progress model of "The Vote": no rendering, so unit tests and the level share it. */

export type DeliverResult = 'none' | 'ok' | 'retry' | 'fail';
export type SubmitResult = 'ok' | 'warn' | 'fail';

export interface VoteSnapshot {
  layers: boolean[];
  carried: number | null;
  delivered: boolean[];
  wrong: number[];
  asked: Record<PlaceId, boolean[]>;
  advised: Record<PlaceId, boolean>;
  listened: boolean;
  jerusalem: boolean;
  warned: boolean;
  tallyArmed: boolean;
}

export const partyOfSlot = (slot: number): Party => PARTIES[PARTIES.findIndex((_, i) => CARD_SLOT_OF_PARTY[i] === slot)] as Party;

export class VoteModel {
  layers: boolean[] = MAP_LAYERS.map(() => false);
  /** Card slot being carried. */
  carried: number | null = null;
  delivered: boolean[] = PARTIES.map(() => false);
  wrong: number[] = PARTIES.map(() => 0);
  asked: Record<PlaceId, boolean[]> = { yishuv: [false, false, false], palestinians: [false, false, false], britain: [false, false, false] };
  advised: Record<PlaceId, boolean> = { yishuv: false, palestinians: false, britain: false };
  listened = false;
  jerusalem = false;
  warned = false;
  tallyArmed = false;

  /** Sets exactly the progress that is implied by arriving at a checkpoint. */
  resetTo(state: VoteState): void {
    const order: VoteState[] = ['map', 'statements', 'visits', 'note', 'vote'];
    const at = order.indexOf(state);
    this.layers = MAP_LAYERS.map(() => at > 0);
    this.carried = null;
    this.delivered = PARTIES.map(() => at > 1);
    this.wrong = PARTIES.map(() => 0);
    this.asked = { yishuv: [false, false, false], palestinians: [false, false, false], britain: [false, false, false] };
    this.advised = { yishuv: false, palestinians: false, britain: false };
    if (at > 2) {
      for (const p of PLACES) {
        this.asked[p] = [true, false, false];
        this.advised[p] = true;
      }
    }
    this.listened = at > 2;
    this.jerusalem = false;
    this.warned = false;
    this.tallyArmed = false;
  }

  get layersSeen(): number {
    return this.layers.filter(Boolean).length;
  }

  get deliveredCount(): number {
    return this.delivered.filter(Boolean).length;
  }

  placesWithQuestion(): number {
    return PLACES.filter((p) => this.asked[p].some(Boolean)).length;
  }

  placesDone(): number {
    return PLACES.filter((p) => this.advised[p]).length;
  }

  seeLayer(i: number): void {
    this.layers[i] = true;
  }

  pickCard(slot: number): boolean {
    if (this.carried !== null) return false;
    if (this.delivered[PARTIES.indexOf(partyOfSlot(slot))]) return false;
    this.carried = slot;
    return true;
  }

  /** The player puts the carried card into a party's folder. */
  deliver(party: Party): DeliverResult {
    if (this.carried === null) return 'none';
    const owner = partyOfSlot(this.carried);
    const oi = PARTIES.indexOf(owner);
    if (owner === party) {
      this.delivered[oi] = true;
      this.carried = null;
      return 'ok';
    }
    this.wrong[oi] = (this.wrong[oi] ?? 0) + 1;
    return (this.wrong[oi] ?? 0) >= 2 ? 'fail' : 'retry';
  }

  ask(place: PlaceId, n: number): boolean {
    const first = !this.asked[place].some(Boolean);
    this.asked[place][n] = true;
    return first;
  }

  canAdvise(place: PlaceId): boolean {
    return this.asked[place].some(Boolean) && !this.advised[place];
  }

  /** Submits the note: Jerusalem must be in it; the first omission only warns. */
  submit(): SubmitResult {
    if (this.jerusalem) return 'ok';
    if (!this.warned) {
      this.warned = true;
      return 'warn';
    }
    return 'fail';
  }

  snapshot(): VoteSnapshot {
    return {
      layers: [...this.layers],
      carried: this.carried,
      delivered: [...this.delivered],
      wrong: [...this.wrong],
      asked: { yishuv: [...this.asked.yishuv], palestinians: [...this.asked.palestinians], britain: [...this.asked.britain] },
      advised: { ...this.advised },
      listened: this.listened,
      jerusalem: this.jerusalem,
      warned: this.warned,
      tallyArmed: this.tallyArmed,
    };
  }

  restore(s: Partial<VoteSnapshot>): void {
    if (s.layers) this.layers = [...s.layers];
    if (s.carried !== undefined) this.carried = s.carried;
    if (s.delivered) this.delivered = [...s.delivered];
    if (s.wrong) this.wrong = [...s.wrong];
    if (s.asked) this.asked = { yishuv: [...s.asked.yishuv], palestinians: [...s.asked.palestinians], britain: [...s.asked.britain] };
    if (s.advised) this.advised = { ...s.advised };
    if (s.listened !== undefined) this.listened = s.listened;
    if (s.jerusalem !== undefined) this.jerusalem = s.jerusalem;
    if (s.warned !== undefined) this.warned = s.warned;
    if (s.tallyArmed !== undefined) this.tallyArmed = s.tallyArmed;
  }
}
