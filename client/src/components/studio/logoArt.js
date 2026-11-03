/* The Double H Studio mark, built as real 3D line and fill work.

   This is the site's own wordmark — "Double H" over "— STUDIO —" — not a
   separate monogram. It is traced from the same vector lockup used by the
   header (Wordmark.jsx), then scaled into the hero camera's rear screen. The
   outlines are real line segments driven by the studio's draw-on shader, and
   the official letter shapes are filled underneath with a very low-opacity
   additive pass. Everything is generated once; nothing is allocated per frame. */

import * as THREE from 'three';

const WORDMARK_W = 476;
const WORDMARK_H = 136;

const LOGO_W = 0.132;
const SCALE = LOGO_W / WORDMARK_W;
const LEFT = -LOGO_W / 2;
/* Centred in the 0.14 x 0.095 m screen. The lockup is wide by design; the
   construction guides around it are what fill the screen. */
const TOP = (WORDMARK_H * SCALE) / 2;
const BOTTOM = TOP - WORDMARK_H * SCALE;

const WORD_GLYPH = 0.0066;
const WORD_LEFT = 123 * SCALE;
const WORD_RIGHT = 353 * SCALE;
const WORD_ADVANCE = (WORD_RIGHT - WORD_LEFT - WORD_GLYPH) / 5;

/* Logo bounds in the screen's local metre space (x right, y up, z out). */
export const LOGO = {
  w: LOGO_W,
  h: WORDMARK_H * SCALE,
  left: LEFT,
  top: TOP,
  bottom: BOTTOM,
  topBaseline: TOP - 100 * SCALE,
  wordBottom: TOP - 134 * SCALE,
  wordCap: 23 * SCALE,
  wordAdvance: WORD_ADVANCE,
  wordGlyph: WORD_GLYPH,
  wordStart: LEFT + WORD_LEFT,
  ruleY: TOP - 125.75 * SCALE,
  ruleLeft: LEFT,
  ruleRight: -LEFT,
  ruleInner: -LEFT - 88 * SCALE,
};

/* The official wordmark paths, copied verbatim from Wordmark.jsx. */
const GLYPHS = [
  {
    name: 'D',
    d: 'M0,0 H40 C58,0 72,20 72,50 C72,80 58,100 40,100 H0 Z M15,15 V85 H39 C50,85 57,70 57,50 C57,30 50,15 39,15 Z',
    dx: 0,
    start: 0.0,
    end: 0.1,
    tint: 0.58,
  },
  {
    name: 'O',
    d: 'M30,28 C47,28 60,43 60,64 C60,85 47,100 30,100 C13,100 0,85 0,64 C0,43 13,28 30,28 Z M30,43 C37,43 45,52 45,64 C45,76 37,85 30,85 C23,85 15,76 15,64 C15,52 23,43 30,43 Z',
    dx: 82,
    start: 0.06,
    end: 0.16,
    tint: 0.58,
  },
  {
    name: 'U',
    d: 'M0,28 H15 V68 C15,77 21,84 29,84 C37,84 43,77 43,68 V28 H58 V68 C58,88 46,100 29,100 C12,100 0,88 0,68 Z',
    dx: 152,
    start: 0.12,
    end: 0.22,
    tint: 0.6,
  },
  {
    name: 'B',
    d: 'M0,28 H30 C42,28 48,34 48,45 C48,52 45,57 39,60 C47,62 53,68 53,78 C53,91 43,100 30,100 H0 Z M15,42 H29 C34,42 36,45 36,51 C36,56 34,60 29,60 H15 Z M15,72 H30 C36,72 39,76 39,79 C39,83 36,86 30,86 H15 Z',
    dx: 220,
    start: 0.18,
    end: 0.3,
    tint: 0.6,
  },
  {
    name: 'L',
    d: 'M0,28 H14 V86 H42 V100 H0 Z',
    dx: 280,
    start: 0.25,
    end: 0.34,
    tint: 0.62,
  },
  {
    name: 'E',
    d: 'M0,28 H44 V42 H14 V57 H40 V71 H14 V86 H44 V100 H0 Z',
    dx: 332,
    start: 0.3,
    end: 0.4,
    tint: 0.64,
  },
  {
    name: 'H',
    d: 'M0,9 C0,4 4,0 9,0 C14,0 18,4 18,9 V41.5 H60 V9 C60,4 64,0 69,0 C74,0 78,4 78,9 V91 C78,96 74,100 69,100 C64,100 60,96 60,91 V58.5 H18 V91 C18,96 14,100 9,100 C4,100 0,96 0,91 Z',
    dx: 406,
    start: 0.36,
    end: 0.47,
    tint: 0.72,
  },
];

