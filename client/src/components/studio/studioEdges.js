/* Build the blueprint line geometry.

   Every visible mesh inside the studio root contributes its real edges
   (EdgesGeometry, thresholded so a cylinder does not explode into 20 lines).
   Each segment is written into a flat buffer with four extra attributes:

     aSeed   progress at which this stroke starts
     aDur    how long (in progress units) the stroke takes to draw
     aTint   0 = cyan, 1 = cool white
     aOther  the segment's other endpoint  (lets the shader grow the stroke)
     aTip    0 on the start vertex, 1 on the end vertex

   Because the wireframe reads the same geometry and world matrices as the
   solid meshes, the lines and the materialised studio are identical in space.
   The floor plan is appended as its own early-timed segment set. */

import * as THREE from 'three';
import { hash01 } from './studioMath.js';

const DEFAULT_PART = { seed: 0.3, spread: 0.05, tint: 0.3, dur: 0.05 };

const edgeCache = new WeakMap();

function localEdges(geometry, angle) {
  let perGeometry = edgeCache.get(geometry);
  if (!perGeometry) {
    perGeometry = new Map();
    edgeCache.set(geometry, perGeometry);
  }
  let arr = perGeometry.get(angle);
  if (!arr) {
    const edges = new THREE.EdgesGeometry(geometry, angle);
    arr = edges.attributes.position.array.slice();
    edges.dispose();
    perGeometry.set(angle, arr);
  }
  return arr;
}

function partOf(object, root) {
  let node = object;
  while (node && node !== root) {
    const data = node.userData;
    if (data && data.seed !== undefined) {
      return {
        seed: data.seed,
        spread: data.spread ?? 0.05,
        tint: data.tint ?? 0.3,
        dur: data.dur ?? 0.05,
      };
    }
    node = node.parent;
  }
  return DEFAULT_PART;
}

const v3 = new THREE.Vector3();

