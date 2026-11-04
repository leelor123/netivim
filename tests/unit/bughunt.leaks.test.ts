import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { FIXED_DT } from '../../src/core/loop';
import { BotInput } from '../../src/gameplay/runtime/bot';
import { MissionHost } from '../../src/gameplay/runtime/missionHost';
import type { AnyLevelDefinition } from '../../src/gameplay/types';
import { DEFAULT_WORLD_QUALITY } from '../../src/world/quality';
import archive from '../../src/levels/ch00/archive-night';
import jaffa from '../../src/levels/ch00/jaffa-letters';
import tower from '../../src/levels/ch01/tower-stockade';
import landing from '../../src/levels/ch01/night-landing';
import vote from '../../src/levels/ch01/the-vote';

const LEVELS: readonly AnyLevelDefinition[] = [archive, jaffa, tower, landing, vote];

function listenerTotal(bus: EventBus<GameEvents>): number {
  const map = (bus as unknown as { handlers: Map<string, Set<unknown>> }).handlers;
  let n = 0;
  for (const set of map.values()) n += set.size;
  return n;
}

function census(scene: THREE.Object3D): { objects: number; geometries: number; materials: number } {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  let objects = 0;
  scene.traverse((o) => {
    objects++;
    const m = o as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    if (m.material) for (const x of Array.isArray(m.material) ? m.material : [m.material]) mats.add(x);
  });
  return { objects, geometries: geos.size, materials: mats.size };
}

function makeHost(def: AnyLevelDefinition, bus: EventBus<GameEvents>): MissionHost {
  return new MissionHost({
    def,
    bus,
    input: new BotInput(),
    difficulty: () => 'normal',
    headless: true,
    quality: { ...DEFAULT_WORLD_QUALITY, shadows: false },
    reducedMotion: () => false,
    t: (k) => k,
    glyph: (a) => a,
    recordChoice: () => undefined,
    hooks: { onFailed: () => undefined, onDecision: () => undefined, onComplete: () => undefined, onPlan: () => undefined },
  });
}

describe('bug hunt: retries and disposal do not leak', () => {
  for (const def of LEVELS) {
    it(def.id + ': 25 retries keep the scene graph flat and dispose unsubscribes every listener', () => {
      const bus = new EventBus<GameEvents>();
      const before = listenerTotal(bus);
      const host = makeHost(def, bus);
      const level = host.start();
      for (let i = 0; i < 60; i++) host.update(FIXED_DT);
      const base = census(level.scene.scene);
      const failKey = Object.keys(def.failures)[0] as string;
      for (let i = 0; i < 25; i++) {
        host.fail(failKey);
        host.retry();
        for (let k = 0; k < 10; k++) host.update(FIXED_DT);
      }
      const after = census(level.scene.scene);
      expect(after.objects).toBeLessThanOrEqual(base.objects);
      expect(after.geometries).toBeLessThanOrEqual(base.geometries);
      expect(after.materials).toBeLessThanOrEqual(base.materials);
      host.dispose();
      level.scene.dispose();
      expect(listenerTotal(bus)).toBe(before);
    });
  }
});
