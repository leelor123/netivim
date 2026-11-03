import * as THREE from 'three';
import { kitBuilder } from '../../../world/kit/buildings';
import { CELL } from './rules';

/**
 * Procedural geometry for the work site, built from the world kit's GeoBuilder (flat vertex
 * colors, one shared kit material). Wall modules face +x; the level rotates them per cell.
 * Everything is a plain colored low-poly shape: no weapons, nothing violent.
 */

const ERA = 'mandate1940' as const;
const PLANK = '#8b6c4a';
const PLANK_DARK = '#6b5038';
const GRAVEL = '#a69c88';
const TIMBER = '#7a5a3c';
const CLOTH = '#b8503c';
const DARK = '#2b2522';
const METAL = '#4a4744';

const b = (seed: string, jitter = 0.1) => kitBuilder({ era: ERA, seed }, jitter);

export const WALL_HEIGHT = 2.2;
const GAP = 0.62;

/** One cell (2 m) of the double plank wall, running along x: two plank layers with a gap. */
export function wallModule(): THREE.BufferGeometry {
  const g = b('wall-module');
  for (const side of [-1, 1]) {
    g.block(CELL, WALL_HEIGHT, 0.12, PLANK, 0, 0, side * GAP);
    g.block(0.18, WALL_HEIGHT + 0.3, 0.18, PLANK_DARK, -CELL / 2 + 0.09, 0, side * GAP);
  }
  g.block(0.1, 0.14, GAP * 2, PLANK_DARK, 0, WALL_HEIGHT * 0.55, 0);
  return g.build();
}

/** The corner cell as seen from the north-west; rotate for the other corners. */
export function cornerModule(): THREE.BufferGeometry {
  const g = b('corner-module');
  const o = CELL / 2 - 0.06;
  g.block(CELL, WALL_HEIGHT, 0.12, PLANK, 0, 0, -o);
  g.block(0.12, WALL_HEIGHT, CELL, PLANK, -o, 0, 0);
  g.block(CELL - 0.9, WALL_HEIGHT, 0.12, PLANK, 0.45, 0, -o + GAP * 2);
  g.block(0.12, WALL_HEIGHT, CELL - 0.9, PLANK, -o + GAP * 2, 0, 0.45);
  g.block(0.3, WALL_HEIGHT + 0.5, 0.3, PLANK_DARK, -o, 0, -o);
  return g.build();
}

/** Gravel fill between the layers of one straight cell (unit height, scaled by the fill level). */
export function gravelStraight(): THREE.BufferGeometry {
  return b('gravel-straight', 0.2).block(CELL - 0.05, WALL_HEIGHT - 0.25, GAP * 2 - 0.12, GRAVEL, 0, 0, 0).build();
}

export function gravelCorner(): THREE.BufferGeometry {
  const g = b('gravel-corner', 0.2);
  g.block(CELL - 0.1, WALL_HEIGHT - 0.25, GAP * 2 - 0.12, GRAVEL, 0, 0, -CELL / 2 + GAP + 0.06);
  g.block(GAP * 2 - 0.12, WALL_HEIGHT - 0.25, CELL - 0.1, GRAVEL, -CELL / 2 + GAP + 0.06, 0, 0);
  return g.build();
}

/** Flat chalk marking of one wall cell on the ground. */
export function outlineTile(): THREE.BufferGeometry {
  return b('outline', 0.05).block(CELL - 0.2, 0.05, CELL - 0.2, '#e3d8b4', 0, 0, 0).build();
}

/** Survey stake with a red rag. */
export function stake(): THREE.BufferGeometry {
  const g = b('stake');
  g.cyl(0.04, 0.05, 1.4, 5, PLANK_DARK, 0, 0.7, 0);
  g.box(0.3, 0.2, 0.02, CLOTH, 0.15, 1.25, 0);
  return g.build();
}

/** Hand cart with wheels (empty). */
export function cart(): THREE.BufferGeometry {
  const g = b('cart');
  g.block(2.6, 0.12, 1.5, PLANK_DARK, 0, 0.55, 0);
  for (const z of [-0.75, 0.75]) g.block(2.6, 0.35, 0.08, PLANK, 0, 0.67, z);
  g.block(0.08, 0.35, 1.5, PLANK, -1.3, 0.67, 0);
  for (const z of [-0.85, 0.85]) g.cyl(0.5, 0.5, 0.1, 10, TIMBER, 0.2, 0.5, z, Math.PI / 2);
  g.block(1.8, 0.08, 0.08, PLANK_DARK, 2.1, 0.5, 0.3);
  g.block(1.8, 0.08, 0.08, PLANK_DARK, 2.1, 0.5, -0.3);
  return g.build();
}

