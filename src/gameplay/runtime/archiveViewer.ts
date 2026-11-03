import * as THREE from 'three';
import type { ArchiveItem } from '../../content/schema';
import type { GameScene } from '../../render/sceneManager';

/**
 * 3D archive viewer (DESIGN feature 3): the document lies as a sheet of paper (or a card for
 * recreations) on a desk under a lamp; the right stick / drag turns it. Text is drawn on a
 * canvas texture from locale strings only.
 */
export interface ArchiveViewerScene extends GameScene {
  /** Right-stick input, -1..1. */
  turn(x: number, y: number, dt: number): void;
}

export function createArchiveViewer(item: ArchiveItem, title: string, body: string, reducedMotion: () => boolean): ArchiveViewerScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#14110d');
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 50);
  camera.position.set(0, 1.25, 1.05);
  camera.lookAt(0, 0.78, 0);

  const hemi = new THREE.HemisphereLight('#f4e6c8', '#1a140e', 0.6);
  const lamp = new THREE.DirectionalLight('#ffe2b0', 2.2);
  lamp.position.set(-0.8, 2.2, 0.6);
  scene.add(hemi, lamp);

  const deskGeo = new THREE.BoxGeometry(2.4, 0.06, 1.4);
  const deskMat = new THREE.MeshStandardMaterial({ color: '#5a3d28', roughness: 0.7 });
  const desk = new THREE.Mesh(deskGeo, deskMat);
  desk.position.y = 0.72;
  scene.add(desk);

  // Paper texture from text (2D canvas, RTL).
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 720;
  const g = canvas.getContext('2d');
  if (g) {
    const paper = item.license === 'recreation' ? '#efe4c9' : '#e9dfc6';
    g.fillStyle = paper;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = 'rgba(120,90,50,0.18)';
    for (let i = 0; i < 40; i++) g.fillRect((i * 97) % 512, (i * 53) % 720, 3, 3);
    g.direction = 'rtl';
    g.textAlign = 'right';
    g.fillStyle = '#2b2118';
    g.font = 'bold 30px Heebo, sans-serif';
    g.fillText(title, 480, 70);
    g.font = '22px "Frank Ruhl Libre", serif';
    const words = body.split(/\s+/);
    let line = '';
    let y = 130;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (g.measureText(test).width > 440 && line) {
        g.fillText(line, 480, y);
        line = w;
        y += 34;
        if (y > 680) break;
      } else line = test;
    }
    if (y <= 680 && line) g.fillText(line, 480, y);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const paperGeo = new THREE.PlaneGeometry(0.5, 0.7, 8, 8);
  // Slight curl so it reads as paper.
  const pos = paperGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / 0.5) * Math.PI) * 0.012);
  paperGeo.computeVertexNormals();
  const paperMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide });
  const paper = new THREE.Mesh(paperGeo, paperMat);
  const holder = new THREE.Group();
  holder.position.set(0, 0.76, 0);
  paper.rotation.x = -Math.PI / 2 + 0.35;
  paper.position.y = 0.09;
  holder.add(paper);
  scene.add(holder);

  let yaw = 0;
  let pitch = 0;
  let t = 0;
  return {
    scene,
    camera,
    era: 'archive',
    turn(x, y, dt) {
      yaw = Math.max(-1.2, Math.min(1.2, yaw - x * dt * 1.5));
      pitch = Math.max(-0.5, Math.min(0.6, pitch + y * dt * 1.2));
    },
    update(dt) {
      t += dt;
      const sway = reducedMotion() ? 0 : Math.sin(t * 0.6) * 0.02;
      holder.rotation.set(pitch, yaw + sway, 0);
    },
    resize(w, h) {
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    },
    dispose() {
      deskGeo.dispose();
      deskMat.dispose();
      paperGeo.dispose();
      paperMat.dispose();
      tex.dispose();
      lamp.dispose();
      hemi.dispose();
      scene.clear();
    },
  };
}
