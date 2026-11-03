import * as THREE from 'three';
import { BIOMES, NoiseSet, type BiomeId, type ColorSample } from './biomes';
import { gradeInto, mixInto, rgb, type RGB } from './color';
import { eraGrade, type EraId } from './eraLook';
import { LodCrossFade, scaledThresholds, selectLod } from './lod';
import { smoothstep } from './noise';
import { RoadPath, type RoadHit, type RoadSpec } from './roads';
import { hash01, hashString } from './rng';
import { WaterSurface } from './water';

export interface TerrainConfig {
  readonly seed: number | string;
  /** Side of the square terrain in meters (centered on the origin). */
  readonly size: number;
  /** Side of one chunk in meters; size must be a multiple. */
  readonly chunkSize: number;
  /** LOD 0 grid spacing in meters; chunkSize / cell must be divisible by every LOD step. */
  readonly cell: number;
  readonly biome: BiomeId;
  /** Optional second biome blended in by mask (0 = primary, 1 = secondary). */
  readonly secondary?: { readonly biome: BiomeId; mask(x: number, z: number): number };
  readonly roads?: readonly RoadSpec[];
  readonly era?: EraId;
  /** Overrides the biome's water level; null removes water. */
  readonly waterLevel?: number | null;
  /** Grid step per LOD level, in cells. Default [1, 2, 4]. */
  readonly lodSteps?: readonly number[];
  /** Settings multipliers (0.5-1.5). */
  readonly lodDistance?: number;
  readonly renderDistance?: number;
  /** LOD cross-fade duration in seconds. */
  readonly fadeSeconds?: number;
  /** Chunks farther than this (times renderDistance) are hidden. */
  readonly maxDistance?: number;
}

interface Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly centerY: number;
  readonly meshes: THREE.Mesh[];
  readonly fade: LodCrossFade;
  readonly fadeMaterial: THREE.MeshStandardMaterial;
  initialized: boolean;
}

const LOD_HYSTERESIS = 6;
const tmpColor: RGB = [0, 0, 0];
const tmpColor2: RGB = [0, 0, 0];
const roadHit: RoadHit = { distance: 0, height: 0, along: 0 };
const sample: ColorSample = { x: 0, z: 0, height: 0, slope: 0, jitter: 0 };

/**
 * Chunked heightfield with flat-shaded low-poly faces, vertex colors from biome functions, roads
 * carved along splines, optional water, and per-chunk LOD with dithered cross-fades.
 *
 * heightAt() returns the exact surface of the LOD 0 mesh (same triangulation), so objects placed
 * with it sit on the ground the player sees up close.
 */
export class Terrain {
  readonly group = new THREE.Group();
  readonly roads: RoadPath[] = [];
  readonly noise: NoiseSet;
  readonly size: number;
  readonly cell: number;
  /** Vertices per side of the full grid. */
  readonly n: number;
  readonly heights: Float32Array;
  /** 0-1 road coverage per grid vertex. */
  readonly roadMask: Float32Array;
  readonly material: THREE.MeshStandardMaterial;
  readonly water: WaterSurface | null = null;
  readonly lodSteps: readonly number[];
  private readonly chunks: Chunk[] = [];
  private readonly thresholds: number[] = [];
  private readonly half: number;
  private readonly seedNum: number;
  private maxDistance: number;
  private readonly roadColors: RGB[];
  private readonly grade: ReturnType<typeof eraGrade>;

  constructor(readonly config: TerrainConfig) {
    const { size, chunkSize, cell } = config;
    const steps = config.lodSteps ?? [1, 2, 4];
    const cellsPerChunk = chunkSize / cell;
    if (!Number.isInteger(size / chunkSize) || !Number.isInteger(cellsPerChunk)) throw new Error('Terrain: size, chunkSize and cell must divide evenly');
    for (const s of steps) if (!Number.isInteger(cellsPerChunk / s)) throw new Error('Terrain: LOD step ' + String(s) + ' does not divide the chunk');
    this.size = size;
    this.cell = cell;
    this.half = size / 2;
    this.lodSteps = steps;
    this.seedNum = typeof config.seed === 'string' ? hashString(config.seed) : config.seed >>> 0;
    this.noise = new NoiseSet(this.seedNum);
    this.grade = eraGrade(config.era ?? 'modern');
    this.n = Math.round(size / cell) + 1;
    this.heights = new Float32Array(this.n * this.n);
    this.roadMask = new Float32Array(this.n * this.n);
    this.roadColors = (config.roads ?? []).map((r) => rgb(r.color));
    this.maxDistance = (config.maxDistance ?? Infinity) * (config.renderDistance ?? 1);
    scaledThresholds(config.lodDistance ?? 1, this.thresholds, baseThresholdsFor(steps.length));

    this.buildHeights();
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.material.name = 'terrain';
    this.buildChunks(chunkSize, cellsPerChunk);

    const biome = BIOMES[config.biome];
    const level = config.waterLevel === undefined ? biome.waterLevel : config.waterLevel;
    if (level !== null) {
      this.water = new WaterSurface(size, size, level, biome.waterColor);
      this.group.add(this.water.mesh);
    }
  }

