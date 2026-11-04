/* One-time light bake for the studio's architecture.

   Nothing in the room moves — only the viewer's camera does — so the light
   that lands on the floor, walls, backdrop and ceiling can be computed once,
   at full quality, and then read back for free on every frame.

   For each of the five room planes an orthographic camera looks straight at
   the plane and renders only the architecture into a half-float texture:

     ambient occlusion  32 directional lights spread over the sky dome, each
                        with a shadow map of the gear. Their cosine-weighted
                        visibility, averaged, is how open each texel is: soft
                        pools under stands, cases and sandbags, darker around
                        every foot.
     direct light       every softbox, beauty dish and LED panel as a real
                        area light, every rig spot with a soft beam, the
                        cyc washes and the key with its shadow map — far more
                        light than the live renderer could afford per frame.

   The two are packed into one RGBA texture per plane (rgb = irradiance / PI,
   a = occlusion). BlueprintMaterials reads them by world position. */

import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { MODIFIERS } from './StudioEquipment.jsx';
import { SPOTS, spotOrigin } from './ArchitecturalStructure.jsx';

const AO_SAMPLES = 48;
/* The key is a big soft source, not the sun: its shadow is the average of
   this many hard shadows from points spread across its face. */
const KEY_SAMPLES = 12;
const KEY_DIR = new THREE.Vector3(3.2, 7.5, 8.0).normalize();
const KEY_SPREAD = 0.11; // radians: a large source, soft but still directional
const KEY_POWER = 1.15;
const CENTER = new THREE.Vector3(0, 2.1, 1.7);

/* The five planes: where the camera sits, what it looks at, and the texture
   size (about 2 cm per texel on the floor). */
function makeViews() {
  const views = [
    { name: 'floor', size: [512, 912], half: [5, 8.9], pos: [0, 0.5, 1.7], look: [0, 0, 1.7], up: [0, 0, -1], far: 0.56, normal: [0, 1, 0] },
    { name: 'back', size: [512, 216], half: [5, 2.1], pos: [0, 2.1, -6.0], look: [0, 2.1, -8], up: [0, 1, 0], far: 1.45, normal: [0, 0, 1] },
    { name: 'left', size: [912, 216], half: [8.9, 2.1], pos: [-4.3, 2.1, 1.7], look: [-6, 2.1, 1.7], up: [0, 1, 0], far: 0.95, normal: [1, 0, 0] },
    { name: 'right', size: [912, 216], half: [8.9, 2.1], pos: [4.3, 2.1, 1.7], look: [6, 2.1, 1.7], up: [0, 1, 0], far: 0.95, normal: [-1, 0, 0] },
    { name: 'ceiling', size: [256, 456], half: [5, 8.9], pos: [0, 3.9, 1.7], look: [0, 5, 1.7], up: [0, 0, -1], far: 0.45, normal: [0, -1, 0], noAO: true },
  ];

  return views.map((v) => {
    const cam = new THREE.OrthographicCamera(-v.half[0], v.half[0], v.half[1], -v.half[1], 0.005, v.far);
    cam.position.set(...v.pos);
    cam.up.set(...v.up);
    cam.lookAt(...v.look);
    cam.updateMatrixWorld(true);
    const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    return { ...v, cam, vp, normal: new THREE.Vector3(...v.normal) };
  });
}

function target(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: true,
  });
}

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* Directions spread evenly over the upper sky (above ~8 degrees). */
function skyDirections(n) {
  const out = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const minY = Math.sin(THREE.MathUtils.degToRad(14));
  for (let i = 0; i < n; i += 1) {
    const y = minY + (1 - minY) * ((i + 0.5) / n);
    const r = Math.sqrt(1 - y * y);
    const phi = i * golden;
    out.push(new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r));
  }
  return out;
}

/* The full studio lighting, at bake quality. Only ever lives in the scene for
   the duration of the bake. */
