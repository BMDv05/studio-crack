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

import { createGridMaterial, createLineMaterial, createStudioMaterials } from './BlueprintMaterials.js';
import { buildStudioEnvironment } from './studioEnvironment.js';
import { bakeStudio } from './studioBake.js';
import { buildStudioLines } from './studioEdges.js';
import ArchitecturalStructure, { SPOTS, spotOrigin } from './ArchitecturalStructure.jsx';
import StudioEquipment, { MODIFIERS } from './StudioEquipment.jsx';
import { makeRadialTexture } from './textures.js';
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
    /* Baked architecture lighting (studioBake.js). Empty until the bake has
       run; the gain is 0 until then, so nothing reads the empty textures. */
    bakeTex: Array.from({ length: 5 }, () => ({ value: null })),
    bakeVP: Array.from({ length: 5 }, () => ({ value: new THREE.Matrix4() })),
    bakeGain: { value: 0 },
    bakeReady: false,
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

  if (scene.fog) scene.fog.density = 0.016 - 0.0125 * light;
  scene.environmentIntensity = 0.85 * light;
  u.bakeGain.value = u.bakeReady ? light : 0;

  /* The bake carries the real light pools and the soft occlusion under the
     gear now; the old painted-on decals are only a fallback until it exists.
     The warm sheen stays: the blurred reflection probe cannot give the polished
     floor its long glow on its own. */
  const decals = u.bakeReady ? 0 : light;
  mats.glowWarm.opacity = 0.14 * light;
  mats.glowWarm.visible = light > 0.005;
  mats.glowCool.opacity = 0.07 * decals;
  mats.glowCool.visible = decals > 0.005;
  if (mats.contactShadow) {
    mats.contactShadow.opacity = 0.75 * decals;
    mats.contactShadow.visible = decals > 0.005;
  }
  if (mats.contactShadowSoft) {
    mats.contactShadowSoft.opacity = 0.38 * decals;
    mats.contactShadowSoft.visible = decals > 0.005;
  }
}

/* The last stretch of the opening is a close-up: the camera body and lens fill
   the frame, so every pixel is expensive. The finale opens with a short camera
   hold, and that still frame is where the scene drops to 0.8x; every frame
   where the camera actually moves is then cheap, and the finished hero is DOM
   and stays sharp. */
const LOW_RENDER_SCALE = 0.8;

/* Dynamic resolution. Integrated GPUs (the scene was measured on a Radeon
   610M) cannot shade a full-HD studio at 60 fps; dropping the render scale a
   step is far less visible than a stutter. While the user is actually
   scrolling, the governor watches the interval between rendered frames and
   steps the scale down when frames run long, and back up when there is
   headroom. Idle gaps (no scroll) are ignored. */
const ADAPT_STEPS = [1, 0.85, 0.72, 0.62];
const SLOW_MS = 24;
const FAST_MS = 18;
const SETTLE_FRAMES = 45;

/* Changing the pixel ratio reallocates the multisampled drawing buffer, which
   costs 20–150 ms on the 610M: a visible hitch if it lands mid-scroll. The new
   ratio is therefore applied only once the page itself has stopped scrolling
   for this long (not just the 3D: the page keeps moving past the hero), when
   one slow frame is never seen. */
const RESIZE_IDLE_MS = 220;
/* A step DOWN protects the frame rate, so it is not deferred forever: if the
   scroll never pauses, it goes through after this long and costs one hitch
   instead of seconds of slow frames. Steps up always wait for a pause. */
const DOWNGRADE_MAX_WAIT_MS = 1500;

