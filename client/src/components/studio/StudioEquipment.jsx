/* Everything that stands on the studio floor: the two cameras and their
   tripods, the big modifiers and LED panels on stands, the table with the
   laptop, the stool, the C-stand, cases, sandbags and cables.

   Each object is modelled from real components (legs, clamps, yokes, lens
   barrels, screens), not placeholder cubes. All meshes live in the same world
   space as the architecture, so the wireframe phase draws the exact equipment
   that later materialises. */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Box, Bar, Cyl, Disc, Part, RoundedBox, lookQuat } from './primitives.jsx';
import { PLANE, TUBE20, TUBE64, UMBRELLA, UMBRELLA_RIBS, TORUS64, DISC256, DISC128, KNURL } from './geometry.js';
import StudioLogoReveal from './StudioLogoReveal.jsx';
import { smoothstep } from './studioMath.js';

/* --------------------------------------------------------------------------
   Camera support
   -------------------------------------------------------------------------- */

function Tripod({ mats, head = 1.55, casters = false, spread = 0.62 }) {
  const top = [0, head - 0.2, 0];
  const angles = [Math.PI / 2, Math.PI * (5 / 6), Math.PI * (7 / 6)];
  const feet = angles.map((a) => [Math.sin(a) * spread, casters ? 0.145 : 0.028, Math.cos(a) * spread]);
  const joints = feet.map((f) => [
    f[0] * 0.55,
    top[1] + (f[1] - top[1]) * 0.55,
    f[2] * 0.55,
  ]);
  const hubY = 0.46;
  const spreader = feet.map((f) => {
    const t = (top[1] - hubY) / (top[1] - f[1]);
    return [f[0] * t, hubY, f[2] * t];
  });

  return (
    <group>
      {/* ambient contact shadow beneath tripod base */}
      {mats.contactShadowSoft && (
        <mesh
          geometry={PLANE}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.002, 0]}
          scale={[spread * 1.5, spread * 1.5, 1]}
          material={mats.contactShadowSoft}
          userData={{ noEdges: true, noCast: true }}
        />
      )}
      {feet.map((f, i) => (
        <group key={i}>
          {mats.contactShadow && (
            <mesh
              geometry={PLANE}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[f[0], 0.003, f[2]]}
              scale={[casters ? 0.32 : 0.24, casters ? 0.32 : 0.24, 1]}
              material={mats.contactShadow}
              userData={{ noEdges: true, noCast: true }}
            />
          )}
          <Bar a={top} b={joints[i]} radius={0.023} segments={8} material={mats.metal} />
          <Bar a={joints[i]} b={[f[0], f[1], f[2]]} radius={0.017} segments={8} material={mats.metal} />
          <Box position={joints[i]} size={[0.05, 0.09, 0.05]} material={mats.metal} />
          <Bar a={spreader[i]} b={[0, hubY + 0.025, 0]} radius={0.011} segments={6} material={mats.metal} />
          {casters ? (
            <>
              <Box position={[f[0], 0.115, f[2]]} size={[0.055, 0.07, 0.055]} material={mats.metal} />
              <Cyl
                position={[f[0], 0.062, f[2]]}
                rotation={[0, 0, Math.PI / 2]}
                radius={0.062}
                height={0.032}
                segments={12}
                material={mats.rubber}
              />
            </>
          ) : (
            <>
              <Cyl position={[f[0], 0.035, f[2]]} radius={0.03} height={0.055} material={mats.metal} />
              <Box position={[f[0], 0.006, f[2]]} size={[0.075, 0.014, 0.075]} material={mats.rubber} />
            </>
          )}
        </group>
      ))}

      {/* centre column, spreader hub, bowl and quick-release plate */}
      <Cyl position={[0, 0.44, 0]} radius={0.028} height={0.06} material={mats.metal} />
      <Cyl position={[0, (head - 0.08 + 0.38) / 2, 0]} radius={0.024} height={head - 0.46} material={mats.metal} />
      <Cyl position={[0, head - 0.045, 0]} radius={0.086} height={0.09} segments={12} material={mats.metal} />
      <Box position={[0, head + 0.008, 0]} size={[0.145, 0.028, 0.115]} material={mats.metal} />
      <Box position={[0, head - 0.015, 0.075]} size={[0.05, 0.05, 0.03]} material={mats.metal} />

      {/* pan handle */}
      <Bar a={[0.075, head - 0.03, 0.03]} b={[0.285, head - 0.145, 0.16]} radius={0.011} segments={6} material={mats.metal} />
      <Bar a={[0.19, head - 0.09, 0.09]} b={[0.285, head - 0.145, 0.16]} radius={0.021} segments={6} material={mats.rubber} />
    </group>
  );
}

