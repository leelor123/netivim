import * as THREE from 'three';

const HILL_SEGMENTS = 96;
const HILL_SIZE = 220;
const TREE_COUNT = 140;

/** Deterministic hash so the landscape is identical on every launch. */
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function terrainHeight(x: number, z: number): number {
  let h = 0;
  let amp = 9;
  let freq = 0.018;
  for (let i = 0; i < 4; i++) {
    h += smoothNoise(x * freq, z * freq) * amp;
    amp *= 0.45;
    freq *= 2.1;
  }
  // Flatten a gentle valley through the middle.
  const valley = Math.min(1, Math.abs(x) / 30);
  return h * (0.25 + 0.75 * valley) - 4;
}

export interface TitleScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  update(elapsed: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

/** Placeholder title backdrop: low-poly hills at dusk with instanced olive trees. */
export function createTitleScene(): TitleScene {
  const scene = new THREE.Scene();
  const skyColor = new THREE.Color('#e9a76b');
  scene.background = skyColor;
  scene.fog = new THREE.Fog(skyColor, 60, 190);

  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 400);

  scene.add(new THREE.HemisphereLight('#ffd9a8', '#3a2d3f', 1.4));
  const sun = new THREE.DirectionalLight('#ffc27a', 2.6);
  sun.position.set(-60, 35, -80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  const sc = sun.shadow.camera;
  sc.left = -80;
  sc.right = 80;
  sc.top = 80;
  sc.bottom = -80;
  sc.near = 1;
  sc.far = 260;
  scene.add(sun);

  const indexed = new THREE.PlaneGeometry(HILL_SIZE, HILL_SIZE, HILL_SEGMENTS, HILL_SEGMENTS);
  indexed.rotateX(-Math.PI / 2);
  const pos = indexed.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  const terrain = indexed.toNonIndexed();
  indexed.dispose();
  terrain.computeVertexNormals();
  const ground = new THREE.Mesh(
    terrain,
    new THREE.MeshStandardMaterial({ color: '#c9925a', roughness: 0.95, flatShading: true }),
  );
  ground.receiveShadow = true;
  scene.add(ground);

  // One draw call for all trunks and one for all crowns.
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 2.2, 5);
  trunkGeo.translate(0, 1.1, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1.6, 0);
  crownGeo.translate(0, 3.1, 0);
  const trunks = new THREE.InstancedMesh(
    trunkGeo,
    new THREE.MeshStandardMaterial({ color: '#5b4330', roughness: 1, flatShading: true }),
    TREE_COUNT,
  );
  const crowns = new THREE.InstancedMesh(
    crownGeo,
    new THREE.MeshStandardMaterial({ color: '#7d8b4e', roughness: 0.9, flatShading: true }),
    TREE_COUNT,
  );
  trunks.castShadow = true;
  crowns.castShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < TREE_COUNT; i++) {
    let x = (hash(i, 1) - 0.5) * 180;
    const z = (hash(i, 2) - 0.5) * 180;
    if (Math.abs(x) < 8) x += x < 0 ? -10 : 10;
    p.set(x, terrainHeight(x, z) - 0.2, z);
    q.setFromAxisAngle(up, hash(i, 3) * Math.PI * 2);
    const k = 0.7 + hash(i, 4) * 0.6;
    s.set(k, k, k);
    m.compose(p, q, s);
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
  }
  scene.add(trunks, crowns);

  const lookTarget = new THREE.Vector3(0, 2, -20);

  return {
    scene,
    camera,
    update(elapsed) {
      const a = elapsed * 0.03;
      camera.position.set(Math.sin(a) * 34, 16 + Math.sin(elapsed * 0.11) * 1.5, 46 + Math.cos(a) * 10);
      camera.lookAt(lookTarget);
    },
    resize(width, height) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    dispose() {
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    },
  };
}
