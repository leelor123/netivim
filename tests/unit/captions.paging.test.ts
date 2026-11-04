import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { BotInput } from '../../src/gameplay/runtime/bot';
import { MissionHost } from '../../src/gameplay/runtime/missionHost';
import { defineLevel, type Level, type LevelContext } from '../../src/gameplay/types';
import { captionHoldMs, MIN_PAGE_MS, pageDurations, paginateCaption, planCaption } from '../../src/ui/captions';
import { SubtitleTimer } from '../../src/ui/subtitleTimer';
import { DEFAULT_WORLD_QUALITY } from '../../src/world/quality';

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** A 160-character line: at least 3 pages at the 46-char phone capacity. */
const LONG = 'אבגדה '.repeat(27).slice(0, 160).trim();

describe('caption page timing (no text is ever lost)', () => {
  it('fits a long line inside its duration when the pages can keep the 1 s floor', () => {
    const pages = paginateCaption(LONG, 46);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    const d = pageDurations(pages, 4500);
    expect(sum(d)).toBe(4500);
    for (const ms of d) expect(ms).toBeGreaterThanOrEqual(MIN_PAGE_MS);
    expect(captionHoldMs(d)).toBe(4500);
  });

  it('keeps longer pages on screen longer, still summing exactly to the duration', () => {
    const d = pageDurations(['aaaa', 'aaaaaaaaaaaa', 'aaaaaaa'], 7001);
    expect(sum(d)).toBe(7001);
    expect(d[1]).toBeGreaterThan(d[2] as number);
    expect(d[2]).toBeGreaterThan(d[0] as number);
  });

  it('when even the floor does not fit, gives every page the floor and asks for a longer hold', () => {
    const pages = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40), 'd'.repeat(40), 'e'.repeat(40)];
    const d = pageDurations(pages, 3000);
    expect(d).toEqual(pages.map(() => MIN_PAGE_MS));
    expect(captionHoldMs(d)).toBe(5 * MIN_PAGE_MS);
    expect(planCaption(pages.join(' '), 40, 3000).holdMs).toBeGreaterThan(3000);
  });

  it('persistent lines show every page: timed pages, then the last one stays', () => {
    const pages = paginateCaption(LONG, 46);
    const d = pageDurations(pages, 0);
    expect(d[d.length - 1]).toBe(0);
    for (const ms of d.slice(0, -1)) expect(ms).toBeGreaterThanOrEqual(MIN_PAGE_MS);
    expect(pageDurations(['a'], 0)).toEqual([0]);
    expect(pageDurations(['a'], -5)).toEqual([0]);
  });

  it('a short single-page line keeps its full duration and needs no extra hold', () => {
    const p = planCaption('שלום', 46, 2500);
    expect(p.pages).toEqual(['שלום']);
    expect(p.durations).toEqual([2500]);
    expect(p.holdMs).toBe(2500);
  });
});

/** Level with no world that hands its context out, so a test can call ctx.say(). */
function sayingHost(): { h: MissionHost; bus: EventBus<GameEvents>; ctx: LevelContext } {
  const box: { ctx: LevelContext | null } = { ctx: null };
  const def = defineLevel<'a', 'done'>({
    id: 'say',
    chapterId: 'test',
    missionId: 'say',
    mission: { id: 'say', chapterId: 'test', gameplayType: 'PZL', checkpoints: ['a'], machine: { initial: 'a', final: ['complete'], transitions: { a: { done: 'complete' }, failed: {}, complete: {} } } },
    objectives: [{ id: 'o', textKey: 'o', states: ['a'] }],
    failures: {},
    botScript: { a: [] },
    build(c) {
      box.ctx = c;
      const level: Level = {
        scene: { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), update: () => undefined, resize: () => undefined, dispose: () => undefined },
        update: () => undefined,
        enterCheckpoint: () => undefined,
        dispose: () => undefined,
      };
      return level;
    },
  });
  const bus = new EventBus<GameEvents>();
  const h = new MissionHost({
    def,
    bus,
    input: new BotInput(),
    difficulty: () => 'normal',
    headless: true,
    quality: DEFAULT_WORLD_QUALITY,
    reducedMotion: () => false,
    t: (k) => k,
    glyph: (a) => a,
    recordChoice: () => undefined,
    snapshot: null,
    hooks: { onFailed: () => undefined, onDecision: () => undefined, onPlan: () => undefined, onComplete: () => undefined },
  });
  h.start();
  if (!box.ctx) throw new Error('level not built');
  return { h, bus, ctx: box.ctx };
}