/* Close-up lens detail only the finale reveals. The wide studio shot is left
   untouched: the detail meshes are invisible at finale 0 and excluded from the
   blueprint wireframe. The point light deliberately lives outside that group
   and is present at intensity 0 from the first frame: adding a light later
   would force every lit material in the studio to recompile mid-scroll. */
function HeroLensDetail({ mats, progress, front }) {
  const group = useRef(null);
  const light = useRef(null);

  useFrame(() => {
    const f = progress.finale;
    if (group.current) group.current.visible = f > 0.0005;
    if (light.current) light.current.intensity = 1.15 * smoothstep(0.28, 0.78, f);
  });

  const ring = (scale, z, material, key) => (
    <mesh
      key={key}
      geometry={TORUS64}
      position={[0, 0.004, front - z]}
      scale={[scale, scale, scale]}
      material={material}
      userData={{ noEdges: true }}
    />
  );

  return (
    <>
      <group ref={group} name="hero-lens-detail" visible={false}>
        {/* The wide model uses a 20-segment hood; this smooth cover and rim take
            over only when the camera is close enough to see the facets. */}
        <mesh
          geometry={TUBE64}
          position={[0, 0.004, -0.313]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[0.0705, 0.071, 0.0705]}
          material={mats.lens}
          userData={{ noEdges: true }}
        />
        <mesh
          geometry={TORUS64}
          position={[0, 0.004, front - 0.0015]}
          scale={[0.07, 0.07, 0.07]}
          material={mats.metal}
          userData={{ noEdges: true }}
        />
        {ring(0.068, 0.0012, mats.metal, 'hood')}
        {ring(0.053, 0.0007, mats.glass, 'bezel')}
        {ring(0.044, 0.001, mats.metal, 'innerA')}
        {ring(0.034, 0.0006, mats.glass, 'innerB')}
        {/* The wide model's glass is a 24-gon. It is hidden for this camera
            while the finale is running; this smooth front glass takes over. */}
        <mesh
          geometry={DISC256}
          position={[0, 0.004, front + 0.0001]}
          rotation={[0, Math.PI, 0]}
          scale={[0.05, 0.05, 1]}
          material={mats.glass}
          userData={{ noEdges: true }}
        />
        <mesh
          geometry={DISC128}
          position={[0, 0.004, front - 0.0015]}
          rotation={[0, Math.PI, 0]}
          scale={[0.013, 0.013, 1]}
          material={mats.lens}
          userData={{ noEdges: true }}
        />
      </group>
      <pointLight
        ref={light}
        name="hero-lens-light"
        position={[0, 0.004, front - 0.62]}
        color="#bfe9e2"
        intensity={0}
        distance={1.8}
        decay={2}
      />
    </>
  );
}

/* Small hardware: present in the solid studio, absent from the blueprint. */
function Fine({ children }) {
  return <group userData={{ noEdges: true }}>{children}</group>;
}

/* Ribbed ring or dial. Axis is local Y unless rotated. */
function Knob({ material, r = 0.012, l = 0.018, ...rest }) {
  return <mesh geometry={KNURL} scale={[r, l, r]} material={material} {...rest} />;
}

const PI = Math.PI;

/* Cinema rig accessories, as a real production camera is dressed: 15 mm rods
   on a baseplate, follow focus on the lens gear, matte box with flags,
   V-mount battery, side handle, side info screen. */
