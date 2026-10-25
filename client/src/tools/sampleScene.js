/* Test fixture for the line-art tracer — NOT the studio.
 *
 * Draws a synthetic one-point-perspective interior on a canvas so the tracer
 * can be exercised end to end (and so thresholds can be judged) without a real
 * photograph present. Every edge in this scene is genuinely straight, which is
 * exactly what the Hough pass is meant to find.
 *
 * This file is part of the dev tool only: it is never imported by the site and
 * is excluded from the production build.
 */

export const SAMPLE_SIZE = { width: 1600, height: 1067 };

const quad = (ctx, pts, fill) => {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
};

export function drawTestInterior(ctx, w = SAMPLE_SIZE.width, h = SAMPLE_SIZE.height) {
  const lerp = (a, b, t) => a + (b - a) * t;
  const F = { x0: 0.05 * w, y0: 0.045 * h, x1: 0.95 * w, y1: 0.985 * h };
  const B = { x0: 0.3 * w, y0: 0.275 * h, x1: 0.71 * w, y1: 0.755 * h };

  /* Parametric surfaces — linear in both parameters, so every edge is straight. */
  const leftWall = (t, u) => {
    const tx = lerp(F.x0, B.x0, t);
    const ty = lerp(F.y0, B.y0, t);
    const bx = lerp(F.x0, B.x0, t);
    const by = lerp(F.y1, B.y1, t);
    return { x: lerp(tx, bx, u), y: lerp(ty, by, u) };
  };
  const rightWall = (t, u) => {
    const tx = lerp(F.x1, B.x1, t);
    const ty = lerp(F.y0, B.y0, t);
    const bx = lerp(F.x1, B.x1, t);
    const by = lerp(F.y1, B.y1, t);
    return { x: lerp(tx, bx, u), y: lerp(ty, by, u) };
  };
  const backWall = (s, u) => ({
    x: lerp(B.x0, B.x1, s),
    y: lerp(B.y0, B.y1, u),
  });
  const floor = (s, t) => {
    const fx = lerp(F.x0, F.x1, s);
    const bx = lerp(B.x0, B.x1, s);
    const y = lerp(F.y1, B.y1, t);
    return { x: lerp(fx, bx, t), y };
  };
  const ceiling = (s, t) => {
    const fx = lerp(F.x0, F.x1, s);
    const bx = lerp(B.x0, B.x1, s);
    const y = lerp(F.y0, B.y0, t);
    return { x: lerp(fx, bx, t), y };
  };

  /* --- shell ------------------------------------------------------------- */
  ctx.fillStyle = '#efe9e1';
  ctx.fillRect(0, 0, w, h);

  quad(ctx, [ceiling(0, 0), ceiling(1, 0), ceiling(1, 1), ceiling(0, 1)], '#e9e2d9');
  quad(ctx, [leftWall(0, 0), leftWall(1, 0), leftWall(1, 1), leftWall(0, 1)], '#f4eee6');
  quad(ctx, [rightWall(0, 0), rightWall(1, 0), rightWall(1, 1), rightWall(0, 1)], '#e5ddd4');
  quad(ctx, [backWall(0, 0), backWall(1, 0), backWall(1, 1), backWall(0, 1)], '#f7f2eb');

  const floorGrad = ctx.createLinearGradient(B.x0, B.y1, F.x1, F.y1);
  floorGrad.addColorStop(0, '#cfc0ad');
  floorGrad.addColorStop(1, '#b7a795');
  quad(ctx, [floor(0, 0), floor(1, 0), floor(1, 1), floor(0, 1)], floorGrad);

  /* --- skirting ---------------------------------------------------------- */
  quad(ctx, [leftWall(0, 0.965), leftWall(1, 0.965), leftWall(1, 1), leftWall(0, 1)], '#ded4c9');
  quad(ctx, [rightWall(0, 0.965), rightWall(1, 0.965), rightWall(1, 1), rightWall(0, 1)], '#d3c9bd');
  quad(ctx, [backWall(0, 0.965), backWall(1, 0.965), backWall(1, 1), backWall(0, 1)], '#e2d8cd');

  /* --- window on the left wall ------------------------------------------- */
  const glazing = [
    leftWall(0.12, 0.17), leftWall(0.52, 0.17),
    leftWall(0.52, 0.62), leftWall(0.12, 0.62),
  ];
  quad(ctx, glazing, '#dfeaf0');
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#fbf8f4';
  quad(ctx, glazing);
  ctx.stroke();
  ctx.lineWidth = 5;
  for (const t of [0.25, 0.38]) {
    quad(ctx, [leftWall(t, 0.17), leftWall(t, 0.17), leftWall(t, 0.62), leftWall(t, 0.62)]);
    ctx.beginPath();
    ctx.moveTo(leftWall(t, 0.17).x, leftWall(t, 0.17).y);
    ctx.lineTo(leftWall(t, 0.62).x, leftWall(t, 0.62).y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(leftWall(0.12, 0.37).x, leftWall(0.12, 0.37).y);
  ctx.lineTo(leftWall(0.52, 0.37).x, leftWall(0.52, 0.37).y);
  ctx.stroke();
  quad(ctx, [leftWall(0.12, 0.62), leftWall(0.52, 0.62), leftWall(0.52, 0.68), leftWall(0.12, 0.68)], '#fbf8f4');

  /* --- door on the back wall -------------------------------------------- */
  quad(ctx, [backWall(0.6, 0.18), backWall(0.87, 0.18), backWall(0.87, 0.97), backWall(0.6, 0.97)], '#e7ddd2');
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#fdfaf6';
  quad(ctx, [backWall(0.6, 0.18), backWall(0.87, 0.18), backWall(0.87, 0.97), backWall(0.6, 0.97)]);
  ctx.stroke();

  /* --- light pool from the window, on the floor ------------------------- */
  const pool = ctx.createLinearGradient(B.x0, B.y1, F.x0, F.y1);
  pool.addColorStop(0, 'rgba(255,252,240,0.5)');
  pool.addColorStop(1, 'rgba(255,252,240,0)');
  quad(ctx, [floor(0.02, 0.1), floor(0.34, 0.1), floor(0.62, 0.99), floor(0.1, 0.99)], pool);

  /* --- rug -------------------------------------------------------------- */
  ctx.save();
  ctx.beginPath();
  const rugA = floor(0.34, 0.42);
  const rugB = floor(0.72, 0.42);
  const rugC = floor(0.72, 0.95);
  const rugD = floor(0.34, 0.95);
  ctx.moveTo(rugA.x, rugA.y);
  ctx.lineTo(rugB.x, rugB.y);
  ctx.lineTo(rugC.x, rugC.y);
  ctx.lineTo(rugD.x, rugD.y);
  ctx.closePath();
  ctx.fillStyle = '#aebbb4';
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 4;
  for (let i = 0; i < 7; i += 1) {
    const s = 0.38 + i * 0.05;
    const a = floor(s, 0.42);
    const b = floor(s, 0.95);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();

  /* --- table ------------------------------------------------------------ */
  const tableTop = [floor(0.36, 0.44), floor(0.66, 0.44), floor(0.66, 0.62), floor(0.36, 0.62)];
  quad(ctx, tableTop, '#a37c58');
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#c39a72';
  quad(ctx, tableTop);
  ctx.stroke();
  quad(ctx, [floor(0.36, 0.62), floor(0.66, 0.62), floor(0.66, 0.70), floor(0.36, 0.70)], '#8a6746');
  const legTop = 0.62;
  for (const s of [0.4, 0.45, 0.6, 0.65]) {
    const a = floor(s, legTop);
    const b = floor(s, 0.9);
    quad(ctx, [
      { x: a.x - 5, y: a.y }, { x: a.x + 5, y: a.y },
      { x: b.x + 4, y: b.y }, { x: b.x - 4, y: b.y },
    ], '#7d5c3f');
  }

  /* --- chairs ----------------------------------------------------------- */
  const chair = (s0, s1, t0, t1) => {
    const seat = [floor(s0, t0), floor(s1, t0), floor(s1, t1), floor(s0, t1)];
    quad(ctx, seat, '#4e5a56');
    const backA = floor(s0, t1);
    const backB = floor(s1, t1);
    quad(ctx, [
      backA, backB,
      { x: backB.x, y: backB.y - 130 }, { x: backA.x, y: backA.y - 120 },
    ], '#46524f');
    for (const s of [s0 + 0.01, s1 - 0.01]) {
      const a = floor(s, t0 - 0.04);
      quad(ctx, [
        { x: a.x - 4, y: a.y + 40 }, { x: a.x + 4, y: a.y + 40 },
        { x: a.x + 3, y: a.y + 82 }, { x: a.x - 3, y: a.y + 82 },
      ], '#3d4844');
    }
  };
  chair(0.16, 0.26, 0.4, 0.52);
  chair(0.74, 0.85, 0.44, 0.56);

  /* --- pendant lamps ---------------------------------------------------- */
  const lamp = (s) => {
    const top = ceiling(s, 0.55);
    const shade = floor(s, 0.18);
    ctx.strokeStyle = '#3a3f3d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(shade.x, shade.y - 44);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(shade.x - 46, shade.y - 18);
    ctx.lineTo(shade.x - 12, shade.y - 60);
    ctx.lineTo(shade.x + 12, shade.y - 60);
    ctx.lineTo(shade.x + 46, shade.y - 18);
    ctx.closePath();
    ctx.fillStyle = '#2f3433';
    ctx.fill();
    const glow = ctx.createRadialGradient(shade.x, shade.y, 4, shade.x, shade.y, 150);
    glow.addColorStop(0, 'rgba(255,232,180,0.55)');
    glow.addColorStop(1, 'rgba(255,232,180,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(shade.x, shade.y + 40, 150, 110, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  lamp(0.44);
  lamp(0.72);

  /* --- shelving on the right wall --------------------------------------- */
  for (let i = 0; i < 3; i += 1) {
    const u = 0.3 + i * 0.2;
    quad(ctx, [
      rightWall(0.16, u), rightWall(0.6, u),
      rightWall(0.6, u + 0.03), rightWall(0.16, u + 0.03),
    ], '#9c7f61');
  }

  /* --- vignette --------------------------------------------------------- */
  const vignette = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.3, w * 0.5, h * 0.5, h * 0.95);
  vignette.addColorStop(0, 'rgba(20,24,24,0)');
  vignette.addColorStop(1, 'rgba(20,24,24,0.42)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}
