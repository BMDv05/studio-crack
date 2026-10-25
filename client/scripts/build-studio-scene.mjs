/* Studio scene generator — Double H Studio.
 *
 * Authoring tool. Emits src/scenes/studioScene.svg: the photography studio
 * interior (softboxes, camera on a tripod, ceiling tracks, wood-slat wall,
 * window, desk and console) as ONE set of paths that serves both states of the
 * home-page reveal — the architectural line drawing and the finished render.
 *
 * That is the point: the drawing is not traced from a photograph and then
 * re-aligned; it IS the same geometry, so it can never drift. Each path
 * declares the fill it ends up with (data-fill) or the stroke it keeps
 * (data-stroke), and the component draws its outline, then brings the fill in.
 *
 * Geometry is projected from room coordinates, so the perspective is exact:
 *      screen x = 980 + x / z
 *      screen y = 490 + (200 - y) / z
 *   x ∈ [-280, 280]  room centre line is 0
 *   y ∈ [0, 400]     floor is 0, ceiling is 400
 *   z ∈ [0.28, 1]    camera plane ≈ 0.28, back wall = 1
 *
 * Run:  npm run scene      (from client/)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 1600;
const H = 1067;
const CX = 980;   // vanishing point x
const HORIZON = 490;
const EYE = 200;  // camera height, in room units

const r1 = (n) => Math.round(n * 10) / 10;
const P = (x, y, z) => [CX + x / z, HORIZON + (EYE - y) / z];
const px = (p) => `${r1(p[0])} ${r1(p[1])}`;
const d = (...pts) => `M${pts.map(px).join('L')}`;
const dq = (...pts) => `${d(...pts)}Z`;
const rect = (x, y, w, h) => `M${r1(x)} ${r1(y)}H${r1(x + w)}V${r1(y + h)}H${r1(x)}Z`;

/* ------------------------------------------------------------------ layers */

const stages = { 1: [], 2: [], 3: [], 4: [], 5: [] };
const finish = [];
const add = (stage, path, opts = {}) => { stages[stage].push({ path, ...opts }); return path; };
const after = (path, attrs) => { finish.push({ path, attrs }); return path; };

/* Materials */
const M = {
  ceiling: '#f4f3f0',
  backWall: '#f8f7f5',
  leftWall: '#efece7',
  rightWall: '#eae7e2',
  wood: '#c79a68',
  woodDark: '#b3865a',
  floor: '#e9e6e1',
  skirt: '#dedad4',
  glass: '#dbe6ec',
  frame: '#2c2d2f',
  deskTop: '#d8bd93',
  deskEdge: '#c2a67c',
  leg: '#3a3b3d',
  chair: '#232629',
  chairAlt: '#2c3034',
  armchair: '#a95b31',
  armchairDark: '#8e4a26',
  softbox: '#f6f6f4',
  softboxDark: '#1e2023',
  metal: '#313437',
  rug: '#cdbda2',
  rugLine: '#bcab8e',
  paper: '#ffffff',
};

/* ============================================================== 1 · GUIDES
 * The setting-out the drawing is built against. Drafting notation only: it is
 * gone by the time the render is finished.
 */
{
  const horizon = [P(-280, EYE, 1), P(280, EYE, 1)];
  add(1, d(...horizon), { keep: false });
  add(1, d([CX - 46, HORIZON], [CX + 46, HORIZON]), { keep: false });
  add(1, d([CX, HORIZON - 46], [CX, HORIZON + 46]), { keep: false });

  for (const z of [0.4, 0.62, 0.82]) {
    add(1, d(P(-280, 0, z), P(280, 0, z)), { keep: false });
  }
  for (const x of [-140, 0, 140]) {
    add(1, d(P(x, 0, 0.3), P(x, 0, 1)), { keep: false });
  }
  add(1, dq(P(-280, 0, 1), P(280, 0, 1), P(280, 400, 1), P(-280, 400, 1)), { keep: false });
  for (const x of [-280, -140, 0, 140, 280]) {
    add(1, d(P(x, 0, 1), P(x, 400, 1)), { keep: false });
  }
  for (const y of [100, 200, 300]) {
    add(1, d(P(-280, y, 1), P(280, y, 1)), { keep: false });
  }
}

