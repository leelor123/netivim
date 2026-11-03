import type { CutsceneDefinition } from '../../cinematics/types';

/**
 * Chapter 1 cutscene (90 s): dusk over a new tower-and-stockade settlement, then November 1947
 * and the radio reading the vote count. RECONSTRUCTED: the settlement and the announcer are
 * generic, no real person speaks, and all violence stays off-screen.
 * The scene script reacts to the events: "stockade-dusk", "searchlight-on", "radio-glow",
 * "village-window" (a lit window in a nearby Arab village), "radio-count".
 */
export const CH01_STOCKADE_AND_RADIO: CutsceneDefinition = {
  id: 'ch01.stockade-and-radio',
  durationSec: 90,
  label: 'reconstructed',
  sources: ['C1-065', 'C1-060', 'C1-101'],
  tracks: [
    {
      kind: 'camera',
      path: 'catmull-rom',
      keys: [
        { t: 0, position: [-30, 14, 40], target: [0, 4, 0], fov: 50 },
        { t: 14, position: [-12, 8, 22], target: [0, 6, 0], fov: 46, easing: 'easeInOut' },
        { t: 28, position: [6, 12, 30], target: [0, 5, 0], fov: 52, easing: 'easeInOut' },
        { t: 40, position: [-40, 22, 60], target: [20, 2, -30], fov: 55, easing: 'easeInOut' },
        { t: 50, position: [0, 3, 6], target: [0, 2.4, 0], fov: 38, easing: 'smoothstep' },
        { t: 70, position: [0, 2.6, 4], target: [0, 2.4, 0], fov: 34, easing: 'easeInOut' },
        { t: 90, position: [0, 3.5, 9], target: [0, 2.2, 0], fov: 40, easing: 'easeOut' },
      ],
    },
    {
      kind: 'dof',
      keys: [
        { t: 0, focusDistance: 50, aperture: 0.2 },
        { t: 14, focusDistance: 22, aperture: 0.4 },
        { t: 50, focusDistance: 6, aperture: 0.8 },
        { t: 90, focusDistance: 9, aperture: 0.5 },
      ],
    },
    {
      kind: 'fade',
      items: [
        { t: 0, durationSec: 2, color: 'black', direction: 'in' },
        { t: 41, durationSec: 2, color: 'black', direction: 'out' },
        { t: 43, durationSec: 2, color: 'black', direction: 'in' },
        { t: 87, durationSec: 3, color: 'black', direction: 'out' },
      ],
    },
    { kind: 'letterbox', items: [{ t: 0, on: true }] },
    {
      kind: 'title',
      items: [
        { t: 2, durationSec: 5, textKey: 'ch01.cut.place1' },
        { t: 44, durationSec: 5, textKey: 'ch01.cut.place2' },
      ],
    },
    {
      kind: 'subtitles',
      items: [
        { t: 8, textKey: 'ch01.cut.s1', speakerKey: 'ch01.speaker.narrator', durationMs: 7000, voice: true },
        { t: 22, textKey: 'ch01.cut.s2', speakerKey: 'ch01.speaker.narrator', durationMs: 8000, voice: true },
        { t: 34, textKey: 'ch01.cut.s3', speakerKey: 'ch01.speaker.narrator', durationMs: 5000, voice: true },
        { t: 52, textKey: 'ch01.cut.s4', speakerKey: 'ch01.speaker.radio', durationMs: 9000, voice: true },
        { t: 66, textKey: 'ch01.cut.s5', speakerKey: 'ch01.speaker.narrator', durationMs: 8000, voice: true },
        { t: 78, textKey: 'ch01.cut.s6', speakerKey: 'ch01.speaker.narrator', durationMs: 8000, voice: true },
      ],
    },
    {
      kind: 'audio',
      items: [
        { t: 0, mood: 'calm' },
        { t: 34, mood: 'reflective' },
        { t: 52, mood: 'tense', intensity: 0.4 },
        { t: 66, mood: 'reflective' },
      ],
    },
    {
      kind: 'events',
      items: [
        { t: 4, name: 'stockade-dusk' },
        { t: 16, name: 'searchlight-on' },
        { t: 24, name: 'village-window' },
        { t: 46, name: 'radio-glow' },
        { t: 52, name: 'radio-count' },
      ],
    },
  ],
};

export const CH01_CUTSCENES: readonly CutsceneDefinition[] = [CH01_STOCKADE_AND_RADIO];