/* --------------------------------------------------------------------------
   Tiny SVG path parser (M/L/H/V/C/Z only — the paths above use nothing else)
   -------------------------------------------------------------------------- */

function sampleCubic(p0, p1, p2, p3, steps = 16) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([
      u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
      u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
    ]);
  }
  return pts;
}

function parseSvgPath(d) {
  const tokens = d.match(/[MHVCZLmhvczl]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const subpaths = [];
  let i = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let sub = null;

  const read = () => Number(tokens[i++]);
  const begin = (px, py) => {
    sub = { points: [[px, py]], closed: false };
    subpaths.push(sub);
    startX = px;
    startY = py;
  };

  while (i < tokens.length) {
    let cmd = tokens[i++];
    if (!/^[A-Za-z]$/.test(cmd)) continue;
    cmd = cmd.toUpperCase();

    if (cmd === 'M') {
      x = read();
      y = read();
      begin(x, y);
    } else if (cmd === 'L') {
      x = read();
      y = read();
      if (!sub) begin(x, y);
      else sub.points.push([x, y]);
    } else if (cmd === 'H') {
      if (!sub) begin(0, 0);
      x = read();
      sub.points.push([x, y]);
    } else if (cmd === 'V') {
      if (!sub) begin(0, 0);
      y = read();
      sub.points.push([x, y]);
    } else if (cmd === 'C') {
      const p0 = [x, y];
      p0[0] = x;
      p0[1] = y;
      const p1 = [read(), read()];
      const p2 = [read(), read()];
      const p3 = [read(), read()];
      if (!sub) begin(p0[0], p0[1]);
      const pts = sampleCubic(p0, p1, p2, p3, 16);
      sub.points.push(...pts.slice(1));
      x = p3[0];
      y = p3[1];
    } else if (cmd === 'Z') {
      if (sub) {
        sub.closed = true;
        x = startX;
        y = startY;
      }
    }
  }

  return subpaths;
}

/* --------------------------------------------------------------------------
   Monoline STUDIO letters — compact 0.62 x 1 glyph boxes
   -------------------------------------------------------------------------- */

function ellipse(cx, cy, rx, ry, steps = 26) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

function arc(cx, cy, r, from, to, steps = 12) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = from + ((to - from) * i) / steps;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function cubic(p0, p1, p2, p3, steps = 12) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([
      u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
      u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
    ]);
  }
  return pts;
}

const S_PATH = [
  [0.6, 0.84], [0.5, 1], [0.12, 1], [0.02, 0.84], [0.02, 0.64],
  [0.12, 0.5], [0.5, 0.5], [0.6, 0.36], [0.6, 0.16], [0.5, 0], [0.12, 0], [0.02, 0.16],
];

const U_PATH = [
  [0.02, 1], [0.02, 0.29],
  ...arc(0.31, 0.29, 0.29, Math.PI, Math.PI * 2, 14).slice(1),
  [0.6, 1],
];

const D_PATH = [
  [0.02, 0], [0.02, 1], [0.28, 1],
  ...cubic([0.28, 1], [0.62, 0.92], [0.62, 0.08], [0.28, 0], 14).slice(1),
  [0.02, 0],
];