function ResolutionGovernor({ progress, low }) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const base = useRef(1);
  const reduced = useRef(false);
  const adapt = useRef({ step: 0, ema: 16.7, last: 0, since: 0 });
  const pending = useRef({ target: 0, timer: 0 });

  useLayoutEffect(() => {
    const cap = low ? 1 : 1.25;
    base.current = Math.min(window.devicePixelRatio || 1, cap);
  }, [low]);

  /* Any scroll or wheel input (Lenis keeps emitting scroll while it eases)
     pushes a waiting resolution switch back until the page is still. */
  useEffect(() => {
    const p = pending.current;
    p.lastInput = performance.now();
    const touch = () => { p.lastInput = performance.now(); };
    window.addEventListener('scroll', touch, { passive: true });
    window.addEventListener('wheel', touch, { passive: true });
    window.addEventListener('touchmove', touch, { passive: true });
    return () => {
      window.removeEventListener('scroll', touch);
      window.removeEventListener('wheel', touch);
      window.removeEventListener('touchmove', touch);
      window.clearTimeout(p.timer);
    };
  }, []);

  useFrame(() => {
    const a = adapt.current;
    const now = performance.now();
    const dt = now - a.last;
    a.last = now;
    if (dt > 0 && dt < 120) {
      a.ema += (dt - a.ema) * 0.12;
      a.since += 1;
      if (a.since > SETTLE_FRAMES) {
        if (a.ema > SLOW_MS && a.step < ADAPT_STEPS.length - 1) {
          a.step += 1;
          a.since = 0;
        } else if (a.ema < FAST_MS && a.step > 0) {
          a.step -= 1;
          a.since = 0;
        }
      }
    }

    const f = progress.finale;
    /* The finale's opening hold is a still frame: the one-time buffer resize
       costs nothing visible there. The hysteresis keeps a scroll poised on
       the boundary from flickering between sizes. */
    if (!reduced.current && f > 0.001) reduced.current = true;
    else if (reduced.current && f < 0.0005) reduced.current = false;

    const target = base.current * (reduced.current ? LOW_RENDER_SCALE : 1) * ADAPT_STEPS[a.step];
    const p = pending.current;
    const current = gl.getPixelRatio();
    if (Math.abs(current - target) <= 0.02) {
      window.clearTimeout(p.timer);
      p.timer = 0;
      p.since = 0;
      return;
    }
    const downgrade = target < current;
    if (!p.since || p.target !== target) p.since = now;
    p.target = target;
    window.clearTimeout(p.timer);
    p.timer = 0;
    const commit = () => {
      p.timer = 0;
      p.since = 0;
      if (Math.abs(gl.getPixelRatio() - p.target) > 0.02) {
        gl.setPixelRatio(p.target);
        invalidate();
      }
    };
    if (downgrade && now - p.since > DOWNGRADE_MAX_WAIT_MS) {
      commit();
      return;
    }
    /* Every rendered frame pushes the switch back; it fires after the last
       one, and waits further while the page is still being scrolled. */
    const apply = () => {
      const quiet = performance.now() - (p.lastInput || 0);
      if (quiet < RESIZE_IDLE_MS) {
        p.timer = window.setTimeout(apply, RESIZE_IDLE_MS - quiet + 10);
        return;
      }
      commit();
    };
    p.timer = window.setTimeout(apply, RESIZE_IDLE_MS);
  });

  return null;
}

const PANEL_HALOS = MODIFIERS.filter((m) => m.kind === 'panel').map((m) => {
  const pos = new THREE.Vector3(...m.pos);
  const dir = new THREE.Vector3(...m.target).sub(pos).normalize();
  /* Far enough off the face that the billboard never cuts through the angled panel. */
  return { position: pos.addScaledVector(dir, 0.28).toArray(), scale: [m.w * 3.4, m.h * 3.9, 1] };
});

/* Only the spots that face the doorway flare; the barn-doored ones look away. */
const SPOT_HALOS = SPOTS.filter((s) => !s.barn).map((s) => {
  const pos = new THREE.Vector3(...spotOrigin(s));
  const dir = new THREE.Vector3(...s.target).sub(pos).normalize();
  return { position: pos.addScaledVector(dir, 0.27).toArray(), scale: [0.56, 0.56, 1] };
});

/* Glow around the practicals: what bloom did, for the price of a few sprites.
   A real sensor flares around an overexposed source; an additive halo just in
   front of each face gives the same read without a full-screen pass. */
function Halos({ progress, texture, halos, color, strength, from = PHASE.lightsIn, to = PHASE.lightsFull }) {
  const refs = useRef([]);
  const material = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: texture,
        color,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        opacity: 0,
      }),
    [texture, color],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const light = smoothstep(from, to, progress.p);
    material.opacity = strength * light;
    refs.current.forEach((s) => {
      if (s) s.visible = light > 0.005;
    });
  });

  return halos.map((h, i) => (
    <sprite
      key={i}
      ref={(el) => {
        refs.current[i] = el;
      }}
      position={h.position}
      scale={h.scale}
      material={material}
      renderOrder={10}
    />
  ));
}

