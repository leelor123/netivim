import * as THREE from 'three';

/** Linear-space RGB triple (what vertex color attributes hold). */
export type RGB = [number, number, number];

const scratch = new THREE.Color();

/** sRGB hex (authoring space) to a linear RGB triple. */
export function rgb(hex: number | string): RGB {
  scratch.set(hex);
  return [scratch.r, scratch.g, scratch.b];
}

export function mixInto(out: RGB, a: Readonly<RGB>, b: Readonly<RGB>, t: number): RGB {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

export function copyInto(out: RGB, a: Readonly<RGB>): RGB {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  return out;
}

export function scaleInto(out: RGB, k: number): RGB {
  out[0] *= k;
  out[1] *= k;
  out[2] *= k;
  return out;
}

/** Multiplies by a tint and pulls toward grey (saturation < 1) for era grading. */
export function gradeInto(out: RGB, tint: Readonly<RGB>, saturation: number): RGB {
  const l = out[0] * 0.2126 + out[1] * 0.7152 + out[2] * 0.0722;
  out[0] = (l + (out[0] - l) * saturation) * tint[0];
  out[1] = (l + (out[1] - l) * saturation) * tint[1];
  out[2] = (l + (out[2] - l) * saturation) * tint[2];
  return out;
}