/**
 * Mirrors src/ui/subtitles.ts without the DOM: plans the pages, asks for a longer hold through
 * subtitle:extend, and pages on game time. Records every page that reached the screen.
 */
function captionPager(bus: EventBus<GameEvents>, texts: Record<string, string>, capacity: number) {
  const shown: string[] = [];
  const timer = new SubtitleTimer();
  let pages: string[] = [];
  let durations: number[] = [];
  let page = 0;
  const show = (): void => {
    shown.push(pages[page] ?? '');
    timer.start(durations[page] ?? 0);
  };
  bus.on('subtitle:show', ({ textKey, durationMs }) => {
    const plan = planCaption(texts[textKey] ?? textKey, capacity, durationMs);
    pages = plan.pages;
    durations = plan.durations;
    page = 0;
    if (plan.holdMs > durationMs) bus.emit('subtitle:extend', { textKey, durationMs: plan.holdMs });
    show();
  });
  return {
    shown,
    tick(dt: number): void {
      if (!timer.tick(dt)) return;
      if (page + 1 < pages.length) {
        page += 1;
        show();
      }
    },
  };
}

const DT = 1 / 60;

describe('mission host waits for every caption page', () => {
  it('holds the next line until all pages of a too-long line were shown', () => {
    const { h, bus, ctx } = sayingHost();
    const five = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40), 'd'.repeat(40), 'e'.repeat(40)];
    const pager = captionPager(bus, { long: five.join(' '), next: 'next line' }, 40);
    const shows: { key: string; at: number }[] = [];
    let time = 0;
    bus.on('subtitle:show', (e) => shows.push({ key: e.textKey, at: time }));
    ctx.say([
      { textKey: 'long', speakerKey: null, durationMs: 3000 },
      { textKey: 'next', speakerKey: null, durationMs: 2000 },
    ]);
    for (let i = 0; i < 60 * 10; i++) {
      time += DT;
      h.update(DT);
      pager.tick(DT);
    }
    expect(pager.shown).toEqual([...five, 'next line']);
    const next = shows.find((s) => s.key === 'next');
    expect(next?.at).toBeGreaterThanOrEqual(5 - 2 * DT);
  });

  it('a line that fits keeps the original queue timing', () => {
    const { h, bus, ctx } = sayingHost();
    captionPager(bus, { a: 'short', b: 'short too' }, 46);
    const shows: { key: string; at: number }[] = [];
    let time = 0;
    bus.on('subtitle:show', (e) => shows.push({ key: e.textKey, at: time }));
    ctx.say([
      { textKey: 'a', speakerKey: null, durationMs: 2000 },
      { textKey: 'b', speakerKey: null, durationMs: 2000 },
    ]);
    for (let i = 0; i < 60 * 5; i++) {
      time += DT;
      h.update(DT);
    }
    expect(shows.map((s) => s.key)).toEqual(['a', 'b']);
    expect(shows[1]?.at).toBeCloseTo(2, 1);
  });

  it('ignores a hold request for a line that is no longer current', () => {
    const { h, bus, ctx } = sayingHost();
    const shows: string[] = [];
    bus.on('subtitle:show', (e) => shows.push(e.textKey));
    ctx.say([
      { textKey: 'a', speakerKey: null, durationMs: 1000 },
      { textKey: 'b', speakerKey: null, durationMs: 1000 },
      { textKey: 'c', speakerKey: null, durationMs: 1000 },
    ]);
    for (let i = 0; i < 70; i++) h.update(DT);
    expect(shows).toEqual(['a', 'b']);
    bus.emit('subtitle:extend', { textKey: 'a', durationMs: 60_000 });
    for (let i = 0; i < 70; i++) h.update(DT);
    expect(shows).toEqual(['a', 'b', 'c']);
  });
});
