/**
 * Geographic control points of the stylized relief map.
 *
 * HONESTY NOTE: these are rounded, approximate values (about 0.01 degrees, 10 m to 50 m of
 * elevation) entered from general geographic knowledge. No dataset was downloaded while building
 * this file (the project has no network at build time). Each point names the reference it must be
 * cross-checked against before release. The map is labeled "stylized relief" in the UI and is not
 * a survey product. Names here are developer labels only and are never shown to players.
 */

export interface GeoSource {
  readonly id: string;
  readonly title: string;
  readonly note: string;
}

export const GEO_SOURCES: readonly GeoSource[] = [
  {
    id: 'GEO-001',
    title: 'NASA/USGS Shuttle Radar Topography Mission (SRTM) global elevation model',
    note: 'Public-domain elevation reference for summits, depressions and plateaus.',
  },
  {
    id: 'GEO-002',
    title: 'Survey of Israel national gazetteer and the Atlas of Israel (place coordinates)',
    note: 'Reference for settlement and summit coordinates inside Israel.',
  },
  {
    id: 'GEO-003',
    title: 'Natural Earth coastline and lakes (public domain)',
    note: 'Reference for the Mediterranean coast, the Gulf of Aqaba and the lakes.',
  },
  {
    id: 'GEO-004',
    title: 'Jordan and Sinai gazetteer entries cross-checked against SRTM (GEO-001)',
    note: 'Reference for points east of the Jordan Rift and in Sinai.',
  },
];

export type ControlKind = 'coast' | 'peak' | 'depression' | 'plain' | 'plateau' | 'valley';

export interface ControlPoint {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  /** Metres above (positive) or below (negative) sea level. */
  readonly elevM: number;
  readonly kind: ControlKind;
  /** GEO-* source IDs to cross-check against. */
  readonly sources: readonly string[];
}

const P = (id: string, lat: number, lon: number, elevM: number, kind: ControlKind, source: string): ControlPoint => ({
  id,
  lat,
  lon,
  elevM,
  kind,
  sources: [source],
});