function CinemaRig({ mats, lensFront }) {
  const mbZ = lensFront - 0.05;
  const mbW = 0.24;
  const mbH = 0.18;
  return (
    <>
      <Box position={[0, -0.122, -0.02]} size={[0.11, 0.022, 0.06]} material={mats.metal} />
      <Bar a={[-0.032, -0.122, 0.04]} b={[-0.032, -0.122, mbZ + 0.03]} radius={0.0075} segments={8} material={mats.metalSilver} />
      <Bar a={[0.032, -0.122, 0.04]} b={[0.032, -0.122, mbZ + 0.03]} radius={0.0075} segments={8} material={mats.metalSilver} />

      {/* follow focus driving the lens gear */}
      <Box position={[0.075, -0.075, -0.15]} size={[0.035, 0.07, 0.045]} material={mats.cameraTrim} />
      <Cyl position={[0.11, -0.065, -0.15]} rotation={[0, 0, PI / 2]} radius={0.032} height={0.022} segments={20} material={mats.cameraTrim} />
      <Fine>
        <Cyl position={[0.122, -0.065, -0.15]} rotation={[0, 0, PI / 2]} radius={0.028} height={0.003} segments={20} material={mats.whiteGear} />
        <Knob material={mats.metal} position={[0.075, -0.04, -0.15]} r={0.012} l={0.01} />
      </Fine>

      {/* matte box: hollow frame, bellows, French flag and side wings */}
      <group position={[0, 0.004, mbZ]}>
        <Box position={[0, mbH / 2, 0]} size={[mbW, 0.016, 0.1]} material={mats.cameraTrim} />
        <Box position={[0, -mbH / 2, 0]} size={[mbW, 0.016, 0.1]} material={mats.cameraTrim} />
        <Box position={[mbW / 2, 0, 0]} size={[0.016, mbH, 0.1]} material={mats.cameraTrim} />
        <Box position={[-mbW / 2, 0, 0]} size={[0.016, mbH, 0.1]} material={mats.cameraTrim} />
        <Box position={[0, 0, 0.055]} size={[mbW * 0.7, mbH * 0.7, 0.012]} material={mats.rubber} />
        <group position={[0, mbH / 2 + 0.008, -0.05]} rotation={[-0.35, 0, 0]}>
          <Box position={[0, 0, -0.065]} size={[mbW + 0.01, 0.004, 0.13]} material={mats.cameraTrim} />
        </group>
        <group position={[mbW / 2 + 0.008, 0, -0.05]} rotation={[0, 0.35, 0]}>
          <Box position={[0, 0, -0.05]} size={[0.004, mbH, 0.1]} material={mats.cameraTrim} />
        </group>
        <group position={[-mbW / 2 - 0.008, 0, -0.05]} rotation={[0, -0.35, 0]}>
          <Box position={[0, 0, -0.05]} size={[0.004, mbH, 0.1]} material={mats.cameraTrim} />
        </group>
        <Fine>
          <Box position={[0, mbH / 2 + 0.012, 0.02]} size={[0.12, 0.012, 0.018]} material={mats.metal} />
          <Box position={[0, mbH / 2 + 0.012, 0.0]} size={[0.12, 0.012, 0.018]} material={mats.metal} />
        </Fine>
        <Box position={[0, -mbH / 2 - 0.03, 0.03]} size={[0.06, 0.05, 0.03]} material={mats.metal} />
      </group>

      {/* V-mount battery on the back plate */}
      <Box position={[0.02, -0.035, 0.119]} size={[0.12, 0.13, 0.012]} material={mats.metal} />
      <RoundedBox args={[0.1, 0.1, 0.05]} radius={0.008} smoothness={2} position={[0.02, -0.035, 0.15]} material={mats.cameraTrim} />
      <Fine>
        <Box position={[0.02, 0.008, 0.176]} size={[0.05, 0.006, 0.003]} material={mats.screen} />
      </Fine>

      {/* side handle on a rosette */}
      <Cyl position={[0.148, 0.01, -0.03]} rotation={[0, 0, PI / 2]} radius={0.026} height={0.012} segments={12} material={mats.metal} />
      <RoundedBox args={[0.035, 0.13, 0.05]} radius={0.014} smoothness={2} position={[0.175, -0.01, -0.04]} rotation={[0.25, 0, 0]} material={mats.rubber} />

      {/* side info screen, buttons, vents */}
      <Box position={[-0.139, 0.015, 0.03]} size={[0.004, 0.045, 0.075]} material={mats.screen} />
      <Fine>
        {[-0.03, -0.015, 0, 0.015].map((dz, i) => (
          <Cyl key={i} position={[-0.139, -0.03, 0.03 + dz * 1.3]} rotation={[0, 0, PI / 2]} radius={0.006} height={0.006} segments={8} material={mats.rubber} />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <Box key={i} position={[0.1385, -0.055 + i * 0.022, -0.04]} size={[0.003, 0.009, 0.11]} material={mats.rubber} />
        ))}
        {[-0.1, -0.06, -0.02, 0.02, 0.06, 0.1].map((x) => (
          <Cyl key={x} position={[x, 0.1395, 0.015]} radius={0.0045} height={0.002} segments={8} material={mats.rubber} />
        ))}
      </Fine>
    </>
  );
}

