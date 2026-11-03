import type { CutsceneDefinition } from './types';

export const DEMO_CUTSCENE_ID = 'cinematics.demo';

/** Short pipeline check on the title scene: camera glide, title card, one subtitle. */
export const DEMO_CUTSCENE: CutsceneDefinition = {
  id: DEMO_CUTSCENE_ID,
  durationSec: 6,
  label: 'composite',
  sources: [],
  tracks: [
    {
      kind: 'camera',
      path: 'catmull-rom',
      keys: [
        { t: 0, position: [0, 16, 50], target: [0, 2, -20], fov: 42, easing: 'smoothstep' },
        { t: 3, position: [14, 12, 36], target: [0, 3, -20], fov: 38, easing: 'smoothstep' },
        { t: 6, position: [24, 9, 22], target: [0, 4, -20], fov: 34 },
      ],
    },
    { kind: 'letterbox', items: [{ t: 0, on: true }] },
    { kind: 'fade', items: [{ t: 0, durationSec: 0.8, color: 'black', direction: 'in' }, { t: 5.2, durationSec: 0.8, color: 'black', direction: 'out' }] },
    { kind: 'title', items: [{ t: 0.8, durationSec: 3, textKey: 'cinematics.demo.place' }] },
    { kind: 'subtitles', items: [{ t: 2, textKey: 'cinematics.demo.line1', speakerKey: 'cinematics.demo.speaker', durationMs: 3000, voice: false }] },
    { kind: 'audio', items: [{ t: 0, mood: 'reflective', era: 0 }] },
    { kind: 'events', items: [{ t: 3, name: 'demo-midpoint' }] },
  ],
};
