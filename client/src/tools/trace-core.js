/* Architectural line tracer — pure algorithms, no DOM, no dependencies.
 *
 * Pipeline:  grayscale → blur → Sobel → non-maximum suppression → hysteresis
 *            threshold → Hough transform for straight architectural lines →
 *            contour tracing for the remaining edges → Douglas–Peucker
 *            simplification → classification into five construction stages.
 *
 * The result is a *first-pass, organized* trace of a real photograph: long
 * structural straight lines first, then boundaries, openings, furniture
 * silhouettes and finally fine detail. It is genuinely vectorized geometry,
 * not an edge overlay — every stroke is a real line or polyline that can be
 * drawn with stroke-dasharray. It is a starting point for refinement, not a
 * substitute for it. See public/studio/README.md.
 */

/* ------------------------------------------------------------------ basics */

export function grayscale(data, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
    out[i] = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
  }
  return out;
}

function blurAxis(src, w, h, r, horizontal) {
  const out = new Float32Array(w * h);
  const span = 2 * r + 1;
  if (horizontal) {
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      for (let x = 0; x < w; x += 1) {
        let sum = 0;
        for (let k = -r; k <= r; k += 1) sum += src[row + Math.min(w - 1, Math.max(0, x + k))];
        out[row + x] = sum / span;
      }
    }
  } else {
    for (let x = 0; x < w; x += 1) {
      for (let y = 0; y < h; y += 1) {
        let sum = 0;
        for (let k = -r; k <= r; k += 1) sum += src[Math.min(h - 1, Math.max(0, y + k)) * w + x];
        out[y * w + x] = sum / span;
      }
    }
  }
  return out;
}

export function blur(src, w, h, radius = 1) {
  if (radius < 1) return src;
  return blurAxis(blurAxis(src, w, h, radius, true), w, h, radius, false);
}

/* ---------------------------------------------------------------- gradients */

function percentile(arr, p) {
  const hist = new Uint32Array(256);
  let max = 0;
  for (let i = 0; i < arr.length; i += 1) if (arr[i] > max) max = arr[i];
  if (max <= 0) return 1;
  for (let i = 0; i < arr.length; i += 1) hist[Math.min(255, (arr[i] / max) * 255) | 0] += 1;
  const target = arr.length * p;
  let acc = 0;
  for (let b = 0; b < 256; b += 1) {
    acc += hist[b];
    if (acc >= target) return Math.max(1e-6, (b / 255) * max);
  }
  return max;
}

/* Sobel gradient + quantization to four directions, normalized by the
   intensity that separates the top ~1% of gradients (so the UI thresholds are
   perceptually stable across photographs). */
export function sobel(gray, w, h) {
  const mag = new Float32Array(w * h);
  const ang = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const tl = gray[i - w - 1], t = gray[i - w], tr = gray[i - w + 1];
      const l = gray[i - 1], rr = gray[i + 1];
      const bl = gray[i + w - 1], b = gray[i + w], br = gray[i + w + 1];
      const gx = (tr + 2 * rr + br) - (tl + 2 * l + bl);
      const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      mag[i] = Math.hypot(gx, gy);
      let a = (Math.atan2(gy, gx) * 180) / Math.PI;
      if (a < 0) a += 180;
      ang[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
    }
  }
  const scale = percentile(mag, 0.99);
  for (let i = 0; i < mag.length; i += 1) mag[i] = Math.min(1, mag[i] / scale);
  return { mag, ang };
}

/* Keep only the local maximum along the gradient direction — this is what
   turns a fat gradient blob into a 1px architectural line. */
export function thin(mag, ang, w, h) {
  const out = new Float32Array(w * h);
  const offset = [-1, w - 1, w, w + 1];
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const m = mag[i];
      if (m <= 0) continue;
      const o = offset[ang[i]];
      if (m >= mag[i - o] && m >= mag[i + o]) out[i] = m;
    }
  }
  return out;
}

/* Hysteresis: strong seeds flood into weak-but-connected pixels, so a line
   stays unbroken while noise is dropped. */