/* =========================================================== 2 · STRUCTURE
 * The shell: floor, ceiling, back wall and the two side walls.
 */
{
  add(2, dq(P(-280, 400, 0.3), P(280, 400, 0.3), P(280, 400, 1), P(-280, 400, 1)), { fill: M.ceiling });
  add(2, dq(P(-280, 0, 0.28), P(280, 0, 0.28), P(280, 0, 1), P(-280, 0, 1)), { fill: 'url(#gFloor)' });
  add(2, dq(P(-280, 0, 0.28), P(-280, 400, 0.28), P(-280, 400, 1), P(-280, 0, 1)), { fill: M.leftWall });
  add(2, dq(P(280, 0, 0.34), P(280, 400, 0.34), P(280, 400, 1), P(280, 0, 1)), { fill: M.rightWall });
  add(2, dq(P(-280, 0, 1), P(280, 0, 1), P(280, 400, 1), P(-280, 400, 1)), { fill: M.backWall });

  /* Skirting, wrapping the room. */
  add(2, dq(P(-280, 0, 1), P(280, 0, 1), P(280, 22, 1), P(-280, 22, 1)), { fill: M.skirt });
  add(2, dq(P(-280, 0, 0.28), P(-280, 0, 1), P(-280, 22, 1), P(-280, 22, 0.28)), { fill: M.skirt });
  add(2, dq(P(280, 0, 1), P(280, 0, 0.34), P(280, 22, 0.34), P(280, 22, 1)), { fill: M.skirt });

  /* Ceiling tracks: two service rails running the depth of the room. */
  for (const x of [-100, 52]) {
    add(2, dq(P(x - 7, 400, 0.36), P(x + 7, 400, 0.36), P(x + 7, 400, 1), P(x - 7, 400, 1)), { fill: M.frame });
  }
}

/* ============================================================ 3 · OPENINGS
 * The window on the right and the timber wall on the left.
 */
{
  /* Timber battens, left wall. */
  add(3, dq(P(-280, 0, 0.28), P(-280, 400, 0.28), P(-280, 400, 0.74), P(-280, 0, 0.74)), { fill: 'url(#gWood)' });

  /* Window: recess, glass, frame. */
  const zA = 0.44;
  const zB = 0.97;
  const yTop = 332;
  const yBot = 78;
  add(3, dq(P(280, yBot - 8, zA), P(280, yTop + 8, zA), P(280, yTop + 8, zB), P(280, yBot - 8, zB)), { fill: '#e3e0da' });
  add(3, dq(P(280, yBot, zA), P(280, yTop, zA), P(280, yTop, zB), P(280, yBot, zB)), { fill: 'url(#gGlass)' });
  /* Frame members, drawn as strips so they read as physical sections. */
  add(3, dq(P(280, yBot - 9, zA - 0.012), P(280, yBot + 3, zA - 0.012), P(280, yBot + 3, zB), P(280, yBot - 9, zB)), { fill: M.frame });
  add(3, dq(P(280, yTop - 3, zA - 0.012), P(280, yTop + 9, zA - 0.012), P(280, yTop + 9, zB), P(280, yTop - 3, zB)), { fill: M.frame });
  add(3, dq(P(280, yBot - 9, zA - 0.012), P(280, yTop + 9, zA - 0.012), P(280, yTop + 9, zA + 0.012), P(280, yBot - 9, zA + 0.012)), { fill: M.frame });
  add(3, dq(P(280, yBot - 9, zB - 0.012), P(280, yTop + 9, zB - 0.012), P(280, yTop + 9, zB + 0.012), P(280, yBot - 9, zB + 0.012)), { fill: M.frame });
  /* Mullions. */
  for (const z of [0.575, 0.71, 0.84]) {
    add(3, dq(P(280, yBot, z - 0.006), P(280, yTop, z - 0.006), P(280, yTop, z + 0.006), P(280, yBot, z + 0.006)), { fill: M.frame });
  }
  for (const y of [142, 205, 270]) {
    add(3, dq(P(280, y - 3, zA), P(280, y + 3, zA), P(280, y + 3, zB), P(280, y - 3, zB)), { fill: M.frame });
  }
}

