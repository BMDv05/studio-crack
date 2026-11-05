/* The real room, built from nothing.

   This is the first thing the opening shows, from an empty stage. Every line of a
   measured drawing has a start and a length of its own and grows from one end, floor
   first, then the structure, then the gear, largest to smallest. Behind the finished
   drawing the room comes out of the dark, unlit and without colour, then its materials,
   then the lights one at a time.
   Everything lies on the photograph exactly: the drawing is a vector trace of it, drawn
   here at the screen's own resolution so its lines stay hairlines, and the unlit room
   is the photograph itself, exposed down. A depth map gives the order of things, back
   to front.

   Everything is a function of one number, 0..1. At 1 every pass has landed on the
   untouched photograph, which is what StudioPlates shows from there on. */

import { clamp01, smoothstep } from "./studioMath.js";

export const MORPH_MAPS = {
  depth: "/hero/plates/morph-depth.webp",
  lights: "/hero/plates/morph-lights.webp",
  ceiling: "/hero/plates/morph-ceiling.webp",
};
export const MORPH_DRAWING = "/hero/plates/morph-lines.json";

/* The order of the build, as parts of the morph. They overlap, so nothing waits for
   anything else to finish. */
const BEAT = {
  lines: [0, 0.469],
  surface: [0.458, 0.718],
  colour: [0.616, 0.834],
  ceiling: [0.732, 0.862],
  left: 0.841,
  right: 0.877,
  fill: [0.898, 0.985],
  fog: [0.689, 0.935],
};

/* How far back the camera starts. */
const PUSH_FROM = 0.95;
/* The width of a line, in the drawing's texture pixels. */
const LINE_WIDTH = 1.15;
/* Traced lines this long, in the drawing's own units, are the room, not an object in it. */
const LONG_LINE = 140;
/* How close two ends must be to belong to one object. */
const TOUCH = 5;

const VERTEX = `
attribute vec2 corner;
varying vec2 vUv;
void main() {
  vUv = vec2(corner.x * 0.5 + 0.5, 0.5 - corner.y * 0.5);
  gl_Position = vec4(corner, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D photo, drawing, depth, lights, ceiling;
uniform vec2 res, origin, size;
uniform float uPush, uFrom, uTop, uSurface, uColour, uCeiling, uLeft, uRight, uFill;
uniform float uPulseL, uPulseR, uFog, uFade;

/* Reached once the front has passed this point in the order of things. */
float reached(float front, float order, float soft) {
  return smoothstep(order - soft, order + soft, front * (1.0 + 2.0 * soft) - soft);
}

void main() {
  vec2 final = (vUv * res - origin) / size;
  /* The camera pushes in toward the floor line. */
  const vec2 anchor = vec2(0.5, 1.0);
  vec2 raw = anchor + (final - anchor) / mix(uFrom, 1.0, uPush);
  /* What the camera sees past the picture's edge is more of the dark ceiling. */
  vec2 uv = abs(raw);
  uv.x = 1.0 - abs(1.0 - uv.x);
  float past = smoothstep(0.0, 0.016, -raw.y);
  /* A phone's photograph fades out at the top and bottom, as its plate does. */
  float inside = mix(1.0, smoothstep(0.0, 0.07, raw.y) * (1.0 - smoothstep(0.88, 1.0, raw.y)), uFade);
  uv = clamp(uv, 0.0, 1.0);
  float order = pow(texture2D(depth, uv).r, 0.72);

  /* ---- the room out of the dark, back to front, with no edge to its arrival ---- */
  float surface = reached(uSurface, order, 0.16);

  /* ---- materials, spreading over it ---- */
  float colour = reached(uColour, order, 0.24);

  /* ---- light: a partition of what each pixel gets, so all on is the photograph ---- */
  vec3 share = texture2D(lights, uv).rgb;
  float fillShare = max(0.0, 1.0 - share.r - share.g - share.b);
  float spot = smoothstep(0.0, 0.14, uCeiling * 1.14 - texture2D(ceiling, uv).r);
  float level = 0.32 + 0.68 * (uLeft * share.r + uRight * share.g + spot * share.b + uFill * fillShare);
  level += 0.42 * (uPulseL * share.r + uPulseR * share.g);

  /* The same room before it has a colour or a light of its own: a very low exposure,
     its highlights held back, in the drawing's tint. */
  vec3 photograph = texture2D(photo, uv).rgb;
  float exposure = dot(photograph, vec3(0.3, 0.59, 0.11));
  exposure = exposure / (exposure + 0.42) * 1.42;
  vec3 unlit = exposure * vec3(0.27, 0.34, 0.335) + vec3(0.006, 0.014, 0.014);
  vec3 col = mix(unlit, photograph * level, colour);

  /* The room's first lights bloom for a moment as they strike. */
  col += vec3(1.0, 0.82, 0.62) * (uPulseL * share.r * share.r + uPulseR * share.g * share.g) * 0.2;
  /* The air is thick until the lights have cleared it. */
  col = mix(col, vec3(0.018, 0.058, 0.055), uFog * (1.0 - order) * 0.26);
  col *= 1.0 - past * 0.94;

  /* ---- the drawing, as far as the pen has got ---- */
  vec2 sheet = vec2(raw.x, (raw.y + uTop) / (1.0 + uTop));
  vec3 draft = texture2D(drawing, clamp(sheet, 0.0, 1.0)).rgb;
  float ink = 1.0 - colour;
  float lineAlpha = draft.r * ink * mix(1.0, 0.36, surface) + draft.g * ink * (1.0 - surface);

  float alpha = surface * inside;
  vec3 stage = vec3(0.024, 0.063, 0.059);
  gl_FragColor = vec4(col * alpha + stage * (1.0 - alpha)
    + vec3(0.84, 1.0, 0.96) * lineAlpha * inside, 1.0);
}`;

