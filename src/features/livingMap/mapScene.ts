import * as THREE from 'three';
import { disposeObject, type GameScene } from '../../render/sceneManager';
import { CameraRig } from './cameraRig';
import { layerHasGeometry, type LineLayer } from './layers';
import { MARKERS, type MapMarker } from './markers';
import { buildReliefGrid, elevationAt, project, REGION_SIZE, terrainColor, worldHeight, type ReliefGrid } from './relief';

export interface MapSceneOptions {
  readonly reducedMotion?: () => boolean;
  /** Smaller grids for tests. */
  readonly grid?: { readonly cols: number; readonly rows: number };
}

const GOLD = new THREE.Color('#f2c14e');
const BONE = new THREE.Color('#f3ede2');
const POP_RATE = 10;

/** Builds the terrain mesh from the pure relief grid: one draw call, vertex colours, no textures. */
function buildTerrainGeometry(grid: ReliefGrid): THREE.BufferGeometry {
  const { cols, rows, heights, surfaces } = grid;
  const positions = new Float32Array(cols * rows * 3);
  const colors = new Float32Array(cols * rows * 3);
  const rgb: [number, number, number] = [0, 0, 0];
  const halfW = REGION_SIZE.width / 2;
  const halfD = REGION_SIZE.depth / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const elev = heights[i] as number;
      const surface = (surfaces[i] as number) as 0 | 1 | 2;
      positions[i * 3] = -halfW + (REGION_SIZE.width * c) / (cols - 1);
      // Row 0 is the northern edge (-z).
      positions[i * 3 + 1] = surface === 0 ? worldHeight(elev) : Math.min(worldHeight(elev), 0);
      positions[i * 3 + 2] = -halfD + (REGION_SIZE.depth * r) / (rows - 1);
      terrainColor(elev, surface, rgb);
      colors[i * 3] = rgb[0];
      colors[i * 3 + 1] = rgb[1];
      colors[i * 3 + 2] = rgb[2];
    }
  }
  const index = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let k = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      index[k++] = a;
      index[k++] = d;
      index[k++] = b;
      index[k++] = b;
      index[k++] = d;
      index[k++] = e;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** The Living Map scene: stylized relief, era markers, optional line layers. At most a handful of draw calls. */
