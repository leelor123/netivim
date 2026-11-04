import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { deckGeometry, GeoBuilder, hullGeometry, stationAt, type HullStation } from '../../src/world/kit/builder';
import { stoneVillageHouse, ottomanBuilding, tent } from '../../src/world/kit/buildings';
import { figureGeometry, ERA_OUTFITS, HIP_HEIGHT, LIMB } from '../../src/world/kit/figures';
import { fishingBoat, immigrantShip } from '../../src/world/kit/vehicles';
import { ERA_IDS } from '../../src/world/eraLook';

const STATIONS: readonly HullStation[] = [
  { z: -3, halfWidth: 0.9, keel: -0.2, sheer: 0.7 },
  { z: 0, halfWidth: 1.2, keel: -0.4, sheer: 0.6 },
  { z: 3, halfWidth: 0.6, keel: -0.2, sheer: 0.9 },
  { z: 4, halfWidth: 0.05, keel: 0.05, sheer: 1.0 },
];

function signedVolume(g: THREE.BufferGeometry): number {
  const p = g.attributes.position;
  if (!p) return 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
}

function triangles(g: THREE.BufferGeometry): number {
  return (g.attributes.position?.count ?? 0) / 3;
}

function expectFinite(name: string, g: THREE.BufferGeometry): void {
  for (const attr of ['position', 'normal', 'color']) {
    const a = g.attributes[attr];
    expect(a, name + ' ' + attr).toBeDefined();
    expect(Array.from(a?.array ?? []).every(Number.isFinite), name + ' ' + attr + ' finite').toBe(true);
  }
  const n = g.attributes.normal;
  if (!n) return;
  let bad = 0;
  for (let i = 0; i < n.count; i++) {
    const len = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
    if (!(len === 0 || Math.abs(len - 1) < 1e-3)) bad++;
  }
  expect(bad, name + ' unit normals').toBe(0);
}

describe('lofted hulls', () => {
  it('a full hull band plus deck is a closed, outward-facing shell', () => {
    const shell = mergeGeometries([hullGeometry(STATIONS, 0, 1, 4), deckGeometry(STATIONS)]);
    const vol = signedVolume(shell);
    // Outward winding gives a positive signed volume of plausible size (a box bound is ~2.4 x 1.4 x 7).
    expect(vol).toBeGreaterThan(2);
    expect(vol).toBeLessThan(2.4 * 1.4 * 7);
    expect(Array.from(shell.attributes.position?.array ?? []).every(Number.isFinite)).toBe(true);
  });

  it('bands stack without gaps: split bands carry the same area as one band', () => {
    const area = (g: THREE.BufferGeometry): number => {
      const p = g.attributes.position;
      if (!p) return 0;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      let s = 0;
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i);
        b.fromBufferAttribute(p, i + 1);
        c.fromBufferAttribute(p, i + 2);
        s += b.sub(a).cross(c.sub(a)).length() / 2;
      }
      return s;
    };
    const whole = area(hullGeometry(STATIONS, 0.5, 1, 4));
    const split = area(hullGeometry(STATIONS, 0.5, 0.75, 2)) + area(hullGeometry(STATIONS, 0.75, 1, 2));
    expect(split).toBeCloseTo(whole, 5);
  });

  it('decks face up and stations interpolate', () => {
    const deck = deckGeometry(STATIONS);
    deck.computeVertexNormals();
    const n = deck.attributes.normal;
    for (let i = 0; i < (n?.count ?? 0); i++) expect(n?.getY(i) ?? 0).toBeGreaterThan(0.5);
    const mid = stationAt(STATIONS, -1.5);
    expect(mid.halfWidth).toBeCloseTo(1.05);
    expect(mid.sheer).toBeCloseTo(0.65);
  });

  it('beam spans its two end points', () => {
    const g = new GeoBuilder().beam(-1, 0, 2, 3, 2, -1, 0.1, 0.1, '#ffffff').build();
    const bb = g.boundingBox;
    expect(Math.abs((bb?.min.x ?? 99) - (-1))).toBeLessThan(0.1);
    expect(Math.abs((bb?.max.x ?? 99) - (3))).toBeLessThan(0.1);
    expect(Math.abs((bb?.min.z ?? 99) - (-1))).toBeLessThan(0.1);
    expect(Math.abs((bb?.max.z ?? 99) - (2))).toBeLessThan(0.1);
    expect(Math.abs((bb?.max.y ?? 99) - (2))).toBeLessThan(0.1);
  });
});

describe('polished kit models', () => {
  it('boats and ships stay valid, outward and within triangle budgets', () => {
    for (const era of ['mandate1940', 'ottoman1890', 'archiveNight'] as const) {
      for (const seed of ['a', 'b', 'c', 'd']) {
        const boat = fishingBoat({ era, seed });
        expectFinite('boat', boat);
        expect(triangles(boat)).toBeLessThan(2200);
        const bb = boat.boundingBox;
        // Same envelope the levels were laid out for (keel under the waterline, mast ~5 m).
        expect(bb && bb.min.z > -3.6 && bb.max.z < 4.6 && bb.max.x < 1.4 && bb.min.y > -0.6 && bb.max.y < 6).toBe(true);
        boat.dispose();
      }
      const ship = immigrantShip({ era });
      expectFinite('ship', ship);
      expect(triangles(ship)).toBeLessThan(6000);
      ship.dispose();
    }
  });

  it('figures have faces, stay under 1,200 triangles and keep the rig pivots', () => {
    for (const era of ERA_IDS) {
      for (let v = 0; v < ERA_OUTFITS[era].length; v++) {
        const g = figureGeometry({ era, variant: v });
        expectFinite('figure', g);
        expect(triangles(g)).toBeLessThan(1200);
        // Leg vertices stay below the hip pivot, so the rig never bends the torso.
        const pos = g.attributes.position;
        const limb = g.attributes.aLimb;
        for (let i = 0; i < (pos?.count ?? 0); i++) {
          const id = limb?.getX(i) ?? 0;
          if (id === LIMB.leftLeg || id === LIMB.rightLeg) expect(pos?.getY(i) ?? 0).toBeLessThanOrEqual(HIP_HEIGHT + 1e-6);
        }
        g.dispose();
      }
    }
  });

  it('detailed buildings and tents stay within budgets', () => {
    for (const seed of ['p', 'q', 'r']) {
      for (const g of [stoneVillageHouse({ seed, stories: 2 }), ottomanBuilding({ seed }), tent({ seed, kind: 'ridge' }), tent({ seed, kind: 'bell' })]) {
        expectFinite('building', g);
        expect(triangles(g)).toBeLessThan(3000);
        g.dispose();
      }
    }
  });
});
