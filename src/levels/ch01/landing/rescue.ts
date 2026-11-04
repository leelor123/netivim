/**
 * Rescue logic for the beach phase of Night Landing: survivors (FICTIONAL COMPOSITES) land in
 * groups, follow the player at their own pace (elders are slowest), and a lost child is found by
 * voice. Pure and allocation-free per step; nobody is ever harmed, a slow group only costs time.
 */

export type SurvivorKind = 'child' | 'elder' | 'adult';
/**
 * ship: still on the ship (a later trip); boat: aboard the small boat; ashore: walking to the landing
 * spot; waiting: at the spot; following: with the player; led: walking to the shelter with the
 * volunteers; safe: sheltered; lost: hiding, not yet found.
 */
export type SurvivorState = 'ship' | 'boat' | 'ashore' | 'waiting' | 'following' | 'led' | 'safe' | 'lost';
const STATES: readonly string[] = ['ship', 'boat', 'ashore', 'waiting', 'following', 'led', 'safe', 'lost'];

export interface Survivor {
  readonly kind: SurvivorKind;
  /** Landing wave (0 children, 1 elders, 2 adults); -1 for the lost child. */
  readonly group: number;
  x: number;
  z: number;
  heading: number;
  /** 0-1 walk amount for the figure rig. */
  walk: number;
  state: SurvivorState;
  /** Where the survivor goes after landing (or hides, for the lost child). */
  homeX: number;
  homeZ: number;
  /** Which boat load carries the survivor (0 first, 1 second). */
  readonly trip: number;
  /** Where the volunteers shelter the survivor once handed off. */
  readonly shelterX: number;
  readonly shelterZ: number;
}

export const SURVIVOR_SPEED: Readonly<Record<SurvivorKind, number>> = { child: 3.1, elder: 2.2, adult: 3.7 };
export const SURVIVOR_SCALE: Readonly<Record<SurvivorKind, number>> = { child: 0.62, elder: 0.95, adult: 1 };

export interface RescueSpec {
  readonly groups: readonly { readonly kind: SurvivorKind; readonly count: number; readonly trip: number }[];
  readonly shelter: { readonly x: number; readonly z: number };
  /** Waterline spot where landed survivors gather. */
  readonly landingX: number;
  readonly landingZ: number;
  readonly lostChild: { readonly x: number; readonly z: number };
}

/** Serializable survivors for an exact manual save. */
export interface RescueSnapshot {
  readonly landed: number;
  readonly survivors: readonly { readonly state: SurvivorState; readonly x: number; readonly z: number }[];
}

export class RescueModel {
  readonly survivors: Survivor[] = [];
  /** Waves already ashore (0-3). */
  landed = 0;
  readonly waveCount: number;
  private readonly groupTrips: readonly number[];

  constructor(spec: RescueSpec) {
    this.waveCount = spec.groups.length;
    this.groupTrips = spec.groups.map((g) => g.trip);
    let n = 0;
    spec.groups.forEach((g, gi) => {
      for (let i = 0; i < g.count; i++) {
        const col = n % 4;
        const row = Math.floor(n / 4);
        this.survivors.push({ kind: g.kind, group: gi, x: 0, z: 0, heading: 0, walk: 0, state: 'boat', homeX: spec.landingX - 0.8 * row, homeZ: spec.landingZ - 1.6 + col * 1.1, trip: g.trip, shelterX: spec.shelter.x + (n % 3) * 1.1, shelterZ: spec.shelter.z + Math.floor(n / 3) * 1.2 });
        n++;
      }
    });
    this.survivors.push({ kind: 'child', group: -1, x: spec.lostChild.x, z: spec.lostChild.z, heading: 0, walk: 0, state: 'lost', homeX: spec.lostChild.x, homeZ: spec.lostChild.z, trip: 1, shelterX: spec.shelter.x, shelterZ: spec.shelter.z });
  }

