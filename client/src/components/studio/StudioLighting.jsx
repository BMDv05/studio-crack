/* Studio lighting — the live part.

   The architecture (floor, walls, backdrop, ceiling) is not lit here: its
   light is baked once at load by studioBake.js, from the full rig — area
   softboxes, every ceiling spot, a soft key — and read back for free.
   What is lit live is the gear, which the camera moves around: a key with the
   one shadow map, a cool fill, a low ambient bounce, the cyc washes, and a
   point at the centre of each modifier's lit face.

   Every intensity is multiplied by the materialisation phase, so the room is
   dark while it is a line drawing and comes up as the surfaces sweep in.
   Nothing here animates independently of scroll. */

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { PHASE, smoothstep } from './studioMath.js';
import { MODIFIERS } from './StudioEquipment.jsx';

/* Lit-face geometry of each modifier kind, and how bright it is. */
function rectFor(m) {
  if (m.kind === 'panel') return { w: m.w * 0.94, h: m.h * 0.92, front: 0.03, power: 14, color: '#ffd2a0' };
  if (m.kind === 'octa') return { w: m.size * 1.55, h: m.size * 1.55, front: m.size * 0.22 + 0.01, power: 9, color: '#fff3e3' };
  return { w: m.size * 1.2, h: m.size * 1.2, front: m.size * 0.16 + 0.04, power: 6.5, color: '#fff1de' };
}

function FixturePoints({ progress }) {
  const refs = useRef([]);
  const specs = useMemo(
    () =>
      MODIFIERS.map((m) => {
        const r = rectFor(m);
        const pos = new THREE.Vector3(...m.pos);
        const target = new THREE.Vector3(...m.target);
        const dir = target.clone().sub(pos).normalize();
        return { ...r, position: pos.addScaledVector(dir, r.front).toArray(), target: target.toArray() };
      }),
    [],
  );

  useFrame(() => {
    const m = smoothstep(PHASE.lightsIn, PHASE.lightsFull, progress.p);
    refs.current.forEach((light, i) => {
      if (light) light.intensity = specs[i].power * specs[i].w * specs[i].h * 1.6 * m;
    });
  });

  /* The architecture gets these fixtures' true area-light falloff from the
     bake; only the gear is lit live, and for thin stands and camera bodies a
     point at the centre of each lit face reads the same at a fraction of the
     cost (measured ~4 ms/frame for five live RectAreaLights on a 610M). */
  const start = smoothstep(PHASE.lightsIn, PHASE.lightsFull, progress.p);
  return specs.map((s, i) => (
    <pointLight
      key={i}
      ref={(el) => {
        refs.current[i] = el;
      }}
      position={s.position}
      color={s.color}
      intensity={s.power * s.w * s.h * 1.6 * start}
      distance={9}
      decay={2}
    />
  ));
}

export default function StudioLighting({ progress, low = false }) {
  const hemi = useRef(null);
  const key = useRef(null);
  const fill = useRef(null);
  const cyc = useRef(null);
  const cycL = useRef(null);
  const cycR = useRef(null);

  const start = smoothstep(PHASE.lightsIn, PHASE.lightsFull, progress.p);

  useFrame(() => {
    const m = smoothstep(PHASE.lightsIn, PHASE.lightsFull, progress.p);
    if (hemi.current) hemi.current.intensity = 0.2 * m;
    if (key.current) key.current.intensity = 1.5 * m;
    if (fill.current) fill.current.intensity = 0.22 * m;
    if (cyc.current) cyc.current.intensity = (low ? 8 : 3.2) * m;
    if (cycL.current) cycL.current.intensity = 2.6 * m;
    if (cycR.current) cycR.current.intensity = 2.6 * m;
  });

  return (
    <>
      <hemisphereLight
        ref={hemi}
        color="#d9e4df"
        groundColor="#2a2a26"
        intensity={0.2 * start}
      />

      {/* key: gives the one (baked) shadow map its direction */}
      <directionalLight
        ref={key}
        position={[3.2, 7.5, 8.0]}
        color="#fff4e8"
        intensity={1.15 * start}
        castShadow
        shadow-mapSize-width={low ? 1024 : 2048}
        shadow-mapSize-height={low ? 1024 : 2048}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={8}
        shadow-camera-bottom={-5}
        shadow-camera-near={0.5}
        shadow-camera-far={28}
        shadow-bias={-0.0003}
        shadow-normalBias={0.035}
      />

      <directionalLight
        ref={fill}
        position={[-6.5, 3.6, 5.5]}
        color="#cfe4de"
        intensity={0.22 * start}
      />

      {/* broad wash on the backdrop and the white cyc */}
      <pointLight
        ref={cyc}
        position={[0, 3.4, -4.2]}
        color="#ffe8c9"
        intensity={3.2 * start}
        distance={11}
        decay={2}
      />
      <pointLight
        ref={cycL}
        position={[-4.2, 2.8, -6.4]}
        color="#eef7f2"
        intensity={2.6 * start}
        distance={6}
        decay={2}
      />
      <pointLight
        ref={cycR}
        position={[4.2, 2.8, -6.4]}
        color="#eef7f2"
        intensity={2.6 * start}
        distance={6}
        decay={2}
      />

      {/* The rig spots' pools on the backdrop live in the bake now; live,
          they cost every pixel of the frame for light only the shell sees. */}
      <FixturePoints progress={progress} />
    </>
  );
}
