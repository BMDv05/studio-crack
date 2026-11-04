/* Studio materials — one place where the look of the build lives.

   Two systems share this file:

   1. The blueprint lines: a single additive ShaderMaterial. Each line segment
      carries the progress at which it starts drawing, so scrolling is the pen.
      The geometry is built from the same meshes as the solid studio, so the
      wireframe and the materialised studio occupy exactly the same space.

   2. The solid studio: MeshStandardMaterials with a small onBeforeCompile
      injection that discards everything above a world-space height (or past a
      world-space Z for the floor). Scrolling lifts that threshold, so surfaces
      develop from the ground up and the floor rolls in from the backdrop toward
      the viewer. The same materials then stay put for the rest of the scene —
      no second, unrelated set of objects appears at the end.

   Both systems are driven by the shared uniform objects created in StudioScene,
   which are written once per rendered frame from scroll progress. */

import * as THREE from 'three';
import { makeCanvasTexture, makeGrainTexture, makeRadialTexture } from './textures.js';

function addReveal(material, uniforms, reveal, edgeColor) {
  material.defines = reveal === 'floor' ? { STUDIO_FLOOR: 1 } : {};
  material.customProgramCacheKey = () => `studio-${reveal}`;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRise = uniforms.rise;
    shader.uniforms.uFloor = uniforms.floorReveal;
    shader.uniforms.uEdge = uniforms.edge;
    shader.uniforms.uEdgeColor = { value: new THREE.Color(edgeColor) };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStudioPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStudioPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vStudioPos;\nuniform float uRise;\nuniform float uFloor;\nuniform float uEdge;\nuniform vec3 uEdgeColor;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        #ifdef STUDIO_FLOOR
          float studioCut = mix(-7.9, 11.4, uFloor);
          if (vStudioPos.z > studioCut) discard;
        #else
          if (vStudioPos.y > uRise) discard;
        #endif`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #ifdef STUDIO_FLOOR
          totalEmissiveRadiance += uEdgeColor * uEdge * smoothstep(studioCut - 0.18, studioCut - 0.02, vStudioPos.z);
        #else
          totalEmissiveRadiance += uEdgeColor * uEdge * smoothstep(uRise - 0.14, uRise - 0.015, vStudioPos.y);
        #endif`,
      );
  };

  return material;
}

function solid(uniforms, options) {
  const {
    color = '#888888',
    roughness = 0.8,
    metalness = 0,
    emissive = '#000000',
    emissiveIntensity = 0,
    envMapIntensity = 1,
    map = null,
    side = THREE.FrontSide,
    reveal = 'rise',
    edge = '#8ff8ec',
  } = options;

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
    envMapIntensity,
    map,
    side,
  });

  return addReveal(material, uniforms, reveal, edge);
}

