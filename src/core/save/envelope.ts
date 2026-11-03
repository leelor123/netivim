import { fnv1a32 } from './checksum';

/** Hard limit for one stored envelope (BRIEF 8.G: size-limited saves). */
export const MAX_ENVELOPE_CHARS = 512 * 1024;

export interface Envelope {
  /** Envelope format version (not the save schema version). */
  readonly v: 1;
  /** Monotonic sequence number per slot; the highest valid one wins. */
  readonly seq: number;
  /** Save time, ms since epoch. */
  readonly t: number;
  /** Checksum of data. */
  readonly sum: string;
  /** JSON text of the payload. */
  readonly data: string;
}

export interface DecodedEnvelope {
  readonly seq: number;
  readonly t: number;
  readonly payload: unknown;
  readonly raw: string;
}

export class SaveTooLargeError extends Error {
  constructor(size: number) {
    super('Save is too large: ' + String(size) + ' chars');
    this.name = 'SaveTooLargeError';
  }
}

export function encodeEnvelope(payload: unknown, seq: number, t: number): string {
  const data = JSON.stringify(payload);
  const env: Envelope = { v: 1, seq, t, sum: fnv1a32(data), data };
  const raw = JSON.stringify(env);
  if (raw.length > MAX_ENVELOPE_CHARS) throw new SaveTooLargeError(raw.length);
  return raw;
}

/** Returns null for anything missing, truncated, oversized or failing its checksum. Never throws. */
export function decodeEnvelope(raw: string | null): DecodedEnvelope | null {
  if (raw === null || raw.length === 0 || raw.length > MAX_ENVELOPE_CHARS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const e = parsed as Partial<Envelope>;
  if (e.v !== 1 || typeof e.seq !== 'number' || !Number.isFinite(e.seq) || typeof e.t !== 'number') return null;
  if (typeof e.sum !== 'string' || typeof e.data !== 'string') return null;
  if (fnv1a32(e.data) !== e.sum) return null;
  try {
    return { seq: e.seq, t: e.t, payload: JSON.parse(e.data) as unknown, raw };
  } catch {
    return null;
  }
}
