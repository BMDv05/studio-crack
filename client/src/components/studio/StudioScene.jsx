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
   No clocks, no random per-frame motion. */

import { Component, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createRoot, extend, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
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

  if (scene.fog) scene.fog.density = 0.022 - 0.016 * light;
  scene.environmentIntensity = 0.45 * light;

  mats.glowWarm.opacity = 0.2 * light;
  mats.glowWarm.visible = light > 0.005;
  mats.glowCool.opacity = 0.14 * light;
  mats.glowCool.visible = light > 0.005;
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
      let node = o;
      let cast = false;
      while (node) {
        if (node.userData && node.userData.cast) {
          cast = true;
          break;
        }
        node = node.parent;
      }
      o.castShadow = cast;
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
  });

  return (
    <>
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

      <EffectComposer multisampling={low ? 0 : 2}>
        <Bloom
          mipmapBlur
          intensity={low ? 0.26 : 0.42}
          luminanceThreshold={0.8}
          luminanceSmoothing={0.3}
          radius={0.55}
        />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
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

      try {
        root = createRoot(canvas);
        root.configure({
          gl: {
            antialias: false,
            alpha: false,
            stencil: false,
            /* The finale copies the held lens frame out to the home hero as
               its backdrop; toDataURL can only read a buffer that survives
               between frames. */
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance',
          },
          size: { width, height, top: 0, left: 0 },
          camera: { fov: 34, near: 0.1, far: 170, position: [0, 1.5, 10] },
          shadows: 'soft',
          dpr: [1, low ? 1.25 : 1.5],
          frameloop: 'demand',
          onCreated: ({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 0.95;
          },
        });

        store = root.render(
          <SceneGuard onFail={() => failRef.current?.()}>
            <World progress={progress} low={low} />
          </SceneGuard>,
        );

        store.getState().invalidate();

        /* One-shot snapshot of the current frame, used by the hand-off: the
           light veil is at full cover, so the still leaves the page with the
           camera held on the glass and the hero opens on the same pixels. */
        progress.freeze = () => {
          try {
            /* Ask for WebP, but do not reject another encoding: some WebGL
               implementations fall back to PNG for toDataURL. The still is
               captured once, so a larger payload is still the right trade. */
            const url = canvas.toDataURL('image/webp', 0.92);
            return url.startsWith('data:image/') ? url : null;
          } catch {
            return null;
          }
        };

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
      progress.freeze = null;
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