function CameraBody({ mats, cinema, hero = false, screenRef, lensRef, progress }) {
  const body = cinema ? [0.275, 0.185, 0.225] : [0.245, 0.17, 0.205];
  const lensLength = cinema ? 0.24 : 0.2;
  const lensRadius = cinema ? 0.057 : 0.052;
  const lensFront = -0.085 - lensLength - 0.062;
  const wideGlass = useRef(null);

  /* Swap the 24-segment glass for the finale-only smooth cover as soon as the
     close-up begins. The swap happens while the lens is still far away. */
  useFrame(() => {
    if (!hero || !wideGlass.current || !progress) return;
    wideGlass.current.visible = progress.finale <= 0.0005;
  });

  return (
    <group>
      <RoundedBox
        args={body}
        radius={0.017}
        smoothness={2}
        position={[0, 0, 0]}
        material={mats.camera}
        userData={{ edgeAngle: 54 }}
      />
      <Box position={[0, -0.105, 0.012]} size={[0.135, 0.028, 0.105]} material={mats.metal} />

      {/* lens: bayonet mount, barrel, ribbed zoom and focus rings, scale
          marks, hood (stills-style) or front housing (cine prime), glass */}
      <Cyl position={[0, 0.004, -0.1]} rotation={[PI / 2, 0, 0]} radius={lensRadius + 0.012} height={0.03} segments={20} material={mats.metalSilver} />
      <Cyl
        position={[0, 0.004, -0.085 - lensLength / 2]}
        rotation={[PI / 2, 0, 0]}
        radius={lensRadius}
        height={lensLength}
        material={mats.lens}
      />
      <Knob material={cinema ? mats.lens : mats.rubber} position={[0, 0.004, -0.15]} rotation={[PI / 2, 0, 0]} r={lensRadius + 0.011} l={cinema ? 0.036 : 0.048} />
      <Knob material={mats.lens} position={[0, 0.004, -0.212]} rotation={[PI / 2, 0, 0]} r={lensRadius + 0.007} l={0.022} />
      <Fine>
        <Box position={[0, 0.004 + lensRadius + 0.004, -0.118]} size={[0.004, 0.003, 0.012]} material={mats.whiteGear} />
        <Box position={[0, 0.004 + lensRadius + 0.004, -0.188]} size={[0.003, 0.003, 0.006]} material={mats.whiteGear} />
        <Cyl position={[0, 0.004, -0.245]} rotation={[PI / 2, 0, 0]} radius={lensRadius + 0.002} height={0.004} segments={20} material={mats.record} />
      </Fine>
      {!cinema && (
        <mesh
          geometry={TUBE20}
          position={[0, 0.004, -0.085 - lensLength - 0.028]}
          rotation={[PI / 2, 0, 0]}
          scale={[lensRadius + 0.018, 0.07, lensRadius + 0.018]}
          material={mats.lens}
        />
      )}
      {cinema && (
        <Cyl position={[0, 0.004, -0.085 - lensLength - 0.03]} rotation={[PI / 2, 0, 0]} radius={lensRadius + 0.016} height={0.06} material={mats.lens} />
      )}
      <Disc
        ref={wideGlass}
        position={[0, 0.004, lensFront]}
        rotation={[0, PI, 0]}
        radius={lensRadius - 0.002}
        material={mats.glass}
      />
      {hero && (
        <>
          <group ref={lensRef} position={[0, 0.004, lensFront]} />
          <HeroLensDetail mats={mats} progress={progress} front={lensFront} />
        </>
      )}

      {/* top handle + posts */}
      <Box position={[0, 0.115, 0.02]} size={[0.165, 0.026, 0.052]} material={mats.cameraTrim} />
      <Box position={[-0.062, 0.088, 0.02]} size={[0.022, 0.048, 0.022]} material={mats.metal} />
      <Box position={[0.062, 0.088, 0.02]} size={[0.022, 0.048, 0.022]} material={mats.metal} />

      {cinema ? (
        <>
          <Box position={[0, 0.133, 0.015]} size={[0.27, 0.012, 0.018]} material={mats.metal} />
          <Box position={[0, 0.133, -0.08]} size={[0.012, 0.012, 0.16]} material={mats.metal} />
          {/* top monitor with sunhood */}
          <group position={[0, 0.105, 0.135]} rotation={[0.42, 0, 0]}>
            <RoundedBox args={[0.135, 0.095, 0.02]} radius={0.006} smoothness={1} material={mats.camera} />
            <Box position={[0, 0, 0.011]} size={[0.118, 0.078, 0.004]} material={mats.screen} />
            <Box position={[0, -0.055, -0.01]} size={[0.05, 0.02, 0.03]} material={mats.metal} />
            <Box position={[0, 0.05, 0.035]} size={[0.135, 0.003, 0.05]} material={mats.cameraTrim} />
            <Box position={[0.067, 0, 0.035]} size={[0.003, 0.095, 0.05]} material={mats.cameraTrim} />
            <Box position={[-0.067, 0, 0.035]} size={[0.003, 0.095, 0.05]} material={mats.cameraTrim} />
          </group>
          <CinemaRig mats={mats} lensFront={lensFront} />
        </>
      ) : (
        <>
          <Box position={[0, 0.005, 0.104]} size={[0.14, 0.095, 0.004]} material={mats.screen} />
          <Box position={[0, 0.005, 0.101]} size={[0.152, 0.106, 0.003]} material={mats.cameraTrim} />
          {hero && (
            <group ref={screenRef} position={[0, 0.005, 0.1066]}>
              <StudioLogoReveal progress={progress} />
            </group>
          )}
          {/* hand grip with shutter, mode dial, back buttons and joystick,
              audio inputs on the handle, left-side dials and vents */}
          <RoundedBox args={[0.045, 0.15, 0.11]} radius={0.018} smoothness={2} position={[0.138, -0.005, -0.02]} material={mats.cameraTrim} />
          <Fine>
            <Cyl position={[0.135, 0.075, -0.06]} radius={0.009} height={0.008} segments={12} material={mats.metalSilver} />
            <Knob material={mats.metal} position={[0.07, 0.092, -0.05]} r={0.017} l={0.012} />
            {[0.035, 0.012, -0.011, -0.034].map((y, i) => (
              <Cyl key={i} position={[0.096, y, 0.104]} rotation={[PI / 2, 0, 0]} radius={0.0065} height={0.006} segments={8} material={mats.rubber} />
            ))}
            <Knob material={mats.rubber} position={[0.096, -0.055, 0.104]} rotation={[PI / 2, 0, 0]} r={0.013} l={0.006} />
            <Cyl position={[-0.03, 0.115, -0.008]} rotation={[PI / 2, 0, 0]} radius={0.009} height={0.006} segments={12} material={mats.metal} />
            <Cyl position={[0.03, 0.115, -0.008]} rotation={[PI / 2, 0, 0]} radius={0.009} height={0.006} segments={12} material={mats.metal} />
            <Knob material={mats.rubber} position={[-0.124, 0.03, -0.04]} rotation={[0, 0, PI / 2]} r={0.012} l={0.006} />
            <Knob material={mats.rubber} position={[-0.124, 0.03, 0.0]} rotation={[0, 0, PI / 2]} r={0.012} l={0.006} />
            {[0, 1, 2, 3].map((i) => (
              <Box key={i} position={[-0.1235, -0.045 + i * 0.016, -0.02]} size={[0.003, 0.007, 0.09]} material={mats.rubber} />
            ))}
          </Fine>
        </>
      )}

      {/* EVF with rubber eyecup, ports, tally light */}
      <Box position={[-0.086, 0.052, 0.115]} size={[0.062, 0.054, 0.062]} material={mats.cameraTrim} />
      <RoundedBox args={[0.058, 0.05, 0.03]} radius={0.012} smoothness={2} position={[-0.086, 0.052, 0.158]} material={mats.rubber} />
      <Box position={[0.075, 0.045, 0.113]} size={[0.055, 0.03, 0.02]} material={mats.metal} />
      <Box position={[0.09, 0.072, -0.114]} size={[0.015, 0.01, 0.008]} material={mats.record} />
      <Box position={[-0.11, 0.06, -0.114]} size={[0.022, 0.022, 0.006]} material={mats.metal} />
    </group>
  );
}

