/* The room itself: floor, walls, white cyc, grey backdrop, paper roll,
   acoustic panels, ceiling grid and the practical spotlights hanging from it.

   All coordinates are metres in one world space, shared with the equipment.
   The camera (StudioScene) frames this from the doorway at z = 10. */

import { useMemo } from 'react';
import * as THREE from 'three';
import { Box, Cyl, Disc, Part, lookQuat } from './primitives.jsx';
import { PLANE } from './geometry.js';

export const ROOM = {
  halfW: 5,
  height: 4.2,
  back: -7.2,
  front: 10.6,
  centerZ: 1.7,
  depth: 17.8,
};

/* --------------------------------------------------------------------------
   Small repeated architecture
   -------------------------------------------------------------------------- */

function FlatPanel({ mats, side, z, w = 1.0, h = 2.15, y = 2.15, seed, material }) {
  const x = side * 4.94;
  return (
    <Part seed={seed} spread={0.026} tint={0.35}>
      <Box position={[x, y, z]} size={[0.06, h, w]} material={material ?? mats.panel} />
    </Part>
  );
}

function SlattedPanel({ mats, side, z, w = 1.15, h = 1.95, y = 2.2, seed, count = 7 }) {
  const x = side * 4.92;
  const out = -side; // toward the room
  const step = (w - 0.08) / (count - 1);
  const slats = Array.from({ length: count }, (_, i) => z - w / 2 + 0.04 + i * step);
  return (
    <Part seed={seed} spread={0.03} tint={0.42}>
      <Box position={[x, y, z]} size={[0.04, h, w]} material={mats.wallDark} />
      {slats.map((sz, i) => (
        <Box
          key={i}
          position={[x + out * 0.028, y, sz]}
          size={[0.06, h * 0.9, 0.028]}
          material={mats.panel}
        />
      ))}
    </Part>
  );
}

function Doorway({ mats, side, z, seed }) {
  const x = side * 4.955;
  return (
    <Part seed={seed} spread={0.02} tint={0.3}>
      {/* dark recess */}
      <Box position={[x, 1.18, z]} size={[0.05, 2.36, 1.0]} material={mats.black} />
      {/* slim frame */}
      <Box position={[x + -side * 0.005, 1.2, z - 0.54]} size={[0.07, 2.44, 0.055]} material={mats.wallDark} />
      <Box position={[x + -side * 0.005, 1.2, z + 0.54]} size={[0.07, 2.44, 0.055]} material={mats.wallDark} />
      <Box position={[x + -side * 0.005, 2.4, z]} size={[0.07, 0.055, 1.14]} material={mats.wallDark} />
    </Part>
  );
}

/* --------------------------------------------------------------------------
   Ceiling rig
   -------------------------------------------------------------------------- */

const SPOTS = [
  { p: [-2.6, -4.65], target: [0.3, 1.6, -6.9], barn: true },
  { p: [-2.6, -1.65], target: [0.9, 1.3, -2.0], barn: true },
  { p: [-2.6, 1.2], target: [1.7, 1.25, 0.5], barn: false },
  { p: [2.6, -3.9], target: [-0.2, 1.7, -6.9], barn: true },
  { p: [2.6, -0.9], target: [-0.9, 1.3, -2.0], barn: true },
  { p: [2.6, 1.9], target: [-1.5, 1.25, 0.7], barn: false },
  { p: [0, -6.05], target: [0, 1.7, -7.1], barn: true },
  { p: [-4.4, -3.15], target: [1.0, 1.55, -5.0], barn: false },
  { p: [4.4, -5.0], target: [-1.0, 1.6, -6.0], barn: true },
];