export class LivingMapScene implements GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 400);
  readonly rig = new CameraRig();

  private readonly terrain: THREE.Mesh;
  private readonly markerMesh: THREE.InstancedMesh;
  private readonly markerBase: Float32Array;
  private readonly scale: Float32Array;
  private readonly target: Float32Array;
  private readonly highlight: Uint8Array;
  private lineObjects: THREE.LineSegments[] = [];
  private year = 0;
  private dirty = true;
  private colorDirty = true;
  private disposed = false;
  private readonly reducedMotion: () => boolean;
  private readonly dummy = new THREE.Object3D();
  private readonly tmp = new THREE.Vector3();

  constructor(options: MapSceneOptions = {}) {
    this.reducedMotion = options.reducedMotion ?? (() => false);
    this.scene.background = new THREE.Color('#0e1116');
    this.scene.add(new THREE.HemisphereLight('#fff1d6', '#2b3340', 1.6));
    const sun = new THREE.DirectionalLight('#ffe2b0', 2.2);
    sun.position.set(-30, 40, 20);
    this.scene.add(sun);

    const grid = buildReliefGrid(options.grid?.cols, options.grid?.rows);
    this.terrain = new THREE.Mesh(
      buildTerrainGeometry(grid),
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    );
    this.scene.add(this.terrain);

    const cone = new THREE.ConeGeometry(0.16, 0.5, 8);
    cone.translate(0, 0.25, 0);
    this.markerMesh = new THREE.InstancedMesh(cone, new THREE.MeshLambertMaterial({ color: 0xffffff }), MARKERS.length);
    this.markerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.markerMesh.frustumCulled = false;
    this.markerBase = new Float32Array(MARKERS.length * 3);
    const xz = { x: 0, z: 0 };
    MARKERS.forEach((m, i) => {
      project(m.lat, m.lon, xz);
      this.markerBase[i * 3] = xz.x;
      this.markerBase[i * 3 + 1] = Math.max(0, worldHeight(elevationAt(m.lat, m.lon)));
      this.markerBase[i * 3 + 2] = xz.z;
    });
    this.scale = new Float32Array(MARKERS.length);
    this.target = new Float32Array(MARKERS.length);
    this.highlight = new Uint8Array(MARKERS.length);
    this.scene.add(this.markerMesh);

    this.applyCamera();
  }

  get markers(): readonly MapMarker[] {
    return MARKERS;
  }

  /** Marker visibility for a year (cumulative: a place stays once it appears). */
  setYear(year: number): void {
    this.year = year;
    const reduced = this.reducedMotion();
    MARKERS.forEach((m, i) => {
      this.target[i] = year >= m.fromYear ? 1 : 0;
      if (reduced) this.scale[i] = this.target[i] as number;
    });
    this.dirty = true;
  }

  get currentYear(): number {
    return this.year;
  }

  isMarkerShown(i: number): boolean {
    return (this.target[i] as number) > 0;
  }

  /** Marks which markers carry a caption in the active lens (drawn in gold). */
  setHighlights(ids: ReadonlySet<string>): void {
    MARKERS.forEach((m, i) => {
      this.highlight[i] = ids.has(m.id) ? 1 : 0;
    });
    this.colorDirty = true;
  }

  /** Replaces the line layers; layers without geometry draw nothing. */
  setLineLayers(layers: readonly LineLayer[]): void {
    for (const obj of this.lineObjects) {
      this.scene.remove(obj);
      disposeObject(obj);
    }
    this.lineObjects = [];
    for (const layer of layers) {
      if (!layerHasGeometry(layer)) continue;
      const pts: number[] = [];
      const xz = { x: 0, z: 0 };
      for (const line of layer.polylines) {
        for (let i = 0; i < line.length - 1; i++) {
          for (const p of [line[i], line[i + 1]]) {
            if (!p) continue;
            project(p.lat, p.lon, xz);
            pts.push(xz.x, Math.max(0, worldHeight(elevationAt(p.lat, p.lon))) + 0.05, xz.z);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xff7a59 }));
      this.scene.add(obj);
      this.lineObjects.push(obj);
    }
  }

  /**
   * Screen position of a marker label in CSS pixels. Returns false when the marker is hidden,
   * behind the camera or off screen. No allocation.
   */
  labelScreenPosition(i: number, width: number, height: number, out: { x: number; y: number }): boolean {
    if ((this.scale[i] as number) < 0.5) return false;
    this.tmp.set(this.markerBase[i * 3] as number, (this.markerBase[i * 3 + 1] as number) + 0.7, this.markerBase[i * 3 + 2] as number);
    this.tmp.project(this.camera);
    if (this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.05 || Math.abs(this.tmp.y) > 1.05) return false;
    out.x = (this.tmp.x * 0.5 + 0.5) * width;
    out.y = (-this.tmp.y * 0.5 + 0.5) * height;
    return true;
  }

  update(dt: number): void {
    if (this.disposed) return;
    const reduced = this.reducedMotion();
    for (let i = 0; i < MARKERS.length; i++) {
      const diff = (this.target[i] as number) - (this.scale[i] as number);
      if (diff === 0) continue;
      this.scale[i] = reduced || Math.abs(diff) < 0.01 ? (this.target[i] as number) : (this.scale[i] as number) + diff * Math.min(1, dt * POP_RATE);
      this.dirty = true;
    }
    if (this.dirty) {
      for (let i = 0; i < MARKERS.length; i++) {
        const s = this.scale[i] as number;
        this.dummy.position.set(this.markerBase[i * 3] as number, this.markerBase[i * 3 + 1] as number, this.markerBase[i * 3 + 2] as number);
        this.dummy.scale.setScalar(Math.max(s, 0.0001));
        this.dummy.updateMatrix();
        this.markerMesh.setMatrixAt(i, this.dummy.matrix);
      }
      this.markerMesh.instanceMatrix.needsUpdate = true;
      this.dirty = false;
    }
    if (this.colorDirty) {
      for (let i = 0; i < MARKERS.length; i++) this.markerMesh.setColorAt(i, this.highlight[i] ? GOLD : BONE);
      if (this.markerMesh.instanceColor) this.markerMesh.instanceColor.needsUpdate = true;
      this.colorDirty = false;
    }
    this.applyCamera();
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.markerMesh.dispose();
    disposeObject(this.scene);
    this.scene.clear();
    this.lineObjects = [];
  }

  private applyCamera(): void {
    this.rig.position(this.tmp);
    this.camera.position.copy(this.tmp);
    this.camera.lookAt(this.rig.targetX, this.rig.targetY, this.rig.targetZ);
    this.camera.updateMatrixWorld();
  }
}
