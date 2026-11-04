import type { ContentLabel } from '../../content/schema';
import type { LensId } from './lenses';

/**
 * City and settlement markers per era. A marker appears once the timeline year reaches fromYear,
 * and only when a research register supports it (sources). Coordinates are approximate (about
 * 0.01 degrees, cross-check GEO-002). Names and notes are Hebrew locale keys.
 */
export interface MapMarker {
  readonly id: string;
  readonly nameKey: string;
  readonly lat: number;
  readonly lon: number;
  /** First year the sources document the place in the role shown. */
  readonly fromYear: number;
  readonly kind: 'city' | 'settlement' | 'site';
  readonly label: ContentLabel;
  readonly sources: readonly string[];
  /** Per-lens caption for this place (only where the research gives that narrative). */
  readonly notes?: Readonly<Partial<Record<LensId, { readonly textKey: string; readonly sources: readonly string[] }>>>;
}

const place = (id: string): string => 'timeline.place.' + id;
const note = (id: string, lens: LensId): string => 'timeline.note.' + id + '.' + lens;

export const MARKERS: readonly MapMarker[] = [
  { id: 'jerusalem', nameKey: place('jerusalem'), lat: 31.78, lon: 35.22, fromYear: 1850, kind: 'city', label: 'documented', sources: ['P-007', 'P-019'] },
  { id: 'jaffa', nameKey: place('jaffa'), lat: 32.05, lon: 34.75, fromYear: 1850, kind: 'city', label: 'documented', sources: ['P-007', 'P-019'] },
  { id: 'hebron', nameKey: place('hebron'), lat: 31.53, lon: 35.1, fromYear: 1850, kind: 'city', label: 'documented', sources: ['P-007'] },
  { id: 'tiberias', nameKey: place('tiberias'), lat: 32.79, lon: 35.53, fromYear: 1850, kind: 'city', label: 'documented', sources: ['P-007'] },
  { id: 'safed', nameKey: place('safed'), lat: 32.96, lon: 35.5, fromYear: 1850, kind: 'city', label: 'documented', sources: ['P-007'] },
  { id: 'haifa', nameKey: place('haifa'), lat: 32.82, lon: 34.99, fromYear: 1850, kind: 'city', label: 'documented', sources: ['P-007', 'P-010'] },
  { id: 'petah-tikva', nameKey: place('petah-tikva'), lat: 32.09, lon: 34.89, fromYear: 1878, kind: 'settlement', label: 'documented', sources: ['P-015'] },
  { id: 'rishon', nameKey: place('rishon'), lat: 31.96, lon: 34.8, fromYear: 1882, kind: 'settlement', label: 'documented', sources: ['P-016', 'P-001'] },
  { id: 'beersheba', nameKey: place('beersheba'), lat: 31.25, lon: 34.79, fromYear: 1899, kind: 'city', label: 'documented', sources: ['P-037', 'P-017'] },
  { id: 'tel-amal', nameKey: place('tel-amal'), lat: 32.5, lon: 35.43, fromYear: 1936, kind: 'settlement', label: 'documented', sources: ['C1-017'] },
  {
    id: 'tel-aviv',
    nameKey: place('tel-aviv'),
    lat: 32.064,
    lon: 34.774,
    fromYear: 1948,
    kind: 'site',
    label: 'documented',
    sources: ['C2-101'],
    notes: {
      independence: { textKey: note('tel-aviv', 'independence'), sources: ['C2-104', 'C2-101'] },
      nakba: { textKey: note('tel-aviv', 'nakba'), sources: ['C2-105'] },
    },
  },
  {
    id: 'kfar-etzion',
    nameKey: place('kfar-etzion'),
    lat: 31.65,
    lon: 35.11,
    fromYear: 1948,
    kind: 'settlement',
    label: 'documented',
    sources: ['C2-128'],
    notes: { independence: { textKey: note('kfar-etzion', 'independence'), sources: ['C2-128'] } },
  },
  {
    id: 'deir-yassin',
    nameKey: place('deir-yassin'),
    lat: 31.79,
    lon: 35.18,
    fromYear: 1948,
    kind: 'site',
    label: 'documented',
    sources: ['C2-110', 'C2-108'],
    notes: {
      independence: { textKey: note('deir-yassin', 'independence'), sources: ['C2-110'] },
      nakba: { textKey: note('deir-yassin', 'nakba'), sources: ['C2-108', 'C2-109'] },
    },
  },
  { id: 'mount-scopus', nameKey: place('mount-scopus'), lat: 31.795, lon: 35.243, fromYear: 1948, kind: 'site', label: 'documented', sources: ['C2-115', 'C2-116'] },
  { id: 'latrun', nameKey: place('latrun'), lat: 31.84, lon: 34.98, fromYear: 1948, kind: 'site', label: 'documented', sources: ['C2-118', 'C2-113'] },
  {
    id: 'negba',
    nameKey: place('negba'),
    lat: 31.66,
    lon: 34.64,
    fromYear: 1948,
    kind: 'settlement',
    label: 'documented',
    sources: ['C2-119', 'C2-130'],
    notes: { independence: { textKey: note('negba', 'independence'), sources: ['C2-119', 'C2-130'] } },
  },
  {
    id: 'lod-ramle',
    nameKey: place('lod-ramle'),
    lat: 31.94,
    lon: 34.89,
    fromYear: 1948,
    kind: 'city',
    label: 'documented',
    sources: ['C2-111'],
    notes: {
      independence: { textKey: note('lod-ramle', 'independence'), sources: ['C2-112', 'C2-105', 'C2-111'] },
      nakba: { textKey: note('lod-ramle', 'nakba'), sources: ['C2-108', 'C2-111', 'C2-112'] },
    },
  },
  { id: 'eilat', nameKey: place('eilat'), lat: 29.55, lon: 34.95, fromYear: 1949, kind: 'city', label: 'documented', sources: ['C2-126', 'C2-127'] },
];

export function markersVisibleAt(year: number): readonly MapMarker[] {
  return MARKERS.filter((m) => year >= m.fromYear);
}
