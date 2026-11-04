/* Procedural textures for the studio — generated in the browser, no assets.
   All are small canvases: grain for the floor/paper, mottled canvas for the
   photographic backdrop, a soft radial for the light pools on the floor. */

import * as THREE from 'three';

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function makeGrainTexture({ base = 236, variance = 16, size = 128, repeat = [5, 9], seed = 11 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rnd = makeRng(seed);
  for (let i = 0; i < size * size; i += 1) {
    const v = Math.max(0, Math.min(255, base + (rnd() - 0.5) * variance));
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 4;
  return tex;
}

/* Cloudy, hand-painted canvas — the grey backdrop in the reference. */
export function makeCanvasTexture({ size = 512, base = [124, 129, 126], repeat = [1, 1], seed = 23 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rnd = makeRng(seed);

  ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  ctx.fillRect(0, 0, size, size);

  /* Broad cloudy patches: lifted and shadowed areas of a painted canvas. */
  for (let i = 0; i < 130; i += 1) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 18 + rnd() * 90;
    const light = rnd() > 0.48;
    const tone = light ? 255 : 0;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${tone},${tone},${tone},${0.018 + rnd() * 0.045})`);
    g.addColorStop(1, `rgba(${tone},${tone},${tone},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /* Fine tooth of the canvas. */
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 9;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 4;
  return tex;
}

/* Soft white pool — multiplied by the light's colour on the floor. */
export function makeRadialTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  g.addColorStop(0.68, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}


/* Soft contact shadow pool for realistic ground ambient occlusion */
export function makeShadowTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(2, 6, 5, 0.88)');
  g.addColorStop(0.22, 'rgba(2, 6, 5, 0.65)');
  g.addColorStop(0.52, 'rgba(2, 6, 5, 0.25)');
  g.addColorStop(0.8, 'rgba(2, 6, 5, 0.06)');
  g.addColorStop(1, 'rgba(2, 6, 5, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* Broad soft ambient shadow pool */
export function makeSoftShadowTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(2, 6, 5, 0.45)');
  g.addColorStop(0.4, 'rgba(2, 6, 5, 0.2)');
  g.addColorStop(0.75, 'rgba(2, 6, 5, 0.05)');
  g.addColorStop(1, 'rgba(2, 6, 5, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
