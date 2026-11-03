import * as THREE from 'three';

/** Extra room toward the sun so casters just outside the view (tall trees, hills) still cast. */
const CASTER_MARGIN = 40;

/**
 * Radius and center distance of the smallest sphere around the camera frustum slice [near, far].
 * Pure math (unit tested). k = (w^2 + h^2) / z^2 for the frustum's half extents at depth z.
 */
export function frustumSliceSphere(fovDeg: number, aspect: number, near: number, far: number): { radius: number; centerZ: number } {
  const t = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  const k = t * t * (1 + aspect * aspect);
  let centerZ = ((far + near) * (1 + k)) / 2;
  if (centerZ > far) centerZ = far;
  const radius = Math.sqrt(k * far * far + (far - centerZ) * (far - centerZ));
  return { radius, centerZ };
}

/** World units per shadow-map texel for a fitted ortho frustum of this radius. */
export function shadowTexelSize(radius: number, mapSize: number): number {
  return (2 * radius) / Math.max(1, mapSize);
}

/**
 * Fits a directional light's shadow camera tightly around the visible part of the view frustum
 * (up to the shadow distance), every frame, without allocating:
 * - a bounding sphere (not a box) so the shadow frustum size never changes as the camera turns;
 * - the center snapped to whole shadow texels in light space so edges do not shimmer;
 * - bias / normalBias derived from the texel size: no acne on slopes, no peter-panning.
 */
export class ShadowFitter {
  private readonly center = new THREE.Vector3();
  private readonly lightDir = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly worldUp = new THREE.Vector3(0, 1, 0);
  private lastRadius = -1;
  private keyFov = -1;
  private keyAspect = -1;
  private keyNear = -1;
  private keyFar = -1;
  private radius = 1;
  private centerZ = 1;

  /**
   * @param sunDirection normalized, pointing from the scene toward the sun.
   * @param distance shadow distance in world units (clamped to the camera far plane).
   */
  fit(light: THREE.DirectionalLight, camera: THREE.PerspectiveCamera, sunDirection: THREE.Vector3, distance: number, mapSize: number): void {
    const far = Math.min(camera.far, Math.max(camera.near + 1, distance));
    if (camera.fov !== this.keyFov || camera.aspect !== this.keyAspect || camera.near !== this.keyNear || far !== this.keyFar) {
      const s = frustumSliceSphere(camera.fov, camera.aspect, camera.near, far);
      // Round the radius up to a 1 m step so tiny aspect changes do not rescale the shadow map.
      this.radius = Math.ceil(s.radius);
      this.centerZ = s.centerZ;
      this.keyFov = camera.fov;
      this.keyAspect = camera.aspect;
      this.keyNear = camera.near;
      this.keyFar = far;
    }
    const r = this.radius;

    // Sphere center in world space: on the view axis, centerZ in front of the camera.
    camera.updateMatrixWorld();
    this.center.set(0, 0, -this.centerZ).applyMatrix4(camera.matrixWorld);

    // Light-space basis (rotation only) and texel snapping.
    this.lightDir.copy(sunDirection).negate();
    if (Math.abs(this.lightDir.y) > 0.99) this.worldUp.set(1, 0, 0);
    else this.worldUp.set(0, 1, 0);
    this.right.crossVectors(this.worldUp, this.lightDir).normalize();
    this.up.crossVectors(this.lightDir, this.right).normalize();
    const texel = shadowTexelSize(r, mapSize);
    const x = Math.round(this.center.dot(this.right) / texel) * texel;
    const y = Math.round(this.center.dot(this.up) / texel) * texel;
    const z = this.center.dot(this.lightDir);
    this.center.copy(this.right).multiplyScalar(x).addScaledVector(this.up, y).addScaledVector(this.lightDir, z);

    light.target.position.copy(this.center);
    light.target.updateMatrixWorld();
    light.position.copy(this.center).addScaledVector(sunDirection, r + CASTER_MARGIN);
    light.updateMatrixWorld();

    const cam = light.shadow.camera;
    if (r !== this.lastRadius) {
      cam.left = -r;
      cam.right = r;
      cam.top = r;
      cam.bottom = -r;
      cam.near = 0.5;
      cam.far = 2 * r + CASTER_MARGIN;
      cam.updateProjectionMatrix();
      this.lastRadius = r;
    }
    // normalBias is in world units: one texel pushes the lookup off sloped surfaces (no acne)
    // while staying far below object thickness (no visible detachment / peter-panning).
    light.shadow.normalBias = texel;
    // bias is in normalized light depth; a third of a texel of depth handles flat receivers.
    light.shadow.bias = -(texel * 0.35) / (cam.far - cam.near);
  }

  /** Forces a recompute (e.g. after context restore or map size change). */
  invalidate(): void {
    this.lastRadius = -1;
    this.keyFov = -1;
  }
}