const LETTER_STROKES = {
  S: [S_PATH],
  T: [[[0, 1], [0.62, 1]], [[0.31, 1], [0.31, 0]]],
  U: [U_PATH],
  D: [D_PATH],
  I: [[[0.31, 0], [0.31, 1]]],
  O: [ellipse(0.31, 0.5, 0.29, 0.5, 26)],
};

const STUDIO = ['S', 'T', 'U', 'D', 'I', 'O'];

function letter2d(letter, x0) {
  const scaleX = LOGO.wordGlyph / 0.62;
  return LETTER_STROKES[letter].map((stroke) => stroke.map(([px, py]) => [
    x0 + px * scaleX,
    LOGO.wordBottom + py * LOGO.wordCap,
  ]));
}

/* --------------------------------------------------------------------------
   Line geometry
   -------------------------------------------------------------------------- */

function makeData() {
  return { pos: [], other: [], tip: [], seed: [], dur: [], tint: [] };
}

function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function pushSegment(data, a, b, t0, t1, tint) {
  data.pos.push(a[0], a[1], 0, b[0], b[1], 0);
  data.other.push(b[0], b[1], 0, a[0], a[1], 0);
  data.tip.push(0, 1);
  data.seed.push(t0, t0);
  data.dur.push(Math.max(0.0001, t1 - t0), Math.max(0.0001, t1 - t0));
  data.tint.push(tint, tint);
}

function pushPolyline(data, points, t0, t1, tint) {
  if (points.length < 2) return;
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const len = distance(points[i - 1], points[i]);
    lengths.push(len);
    total += len;
  }
  if (total <= 0) return;
  let covered = 0;
  for (let i = 1; i < points.length; i += 1) {
    const len = lengths[i - 1];
    const a = t0 + (covered / total) * (t1 - t0);
    const b = t0 + ((covered + len) / total) * (t1 - t0);
    pushSegment(data, points[i - 1], points[i], a, b, tint);
    covered += len;
  }
}

function buildGeometry(data) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(data.pos, 3));
  geo.setAttribute('aOther', new THREE.Float32BufferAttribute(data.other, 3));
  geo.setAttribute('aTip', new THREE.Float32BufferAttribute(data.tip, 1));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(data.seed, 1));
  geo.setAttribute('aDur', new THREE.Float32BufferAttribute(data.dur, 1));
  geo.setAttribute('aTint', new THREE.Float32BufferAttribute(data.tint, 1));
  geo.computeBoundingSphere();
  return geo;
}

function toLocal(x, y) {
  return [LEFT + x * SCALE, TOP - y * SCALE];
}

function glyphContours(glyph, close = true) {
  return parseSvgPath(glyph.d).map((sub) => {
    const points = sub.points.map(([x, y]) => toLocal(x + glyph.dx, y));
    if (close && sub.closed && points.length > 1) points.push(points[0]);
    return points;
  });
}

/* "Double H" first, then the official side rules and the monoline STUDIO. */
export function buildLogoLineGeometry() {
  const data = makeData();

  GLYPHS.forEach((glyph) => {
    glyphContours(glyph).forEach((points) => {
      pushPolyline(data, points, glyph.start, glyph.end, glyph.tint);
    });
  });

  STUDIO.forEach((letter, i) => {
    const x0 = LOGO.wordStart + i * LOGO.wordAdvance;
    const start = 0.46 + i * 0.042;
    const end = Math.min(0.88, start + 0.19);
    const strokes = letter2d(letter, x0);
    const totalLen = strokes.reduce((sum, stroke) => {
      let n = 0;
      for (let j = 1; j < stroke.length; j += 1) n += distance(stroke[j - 1], stroke[j]);
      return sum + n;
    }, 0);
    let covered = 0;
    strokes.forEach((stroke) => {
      let len = 0;
      for (let j = 1; j < stroke.length; j += 1) len += distance(stroke[j - 1], stroke[j]);
      const a = start + (covered / Math.max(totalLen, 1e-6)) * (end - start);
      const b = start + ((covered + len) / Math.max(totalLen, 1e-6)) * (end - start);
      pushPolyline(data, stroke, a, b, 0.93);
      covered += len;
    });
  });

  pushPolyline(data, [[LOGO.ruleLeft, LOGO.ruleY], [-LOGO.ruleInner, LOGO.ruleY]], 0.78, 0.88, 0.72);
  pushPolyline(data, [[LOGO.ruleInner, LOGO.ruleY], [LOGO.ruleRight, LOGO.ruleY]], 0.8, 0.9, 0.72);

  return buildGeometry(data);
}

