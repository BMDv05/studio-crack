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
import { makeLedTexture, makeRadialTexture, makeShadowTexture, makeSoftShadowTexture } from './textures.js';
import { loadSurfaces } from './studioSurfaces.js';

/* World-space surface detail.

   Every studio mesh is a scaled unit primitive, so UV-mapped textures would
   stretch differently on every wall, leg and panel. Instead the real-world
   wear of each surface (troweled concrete, rolled paint, brushed metal, felt)
   is resolved procedurally from the world position: a cheap value-noise fbm
   modulates albedo and roughness, and its screen-space gradient perturbs the
   normal. Nothing here depends on UVs, and the result is identical at every
   scroll position because it only reads world space. */
const DETAIL_GLSL = /* glsl */ `
  float sdHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float sdNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(sdHash(i), sdHash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(sdHash(i + vec3(0.0, 1.0, 0.0)), sdHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(sdHash(i + vec3(0.0, 0.0, 1.0)), sdHash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(sdHash(i + vec3(0.0, 1.0, 1.0)), sdHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }
  float sdFbm(vec3 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 2; i++) {
      s += a * sdNoise(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return s;
  }
  vec3 sdPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
    vec3 sx = normalize(dFdx(surfPos));
    vec3 sy = normalize(dFdy(surfPos));
    vec3 r1 = cross(sy, surfNorm);
    vec3 r2 = cross(surfNorm, sx);
    float det = dot(sx, r1) * faceDir;
    vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
    return normalize(abs(det) * surfNorm - grad);
  }
`;

/* Baked lighting for the static architecture.

   The floor, walls, backdrop and ceiling never move, and neither do the
   lights. studioBake.js renders, once, how much light reaches each of those
   surfaces (every softbox, LED panel, rig spot and the key with its shadows)
   plus a soft ambient-occlusion term, into five world-space textures — one per
   room plane. Here those surfaces read that texture instead of looping over
   the lights: no per-pixel light loops, no shadow lookups, on the surfaces
   that fill most of the frame. Image-based reflections stay live, so the
   satin floor still reflects the softboxes as the camera moves. */
const BAKE_GLSL = /* glsl */ `
  uniform sampler2D uBake0; // floor
  uniform sampler2D uBake1; // back
  uniform sampler2D uBake2; // left wall
  uniform sampler2D uBake3; // right wall
  uniform sampler2D uBake4; // ceiling
  uniform mat4 uBakeVP0;
  uniform mat4 uBakeVP1;
  uniform mat4 uBakeVP2;
  uniform mat4 uBakeVP3;
  uniform mat4 uBakeVP4;
  uniform float uBakeGain;

  vec2 sbUv(mat4 vp, vec3 p) {
    return (vp * vec4(p, 1.0)).xy * 0.5 + 0.5;
  }

  /* rgb: irradiance / PI from every baked light. a: ambient occlusion. */
  vec4 studioBake(vec3 p, vec3 n) {
    vec3 a = abs(n);
    float corner;
    vec4 s;
    if (a.y >= a.x && a.y >= a.z && n.y > 0.0 && p.y < 0.25) {
      s = texture2D(uBake0, sbUv(uBakeVP0, p));
      corner = min(5.0 - abs(p.x), p.z + 7.2);
    } else if (a.y >= a.x && a.y >= a.z && n.y < 0.0 && p.y > 3.9) {
      s = texture2D(uBake4, sbUv(uBakeVP4, p));
      corner = min(5.0 - abs(p.x), p.z + 7.2);
    } else if (p.z < -6.0 && a.z >= a.x) {
      s = texture2D(uBake1, sbUv(uBakeVP1, p));
      corner = min(min(5.0 - abs(p.x), p.y), 4.2 - p.y);
    } else if (p.x < 0.0) {
      s = texture2D(uBake2, sbUv(uBakeVP2, p));
      corner = min(min(p.y, 4.2 - p.y), p.z + 7.2);
    } else {
      s = texture2D(uBake3, sbUv(uBakeVP3, p));
      corner = min(min(p.y, 4.2 - p.y), p.z + 7.2);
    }
    /* Where two planes of the room meet, less of the room's light reaches
       in: the soft darkening every real corner has. */
    s.a *= mix(0.42, 1.0, smoothstep(0.0, 1.2, corner));
    return s;
  }
`;

