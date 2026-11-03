import { describe, expect, it } from 'vitest';
import { CONTROL_POINTS, GEO_SOURCES } from '../../src/features/livingMap/controlPoints';
import { CameraRig } from '../../src/features/livingMap/cameraRig';
import { LINE_LAYERS, layerHasGeometry, lineLayersAt } from '../../src/features/livingMap/layers';
import { MARKERS, markersVisibleAt } from '../../src/features/livingMap/markers';
import { buildReliefGrid, coastLonAt, elevationAt, project, REGION, surfaceAt, unproject } from '../../src/features/livingMap/relief';

describe('relief generator', () => {
  it('is deterministic', () => {
    const a = buildReliefGrid(40, 48);
    const b = buildReliefGrid(40, 48);
    expect(a.heights).toEqual(b.heights);
    expect(a.surfaces).toEqual(b.surfaces);
    expect(elevationAt(31.9, 35.0)).toBe(elevationAt(31.9, 35.0));
  });

  it('fits every control point exactly (within 1 m)', () => {
    for (const p of CONTROL_POINTS) {
      const h = elevationAt(p.lat, p.lon);
      const expected = surfaceAt(p.lat, p.lon) === 'sea' ? 0 : p.elevM;
      expect(Math.abs(h - expected), p.id + ' got ' + h).toBeLessThanOrEqual(1);
    }
  });

  it('keeps control points on land (or lake) and inside the region', () => {
    for (const p of CONTROL_POINTS) {
      expect(p.lat).toBeGreaterThanOrEqual(REGION.latMin);
      expect(p.lat).toBeLessThanOrEqual(REGION.latMax);
      expect(p.lon).toBeGreaterThanOrEqual(REGION.lonMin);
      expect(p.lon).toBeLessThanOrEqual(REGION.lonMax);
      expect(surfaceAt(p.lat, p.lon), p.id).not.toBe('sea');
      for (const s of p.sources) expect(GEO_SOURCES.some((g) => g.id === s)).toBe(true);
    }
  });

  it('puts the Dead Sea near -430 m, Hermon highest and the coast at sea level', () => {
    expect(elevationAt(31.43, 35.47)).toBeCloseTo(-430, 0);
    expect(elevationAt(33.416, 35.857)).toBeCloseTo(2814, 0);
    const grid = buildReliefGrid(48, 56);
    expect(Math.max(...grid.heights)).toBeLessThanOrEqual(2814 + 60);
    expect(Math.min(...grid.heights)).toBeGreaterThan(-700);
    expect(surfaceAt(32.08, 34.5)).toBe('sea');
    expect(surfaceAt(32.08, 35.0)).toBe('land');
    expect(surfaceAt(31.43, 35.47)).toBe('lake');
    expect(coastLonAt(32.08)).toBeCloseTo(34.76, 2);
    expect(coastLonAt(30)).toBeNull();
  });

  it('puts hills above the plain and the Jordan valley below sea level', () => {
    expect(elevationAt(31.78, 35.22)).toBeGreaterThan(elevationAt(32.0, 34.9) + 400);
    expect(elevationAt(31.86, 35.46)).toBeLessThan(0);
  });

  it('projects and unprojects coordinates', () => {
    const xz = project(32.0, 35.0);
    const back = unproject(xz.x, xz.z);
    expect(back.lat).toBeCloseTo(32.0, 6);
    expect(back.lon).toBeCloseTo(35.0, 6);
    // North is up (smaller z), east is right (larger x).
    expect(project(33, 35).z).toBeLessThan(project(31, 35).z);
    expect(project(32, 36).x).toBeGreaterThan(project(32, 35).x);
  });
});

describe('map data', () => {
  it('gives every marker a name, a position on land and sources', () => {
    const ids = new Set<string>();
    for (const m of MARKERS) {
      expect(ids.has(m.id)).toBe(false);
      ids.add(m.id);
      expect(m.sources.length).toBeGreaterThan(0);
      expect(surfaceAt(m.lat, m.lon), m.id).not.toBe('sea');
    }
    expect(markersVisibleAt(1850).length).toBeLessThan(markersVisibleAt(1950).length);
    expect(markersVisibleAt(1800)).toHaveLength(0);
  });

  it('ships line layers empty rather than guessed', () => {
    for (const layer of LINE_LAYERS) {
      expect(layer.sources.length).toBeGreaterThan(0);
      expect(layerHasGeometry(layer)).toBe(false);
    }
    expect(lineLayersAt(1900)).toHaveLength(0);
    expect(lineLayersAt(1949).map((l) => l.id)).toContain('armistice-lines-1949');
  });
});

describe('camera rig', () => {
  it('clamps zoom and polar angle', () => {
    const rig = new CameraRig();
    rig.zoom(1000);
    expect(rig.distance).toBe(80);
    rig.zoom(0.0001);
    expect(rig.distance).toBe(8);
    rig.orbit(0, 10);
    expect(rig.polar).toBeCloseTo(1.4);
    rig.orbit(0, -10);
    expect(rig.polar).toBeCloseTo(0.15);
  });

  it('orbits with the right stick and is slower with reduced motion', () => {
    const a = new CameraRig();
    const b = new CameraRig();
    a.applyAnalog(0.5, 1, 0, 0, false);
    b.applyAnalog(0.5, 1, 0, 0, true);
    expect(a.azimuth).toBeGreaterThan(b.azimuth);
    expect(b.azimuth).toBeGreaterThan(0);
    const c = new CameraRig();
    c.applyAnalog(1, 0.05, 0.05, 0, false);
    expect(c.azimuth).toBe(0);
  });

  it('places the camera at the orbit distance', () => {
    const rig = new CameraRig();
    const out = { x: 0, y: 0, z: 0 };
    rig.position(out);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(rig.distance, 6);
    expect(out.z).toBeGreaterThan(0);
  });
});