function bakeLights() {
  const lights = [];

  MODIFIERS.forEach((m) => {
    let w;
    let h;
    let front;
    let power;
    if (m.kind === 'panel') {
      w = m.w * 0.94; h = m.h * 0.92; front = 0.03; power = 16;
    } else if (m.kind === 'octa') {
      w = m.size * 1.55; h = m.size * 1.55; front = m.size * 0.22 + 0.01; power = 11;
    } else {
      w = m.size * 1.2; h = m.size * 1.2; front = m.size * 0.16 + 0.04; power = 8;
    }
    const pos = new THREE.Vector3(...m.pos);
    const aim = new THREE.Vector3(...m.target);
    pos.addScaledVector(aim.clone().sub(pos).normalize(), front);
    const light = new THREE.RectAreaLight(m.kind === 'panel' ? '#ffd2a0' : '#ffeed8', power, w, h);
    light.position.copy(pos);
    light.lookAt(aim);
    lights.push(light);
  });

  SPOTS.forEach((s) => {
    const origin = new THREE.Vector3(...spotOrigin(s));
    const aim = new THREE.Vector3(...s.target);
    origin.addScaledVector(aim.clone().sub(origin).normalize(), 0.18);
    const spot = new THREE.SpotLight('#ffe0b4', s.power, 0, s.angle ?? (s.barn ? 0.4 : 0.5), 0.9, 2);
    spot.position.copy(origin);
    spot.target.position.copy(aim);
    lights.push(spot, spot.target);
  });

  [
    [[0, 3.4, -4.2], '#ffe8c9', 3.2, 11],
    [[-4.2, 2.8, -6.4], '#eef7f2', 2.6, 6],
    [[4.2, 2.8, -6.4], '#eef7f2', 2.6, 6],
  ].forEach(([p, c, i, d]) => {
    const point = new THREE.PointLight(c, i, d, 2);
    point.position.set(...p);
    lights.push(point);
  });

  return lights;
}

/* Points spread over the key's face (a disc around its direction). */
function keyDirections(n) {
  const out = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const up = Math.abs(KEY_DIR.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const t1 = new THREE.Vector3().crossVectors(KEY_DIR, up).normalize();
  const t2 = new THREE.Vector3().crossVectors(KEY_DIR, t1).normalize();
  for (let i = 0; i < n; i += 1) {
    const r = KEY_SPREAD * Math.sqrt((i + 0.5) / n);
    const a = i * golden;
    out.push(KEY_DIR.clone().addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).normalize());
  }
  return out;
}

const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uStep;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tSrc, vUv) * 0.2270270270;
    c += texture2D(tSrc, vUv + uStep * 1.3846153846) * 0.3162162162;
    c += texture2D(tSrc, vUv - uStep * 1.3846153846) * 0.3162162162;
    c += texture2D(tSrc, vUv + uStep * 3.2307692308) * 0.0702702703;
    c += texture2D(tSrc, vUv - uStep * 3.2307692308) * 0.0702702703;
    gl_FragColor = c;
  }
