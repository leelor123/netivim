import * as THREE from 'three';
import { disposeObject, type GameScene, type SceneGraphics } from '../render/sceneManager';
import { fogMixGlsl } from '../render/fogChunk';

const HILL_SEGMENTS = 96;
const HILL_SIZE = 220;
const TREE_MAX = 220;
const ROCK_MAX = 90;
const DUST_MAX = 900;
const SKY_RADIUS = 360;
const ATMOSPHERE_DENSITY = 0.0056;

/** Test hook: pins the camera animation to a fixed time for deterministic screenshots. */
let timeOverride: number | null = null;
export function setTitleTimeOverride(t: number | null): void {
  timeOverride = t;
}

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

/** Sun low over the western hills at dusk, slightly left of the view: long shadows, light shafts. */
const SUN_DIRECTION = new THREE.Vector3(-0.36, 0.17, -0.92).normalize();
const SUN_COLOR = new THREE.Color('#ffb46b');
const HORIZON = new THREE.Color('#f39a5a');
const ZENITH = new THREE.Color('#4c69a6');
const GROUND = new THREE.Color('#6a4f42');

const DITHER_GLSL = /* glsl */ `
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

/** Gradient sky with sun disk and forward-scattering glow (HDR values feed bloom and shafts). */
function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    name: 'TitleSky',
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: ZENITH },
      horizon: { value: HORIZON },
      ground: { value: GROUND },
      sunColor: { value: SUN_COLOR },
      sunDirection: { value: SUN_DIRECTION },
    },
    vertexShader: /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
    fragmentShader: /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 ground;
uniform vec3 sunColor;
uniform vec3 sunDirection;
varying vec3 vDir;
${DITHER_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(horizon, zenith, smoothstep(0.03, 0.7, h)) : mix(horizon, ground, smoothstep(0.0, 0.5, -h));
  float mu = max(dot(d, sunDirection), 0.0);
  // Mie-like forward glow: wide warm halo plus a tight bright core and the disk itself.
  col += sunColor * (pow(mu, 6.0) * 0.22 + pow(mu, 64.0) * 1.1);
  col += sunColor * smoothstep(0.99935, 0.99975, mu) * 10.0;
  // Banding guard for the smooth gradient (also on presets without the grading pass).
  col += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,
  });
  const sky = new THREE.Mesh(new THREE.IcosahedronGeometry(SKY_RADIUS, 3), material);
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  return sky;
}

/**
 * Atmospheric fog: the stock fog, tinted toward the sun color when looking into the sun
 * (in-scattering), so the hills dissolve into a glowing haze instead of a flat color.
 */
function patchAtmosphere(material: THREE.MeshStandardMaterial, sunView: THREE.IUniform, sunFog: THREE.IUniform): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSunView = sunView;
    shader.uniforms.uSunFog = sunFog;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nuniform vec3 uSunView;\nuniform vec3 uSunFog;')
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  // Same glow terms as the sky shader, so fogged hills melt into the sky behind them.
  float mu = max(dot(normalize(-vViewPosition), uSunView), 0.0);
  ${fogMixGlsl('fogLinear + uSunFog * (pow(mu, 6.0) * 0.22 + pow(mu, 64.0) * 1.1)')}
#endif
`,
      );
  };
}

/** Radial soft blob for contact shadows under trees (procedural, 64x64 alpha). */
function createBlobTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const a = Math.pow(1 - r, 1.6);
      const i = (y * size + x) * 4;
      // alphaMap samples the green channel; fill all channels with the falloff.
      const v = Math.round(a * 255);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  return tex;
}