  snapshot(): RescueSnapshot {
    return { landed: this.landed, survivors: this.survivors.map((s) => ({ state: s.state, x: s.x, z: s.z })) };
  }

  /** Restores a snapshot; ignored when it does not match this group (older save). */
  restore(snap: RescueSnapshot): boolean {
    if (snap.survivors.length !== this.survivors.length || !snap.survivors.every((v) => STATES.includes(v.state))) return false;
    this.landed = Math.max(0, Math.min(this.waveCount, snap.landed));
    snap.survivors.forEach((v, i) => {
      const s = this.survivors[i] as Survivor;
      s.state = v.state;
      s.x = v.x;
      s.z = v.z;
      s.walk = 0;
    });
    return true;
  }

  /** Everyone back aboard, the lost child hiding again (checkpoint start). */
  reset(boatX: number, boatZ: number, trip = 0): void {
    this.landed = this.wavesBefore(trip);
    for (let i = 0; i < this.survivors.length; i++) {
      const s = this.survivors[i] as Survivor;
      s.walk = 0;
      if (s.group < 0) {
        s.state = 'lost';
        s.x = s.homeX;
        s.z = s.homeZ;
        continue;
      }
      if (s.trip < trip) {
        s.state = 'safe';
        s.x = s.shelterX;
        s.z = s.shelterZ;
        continue;
      }
      if (s.trip > trip) {
        s.state = 'ship';
        s.x = boatX;
        s.z = boatZ;
        continue;
      }
      s.state = 'boat';
      // Two rows along the launch (its length runs along x when beached).
      s.x = boatX - 2.2 + (i % 6) * 0.9;
      s.z = boatZ - 0.5 + Math.floor(i / 6);
    }
  }

  /** Waves that belong to earlier trips than `trip`. */
  wavesBefore(trip: number): number {
    return this.groupTrips.filter((t) => t < trip).length;
  }

  /** True once every wave of `trip` (and earlier ones) has gone ashore. */
  tripLanded(trip: number): boolean {
    return this.landed >= this.groupTrips.filter((t) => t <= trip).length;
  }

  /** The trip's survivors wait on the sand; earlier trips are sheltered, later ones still on the ship. */
  setTripWaiting(trip: number): void {
    this.landed = this.groupTrips.filter((t) => t <= trip).length;
    for (const s of this.survivors) {
      if (s.group < 0) continue;
      s.walk = 0;
      if (s.trip < trip) {
        s.state = 'safe';
        s.x = s.shelterX;
        s.z = s.shelterZ;
      } else if (s.trip === trip) {
        s.state = 'waiting';
        s.x = s.homeX;
        s.z = s.homeZ;
      } else s.state = 'ship';
    }
  }

  /** The trip's survivors (and the found child) follow the player; earlier trips are sheltered. */
  setTripFollowing(trip: number, x: number, z: number): void {
    this.landed = this.groupTrips.filter((t) => t <= trip).length;
    let k = 0;
    for (const s of this.survivors) {
      s.walk = 0;
      if (s.group >= 0 && s.trip < trip) {
        s.state = 'safe';
        s.x = s.shelterX;
        s.z = s.shelterZ;
        continue;
      }
      s.state = 'following';
      s.x = x - 1 - (k % 4) * 0.8;
      s.z = z - 1 + Math.floor(k / 4) * 0.9;
      k++;
    }
  }

  /** The volunteers take everyone who follows to the shelter. */
  handOff(): void {
    for (const s of this.survivors) if (s.state === 'following') s.state = 'led';
  }

  /** The trip's survivors wait on the ship (the boat is empty). */
  stowTrip(trip: number): void {
    for (const s of this.survivors) if (s.state === 'boat' && s.trip === trip) s.state = 'ship';
  }

  /** The trip's survivors step from the ship into the small boat. */
  boardTrip(trip: number): void {
    for (const s of this.survivors) if (s.state === 'ship' && s.trip === trip) s.state = 'boat';
  }