`;

export function bakeStudio({ gl, scene, root }) {
  if (!THREE.UniformsLib.LTC_FLOAT_1) RectAreaLightUniformsLib.init();

  const views = makeViews();

  /* --- classify the scene ------------------------------------------------ */
  const baked = new Set();
  const casters = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m && m.userData && m.userData.studioBaked) baked.add(o);
    else if (o.castShadow && m && m.isMeshStandardMaterial) casters.add(o);
  });
  /* Occlusion is a local effect. The ceiling rig is metres above everything
     it would shade; as a directional caster it only draws long hard streaks. */
  const aoCasters = new Set();
  const box = new THREE.Box3();
  casters.forEach((o) => {
    box.setFromObject(o);
    if (box.min.y < 3.4) aoCasters.add(o);
  });

  /* --- save everything the bake touches ---------------------------------- */
  const saved = {
    visible: new Map(),
    cast: new Map(),
    override: scene.overrideMaterial,
    background: scene.background,
    fog: scene.fog,
    environment: scene.environment,
    target: gl.getRenderTarget(),
    clearColor: gl.getClearColor(new THREE.Color()),
    clearAlpha: gl.getClearAlpha(),
    autoClear: gl.autoClear,
    shadowAuto: gl.shadowMap.autoUpdate,
  };
  scene.traverse((o) => saved.visible.set(o, o.visible));
  baked.forEach((o) => saved.cast.set(o, o.castShadow));

  const rig = bakeLights();
  const aoSun = new THREE.DirectionalLight('#ffffff', Math.PI);
  aoSun.castShadow = true;
  aoSun.shadow.mapSize.set(1024, 1024);
  Object.assign(aoSun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 0.5, far: 70 });
  aoSun.shadow.camera.updateProjectionMatrix();
  aoSun.shadow.bias = -0.0006;
  aoSun.shadow.normalBias = 0.04;
  aoSun.target.position.copy(CENTER);
  const bakeObjects = new Set([...rig, aoSun, aoSun.target]);
  const shadowed = new Set([...baked, ...aoCasters]);
  bakeObjects.forEach((o) => scene.add(o));

  const aoMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const lightMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 1, metalness: 0, specularIntensity: 0 });

  const accumulate = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null } },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc;
        varying vec2 vUv;
        void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }
      `,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    }),
  );
  const combine = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: { tLight: { value: null }, tAO: { value: null }, uNorm: { value: 1 } },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tLight;
        uniform sampler2D tAO;
        uniform float uNorm;
        varying vec2 vUv;
        void main() {
          float ao = uNorm > 0.0 ? clamp(texture2D(tAO, vUv).r / uNorm, 0.0, 1.0) : 1.0;
          gl_FragColor = vec4(texture2D(tLight, vUv).rgb, ao);
        }
      `,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    }),
  );

  const blur = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uStep: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    }),
  );

  const scratch = views.map((v) => target(v.size[0], v.size[1]));
  const aoAcc = views.map((v) => target(v.size[0], v.size[1]));
  const lightRT = views.map((v) => target(v.size[0], v.size[1]));
  const finals = views.map((v) => target(v.size[0], v.size[1]));
  const dummy = target(1, 1);

  /* Visibility modes. Groups always stay visible; drawables and lights are
     switched individually, so the hierarchy never hides what we need. */
  const show = (drawables, lights) => {
    scene.traverse((o) => {
      if (o.isLight) o.visible = lights.has(o);
      else if (o.isMesh || o.isLine || o.isPoints || o.isSprite) o.visible = drawables.has(o);
      else o.visible = true;
    });
  };
  const everything = new Set([...baked, ...casters]);

  const renderTo = (rt, camera) => {
    gl.setRenderTarget(rt);
    gl.clear(true, true, false);
    gl.render(scene, camera);
  };

  try {
    scene.background = null;
    scene.fog = null;
    scene.environment = null;
    gl.setClearColor(0x000000, 0);
    gl.autoClear = false;
    gl.shadowMap.autoUpdate = false;
    baked.forEach((o) => {
      o.castShadow = false;
    });

    /* ---- ambient occlusion ---------------------------------------------- */
    scene.overrideMaterial = aoMat;
    const norms = views.map(() => 0);
    aoAcc.forEach((rt) => {
      gl.setRenderTarget(rt);
      gl.clear(true, true, false);
    });

    skyDirections(AO_SAMPLES).forEach((dir) => {
      aoSun.position.copy(CENTER).addScaledVector(dir, 30);
      aoSun.updateMatrixWorld();
      aoSun.target.updateMatrixWorld();

      /* 1. shadow map with the gear on the floor casting */
      show(shadowed, new Set([aoSun]));
      gl.shadowMap.needsUpdate = true;
      renderTo(dummy, views[0].cam);

      /* 2. each plane sees only the architecture, receiving that shadow */
      show(baked, new Set([aoSun]));
      views.forEach((v, i) => {
        if (v.noAO) return;
        const w = Math.max(0, v.normal.dot(dir));
        if (w <= 0) return;
        norms[i] += w;
        renderTo(scratch[i], v.cam);
        accumulate.material.uniforms.tSrc.value = scratch[i].texture;
        gl.setRenderTarget(aoAcc[i]);
        accumulate.render(gl);
      });
    });

    /* ---- soften the occlusion ------------------------------------------- */
    /* 48 hard shadows still leave faint stripes; a ~8 cm blur in texture
       space turns them into the continuous falloff real occlusion has. */
    views.forEach((v, i) => {
      if (v.noAO) return;
      const [w, h] = v.size;
      blur.material.uniforms.tSrc.value = aoAcc[i].texture;
      blur.material.uniforms.uStep.value.set(1.6 / w, 0);
      gl.setRenderTarget(scratch[i]);
      blur.render(gl);
      blur.material.uniforms.tSrc.value = scratch[i].texture;
      blur.material.uniforms.uStep.value.set(0, 1.6 / h);
      gl.setRenderTarget(aoAcc[i]);
      blur.render(gl);
    });

    /* ---- direct light: fixtures ------------------------------------------ */
    scene.overrideMaterial = lightMat;
    const rigLights = new Set(rig.filter((o) => o.isLight));
    show(baked, rigLights);
    views.forEach((v, i) => renderTo(lightRT[i], v.cam));

    /* ---- direct light: the key, as an area source ------------------------ */
    scene.overrideMaterial = aoMat;
    aoSun.color.set('#fff4e8');
    aoSun.intensity = KEY_POWER / KEY_SAMPLES;
    aoSun.shadow.mapSize.set(2048, 2048);
    aoSun.shadow.map?.dispose();
    aoSun.shadow.map = null;
    keyDirections(KEY_SAMPLES).forEach((dir) => {
      aoSun.position.copy(CENTER).addScaledVector(dir, 30);
      aoSun.updateMatrixWorld();
      show(everything, new Set([aoSun]));
      gl.shadowMap.needsUpdate = true;
      renderTo(dummy, views[0].cam);
      show(baked, new Set([aoSun]));
      views.forEach((v, i) => {
        renderTo(scratch[i], v.cam);
        accumulate.material.uniforms.tSrc.value = scratch[i].texture;
        gl.setRenderTarget(lightRT[i]);
        accumulate.render(gl);
      });
    });

    /* ---- pack ------------------------------------------------------------ */
    scene.overrideMaterial = null;
    views.forEach((v, i) => {
      combine.material.uniforms.tLight.value = lightRT[i].texture;
      combine.material.uniforms.tAO.value = aoAcc[i].texture;
      combine.material.uniforms.uNorm.value = v.noAO ? 0 : norms[i];
      gl.setRenderTarget(finals[i]);
      combine.render(gl);
    });
  } finally {
    /* ---- restore --------------------------------------------------------- */
    bakeObjects.forEach((o) => scene.remove(o));
    scene.traverse((o) => {
      if (saved.visible.has(o)) o.visible = saved.visible.get(o);
    });
    saved.cast.forEach((v, o) => {
      o.castShadow = v;
    });
    scene.overrideMaterial = saved.override;
    scene.background = saved.background;
    scene.fog = saved.fog;
    scene.environment = saved.environment;
    gl.setRenderTarget(saved.target);
    gl.setClearColor(saved.clearColor, saved.clearAlpha);
    gl.autoClear = saved.autoClear;
    gl.shadowMap.autoUpdate = saved.shadowAuto;
    gl.shadowMap.needsUpdate = true;

    [...scratch, ...aoAcc, ...lightRT, dummy].forEach((rt) => rt.dispose());
    aoMat.dispose();
    lightMat.dispose();
    accumulate.dispose();
    accumulate.material.dispose();
    combine.dispose();
    combine.material.dispose();
    blur.dispose();
    blur.material.dispose();
    rig.forEach((o) => {
      if (o.shadow && o.shadow.map) o.shadow.map.dispose();
      if (o.dispose) o.dispose();
    });
    if (aoSun.shadow.map) aoSun.shadow.map.dispose();
    aoSun.dispose();
  }

  return {
    textures: finals.map((rt) => rt.texture),
    matrices: views.map((v) => v.vp),
    dispose: () => finals.forEach((rt) => rt.dispose()),
  };
}