/** A stack of prefabricated frames lying on a cart. */
export function cartLoad(): THREE.BufferGeometry {
  const g = b('cart-load');
  for (let i = 0; i < 4; i++) {
    g.block(2.3, 0.14, 1.3, i % 2 ? PLANK : '#9a7b52', 0, 0.62 + i * 0.16, 0, i * 0.02);
    g.block(2.3, 0.05, 0.1, PLANK_DARK, 0, 0.62 + i * 0.16 + 0.14, 0.35);
  }
  return g.build();
}

export function gravelPile(): THREE.BufferGeometry {
  const g = b('gravel-pile', 0.25);
  g.blob(1.5, GRAVEL, 0, 0.2, 0, 1.2, 0.55, 1.1, 1);
  g.blob(0.9, '#b0a690', 1.1, 0.1, 0.5, 1, 0.5, 1, 1);
  g.cyl(0.18, 0.2, 0.4, 8, METAL, -1.2, 0.2, 0.8);
  g.cyl(0.18, 0.2, 0.4, 8, METAL, -1.7, 0.2, 0.3);
  return g.build();
}

/** Timber sections waiting to be carried to the tower. */
export function sectionPile(): THREE.BufferGeometry {
  const g = b('section-pile');
  for (let i = 0; i < 3; i++) {
    g.block(0.18, 0.18, 3.0, TIMBER, -0.5 + i * 0.5, 0.45 + (i % 2) * 0.08, -0.4);
  }
  for (let i = 0; i < 4; i++) g.block(2.2, 0.15, 0.25, PLANK, 0, 0.1 + i * 0.16, 0.9);
  return g.build();
}

/** Crate holding the searchlight. */
export function lightCrate(): THREE.BufferGeometry {
  const g = b('light-crate');
  g.block(1.0, 0.8, 0.8, '#9a7b52', 0, 0, 0);
  g.box(1.02, 0.08, 0.84, '#7a5c3a', 0, 0.78, 0);
  g.cyl(0.28, 0.22, 0.5, 8, METAL, 0, 0.95, 0, Math.PI / 2);
  return g.build();
}

/** Planning table: trestles, a board and the site plan. */
export function planningTable(): THREE.BufferGeometry {
  const g = b('table');
  for (const x of [-0.9, 0.9]) for (const z of [-0.5, 0.5]) g.block(0.1, 0.85, 0.1, PLANK_DARK, x, 0, z);
  g.block(2.4, 0.08, 1.4, PLANK, 0, 0.85, 0);
  g.block(1.9, 0.02, 1.1, '#e7dcc0', 0, 0.93, 0);
  for (let i = 0; i < 4; i++) g.block(1.6, 0.012, 0.03, '#6b5038', 0, 0.95, -0.4 + i * 0.27);
  return g.build();
}

export function jug(): THREE.BufferGeometry {
  const g = b('jug');
  g.block(0.9, 0.5, 0.9, PLANK, 0, 0, 0);
  g.blob(0.28, '#b36a45', 0, 0.78, 0, 1, 1.25, 1, 1);
  g.cyl(0.1, 0.12, 0.2, 7, '#b36a45', 0, 1.15, 0);
  return g.build();
}

/** Blanket with bread, olives and a pot for the midday meal. */
export function mealBlanket(): THREE.BufferGeometry {
  const g = b('meal');
  g.block(2.2, 0.04, 1.6, '#a85a45', 0, 0, 0);
  g.block(2.0, 0.045, 0.2, '#e2d2a8', 0, 0.01, -0.4);
  g.blob(0.2, '#c9a566', -0.4, 0.2, 0.1, 1.3, 0.7, 1, 1);
  g.blob(0.2, '#c9a566', 0.1, 0.2, 0.2, 1.3, 0.7, 1, 1);
  g.cyl(0.22, 0.22, 0.2, 8, '#5d4a36', 0.7, 0.14, -0.2);
  g.blob(0.07, '#4a5236', 0.5, 0.1, 0.45);
  g.blob(0.07, '#4a5236', 0.62, 0.1, 0.5);
  return g.build();
}

const LEG_H = 3.4;
const LEG = 1.45;

