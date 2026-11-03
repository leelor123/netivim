// Bundled open-licensed fonts (SIL OFL 1.1, see src/ui/fonts/LICENSE-*.txt). Only the weights and
// subsets the UI uses: Heebo 400/700 (body) and Frank Ruhl Libre 700 (display), Hebrew + Latin.
import heeboHe400 from '@fontsource/heebo/files/heebo-hebrew-400-normal.woff2?url';
import heeboLa400 from '@fontsource/heebo/files/heebo-latin-400-normal.woff2?url';
import heeboHe700 from '@fontsource/heebo/files/heebo-hebrew-700-normal.woff2?url';
import heeboLa700 from '@fontsource/heebo/files/heebo-latin-700-normal.woff2?url';
import frankHe700 from '@fontsource/frank-ruhl-libre/files/frank-ruhl-libre-hebrew-700-normal.woff2?url';
import frankLa700 from '@fontsource/frank-ruhl-libre/files/frank-ruhl-libre-latin-700-normal.woff2?url';

const HEBREW = 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F';
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

const FACES: readonly (readonly [family: string, url: string, weight: string, range: string])[] = [
  ['Heebo', heeboHe400, '400', HEBREW],
  ['Heebo', heeboLa400, '400', LATIN],
  ['Heebo', heeboHe700, '700', HEBREW],
  ['Heebo', heeboLa700, '700', LATIN],
  ['Frank Ruhl Libre', frankHe700, '700', HEBREW],
  ['Frank Ruhl Libre', frankLa700, '700', LATIN],
];

/** Registers the bundled fonts with the document (loaded locally; never from a network CDN). */
export function installFonts(): void {
  if (typeof FontFace === 'undefined' || !document.fonts) return;
  for (const [family, url, weight, unicodeRange] of FACES) {
    const face = new FontFace(family, 'url(' + url + ') format("woff2")', { weight, unicodeRange, display: 'swap' });
    document.fonts.add(face);
    // A failed font load just falls back to the system font.
    face.load().catch(() => undefined);
  }
}
