/* Shared primitives for the studio.

   Every object is built from unit-sized geometry and scaled per mesh: the whole
   studio (architecture, rig, gear) shares a handful of BufferGeometries, which
   keeps GPU memory flat and makes the wireframe pass — which reads the same
   geometry — guaranteed to sit exactly on the solid surfaces. */

import * as THREE from 'three';

export const BOX = new THREE.BoxGeometry(1, 1, 1);

export const CYL = new THREE.CylinderGeometry(1, 1, 1, 20, 1);
export const CYL12 = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
export const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
export const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6, 1);

/* Open cylinders / cones: their boundary rings give clean wireframe outlines. */
export const TUBE20 = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
export const TUBE8 = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);

/* Octabox body: wide opening at +Y, narrow mount at -Y (rotated to +Z). */
export const OCTA = new THREE.CylinderGeometry(1, 0.16, 1, 8, 1, true);
/* Beauty dish body. */
export const DISH = new THREE.CylinderGeometry(1, 0.3, 1, 24, 1, true);
/* Shallow front lip used on the big modifiers. */
export const RIM8 = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
export const RIM24 = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);

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
