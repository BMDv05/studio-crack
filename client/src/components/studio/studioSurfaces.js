/* Photo-scanned surfaces for the studio shell.

   Real materials read as real because of what a photo scan captures: the
   trowel marks and pores in a concrete slab, the roller stipple on a painted
   wall, the weave of a fabric. These are CC0 scans from Poly Haven
   (polyhaven.com), packed by scripts in two small WebP files each:

     <name>_color.webp   R = albedo luminance, G = roughness
     <name>_normal.webp  OpenGL tangent-space normal map

   Only the *variation* is used: the shader divides by the scan's mean, so the
   studio keeps its own palette (green walls, pale floor) and the scan adds the
   texture of the real material on top. `size` is the real-world width of one
   tile in metres, from Poly Haven's measurements. */

import * as THREE from 'three';

const BASE = `${import.meta.env.BASE_URL || '/'}textures/studio/`;

export const SURFACES = {
  concrete: { size: 2.0, albedo: 0.2565, rough: 0.6797 }, // smooth_concrete_floor
  plaster: { size: 1.5, albedo: 0.5597, rough: 0.8324 }, // plaster_grey_04
  linen: { size: 0.27, albedo: 0.6558, rough: 0.7183 }, // rough_linen
  fleece: { size: 0.27, albedo: 0.7031, rough: 0.7294 }, // polar_fleece
};

function load(loader, url, onDone) {
  const tex = loader.load(url, onDone, undefined, onDone);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  /* Packed data, not a picture: no sRGB decode (the shader linearises the
     luminance channel itself), mipmapped and anisotropic for the floor seen
     at a grazing angle. */
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* Loads every surface once. Each gets a `ready` uniform that stays 0 until
   both its maps have arrived, so nothing ever samples a missing texture. */
export function loadSurfaces() {
  const loader = new THREE.TextureLoader();
  const surfaces = {};
  const pending = [];

  Object.entries(SURFACES).forEach(([name, spec]) => {
    const ready = { value: 0 };
    let left = 2;
    let resolve;
    pending.push(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const done = () => {
      left -= 1;
      if (left === 0) {
        ready.value = 1;
        resolve();
      }
    };
    surfaces[name] = {
      ...spec,
      color: load(loader, `${BASE}${name}_color.webp`, done),
      normal: load(loader, `${BASE}${name}_normal.webp`, done),
      ready,
    };
  });

  return {
    surfaces,
    ready: Promise.all(pending),
    dispose: () =>
      Object.values(surfaces).forEach((s) => {
        s.color.dispose();
        s.normal.dispose();
      }),
  };
}
