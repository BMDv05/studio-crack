/* The R3F stage for the studio build.

   The renderer is created by hand (createRoot) instead of using <Canvas>: in
   React 18 StrictMode, <Canvas>'s own mount/unmount effect tears the R3F root
   down right after creating it, which leaves the scene frozen after its first
   frames. Owning the root also lets us drive the size from one ResizeObserver
   and keep the renderer opaque.

   Rendering is on-demand: the scroll progress invalidates the renderer, and
   nothing else does. A pinned section that is otherwise still costs no GPU.

   All scene state is a pure function of one number (progress.p):
     - the line shader's draw-on progress
     - the dissolve height of every solid material
     - the floor sweep
     - the practical lights
     - the fading grid
   No clocks, no random per-frame motion.

   There is no post-processing stack. On integrated GPUs the full-screen bloom
   passes were the largest per-frame cost by far; the practicals and the lens
   have their own additive glow, and the renderer still tone-maps the frame
   directly. */

import { Component, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createRoot, extend, useFrame, useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { createGridMaterial, createLineMaterial, createStudioMaterials } from './BlueprintMaterials.js';
import { buildStudioLines } from './studioEdges.js';
import ArchitecturalStructure from './ArchitecturalStructure.jsx';
import StudioEquipment from './StudioEquipment.jsx';
import StudioLighting from './StudioLighting.jsx';
import FinaleCamera from './FinaleCamera.jsx';
import { PLANE } from './geometry.js';
import { PHASE, smoothstep } from './studioMath.js';

/* <Canvas> normally does this; a hand-made root has to extend the catalogue
   of three elements itself. */
extend(THREE);

function createUniforms() {
  return {
    build: { value: 0 },
    rise: { value: -0.42 },
    floorReveal: { value: 0 },
    lineFade: { value: 1 },
    lineOpacity: { value: 0.8 },
    edge: { value: 0 },
    gridOpacity: { value: 0.88 },
  };
}

/* Pure part: progress -> shared uniforms. Also called at construction so a
   static (reduced-motion) mount starts already fully materialised. */
function applyUniforms(p, u) {
  u.build.value = p;
  u.rise.value = -0.42 + smoothstep(PHASE.materialStart, PHASE.materialEnd, p) * 6.0;
  u.floorReveal.value = smoothstep(PHASE.floorStart, PHASE.floorEnd, p);
  u.lineFade.value = 1 - smoothstep(PHASE.linesFadeStart, PHASE.linesFadeEnd, p);
  u.edge.value =
    0.7 * smoothstep(PHASE.edgesIn, PHASE.edgesLit, p) * (1 - smoothstep(PHASE.edgesOut, PHASE.edgesGone, p));
  u.gridOpacity.value = 0.88 * (1 - smoothstep(PHASE.gridFadeStart, PHASE.gridFadeEnd, p));
}

function applyScene(p, u, scene, mats) {
  applyUniforms(p, u);

  /* Surfaces need light the moment they exist — the room comes up as it
     materialises, not after it. */
  const light = smoothstep(PHASE.lightsIn, PHASE.lightsFull, p);

  if (scene.fog) scene.fog.density = 0.016 - 0.012 * light;
  scene.environmentIntensity = 0.95 * light;

  mats.glowWarm.opacity = 0.35 * light;
  mats.glowWarm.visible = light > 0.005;
  mats.glowCool.opacity = 0.25 * light;
  mats.glowCool.visible = light > 0.005;
  if (mats.contactShadow) {
    mats.contactShadow.opacity = 0.75 * light;
    mats.contactShadow.visible = light > 0.005;
  }
  if (mats.contactShadowSoft) {
    mats.contactShadowSoft.opacity = 0.38 * light;
    mats.contactShadowSoft.visible = light > 0.005;
  }
}

/* The last stretch of the opening is a close-up: the camera body and lens fill
   the frame, so every pixel is expensive. The finale opens with a short camera
   hold, and that still frame is where the scene drops to 0.8x; every frame
   where the camera actually moves is then cheap, and the finished hero is DOM
   and stays sharp. */
const LOW_RENDER_SCALE = 0.8;

function ResolutionGovernor({ progress, low }) {
  const gl = useThree((state) => state.gl);
  const base = useRef(1);
  const reduced = useRef(false);

  useLayoutEffect(() => {
    const cap = low ? 1 : 1.25;
    base.current = Math.min(window.devicePixelRatio || 1, cap);
  }, [low]);

  useFrame(() => {
    const f = progress.finale;
    /* The finale's opening hold is a still frame: the one-time buffer resize
       costs nothing visible there. The hysteresis keeps a scroll poised on
       the boundary from flickering between sizes. */
    if (!reduced.current && f > 0.001) reduced.current = true;
    else if (reduced.current && f < 0.0005) reduced.current = false;

    const target = base.current * (reduced.current ? LOW_RENDER_SCALE : 1);
    if (Math.abs(gl.getPixelRatio() - target) > 0.02) gl.setPixelRatio(target);
  });

  return null;
}

function World({ progress, low }) {
  const { scene, gl, camera, invalidate } = useThree();
  const solidRef = useRef(null);
  const heroScreenRef = useRef(null);
  const heroLensRef = useRef(null);
  const linePassRef = useRef(null);
  const gridRef = useRef(null);

  const uniforms = useMemo(() => {
    const u = createUniforms();
    applyUniforms(progress.p, u);
    return u;
  }, [progress]);

  const { mats, dispose } = useMemo(() => createStudioMaterials(uniforms), [uniforms]);
  useEffect(() => () => dispose(), [dispose]);

  const lineMaterial = useMemo(() => createLineMaterial(uniforms), [uniforms]);
  const gridMaterial = useMemo(() => createGridMaterial(uniforms), [uniforms]);
  useEffect(
    () => () => {
      lineMaterial.dispose();
      gridMaterial.dispose();
    },
    [lineMaterial, gridMaterial],
  );

  /* Let the scroll trigger wake the renderer. */
  useEffect(() => {
    progress.invalidate = invalidate;
    return () => {
      if (progress.invalidate === invalidate) progress.invalidate = null;
    };
  }, [progress, invalidate]);

  /* Dev-only handle for scene inspection/QA; harmless in production. */
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    window.__studio = { scene, gl, camera, invalidate, progress };
    return () => {
      if (window.__studio && window.__studio.scene === scene) delete window.__studio;
    };
  }, [scene, gl, camera, invalidate, progress]);

  /* Soft studio reflections from a generated room environment. */
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = new RoomEnvironment();
    const target = pmrem.fromScene(env, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0;
    pmrem.dispose();

    env.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });

    invalidate();
    return () => {
      scene.environment = null;
      target.dispose();
    };
  }, [gl, scene, invalidate]);

  useEffect(() => {
    scene.fog = new THREE.FogExp2('#06100f', 0.022);
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  /* Build the line pass from the solid meshes once they are mounted. */
  useLayoutEffect(() => {
    const root = solidRef.current;
    if (!root) return undefined;

    root.traverse((o) => {
      if (!o.isMesh) return;
      o.receiveShadow = true;
      if (o.userData?.noCast) {
        o.castShadow = false;
        return;
      }
      const isFloor = o.material === mats.floor || o.material === mats.mat;
      const isBackdrop = o.material === mats.backdrop;
      const isDecal =
        o.material === mats.glowWarm ||
        o.material === mats.glowCool ||
        o.material === mats.contactShadow ||
        o.material === mats.contactShadowSoft;
      o.castShadow = !isFloor && !isBackdrop && !isDecal;
    });

    const geometry = buildStudioLines(root);
    const lines = new THREE.LineSegments(geometry, lineMaterial);
    lines.frustumCulled = false;
    lines.renderOrder = 12;
    linePassRef.current = lines;
    scene.add(lines);

    /* Nothing in the studio ever moves: only the viewer camera does. The
       directional shadow map can therefore be generated once, after every
       solid has mounted, and reused for the rest of the experience. Updating
       it on every scroll step was pure waste. */
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    invalidate();

    return () => {
      linePassRef.current = null;
      scene.remove(lines);
      geometry.dispose();
    };
  }, [scene, gl, lineMaterial, invalidate]);

  /* Apply the current progress before the very first frame. */
  useLayoutEffect(() => {
    applyScene(progress.p, uniforms, scene, mats);
    invalidate();
  }, [progress, uniforms, scene, mats, invalidate]);

  useFrame(() => {
    applyScene(progress.p, uniforms, scene, mats);

    /* Once the build has faded its wireframe and floor grid, those two
       full-scene passes are invisible. Hide them instead of shading a whole
       studio of discarded fragments behind the lens close-up. */
    if (linePassRef.current) linePassRef.current.visible = uniforms.lineFade.value > 0.001;
    if (gridRef.current) gridRef.current.visible = uniforms.gridOpacity.value > 0.001;
    if (progress.p > 0.72 && progress.p <= 1.0) {
      gl.shadowMap.needsUpdate = true;
    }
  });

  return (
    <>
      <ResolutionGovernor progress={progress} low={low} />
      <color attach="background" args={['#06100f']} />
      <FinaleCamera progress={progress} screenRef={heroScreenRef} lensRef={heroLensRef} />
      <StudioLighting progress={progress} low={low} />

      <group ref={solidRef}>
        <ArchitecturalStructure mats={mats} />
        <StudioEquipment
          mats={mats}
          progress={progress}
          heroScreenRef={heroScreenRef}
          heroLensRef={heroLensRef}
        />
      </group>

      {/* The blueprint floor: a huge plane exactly at floor level, drawn by a
          shader so the grid stays crisp at every distance and fades out. */}
      <mesh
        ref={gridRef}
        geometry={PLANE}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.004, 1.7]}
        scale={[70, 70, 1]}
        material={gridMaterial}
        renderOrder={2}
      />
    </>
  );
}