/* Photo-scanned surface (see studioSurfaces.js).

   The shell is built from axis-aligned boxes, so each fragment is projected
   onto the plane its normal faces, in metres: the scan keeps its true size on
   every wall, whatever the box's scale. The scan is applied as *variation*
   around the material's own colour and roughness, so the palette is
   unchanged. On the floor a second, rotated and rescaled sample is blended in
   by a slow noise, which hides the 2 m repeat across a 10 x 18 m slab. */
const SCAN_GLSL = /* glsl */ `
  uniform sampler2D uScanColor;
  uniform sampler2D uScanNormal;
  uniform vec4 uScan;      // x: 1/tile size, y: colour, z: roughness, w: normal strength
  uniform vec2 uScanMean;  // mean albedo luminance (sRGB), mean roughness
  uniform float uScanReady;

  /* Planar coordinates + tangent frame for the axis the normal faces. */
  void scanFrame(vec3 p, vec3 n, out vec2 uv, out vec3 t, out vec3 b) {
    vec3 a = abs(n);
    if (a.y >= a.x && a.y >= a.z) {
      uv = p.xz; t = vec3(1.0, 0.0, 0.0); b = vec3(0.0, 0.0, -sign(n.y));
    } else if (a.x >= a.z) {
      uv = vec2(-p.z * sign(n.x), p.y); t = vec3(0.0, 0.0, -sign(n.x)); b = vec3(0.0, 1.0, 0.0);
    } else {
      uv = vec2(p.x * sign(n.z), p.y); t = vec3(sign(n.z), 0.0, 0.0); b = vec3(0.0, 1.0, 0.0);
    }
  }
`;

const NO_DETAIL = { scale: 1, color: 0, rough: 0, bump: 0, fine: 1, stretch: [1, 1, 1] };