/** Tower section 0, 1 (timber legs and braces) or 2 (platform, cabin and roof). Local y is absolute. */
export function towerSection(k: number): THREE.BufferGeometry {
  const g = b('tower-' + String(k), 0.08);
  if (k < 2) {
    const y0 = k * LEG_H;
    const taper = 0.12 * (1 - k * 0.2);
    for (const x of [-LEG, LEG]) for (const z of [-LEG, LEG]) g.cyl(0.11, 0.14 + taper, LEG_H, 6, TIMBER, x * (1 - k * 0.04), y0 + LEG_H / 2, z * (1 - k * 0.04));
    for (const y of [y0 + 0.1, y0 + LEG_H - 0.1, y0 + LEG_H / 2]) {
      g.box(LEG * 2.2, 0.1, 0.1, TIMBER, 0, y, -LEG);
      g.box(LEG * 2.2, 0.1, 0.1, TIMBER, 0, y, LEG);
      g.box(0.1, 0.1, LEG * 2.2, TIMBER, -LEG, y, 0);
      g.box(0.1, 0.1, LEG * 2.2, TIMBER, LEG, y, 0);
    }
    for (const z of [-LEG, LEG]) g.box(0.08, Math.hypot(LEG_H, LEG * 2) * 0.98, 0.08, TIMBER, 0, y0 + LEG_H / 2, z, 0, 0, Math.atan2(LEG * 2, LEG_H));
    for (const x of [-LEG, LEG]) g.box(0.08, Math.hypot(LEG_H, LEG * 2) * 0.98, 0.08, TIMBER, x, y0 + LEG_H / 2, 0, 0, Math.atan2(LEG * 2, LEG_H), 0);
    for (let i = 0; i < 6; i++) g.box(0.6, 0.05, 0.05, '#5a412b', 0, y0 + 0.3 + i * 0.55, LEG + 0.28);
    return g.build();
  }
  const y = 2 * LEG_H;
  g.block(4.0, 0.2, 4.0, PLANK_DARK, 0, y, 0);
  g.block(3.5, 2.1, 3.5, PLANK, 0, y + 0.2, 0);
  for (const s of [-1, 1]) {
    g.box(2.8, 0.55, 0.06, DARK, 0, y + 1.5, s * 1.78);
    g.box(0.06, 0.55, 2.8, DARK, s * 1.78, y + 1.5, 0);
  }
  g.pyramid(4.4, 0.95, 4.4, '#7d8285', 0, y + 2.3, 0);
  g.cyl(0.07, 0.07, 0.7, 5, METAL, 0, y + 3.1, 0);
  return g.build();
}

export const TOWER_TOP_Y = 2 * LEG_H + 3.55;

/** The searchlight head on top of the cabin (pointing +z; the level rotates it). */
export function lampHead(): THREE.BufferGeometry {
  const g = b('lamp', 0.02);
  g.cyl(0.34, 0.26, 0.62, 10, METAL, 0, 0, 0.1, Math.PI / 2);
  g.cyl(0.3, 0.3, 0.04, 10, '#fff1c4', 0, 0, 0.42, Math.PI / 2);
  g.cyl(0.07, 0.07, 0.4, 5, METAL, 0, -0.3, 0);
  return g.build();
}

/** Open cone of light, apex at the origin, widening along +z. */
export function beamCone(length: number, radius: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(radius, length, 20, 1, true);
  g.translate(0, -length / 2, 0);
  g.rotateX(-Math.PI / 2);
  return g;
}

export function fencePost(): THREE.BufferGeometry {
  const g = b('fence-post');
  g.cyl(0.06, 0.08, 1.5, 5, PLANK_DARK, 0, 0.75, 0);
  return g.build();
}

/** A fence leg of `length` meters along x: posts every 3 m and three strands of wire. */
export function fenceLeg(length: number): THREE.BufferGeometry {
  const g = b('fence-leg-' + String(Math.round(length)));
  const n = Math.max(1, Math.round(length / 3));
  for (let i = 0; i <= n; i++) g.cyl(0.05, 0.06, 1.4, 5, PLANK_DARK, -length / 2 + (i * length) / n, 0.7, 0);
  for (const y of [0.4, 0.8, 1.2]) g.box(length, 0.02, 0.02, '#55534f', 0, y, 0);
  return g.build();
}

export function bucket(): THREE.BufferGeometry {
  const g = b('bucket', 0.02);
  g.cyl(0.22, 0.17, 0.3, 8, METAL, 0, 0.15, 0);
  g.blob(0.2, GRAVEL, 0, 0.32, 0, 1, 0.45, 1);
  return g.build();
}

/** A carried timber section (shown over the player's head). */
export function carriedBeam(): THREE.BufferGeometry {
  const g = b('carried-beam', 0.05);
  g.block(0.16, 0.16, 2.0, TIMBER, 0, 0, 0);
  g.block(0.16, 0.16, 2.0, TIMBER, 0.3, 0, 0);
  return g.build();
}

/** Glowing window panes of the village on the hill (unlit material, colors above 1 feed bloom). */
export function windowGlow(): THREE.BufferGeometry {
  const g = kitBuilder({ era: ERA, seed: 'window-glow' }, 0);
  g.box(0.5, 0.6, 0.05, [1.6, 1.1, 0.5], 0, 0, 0);
  return g.build();
}