/* Catches a scene failure inside the R3F tree and reports it to the DOM, so
   the wrapper can swap to the CSS plate. */
class SceneGuard extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function StudioScene({ progress, low = false, onFail }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;

    let root = null;
    let store = null;
    let disposed = false;
    let observer = null;
    let timer = 0;

    const start = () => {
      timer = 0;
      if (disposed || !canvas.isConnected) return;

      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const aspect = width / height;
      const initialFov = aspect < 0.6 ? 64 : aspect < 0.85 ? 52 : aspect < 1.35 ? 39 : 34;
      const initialZ = aspect < 0.6 ? 13.8 : aspect < 0.85 ? 11.8 : 10;
      const initialY = aspect < 0.6 ? 1.45 : aspect < 0.85 ? 1.48 : 1.5;
      const initialX = aspect < 0.6 ? -0.05 : aspect < 0.85 ? -0.08 : aspect < 1.35 ? -0.1 : 0;

      try {
        root = createRoot(canvas);
        root.configure({
          gl: {
            antialias: true,
            alpha: false,
            stencil: false,
            powerPreference: 'high-performance',
          },
          size: { width, height, top: 0, left: 0 },
          camera: { fov: initialFov, near: 0.1, far: 170, position: [initialX, initialY, initialZ] },
          shadows: 'soft',
          dpr: [1, low ? 1.25 : 1.75],
          frameloop: 'demand',
          onCreated: ({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.06;
            gl.shadowMap.enabled = true;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
          },
        });

        store = root.render(
          <SceneGuard onFail={() => failRef.current?.()}>
            <World progress={progress} low={low} />
          </SceneGuard>,
        );

        store.getState().invalidate();

        observer = new ResizeObserver((entries) => {
          const rect = entries[0] && entries[0].contentRect;
          if (!rect || rect.width < 2 || rect.height < 2 || !store) return;
          store.getState().setSize(rect.width, rect.height, true);
          store.getState().invalidate();
        });
        observer.observe(host);
      } catch (error) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[studio] renderer could not start', error);
          window.__studioError = error;
        }
        failRef.current?.();
      }
    };

    /* Defer creation one task: React 18 StrictMode's double-invoked effects
       then cancel this timer and only the surviving pass builds the root. */
    timer = window.setTimeout(start, 0);

    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
      if (observer) observer.disconnect();
      if (root) {
        try {
          root.unmount();
        } catch {
          /* already gone */
        }
        root = null;
        store = null;
      }
    };
  }, [progress, low]);

  return (
    <div
      ref={hostRef}
      style={{ position: 'absolute', inset: 0, touchAction: 'pan-y' }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'pan-y' }}
      />
    </div>
  );
}