export function buildStudioLines(root) {
  const position = [];
  const other = [];
  const tip = [];
  const seedAttr = [];
  const durAttr = [];
  const tintAttr = [];

  let index = 0;

  const pushSegment = (ax, ay, az, bx, by, bz, meta) => {
    const seed = meta.seed + meta.spread * hash01(index * 0.731 + meta.seed * 19.3 + 1.7);
    const tint = Math.min(1, Math.max(0, meta.tint + (hash01(index * 1.37 + 5.1) - 0.5) * 0.26));

    position.push(ax, ay, az);
    other.push(bx, by, bz);
    tip.push(0);
    seedAttr.push(seed);
    durAttr.push(meta.dur);
    tintAttr.push(tint);

    position.push(bx, by, bz);
    other.push(ax, ay, az);
    tip.push(1);
    seedAttr.push(seed);
    durAttr.push(meta.dur);
    tintAttr.push(tint);

    index += 1;
  };

  root.updateMatrixWorld(true);

  root.traverse((object) => {
    if (!object.isMesh || object.userData.noEdges) return;
    const geometry = object.geometry;
    if (!geometry || !geometry.attributes || !geometry.attributes.position) return;
    const angle = object.userData.edgeAngle ?? 32;
    const edges = localEdges(geometry, angle);
    const meta = partOf(object, root);
    const matrix = object.matrixWorld;

    for (let i = 0; i < edges.length; i += 6) {
      const ax = edges[i];
      const ay = edges[i + 1];
      const az = edges[i + 2];
      const bx = edges[i + 3];
      const by = edges[i + 4];
      const bz = edges[i + 5];

      v3.set(ax, ay, az).applyMatrix4(matrix);
      const wax = v3.x;
      const way = v3.y;
      const waz = v3.z;
      v3.set(bx, by, bz).applyMatrix4(matrix);
      pushSegment(wax, way, waz, v3.x, v3.y, v3.z, meta);
    }
  });

  /* The architectural plan, drawn on the floor before anything rises. */
  const plan = buildFloorPlanSegments();
  for (let i = 0; i < plan.length; i += 1) {
    const seg = plan[i];
    pushSegment(seg.a[0], 0.015, seg.a[1], seg.b[0], 0.015, seg.b[1], {
      seed: seg.seed,
      spread: seg.spread ?? 0.028,
      tint: seg.tint ?? 0.12,
      dur: 0.045,
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('aOther', new THREE.Float32BufferAttribute(other, 3));
  geometry.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seedAttr, 1));
  geometry.setAttribute('aDur', new THREE.Float32BufferAttribute(durAttr, 1));
  geometry.setAttribute('aTint', new THREE.Float32BufferAttribute(tintAttr, 1));
  return geometry;
}

/* --------------------------------------------------------------------------
   Floor plan
   -------------------------------------------------------------------------- */

function buildFloorPlanSegments() {
  const out = [];

  const seg = (x1, z1, x2, z2, seed, tint = 0.1, spread = 0.02) => {
    out.push({ a: [x1, z1], b: [x2, z2], seed, tint, spread });
  };

  const rect = (x1, z1, x2, z2, seed, tint = 0.1) => {
    seg(x1, z1, x2, z1, seed, tint);
    seg(x2, z1, x2, z2, seed + 0.004, tint);
    seg(x2, z2, x1, z2, seed + 0.008, tint);
    seg(x1, z2, x1, z1, seed + 0.012, tint);
  };

  const circle = (cx, cz, r, seed, tint = 0.7, steps = 24) => {
    for (let i = 0; i < steps; i += 1) {
      const a0 = (i / steps) * Math.PI * 2;
      const a1 = ((i + 1) / steps) * Math.PI * 2;
      seg(
        cx + Math.cos(a0) * r,
        cz + Math.sin(a0) * r,
        cx + Math.cos(a1) * r,
        cz + Math.sin(a1) * r,
        seed + (i / steps) * 0.018,
        tint,
        0.006,
      );
    }
  };

  /* Room outline and long axes. Seeds below zero mean a few strokes are
     already drawn when the intro curtain opens — the plan is never empty. */
  rect(-5, -7.2, 5, 10.6, -0.075);
  seg(0, -7.2, 0, 10.6, -0.085, 0.6);
  seg(-2.6, -7.2, -2.6, 10.6, -0.06, 0.05);
  seg(2.6, -7.2, 2.6, 10.6, -0.06, 0.05);

  /* Backdrop and its floor mat. */
  rect(-2.5, -7.15, 2.5, -4.0, -0.02);
  seg(-2.3, -7.02, 2.3, -7.02, 0.0, 0.8);
  seg(-2.3, -6.98, -2.3, -7.2, 0.002, 0.8);
  seg(2.3, -6.98, 2.3, -7.2, 0.002, 0.8);

  /* Right-hand paper roll footprint. */
  rect(2.52, -7.1, 4.98, -6.88, 0.01, 0.75);

  /* Equipment footprints. */
  circle(-1.75, 2.3, 0.72, 0.004, 0.72);
  circle(0.85, 4.0, 0.68, 0.008, 0.72);
  circle(-2.25, 0.55, 0.58, 0.012, 0.2);
  circle(-2.85, 1.5, 0.55, 0.016, 0.2);
  circle(2.35, -0.35, 0.58, 0.012, 0.2);
  circle(-1.62, 0.55, 0.42, 0.02, 0.2);
  circle(1.72, -0.2, 0.42, 0.02, 0.2);
  rect(2.85, -2.95, 3.68, -1.9, 0.018, 0.75);
  circle(-2.0, 4.7, 0.5, 0.022, 0.7);
  circle(-2.1, 1.2, 0.3, 0.024, 0.7);

  /* Small ticks along the back of the plan — drafting marks. */
  for (let i = 0; i < 9; i += 1) {
    const x = -4 + i;
    seg(x, -7.2, x, -7.05, 0.03 + i * 0.002, 0.55, 0.01);
  }

  return out;
}
