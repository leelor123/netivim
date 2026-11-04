import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ShaderWarmup, type WarmupProgram, type WarmupTarget } from '../../src/render/shaderWarmup';
import { missionMayStep } from '../../src/gameplay/director';

/** A fake renderer: every compile costs `costMs` on the fake clock; programs link when told. */
function fakeTarget(parallel: boolean, costMs: number, clock: { t: number }) {
  const programs = new Map<THREE.Material, WarmupProgram & { ready: boolean; linked: number }>();
  const compiled: THREE.Object3D[] = [];
  const target: WarmupTarget = {
    parallel,
    compile(object) {
      clock.t += costMs;
      compiled.push(object);
      object.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && !programs.has(m)) {
          const p = {
            ready: false,
            linked: 0,
            isReady() {
              return this.ready;
            },
            getUniforms() {
              this.linked++;
              return {};
            },
          };
          programs.set(m, p);
        }
      });
    },
    programOf: (m) => programs.get(m),
  };
  return { target, programs, compiled };
}

function sceneWith(n: number, shared = false): THREE.Scene {
  const scene = new THREE.Scene();
  const geo = new THREE.BoxGeometry();
  const one = new THREE.MeshBasicMaterial();
  for (let i = 0; i < n; i++) scene.add(new THREE.Mesh(geo, shared ? one : new THREE.MeshBasicMaterial()));
  return scene;
}

const camera = new THREE.PerspectiveCamera();

