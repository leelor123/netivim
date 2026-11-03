import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { HEBREW } from '../../src/locales';
import { catmullRom, ease } from '../../src/cinematics/math';
import { DEMO_CUTSCENE } from '../../src/cinematics/demo';
import { CutscenePlayer, SkipHold, type CutsceneHost } from '../../src/cinematics/player';
import type { CutsceneDefinition, CutsceneOverlay, DepthOfFieldTarget, FadeColor } from '../../src/cinematics/types';
import { validateCutscene } from '../../src/cinematics/validate';

interface Rig {
  player: CutscenePlayer;
  camera: THREE.PerspectiveCamera;
  log: string[];
  overlay: { fade: number; color: FadeColor; bars: boolean; card: string | null; active: boolean };
  dof: string[];
  reduced: { value: boolean };
}

function rig(): Rig {
  const bus = new EventBus<GameEvents>();
  const log: string[] = [];
  bus.on('cutscene:started', (e) => log.push('started:' + e.id));
  bus.on('cutscene:ended', (e) => log.push('ended:' + e.id + ':' + String(e.skipped)));
  bus.on('subtitle:show', (e) => log.push('sub:' + e.textKey));
  bus.on('subtitle:clear', () => log.push('sub-clear'));
  bus.on('audio:cue', (e) => log.push('cue:' + e.cue));
  bus.on('audio:mood', (e) => log.push('mood:' + e.mood));
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 100);
  const overlay = { fade: 0, color: 'black' as FadeColor, bars: false, card: null as string | null, active: false };
  const o: CutsceneOverlay = {
    setFade: (a, c) => {
      overlay.fade = a;
      overlay.color = c;
    },
    setLetterbox: (on) => {
      overlay.bars = on;
    },
    setTitleCard: (k) => {
      overlay.card = k;
    },
    setSkipProgress: () => undefined,
    setActive: (a) => {
      overlay.active = a;
    },
  };
  const dof: string[] = [];
  const target: DepthOfFieldTarget = {
    setDepthOfField: (f, a) => dof.push('set:' + f.toFixed(2) + ':' + a.toFixed(3)),
    clearDepthOfField: () => dof.push('clear'),
  };
  const reduced = { value: false };
  const host: CutsceneHost = { bus, getCamera: () => camera, isReducedMotion: () => reduced.value, overlay: o, getDepthOfFieldTarget: () => target };
  const player = new CutscenePlayer(host);
  player.onSceneEvent((name, t) => log.push('event:' + name + '@' + t.toFixed(2)));
  return { player, camera, log, overlay, dof, reduced };
}

const DEF: CutsceneDefinition = {
  id: 'test.cut',
  durationSec: 4,
  label: 'composite',
  sources: [],
  tracks: [
    {
      kind: 'camera',
      keys: [
        { t: 0, position: [0, 0, 0], target: [0, 0, -10], fov: 40, easing: 'linear' },
        { t: 2, position: [10, 0, 0], target: [0, 0, -10], fov: 60, easing: 'linear' },
        { t: 4, position: [10, 0, 10], target: [0, 0, -10] },
      ],
    },
    { kind: 'subtitles', items: [{ t: 1, textKey: 'a', speakerKey: null, durationMs: 1000, voice: false }, { t: 2, textKey: 'b', speakerKey: null, durationMs: 1500, voice: true }] },
    { kind: 'audio', items: [{ t: 0.5, cue: 'bell' }, { t: 3, mood: 'tense', era: 1 }] },
    { kind: 'events', items: [{ t: 1.5, name: 'go' }] },
    { kind: 'letterbox', items: [{ t: 0, on: true }, { t: 3, on: false }] },
    { kind: 'fade', items: [{ t: 3, durationSec: 1, color: 'sepia', direction: 'out' }] },
    { kind: 'dof', keys: [{ t: 0, focusDistance: 10, aperture: 0 }, { t: 4, focusDistance: 30, aperture: 0.4, easing: 'linear' }] },
  ],
};

function drive(r: Rig, hz: number, seconds: number): void {
  const n = Math.round(hz * seconds);
  for (let i = 0; i < n; i++) r.player.update(1 / hz);
}