export function hysteresis(nms, w, h, low, high) {
  const edge = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  for (let i = 0; i < nms.length; i += 1) {
    if (nms[i] >= high) {
      edge[i] = 1;
      stack[sp] = i;
      sp += 1;
    }
  }
  while (sp > 0) {
    sp -= 1;
    const i = stack[sp];
    const x = i % w;
    const y = (i / w) | 0;
    for (let ny = y - 1; ny <= y + 1; ny += 1) {
      if (ny < 0 || ny >= h) continue;
      for (let nx = x - 1; nx <= x + 1; nx += 1) {
        if (nx < 0 || nx >= w) continue;
        const j = ny * w + nx;
        if (edge[j] || nms[j] < low) continue;
        edge[j] = 1;
        stack[sp] = j;
        sp += 1;
      }
    }
  }
  return edge;
}

export function detectEdges(gray, w, h, { low = 0.09, high = 0.2, radius = 1 } = {}) {
  const smooth = blur(gray, w, h, radius);
  const { mag, ang } = sobel(smooth, w, h);
  const nms = thin(mag, ang, w, h);
  return { edge: hysteresis(nms, w, h, low, high), mag, nms };
}

/* ------------------------------------------------------------------ Hough */

/* Straight lines are what make a trace read as architecture: walls, floor
   lines, window frames, table edges. Extracted first, longest first. */
export function houghSegments(edge, w, h, opts = {}) {
  const {
    thetaSteps = 144,
    rhoStep = 2,
    minVotes = 30,
    minLength = Math.max(24, Math.max(w, h) * 0.035),
    maxGap = 6,
    tolerance = 1.65,
    maxLines = 320,
  } = opts;

  const diag = Math.ceil(Math.hypot(w, h));
  const rhoCount = Math.ceil((2 * diag) / rhoStep) + 1;
  const cos = new Float32Array(thetaSteps);
  const sin = new Float32Array(thetaSteps);
  for (let t = 0; t < thetaSteps; t += 1) {
    const theta = (Math.PI * t) / thetaSteps;
    cos[t] = Math.cos(theta);
    sin[t] = Math.sin(theta);
  }

  let active = new Int32Array(edge.length);
  let activeCount = 0;
  for (let i = 0; i < edge.length; i += 1) {
    if (edge[i]) {
      active[activeCount] = i;
      activeCount += 1;
    }
  }
  active = active.subarray(0, activeCount);

  const acc = new Uint32Array(thetaSteps * rhoCount);
  for (let k = 0; k < active.length; k += 1) {
    const idx = active[k];
    const x = idx % w;
    const y = (idx - x) / w;
    for (let t = 0; t < thetaSteps; t += 1) {
      const rho = x * cos[t] + y * sin[t];
      acc[t * rhoCount + ((rho + diag) / rhoStep + 0.5) | 0] += 1;
    }
  }

  const candidates = [];
  for (let i = 0; i < acc.length; i += 1) if (acc[i] >= minVotes) candidates.push(i);
  candidates.sort((a, b) => acc[b] - acc[a]);

  const segments = [];
  const consumed = new Uint8Array(edge.length);
  const linePoints = [];

  for (let c = 0; c < candidates.length && segments.length < maxLines; c += 1) {
    const cell = candidates[c];
    if (acc[cell] < minVotes) continue;
    const t = (cell / rhoCount) | 0;
    const r = cell % rhoCount;
    const rho = r * rhoStep - diag - rhoStep * 0.5;

    /* Suppress this line's neighbours in the accumulator so the next pick is a
       genuinely different line rather than the same edge one bin over. */
    for (let dt = -2; dt <= 2; dt += 1) {
      const tt = t + dt;
      if (tt < 0 || tt >= thetaSteps) continue;
      for (let dr = -4; dr <= 4; dr += 1) {
        const rr = r + dr;
        if (rr < 0 || rr >= rhoCount) continue;
        acc[tt * rhoCount + rr] = 0;
      }
    }

    /* Gather every still-unused edge pixel that lies on this line. */
    linePoints.length = 0;
    for (let k = 0; k < active.length; k += 1) {
      const idx = active[k];
      const x = idx % w;
      const y = (idx - x) / w;
      const d = x * cos[t] + y * sin[t] - rho;
      if (d > tolerance || d < -tolerance) continue;
      if (consumed[idx]) continue;
      linePoints.push({ idx, s: -x * sin[t] + y * cos[t], x, y });
    }
    if (linePoints.length < 2) continue;

    linePoints.sort((a, b) => a.s - b.s);

    /* Break the collinear points into runs so a wall does not get drawn
       straight through a doorway where points are missing. */
    let runStart = 0;
    for (let k = 1; k <= linePoints.length; k += 1) {
      const gap = k < linePoints.length ? linePoints[k].s - linePoints[k - 1].s : Infinity;
      if (gap <= maxGap) continue;
      const run = linePoints.slice(runStart, k);
      runStart = k;
      if (run.length < 2) continue;
      const a = run[0];
      const b = run[run.length - 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < minLength) continue;
      segments.push({
        kind: 'line',
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        length: len,
        /* angle from horizontal, for guide detection */
        angle: (Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * 180) / Math.PI,
      });
      for (const p of run) consumed[p.idx] = 1;
    }
  }

  return { segments, consumed };
}