  /** Puts everyone at the landing spot (checkpoint 'shore'). */
  setAllWaiting(): void {
    this.landed = this.waveCount;
    for (const s of this.survivors) {
      if (s.group < 0) continue;
      s.state = 'waiting';
      s.x = s.homeX;
      s.z = s.homeZ;
      s.walk = 0;
    }
  }

  /** Everyone with the player, wherever (checkpoint 'hide'). */
  setAllFollowing(x: number, z: number): void {
    this.landed = this.waveCount;
    for (let i = 0; i < this.survivors.length; i++) {
      const s = this.survivors[i] as Survivor;
      s.state = 'following';
      s.x = x - 1 - (i % 4) * 0.8;
      s.z = z - 1 + Math.floor(i / 4) * 0.9;
      s.walk = 0;
    }
  }

  /** Lands the next wave (children, then elders, then adults). Returns the wave index or -1. */
  landNext(): number {
    if (this.landed >= this.waveCount) return -1;
    const wave = this.landed;
    this.landed++;
    for (const s of this.survivors) if (s.group === wave) s.state = 'ashore';
    return wave;
  }

  get allLanded(): boolean {
    return this.landed >= this.waveCount;
  }

  /** True while an arriving wave is still walking to the landing spot. */
  get arriving(): boolean {
    for (let i = 0; i < this.survivors.length; i++) if ((this.survivors[i] as Survivor).state === 'ashore') return true;
    return false;
  }

  /** The whole landed group starts following the player. */
  beginEscort(): void {
    for (const s of this.survivors) if (s.state === 'waiting' || s.state === 'ashore') s.state = 'following';
  }

  get childFound(): boolean {
    for (let i = 0; i < this.survivors.length; i++) if ((this.survivors[i] as Survivor).state === 'lost') return false;
    return true;
  }

  /** The lost child answers and joins the others. */
  findChild(): boolean {
    for (let i = 0; i < this.survivors.length; i++) {
      const s = this.survivors[i] as Survivor;
      if (s.state === 'lost') {
        s.state = 'following';
        return true;
      }
    }
    return false;
  }

  get lostChild(): Survivor | null {
    for (let i = 0; i < this.survivors.length; i++) if ((this.survivors[i] as Survivor).state === 'lost') return this.survivors[i] as Survivor;
    return null;
  }