function addReveal(material, uniforms, reveal, edgeColor, detail = NO_DETAIL, baked = false, scan = null) {
  const d = { ...NO_DETAIL, ...detail };
  const hasDetail = d.color > 0 || d.rough > 0 || d.bump > 0;

  material.defines = reveal === 'floor' ? { STUDIO_FLOOR: 1 } : {};
  if (hasDetail) material.defines.STUDIO_DETAIL = 1;
  if (baked) material.defines.STUDIO_BAKED = 1;
  if (scan) material.defines.STUDIO_SCAN = 1;
  if (scan?.mix) material.defines.STUDIO_SCAN_MIX = 1;
  material.userData.studioBaked = baked;
  material.customProgramCacheKey = () =>
    `studio-${reveal}-${hasDetail ? 'd' : 'n'}-${baked ? 'b' : 'l'}-${scan ? (scan.mix ? 'sm' : 's') : 'x'}`;

  material.onBeforeCompile = (shader) => {
    if (baked) {
      for (let i = 0; i < 5; i += 1) {
        shader.uniforms[`uBake${i}`] = uniforms.bakeTex[i];
        shader.uniforms[`uBakeVP${i}`] = uniforms.bakeVP[i];
      }
      shader.uniforms.uBakeGain = uniforms.bakeGain;
    }
    if (scan) {
      const surf = scan.surface;
      shader.uniforms.uScanColor = { value: surf.color };
      shader.uniforms.uScanNormal = { value: surf.normal };
      shader.uniforms.uScan = { value: new THREE.Vector4(1 / (scan.size ?? surf.size), scan.color, scan.rough, scan.normal) };
      shader.uniforms.uScanMean = { value: new THREE.Vector2(surf.albedo, surf.rough) };
      shader.uniforms.uScanReady = surf.ready;
    }
    shader.uniforms.uRise = uniforms.rise;
    shader.uniforms.uFloor = uniforms.floorReveal;
    shader.uniforms.uEdge = uniforms.edge;
    shader.uniforms.uEdgeColor = { value: new THREE.Color(edgeColor) };
    shader.uniforms.uDetail = { value: new THREE.Vector4(d.scale, d.color, d.rough, d.bump) };
    shader.uniforms.uDetailFine = { value: d.fine };
    shader.uniforms.uDetailStretch = { value: new THREE.Vector3(...d.stretch) };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStudioPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStudioPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vStudioPos;
        uniform float uRise;
        uniform float uFloor;
        uniform float uEdge;
        uniform vec3 uEdgeColor;
        uniform vec4 uDetail;
        uniform float uDetailFine;
        uniform vec3 uDetailStretch;
        ${DETAIL_GLSL}
        #ifdef STUDIO_BAKED
        ${BAKE_GLSL}
        #endif
        #ifdef STUDIO_SCAN
        ${SCAN_GLSL}
        #endif`,
      )
      .replace(
        '#include <lights_fragment_begin>',
        `#ifdef STUDIO_BAKED
          /* Every light is already in the bake: compile the per-light loops
             out of this program entirely. */
          #undef RE_Direct
          #undef RE_Direct_RectArea
        #endif
        #include <lights_fragment_begin>`,
      )
      .replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
        #ifdef STUDIO_BAKED
          vec4 sbS = studioBake(vStudioPos, normalize((vec4(vNormal, 0.0) * viewMatrix).xyz));
          float sbAO = pow(clamp(sbS.a, 0.0, 1.0), 1.5);
          /* Large sources are partly blocked by nearby gear too: let the
             occlusion soften the baked direct light, not erase it. */
          /* Replaces the live ambient/hemisphere term: the bake already holds
             all the light that reaches this surface. */
          irradiance = sbS.rgb * PI * uBakeGain * mix(1.0, sbAO, 0.6);
          iblIrradiance *= sbAO;
          radiance *= mix(1.0, sbAO, 0.75);
        #endif`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        #ifdef STUDIO_DETAIL
          vec3 sdP = vStudioPos * uDetailStretch * uDetail.x;
          float sdBroad = sdFbm(sdP);
          float sdFine = sdNoise(sdP * 9.0 * uDetailFine);
          diffuseColor.rgb *= 1.0 + (sdBroad - 0.5) * uDetail.y + (sdFine - 0.5) * uDetail.y * 0.35;
        #endif
        #ifdef STUDIO_SCAN
          vec3 scWN = normalize((vec4(vNormal, 0.0) * viewMatrix).xyz);
          vec2 scUV; vec3 scT; vec3 scB;
          scanFrame(vStudioPos, scWN, scUV, scT, scB);
          scUV *= uScan.x;
          vec3 scC = texture2D(uScanColor, scUV).rgb;
          vec3 scN = texture2D(uScanNormal, scUV).rgb;
          #ifdef STUDIO_SCAN_MIX
            vec2 scUV2 = mat2(0.8, -0.6, 0.6, 0.8) * scUV * 0.61 + vec2(0.37, 0.71);
            float scMixW = smoothstep(0.3, 0.7, sdNoise(vec3(vStudioPos.xz * 0.45, 3.1)));
            scC = mix(scC, texture2D(uScanColor, scUV2).rgb, scMixW);
            scN = mix(scN, texture2D(uScanNormal, scUV2).rgb, scMixW);
          #endif
          /* luminance relative to the scan's mean, in linear light */
          float scLum = pow(max(scC.r, 0.004), 2.2) / pow(uScanMean.x, 2.2);
          diffuseColor.rgb *= mix(1.0, clamp(scLum, 0.25, 2.2), uScan.y * uScanReady);
        #endif`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        #ifdef STUDIO_DETAIL
          roughnessFactor = clamp(roughnessFactor + (sdBroad - 0.5) * uDetail.z + (sdFine - 0.5) * uDetail.z * 0.4, 0.04, 1.0);
        #endif
        #ifdef STUDIO_SCAN
          roughnessFactor = clamp(roughnessFactor + (scC.g - uScanMean.y) * uScan.z * uScanReady, 0.04, 1.0);
        #endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        #ifdef STUDIO_DETAIL
          if (uDetail.w > 0.0) {
            float sdH = sdBroad * 0.35 + sdFine;
            vec2 sdD = vec2(dFdx(sdH), dFdy(sdH)) * uDetail.w;
            normal = sdPerturb(-vViewPosition, normal, sdD, faceDirection);
          }
        #endif
        #ifdef STUDIO_SCAN
          {
            vec3 scTs = scN * 2.0 - 1.0;
            scTs.xy *= uScan.w * uScanReady;
            vec3 scWorldN = normalize(scT * scTs.x + scB * scTs.y + scWN * max(scTs.z, 0.05));
            normal = normalize((viewMatrix * vec4(scWorldN, 0.0)).xyz);
          }
        #endif`,
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
    emissiveMap = null,
    side = THREE.FrontSide,
    reveal = 'rise',
    edge = '#8ff8ec',
    detail,
    baked = false,
    scan = null,
  } = options;

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
    envMapIntensity,
    map,
    emissiveMap,
    side,
  });

  return addReveal(material, uniforms, reveal, edge, detail, baked, scan);
}

