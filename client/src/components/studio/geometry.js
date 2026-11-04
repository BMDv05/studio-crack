/* Shared primitives for the studio.

   Every object is built from unit-sized geometry and scaled per mesh: the whole
   studio (architecture, rig, gear) shares a handful of BufferGeometries, which
   keeps GPU memory flat and makes the wireframe pass — which reads the same
   geometry — guaranteed to sit exactly on the solid surfaces. */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const BOX = new THREE.BoxGeometry(1, 1, 1);

export const CYL = new THREE.CylinderGeometry(1, 1, 1, 20, 1);
export const CYL12 = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
export const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
export const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6, 1);

/* Open cylinders / cones: their boundary rings give clean wireframe outlines. */
export const TUBE20 = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
export const TUBE8 = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);

/* Parabolic softbox: opening at +Y, apex at -Y (rotated to +Z). The fabric sags
   a little between the ribs, which is what gives the real thing its pleats. */
const UMBRELLA_SPOKES = 16;

function umbrella(rings = 10) {
  const cols = UMBRELLA_SPOKES * 2;
  const position = [];
  const index = [];
  for (let j = 0; j <= rings; j += 1) {
    const t = j / rings;
    for (let i = 0; i < cols; i += 1) {
      const a = (i / cols) * Math.PI * 2;
      const sag = i % 2 === 1 ? t * 0.05 : 0;
      const r = t * (1 - sag);
      position.push(Math.sin(a) * r, t * t - 0.5 - sag * 0.5, Math.cos(a) * r);
    }
  }
  for (let j = 0; j < rings; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const a = j * cols + i;
      const b = j * cols + ((i + 1) % cols);
      const c = a + cols;
      const d = b + cols;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
export const UMBRELLA = umbrella();

/* The spokes, riding just outside the fabric. */
function umbrellaRibs() {
  const parts = [];
  for (let i = 0; i < UMBRELLA_SPOKES; i += 1) {
    const a = (i / UMBRELLA_SPOKES) * Math.PI * 2;
    const points = [];
    for (let k = 0; k <= 8; k += 1) {
      const t = k / 8;
      points.push(new THREE.Vector3(Math.sin(a) * t, t * t - 0.508, Math.cos(a) * t));
    }
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 10, 0.0065, 4, false));
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}
export const UMBRELLA_RIBS = umbrellaRibs();

/* Quarter-round where the seamless paper leaves the wall and meets the floor.
   Unit size: starts at the wall (y = 1, z = 0), lands on the floor (y = 0, z = 1). */
function sweep(segments = 16) {
  const position = [];
  const normal = [];
  const index = [];
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 0.5;
    const y = 1 - Math.sin(a);
    const z = 1 - Math.cos(a);
    position.push(-0.5, y, z, 0.5, y, z);
    normal.push(0, Math.sin(a), Math.cos(a), 0, Math.sin(a), Math.cos(a));
  }
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setIndex(index);
  return g;
}
export const SWEEP = sweep();

export const DISC24 = new THREE.CircleGeometry(1, 24);
export const DISC8 = new THREE.CircleGeometry(1, 8);
/* The hero glass is inspected from a few centimetres; a 24-gon edge is
   unmistakable there. 256 keeps the rim round even as the camera crosses it. */
export const DISC256 = new THREE.CircleGeometry(1, 256);
export const DISC128 = new THREE.CircleGeometry(1, 128);
export const PLANE = new THREE.PlaneGeometry(1, 1);

export const TORUS16 = new THREE.TorusGeometry(1, 0.02, 6, 16);

/* The hero lens is only seen from a few centimetres away; these two smooth
   versions are swapped in by the finale-only lens detail. */
export const TORUS64 = new THREE.TorusGeometry(1, 0.02, 10, 64);
export const TUBE64 = new THREE.CylinderGeometry(1, 1, 1, 64, 1, true);

/* Knurled / geared ring: a 120-sided cylinder whose alternate side vertices are
   pulled in (fine pitch, like real zoom rubber and focus gears). */
function knurl(segments = 120, depth = 0.035) {
  const g = new THREE.CylinderGeometry(1, 1, 1, segments, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (Math.hypot(x, z) < 0.99) continue;
    const k = Math.round((Math.atan2(x, z) / (Math.PI * 2)) * segments);
    if (((k % 2) + 2) % 2 === 1) {
      pos.setX(i, x * (1 - depth));
      pos.setZ(i, z * (1 - depth));
    }
  }
  g.computeVertexNormals();
  return g;
}
export const KNURL = knurl();
