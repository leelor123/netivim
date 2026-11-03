/**
 * Border and line layers (hook). A layer carries its label, whether it is simplified, its sources and
 * the years it applies to. Polylines stay EMPTY until geometry can be sourced precisely enough; an
 * empty layer draws nothing and the UI says so. Never fill a layer from memory.
 */
export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

export interface LineLayer {
  readonly id: string;
  readonly labelKey: string;
  /** True when the geometry is a simplification of the source line. */
  readonly simplified: boolean;
  readonly fromYear: number;
  readonly toYear: number | null;
  /** Source IDs of the texts that define the line (geometry is digitized from them). */
  readonly sources: readonly string[];
  readonly polylines: readonly (readonly LatLon[])[];
}

export const LINE_LAYERS: readonly LineLayer[] = [
  {
    id: 'partition-plan-1947',
    labelKey: 'timeline.layer.partition',
    simplified: true,
    fromYear: 1947,
    toYear: null,
    sources: ['C1-003', 'C1-057'],
    polylines: [],
  },
  {
    id: 'armistice-lines-1949',
    labelKey: 'timeline.layer.armistice',
    simplified: true,
    fromYear: 1949,
    toYear: null,
    sources: ['C2-008', 'C2-066'],
    polylines: [],
  },
];

export function lineLayersAt(year: number): readonly LineLayer[] {
  return LINE_LAYERS.filter((l) => year >= l.fromYear && (l.toYear === null || year <= l.toYear));
}

export function layerHasGeometry(layer: LineLayer): boolean {
  return layer.polylines.some((p) => p.length >= 2);
}
