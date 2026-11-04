import { describe, expect, it } from 'vitest';
import type { InputDevice } from '../../src/core/input/types';
import { createI18n } from '../../src/core/i18n';
import { HEBREW } from '../../src/locales';
import { timelineHint, timelineHintKey, timelineInput } from '../../src/features/timeline/timelineScreen';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';

/** CQA-3: the timeline hint follows the active input device; no touch words on a controller. */
const TOUCH_WORDS = /אצבע|גררו|גרור|הקישו|הקשה|ג׳ויסטיק|החלקה|מסך המגע|פקדי מגע/;
const DEVICES: readonly InputDevice[] = ['gamepad', 'keyboard', 'touch'];

describe('timeline hint per input device (CQA-3)', () => {
  const t = createI18n('he', HEBREW).t;

  it('has a Hebrew line for every device, plus the reading-direction note', () => {
    for (const d of DEVICES) expect(Object.hasOwn(HEBREW, timelineHintKey(d)), d).toBe(true);
    expect(Object.hasOwn(HEBREW, 'timeline.hint.order')).toBe(true);
  });

  it('names the controls in hand and never touch gestures on a controller or keyboard', () => {
    expect(timelineHint(t, 'gamepad')).toContain('סטיק');
    expect(timelineHint(t, 'gamepad')).not.toMatch(TOUCH_WORDS);
    expect(timelineHint(t, 'keyboard')).toContain('מקלדת');
    expect(timelineHint(t, 'keyboard')).not.toMatch(TOUCH_WORDS);
    expect(timelineHint(t, 'touch')).toContain('אצבע');
    expect(timelineHint(t, 'touch')).not.toContain('סטיק');
    for (const d of DEVICES) expect(timelineHint(t, d)).toContain('מימין לשמאל');
  });

  it('uses no bidi controls except isolates', () => {
    for (const d of DEVICES) expect(timelineHint(t, d)).not.toMatch(/[‎‏‪-‮]/);
  });

  it('reads the device from the game input and re-renders on input:device-changed', () => {
    const bus = new EventBus<GameEvents>();
    const input = { device: 'touch' as InputDevice };
    const ti = timelineInput({ input, bus } as unknown as Parameters<typeof timelineInput>[0]);
    let calls = 0;
    const off = ti.onDeviceChange(() => calls++);
    input.device = 'gamepad';
    bus.emit('input:device-changed', { device: 'gamepad', family: 'xbox' });
    expect(calls).toBe(1);
    expect(ti.device()).toBe('gamepad');
    off();
    bus.emit('input:device-changed', { device: 'touch', family: null });
    expect(calls).toBe(1);
  });
});