/* --------------------------------------------------------------- contours */

/* Everything the Hough pass did not claim — objects, mouldings, upholstery,
   shadows — walked as polylines. */
export function traceContours(edge, consumed, w, h, { minPoints = 9 } = {}) {
  const available = new Uint8Array(w * h);
  for (let i = 0; i < edge.length; i += 1) available[i] = edge[i] && !consumed[i] ? 1 : 0;
  const visited = new Uint8Array(w * h);
  const out = [];

  for (let seed = 0; seed < available.length; seed += 1) {
    if (!available[seed] || visited[seed]) continue;
    const points = [];
    let x = seed % w;
    let y = (seed - x) / w;
    let dx = 0;
    let dy = 0;
    for (;;) {
      visited[y * w + x] = 1;
      points.push([x, y]);
      let bx = -1;
      let by = -1;
      let best = -Infinity;
      for (let ny = y - 1; ny <= y + 1; ny += 1) {
        if (ny < 0 || ny >= h) continue;
        for (let nx = x - 1; nx <= x + 1; nx += 1) {
          if (nx < 0 || nx >= w) continue;
          if (nx === x && ny === y) continue;
          const j = ny * w + nx;
          if (!available[j] || visited[j]) continue;
          const ndx = nx - x;
          const ndy = ny - y;
          const score = dx || dy ? ndx * dx + ndy * dy : 0;
          if (score > best) { best = score; bx = nx; by = ny; }
        }
      }
      if (bx < 0) break;
      dx = bx - x;
      dy = by - y;
      x = bx;
      y = by;
      if (points.length > 40000) break;
    }
    if (points.length >= minPoints) out.push(points);
  }
  return out;
}

/* Douglas–Peucker — collapses a pixel staircase into real segments. */
export function simplify(points, tolerance = 1.3) {
  const n = points.length;
  if (n < 3) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const ax = points[a][0];
    const ay = points[a][1];
    const bx = points[b][0];
    const by = points[b][1];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let far = -1;
    let farD = tolerance;
    for (let i = a + 1; i < b; i += 1) {
      const d = Math.abs((points[i][0] - ax) * dy - (points[i][1] - ay) * dx) / len;
      if (d > farD) { farD = d; far = i; }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i += 1) if (keep[i]) out.push(points[i]);
  return out;
}

export function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
}

/* ------------------------------------------------- classification + output */

export const STAGE_STYLE = {
  1: { id: 'guides', name: 'Guides', width: 1.15, opacity: 0.75 },
  2: { id: 'structure', name: 'Structure', width: 1.9, opacity: 1 },
  3: { id: 'openings', name: 'Openings', width: 1.6, opacity: 0.95 },
  4: { id: 'furniture', name: 'Furniture', width: 1.7, opacity: 0.9 },
  5: { id: 'details', name: 'Detail', width: 1.3, opacity: 0.8 },
};

