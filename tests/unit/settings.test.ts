import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { DEFAULT_SETTINGS, sanitizeSettings, SettingsManager } from '../../src/core/settings';
import { MemoryStore } from '../../src/core/save/stores';

describe('sanitizeSettings', () => {
  it('returns defaults for garbage', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS);
  });

  it('fixes fields one by one and clamps numbers', () => {
    const s = sanitizeSettings({
      graphics: { mode: 'custom', preset: 'mega', custom: { resolutionScale: 9, fpsCap: 45, shadows: 'ultra' } },
      audio: { master: -3, music: 0.2 },
      accessibility: { subtitleSize: 'xlarge' },
    });
    expect(s.graphics.mode).toBe('custom');
    expect(s.graphics.preset).toBe(DEFAULT_SETTINGS.graphics.preset);
    expect(s.graphics.custom.resolutionScale).toBe(1);
    expect(s.graphics.custom.fpsCap).toBe(60);
    expect(s.graphics.custom.shadows).toBe('ultra');
    expect(s.audio.master).toBe(0);
    expect(s.audio.music).toBe(0.2);
    expect(s.accessibility.subtitleSize).toBe('xlarge');
  });

  it('keeps native resolution (0) and motion blur off by default', () => {
    expect(sanitizeSettings({ graphics: { custom: { resolutionScale: 0 } } }).graphics.custom.resolutionScale).toBe(0);
    expect(DEFAULT_SETTINGS.graphics.custom.motionBlur).toBe(false);
  });
});

describe('SettingsManager', () => {
  it('saves every change and reloads it', () => {
    const store = new MemoryStore();
    const bus = new EventBus<GameEvents>();
    const keys: string[] = [];
    bus.on('settings:changed', ({ key }) => keys.push(key));
    const a = new SettingsManager(bus, store);
    a.update('audio', { music: 0.1 });
    a.update('accessibility', { reducedMotion: true });
    expect(keys).toEqual(['audio', 'accessibility']);
    const b = new SettingsManager(bus, store);
    expect(b.value.audio.music).toBe(0.1);
    expect(b.value.accessibility.reducedMotion).toBe(true);
  });

  it('survives a throwing store', () => {
    const bus = new EventBus<GameEvents>();
    const failed: string[] = [];
    bus.on('save:failed', ({ slot }) => failed.push(slot));
    const store = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => undefined, keys: () => [] };
    const m = new SettingsManager(bus, store);
    expect(m.value).toEqual(DEFAULT_SETTINGS);
    m.update('audio', { sfx: 0.5 });
    expect(m.value.audio.sfx).toBe(0.5);
    expect(failed).toEqual(['settings']);
  });
});