  /** Height of the procedural base landscape before roads are carved (any x, z). */
  baseHeight(x: number, z: number): number {
    const h = BIOMES[this.config.biome].height(x, z, this.noise);
    const sec = this.config.secondary;
    if (!sec) return h;
    const m = sec.mask(x, z);
    return m <= 0 ? h : h + (BIOMES[sec.biome].height(x, z, this.noise) - h) * Math.min(1, m);
  }

  private buildHeights(): void {
    const { n, cell, half } = this;
    for (const spec of this.config.roads ?? []) this.roads.push(new RoadPath(spec, (x, z) => this.baseHeight(x, z)));
    for (let j = 0; j < n; j++) {
      const z = j * cell - half;
      for (let i = 0; i < n; i++) {
        const x = i * cell - half;
        let h = this.baseHeight(x, z);
        let mask = 0;
        for (const road of this.roads) {
          const reach = road.halfWidth + road.spec.shoulder;
          if (!road.nearest(x, z, reach, roadHit)) continue;
          const w = 1 - smoothstep(road.halfWidth, reach, roadHit.distance);
          h += (roadHit.height - h) * w;
          mask = Math.max(mask, 1 - smoothstep(road.halfWidth * 0.75, road.halfWidth * 1.15, roadHit.distance));
        }
        this.heights[j * n + i] = h;
        this.roadMask[j * n + i] = mask;
      }
    }
  }

  private gridH(i: number, j: number): number {
    const n = this.n;
    const ci = i < 0 ? 0 : i > n - 1 ? n - 1 : i;
    const cj = j < 0 ? 0 : j > n - 1 ? n - 1 : j;
    return this.heights[cj * n + ci] ?? 0;
  }

  /** Exact LOD 0 surface height (same triangulation as the mesh). Clamped at the edges. */
  heightAt(x: number, z: number): number {
    const gx = Math.min(this.n - 1, Math.max(0, (x + this.half) / this.cell));
    const gz = Math.min(this.n - 1, Math.max(0, (z + this.half) / this.cell));
    let i = Math.floor(gx);
    let j = Math.floor(gz);
    if (i >= this.n - 1) i = this.n - 2;
    if (j >= this.n - 1) j = this.n - 2;
    const fx = gx - i;
    const fz = gz - j;
    const ha = this.gridH(i, j);
    const hb = this.gridH(i + 1, j);
    const hc = this.gridH(i, j + 1);
    const hd = this.gridH(i + 1, j + 1);
    if (fx + fz <= 1) return ha + (hb - ha) * fx + (hc - ha) * fz;
    return hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
  }

  /** 0 = flat, 1 = vertical, from grid finite differences. */
  slopeAt(x: number, z: number): number {
    const e = this.cell;
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return 1 - 1 / Math.sqrt(1 + dx * dx + dz * dz);
  }

  /** 0-1 road coverage near a point (bilinear on the grid). */
  roadAt(x: number, z: number): number {
    const gx = Math.min(this.n - 1, Math.max(0, (x + this.half) / this.cell));
    const gz = Math.min(this.n - 1, Math.max(0, (z + this.half) / this.cell));
    const i = Math.min(this.n - 2, Math.floor(gx));
    const j = Math.min(this.n - 2, Math.floor(gz));
    const fx = gx - i;
    const fz = gz - j;
    const m = this.roadMask;
    const n = this.n;
    const a = m[j * n + i] ?? 0;
    const b = m[j * n + i + 1] ?? 0;
    const c = m[(j + 1) * n + i] ?? 0;
    const d = m[(j + 1) * n + i + 1] ?? 0;
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  }

  /** Is (x, z) under water? */
  isUnderwater(x: number, z: number, margin = 0.3): boolean {
    return this.water !== null && this.heightAt(x, z) < this.water.mesh.position.y + margin;
  }

