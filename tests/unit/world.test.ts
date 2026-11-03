import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hash2i, hashString, Rng } from '../../src/world/rng';
import { fbm, ridged, SimplexNoise2D, ValueNoise2D } from '../../src/world/noise';
import { LodCrossFade, scaledThresholds, selectLod } from '../../src/world/lod';
import { Terrain } from '../../src/world/terrain';
import { BIOME_IDS, BIOMES, NoiseSet } from '../../src/world/biomes';
import { applyEraLook, ERA_IDS, ERA_LOOKS, SkyDome } from '../../src/world/eraLook';
import { densityCount, fromGraphicsOptions, PRESET_QUALITY, worldQualityFromSettings } from '../../src/world/quality';
import { DEFAULT_GRAPHICS_OPTIONS, DEFAULT_SETTINGS } from '../../src/core/settings';

const worldLocale = JSON.parse(readFileSync(join(__dirname, '../../src/locales/he/world.json'), 'utf8')) as Record<string, string>;

describe('world rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const sa = Array.from({ length: 50 }, () => a.next());
    const sb = Array.from({ length: 50 }, () => b.next());
    const sc = Array.from({ length: 50 }, () => c.next());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    expect(sa.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('accepts string seeds and keeps ints in range', () => {
    expect(new Rng('village').next()).toBe(new Rng(hashString('village')).next());
    const r = new Rng(1);
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
    expect(() => r.pick([])).toThrow();
  });

  it('forks are stable and independent', () => {
    expect(new Rng(9).fork('x').next()).toBe(new Rng(9).fork('x').next());
    expect(new Rng(9).fork('x').next()).not.toBe(new Rng(9).fork('y').next());
    expect(hash2i(1, 2, 3)).toBe(hash2i(1, 2, 3));
    expect(hash2i(1, 2, 3)).not.toBe(hash2i(2, 1, 3));
  });

  it('world generation does not depend on Math.random', () => {
    // three uses Math.random only for object UUIDs; the generated data must not change with it.
    const original = Math.random;
    const build = (value: number): number[] => {
      Math.random = () => value;
      try {
        const t = new Terrain({ seed: 'no-random', size: 64, chunkSize: 32, cell: 2, biome: 'coastalPlain', roads: [{ points: [[-30, 0], [30, 5]], width: 4, shoulder: 3, color: '#b59a74' }] });
        const out = Array.from(t.heights);
        t.dispose();
        return out;
      } finally {
        Math.random = original;
      }
    };
    expect(build(0.1)).toEqual(build(0.9));
  });
});

describe('world noise', () => {
  it('is deterministic and bounded', () => {
    for (const make of [(s: number) => new ValueNoise2D(s), (s: number) => new SimplexNoise2D(s)]) {
      const a = make(7);
      const b = make(7);
      const c = make(8);
      let differs = false;
      for (let i = 0; i < 400; i++) {
        const x = i * 0.37 - 50;
        const y = i * 0.61 + 3;
        const v = a.sample(x, y);
        expect(v).toBe(b.sample(x, y));
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(1.05);
        if (v !== c.sample(x, y)) differs = true;
      }
      expect(differs).toBe(true);
    }
  });

  it('fbm and ridged stay in range and are continuous', () => {
    const n = new SimplexNoise2D(3);
    for (let i = 0; i < 200; i++) {
      const x = i * 0.13;
      const f = fbm(n, x, 2, 5);
      const r = ridged(n, x, 2, 4);
      expect(Math.abs(f)).toBeLessThanOrEqual(1.05);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(Math.abs(fbm(n, x + 1e-4, 2, 5) - f)).toBeLessThan(0.01);
    }
  });
});