export function createStudioMaterials(uniforms) {
  const floorGrain = makeGrainTexture({ base: 244, variance: 16, repeat: [6, 10], seed: 5 });
  const paperGrain = makeGrainTexture({ base: 248, variance: 9, repeat: [2, 3], seed: 19 });
  const canvasMap = makeCanvasTexture();
  const radial = makeRadialTexture();

  const mats = {
    /* Surfaces that roll in from the back of the room. */
    floor: solid(uniforms, {
      color: '#b8b7ae',
      roughness: 0.22,
      metalness: 0.2,
      envMapIntensity: 1.6,
      map: floorGrain,
      reveal: 'floor',
      edge: '#9df7ec',
    }),
    mat: solid(uniforms, {
      color: '#2c2a26',
      roughness: 0.86,
      metalness: 0.02,
      map: floorGrain,
      reveal: 'floor',
      edge: '#77e9dd',
    }),

    /* Architecture. */
    wall: solid(uniforms, { color: '#183428', roughness: 0.68, metalness: 0.04, envMapIntensity: 0.85 }),
    wallDark: solid(uniforms, { color: '#13281f', roughness: 0.72, metalness: 0.04, envMapIntensity: 0.75 }),
    panel: solid(uniforms, { color: '#131514', roughness: 0.85, metalness: 0.02 }),
    white: solid(uniforms, { color: '#cdccc3', roughness: 0.88, metalness: 0.01 }),
    paper: solid(uniforms, { color: '#e4e1d6', roughness: 0.92, metalness: 0.01, map: paperGrain }),
    backdrop: solid(uniforms, { color: '#727674', roughness: 0.92, metalness: 0, map: canvasMap, edge: '#bdf7ee' }),
    black: solid(uniforms, { color: '#0e1010', roughness: 0.92, metalness: 0.02 }),
    ceiling: solid(uniforms, { color: '#080a09', roughness: 0.96, metalness: 0 }),

    /* Rig + stands. */
    metal: solid(uniforms, { color: '#131516', roughness: 0.3, metalness: 0.88, envMapIntensity: 1.4 }),
    metalSilver: solid(uniforms, { color: '#a0a8a6', roughness: 0.22, metalness: 0.95, envMapIntensity: 1.5 }),
    gold: solid(uniforms, { color: '#96743c', roughness: 0.34, metalness: 0.92, envMapIntensity: 1.3 }),

    /* Cameras + glass. */
    camera: solid(uniforms, { color: '#151719', roughness: 0.5, metalness: 0.38, envMapIntensity: 1 }),
    cameraSoft: solid(uniforms, { color: '#212426', roughness: 0.72, metalness: 0.12 }),
    lens: solid(uniforms, { color: '#090a0b', roughness: 0.24, metalness: 0.68, envMapIntensity: 1.2 }),
    glass: solid(uniforms, {
      color: '#0a1418',
      roughness: 0.06,
      metalness: 0.25,
      emissive: '#12353c',
      emissiveIntensity: 0.55,
    }),

    /* Light modifiers. */
    fabric: solid(uniforms, { color: '#141615', roughness: 0.96, metalness: 0, side: THREE.DoubleSide }),
    diffusion: solid(uniforms, {
      color: '#fff8eb',
      roughness: 0.85,
      metalness: 0,
      emissive: '#fff2db',
      emissiveIntensity: 1.1,
      side: THREE.DoubleSide,
    }),
    led: solid(uniforms, {
      color: '#fff8ea',
      roughness: 0.7,
      metalness: 0,
      emissive: '#fff1d5',
      emissiveIntensity: 2.4,
      side: THREE.DoubleSide,
    }),
    lamp: solid(uniforms, {
      color: '#241f18',
      roughness: 0.6,
      metalness: 0.3,
      emissive: '#ffd9a0',
      emissiveIntensity: 0.7,
    }),
    screen: solid(uniforms, {
      color: '#090f12',
      roughness: 0.3,
      metalness: 0.2,
      emissive: '#18343d',
      emissiveIntensity: 0.6,
    }),
    record: solid(uniforms, {
      color: '#3a0c09',
      roughness: 0.4,
      emissive: '#ff453a',
      emissiveIntensity: 1.4,
    }),

    /* Set dressing. */
    tableTop: solid(uniforms, { color: '#171918', roughness: 0.52, metalness: 0.2 }),
    sandbag: solid(uniforms, { color: '#1d1d18', roughness: 0.98, metalness: 0 }),
    rubber: solid(uniforms, { color: '#080909', roughness: 0.62, metalness: 0.05 }),
    bottle: solid(uniforms, { color: '#c9d2cc', roughness: 0.18, metalness: 0.05, side: THREE.DoubleSide }),

    /* Additive pools of light on the floor (opacity written per frame). */
    glowWarm: new THREE.MeshBasicMaterial({
      map: radial,
      color: '#ffe2bd',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
    glowCool: new THREE.MeshBasicMaterial({
      map: radial,
      color: '#bfe9e2',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  };

  const textures = [floorGrain, paperGrain, canvasMap, radial];

  const dispose = () => {
    Object.values(mats).forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };

  return { mats, dispose };
}

export function createLineMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uProgress: shared.build,
      uFade: shared.lineFade,
      uOpacity: shared.lineOpacity,
      uCyan: { value: new THREE.Color('#4ff3e2') },
      uWhite: { value: new THREE.Color('#e6fff9') },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aOther;
      attribute float aTip;
      attribute float aSeed;
      attribute float aDur;
      attribute float aTint;

      uniform float uProgress;

      varying float vTint;
      varying float vAlpha;

      void main() {
        float t = clamp((uProgress - aSeed) / max(aDur, 0.0001), 0.0, 1.0);

        vec3 p = position;
        if (aTip > 0.5) {
          /* the end vertex travels from the start vertex out to its own place */
          p = mix(aOther, position, t);
        }

        vAlpha = t > 0.0 ? 1.0 : 0.0;
        vTint = aTint;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        /* hairline depth bias keeps strokes from z-fighting their own surfaces */
        gl_Position.z -= 0.00035 * gl_Position.w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uCyan;
      uniform vec3 uWhite;
      uniform float uFade;
      uniform float uOpacity;

      varying float vTint;
      varying float vAlpha;

      void main() {
        vec3 col = mix(uCyan, uWhite, smoothstep(0.52, 1.0, vTint));
        float boost = 0.78 + 0.5 * smoothstep(0.85, 1.0, vTint);
        float alpha = vAlpha * uFade * uOpacity;
        if (alpha <= 0.001) discard;
        gl_FragColor = vec4(col * boost, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function createGridMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: shared.gridOpacity,
      uLine: { value: new THREE.Color('#62f0e2') },
      uMinor: { value: new THREE.Color('#1f8d86') },
      uGlow: { value: new THREE.Color('#0c4c48') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uLine;
      uniform vec3 uMinor;
      uniform vec3 uGlow;

      varying vec3 vWorld;

      float gridMask(vec2 p, float cell, float weight) {
        vec2 q = p / cell;
        vec2 d = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(0.0001));
        float line = 1.0 - min(min(d.x, d.y), 1.0);
        return line * weight;
      }

      void main() {
        vec2 p = vWorld.xz;
        float minor = gridMask(p, 0.5, 0.18);
        float major = gridMask(p, 2.5, 0.5);

        float dist = length(p - vec2(0.0, -1.5));
        float reach = 1.0 - smoothstep(9.0, 30.0, dist);
        float glow = exp(-dist * 0.085) * 0.11;

        vec3 col = mix(uMinor, uLine, major);
        col += uGlow * glow * 6.0;

        float alpha = (minor + major + glow) * reach * uOpacity;
        if (alpha <= 0.001) discard;
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}