  private faceColor(out: RGB, x: number, z: number, h: number, slope: number, road: number, jitter: number): RGB {
    sample.x = x;
    sample.z = z;
    sample.height = h;
    sample.slope = slope;
    sample.jitter = jitter;
    BIOMES[this.config.biome].color(out, sample, this.noise);
    const sec = this.config.secondary;
    if (sec) {
      const m = sec.mask(x, z);
      if (m > 0) mixInto(out, out, BIOMES[sec.biome].color(tmpColor2, sample, this.noise), Math.min(1, m));
    }
    if (road > 0.02 && this.roadColors.length > 0) {
      const rc = this.roadColors[0] ?? out;
      tmpColor2[0] = rc[0] * (0.92 + jitter * 0.16);
      tmpColor2[1] = rc[1] * (0.92 + jitter * 0.16);
      tmpColor2[2] = rc[2] * (0.92 + jitter * 0.16);
      mixInto(out, out, tmpColor2, Math.min(1, road * 1.2));
    }
    return gradeInto(out, this.grade.tint, this.grade.saturation);
  }

  /** Builds one chunk LOD as non-indexed geometry with flat normals, colors and edge skirts. */
  buildChunkGeometry(ci: number, cj: number, cellsPerChunk: number, step: number): THREE.BufferGeometry {
    const cells = cellsPerChunk / step;
    const triCount = cells * cells * 2 + cells * 4 * 2;
    const pos = new Float32Array(triCount * 9);
    const col = new Float32Array(triCount * 9);
    const { cell, half, n } = this;
    const i0 = ci * cellsPerChunk;
    const j0 = cj * cellsPerChunk;
    let p = 0;
    const put = (x: number, y: number, z: number, c: RGB): void => {
      pos[p] = x;
      pos[p + 1] = y;
      pos[p + 2] = z;
      col[p] = c[0];
      col[p + 1] = c[1];
      col[p + 2] = c[2];
      p += 3;
    };
    const tri = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, faceId: number): void => {
      const ha = this.gridH(ax, az);
      const hb = this.gridH(bx, bz);
      const hc = this.gridH(cx, cz);
      const wx = ((ax + bx + cx) / 3) * cell - half;
      const wz = ((az + bz + cz) / 3) * cell - half;
      // Face normal y component for slope (span is identical in x and z).
      const ux = (bx - ax) * cell;
      const uy = hb - ha;
      const uz = (bz - az) * cell;
      const vx = (cx - ax) * cell;
      const vy = hc - ha;
      const vz = (cz - az) * cell;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const slope = 1 - Math.abs(ny) / Math.max(1e-6, Math.hypot(nx, ny, nz));
      const road = ((this.roadMask[az * n + ax] ?? 0) + (this.roadMask[bz * n + bx] ?? 0) + (this.roadMask[cz * n + cx] ?? 0)) / 3;
      const jitter = hash01(faceId, step, this.seedNum);
      this.faceColor(tmpColor, wx, wz, (ha + hb + hc) / 3, slope, road, jitter);
      put(ax * cell - half, ha, az * cell - half, tmpColor);
      put(bx * cell - half, hb, bz * cell - half, tmpColor);
      put(cx * cell - half, hc, cz * cell - half, tmpColor);
    };
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const ax = i0 + i * step;
        const az = j0 + j * step;
        const bx = ax + step;
        const dz = az + step;
        const id = (az * n + ax) * 2;
        // a=(ax,az) b=(bx,az) c=(ax,dz) d=(bx,dz); diagonal b-c (matches heightAt).
        tri(ax, az, ax, dz, bx, az, id);
        tri(bx, az, ax, dz, bx, dz, id + 1);
      }
    }
    // Skirts: short walls hanging below every edge hide cracks between chunks at different LODs.
    const skirt = step * cell * 1.5 + 1;
    const edge = (ax: number, az: number, bx: number, bz: number): void => {
      const ha = this.gridH(ax, az);
      const hb = this.gridH(bx, bz);
      const x0 = ax * cell - half;
      const z0 = az * cell - half;
      const x1 = bx * cell - half;
      const z1 = bz * cell - half;
      this.faceColor(tmpColor, (x0 + x1) / 2, (z0 + z1) / 2, (ha + hb) / 2, 1, 0, 0.3);
      put(x0, ha, z0, tmpColor);
      put(x0, ha - skirt, z0, tmpColor);
      put(x1, hb, z1, tmpColor);
      put(x1, hb, z1, tmpColor);
      put(x0, ha - skirt, z0, tmpColor);
      put(x1, hb - skirt, z1, tmpColor);
    };
    const last = cellsPerChunk;
    for (let k = 0; k < cells; k++) {
      const a = k * step;
      const b = a + step;
      edge(i0 + b, j0, i0 + a, j0);
      edge(i0 + a, j0 + last, i0 + b, j0 + last);
      edge(i0, j0 + a, i0, j0 + b);
      edge(i0 + last, j0 + b, i0 + last, j0 + a);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }

  private buildChunks(chunkSize: number, cellsPerChunk: number): void {
    const count = this.size / chunkSize;
    for (let cj = 0; cj < count; cj++) {
      for (let ci = 0; ci < count; ci++) {
        const meshes = this.lodSteps.map((step, level) => {
          const mesh = new THREE.Mesh(this.buildChunkGeometry(ci, cj, cellsPerChunk, step), this.material);
          mesh.receiveShadow = true;
          mesh.matrixAutoUpdate = false;
          mesh.visible = level === 0;
          mesh.name = 'terrain-' + String(ci) + '-' + String(cj) + '-lod' + String(level);
          this.group.add(mesh);
          return mesh;
        });
        const fadeMaterial = this.material.clone();
        fadeMaterial.alphaHash = true;
        fadeMaterial.name = 'terrain-fade';
        const minX = ci * chunkSize - this.half;
        const minZ = cj * chunkSize - this.half;
        this.chunks.push({
          cx: minX + chunkSize / 2,
          cz: minZ + chunkSize / 2,
          minX,
          maxX: minX + chunkSize,
          minZ,
          maxZ: minZ + chunkSize,
          centerY: this.heightAt(minX + chunkSize / 2, minZ + chunkSize / 2),
          meshes,
          fade: new LodCrossFade(0, this.config.fadeSeconds ?? 0.6),
          fadeMaterial,
          initialized: false,
        });
      }
    }
  }

  get chunkCount(): number {
    return this.chunks.length;
  }

  /** Current target LOD of every chunk (for tests and the debug overlay). */
  chunkLevels(out: number[]): number[] {
    out.length = this.chunks.length;
    for (let i = 0; i < this.chunks.length; i++) out[i] = this.chunks[i]?.fade.level ?? 0;
    return out;
  }

  /** Chunks currently cross-fading. */
  get fadingCount(): number {
    let c = 0;
    for (const ch of this.chunks) if (ch.fade.fading) c++;
    return c;
  }

  setLodDistance(lodDistance: number): void {
    scaledThresholds(lodDistance, this.thresholds, baseThresholdsFor(this.lodSteps.length));
  }

  /** Per-frame LOD selection and cross-fade. No allocation. */
  update(cameraPosition: THREE.Vector3, dt: number, elapsed = 0): void {
    this.water?.update(elapsed);
    for (const ch of this.chunks) {
      const dx = cameraPosition.x < ch.minX ? ch.minX - cameraPosition.x : cameraPosition.x > ch.maxX ? cameraPosition.x - ch.maxX : 0;
      const dz = cameraPosition.z < ch.minZ ? ch.minZ - cameraPosition.z : cameraPosition.z > ch.maxZ ? cameraPosition.z - ch.maxZ : 0;
      const dy = Math.max(0, cameraPosition.y - ch.centerY - 20);
      const distance = Math.sqrt(dx * dx + dz * dz + dy * dy);
      const desired = selectLod(distance, this.thresholds, ch.fade.level, LOD_HYSTERESIS);
      if (!ch.initialized) {
        ch.fade.reset(desired);
        ch.initialized = true;
      } else {
        ch.fade.request(desired);
        ch.fade.update(dt);
      }
      const inRange = distance <= this.maxDistance;
      const f = ch.fade;
      for (let level = 0; level < ch.meshes.length; level++) {
        const mesh = ch.meshes[level];
        if (!mesh) continue;
        const isTo = level === f.to;
        const isFrom = f.fading && level === f.from;
        mesh.visible = inRange && (isTo || isFrom);
        if (!mesh.visible) continue;
        let opacity = 1;
        if (isTo && f.fading) opacity = f.toOpacity;
        else if (isFrom) opacity = f.fromOpacity;
        if (opacity < 1) {
          ch.fadeMaterial.opacity = opacity;
          mesh.material = ch.fadeMaterial;
        } else {
          mesh.material = this.material;
        }
      }
    }
  }

  dispose(): void {
    for (const ch of this.chunks) {
      for (const m of ch.meshes) m.geometry.dispose();
      ch.fadeMaterial.dispose();
    }
    this.material.dispose();
    this.water?.dispose();
    this.group.removeFromParent();
  }
}

/** Base LOD thresholds sized to the number of levels. */
function baseThresholdsFor(levels: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < levels - 1; i++) out.push(70 * Math.pow(2.15, i));
  return out;
}