function World({ progress, low }) {
  const { scene, gl, camera, invalidate } = useThree();
  const solidRef = useRef(null);
  const heroScreenRef = useRef(null);
  const heroLensRef = useRef(null);
  const linePassRef = useRef(null);
  const gridRef = useRef(null);
  const haloTexture = useMemo(() => makeRadialTexture(), []);
  useEffect(() => () => haloTexture.dispose(), [haloTexture]);

  const uniforms = useMemo(() => {
    const u = createUniforms();
    applyUniforms(progress.p, u);
    return u;
  }, [progress]);

  const { mats, dispose, ready: surfacesReady } = useMemo(() => createStudioMaterials(uniforms), [uniforms]);
  useEffect(() => () => dispose(), [dispose]);
  /* The scanned surfaces stream in after first paint: draw once more when
     they land (rendering is on demand). */
  useEffect(() => {
    let live = true;
    surfacesReady.then(() => live && invalidate());
    return () => {
      live = false;
    };
  }, [surfacesReady, invalidate]);

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

  /* Reflections baked from a proxy of this very studio (see
     studioEnvironment.js), not a generic room. */
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = buildStudioEnvironment();
    const target = pmrem.fromScene(env.scene, 0.02, 0.05, 40);
    scene.environment = target.texture;
    scene.environmentIntensity = 0;
    pmrem.dispose();
    env.dispose();

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
      /* The shell (walls, ceiling, backdrop...) never casts: the ceiling box
         used to put the whole room in the key light's shadow. Its own light
         is baked. */
      const isShell = Boolean(o.material?.userData?.studioBaked);
      o.castShadow = !isFloor && !isBackdrop && !isDecal && !isShell;
    });

    const geometry = buildStudioLines(root);
    const lines = new THREE.LineSegments(geometry, lineMaterial);
    lines.frustumCulled = false;
    lines.renderOrder = 12;
    linePassRef.current = lines;
    scene.add(lines);

    /* Bake the architecture's light once (see studioBake.js). It runs behind
       the preloader, before the room has any visible surface. If it fails for
       any reason the studio still renders, just with the painted decals. */
    let bake = null;
    try {
      bake = bakeStudio({ gl, scene, root });
      bake.textures.forEach((t, i) => {
        uniforms.bakeTex[i].value = t;
        uniforms.bakeVP[i].value.copy(bake.matrices[i]);
      });
      uniforms.bakeReady = true;
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[studio] light bake failed', error); // eslint-disable-line no-console
    }

    /* Nothing in the studio ever moves: only the viewer camera does. The
       directional shadow map can therefore be generated once, after every
       solid has mounted, and reused for the rest of the experience. */
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    invalidate();

    return () => {
      linePassRef.current = null;
      scene.remove(lines);
      geometry.dispose();
      uniforms.bakeReady = false;
      uniforms.bakeTex.forEach((t) => {
        t.value = null;
      });
      bake?.dispose();
    };
  }, [scene, gl, lineMaterial, invalidate, uniforms, mats]);

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
      <ResolutionGovernor progress={progress} low={low} />
      <Halos progress={progress} texture={haloTexture} halos={PANEL_HALOS} color="#ffb97a" strength={0.34} />
      {/* The ceiling is the last thing the rising surfaces reach. */}
      <Halos
        progress={progress}
        texture={haloTexture}
        halos={SPOT_HALOS}
        color="#ffd29a"
        strength={0.72}
        from={PHASE.materialEnd - 0.02}
        to={PHASE.materialEnd + 0.01}
      />
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
            /* AgX: the filmic curve that keeps hot softboxes from clipping
               to flat white, applied directly in every material's shader —
               no post-processing pass. */
            gl.toneMapping = THREE.AgXToneMapping;
            gl.toneMappingExposure = 1.55;
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

        /* The observer also fires when the host is shown again at the same
           size (scrolling back up into the hero). Resizing the renderer then
           would reallocate the drawing buffer for nothing, so only a real
           change in size goes through. */
        let lastW = width;
        let lastH = height;
        observer = new ResizeObserver((entries) => {
          const rect = entries[0] && entries[0].contentRect;
          if (!rect || rect.width < 2 || rect.height < 2 || !store) return;
          if (Math.abs(rect.width - lastW) < 0.5 && Math.abs(rect.height - lastH) < 0.5) return;
          lastW = rect.width;
          lastH = rect.height;
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
        data-scene=""
        aria-hidden="true"
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'pan-y' }}
      />
    </div>
  );
}