describe('easing and splines', () => {
  it('hits the endpoints and is monotonic', () => {
    for (const name of ['linear', 'easeIn', 'easeOut', 'easeInOut', 'smoothstep', 'hold'] as const) {
      expect(ease(name, 0)).toBe(0);
      expect(ease(name, 1)).toBe(1);
      let prev = -1;
      for (let i = 0; i <= 20; i++) {
        const v = ease(name, i / 20);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
    expect(ease('easeIn', 0.5)).toBeLessThan(0.5);
    expect(ease('easeOut', 0.5)).toBeGreaterThan(0.5);
    expect(ease('hold', 0.99)).toBe(0);
    expect(ease('linear', -3)).toBe(0);
  });

  it('Catmull-Rom passes through its control points and bends the path', () => {
    expect(catmullRom(0, 1, 5, 9, 0)).toBeCloseTo(1);
    expect(catmullRom(0, 1, 5, 9, 1)).toBeCloseTo(5);
    // Collinear points give a straight line.
    expect(catmullRom(0, 1, 2, 3, 0.5)).toBeCloseTo(1.5);
    // An uneven neighbour makes the midpoint differ from the straight line.
    expect(catmullRom(0, 0, 10, 10, 0.5)).toBeCloseTo(5);
    expect(catmullRom(5, 0, 10, 10, 0.5)).not.toBeCloseTo(5);
  });
});

describe('CutscenePlayer', () => {
  it('interpolates the camera with easing and fov, and restores fov afterwards', () => {
    const r = rig();
    r.player.play(DEF);
    drive(r, 60, 1);
    expect(r.camera.position.x).toBeCloseTo(5, 3);
    expect(r.camera.fov).toBeCloseTo(50, 3);
    drive(r, 60, 1);
    expect(r.camera.position.x).toBeCloseTo(10, 3);
    drive(r, 60, 2);
    expect(r.player.playing).toBe(false);
    expect(r.camera.fov).toBe(50);
  });

  it('follows a Catmull-Rom path through the keys', () => {
    const r = rig();
    const def: CutsceneDefinition = {
      ...DEF,
      tracks: [
        {
          kind: 'camera',
          path: 'catmull-rom',
          keys: [
            { t: 0, position: [0, 0, 0], target: [0, 0, -1], easing: 'linear' },
            { t: 1, position: [10, 0, 0], target: [0, 0, -1], easing: 'linear' },
            { t: 2, position: [10, 0, 10], target: [0, 0, -1] },
            { t: 4, position: [0, 0, 10], target: [0, 0, -1] },
          ],
        },
      ],
    };
    r.player.play(def);
    drive(r, 60, 1);
    expect(r.camera.position.x).toBeCloseTo(10, 3);
    expect(r.camera.position.z).toBeCloseTo(0, 3);
    drive(r, 60, 0.5);
    // Linear would give (10, 0, 5); the spline overshoots outwards in x.
    expect(r.camera.position.z).toBeCloseTo(5, 0);
    expect(r.camera.position.x).toBeGreaterThan(10);
  });

  it('emits events in order and at the right time', () => {
    const r = rig();
    r.player.play(DEF);
    expect(r.log).toEqual(['started:test.cut']);
    drive(r, 60, 1.2);
    expect(r.log).toEqual(['started:test.cut', 'cue:bell', 'sub:a']);
    drive(r, 60, 0.4);
    expect(r.log.slice(3)).toEqual(['event:go@1.50']);
    drive(r, 60, 0.5);
    // Subtitle a ends exactly when b starts: clear comes first, then show.
    expect(r.log.slice(4)).toEqual(['sub-clear', 'sub:b']);
    drive(r, 60, 2);
    expect(r.log.slice(6)).toEqual(['mood:tense', 'sub-clear', 'ended:test.cut:false']);
    expect(r.overlay.active).toBe(false);
  });

  it.each([30, 60, 120, 144])('is deterministic at %i Hz', (hz) => {
    const reference = rig();
    reference.player.play(DEF);
    drive(reference, 60, 4.5);
    const r = rig();
    r.player.play(DEF);
    drive(r, hz, 4.5);
    expect(r.log).toEqual(reference.log);
    expect(r.dof).toEqual(['set:10.00:0.000', ...r.dof.slice(1, -1), 'clear']);
  });

  it('pauses when update is not called and resumes where it stopped', () => {
    const r = rig();
    r.player.play(DEF);
    drive(r, 60, 1);
    const t = r.player.time;
    // The game loop stops stepping while paused: nothing advances.
    expect(r.player.time).toBe(t);
    drive(r, 60, 0.5);
    expect(r.player.time).toBeCloseTo(t + 0.5, 6);
  });

  it('seeks silently, re-shows the active subtitle and restarts', () => {
    const r = rig();
    r.player.play(DEF);
    r.log.length = 0;
    r.player.seek(2.5);
    expect(r.log).toEqual(['sub:b']);
    expect(r.camera.position.z).toBeCloseTo(2.5, 3);
    drive(r, 60, 0.6);
    expect(r.log).toEqual(['sub:b', 'mood:tense']);
    r.player.restart();
    expect(r.player.time).toBe(0);
    expect(r.overlay.bars).toBe(true);
    drive(r, 60, 1.1);
    expect(r.log).toContain('sub:a');
  });

  it('skip ends the cutscene as skipped and clears visuals', () => {
    const r = rig();
    r.player.play(DEF);
    drive(r, 60, 1.2);
    r.log.length = 0;
    r.player.skip();
    expect(r.log).toEqual(['sub-clear', 'ended:test.cut:true']);
    expect(r.overlay.bars).toBe(false);
    expect(r.overlay.fade).toBe(0);
    expect(r.player.playing).toBe(false);
    expect(r.dof.at(-1)).toBe('clear');
  });

  it('sets letterbox, fade and title card from the tracks', () => {
    const r = rig();
    r.player.play(DEMO_CUTSCENE);
    expect(r.overlay.bars).toBe(true);
    expect(r.overlay.fade).toBeCloseTo(1, 3);
    drive(r, 60, 1.5);
    expect(r.overlay.fade).toBe(0);
    expect(r.overlay.card).toBe('cinematics.demo.place');
    drive(r, 60, 3);
    expect(r.overlay.card).toBeNull();
  });

  it('reduced motion turns a fast move into a cut with a dip, and drops shake', () => {
    const fast: CutsceneDefinition = {
      ...DEF,
      tracks: [
        {
          kind: 'camera',
          keys: [
            { t: 0, position: [0, 0, 0], target: [0, 0, -10], easing: 'linear', shake: 0.5 },
            { t: 1, position: [100, 0, 0], target: [0, 0, -10], easing: 'linear', shake: 0.5 },
            { t: 4, position: [100, 0, 1], target: [0, 0, -10] },
          ],
        },
      ],
    };
    const normal = rig();
    normal.player.play(fast);
    drive(normal, 60, 0.25);
    expect(normal.camera.position.x).toBeCloseTo(25, 0);
    expect(normal.overlay.fade).toBe(0);

    const r = rig();
    r.reduced.value = true;
    r.player.play(fast);
    drive(r, 60, 0.25);
    // Held at the start pose: no motion and no shake.
    expect(r.camera.position.x).toBe(0);
    expect(r.camera.position.y).toBe(0);
    drive(r, 60, 0.25);
    expect(r.overlay.fade).toBeGreaterThan(0.9);
    drive(r, 60, 0.3);
    expect(r.camera.position.x).toBe(100);
  });

  it('leaves slow moves alone in reduced-motion mode', () => {
    const r = rig();
    r.reduced.value = true;
    r.player.play(DEF);
    drive(r, 60, 1);
    expect(r.camera.position.x).toBeCloseTo(5, 3);
    expect(r.overlay.fade).toBe(0);
  });

  it('does not allocate per update', () => {
    const r = rig();
    r.player.play(DEMO_CUTSCENE);
    drive(r, 60, 0.5);
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 200000; i++) {
      r.player.update(1e-7);
    }
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(8 * 1024 * 1024);
  });
});

describe('SkipHold', () => {
  it('needs about 1 second of holding before the cutscene was seen', () => {
    const h = new SkipHold(1);
    expect(h.update(1 / 60, false, false)).toBe(false);
    let triggered = -1;
    for (let i = 0; i < 70; i++) if (h.update(1 / 60, true, false)) triggered = i;
    expect(triggered).toBe(59);
  });

  it('shows progress and cancels on release', () => {
    const h = new SkipHold(1);
    h.update(0, false, false);
    h.update(0.5, true, false);
    expect(h.progress).toBeCloseTo(0.5);
    h.update(0.1, false, false);
    expect(h.progress).toBe(0);
  });

  it('skips instantly on a fresh press once seen', () => {
    const h = new SkipHold(1);
    h.update(1 / 60, false, true);
    expect(h.update(1 / 60, true, true)).toBe(true);
  });

  it('ignores a button that was already held when the cutscene began', () => {
    const h = new SkipHold(1);
    for (let i = 0; i < 120; i++) expect(h.update(1 / 60, true, true)).toBe(false);
    h.update(1 / 60, false, true);
    expect(h.update(1 / 60, true, true)).toBe(true);
  });
});

describe('validateCutscene', () => {
  const ctx = { hasKey: (k: string) => Object.hasOwn(HEBREW, k) };

  it('accepts the demo cutscene', () => {
    expect(validateCutscene(DEMO_CUTSCENE, ctx)).toEqual([]);
  });

  const paths = (def: CutsceneDefinition): string => validateCutscene(def, ctx).map((p) => p.path + ': ' + p.message).join('\n');
  const withTracks = (tracks: CutsceneDefinition['tracks'], extra: Partial<CutsceneDefinition> = {}): CutsceneDefinition => ({
    id: 'x.y',
    durationSec: 5,
    label: 'composite',
    sources: [],
    tracks,
    ...extra,
  });

  it('finds non-monotonic and out-of-range camera keys', () => {
    const out = paths(
      withTracks([
        {
          kind: 'camera',
          keys: [
            { t: 0, position: [0, 0, 0], target: [0, 0, 1] },
            { t: 3, position: [0, 0, 0], target: [0, 0, 1] },
            { t: 2, position: [0, 0, 0], target: [0, 0, 1] },
            { t: 9, position: [0, 0, 0], target: [0, 0, 1], fov: 400 },
          ],
        },
      ]),
    );
    expect(out).toMatch(/keys\[2\].*strictly increasing/);
    expect(out).toMatch(/keys\[3\].*after the cutscene duration/);
    expect(out).toMatch(/fov/);
  });

  it('finds bad duration, label and sources', () => {
    expect(paths(withTracks([], { durationSec: 0 }))).toMatch(/duration/);
    expect(paths(withTracks([], { label: 'documented', sources: [] }))).toMatch(/at least one source/);
    expect(paths(withTracks([], { sources: ['nope'] }))).toMatch(/unknown source/);
    expect(validateCutscene(withTracks([], { label: 'documented', sources: ['C1-001'] }), ctx)).toEqual([]);
  });

  it('finds unknown locale keys and overlapping subtitles', () => {
    const out = paths(
      withTracks([
        {
          kind: 'subtitles',
          items: [
            { t: 0, textKey: 'missing.key', speakerKey: null, durationMs: 2000, voice: false },
            { t: 1, textKey: 'cinematics.demo.line1', speakerKey: 'cinematics.demo.speaker', durationMs: 1000, voice: false },
            { t: 4.5, textKey: 'cinematics.demo.line1', speakerKey: null, durationMs: 1000, voice: false },
          ],
        },
        { kind: 'title', items: [{ t: 0, durationSec: 1, textKey: 'nope.title' }] },
      ]),
    );
    expect(out).toMatch(/unknown locale key "missing.key"/);
    expect(out).toMatch(/subtitle overlaps/);
    expect(out).toMatch(/after the cutscene duration/);
    expect(out).toMatch(/nope.title/);
  });

  it('finds overlapping fades, bad audio items and empty event names', () => {
    const out = paths(
      withTracks([
        {
          kind: 'fade',
          items: [
            { t: 0, durationSec: 2, color: 'black', direction: 'out' },
            { t: 1, durationSec: 1, color: 'black', direction: 'in' },
          ],
        },
        { kind: 'audio', items: [{ t: 0 }, { t: 1, cue: 'a', mood: 'calm' }] },
        { kind: 'events', items: [{ t: 0, name: '' }] },
      ]),
    );
    expect(out).toMatch(/fade overlaps/);
    expect(out).toMatch(/exactly one of cue or mood/);
    expect(out).toMatch(/event name is empty/);
  });
});