/* =========================================================== 4 · FURNITURE
 * Everything that stands on the floor, plus the fixtures hung from the ceiling.
 */
{
  /* --- rug ------------------------------------------------------------- */
  const rug = dq(P(-158, 0, 0.33), P(150, 0, 0.33), P(150, 0, 0.56), P(-158, 0, 0.56));
  add(4, rug, { fill: M.rug });

  /* --- desk ------------------------------------------------------------ */
  const dw = 92;         // half width
  const dh = 74;         // height
  const zF = 0.5;        // front (near) edge
  const zB = 0.66;       // back edge
  add(4, dq(P(-dw, dh, zF), P(dw, dh, zF), P(dw, dh, zB), P(-dw, dh, zB)), { fill: M.deskTop });
  add(4, dq(P(-dw, dh - 8, zF), P(dw, dh - 8, zF), P(dw, dh, zF), P(-dw, dh, zF)), { fill: M.deskEdge });
  for (const x of [-dw + 8, dw - 8]) {
    for (const z of [zF + 0.02, zB - 0.02]) {
      add(4, dq(P(x - 4, 0, z), P(x + 4, 0, z), P(x + 4, dh, z), P(x - 4, dh, z)), { fill: M.leg });
    }
  }

  /* --- office chair ---------------------------------------------------- */
  const cz = 0.42;
  add(4, dq(P(-34, 46, cz - 0.055), P(34, 46, cz - 0.055), P(34, 46, cz + 0.055), P(-34, 46, cz + 0.055)), { fill: M.chair });
  add(4, dq(P(-33, 46, cz + 0.05), P(33, 46, cz + 0.05), P(33, 112, cz + 0.02), P(-33, 112, cz + 0.02)), { fill: M.chairAlt });
  add(4, dq(P(-9, 0, cz + 0.06), P(9, 0, cz + 0.06), P(9, 44, cz + 0.06), P(-9, 44, cz + 0.06)), { fill: M.metal });
  for (const a of [-1, 0.2, 1.4]) {
    const x = Math.sin(a) * 40;
    add(4, dq(P(-4, 4, cz - 0.05 + x / 260), P(4, 4, cz - 0.05 + x / 260), P(4, 44, cz + 0.05), P(-4, 44, cz + 0.05)), { fill: M.metal });
  }

  /* --- console / sideboard against the back wall ----------------------- */
  add(4, dq(P(150, 62, 0.84), P(262, 62, 0.84), P(262, 62, 0.99), P(150, 62, 0.99)), { fill: M.woodDark });
  add(4, dq(P(150, 0, 0.84), P(262, 0, 0.84), P(262, 62, 0.84), P(150, 62, 0.84)), { fill: M.woodDark });

  /* --- tub chair by the window ---------------------------------------- */
  add(4, dq(P(176, 40, 0.56), P(244, 40, 0.56), P(244, 40, 0.68), P(176, 40, 0.68)), { fill: M.armchair });
  add(4, dq(P(176, 40, 0.68), P(244, 40, 0.68), P(244, 106, 0.7), P(176, 106, 0.7)), { fill: M.armchairDark });
  add(4, dq(P(176, 40, 0.56), P(176, 40, 0.68), P(176, 78, 0.7), P(176, 78, 0.56)), { fill: M.armchairDark });
  add(4, dq(P(244, 40, 0.68), P(244, 40, 0.56), P(244, 78, 0.56), P(244, 78, 0.7)), { fill: M.armchairDark });

  /* --- pendants ------------------------------------------------------- */
  for (const x of [-36, 96]) {
    add(4, d([...P(x, 400, 0.62), ...P(x, 322, 0.62)]), { stroke: M.metal, sw: 1.4 });
    add(4, dq(P(x - 15, 322, 0.6), P(x + 15, 322, 0.6), P(x + 15, 274, 0.6), P(x - 15, 274, 0.6)), { fill: M.frame });
    add(4, dq(P(x - 15, 274, 0.6), P(x + 15, 274, 0.6), P(x + 15, 277, 0.64), P(x - 15, 277, 0.64)), { fill: '#141516' });
  }

  /* --- softboxes ------------------------------------------------------ */
  const softbox = (x, z, yc, w, hh, flip) => {
    const sgn = flip ? -1 : 1;
    /* Light panel facing the room. */
    add(4, dq(P(x - w / 2 * sgn, yc - hh, z), P(x + w / 2 * sgn, yc - hh, z), P(x + w / 2 * sgn, yc + hh, z), P(x - w / 2 * sgn, yc + hh, z)), { fill: M.softbox });
    /* Body behind it. */
    add(4, dq(P(x - w / 2 * sgn, yc - hh, z + 0.045), P(x + w / 2 * sgn, yc - hh, z + 0.045), P(x + w / 2 * sgn, yc + hh, z + 0.045), P(x - w / 2 * sgn, yc + hh, z + 0.045)), { fill: M.softboxDark });
    /* Stand. */
    add(4, dq(P(x - 5, 0, z + 0.02), P(x + 5, 0, z + 0.02), P(x + 5, yc, z + 0.02), P(x - 5, yc, z + 0.02)), { fill: M.metal });
    /* Tripod feet. */
    add(4, dq(P(x - 52, 0, z - 0.03), P(x - 40, 0, z - 0.02), P(x - 2, 44, z + 0.02), P(x - 12, 46, z + 0.02)), { fill: M.metal });
    add(4, dq(P(x + 52, 0, z - 0.03), P(x + 40, 0, z - 0.02), P(x + 2, 44, z + 0.02), P(x + 12, 46, z + 0.02)), { fill: M.metal });
    add(4, dq(P(x - 26, 0, z + 0.05), P(x - 16, 0, z + 0.06), P(x - 4, 44, z + 0.02), P(x - 12, 44, z + 0.02)), { fill: M.metal });
  };
  softbox(-206, 0.34, 208, 132, 66, true);
  softbox(232, 0.32, 232, 176, 96, false);
  softbox(-158, 0.52, 168, 92, 46, true);

  /* --- spot on a stand, mid right -------------------------------------- */
  {
    const x = 186; const z = 0.52; const yc = 176;
    add(4, dq(P(x - 6, 0, z + 0.02), P(x + 6, 0, z + 0.02), P(x + 6, yc, z + 0.02), P(x - 6, yc, z + 0.02)), { fill: M.metal });
    add(4, dq(P(x - 40, 0, z - 0.03), P(x - 28, 0, z - 0.02), P(x - 3, 40, z + 0.02), P(x - 13, 42, z + 0.02)), { fill: M.metal });
    add(4, dq(P(x + 40, 0, z - 0.03), P(x + 28, 0, z - 0.02), P(x + 3, 40, z + 0.02), P(x + 13, 42, z + 0.02)), { fill: M.metal });
    add(4, dq(P(x - 30, yc - 22, z), P(x + 18, yc - 30, z), P(x + 18, yc + 6, z), P(x - 30, yc + 12, z)), { fill: M.frame });
  }

  /* --- camera on a tripod, foreground left ----------------------------- */
  {
    const x = -170; const z = 0.31; const yc = 132;
    add(4, dq(P(x - 34, yc - 20, z), P(x + 34, yc - 20, z), P(x + 34, yc + 20, z), P(x - 34, yc + 20, z)), { fill: M.frame });
    add(4, dq(P(x + 20, yc - 14, z - 0.02), P(x + 62, yc - 22, z - 0.05), P(x + 62, yc + 16, z - 0.05), P(x + 20, yc + 12, z - 0.02)), { fill: M.metal });
    add(4, dq(P(x - 4, yc - 32, z), P(x + 30, yc - 32, z), P(x + 30, yc - 20, z), P(x - 4, yc - 20, z)), { fill: M.metal });
    for (const a of [-0.55, 0.55, 3.14]) {
      const fx = x + Math.sin(a) * 92;
      const fz = z - Math.cos(a) * 0.055;
      add(4, dq(P(x - 5, 30, z + 0.01), P(x + 5, 30, z + 0.01), P(fx + 5, 0, fz), P(fx - 5, 0, fz)), { fill: M.leg });
    }
    add(4, dq(P(x - 26, 0, z + 0.02), P(x + 26, 0, z + 0.02), P(x + 20, 30, z + 0.01), P(x - 20, 30, z + 0.01)), { fill: M.leg });
  }

  /* --- stands either side of the set ---------------------------------- */
  for (const [x, z] of [[-104, 0.4], [-236, 0.42]]) {
    add(4, dq(P(x - 5, 0, z + 0.02), P(x + 5, 0, z + 0.02), P(x + 5, 150, z + 0.02), P(x - 5, 150, z + 0.02)), { fill: M.metal });
    add(4, dq(P(x - 44, 0, z - 0.035), P(x - 32, 0, z - 0.025), P(x - 2, 32, z + 0.02), P(x - 12, 34, z + 0.02)), { fill: M.metal });
    add(4, dq(P(x + 44, 0, z - 0.035), P(x + 32, 0, z - 0.025), P(x + 2, 32, z + 0.02), P(x + 12, 34, z + 0.02)), { fill: M.metal });
  }
}