function RigSpot({ mats, spot, index }) {
  const [x, z] = spot.p;
  const baseY = Math.abs(x) > 4 ? 4.14 : 4.02;
  const origin = [x, baseY - 0.15, z];

  const quat = useMemo(
    () => lookQuat(origin, spot.target, [0, 1, 0]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [x, z, baseY],
  );

  return (
    <Part seed={0.43 + index * 0.0045} spread={0.03} tint={0.4}>
      {/* drop rod + clamp */}
      <Cyl position={[x, baseY - 0.075, z]} radius={0.011} height={0.15} material={mats.metal} />
      <Box position={[x, baseY - 0.045, z]} size={[0.075, 0.06, 0.06]} material={mats.metal} />

      <group position={origin} quaternion={quat}>
        {/* body */}
        <Cyl position={[0, -0.085, 0]} radius={0.072} height={0.17} material={mats.metal} />
        <Disc position={[0, -0.173, 0]} rotation={[Math.PI / 2, 0, 0]} radius={0.057} material={mats.lamp} />
        <Cyl position={[0, -0.176, 0]} radius={0.074} height={0.018} material={mats.metal} />

        {/* yoke */}
        <Box position={[0, 0.03, 0]} size={[0.052, 0.05, 0.052]} material={mats.metal} />
        <Box position={[-0.083, -0.04, 0]} size={[0.01, 0.15, 0.024]} material={mats.metal} />
        <Box position={[0.083, -0.04, 0]} size={[0.01, 0.15, 0.024]} material={mats.metal} />
        <Box position={[0, 0.025, 0]} size={[0.175, 0.012, 0.022]} material={mats.metal} />

        {/* barn doors */}
        {spot.barn && (
          <>
            <Box
              position={[-0.093, -0.185, 0]}
              rotation={[0, 0, 0.5]}
              size={[0.006, 0.105, 0.125]}
              material={mats.metal}
            />
            <Box
              position={[0.093, -0.185, 0]}
              rotation={[0, 0, -0.5]}
              size={[0.006, 0.105, 0.125]}
              material={mats.metal}
            />
            <Box
              position={[0, -0.185, -0.093]}
              rotation={[0.5, 0, 0]}
              size={[0.125, 0.105, 0.006]}
              material={mats.metal}
            />
            <Box
              position={[0, -0.185, 0.093]}
              rotation={[-0.5, 0, 0]}
              size={[0.125, 0.105, 0.006]}
              material={mats.metal}
            />
          </>
        )}
      </group>
    </Part>
  );
}

function LightRig({ mats }) {
  const hangers = [];
  [-5.4, -1.8, 1.8, 5.4].forEach((z) => {
    [-2.6, 2.6].forEach((x) => hangers.push([x, z]));
  });
  [-4, 0, 4].forEach((z) => {
    [-4.4, 4.4].forEach((x) => hangers.push([x, z]));
  });

  return (
    <>
      <Part seed={0.36} spread={0.026} tint={0.35}>
        <Box position={[-2.6, 4.02, 1.7]} size={[0.055, 0.055, 17.2]} material={mats.metal} />
        <Box position={[2.6, 4.02, 1.7]} size={[0.055, 0.055, 17.2]} material={mats.metal} />
        <Box position={[-4.4, 4.14, -2.9]} size={[0.045, 0.045, 8.2]} material={mats.metal} />
        <Box position={[4.4, 4.14, -2.9]} size={[0.045, 0.045, 8.2]} material={mats.metal} />
        {[-5.2, -2.2, 0.8, 3.8].map((z) => (
          <Box key={z} position={[0, 4.07, z]} size={[9.8, 0.045, 0.045]} material={mats.metal} />
        ))}
        {hangers.map(([x, z], i) => (
          <Cyl
            key={i}
            position={[x, Math.abs(x) > 4 ? 4.18 : 4.12, z]}
            radius={0.012}
            height={0.2}
            material={mats.metal}
          />
        ))}
      </Part>

      {SPOTS.map((spot, i) => (
        <RigSpot key={i} mats={mats} spot={spot} index={i} />
      ))}
    </>
  );
}

/* --------------------------------------------------------------------------
   The room
   -------------------------------------------------------------------------- */

export default function ArchitecturalStructure({ mats }) {
  return (
    <>
      {/* floor + dark set mat (both roll in from the back) */}
      <mesh
        geometry={PLANE}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, ROOM.centerZ]}
        scale={[10, ROOM.depth, 1]}
        material={mats.floor}
        userData={{ noEdges: true, noCast: true }}
      />
      <mesh
        geometry={PLANE}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.012, -5.56]}
        scale={[5.0, 3.12, 1]}
        material={mats.mat}
        userData={{ noEdges: true, noCast: true }}
      />

      {/* structural shell */}
      <Part seed={0.12} spread={0.03} tint={0.16}>
        <Box position={[0, 2.1, ROOM.back - 0.06]} size={[10.24, 4.2, 0.12]} material={mats.white} />
      </Part>
      <Part seed={0.135} spread={0.035} tint={0.16}>
        <Box position={[-5.06, 2.1, ROOM.centerZ]} size={[0.12, 4.2, ROOM.depth]} material={mats.wall} />
        <Box position={[5.06, 2.1, ROOM.centerZ]} size={[0.12, 4.2, ROOM.depth]} material={mats.wall} />
      </Part>
      <Part seed={0.2} spread={0.03} tint={0.14}>
        <Box position={[0, 4.26, ROOM.centerZ]} size={[10.3, 0.12, ROOM.depth]} material={mats.ceiling} />
      </Part>
      <Part seed={0.15} spread={0.03} tint={0.22}>
        <Box position={[-4.955, 0.08, ROOM.centerZ]} size={[0.09, 0.16, ROOM.depth]} material={mats.wallDark} />
        <Box position={[4.955, 0.08, ROOM.centerZ]} size={[0.09, 0.16, ROOM.depth]} material={mats.wallDark} />
      </Part>

      {/* wall finish: dark acoustic panels + slatted panels */}
      <FlatPanel mats={mats} side={-1} z={-0.15} w={0.72} h={2.5} y={2.02} seed={0.235} />
      <FlatPanel mats={mats} side={-1} z={-1.75} w={1.02} h={2.2} y={2.18} seed={0.24} />
      <SlattedPanel mats={mats} side={-1} z={-3.6} seed={0.25} />
      <FlatPanel mats={mats} side={-1} z={-5.8} w={1.05} h={2.15} y={2.12} seed={0.255} />
      <FlatPanel mats={mats} side={1} z={-2.55} w={1.18} h={2.3} y={2.15} seed={0.245} />
      <SlattedPanel mats={mats} side={1} z={-4.85} seed={0.255} />
      <Doorway mats={mats} side={1} z={-3.55} seed={0.26} />

      {/* grey photographic backdrop + white roll bar + weight bar */}
      <Part seed={0.285} spread={0.03} tint={0.5}>
        <Box position={[0, 2.07, -7.11]} size={[4.6, 3.92, 0.03]} material={mats.backdrop} />
        <Cyl position={[0, 4.06, -7.05]} rotation={[0, 0, Math.PI / 2]} radius={0.055} height={4.78} material={mats.white} />
        <Cyl position={[0, 0.13, -7.03]} rotation={[0, 0, Math.PI / 2]} radius={0.022} height={4.56} material={mats.metal} />
        <Box position={[-2.36, 4.06, -7.06]} size={[0.08, 0.24, 0.1]} material={mats.metalSilver} />
        <Box position={[2.36, 4.06, -7.06]} size={[0.08, 0.24, 0.1]} material={mats.metalSilver} />
      </Part>

      {/* dark recess where the canvas meets the white wall */}
      <Part seed={0.29} spread={0.02} tint={0.35}>
        <Box position={[2.55, 2.08, -7.18]} size={[0.14, 3.9, 0.03]} material={mats.black} />
      </Part>

      {/* white seamless paper on the back-right + on the right wall */}
      <Part seed={0.3} spread={0.03} tint={0.55}>
        <Box position={[3.75, 2.02, -7.09]} size={[2.5, 4.04, 0.02]} material={mats.paper} />
        <Cyl position={[3.75, 4.08, -7.0]} rotation={[0, 0, Math.PI / 2]} radius={0.085} height={2.62} material={mats.paper} />
        <Box position={[4.9, 2.0, -5.7]} size={[0.03, 4.0, 2.6]} material={mats.paper} />
        <Cyl position={[4.86, 4.06, -5.7]} rotation={[Math.PI / 2, 0, 0]} radius={0.09} height={2.72} material={mats.paper} />
      </Part>

      {/* black drape + gold chain */}
      <Part seed={0.315} spread={0.025} tint={0.3}>
        <Box position={[4.4, 2.2, -6.83]} rotation={[0, 0.05, 0]} size={[0.76, 3.6, 0.02]} material={mats.black} />
        <Box position={[4.4, 4.02, -6.83]} size={[0.86, 0.05, 0.05]} material={mats.metal} />
      </Part>
      <Part seed={0.325} spread={0.01} tint={0.75}>
        <Cyl position={[4.83, 2.95, -6.78]} radius={0.011} height={1.85} material={mats.gold} />
        <Box position={[4.83, 3.9, -6.78]} size={[0.03, 0.05, 0.03]} material={mats.gold} />
      </Part>

      <LightRig mats={mats} />

      {/* soft reflections of the practicals on the pale floor */}
      <mesh
        geometry={PLANE}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[-1.5, 0.016, 1.0]}
        scale={[2.8, 2.1, 1]}
        material={mats.glowWarm}
        userData={{ noEdges: true, noCast: true }}
      />
      <mesh
        geometry={PLANE}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[1.9, 0.016, 0.2]}
        scale={[2.6, 2.0, 1]}
        material={mats.glowWarm}
        userData={{ noEdges: true, noCast: true }}
      />
      <mesh
        geometry={PLANE}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.016, -4.7]}
        scale={[4.2, 2.6, 1]}
        material={mats.glowCool}
        userData={{ noEdges: true, noCast: true }}
      />
      <mesh
        geometry={PLANE}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.016, 3.4]}
        scale={[6.2, 4.4, 1]}
        material={mats.glowCool}
        userData={{ noEdges: true, noCast: true }}
      />
    </>
  );
}
