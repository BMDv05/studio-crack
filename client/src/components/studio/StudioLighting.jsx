/* Studio lighting.

   The room is lit photographically: a warm key from camera-left, a cool fill
   from camera-right, a dim ambient bounce, and practical sources placed inside
   the modifiers and along the white cyc. Every intensity is multiplied by the
   materialisation phase, so the room is dark while it is a line drawing and
   comes up as the surfaces sweep in. Nothing here animates independently of
   scroll. */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { PHASE, smoothstep } from './studioMath.js';

export default function StudioLighting({ progress, low = false }) {
  const hemi = useRef(null);
  const key = useRef(null);
  const fill = useRef(null);
  const cyc = useRef(null);
  const cycL = useRef(null);
  const cycR = useRef(null);
  const panelL = useRef(null);
  const panelR = useRef(null);
  const softboxL = useRef(null);
  const softboxR = useRef(null);

  const start = smoothstep(PHASE.lightsIn, PHASE.lightsFull, progress.p);

  useFrame(() => {
    const m = smoothstep(PHASE.lightsIn, PHASE.lightsFull, progress.p);
    if (hemi.current) hemi.current.intensity = 0.42 * m;
    if (key.current) key.current.intensity = 1.75 * m;
    if (fill.current) fill.current.intensity = 0.45 * m;
    if (cyc.current) cyc.current.intensity = 8.5 * m;
    if (cycL.current) cycL.current.intensity = 3.6 * m;
    if (cycR.current) cycR.current.intensity = 3.6 * m;
    if (panelL.current) panelL.current.intensity = 7 * m;
    if (panelR.current) panelR.current.intensity = 6.5 * m;
    if (softboxL.current) softboxL.current.intensity = 4.5 * m;
    if (softboxR.current) softboxR.current.intensity = 3.8 * m;
  });

  return (
    <>
      <hemisphereLight
        ref={hemi}
        color="#b8ded4"
        groundColor="#141c19"
        intensity={0.42 * start}
      />

      <directionalLight
        ref={key}
        position={[3.2, 7.5, 8.0]}
        color="#fff4e8"
        intensity={1.75 * start}
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
        intensity={0.38 * start}
      />

      {/* practical pool on the backdrop and the white cyc */}
      <pointLight
        ref={cyc}
        position={[0, 3.4, -4.2]}
        color="#ffe8c9"
        intensity={7.5 * start}
        distance={11}
        decay={1.8}
      />
      <pointLight
        ref={cycL}
        position={[-4.2, 2.8, -6.4]}
        color="#eef7f2"
        intensity={3.2 * start}
        distance={6}
        decay={2}
      />
      <pointLight
        ref={cycR}
        position={[4.2, 2.8, -6.4]}
        color="#eef7f2"
        intensity={3.2 * start}
        distance={6}
        decay={2}
      />

      {/* light spilling out of the two LED panels */}
      <pointLight
        ref={panelL}
        position={[-1.62, 1.86, 0.9]}
        color="#ffe9cd"
        intensity={6 * start}
        distance={8}
        decay={2}
      />
      <pointLight
        ref={panelR}
        position={[1.72, 1.9, 0.15]}
        color="#ffe9cd"
        intensity={5.5 * start}
        distance={8}
        decay={2}
      />

      {/* directional softbox illumination */}
      <pointLight
        ref={softboxL}
        position={[-2.3, 2.7, 0.9]}
        color="#fff2dd"
        intensity={4.5 * start}
        distance={10}
        decay={1.8}
      />
      <pointLight
        ref={softboxR}
        position={[2.1, 2.7, -0.4]}
        color="#fff0d8"
        intensity={3.8 * start}
        distance={10}
        decay={1.8}
      />
    </>
  );
}