/* Faint construction hairlines: the screen frame, the wordmark box, the
   baselines and centre axes. These are what make the camera screen read as a
   built-in display rather than a floating poster. */
export function buildGuideGeometry() {
  const data = makeData();
  const x = 0.066;
  const y = 0.041;
  const baseline = LOGO.topBaseline;
  const wordTop = LOGO.wordBottom + LOGO.wordCap;
  const ruleBandTop = LOGO.ruleY + 0.003;

  pushPolyline(data, [[-x, -y], [x, -y], [x, y], [-x, y], [-x, -y]], 0.0, 0.12, 0.03);
  pushPolyline(data, [[-x, TOP - 0.002], [x, TOP - 0.002], [x, BOTTOM + 0.002], [-x, BOTTOM + 0.002], [-x, TOP - 0.002]], 0.02, 0.16, 0.03);
  pushPolyline(data, [[-x, baseline], [x, baseline]], 0.06, 0.19, 0.03);
  pushPolyline(data, [[-x, LOGO.ruleY], [x, LOGO.ruleY]], 0.09, 0.22, 0.03);
  pushPolyline(data, [[-x, wordTop], [x, wordTop]], 0.12, 0.25, 0.03);
  pushPolyline(data, [[0, -y], [0, y]], 0.1, 0.24, 0.03);
  pushPolyline(data, [[-x, ruleBandTop], [x, ruleBandTop]], 0.14, 0.27, 0.03);

  const tick = 0.006;
  [
    [[-x, -y], [-x + tick, -y]], [[-x, -y], [-x, -y + tick]],
    [[x, -y], [x - tick, -y]], [[x, -y], [x, -y + tick]],
    [[-x, y], [-x + tick, y]], [[-x, y], [-x, y - tick]],
    [[x, y], [x - tick, y]], [[x, y], [x, y - tick]],
  ].forEach(([a, b], i) => pushPolyline(data, [a, b], 0.16 + i * 0.008, 0.22 + i * 0.008, 0.03));

  return buildGeometry(data);
}

/* Solid official letterforms, kept very low-opacity so the outline stays the
   hero. The holes in D/O/B are preserved by ShapeGeometry. */
export function buildLogoFillGeometries() {
  const geos = [];

  GLYPHS.forEach((glyph) => {
    const contours = glyphContours(glyph, false);
    if (!contours.length) return;
    const outer = contours[0].map(([x, y]) => new THREE.Vector2(x, y));
    const shape = new THREE.Shape(outer);
    for (let i = 1; i < contours.length; i += 1) {
      shape.holes.push(new THREE.Path(contours[i].map(([x, y]) => new THREE.Vector2(x, y))));
    }
    const geo = new THREE.ShapeGeometry(shape, 8);
    const pos = geo.getAttribute('position');
    const colors = [];
    for (let i = 0; i < pos.count; i += 1) {
      const t = THREE.MathUtils.clamp((pos.getY(i) - BOTTOM) / LOGO.h, 0, 1);
      colors.push(
        THREE.MathUtils.lerp(0.008, 0.2, t),
        THREE.MathUtils.lerp(0.09, 0.9, t),
        THREE.MathUtils.lerp(0.08, 0.84, t),
      );
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geos.push(geo);
  });

  return geos;
}