/* ============================================================= 5 · DETAIL
 * Fine work: batten seams, mullion reveals, screen and lens detail, hardware.
 */
{
  for (let i = 0; i <= 22; i += 1) {
    const z = 0.29 + (i / 22) * 0.44;
    add(5, d(P(-280, 0, z), P(-280, 400, z)), { stroke: 'rgba(72,46,22,0.42)', sw: 1.1 });
  }
  /* Desk hardware and the set dressing nobody notices until it is missing. */
  add(5, dq(P(-38, 74, 0.56), P(2, 74, 0.56), P(2, 79, 0.575), P(-38, 79, 0.575)), { fill: M.chair });
  add(5, dq(P(-36, 77, 0.577), P(0, 77, 0.577), P(0, 118, 0.585), P(-36, 118, 0.585)), { fill: '#c9cdd0' });
  add(5, dq(P(30, 74, 0.6), P(48, 74, 0.6), P(48, 86, 0.605), P(30, 86, 0.605)), { fill: '#e4e1da' });
  /* Under-desk shadow line and the chair's cylinder. */
  add(5, d(P(-92, 0.2, 0.66), P(92, 0.2, 0.66)), { stroke: M.skirt, sw: 1.2 });
  /* Tripod screw knob, cable. */
  add(5, d(P(-176, 150, 0.31), P(-166, 118, 0.31)), { stroke: M.metal, sw: 1.2 });
}