describe('biomes and era looks', () => {
  it('every biome yields finite heights and colors and has a locale name', () => {
    const ns = new NoiseSet(5);
    const out: [number, number, number] = [0, 0, 0];
    for (const id of BIOME_IDS) {
      const b = BIOMES[id];
      expect(worldLocale[b.nameKey], b.nameKey).toBeTruthy();
      for (let i = 0; i < 50; i++) {
        const x = (i - 25) * 7.3;
        const z = (i % 7) * 11.1 - 30;
        const h = b.height(x, z, ns);
        expect(Number.isFinite(h)).toBe(true);
        b.color(out, { x, z, height: h, slope: (i % 10) / 10, jitter: (i % 3) / 3 }, ns);
        for (const c of out) expect(c >= 0 && c < 2 && Number.isFinite(c)).toBe(true);
      }
    }
  });

  it('every era has a look and a name, and applyEraLook drives fog, lights and sky', () => {
    for (const id of ERA_IDS) {
      expect(ERA_LOOKS[id].id).toBe(id);
      expect(worldLocale[ERA_LOOKS[id].nameKey], id).toBeTruthy();
    }
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight();
    const hemi = new THREE.HemisphereLight();
    const sky = new SkyDome(100);
    applyEraLook({ scene, sun, hemi, sky, renderDistance: 0.5 }, 'war1948');
    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    const fog = scene.fog as THREE.Fog;
    expect(fog.far).toBeCloseTo(ERA_LOOKS.war1948.fogFar * 0.5);
    expect(sun.position.y).toBeGreaterThan(0);
    applyEraLook({ scene, sun, hemi, sky }, 'modern');
    expect(scene.fog).toBe(fog);
    expect(sun.intensity).toBe(ERA_LOOKS.modern.sunIntensity);
    applyEraLook({ scene, fog: false }, 'modern');
    expect(scene.fog).toBeNull();
    sky.dispose();
  });

  it('all world locale keys use the world. prefix', () => {
    for (const key of Object.keys(worldLocale)) expect(key.startsWith('world.')).toBe(true);
  });
});

describe('LOD selection and cross-fade', () => {
  const thresholds = [70, 150];

  it('selects levels by distance with hysteresis', () => {
    expect(selectLod(10, thresholds, 0, 6)).toBe(0);
    expect(selectLod(74, thresholds, 0, 6)).toBe(0);
    expect(selectLod(77, thresholds, 0, 6)).toBe(1);
    expect(selectLod(66, thresholds, 1, 6)).toBe(1);
    expect(selectLod(63, thresholds, 1, 6)).toBe(0);
    expect(selectLod(500, thresholds, 0, 6)).toBe(2);
    expect(selectLod(146, thresholds, 2, 6)).toBe(2);
    expect(selectLod(143, thresholds, 2, 6)).toBe(1);
  });

  it('scales thresholds with settings.lodDistance', () => {
    expect(scaledThresholds(1.5, [])).toEqual([105, 225]);
    expect(scaledThresholds(0.5, [], [10])).toEqual([5]);
  });

  it('cross-fades over the duration without ever leaving a hole', () => {
    const f = new LodCrossFade(0, 0.6);
    f.request(1);
    expect(f.fading).toBe(true);
    let elapsed = 0;
    while (f.update(0.05)) {
      elapsed += 0.05;
      // One of the two levels is always fully opaque: no see-through frame.
      expect(Math.max(f.toOpacity, f.fromOpacity)).toBe(1);
      expect(f.toOpacity).toBeGreaterThan(0);
    }
    elapsed += 0.05;
    expect(elapsed).toBeCloseTo(0.6, 5);
    expect(f.level).toBe(1);
    expect(f.from).toBe(1);
    expect(f.toOpacity).toBe(1);
    expect(f.fromOpacity).toBe(0);
  });

  it('ignores requests while fading and supports reset', () => {
    const f = new LodCrossFade(0, 1);
    f.request(1);
    f.update(0.3);
    f.request(2);
    expect(f.level).toBe(1);
    f.update(1);
    f.request(2);
    expect(f.level).toBe(2);
    f.reset(0);
    expect(f.fading).toBe(false);
    expect(f.level).toBe(0);
  });
});