function CameraRig({ mats, spec, hero = false, screenRef, lensRef, progress }) {
  const { x, z, yaw, head, casters, cinema, seed } = spec;
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      <Part seed={seed} spread={0.022} tint={0.82} cast>
        <Tripod mats={mats} head={head} casters={casters} spread={cinema ? 0.64 : 0.6} />
      </Part>
      <Part seed={seed + 0.035} spread={0.018} tint={0.78} cast>
        <group position={[0, head + 0.128, 0]}>
          <CameraBody
            mats={mats}
            cinema={cinema}
            hero={hero}
            screenRef={screenRef}
            lensRef={lensRef}
            progress={progress}
          />
        </group>
      </Part>
    </group>
  );
}

/* --------------------------------------------------------------------------
   Light modifiers
   -------------------------------------------------------------------------- */

/* Deep parabolic softbox. Seen from the doorway it is all black ribbed shell:
   the lit face looks at the set. The apex stays at the mount the stand expects;
   the bowl grows forward from it. */
function Softbox({ mats, size = 0.64 }) {
  const depth = size * 0.8;
  const back = size * 0.22;
  const front = depth - back;
  const shell = { scale: [size, depth, size], rotation: [Math.PI / 2, 0, 0], position: [0, 0, depth / 2 - back] };

  return (
    <group>
      <mesh geometry={UMBRELLA} {...shell} material={mats.fabric} userData={{ edgeAngle: 42 }} />
      <mesh geometry={UMBRELLA_RIBS} {...shell} material={mats.metal} userData={{ noEdges: true }} />
      <Disc position={[0, 0, front - 0.03]} radius={size * 0.9} segments={24} material={mats.diffusion} />
      <Box position={[0, 0, -back - 0.11]} size={[0.085, 0.13, 0.18]} material={mats.metal} />
      <Cyl position={[0, 0, -back - 0.21]} rotation={[Math.PI / 2, 0, 0]} radius={0.018} height={0.06} material={mats.metalSilver} />
    </group>
  );
}

