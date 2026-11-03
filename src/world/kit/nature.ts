import * as THREE from 'three';
import { Rng } from '../rng';
import { kitBuilder, type KitOptions } from './buildings';

const BARK = '#5e4a38';

/** Olive: short twisted trunk, wide silvery-green crown in a few clumps. */
export function oliveTree(o: KitOptions = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'olive');
  const b = kitBuilder(o, 0.18);
  b.cyl(0.18, 0.32, 1.6, 5, BARK, 0, 0.8, 0, 0.12, 0, -0.1);
  b.cyl(0.1, 0.16, 1.1, 5, BARK, 0.25, 1.8, 0.1, 0, 0, -0.5);
  const leaf = '#7f8c5c';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r.range(0, 0.6);
    b.blob(r.range(0.8, 1.1), i % 2 ? leaf : '#93a06e', Math.cos(a) * 0.8, 2.4 + r.range(-0.2, 0.4), Math.sin(a) * 0.8, 1.2, 0.65, 1.2);
  }
  b.blob(1.0, '#8a9766', 0, 2.9, 0, 1.3, 0.6, 1.3);
  return b.build();
}

/** Citrus (orange grove): dense round dark-green crown with a few fruit dots. */
export function citrusTree(o: KitOptions = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'citrus');
  const b = kitBuilder(o, 0.15);
  b.cyl(0.1, 0.14, 0.9, 5, BARK, 0, 0.45, 0);
  b.blob(1.25, '#3f6b33', 0, 1.9, 0, 1, 0.9, 1, 1);
  for (let i = 0; i < 6; i++) {
    const a = r.range(0, Math.PI * 2);
    const y = r.range(1.4, 2.5);
    b.blob(0.12, '#e8892a', Math.cos(a) * 1.05, y, Math.sin(a) * 1.05);
  }
  return b.build();
}

/** Mediterranean cypress: tall narrow flame shape. */
export function cypressTree(o: KitOptions = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'cypress');
  const b = kitBuilder(o, 0.15);
  const h = r.range(7, 10);
  b.cyl(0.12, 0.16, 1.0, 5, BARK, 0, 0.5, 0);
  b.blob(1, '#3e5a34', 0, h * 0.42, 0, 0.75, h * 0.38, 0.75, 1);
  b.cone(0.55, h * 0.3, 6, '#46633a', 0, h * 0.82, 0);
  return b.build();
}

/** Date palm: segmented leaning trunk with drooping fronds. */
export function palmTree(o: KitOptions = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'palm');
  const b = kitBuilder(o, 0.12);
  const h = r.range(6, 9);
  const lean = r.range(-0.12, 0.12);
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const y = (i + 0.5) * (h / segs);
    b.cyl(0.2, 0.26, h / segs + 0.05, 6, i % 2 ? '#7b6448' : '#6c5740', lean * y, y, 0, 0, 0, -lean);
  }
  const topX = lean * h;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const frond = new THREE.ConeGeometry(0.35, 3.2, 4, 1);
    frond.translate(0, 1.6, 0);
    frond.scale(1, 1, 0.25);
    b.add(frond, i % 2 ? '#5c7a3a' : '#6d8a44', topX, h, 0, 0, a, 1.9);
  }
  b.blob(0.35, '#8a6a3a', topX, h - 0.3, 0, 1, 1.3, 1);
  return b.build();
}

/** Eucalyptus: tall pale trunk forking into loose, high, blue-green crowns. */
export function eucalyptusTree(o: KitOptions = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'eucalyptus');
  const b = kitBuilder(o, 0.18);
  const h = r.range(10, 14);
  b.cyl(0.25, 0.4, h * 0.6, 6, '#c9c0ae', 0, h * 0.3, 0);
  b.cyl(0.12, 0.2, h * 0.35, 5, '#d4ccbb', 0.6, h * 0.7, 0, 0, 0, -0.35);
  b.cyl(0.12, 0.2, h * 0.35, 5, '#d4ccbb', -0.5, h * 0.68, 0.2, 0.15, 0, 0.3);
  for (let i = 0; i < 5; i++) {
    const a = r.range(0, Math.PI * 2);
    b.blob(r.range(1.4, 2.0), i % 2 ? '#6f8a6a' : '#7d977a', Math.cos(a) * 1.4, h * r.range(0.78, 0.95), Math.sin(a) * 1.4, 1.2, 0.7, 1.2);
  }
  return b.build();
}

/** Aleppo pine (forests on the 1948 hills): dark umbrella crown. */
export function pineTree(o: KitOptions = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'pine');
  const b = kitBuilder(o, 0.15);
  const h = r.range(7, 10);
  b.cyl(0.18, 0.3, h * 0.75, 5, '#5a4636', 0, h * 0.37, 0, 0, 0, r.range(-0.08, 0.08));
  b.blob(1.8, '#3f5a3a', 0, h * 0.8, 0, 1.3, 0.55, 1.3);
  b.blob(1.3, '#4a6640', 0.6, h * 0.92, 0.3, 1.2, 0.5, 1.2);
  return b.build();
}

/** Sabra (prickly pear) hedge segment: stacked flat pads along x. */
export function sabraHedge(o: KitOptions & { length?: number } = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'sabra');
  const b = kitBuilder(o, 0.2);
  const len = o.length ?? 4;
  const pads = Math.round(len * 3.5);
  for (let i = 0; i < pads; i++) {
    const x = r.range(-len / 2, len / 2);
    const y = r.range(0.3, 1.9);
    b.add(new THREE.SphereGeometry(0.32, 6, 4), r.chance(0.5) ? '#6f8f4a' : '#5f7f42', x, y, r.range(-0.35, 0.35), r.range(-0.4, 0.4), r.range(0, Math.PI), r.range(-0.5, 0.5), 1, 1.25, 0.28);
    if (r.chance(0.15)) b.blob(0.07, '#d9622b', x, y + 0.4, 0);
  }
  return b.build();
}

/** Weathered rock: jittered low-poly blob (shared corners move together, so faces stay closed). */
export function rock(o: KitOptions & { size?: number; color?: string } = {}): THREE.BufferGeometry {
  const r = new Rng(o.seed ?? 'rock');
  const size = o.size ?? 1;
  const g = new THREE.IcosahedronGeometry(size, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const offsets = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = pos.getX(i).toFixed(3) + ',' + pos.getY(i).toFixed(3) + ',' + pos.getZ(i).toFixed(3);
    let k = offsets.get(key);
    if (k === undefined) {
      k = r.range(0.75, 1.2);
      offsets.set(key, k);
    }
    pos.setXYZ(i, pos.getX(i) * k * 1.2, pos.getY(i) * k * 0.7, pos.getZ(i) * k);
  }
  const b = kitBuilder(o, 0.22);
  b.add(g, o.color ?? '#a99e8b', 0, size * 0.35, 0);
  return b.build();
}