describe('ShaderWarmup (incremental, non-blocking)', () => {
  it('never spends more than the per-frame budget (one object over at most)', () => {
    const clock = { t: 0 };
    const { target, compiled } = fakeTarget(false, 3, clock);
    const w = new ShaderWarmup(target, { budgetMs: 8, capMs: 2000, clock: () => clock.t, hidden: () => false });
    w.start(sceneWith(20), camera);
    let frames = 0;
    let now = 0;
    while (!w.step(now)) {
      frames++;
      now += 16;
      expect(frames).toBeLessThan(50);
    }
    expect(compiled).toHaveLength(20);
    // 3 ms per compile, 8 ms budget: 3 per frame, so 7 frames, never 20 in one.
    expect(frames).toBeGreaterThanOrEqual(6);
    expect(w.done).toBe(true);
  });

  it('compiles one object per material variant, hidden objects included', () => {
    const clock = { t: 0 };
    const { target, compiled } = fakeTarget(false, 0, clock);
    const scene = sceneWith(5, true);
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    hidden.visible = false;
    scene.add(hidden);
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(), (scene.children[0] as THREE.Mesh).material as THREE.Material, 2);
    scene.add(inst);
    const w = new ShaderWarmup(target, { budgetMs: 8, capMs: 2000, clock: () => clock.t, hidden: () => false });
    w.start(scene, camera);
    w.step(0);
    // shared material (1) + hidden mesh (1) + instanced variant of the shared material (1)
    expect(compiled).toHaveLength(3);
    expect(compiled).toContain(hidden);
    expect(compiled).toContain(inst);
  });

  it('without parallel compile, forces each link right after its compile (spread over frames)', () => {
    const clock = { t: 0 };
    const { target, programs } = fakeTarget(false, 5, clock);
    const w = new ShaderWarmup(target, { budgetMs: 8, capMs: 2000, clock: () => clock.t, hidden: () => false });
    w.start(sceneWith(4), camera);
    w.step(0);
    const linkedAfterOne = [...programs.values()].filter((p) => p.linked > 0).length;
    expect(linkedAfterOne).toBeGreaterThan(0);
    expect(linkedAfterOne).toBeLessThan(4);
    let now = 0;
    while (!w.step((now += 16)));
    expect([...programs.values()].every((p) => p.linked === 1)).toBe(true);
  });

  it('with parallel compile, waits (non-blocking) until every program reports ready', () => {
    const clock = { t: 0 };
    const { target, programs } = fakeTarget(true, 0, clock);
    const w = new ShaderWarmup(target, { budgetMs: 8, capMs: 2000, clock: () => clock.t, hidden: () => false });
    w.start(sceneWith(3), camera);
    expect(w.step(0)).toBe(false);
    expect(w.step(16)).toBe(false);
    for (const p of programs.values()) {
      expect(p.linked).toBe(0); // never the blocking query
      p.ready = true;
    }
    expect(w.step(32)).toBe(true);
  });

  it('caps on visible time: hidden time is skipped, a long gap counts as one short tick', () => {
    const clock = { t: 0 };
    let hidden = false;
    const { target } = fakeTarget(true, 0, clock);
    const w = new ShaderWarmup(target, { budgetMs: 8, capMs: 400, stallMs: 250, clock: () => clock.t, hidden: () => hidden });
    w.start(sceneWith(2), camera);
    let now = 0;
    for (let i = 0; i < 5; i++) expect(w.step((now += 16))).toBe(false); // 64 ms counted
    hidden = true;
    expect(w.step((now += 5000))).toBe(false); // hidden: no work, no time
    hidden = false;
    expect(w.step((now += 16))).toBe(false); // first frame back: gap not counted
    expect(w.step((now += 3000))).toBe(false); // a paused WebView: counted as 250 ms, not 3000 (314)
    expect(w.step((now += 16))).toBe(false); // 330 ms
    expect(w.step((now += 16))).toBe(false); // 346 ms
    expect(w.step(now + 60)).toBe(true); // 406 ms: capped
  });

  it('very slow frames (software GL) still reach the cap after a bounded number of frames', () => {
    const clock = { t: 0 };
    const { target } = fakeTarget(true, 0, clock);
    const w = new ShaderWarmup(target, { budgetMs: 8, capMs: 2000, clock: () => clock.t, hidden: () => false });
    w.start(sceneWith(2), camera);
    let now = 0;
    let frames = 0;
    while (!w.step((now += 1700))) frames++;
    expect(frames).toBeLessThanOrEqual(9);
  });

  it('does no compile work while the page is hidden', () => {
    const clock = { t: 0 };
    const { target, compiled } = fakeTarget(false, 1, clock);
    const w = new ShaderWarmup(target, { budgetMs: 8, capMs: 2000, clock: () => clock.t, hidden: () => true });
    w.start(sceneWith(3), camera);
    expect(w.step(0)).toBe(false);
    expect(compiled).toHaveLength(0);
  });

  it('cancel drops the queue and the scene; a failing compile ends the warm-up', () => {
    const clock = { t: 0 };
    const { target } = fakeTarget(false, 0, clock);
    const w = new ShaderWarmup(target, { budgetMs: 8, capMs: 2000, clock: () => clock.t, hidden: () => false });
    w.start(sceneWith(3), camera);
    w.cancel();
    expect(w.done).toBe(true);
    expect(w.queued).toBe(0);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken: WarmupTarget = {
      parallel: false,
      compile() {
        throw new Error('boom');
      },
      programOf: () => undefined,
    };
    const b = new ShaderWarmup(broken, { budgetMs: 8, capMs: 2000, clock: () => clock.t, hidden: () => false });
    b.start(sceneWith(1), camera);
    expect(b.step(0)).toBe(true);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('the mission clock does not advance before the pipeline is ready', () => {
  it('steps are held while the level scene warms up and resume on its first frame', () => {
    const clock = { t: 0 };
    const { target, programs } = fakeTarget(true, 1, clock);
    const warmup = new ShaderWarmup(target, { budgetMs: 8, capMs: 2000, clock: () => clock.t, hidden: () => false });
    const scene = sceneWith(30);
    const pipeline = { holdsSimulation: (s: THREE.Scene) => s === scene && warmup.blocking };
    const host = { level: { scene: { scene } }, simTime: 0 } as unknown as Parameters<typeof missionMayStep>[0] & { simTime: number };
    warmup.start(scene, camera);
    let now = 0;
    let frames = 0;
    // Game frame order: steps first, then the pipeline's warm-up step (render).
    for (; frames < 10; frames++) {
      if (missionMayStep(host, pipeline)) host.simTime += 1 / 60;
      warmup.step((now += 16));
    }
    expect(warmup.done).toBe(false);
    expect(host.simTime).toBe(0);
    for (const p of programs.values()) p.ready = true;
    while (!warmup.step((now += 16)));
    if (missionMayStep(host, pipeline)) host.simTime += 1 / 60;
    expect(host.simTime).toBeCloseTo(1 / 60);
    // No pipeline (headless tools) or no level: always steps.
    expect(missionMayStep(host, undefined)).toBe(true);
    expect(missionMayStep({ level: null }, pipeline)).toBe(true);
  });
});