function LedPanel({ mats, w = 0.6, h = 0.44 }) {
  const depth = 0.075;
  return (
    <group>
      <Box position={[0, 0, -0.02]} size={[w, h, depth]} material={mats.cameraSoft} />
      <Box position={[0, 0, 0.014]} size={[w * 0.94, h * 0.92, 0.012]} material={mats.led} />
      <Box position={[0, h / 2 + 0.016, 0.0]} size={[w + 0.04, 0.032, depth + 0.015]} material={mats.metal} />
      <Box position={[0, -h / 2 - 0.016, 0.0]} size={[w + 0.04, 0.032, depth + 0.015]} material={mats.metal} />
      <Box position={[-w / 2 - 0.016, 0, 0.0]} size={[0.032, h + 0.04, depth + 0.015]} material={mats.metal} />
      <Box position={[w / 2 + 0.016, 0, 0.0]} size={[0.032, h + 0.04, depth + 0.015]} material={mats.metal} />
      <Box position={[0, -h / 2 - 0.06, -0.015]} size={[0.07, 0.09, 0.07]} material={mats.metal} />
    </group>
  );
}

function LightStand({ mats, x, z, height = 2.2, seed, spread = 0.42, silver = false, cast = true }) {
  const material = silver ? mats.metalSilver : mats.metal;
  const legs = [0, Math.PI * (2 / 3), Math.PI * (4 / 3)].map((a) => [
    x + Math.sin(a) * spread,
    0.02,
    z + Math.cos(a) * spread,
  ]);

  return (
    <group>
      {mats.contactShadowSoft && (
        <mesh
          geometry={PLANE}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[x, 0.002, z]}
          scale={[spread * 1.6, spread * 1.6, 1]}
          material={mats.contactShadowSoft}
          userData={{ noEdges: true, noCast: true }}
        />
      )}
      {legs.map((leg, i) => mats.contactShadow && (
        <mesh
          key={i}
          geometry={PLANE}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[leg[0], 0.003, leg[2]]}
          scale={[0.22, 0.22, 1]}
          material={mats.contactShadow}
          userData={{ noEdges: true, noCast: true }}
        />
      ))}
      <Part seed={seed} spread={0.018} tint={0.8} cast={cast}>
      <Bar a={[x, 0.11, z]} b={[x, height, z]} radius={0.017} segments={8} material={material} />
      <Cyl position={[x, Math.min(0.95, height * 0.45), z]} radius={0.032} height={0.07} material={material} />
      <Cyl position={[x, 0.115, z]} radius={0.045} height={0.05} material={material} />
      {legs.map((f, i) => (
        <group key={i}>
          <Bar a={[x, 0.52, z]} b={f} radius={0.014} segments={6} material={material} />
          <Box position={[f[0], 0.022, f[2]]} size={[0.05, 0.04, 0.05]} material={mats.rubber} />
        </group>
      ))}
      <Box position={[x, 0.56, z]} size={[0.05, 0.08, 0.05]} material={material} />
    </Part>
    </group>
  );
}

function Sandbag({ mats, x, z, y = 0.08, rotation = 0.4, size = [0.32, 0.14, 0.21] }) {
  return (
    <Part seed={0.64} spread={0.02} tint={0.9} cast>
      <RoundedBox
        args={size}
        radius={0.045}
        smoothness={2}
        position={[x, y, z]}
        rotation={[0, rotation, 0]}
        material={mats.sandbag}
      />
      <Box position={[x, y + size[1] / 2 + 0.005, z]} size={[0.09, 0.012, 0.032]} rotation={[0, rotation, 0]} material={mats.rubber} />
    </Part>
  );
}

/* A modifier + the stand that actually holds it: the stand is placed under
   the real mounting point, after the head has been rotated toward the set. */
function ModifierRig({ mats, spec }) {
  const { pos, target, kind, size, seed, w, h } = spec;
  const quat = useMemo(() => lookQuat(pos, target), [pos[0], pos[1], pos[2], target[0], target[1], target[2]]);

  const mountLocal =
    kind === 'panel' ? [0, -h / 2 - 0.075, -0.015] : [0, 0, -size * 0.22 - 0.29];

  const mount = new THREE.Vector3(...mountLocal).applyQuaternion(quat).add(new THREE.Vector3(...pos));
  const standHeight = Math.max(0.6, mount.y - 0.02);

  return (
    <>
      <LightStand
        mats={mats}
        x={mount.x}
        z={mount.z}
        height={standHeight}
        seed={seed - 0.02}
        spread={kind === 'panel' ? 0.38 : 0.46}
      />
      <Part seed={seed} spread={0.022} tint={0.72} cast>
        <group position={pos} quaternion={quat}>
          {kind !== 'panel' && <Softbox mats={mats} size={size} />}
          {kind === 'panel' && <LedPanel mats={mats} w={w} h={h} />}
        </group>
      </Part>
    </>
  );
}

/* --------------------------------------------------------------------------
   Set dressing
   -------------------------------------------------------------------------- */