const bump = (x, centre, width) => Math.exp(-(((x - centre) / width) ** 2));

/* A rig striking: on, a stumble, on for good, and a surge that settles. */
function strike(m, at) {
  const on = smoothstep(at, at + 0.004, m);
  const stumble = 0.8 * bump(m, at + 0.009, 0.0035);
  const settled = smoothstep(at + 0.011, at + 0.03, m);
  return { value: on * (1 - stumble * (1 - settled)), pulse: on * bump(m, at + 0.02, 0.024) };
}

const beat = (m, [from, to]) => clamp01((m - from) / (to - from));

const strokeLength = ([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1);

/* Strokes that touch belong to one object: a stand, a light, a camera. */
function objectsOf(segments) {
  const parent = segments.map((_, i) => i);
  const find = (start) => {
    let i = start;
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const cells = new Map();
  segments.forEach(([x1, y1, x2, y2], i) => {
    for (const [x, y] of [[x1, y1], [x2, y2]]) {
      const cx = Math.floor(x / TOUCH);
      const cy = Math.floor(y / TOUCH);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const other = cells.get(`${cx + dx},${cy + dy}`);
          if (other !== undefined) parent[find(i)] = find(other);
        }
      }
      cells.set(`${cx},${cy}`, i);
    }
  });
  const groups = new Map();
  segments.forEach((segment, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(segment);
  });
  return [...groups.values()];
}

/* Give every stroke of the traced drawing a seed and a duration: the floor, then the
   room's long lines from the back outwards, then its objects, largest first, each rising
   from the floor up. */
function planStrokes(art) {
  const strokes = [];
  const add = ([ax, ay, bx, by, level], seed, dur, channel) => {
    const rising = ay >= by;
    strokes.push({
      x1: rising ? ax : bx,
      y1: rising ? ay : by,
      x2: rising ? bx : ax,
      y2: rising ? by : ay,
      seed,
      dur,
      channel,
      key: Math.round(level * 16),
    });
  };

  const middle = art.w / 2;
  const grid = [...art.grid].sort((a, b) => Math.abs(a[0] - middle) - Math.abs(b[0] - middle));
  grid.forEach((segment, i) => add(segment, (i / grid.length) * 0.07, 0.07, 1));

  const reach = ([x1, y1, x2, y2]) => Math.hypot((x1 + x2) / 2 - middle, (y1 + y2) / 2 - art.h / 2);
  const long = art.lines.filter((segment) => strokeLength(segment) >= LONG_LINE);
  long
    .sort((a, b) => reach(a) - reach(b))
    .forEach((segment, i) => add(segment, 0.08 + (i / long.length) * 0.2, 0.09, 0));

  const objects = objectsOf(art.lines.filter((segment) => strokeLength(segment) < LONG_LINE))
    .map((segments) => ({
      segments: segments.sort((a, b) => Math.max(b[1], b[3]) - Math.max(a[1], a[3])),
      size: segments.reduce((sum, segment) => sum + strokeLength(segment), 0),
    }))
    .sort((a, b) => b.size - a.size);
  const total = objects.reduce((sum, object) => sum + object.size, 0);
  let spent = 0;
  for (const { segments, size } of objects) {
    const seed = 0.26 + (spent / total) * 0.68;
    const span = (size / total) * 0.68 + 0.03;
    segments.forEach((segment, i) => add(segment, seed + (i / segments.length) * span, 0.03, 0));
    spent += size;
  }
  return strokes;
}