export const CONTROL_POINTS: readonly ControlPoint[] = [
  // Mediterranean coast and Sinai coast (sea level), south to north.
  P('el-arish-coast', 31.13, 33.8, 0, 'coast', 'GEO-003'),
  P('rafah-coast', 31.22, 34.27, 0, 'coast', 'GEO-003'),
  P('gaza-coast', 31.52, 34.44, 0, 'coast', 'GEO-003'),
  P('ashkelon-coast', 31.66, 34.55, 0, 'coast', 'GEO-003'),
  P('ashdod-coast', 31.8, 34.63, 0, 'coast', 'GEO-003'),
  P('tel-aviv-coast', 32.08, 34.76, 0, 'coast', 'GEO-003'),
  P('netanya-coast', 32.34, 34.85, 0, 'coast', 'GEO-003'),
  P('caesarea-coast', 32.5, 34.89, 0, 'coast', 'GEO-003'),
  P('haifa-coast', 32.82, 34.98, 0, 'coast', 'GEO-003'),
  P('acre-coast', 32.93, 35.07, 0, 'coast', 'GEO-003'),
  P('rosh-hanikra-coast', 33.09, 35.1, 0, 'coast', 'GEO-003'),
  P('tyre-coast', 33.27, 35.19, 0, 'coast', 'GEO-003'),
  // Gulf of Aqaba head.
  P('eilat-shore', 29.55, 34.95, 0, 'coast', 'GEO-003'),
  // Coastal plain and Shephelah.
  P('lod-plain', 31.95, 34.9, 50, 'plain', 'GEO-001'),
  P('rehovot-plain', 31.89, 34.81, 70, 'plain', 'GEO-001'),
  P('kiryat-gat', 31.61, 34.76, 150, 'plain', 'GEO-001'),
  P('khan-yunis-plain', 31.35, 34.4, 40, 'plain', 'GEO-001'),
  P('latrun-foothills', 31.84, 34.98, 150, 'plain', 'GEO-001'),
  P('beit-shemesh', 31.75, 34.99, 300, 'plain', 'GEO-001'),
  P('jezreel-valley', 32.57, 35.2, 60, 'valley', 'GEO-001'),
  P('hula-valley', 33.1, 35.6, 70, 'valley', 'GEO-001'),
  // Central hills (Judea, Samaria) and Carmel.
  P('jerusalem', 31.78, 35.22, 750, 'peak', 'GEO-002'),
  P('mount-scopus', 31.795, 35.243, 820, 'peak', 'GEO-002'),
  P('ramallah-hills', 31.9, 35.2, 870, 'peak', 'GEO-002'),
  P('hebron-hills', 31.55, 35.1, 950, 'peak', 'GEO-001'),
  P('nablus-hills', 32.22, 35.26, 550, 'peak', 'GEO-001'),
  P('jenin', 32.46, 35.3, 175, 'plain', 'GEO-001'),
  P('mount-carmel', 32.72, 35.05, 540, 'peak', 'GEO-002'),
  // Galilee and the Rift.
  P('nazareth-hills', 32.7, 35.3, 350, 'peak', 'GEO-002'),
  P('mount-tabor', 32.69, 35.39, 588, 'peak', 'GEO-002'),
  P('mount-gilboa', 32.48, 35.41, 530, 'peak', 'GEO-001'),
  P('safed-heights', 32.96, 35.5, 850, 'peak', 'GEO-002'),
  P('mount-meron', 32.99, 35.41, 1208, 'peak', 'GEO-002'),
  P('sea-of-galilee', 32.82, 35.59, -209, 'depression', 'GEO-003'),
  P('beit-shean', 32.5, 35.5, -120, 'depression', 'GEO-001'),
  P('jericho', 31.86, 35.46, -258, 'depression', 'GEO-002'),
  P('dead-sea-north', 31.76, 35.5, -430, 'depression', 'GEO-003'),
  P('dead-sea-middle', 31.43, 35.47, -430, 'depression', 'GEO-003'),
  P('dead-sea-south', 31.1, 35.45, -430, 'depression', 'GEO-003'),
  // Golan and Hermon.
  P('mount-hermon', 33.416, 35.857, 2814, 'peak', 'GEO-001'),
  P('golan-north', 33.13, 35.8, 1170, 'plateau', 'GEO-002'),
  P('golan-middle', 32.95, 35.76, 800, 'plateau', 'GEO-001'),
  P('golan-south', 32.8, 35.72, 300, 'plateau', 'GEO-001'),
  // Negev and the Arava.
  P('beersheba', 31.25, 34.79, 280, 'plain', 'GEO-002'),
  P('arad', 31.26, 35.21, 600, 'plateau', 'GEO-002'),
  P('dimona', 31.07, 35.03, 570, 'plateau', 'GEO-002'),
  P('sde-boker', 30.87, 34.78, 470, 'plateau', 'GEO-002'),
  P('nitzana', 30.88, 34.43, 190, 'plain', 'GEO-001'),
  P('mitzpe-ramon', 30.61, 34.8, 850, 'plateau', 'GEO-002'),
  P('mount-ramon', 30.5, 34.7, 1035, 'peak', 'GEO-001'),
  P('arava-watershed', 30.4, 35.15, 230, 'valley', 'GEO-001'),
  P('arava-south', 29.9, 35.05, 50, 'valley', 'GEO-001'),
  P('eilat-mountains', 29.62, 34.88, 700, 'peak', 'GEO-001'),
  // Sinai edge.
  P('kuntilla', 29.98, 34.68, 400, 'plateau', 'GEO-004'),
  P('gebel-yelleq', 30.38, 33.98, 1090, 'peak', 'GEO-004'),
  P('north-sinai-dunes', 30.95, 34.0, 80, 'plain', 'GEO-004'),
  // East of the Rift (Transjordan plateau).
  P('amman-plateau', 31.95, 35.92, 800, 'plateau', 'GEO-004'),
  P('irbid-plateau', 32.55, 35.85, 600, 'plateau', 'GEO-004'),
  P('kerak-plateau', 31.18, 35.7, 900, 'plateau', 'GEO-004'),
  P('petra-heights', 30.33, 35.44, 900, 'plateau', 'GEO-004'),
];
