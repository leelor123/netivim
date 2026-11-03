import type * as THREE from 'three';
import { Rng } from '../rng';
import { kitBuilder, type KitOptions } from './buildings';

/** Fence segment along x: wooden posts and rails, barbed-wire stakes, or a dry-stone wall. */
export function fence(o: KitOptions & { kind?: 'wood' | 'wire' | 'stone'; length?: number } = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'fence');
  const b = kitBuilder(o, 0.15);
  const len = o.length ?? 6;
  const kind = o.kind ?? 'wood';
  if (kind === 'stone') {
    const stones = Math.round(len * 2.2);
    for (let i = 0; i < stones; i++) {
      const x = -len / 2 + (i + 0.5) * (len / stones);
      b.blob(0.32, r.pick(['#b5ab97', '#a69c88', '#c2b8a2']), x, 0.25, 0, 1.2, 0.8, 1);
      if (r.chance(0.7)) b.blob(0.26, '#b0a690', x + 0.2, 0.62, 0, 1.2, 0.7, 1);
    }
    return b.build();
  }
  const posts = Math.max(2, Math.round(len / 2) + 1);
  for (let i = 0; i < posts; i++) {
    const x = -len / 2 + (i * len) / (posts - 1);
    b.cyl(0.05, 0.06, 1.3, 5, '#6b5038', x, 0.65, 0, 0, 0, r.range(-0.05, 0.05));
  }
  const rail = kind === 'wood' ? '#7f6244' : '#55534f';
  const thick = kind === 'wood' ? 0.07 : 0.015;
  for (const y of kind === 'wood' ? [0.5, 1.05] : [0.35, 0.7, 1.05]) b.box(len, thick, thick, rail, 0, y, 0);
  return b.build();
}

/** Wooden crate. */
export function crate(o: KitOptions & { size?: number } = {}): THREE.BufferGeometry {
  const b = kitBuilder(o, 0.12);
  const s = o.size ?? 0.8;
  b.block(s, s, s, '#9a7b52', 0, 0, 0);
  for (const y of [0.05, s - 0.05]) {
    b.box(s + 0.02, 0.08, 0.08, '#7a5c3a', 0, y, s / 2);
    b.box(s + 0.02, 0.08, 0.08, '#7a5c3a', 0, y, -s / 2);
  }
  b.box(0.06, s * 1.2, s + 0.02, '#7a5c3a', s / 2, s / 2, 0, 0, 0, 0.8);
  return b.build();
}

/** Burlap sack (flour, grain). */
export function sack(o: KitOptions = {}): THREE.BufferGeometry {
  const b = kitBuilder(o, 0.12);
  b.blob(0.35, '#c9b48d', 0, 0.3, 0, 1, 0.9, 0.75);
  b.cone(0.16, 0.2, 5, '#b9a47c', 0, 0.68, 0);
  return b.build();
}

/** Steel or wooden barrel. */
export function barrel(o: KitOptions & { kind?: 'steel' | 'wood' } = {}): THREE.BufferGeometry {
  const b = kitBuilder(o, 0.1);
  const steel = (o.kind ?? 'steel') === 'steel';
  const body = steel ? new Rng(o.seed ?? 'barrel').pick(['#5d6a55', '#7a4a32', '#4f5d6b']) : '#8a6a46';
  b.cyl(0.3, 0.3, 0.9, 10, body, 0, 0.45, 0);
  for (const y of [0.2, 0.7]) b.cyl(0.31, 0.31, 0.05, 10, steel ? '#3f3d3a' : '#4a4038', 0, y, 0);
  return b.build();
}

/** Terrace retaining wall segment (dry stone), along x. */
export function terraceWall(o: KitOptions & { length?: number; height?: number } = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'terrace');
  const b = kitBuilder(o, 0.2);
  const len = o.length ?? 8;
  const h = o.height ?? 1;
  const rows = Math.max(1, Math.round(h / 0.35));
  for (let row = 0; row < rows; row++) {
    const n = Math.round(len / 0.6);
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + (i + (row % 2) * 0.5 + 0.5) * (len / n);
      if (x > len / 2) continue;
      b.box(r.range(0.5, 0.65), 0.33, 0.45, r.pick(['#c8bca2', '#b9ad93', '#d2c6ad']), x, row * 0.34 + 0.17, 0, r.range(-0.1, 0.1));
    }
  }
  return b.build();
}