describe('terrain', () => {
  const terrain = new Terrain({
    seed: 'unit',
    size: 128,
    chunkSize: 32,
    cell: 2,
    biome: 'judeanHills',
    secondary: { biome: 'coastalPlain', mask: (x) => (x < -20 ? 1 : 0) },
    roads: [{ points: [[-60, -60], [0, -10], [20, 30], [60, 60]], width: 6, shoulder: 4, color: '#b59a74' }],
    era: 'war1948',
  });

  it('heightAt matches every LOD 0 mesh vertex and interpolates inside faces', () => {
    const geo = terrain.buildChunkGeometry(1, 2, 16, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const top = 16 * 16 * 6;
    for (let i = 0; i < top; i++) expect(terrain.heightAt(pos.getX(i), pos.getZ(i))).toBeCloseTo(pos.getY(i), 4);
    for (let t = 0; t < top; t += 3 * 7) {
      const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
      const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
      const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
      expect(terrain.heightAt(cx, cz)).toBeCloseTo(cy, 4);
    }
    geo.dispose();
  });

  it('builds valid flat-shaded chunk geometry with skirts and colors', () => {
    for (const step of [1, 2, 4]) {
      const geo = terrain.buildChunkGeometry(0, 0, 16, step);
      const cells = 16 / step;
      expect(geo.attributes.position?.count).toBe((cells * cells * 2 + cells * 8) * 3);
      expect(geo.attributes.normal).toBeDefined();
      expect(geo.attributes.color).toBeDefined();
      for (const v of geo.attributes.position?.array ?? []) expect(Number.isFinite(v)).toBe(true);
      for (const v of geo.attributes.color?.array ?? []) expect(Number.isFinite(v)).toBe(true);
      geo.dispose();
    }
  });

  it('carves the road flat and marks it', () => {
    const along = terrain.roads[0];
    expect(along).toBeDefined();
    expect(terrain.roadAt(0, -10)).toBeGreaterThan(0.9);
    expect(terrain.roadAt(-60, 60)).toBe(0);
    // Across the road bed the surface is nearly level.
    const h0 = terrain.heightAt(0, -10);
    expect(Math.abs(terrain.heightAt(1.5, -8.5) - h0)).toBeLessThan(1.2);
  });

  it('is deterministic for a seed', () => {
    const again = new Terrain({ seed: 'unit', size: 128, chunkSize: 32, cell: 2, biome: 'judeanHills', secondary: { biome: 'coastalPlain', mask: (x) => (x < -20 ? 1 : 0) }, roads: [{ points: [[-60, -60], [0, -10], [20, 30], [60, 60]], width: 6, shoulder: 4, color: '#b59a74' }], era: 'war1948' });
    expect(Array.from(again.heights)).toEqual(Array.from(terrain.heights));
    again.dispose();
  });

  it('selects LOD per chunk from camera distance and cross-fades on change', () => {
    const t = new Terrain({ seed: 'lod', size: 256, chunkSize: 32, cell: 2, biome: 'negev', fadeSeconds: 0.5 });
    const cam = new THREE.Vector3(-120, 30, -120);
    t.update(cam, 1 / 60);
    const levels = t.chunkLevels([]);
    expect(levels).toContain(0);
    expect(levels).toContain(2);
    expect(t.fadingCount).toBe(0);
    cam.set(120, 30, 120);
    t.update(cam, 1 / 60);
    expect(t.fadingCount).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) t.update(cam, 1 / 60);
    expect(t.fadingCount).toBe(0);
    const after = t.chunkLevels([]);
    expect(after[0]).toBe(2);
    expect(after[after.length - 1]).toBe(0);
    // Visible meshes: exactly one per chunk once settled.
    const visible = t.group.children.filter((c) => c.visible && c.name.startsWith('terrain-')).length;
    expect(visible).toBe(t.chunkCount);
    t.dispose();
  });

  it('adds water only when the biome or config has a level', () => {
    const coast = new Terrain({ seed: 'w', size: 64, chunkSize: 32, cell: 4, biome: 'coastalPlain', lodSteps: [1, 2] });
    expect(coast.water).not.toBeNull();
    const dry = new Terrain({ seed: 'w', size: 64, chunkSize: 32, cell: 4, biome: 'negev', lodSteps: [1, 2] });
    expect(dry.water).toBeNull();
    coast.dispose();
    dry.dispose();
  });

  it('rejects layouts that do not divide evenly', () => {
    expect(() => new Terrain({ seed: 1, size: 100, chunkSize: 32, cell: 2, biome: 'negev' })).toThrow();
    expect(() => new Terrain({ seed: 1, size: 96, chunkSize: 32, cell: 2, biome: 'negev', lodSteps: [1, 3] })).toThrow();
  });
});

describe('world quality', () => {
  it('maps presets and custom options', () => {
    expect(worldQualityFromSettings(DEFAULT_SETTINGS)).toBe(PRESET_QUALITY.high);
    const custom = { ...DEFAULT_SETTINGS, graphics: { ...DEFAULT_SETTINGS.graphics, mode: 'custom' as const, custom: { ...DEFAULT_GRAPHICS_OPTIONS, vegetation: 0.3, shadows: 'off' as const } } };
    const q = worldQualityFromSettings(custom);
    expect(q.vegetation).toBe(0.3);
    expect(q.shadows).toBe(false);
    expect(fromGraphicsOptions(DEFAULT_GRAPHICS_OPTIONS).shadows).toBe(true);
  });

  it('density counts scale and clamp', () => {
    expect(densityCount(100, 0)).toBe(0);
    expect(densityCount(100, 0.5)).toBe(50);
    expect(densityCount(100, 2)).toBe(100);
    expect(densityCount(100, -1)).toBe(0);
  });
});
