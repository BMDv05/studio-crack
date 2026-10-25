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

  const start = smoothstep(PHASE.lightsIn, PHASE.lightsFull, progress.p);

  useFrame(() => {
    const m = smoothstep(PHASE.lightsIn, PHASE.lightsFull, progress.p);
    if (hemi.current) hemi.current.intensity = 0.34 * m;
    if (key.current) key.current.intensity = 1.35 * m;
    if (fill.current) fill.current.intensity = 0.38 * m;
    if (cyc.current) cyc.current.intensity = 7.5 * m;
    if (cycL.current) cycL.current.intensity = 3.2 * m;
    if (cycR.current) cycR.current.intensity = 3.2 * m;
    if (panelL.current) panelL.current.intensity = 6 * m;
    if (panelR.current) panelR.current.intensity = 5.5 * m;
  });

  return (
    <>
      <hemisphereLight
        ref={hemi}
        color="#a9c4bb"
        groundColor="#131615"
        intensity={0.34 * start}
      />

      <directionalLight
        ref={key}
        position={[3.6, 7, 8.5]}
        color="#fff0db"
        intensity={1.35 * start}
        castShadow
        shadow-mapSize-width={low ? 512 : 1024}
        shadow-mapSize-height={low ? 512 : 1024}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={8}
        shadow-camera-bottom={-5}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-bias={-0.0006}
        shadow-normalBias={0.025}
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
    </>
  );
}