/* Surface recipes (world-space metres). */
const FELT = { scale: 2.4, color: 0.16, rough: 0.06, bump: 0, fine: 1.6 };
const MUSLIN = { scale: 0.9, color: 0.14, rough: 0.05, bump: 0, fine: 2.6 };
/* Brushed tubes: the grain runs along the stands, so stretch the noise. */
const BRUSHED = { scale: 6, color: 0.07, rough: 0.22, bump: 0, fine: 1.6, stretch: [1, 0.08, 1] };
const ANODISED = { scale: 9, color: 0.06, rough: 0.18, bump: 0, fine: 1.2 };
/* Camera bodies are seen from centimetres in the finale: keep their texture a
   fine, even tooth with no broad blotches. */
const PLASTIC = { scale: 40, color: 0.03, rough: 0.05, bump: 0, fine: 0.6 };

export function createStudioMaterials(uniforms) {
  const scans = loadSurfaces();
  const S = scans.surfaces;
  /* How strongly each real material shows through (colour, roughness, normal). */
  const CONCRETE_SCAN = { surface: S.concrete, color: 0.42, rough: 0.7, normal: 0.5, mix: true };
  const PLASTER_SCAN = { surface: S.plaster, color: 0.3, rough: 0.35, normal: 0.55 };
  const LINEN_SCAN = { surface: S.linen, size: 0.45, color: 0.35, rough: 0.2, normal: 0.8 };
  const FLEECE_SCAN = { surface: S.fleece, size: 0.35, color: 0.55, rough: 0.2, normal: 0.9 };
  const radial = makeRadialTexture();
  const shadowTexture = makeShadowTexture();
  const softShadowTexture = makeSoftShadowTexture();
  const ledTexture = makeLedTexture();

  const mats = {
    /* Surfaces that roll in from the back of the room. */
    /* Sealed, polished concrete: warm grey, close to a mirror at grazing angles,
       with roughness that varies across the slab so reflections break up. */
    floor: solid(uniforms, {
      color: '#7f786d',
      roughness: 0.24,
      metalness: 0,
      envMapIntensity: 1.3,
      reveal: 'floor',
      edge: '#9df7ec',
      baked: true,
      scan: CONCRETE_SCAN,
    }),
    /* The backdrop paper where it runs out across the floor. */
    mat: solid(uniforms, {
      color: '#303134',
      roughness: 0.9,
      metalness: 0,
      reveal: 'floor',
      edge: '#77e9dd',
      baked: true,
      scan: LINEN_SCAN,
    }),

    /* Architecture: matte emulsion on plaster, never metallic. */
    wall: solid(uniforms, { color: '#1c5c35', roughness: 0.92, metalness: 0, envMapIntensity: 0.7, scan: { ...FLEECE_SCAN, size: 0.6, color: 0.3, normal: 0.6 }, baked: true }),
    wallDark: solid(uniforms, { color: '#123222', roughness: 0.88, metalness: 0, envMapIntensity: 0.65, scan: PLASTER_SCAN, baked: true }),
    panel: solid(uniforms, { color: '#151716', roughness: 0.97, metalness: 0, envMapIntensity: 0.5, scan: FLEECE_SCAN, baked: true }),
    white: solid(uniforms, { color: '#e0d7c6', roughness: 0.9, metalness: 0, scan: PLASTER_SCAN, baked: true }),
    paper: solid(uniforms, { color: '#ebe2d0', roughness: 0.94, metalness: 0, scan: { ...LINEN_SCAN, color: 0.12, normal: 0.35 }, baked: true }),
    backdrop: solid(uniforms, { color: '#303134', roughness: 0.96, metalness: 0, edge: '#bdf7ee', scan: LINEN_SCAN, baked: true }),
    black: solid(uniforms, { color: '#0f1111', roughness: 0.95, metalness: 0, envMapIntensity: 0.6, scan: FLEECE_SCAN, baked: true }),
    /* White markings on the cameras (lens scales, dial marks). */
    whiteGear: solid(uniforms, { color: '#d9d7d1', roughness: 0.55, metalness: 0, detail: PLASTIC }),
    /* Black gear (flags, cases): lit live, not baked. */
    blackGear: solid(uniforms, { color: '#0f1111', roughness: 0.9, metalness: 0, envMapIntensity: 0.7, detail: PLASTIC }),
    ceiling: solid(uniforms, { color: '#0b0c0c', roughness: 0.97, metalness: 0, scan: PLASTER_SCAN, baked: true }),

    /* Rig + stands: black powder-coat and brushed aluminium. */
    metal: solid(uniforms, { color: '#1a1c1d', roughness: 0.46, metalness: 0.55, envMapIntensity: 1.1, detail: ANODISED }),
    metalSilver: solid(uniforms, { color: '#b4b9b8', roughness: 0.3, metalness: 1, envMapIntensity: 1.2, detail: BRUSHED }),
    gold: solid(uniforms, { color: '#b08a4a', roughness: 0.32, metalness: 1, envMapIntensity: 1.1, detail: ANODISED }),

    /* Cameras + glass. */
    /* Camera bodies: black satin magnesium/polycarbonate. Dielectric (no
       metalness) so the shell stays black and only picks up soft highlights. */
    camera: solid(uniforms, { color: '#08090a', roughness: 0.8, metalness: 0, envMapIntensity: 0.75, detail: PLASTIC }),
    /* Camera trim (grip, handle, EVF, matte box, battery): matte black. */
    cameraTrim: solid(uniforms, { color: '#0a0b0b', roughness: 0.9, metalness: 0, envMapIntensity: 0.6, detail: PLASTIC }),
    /* Light housings keep their charcoal finish. */
    cameraSoft: solid(uniforms, { color: '#202325', roughness: 0.78, metalness: 0, detail: PLASTIC }),
    /* Double-sided: the lens hood is an open tube, and its inner wall must
       show when the camera is seen from the side (it read as a cut shell). */
    lens: solid(uniforms, { color: '#0b0c0d', roughness: 0.3, metalness: 0.6, envMapIntensity: 1.1, side: THREE.DoubleSide, detail: ANODISED }),
    /* Coated lens glass: near-black, mirror-smooth, showing the studio's
       reflections with only a faint teal coating tint (not a flat glow). */
    glass: solid(uniforms, {
      color: '#05090b',
      roughness: 0.04,
      metalness: 0.6,
      envMapIntensity: 1.6,
      emissive: '#12353c',
      emissiveIntensity: 0.18,
    }),

    /* Light modifiers. */
    fabric: solid(uniforms, { color: '#0a0b0b', roughness: 0.62, metalness: 0, envMapIntensity: 0.7, side: THREE.DoubleSide, detail: FELT }),
    /* The lit faces read hotter than paper white so the bloom picks them
       up, exactly as an overexposed softbox does on a real sensor. */
    diffusion: solid(uniforms, {
      color: '#fff8eb',
      roughness: 0.85,
      metalness: 0,
      emissive: '#fff2db',
      emissiveIntensity: 2.6,
      side: THREE.DoubleSide,
      detail: { ...MUSLIN, color: 0.05, scale: 3 },
    }),
    led: solid(uniforms, {
      color: '#fff8ea',
      roughness: 0.7,
      metalness: 0,
      emissive: '#ffb76e',
      emissiveIntensity: 1.25,
      emissiveMap: ledTexture,
      side: THREE.DoubleSide,
    }),
    lamp: solid(uniforms, {
      color: '#241f18',
      roughness: 0.6,
      metalness: 0.3,
      emissive: '#ffcf8f',
      emissiveIntensity: 11,
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
    tableTop: solid(uniforms, { color: '#191b1a', roughness: 0.48, metalness: 0, detail: PLASTIC }),
    sandbag: solid(uniforms, { color: '#22221c', roughness: 0.98, metalness: 0, detail: { ...FELT, scale: 7, color: 0.3 } }),
    rubber: solid(uniforms, { color: '#0b0c0c', roughness: 0.7, metalness: 0, detail: PLASTIC }),
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
    contactShadow: new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
    contactShadowSoft: new THREE.MeshBasicMaterial({
      map: softShadowTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  };

  const textures = [radial, shadowTexture, softShadowTexture, ledTexture];

  const dispose = () => {
    Object.values(mats).forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    scans.dispose();
  };

  return { mats, dispose, ready: scans.ready };
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
