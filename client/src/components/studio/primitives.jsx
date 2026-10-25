/* Reusable scene primitives + the "Part" wrapper that tells the wireframe
   builder when a group of meshes should be drawn. */

import { forwardRef, useMemo } from 'react';
import * as THREE from 'three';
import { BOX, CYL, CYL12, CYL8, CYL6, TUBE20, TUBE8, DISC24, DISC8 } from './geometry.js';

export function Box({ size = [1, 1, 1], ...rest }) {
  return <mesh geometry={BOX} scale={size} {...rest} />;
}

export function Cyl({ radius = 0.1, height = 0.1, segments = 20, ...rest }) {
  const geo = segments <= 6 ? CYL6 : segments <= 8 ? CYL8 : segments <= 12 ? CYL12 : CYL;
  return <mesh geometry={geo} scale={[radius, height, radius]} {...rest} />;
}

export function Tube({ radius = 0.1, height = 0.05, segments = 20, ...rest }) {
  const geo = segments <= 8 ? TUBE8 : TUBE20;
  return <mesh geometry={geo} scale={[radius, height, radius]} {...rest} />;
}

export const Disc = forwardRef(function Disc({ radius = 0.1, segments = 24, ...rest }, ref) {
  return <mesh ref={ref} geometry={segments <= 8 ? DISC8 : DISC24} scale={[radius, radius, 1]} {...rest} />;
});

export function Bar({ a, b, radius = 0.02, segments = 8, ...rest }) {
  const data = useMemo(() => {
    const start = new THREE.Vector3(a[0], a[1], a[2]);
    const end = new THREE.Vector3(b[0], b[1], b[2]);
    const dir = end.clone().sub(start);
    const len = Math.max(dir.length(), 0.0001);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize(),
    );
    return { mid, quat, len };
  }, [a[0], a[1], a[2], b[0], b[1], b[2]]);

  const geo = segments <= 6 ? CYL6 : segments <= 8 ? CYL8 : CYL12;
  return <mesh geometry={geo} position={data.mid} quaternion={data.quat} scale={[radius, data.len, radius]} {...rest} />;
}

/* A group that participates in the wireframe. `seed` is the scroll progress
   at which its strokes start drawing; `spread` staggers its individual edges. */
export function Part({ seed, spread = 0.045, tint = 0.75, cast = false, children, ...rest }) {
  return (
    <group {...rest} userData={{ seed, spread, tint, cast }}>
      {children}
    </group>
  );
}

/* Orient a group so its local +Z aims at `to`. */
export function lookQuat(from, to, up = [0, 1, 0]) {
  const m = new THREE.Matrix4().lookAt(
    new THREE.Vector3(to[0], to[1], to[2]),
    new THREE.Vector3(from[0], from[1], from[2]),
    new THREE.Vector3(up[0], up[1], up[2]),
  );
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