/** Drifting dust motes lit by the low sun (GPU-animated, zero CPU per frame). */
function createDust(time: THREE.IUniform): THREE.Points {
  const positions = new Float32Array(DUST_MAX * 3);
  const seeds = new Float32Array(DUST_MAX);
  for (let i = 0; i < DUST_MAX; i++) {
    positions[i * 3] = (hash(i, 11) - 0.5) * 120;
    positions[i * 3 + 1] = hash(i, 12) * 14;
    positions[i * 3 + 2] = (hash(i, 13) - 0.5) * 120 - 10;
    seeds[i] = hash(i, 14);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    name: 'TitleDust',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { time, color: { value: SUN_COLOR }, pixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
attribute float seed;
uniform float time;
uniform float pixelRatio;
varying float vAlpha;
void main() {
  vec3 p = position;
  float t = time * (0.15 + seed * 0.2) + seed * 40.0;
  p.x += sin(t) * 1.5;
  p.y = mod(position.y + time * (0.1 + seed * 0.25), 14.0);
  p.z += cos(t * 0.7) * 1.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (0.9 + seed) * pixelRatio * 22.0 / -mv.z;
  vAlpha = smoothstep(0.0, 2.0, p.y) * (1.0 - smoothstep(10.0, 14.0, p.y)) * (0.35 + 0.65 * seed);
}
`,
    fragmentShader: /* glsl */ `
uniform vec3 color;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c)) * vAlpha;
  gl_FragColor = vec4(color * 1.6 * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return points;
}

/** Title backdrop: low-poly hills at dusk, instanced olive trees, haze, dust and light shafts. */
export function createTitleScene(): GameScene {
  const scene = new THREE.Scene();
  scene.background = HORIZON.clone();
  const atmosphericFog = new THREE.FogExp2(HORIZON.clone(), ATMOSPHERE_DENSITY);
  const edgeFog = new THREE.Fog(HORIZON.clone(), 50, 240);
  scene.fog = atmosphericFog;

  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 420);
  const sunView: THREE.IUniform<THREE.Vector3> = { value: new THREE.Vector3() };
  const sunFog: THREE.IUniform<THREE.Color> = { value: SUN_COLOR };
  const time: THREE.IUniform<number> = { value: 0 };

  const sky = createSky();
  scene.add(sky);

  scene.add(new THREE.HemisphereLight('#ffd2a1', '#4a3a4c', 0.95));
  const sun = new THREE.DirectionalLight(SUN_COLOR, 3.6);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(100);
  sun.castShadow = true;
  scene.add(sun, sun.target);
  // Soft cool fill from behind the camera keeps backlit faces readable.
  const fill = new THREE.DirectionalLight('#9fb4d8', 0.35);
  fill.position.set(20, 30, 60);
  scene.add(fill);

  const indexed = new THREE.PlaneGeometry(HILL_SIZE, HILL_SIZE, HILL_SEGMENTS, HILL_SEGMENTS);
  indexed.rotateX(-Math.PI / 2);
  const pos = indexed.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  const terrain = indexed.toNonIndexed();
  indexed.dispose();
  terrain.computeVertexNormals();
  const groundMat = new THREE.MeshStandardMaterial({ color: '#c98f58', roughness: 0.95, flatShading: true });
  patchAtmosphere(groundMat, sunView, sunFog);
  const ground = new THREE.Mesh(terrain, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);
  // Flat apron under and around the hills out to the ridges, so no gap ever shows the sky below.
  const apronGeo = new THREE.CircleGeometry(215, 48);
  apronGeo.rotateX(-Math.PI / 2);
  const apron = new THREE.Mesh(apronGeo, groundMat);
  apron.position.y = -4.6;
  apron.receiveShadow = true;
  scene.add(apron);

  // Distant ridges: a silhouette ring beyond the playable terrain, dissolved by the haze.
  const ridgeGeo = new THREE.CylinderGeometry(200, 200, 1, 48, 1, true);
  const rp = ridgeGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < rp.count; i++) {
    if (rp.getY(i) > 0) {
      const a = Math.atan2(rp.getZ(i), rp.getX(i));
      rp.setY(i, 10 + smoothNoise(a * 3 + 10, 2) * 22 + smoothNoise(a * 9, 5) * 6);
    } else {
      rp.setY(i, -8);
    }
  }
  ridgeGeo.computeVertexNormals();
  const ridgeMat = new THREE.MeshStandardMaterial({ color: '#8d6a55', roughness: 1, flatShading: true, side: THREE.DoubleSide });
  patchAtmosphere(ridgeMat, sunView, sunFog);
  const ridges = new THREE.Mesh(ridgeGeo, ridgeMat);
  scene.add(ridges);

  // One draw call for all trunks, one for all crowns, one for all rocks, one for contact blobs.
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 2.2, 5);
  trunkGeo.translate(0, 1.1, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1.6, 0);
  crownGeo.translate(0, 3.1, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5b4330', roughness: 1, flatShading: true });
  const crownMat = new THREE.MeshStandardMaterial({ color: '#76854a', roughness: 0.9, flatShading: true });
  patchAtmosphere(trunkMat, sunView, sunFog);
  patchAtmosphere(crownMat, sunView, sunFog);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_MAX);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, TREE_MAX);
  trunks.castShadow = true;
  crowns.castShadow = true;
  trunks.receiveShadow = true;
  crowns.receiveShadow = true;

  const blobMat = new THREE.MeshBasicMaterial({
    color: '#2a1d18',
    alphaMap: createBlobTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.45,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  blobGeo.rotateX(-Math.PI / 2);
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, TREE_MAX);
  blobs.renderOrder = 1;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3();
  // Instances are ordered by a hash so any prefix (vegetation density) is spread evenly.
  for (let i = 0; i < TREE_MAX; i++) {
    let x = (hash(i, 1) - 0.5) * 190;
    const z = (hash(i, 2) - 0.5) * 190;
    if (Math.abs(x) < 8) x += x < 0 ? -10 : 10;
    const y = terrainHeight(x, z);
    p.set(x, y - 0.2, z);
    q.setFromAxisAngle(up, hash(i, 3) * Math.PI * 2);
    const k = 0.7 + hash(i, 4) * 0.6;
    s.set(k, k, k);
    m.compose(p, q, s);
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
    // Contact blob aligned to the ground slope, lifted a few cm against z-fighting.
    n.set(terrainHeight(x - 0.5, z) - terrainHeight(x + 0.5, z), 1, terrainHeight(x, z - 0.5) - terrainHeight(x, z + 0.5)).normalize();
    q.setFromUnitVectors(up, n);
    p.set(x, y + 0.06, z);
    s.set(4.2 * k, 1, 4.2 * k);
    m.compose(p, q, s);
    blobs.setMatrixAt(i, m);
  }
  trunks.computeBoundingSphere();
  crowns.computeBoundingSphere();
  blobs.computeBoundingSphere();
  scene.add(trunks, crowns, blobs);

  const rockGeo = new THREE.DodecahedronGeometry(0.9, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: '#a3896f', roughness: 1, flatShading: true });
  patchAtmosphere(rockMat, sunView, sunFog);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_MAX);
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  for (let i = 0; i < ROCK_MAX; i++) {
    const x = (hash(i, 21) - 0.5) * 170;
    const z = (hash(i, 22) - 0.5) * 170;
    p.set(x, terrainHeight(x, z) - 0.15, z);
    q.setFromAxisAngle(up, hash(i, 23) * 6.28);
    const k = 0.5 + hash(i, 24) * 1.4;
    s.set(k * 1.3, k * 0.7, k);
    m.compose(p, q, s);
    rocks.setMatrixAt(i, m);
  }
  rocks.computeBoundingSphere();
  scene.add(rocks);

  const dust = createDust(time);
  scene.add(dust);
  const dustPixelRatio = (dust.material as THREE.ShaderMaterial).uniforms.pixelRatio ?? { value: 1 };

  const lookTarget = new THREE.Vector3(0, 6, -20);

  return {
    scene,
    camera,
    sun,
    sunDirection: SUN_DIRECTION,
    // The whole visible valley gets shadows; the haze hides anything beyond.
    shadowDistance: 150,
    era: 'archive',
    update(_dt, elapsed) {
      const t = timeOverride ?? elapsed;
      const a = t * 0.03;
      camera.position.set(Math.sin(a) * 34, 15 + Math.sin(t * 0.11) * 1.5, 46 + Math.cos(a) * 10);
      camera.lookAt(lookTarget);
      camera.updateMatrixWorld();
      sky.position.copy(camera.position);
      sunView.value.copy(SUN_DIRECTION).transformDirection(camera.matrixWorldInverse);
      time.value = t;
    },
    resize(width, height) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      dustPixelRatio.value = Math.max(1, height / 400);
    },
    applyGraphics({ options }: SceneGraphics) {
      const trees = Math.max(24, Math.round(TREE_MAX * options.vegetation));
      trunks.count = trees;
      crowns.count = trees;
      blobs.count = trees;
      rocks.count = Math.max(12, Math.round(ROCK_MAX * options.vegetation));
      dust.geometry.setDrawRange(0, Math.round(DUST_MAX * options.particles));
      dust.visible = options.particles > 0.05;
      // Real shadows ground the trees on higher presets; the blob stays as subtle contact shading.
      blobMat.opacity = options.shadows === 'off' ? 0.5 : 0.22;
      if (options.fog) {
        atmosphericFog.density = ATMOSPHERE_DENSITY / Math.max(0.6, options.renderDistance);
        scene.fog = atmosphericFog;
      } else {
        // Without atmosphere a plain linear fade still hides the edge of the world.
        edgeFog.near = 70 * options.renderDistance;
        edgeFog.far = 240;
        scene.fog = edgeFog;
      }
    },
    dispose() {
      disposeObject(scene);
    },
  };
}