function Laptop({ mats }) {
  return (
    <Part seed={0.645} spread={0.018} tint={0.9} cast>
      <group>
        <RoundedBox args={[0.315, 0.016, 0.22]} radius={0.006} smoothness={2} position={[0, 0.008, 0]} material={mats.tableTop} />
        <group position={[0, 0.014, -0.104]} rotation={[-0.34, 0, 0]}>
          <RoundedBox args={[0.315, 0.2, 0.014]} radius={0.006} smoothness={2} position={[0, 0.1, 0]} material={mats.tableTop} />
          <Box position={[0, 0.1, 0.009]} size={[0.286, 0.176, 0.003]} material={mats.screen} />
        </group>
      </group>
    </Part>
  );
}

function Table({ mats }) {
  return (
    <group position={[3.25, 0, -2.4]} rotation={[0, 0.28, 0]}>
      {mats.contactShadowSoft && (
        <mesh
          geometry={PLANE}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.002, 0]}
          scale={[1.1, 0.75, 1]}
          material={mats.contactShadowSoft}
          userData={{ noEdges: true, noCast: true }}
        />
      )}
      <Part seed={0.63} spread={0.02} tint={0.85} cast>
        <Box position={[0, 0.735, 0]} size={[0.86, 0.036, 0.56]} material={mats.tableTop} />
        <Box position={[0, 0.26, 0]} size={[0.72, 0.022, 0.44]} material={mats.metal} />
        {[
          [-0.38, 0.715, -0.23],
          [0.38, 0.715, -0.23],
          [-0.38, 0.715, 0.23],
          [0.38, 0.715, 0.23],
        ].map((p, i) => (
          <Bar key={i} a={[p[0], p[1], p[2]]} b={[p[0] * 0.96, 0.01, p[2] * 0.96]} radius={0.015} segments={6} material={mats.metal} />
        ))}
        <Cyl position={[0.3, 0.838, 0.12]} radius={0.036} height={0.2} material={mats.bottle} />
        <Cyl position={[0.3, 0.952, 0.12]} radius={0.021} height={0.034} material={mats.metalSilver} />
        <group position={[-0.06, 0.756, 0.02]} rotation={[0, -0.3, 0]}>
          <Laptop mats={mats} />
        </group>
      </Part>
    </group>
  );
}

function Stool({ mats }) {
  return (
    <group position={[-2.72, 0, 0.95]}>
      {mats.contactShadowSoft && (
        <mesh
          geometry={PLANE}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.002, 0]}
          scale={[0.55, 0.55, 1]}
          material={mats.contactShadowSoft}
          userData={{ noEdges: true, noCast: true }}
        />
      )}
      <Part seed={0.605} spread={0.02} tint={0.88} cast>
        <Cyl position={[0, 0.455, 0]} radius={0.175} height={0.04} segments={20} material={mats.cameraSoft} />
        {[
          [-0.12, -0.12],
          [0.12, -0.12],
          [-0.12, 0.12],
          [0.12, 0.12],
        ].map((p, i) => (
          <group key={i}>
            <Bar a={[p[0], 0.44, p[1]]} b={[p[0] * 1.35, 0.015, p[1] * 1.35]} radius={0.012} segments={6} material={mats.metal} />
          </group>
        ))}
        {[0, 1].map((i) => (
          <Bar
            key={i}
            a={[-0.15, 0.19, i === 0 ? -0.15 : 0.15]}
            b={[0.15, 0.19, i === 0 ? -0.15 : 0.15]}
            radius={0.008}
            segments={6}
            material={mats.metal}
          />
        ))}
      </Part>
    </group>
  );
}

function CStand({ mats }) {
  const x = -1.72;
  const z = 4.9;
  const legs = [0.4, 2.4, 4.4].map((a) => [x + Math.sin(a) * 0.62, 0.015, z + Math.cos(a) * 0.62]);

  return (
    <Part seed={0.595} spread={0.02} tint={0.82} cast>
      <Bar a={[x, 0.08, z]} b={[x, 2.45, z]} radius={0.02} segments={8} material={mats.metalSilver} />
      {legs.map((f, i) => (
        <group key={i}>
          <Bar a={[x, 0.72, z]} b={f} radius={0.016} segments={6} material={mats.metalSilver} />
          <Box position={[f[0], 0.03, f[2]]} size={[0.06, 0.05, 0.06]} material={mats.rubber} />
        </group>
      ))}
      <Box position={[x, 0.74, z]} size={[0.06, 0.1, 0.06]} material={mats.metalSilver} />
      <Box position={[x, 2.4, z]} size={[0.09, 0.16, 0.09]} rotation={[0, 0.4, 0]} material={mats.metal} />
      <Bar a={[x, 2.33, z]} b={[x + 0.95, 2.56, z - 0.42]} radius={0.016} segments={6} material={mats.metalSilver} />
      <Box position={[x + 0.955, 2.56, z - 0.42]} rotation={[0, 0, -0.2]} size={[0.36, 0.3, 0.012]} material={mats.blackGear} />
    </Part>
  );
}

