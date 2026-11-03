import type { CutsceneDefinition } from '../../cinematics/types';

/**
 * Prologue chapter cutscene, 75 s: the archive at night, a document starts to glow, a sepia
 * transition into Jaffa in the 1890s. Archive framing is FICTIONAL; the Jaffa shots are
 * RECONSTRUCTED (no real person speaks). The level builder places the camera path in world units.
 */
export const CH00_OPENING_ID = 'ch00.opening';

export const CH00_OPENING: CutsceneDefinition = {
  id: CH00_OPENING_ID,
  durationSec: 75,
  label: 'reconstructed',
  sources: ['P-055'],
  tracks: [
    {
      kind: 'camera',
      path: 'catmull-rom',
      keys: [
        { t: 0, position: [0, 1.7, 7], target: [0, 1.2, 0], fov: 50, easing: 'smoothstep' },
        { t: 12, position: [2.5, 1.5, 4], target: [0, 1.1, 0], fov: 44, easing: 'smoothstep' },
        { t: 24, position: [1.2, 1.4, 2.2], target: [0, 1.0, 0], fov: 38, easing: 'smoothstep' },
        { t: 36, position: [0.4, 1.2, 1.2], target: [0, 1.0, 0], fov: 32, easing: 'easeIn' },
        { t: 42, position: [-30, 14, 70], target: [0, 4, 0], fov: 55, easing: 'smoothstep' },
        { t: 56, position: [-12, 9, 40], target: [0, 3, 0], fov: 48, easing: 'smoothstep' },
        { t: 68, position: [6, 3.2, 16], target: [0, 2.5, 0], fov: 42, easing: 'smoothstep' },
        { t: 75, position: [8, 2.6, 12], target: [0, 2.2, 0], fov: 40 },
      ],
    },
    {
      kind: 'dof',
      keys: [
        { t: 0, focusDistance: 7, aperture: 0.4 },
        { t: 24, focusDistance: 2.2, aperture: 0.8, easing: 'smoothstep' },
        { t: 36, focusDistance: 1.2, aperture: 1.0 },
        { t: 42, focusDistance: 70, aperture: 0.1 },
        { t: 68, focusDistance: 16, aperture: 0.3 },
      ],
    },
    { kind: 'letterbox', items: [{ t: 0, on: true }] },
    {
      kind: 'fade',
      items: [
        { t: 0, durationSec: 1.5, color: 'black', direction: 'in' },
        { t: 37, durationSec: 2, color: 'sepia', direction: 'out' },
        { t: 40, durationSec: 2, color: 'sepia', direction: 'in' },
        { t: 71, durationSec: 4, color: 'black', direction: 'out' },
      ],
    },
    {
      kind: 'title',
      items: [
        { t: 2, durationSec: 3.5, textKey: 'ch00.cut.title.archive' },
        { t: 43, durationSec: 5, textKey: 'ch00.cut.title.jaffa' },
      ],
    },
    {
      kind: 'subtitles',
      items: [
        { t: 6, textKey: 'ch00.cut.line.1', speakerKey: 'ch00.speaker.noa', durationMs: 5000, voice: true },
        { t: 11.5, textKey: 'ch00.cut.line.2', speakerKey: 'ch00.speaker.noa', durationMs: 5500, voice: true },
        { t: 17.5, textKey: 'ch00.cut.line.3', speakerKey: 'ch00.speaker.samir', durationMs: 5000, voice: true },
        { t: 23, textKey: 'ch00.cut.line.4', speakerKey: 'ch00.speaker.samir', durationMs: 5500, voice: true },
        { t: 29, textKey: 'ch00.cut.line.5', speakerKey: 'ch00.speaker.noa', durationMs: 4000, voice: true },
        { t: 33, textKey: 'ch00.cut.line.6', speakerKey: 'ch00.speaker.samir', durationMs: 3500, voice: true },
        { t: 49, textKey: 'ch00.cut.line.7', speakerKey: 'ch00.speaker.narrator', durationMs: 5000, voice: true },
        { t: 54.5, textKey: 'ch00.cut.line.8', speakerKey: 'ch00.speaker.narrator', durationMs: 6000, voice: true },
        { t: 61, textKey: 'ch00.cut.line.9', speakerKey: 'ch00.speaker.narrator', durationMs: 6000, voice: true },
        { t: 67.5, textKey: 'ch00.cut.line.10', speakerKey: 'ch00.speaker.noa', durationMs: 3500, voice: true },
      ],
    },
    {
      kind: 'audio',
      items: [
        { t: 0, mood: 'reflective', era: 0 },
        { t: 24, cue: 'document-hum', intensity: 0.4 },
        { t: 37, cue: 'sepia-whoosh', intensity: 0.6 },
        { t: 42, mood: 'calm', era: 0 },
        { t: 60, mood: 'hopeful', era: 0 },
      ],
    },
    {
      kind: 'events',
      items: [
        { t: 24, name: 'document-glow' },
        { t: 37, name: 'enter-document' },
        { t: 42, name: 'jaffa-port-reveal' },
      ],
    },
  ],
};
