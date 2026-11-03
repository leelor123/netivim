import type { CutsceneDefinition, CutsceneProblem, EasingName, ValidationContext } from './types';

const LABELS = ['documented', 'reconstructed', 'composite'];
const EASINGS: readonly string[] = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'smoothstep', 'hold'] satisfies EasingName[];
const MOODS = ['calm', 'tense', 'reflective', 'hopeful'];
const FADE_COLORS = ['black', 'sepia'];
const SOURCE_SHAPE = /^(C\d+|P)-\d{3}$/;
const ID_SHAPE = /^[a-z0-9]+([.-][a-z0-9]+)*$/;
const EPS = 1e-9;

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function vec3Ok(v: unknown): boolean {
  return Array.isArray(v) && v.length === 3 && v.every(finite);
}

/**
 * Checks a cutscene definition: monotonic times, everything inside the duration, known locale
 * keys, label and sources, non-overlapping subtitles / fades / title cards. Returns every
 * problem found (empty array = valid) so content tests can print them all at once.
 */
export function validateCutscene(def: CutsceneDefinition, ctx: ValidationContext): CutsceneProblem[] {
  const out: CutsceneProblem[] = [];
  const bad = (path: string, message: string): void => {
    out.push({ path, message });
  };
  const dur = def.durationSec;
  const key = (path: string, k: unknown): void => {
    if (typeof k !== 'string' || k === '') bad(path, 'locale key is empty');
    else if (!ctx.hasKey(k)) bad(path, 'unknown locale key "' + k + '"');
  };
  const time = (path: string, t: unknown, len = 0): boolean => {
    if (!finite(t)) {
      bad(path, 'time is not a finite number');
      return false;
    }
    if (t < 0) bad(path, 'time ' + String(t) + ' is negative');
    else if (t + len > dur + EPS) bad(path, 'ends at ' + String(t + len) + 's, after the cutscene duration ' + String(dur) + 's');
    return true;
  };
  const sorted = (path: string, times: readonly number[], strict: boolean): void => {
    for (let i = 1; i < times.length; i++) {
      const prev = times[i - 1] as number;
      const cur = times[i] as number;
      if (cur < prev - EPS || (strict && cur <= prev + EPS)) bad(path + '[' + String(i) + ']', 'times must be ' + (strict ? 'strictly increasing' : 'non-decreasing'));
    }
  };

  if (typeof def.id !== 'string' || !ID_SHAPE.test(def.id)) bad('id', 'id must be lowercase dot/kebab case');
  if (!finite(dur) || dur <= 0) bad('durationSec', 'duration must be a positive number');
  if (!LABELS.includes(def.label)) bad('label', 'label must be documented, reconstructed or composite');
  if (def.label === 'documented' && def.sources.length === 0) bad('sources', 'documented content needs at least one source');
  def.sources.forEach((s, i) => {
    const ok = ctx.isKnownSource ? ctx.isKnownSource(s) : SOURCE_SHAPE.test(s);
    if (!ok) bad('sources[' + String(i) + ']', 'unknown source id "' + s + '"');
  });
  if (!finite(dur) || dur <= 0) return out;

  const seen = new Set<string>();
  def.tracks.forEach((track, ti) => {
    const base = 'tracks[' + String(ti) + '](' + track.kind + ')';
    if (track.kind !== 'letterbox' && track.kind !== 'events' && track.kind !== 'audio' && seen.has(track.kind) && track.kind !== 'subtitles') {
      bad(base, 'more than one ' + track.kind + ' track');
    }
    seen.add(track.kind);
    switch (track.kind) {
      case 'camera': {
        if (track.keys.length === 0) bad(base, 'camera track has no keys');
        const times: number[] = [];
        track.keys.forEach((k, i) => {
          const p = base + '.keys[' + String(i) + ']';
          if (time(p, k.t)) times.push(k.t);
          if (!vec3Ok(k.position)) bad(p + '.position', 'position must be 3 finite numbers');
          if (!vec3Ok(k.target)) bad(p + '.target', 'target must be 3 finite numbers');
          if (k.fov !== undefined && (!finite(k.fov) || k.fov < 5 || k.fov > 120)) bad(p + '.fov', 'fov must be between 5 and 120 degrees');
          if (k.easing !== undefined && !EASINGS.includes(k.easing)) bad(p + '.easing', 'unknown easing "' + String(k.easing) + '"');
          if (k.shake !== undefined && (!finite(k.shake) || k.shake < 0)) bad(p + '.shake', 'shake must be >= 0');
        });
        sorted(base + '.keys', times, true);
        break;
      }
      case 'dof': {
        const times: number[] = [];
        track.keys.forEach((k, i) => {
          const p = base + '.keys[' + String(i) + ']';
          if (time(p, k.t)) times.push(k.t);
          if (!finite(k.focusDistance) || k.focusDistance <= 0) bad(p + '.focusDistance', 'focusDistance must be > 0');
          if (!finite(k.aperture) || k.aperture < 0) bad(p + '.aperture', 'aperture must be >= 0');
          if (k.easing !== undefined && !EASINGS.includes(k.easing)) bad(p + '.easing', 'unknown easing "' + String(k.easing) + '"');
        });
        sorted(base + '.keys', times, true);
        break;
      }
      case 'fade': {
        const times: number[] = [];
        let prevEnd = 0;
        track.items.forEach((f, i) => {
          const p = base + '.items[' + String(i) + ']';
          if (!finite(f.durationSec) || f.durationSec <= 0) bad(p + '.durationSec', 'duration must be > 0');
          else if (time(p, f.t, f.durationSec)) {
            times.push(f.t);
            if (f.t < prevEnd - EPS) bad(p, 'fade overlaps the previous fade');
            prevEnd = f.t + f.durationSec;
          }
          if (!FADE_COLORS.includes(f.color)) bad(p + '.color', 'color must be black or sepia');
          if (f.direction !== 'in' && f.direction !== 'out') bad(p + '.direction', 'direction must be in or out');
        });
        sorted(base + '.items', times, false);
        break;
      }
      case 'subtitles': {
        const times: number[] = [];
        let prevEndMs = 0;
        track.items.forEach((s, i) => {
          const p = base + '.items[' + String(i) + ']';
          key(p + '.textKey', s.textKey);
          if (s.speakerKey !== null) key(p + '.speakerKey', s.speakerKey);
          if (!finite(s.durationMs) || s.durationMs <= 0) {
            bad(p + '.durationMs', 'duration must be > 0');
            return;
          }
          if (!time(p, s.t, s.durationMs / 1000)) return;
          times.push(s.t);
          if (s.t * 1000 < prevEndMs - 1e-6) bad(p, 'subtitle overlaps the previous one');
          prevEndMs = s.t * 1000 + s.durationMs;
        });
        sorted(base + '.items', times, false);
        break;
      }
      case 'audio': {
        const times: number[] = [];
        track.items.forEach((a, i) => {
          const p = base + '.items[' + String(i) + ']';
          if (time(p, a.t)) times.push(a.t);
          const hasCue = a.cue !== undefined;
          const hasMood = a.mood !== undefined;
          if (hasCue === hasMood) bad(p, 'set exactly one of cue or mood');
          if (hasCue && (typeof a.cue !== 'string' || a.cue === '')) bad(p + '.cue', 'cue must be a non-empty string');
          if (hasMood && !MOODS.includes(a.mood as string)) bad(p + '.mood', 'unknown mood');
          if (a.intensity !== undefined && (!finite(a.intensity) || a.intensity < 0 || a.intensity > 1)) bad(p + '.intensity', 'intensity must be 0..1');
          if (a.era !== undefined && (!Number.isInteger(a.era) || a.era < 0)) bad(p + '.era', 'era must be a non-negative integer');
        });
        sorted(base + '.items', times, false);
        break;
      }
      case 'letterbox': {
        const times: number[] = [];
        track.items.forEach((l, i) => {
          if (time(base + '.items[' + String(i) + ']', l.t)) times.push(l.t);
        });
        sorted(base + '.items', times, false);
        break;
      }
      case 'title': {
        const times: number[] = [];
        let prevEnd = 0;
        track.items.forEach((c, i) => {
          const p = base + '.items[' + String(i) + ']';
          key(p + '.textKey', c.textKey);
          if (!finite(c.durationSec) || c.durationSec <= 0) {
            bad(p + '.durationSec', 'duration must be > 0');
            return;
          }
          if (!time(p, c.t, c.durationSec)) return;
          times.push(c.t);
          if (c.t < prevEnd - EPS) bad(p, 'title card overlaps the previous one');
          prevEnd = c.t + c.durationSec;
        });
        sorted(base + '.items', times, false);
        break;
      }
      case 'events': {
        const times: number[] = [];
        track.items.forEach((e, i) => {
          const p = base + '.items[' + String(i) + ']';
          if (time(p, e.t)) times.push(e.t);
          if (typeof e.name !== 'string' || e.name === '') bad(p + '.name', 'event name is empty');
        });
        sorted(base + '.items', times, false);
        break;
      }
    }
  });
  return out;
}