/* Finish pass — the render's soft light. Never part of the drawing. */
{
  after(`M0 0H${W}V${H}H0Z`, { fill: 'url(#gVignette)' });
  after(dq(P(-280, 0, 0.3), P(120, 0, 0.3), P(240, 0, 0.95), P(-280, 0, 1)), { fill: 'url(#gPool)' });
  after(dq(P(150, 0, 0.3), P(280, 0, 0.3), P(280, 0, 1), P(150, 0, 1)), { fill: 'url(#gPoolR)' });
  after(
    `M${r1(CX - 200)} ${r1(HORIZON - 190)}a200 150 0 1 0 400 0a200 150 0 1 0 -400 0Z`,
    { fill: 'url(#gGlow)' },
  );
  const shadow = (cx, cy, rx, ry, op) => after(
    `M${r1(cx - rx)} ${r1(cy)}a${r1(rx)} ${r1(ry)} 0 1 0 ${r1(rx * 2)} 0a${r1(rx)} ${r1(ry)} 0 1 0 ${r1(-rx * 2)} 0Z`,
    { fill: '#8d8577', opacity: op },
  );
  const foot = (x, z) => P(x, 0, z);
  let s = foot(-70, 0.62); shadow(s[0] + 40, s[1] - 6, 150, 16, 0.17);
  s = foot(0, 0.4); shadow(s[0], s[1] - 4, 60, 9, 0.2);
  s = foot(-170, 0.3); shadow(s[0], s[1] - 6, 92, 12, 0.22);
  s = foot(210, 0.31); shadow(s[0], s[1] - 6, 96, 12, 0.18);
  s = foot(-206, 0.35); shadow(s[0], s[1] - 6, 74, 10, 0.18);
  /* Floor glint under the window. */
  after(dq(P(40, 0, 0.44), P(250, 0, 0.44), P(262, 0, 0.6), P(60, 0, 0.6)), { fill: '#ffffff', opacity: 0.2 });
}