/* The drawing as far as t, on a canvas of its own: its lines in red and the floor grid
   in green, added, so the shader can let them go separately. */
function paintDrawing(target, art, strokes, t) {
  const { width, height } = target;
  const ctx = target.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "lighter";
  const k = width / art.w;
  ctx.setTransform(k, 0, 0, k, 0, art.top * k);
  ctx.lineWidth = LINE_WIDTH / k;
  ctx.lineCap = "butt";
  /* One path per weight of line, not one per line. */
  const paths = new Map();
  for (const { x1, y1, x2, y2, seed, dur, channel, key } of strokes) {
    const grown = clamp01((t - seed) / dur);
    if (grown <= 0) continue;
    const id = channel * 32 + key;
    let path = paths.get(id);
    if (!path) {
      path = new Path2D();
      paths.set(id, path);
    }
    path.moveTo(x1, y1);
    path.lineTo(x1 + (x2 - x1) * grown, y1 + (y2 - y1) * grown);
  }
  for (const [id, path] of paths) {
    const v = Math.min(255, Math.round(((id % 32) / 16) * 255));
    ctx.strokeStyle = id >= 32 ? `rgb(0,${v},0)` : `rgb(${v},0,0)`;
    ctx.stroke(path);
  }
}

/* images: { photo, depth, lights, ceiling }, art: the traced drawing. Null if WebGL
   cannot do it, in which case the caller goes without the passes. */
export function createRoomMorph(canvas, images, art) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.bindAttribLocation(program, 0, "corner");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  const texture = (name, unit, source) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, name), unit);
  };
  const names = Object.keys(images);
  names.forEach((name, unit) => texture(name, unit, images[name]));

  const sheet = document.createElement("canvas");
  const drawingUnit = names.length;
  const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const strokes = planStrokes(art);
  let drawn = "";
  let inked = 0;

  const at = {};
  const uniform = (name) => {
    if (!(name in at)) at[name] = gl.getUniformLocation(program, name);
    return at[name];
  };
  gl.uniform1f(uniform("uTop"), art.top / art.h);

  return {
    /* frame: { width, height (CSS px), ratio, x, y, w, h (the photograph in CSS px),
       fade (1 where its top and bottom fade out) } */
    resize(frame) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniform("res"), frame.width, frame.height);
      gl.uniform2f(uniform("origin"), frame.x, frame.y);
      gl.uniform2f(uniform("size"), frame.w, frame.h);
      gl.uniform1f(uniform("uFade"), frame.fade);
      /* Never so far back that the sides of the photograph come into frame. */
      gl.uniform1f(uniform("uFrom"), Math.min(1, Math.max(PUSH_FROM, (frame.width / frame.w) * 1.03)));

      /* One line of the drawing is one pixel of the screen. */
      const width = Math.min(maxSize, Math.round(frame.w * frame.ratio));
      const height = Math.round((width * (art.h + art.top)) / art.w);
      const key = `${width}x${height}`;
      if (key !== drawn) {
        drawn = key;
        sheet.width = width;
        sheet.height = height;
        paintDrawing(sheet, art, strokes, inked);
        texture("drawing", drawingUnit, sheet);
      }
    },
    draw(m) {
      if (gl.isContextLost()) return;
      const left = strike(m, BEAT.left);
      const right = strike(m, BEAT.right);
      const pen = beat(m, BEAT.lines);
      if (pen !== inked) {
        inked = pen;
        paintDrawing(sheet, art, strokes, pen);
        gl.activeTexture(gl.TEXTURE0 + drawingUnit);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, sheet);
      }
      gl.uniform1f(uniform("uPush"), smoothstep(0, 0.966, m));
      gl.uniform1f(uniform("uSurface"), beat(m, BEAT.surface));
      gl.uniform1f(uniform("uColour"), beat(m, BEAT.colour));
      gl.uniform1f(uniform("uCeiling"), beat(m, BEAT.ceiling));
      gl.uniform1f(uniform("uLeft"), left.value);
      gl.uniform1f(uniform("uRight"), right.value);
      gl.uniform1f(uniform("uPulseL"), left.pulse);
      gl.uniform1f(uniform("uPulseR"), right.pulse);
      gl.uniform1f(uniform("uFill"), smoothstep(BEAT.fill[0], BEAT.fill[1], m));
      gl.uniform1f(uniform("uFog"), 1 - smoothstep(BEAT.fog[0], BEAT.fog[1], m));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