/* Assign every stroke to a construction stage.
 *
 *   1 guides     long, near-axis-aligned lines — the setting-out the rest is
 *                drawn against
 *   2 structure  the remaining long lines — walls, floor, ceiling, boundaries
 *   3 openings   medium lines — doors, windows, panel and frame edges
 *   4 furniture  long free-form contours — built-ins and furniture silhouettes
 *   5 details    short strokes — trim, hardware, shadows, fine detail
 */
export function classify(segments, polylines, w, h) {
  const maxDim = Math.max(w, h);
  const stages = { 1: [], 2: [], 3: [], 4: [], 5: [] };

  const lines = segments.slice().sort((a, b) => b.length - a.length);
  const guideBudget = Math.max(4, Math.min(48, Math.round(lines.length * 0.14)));
  let guides = 0;
  const structureMin = maxDim * 0.075;
  const openingMin = maxDim * 0.028;

  for (const line of lines) {
    if (guides < guideBudget && line.length >= maxDim * 0.16 && (line.angle < 14 || line.angle > 76)) {
      stages[1].push(line);
      guides += 1;
    } else if (line.length >= structureMin) {
      stages[2].push(line);
    } else if (line.length >= openingMin) {
      stages[3].push(line);
    } else {
      stages[5].push(line);
    }
  }

  const furnitureMin = maxDim * 0.09;
  for (const poly of polylines) {
    if (poly.length >= furnitureMin) stages[4].push(poly);
    else stages[5].push(poly);
  }

  return stages;
}

const num = (n) => (Math.round(n * 10) / 10).toString();

function lineMarkup(stage, seg) {
  const style = STAGE_STYLE[stage];
  return `    <line x1="${num(seg.x1)}" y1="${num(seg.y1)}" x2="${num(seg.x2)}" y2="${num(seg.y2)}" `
    + `stroke-width="${style.width}" opacity="${style.opacity}" />`;
}

function polylineMarkup(stage, points) {
  const style = STAGE_STYLE[stage];
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${num(p[0])} ${num(p[1])}`).join('');
  return `    <path d="${d}" stroke-width="${style.width}" opacity="${style.opacity}" />`;
}

/* viewBox is the photograph's own pixel grid, so the layer aligns with the
   <img> pixel for pixel at any size. */
export function buildSvg({ w, h, stages, source = 'studio' }) {
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet"`,
    '     stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"',
    '     role="img" aria-label="Architectural line drawing traced from the studio photograph">',
    `  <!-- Traced from ${source} (${w}x${h}) by client/trace.html.`,
    '       data-stage 1 = guides, 2 = structure, 3 = openings, 4 = furniture, 5 = detail -->',
  ];
  for (const n of [1, 2, 3, 4, 5]) {
    const items = stages[n] || [];
    /* Emitted even when empty, so the runtime always sees the full five-stage
       hierarchy and the progress counter stays in step with the drawing. */
    parts.push(`  <g data-stage="${n}">`);
    for (const item of items) {
      parts.push(Array.isArray(item) ? polylineMarkup(n, item) : lineMarkup(n, item));
    }
    parts.push('  </g>');
  }
  parts.push('</svg>', '');
  return parts.join('\n');
}

/* ------------------------------------------------------------- entry point */

export function traceImageData(imageData, options = {}) {
  const { width: w, height: h, data } = imageData;
  const {
    low = 0.09,
    high = 0.2,
    blurRadius = 1,
    detail = 1,
    minLineFactor = 0.035,
  } = options;

  const gray = grayscale(data, w, h);
  const { edge, nms } = detectEdges(gray, w, h, { low, high, radius: blurRadius });

  const { segments, consumed } = houghSegments(edge, w, h, {
    minLength: Math.max(20, Math.max(w, h) * minLineFactor),
    minVotes: Math.max(16, Math.round(24 / Math.max(0.5, detail))),
  });

  const raw = traceContours(edge, consumed, w, h, {
    minPoints: Math.max(5, Math.round(12 / Math.max(0.4, detail))),
  });
  const tolerance = 1.05 + (1 - Math.min(1.6, detail)) * 1.6;
  const polylines = raw.map((points) => simplify(points, tolerance));

  const stages = classify(segments, polylines, w, h);
  return { stages, edge, nms, segments, polylines };
}
