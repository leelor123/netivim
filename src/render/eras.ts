/**
 * Per-era color grading palettes (data, applied by the grading pass in display space after tone
 * mapping). Values are gentle on purpose: the low-poly palette carries the look; grading only
 * tells the eras apart (warm archival sepia, austere fifties, saturated sixties film, ...).
 *
 * lift/gamma/gain follow the ASC-CDL-like model: out = pow(c * gain + lift * (1 - c), 1 / gamma).
 */
export type EraId =
  | 'archive'
  | 'ottoman'
  | 'mandate'
  | 'independence'
  | 'austerity'
  | 'sixties'
  | 'seventies'
  | 'eighties'
  | 'nineties'
  | 'modern';

export type Rgb = readonly [number, number, number];

export interface EraGrade {
  readonly lift: Rgb;
  readonly gamma: Rgb;
  readonly gain: Rgb;
  readonly saturation: number;
  readonly contrast: number;
  /** 0 = none; darkening at the frame corners. */
  readonly vignette: number;
}

export const ERA_GRADES: Readonly<Record<EraId, EraGrade>> = {
  // The framing device (the archive at night / title): warm, slightly filmic.
  archive: { lift: [0.008, 0.004, 0.006], gamma: [1.0, 1.0, 0.98], gain: [1.04, 1.0, 0.96], saturation: 1.08, contrast: 1.12, vignette: 0.3 },
  // 1890s: warm sepia cast. The kit palette is already washed (EraLook.saturation), so the grade
  // keeps saturation near 1 and adds contrast instead of greying the frame twice.
  ottoman: { lift: [0.022, 0.013, 0.0], gamma: [1.0, 1.0, 0.96], gain: [1.06, 1.0, 0.89], saturation: 0.98, contrast: 1.1, vignette: 0.3 },
  // 1930s-1947: warm dust and crisp midday contrast (the kit palette carries the dusty tone).
  mandate: { lift: [0.014, 0.009, 0.0], gamma: [1.0, 1.0, 0.97], gain: [1.05, 1.0, 0.92], saturation: 1.02, contrast: 1.09, vignette: 0.28 },
  // 1948: dry summer light, ochre highlights.
  independence: { lift: [0.015, 0.01, 0.0], gamma: [1.0, 0.99, 0.96], gain: [1.05, 1.0, 0.9], saturation: 0.92, contrast: 1.06, vignette: 0.3 },
  // 1949-1956 austerity: cool, grey, transit-camp winters.
  austerity: { lift: [0.0, 0.006, 0.016], gamma: [0.98, 1.0, 1.02], gain: [0.96, 0.99, 1.03], saturation: 0.78, contrast: 1.04, vignette: 0.3 },
  // 1967: saturated colour film.
  sixties: { lift: [0.006, 0.004, 0.0], gamma: [1.0, 1.0, 1.0], gain: [1.03, 1.01, 0.97], saturation: 1.14, contrast: 1.08, vignette: 0.24 },
  // 1973: seventies stock, green-amber cast.
  seventies: { lift: [0.01, 0.014, 0.0], gamma: [1.0, 1.02, 0.97], gain: [1.03, 1.02, 0.9], saturation: 0.95, contrast: 1.04, vignette: 0.3 },
  // 1980s: cooler shadows, magenta-leaning highlights.
  eighties: { lift: [0.004, 0.0, 0.014], gamma: [1.0, 0.99, 1.01], gain: [1.03, 0.98, 1.0], saturation: 1.0, contrast: 1.05, vignette: 0.26 },
  // 1990s-2000s: neutral video.
  nineties: { lift: [0.0, 0.0, 0.006], gamma: [1.0, 1.0, 1.0], gain: [1.0, 1.0, 1.0], saturation: 0.96, contrast: 1.03, vignette: 0.2 },
  // Today: clean and crisp, subtle teal shadows / warm highlights.
  modern: { lift: [0.0, 0.006, 0.012], gamma: [1.0, 1.0, 1.0], gain: [1.03, 1.0, 0.97], saturation: 1.04, contrast: 1.06, vignette: 0.18 },
};

export const DEFAULT_ERA: EraId = 'archive';