function Case({ mats, x, z, rotation = 0.35, scale = 1 }) {
  return (
    <Part seed={0.655} spread={0.02} tint={0.9} cast>
      <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
        <RoundedBox
          args={[0.62 * scale, 0.34 * scale, 0.42 * scale]}
          radius={0.028}
          smoothness={2}
          position={[0, 0.17 * scale, 0]}
          material={mats.blackGear}
        />
        <Box position={[0, 0.19 * scale, 0.213 * scale]} size={[0.46 * scale, 0.014, 0.012]} material={mats.metal} />
        <Box position={[0, 0.19 * scale, -0.213 * scale]} size={[0.46 * scale, 0.014, 0.012]} material={mats.metal} />
        <Box position={[0.24 * scale, 0.3 * scale, 0.213 * scale]} size={[0.06, 0.045, 0.012]} material={mats.metalSilver} />
      </group>
    </Part>
  );
}

function Cable({ mats, points, radius = 0.012 }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    return new THREE.TubeGeometry(curve, 64, radius, 5, false);
  }, [points, radius]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return <mesh geometry={geometry} material={mats.rubber} userData={{ noEdges: true }} />;
}

const CABLE_RUNS = [
  [[-1.52, 0.02, 2.25], [-1.95, 0.02, 2.85], [-2.85, 0.02, 3.55], [-4.2, 0.02, 3.25], [-4.82, 0.02, 2.2], [-4.6, 0.02, 1.1]],
  [[0.7, 0.02, 4.25], [1.5, 0.02, 4.85], [2.7, 0.02, 5.05], [3.95, 0.02, 4.7], [4.8, 0.02, 3.8], [4.9, 0.02, 2.9]],
  [[1.05, 0.02, 3.7], [1.95, 0.02, 3.05], [2.95, 0.02, 2.15], [3.2, 0.02, 0.8], [3.4, 0.02, -0.7], [3.35, 0.02, -2.3]],
  [[3.4, 0.02, -2.6], [4.1, 0.02, -3.1], [4.72, 0.02, -2.7]],
  [[-2.9, 0.02, 1.52], [-3.5, 0.02, 1.92], [-4.4, 0.02, 1.6], [-4.8, 0.02, 0.9]],
];

/* --------------------------------------------------------------------------
   Equipment
   -------------------------------------------------------------------------- */

const CAMERAS = [
  { x: -1.75, z: 2.3, yaw: -0.3, head: 1.63, casters: false, cinema: true, seed: 0.5 },
  { x: 0.85, z: 4.05, yaw: 0.22, head: 1.5, casters: true, cinema: false, seed: 0.515 },
];

/* Exported so the lighting and the reflection bake put their sources exactly
   on the modifier faces. */
export const MODIFIERS = [
  { pos: [-2.25, 2.55, 0.55], target: [0.3, 1.2, -5.4], kind: 'octa', size: 0.64, seed: 0.57 },
  { pos: [-2.88, 2.16, 1.5], target: [1.3, 1.0, -3.8], kind: 'dish', size: 0.6, seed: 0.575 },
  { pos: [2.36, 2.55, -0.35], target: [-0.3, 1.2, -4.6], kind: 'octa', size: 0.61, seed: 0.585 },
  { pos: [-1.62, 1.86, 0.55], target: [0.45, 1.35, 7.5], kind: 'panel', w: 0.6, h: 0.44, seed: 0.6 },
  { pos: [1.72, 1.9, -0.2], target: [-0.5, 1.3, 7.5], kind: 'panel', w: 0.58, h: 0.42, seed: 0.605 },
];

export default function StudioEquipment({ mats, progress, heroScreenRef, heroLensRef }) {
  return (
    <>
      {CAMERAS.map((spec, i) => (
        <CameraRig
          key={i}
          mats={mats}
          spec={spec}
          hero={i === 1}
          screenRef={i === 1 ? heroScreenRef : null}
          lensRef={i === 1 ? heroLensRef : null}
          progress={progress}
        />
      ))}

      {MODIFIERS.map((spec, i) => (
        <ModifierRig key={i} mats={mats} spec={spec} />
      ))}

      <Table mats={mats} />
      <Stool mats={mats} />
      <CStand mats={mats} />
      <Case mats={mats} x={-2.62} z={3.1} rotation={0.45} />
      <Case mats={mats} x={-3.25} z={4.1} rotation={-0.2} scale={0.78} />

      <Sandbag mats={mats} x={-2.45} z={0.95} rotation={0.5} />
      <Sandbag mats={mats} x={2.25} z={0.15} rotation={-0.4} size={[0.3, 0.13, 0.2]} />
      <Sandbag mats={mats} x={-2.95} z={1.9} rotation={1.1} />
      <Sandbag mats={mats} x={-1.55} z={5.15} rotation={0.2} size={[0.34, 0.15, 0.22]} />

      {CABLE_RUNS.map((pts, i) => (
        <Cable key={i} mats={mats} points={pts} />
      ))}
    </>
  );
}