  /** One fixed step: walkers move at their own pace toward their goal. */
  update(dt: number, leaderX: number, leaderZ: number, leaderHeading: number): void {
    const bx = -Math.sin(leaderHeading);
    const bz = -Math.cos(leaderHeading);
    // Right of the leader: (-cos, sin).
    const rx = -Math.cos(leaderHeading);
    const rz = Math.sin(leaderHeading);
    let slot = 0;
    for (let i = 0; i < this.survivors.length; i++) {
      const s = this.survivors[i] as Survivor;
      let tx = s.x;
      let tz = s.z;
      let moving = false;
      if (s.state === 'ashore') {
        tx = s.homeX;
        tz = s.homeZ;
        moving = true;
      } else if (s.state === 'led') {
        tx = s.shelterX;
        tz = s.shelterZ;
        moving = true;
      } else if (s.state === 'following') {
        const back = 1.5 + 0.6 * Math.floor(slot / 2);
        const side = slot % 2 === 0 ? 0.8 : -0.8;
        tx = leaderX + bx * back + rx * side;
        tz = leaderZ + bz * back + rz * side;
        moving = true;
        slot++;
      }
      if (!moving) {
        s.walk = 0;
        continue;
      }
      const dx = tx - s.x;
      const dz = tz - s.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        s.walk = Math.max(0, s.walk - dt * 4);
        if (s.state === 'ashore') s.state = 'waiting';
        else if (s.state === 'led') s.state = 'safe';
        continue;
      }
      const step = Math.min(d, SURVIVOR_SPEED[s.kind] * dt);
      s.x += (dx / d) * step;
      s.z += (dz / d) * step;
      s.heading = Math.atan2(dx, dz);
      s.walk = Math.min(1, step / (SURVIVOR_SPEED[s.kind] * dt || 1));
    }
  }

  /** Farthest follower from the leader (the group's tail), or null. */
  tail(leaderX: number, leaderZ: number): Survivor | null {
    let best: Survivor | null = null;
    let bestD = -1;
    for (let i = 0; i < this.survivors.length; i++) {
      const s = this.survivors[i] as Survivor;
      if (s.state !== 'following') continue;
      const d = (s.x - leaderX) ** 2 + (s.z - leaderZ) ** 2;
      if (d > bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /** Largest distance of any follower from the leader (0 when nobody follows). */
  cohesion(leaderX: number, leaderZ: number): number {
    let m = 0;
    for (let i = 0; i < this.survivors.length; i++) {
      const s = this.survivors[i] as Survivor;
      if (s.state !== 'following') continue;
      const d = Math.hypot(s.x - leaderX, s.z - leaderZ);
      if (d > m) m = d;
    }
    return m;
  }

  /** Followers close enough to the leader to count as "with you". */
  withYou(leaderX: number, leaderZ: number, radius: number): number {
    let n = 0;
    for (let i = 0; i < this.survivors.length; i++) {
      const s = this.survivors[i] as Survivor;
      if (s.state === 'following' && Math.hypot(s.x - leaderX, s.z - leaderZ) <= radius) n++;
    }
    return n;
  }

  get followers(): number {
    let n = 0;
    for (let i = 0; i < this.survivors.length; i++) if ((this.survivors[i] as Survivor).state === 'following') n++;
    return n;
  }

  /** True when every survivor is following and near the leader (nobody left behind, child found). */
  everyoneWithYou(leaderX: number, leaderZ: number, radius: number, ignoreLost = false): boolean {
    let n = 0;
    for (let i = 0; i < this.survivors.length; i++) {
      const s = this.survivors[i] as Survivor;
      if (s.state === 'safe' || s.state === 'led' || s.state === 'ship') continue;
      if (s.state === 'lost' && ignoreLost) continue;
      if (s.state !== 'following' || Math.hypot(s.x - leaderX, s.z - leaderZ) > radius) return false;
      n++;
    }
    return n > 0;
  }

  /** Followers inside the hollow become safe. Returns how many are safe in total. */
  settle(x: number, z: number, radius: number): number {
    let safe = 0;
    for (let i = 0; i < this.survivors.length; i++) {
      const s = this.survivors[i] as Survivor;
      if (s.state === 'following' && Math.hypot(s.x - x, s.z - z) <= radius) s.state = 'safe';
      if (s.state === 'safe') safe++;
    }
    return safe;
  }

  get total(): number {
    return this.survivors.length;
  }

  get safeCount(): number {
    let n = 0;
    for (let i = 0; i < this.survivors.length; i++) if ((this.survivors[i] as Survivor).state === 'safe') n++;
    return n;
  }
}

/** Direction of a sound relative to the listener's view: ahead, behind, left or right. */
export type VoiceSide = 'ahead' | 'behind' | 'left' | 'right';

export function voiceSide(listenerX: number, listenerZ: number, viewYaw: number, sourceX: number, sourceZ: number): VoiceSide {
  const dx = sourceX - listenerX;
  const dz = sourceZ - listenerZ;
  const fwd = dx * Math.sin(viewYaw) + dz * Math.cos(viewYaw);
  const right = dx * -Math.cos(viewYaw) + dz * Math.sin(viewYaw);
  if (Math.abs(right) > Math.abs(fwd)) return right > 0 ? 'right' : 'left';
  return fwd >= 0 ? 'ahead' : 'behind';
}
