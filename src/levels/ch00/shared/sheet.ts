import * as THREE from 'three';
import type { LevelWorld } from '../../../gameplay/runtime/levelKit';

export interface ViewerSheet {
  /** Root placed in the scene (hidden until the viewer opens). */
  readonly root: THREE.Group;
  /** Turns with the right stick. */
  readonly pivot: THREE.Group;
}

/** Draws the recreated document (title, text, label stamp) on a canvas; RTL, locale strings only. */
function drawPaper(canvas: HTMLCanvasElement, title: string, body: string, stamp: string, license: string): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  g.fillStyle = '#efe4c9';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = 'rgba(120,90,50,0.16)';
  for (let i = 0; i < 40; i++) g.fillRect((i * 97) % canvas.width, (i * 53) % canvas.height, 3, 3);
  g.direction = 'rtl';
  g.textAlign = 'right';
  g.fillStyle = '#2b2118';
  g.font = 'bold 30px Heebo, sans-serif';
  g.fillText(title, 480, 64);
  g.font = '22px "Frank Ruhl Libre", serif';
  let line = '';
  let y = 120;
  for (const word of body.split(/\s+/)) {
    const test = line ? line + ' ' + word : word;
    if (g.measureText(test).width > 440 && line) {
      g.fillText(line, 480, y);
      line = word;
      y += 33;
      if (y > 560) break;
    } else line = test;
  }
  if (y <= 560 && line) g.fillText(line, 480, y);
  // Label stamp and license line at the foot of the sheet.
  g.strokeStyle = '#2f5d3a';
  g.fillStyle = '#2f5d3a';
  g.lineWidth = 3;
  g.strokeRect(300, 600, 180, 56);
  g.textAlign = 'center';
  g.font = 'bold 26px Heebo, sans-serif';
  g.fillText(stamp, 390, 638);
  g.textAlign = 'right';
  g.fillStyle = '#6b4a2e';
  g.font = '18px Heebo, sans-serif';
  g.fillText(license, 480, 690);
}

/** The 3D sheet of paper floating in front of the cabinet. Disposed with the world's bag. */
export function createViewerSheet(world: LevelWorld, text: { title: string; body: string; stamp: string; license: string } | null): ViewerSheet {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  root.add(pivot);
  const geo = world.bag.geometry(new THREE.PlaneGeometry(0.5, 0.7, 8, 8));
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / 0.5) * Math.PI) * 0.012);
  geo.computeVertexNormals();
  let map: THREE.CanvasTexture | null = null;
  if (text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 720;
    drawPaper(canvas, text.title, text.body, text.stamp, text.license);
    map = world.bag.track(new THREE.CanvasTexture(canvas));
    map.colorSpace = THREE.SRGBColorSpace;
  }
  const mat = world.bag.material(
    new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : '#efe4c9', map, emissive: '#ffe9c0', emissiveMap: map, emissiveIntensity: 0.45, roughness: 0.9, side: THREE.DoubleSide }),
  );
  pivot.add(new THREE.Mesh(geo, mat));
  root.visible = false;
  world.scene.add(root);
  return { root, pivot };
}