/* -------------------------------------------------------------------- emit */

const attrsFor = (item) => {
  const parts = [`d="${item.path}"`];
  if (item.fill) parts.push(`data-fill="${item.fill}"`);
  if (item.keep === false) parts.push('data-guide="1"');
  if (item.stroke) parts.push(`data-stroke="${item.stroke}"`);
  if (item.sw) parts.push(`data-sw="${item.sw}"`);
  return parts.join(' ');
};

const lines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!-- Generated by scripts/build-studio-scene.mjs — do not edit by hand. -->',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"`,
  '     role="img" aria-label="Architectural drawing of the Double H Studio interior"',
  '     stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">',
  '  <defs>',
  '    <linearGradient id="gFloor" x1="0" y1="1" x2="1" y2="0">',
  '      <stop offset="0" stop-color="#ddd9d3" /><stop offset="0.45" stop-color="#e9e6e1" />',
  '      <stop offset="1" stop-color="#f2f0ec" />',
  '    </linearGradient>',
  '    <linearGradient id="gWood" x1="0" y1="0" x2="1" y2="0">',
  '      <stop offset="0" stop-color="#cfa473" /><stop offset="0.55" stop-color="#c3966a" />',
  '      <stop offset="1" stop-color="#b1835a" />',
  '    </linearGradient>',
  '    <linearGradient id="gGlass" x1="0" y1="0" x2="0.25" y2="1">',
  '      <stop offset="0" stop-color="#eef6fa" /><stop offset="0.5" stop-color="#dae7ee" />',
  '      <stop offset="1" stop-color="#c9d8e2" />',
  '    </linearGradient>',
  '    <radialGradient id="gGlow" cx="0.5" cy="0.5" r="0.5">',
  '      <stop offset="0" stop-color="#fff6e6" stop-opacity="0.75" />',
  '      <stop offset="0.6" stop-color="#fff6e6" stop-opacity="0.18" />',
  '      <stop offset="1" stop-color="#fff6e6" stop-opacity="0" />',
  '    </radialGradient>',
  '    <linearGradient id="gPool" x1="0.1" y1="0" x2="0.9" y2="1">',
  '      <stop offset="0" stop-color="#ffffff" stop-opacity="0.42" />',
  '      <stop offset="1" stop-color="#ffffff" stop-opacity="0" />',
  '    </linearGradient>',
  '    <linearGradient id="gPoolR" x1="0" y1="0" x2="1" y2="0.6">',
  '      <stop offset="0" stop-color="#ffffff" stop-opacity="0" />',
  '      <stop offset="1" stop-color="#ffffff" stop-opacity="0.3" />',
  '    </linearGradient>',
  '    <radialGradient id="gVignette" cx="0.5" cy="0.48" r="0.72">',
  '      <stop offset="0.55" stop-color="#2a2620" stop-opacity="0" />',
  '      <stop offset="1" stop-color="#2a2620" stop-opacity="0.2" />',
  '    </radialGradient>',
  '    <clipPath id="frame"><rect x="0" y="0" width="1600" height="1067" /></clipPath>',
  '  </defs>',
  '  <g clip-path="url(#frame)">',
];

for (const n of [1, 2, 3, 4, 5]) {
  lines.push(`    <g data-stage="${n}">`);
  for (const item of stages[n]) lines.push(`      <path ${attrsFor(item)} />`);
  lines.push('    </g>');
}
lines.push('    <g data-finish>');
for (const item of finish) {
  const a = Object.entries(item.attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
  lines.push(`      <path d="${item.path}" ${a} />`);
}
lines.push('    </g>');
lines.push('  </g>', '</svg>', '');

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../src/scenes/studioScene.svg');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join('\n'), 'utf8');

const counts = [1, 2, 3, 4, 5].map((n) => `stage ${n}: ${stages[n].length}`).join(' · ');
console.log(`studioScene.svg written — ${counts} · finish: ${finish.length}`);
