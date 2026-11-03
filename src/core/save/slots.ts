import { decodeEnvelope, encodeEnvelope, type DecodedEnvelope } from './envelope';
import type { AsyncStore, SyncStore } from './stores';

export type BufferId = 'A' | 'B';
export const SLOT_PREFIX = 'netivim:';

export function slotKey(slot: string, buffer: BufferId): string {
  return SLOT_PREFIX + slot + ':' + buffer;
}

export interface SlotRead {
  readonly env: DecodedEnvelope;
  readonly buffer: BufferId;
}

/** Accepts a decoded payload only if it passes the schema check for this slot. */
export type PayloadCheck = (payload: unknown) => boolean;

function best(a: DecodedEnvelope | null, b: DecodedEnvelope | null, ok: PayloadCheck): SlotRead | null {
  const va = a && ok(a.payload) ? a : null;
  const vb = b && ok(b.payload) ? b : null;
  if (va && (!vb || va.seq >= vb.seq)) return { env: va, buffer: 'A' };
  if (vb) return { env: vb, buffer: 'B' };
  return null;
}

/** Reads both buffers and returns the valid one with the highest sequence number. */
export function readSlot(store: Pick<SyncStore, 'getItem'>, slot: string, ok: PayloadCheck): SlotRead | null {
  const get = (b: BufferId): DecodedEnvelope | null => {
    try {
      return decodeEnvelope(store.getItem(slotKey(slot, b)));
    } catch {
      return null;
    }
  };
  return best(get('A'), get('B'), ok);
}

export async function readSlotAsync(store: AsyncStore, slot: string, ok: PayloadCheck): Promise<SlotRead | null> {
  const get = async (b: BufferId): Promise<DecodedEnvelope | null> => {
    try {
      return decodeEnvelope(await store.get(slotKey(slot, b)));
    } catch {
      return null;
    }
  };
  const [a, b] = await Promise.all([get('A'), get('B')]);
  return best(a, b, ok);
}

export interface SlotWrite {
  readonly buffer: BufferId;
  readonly seq: number;
  readonly raw: string;
}

/**
 * Atomic double-buffered write: the new envelope goes into the buffer that does NOT hold the
 * current good save, so a kill mid-write can only damage the older copy.
 * Throws on storage errors (quota, blocked) and on oversized saves; callers report them.
 */
export function writeSlot(store: SyncStore, slot: string, payload: unknown, now: number, ok: PayloadCheck, minSeq = 0): SlotWrite {
  const current = readSlot(store, slot, ok);
  const buffer: BufferId = current ? (current.buffer === 'A' ? 'B' : 'A') : 'A';
  const seq = Math.max(current ? current.env.seq : 0, minSeq) + 1;
  const raw = encodeEnvelope(payload, seq, now);
  store.setItem(slotKey(slot, buffer), raw);
  return { buffer, seq, raw };
}
