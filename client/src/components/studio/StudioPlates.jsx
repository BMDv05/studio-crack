/* The photographic half of the studio opening.

   The opening builds the real room from nothing through the passes of a CG shot (see
   roomMorph.js), and lands on this composite, the way a shot is built from plates in a
   compositor:

     room      the studio photograph with the opening's one camera baked in on
               both tripods, pushed in with a 2.5D camera move
     camera    that same camera as its own layer, at the exact spot it has in
               the room; the room racks out of focus
     screen    the Double H mark drawn on that camera's screen by scroll
     dive      the same push carries on into the O of the mark. Its round counter
               is a way through: a real lens front sits in it, fitting it like a
               rim, and the letters fly out of frame around it as the screen
               goes dark
     lens      still the same move, down the lens's axis to the closed iris: one
               shot from the room to the iris, with no cut in it
     iris      the blades of that lens, cut from its photograph, opening onto
               the finished hero, a picture of its own (see lensIris.js)

   Everything is a pure function of the scroll values passed to update(): no
   clocks, and scrolling back plays it in exact reverse.

   Each layer is laid out at the size where one image pixel is one device pixel
   and is then only transformed, so the compositor does the work and a layer
   that is about to be enlarged is never rasterised small.

   If any plate fails to load, onFail is called and the opening is the still hero.

   Photo sources (Pexels, free for commercial use, edited):
     camera  https://www.pexels.com/photo/black-dslr-camera-displaying-man-in-blue-shirt-2480401/
             (brand name and the portrait on the screen removed, background cut)
     lens    https://www.pexels.com/photo/photo-of-black-camera-lens-3616964/
             (lens-close.webp is its middle, super-resolved with Real-ESRGAN) */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Wordmark } from "../Wordmark.jsx";
import { FINALE, clamp01, mix, smoothstep } from "./studioMath.js";
import { MORPH_DRAWING, MORPH_MAPS, createRoomMorph } from "./roomMorph.js";
import {
  HOLE_CLOSED,
  HOLE_OPEN,
  LENS_CLOSE,
  LENS_GLASS_RADIUS,
  LENS_HOLE,
  drawIris,
} from "./lensIris.js";
import s from "./StudioPlates.module.css";

const SRC = {
  room: "/hero/plates/room.webp",
  soft: "/hero/plates/room-soft.webp",
  camera: "/hero/plates/camera.webp",
  lens: "/hero/plates/lens.webp",
  lensClose: "/hero/plates/lens-close.webp",
  /* The picture the iris opens onto: it has to be there by the first open pixel. */
  hero: "/hero/hero-stage.webp",
  ...MORPH_MAPS,
};

/* Room photograph, in its own pixels. */
const ROOM = { w: 1807, h: 870 };
/* The screen of the room's hero camera: the point the push travels to. */
const TARGET = { x: 1180, y: 453.7 };
/* Where the cut-out camera sits in the room, and how wide its body is. The room
   photograph has this same camera baked in at this exact spot, so the push ends
   on the camera it started on. */
const CAMERA = { x: 1112.6, y: 409, w: 151.2, h: 127.5, body: 103 };
const CAMERA_PX = { w: 1687, h: 1423 };
/* The camera's screen inside the cut-out, as fractions of that image. */
export const SCREEN = { left: 0.253, top: 0.2205, width: 0.3838, height: 0.2603 };
const SCREEN_CX = SCREEN.left + SCREEN.width / 2;
const SCREEN_CY = SCREEN.top + SCREEN.height / 2;
const SCREEN_HALF_H = (SCREEN.height * CAMERA_PX.h) / CAMERA_PX.w / 2;

/* The wordmark on that screen, and the counter of its O, in viewBox units. */
const MARK = { w: 264, h: 72, ofScreen: 0.62 };
const COUNTER = { x: 61.6, y: 28.7, r: 10.2 };
/* The O's place among the shapes of the wordmark. */
const O_SHAPE = 1;
/* The same, in widths of the camera, from the centre of the screen. */
const MARK_W = MARK.ofScreen * SCREEN.width;
const COUNTER_DX = ((COUNTER.x - MARK.w / 2) / MARK.w) * MARK_W;
const COUNTER_DY = ((COUNTER.y - MARK.h / 2) / MARK.w) * MARK_W;
const COUNTER_R = (COUNTER.r / MARK.w) * MARK_W;

/* The lens plate: glass centred, sizes as fractions of the image width. */
const LENS_PX = 2800;
const LENS_OUTER = 0.497;
const LENS_GLASS = 0.232;
/* Must match the aperture centre of the DOM crossing. */
const LENS_CENTER_Y = 0.45;

/* The morph's last stretch: the photograph is in place under it, and it lets go. */
const MORPH_LANDS = [0.972, 1];

/* The beats of this composite, as finale progress. The iris gets the longest
   stretch of the shot, and is clear of the corners before the header returns
   at 0.97. The 3D finale, the fallback for a failed plate, keeps FINALE. */
const BEAT = {
  logoEnd: 0.5,
  diveStart: 0.515,
  diveEnd: 0.67,
  lensPush: 0.6,
  pushEnd: 0.79,
  irisFade: 0.786,
  irisStart: 0.8,
  irisEnd: 0.965,
};

/* The background is further away, so it grows less than the camera does. */
const DIVE_PARALLAX = 0.35;
/* How much of the frame the screen's edge is past when the camera may go. */
const SCREEN_MARGIN = 1.04;
/* The dive ends with the counter this far past the frame's far corner, so the
   letters leave at speed instead of slowing down on their way out. */
const THROUGH_MARGIN = 1.5;
/* How much of the counter the lens's barrel fills, and how much of the dive's
   growth it takes: being further in, it grows less, and the O outruns it. */
const LENS_FIT = 0.94;
const LENS_DEPTH = 0.78;
/* The glass's width when the push comes to rest, of the longer side of the frame. */
const LENS_REST = 0.42;
/* The lens opening is drawn this much wider than the counter: the letter on top
   of it gives the exact shape. */
const OPENING_OVER = 1.14;
/* The order of things on the way in, in the dive's zoom: the drawn mark takes
   over from the one on the screen, and only then the O opens. */
const MARK_TAKES_OVER = [1, 1.18];
const DOM_MARK_LEAVES = [1.18, 1.34];
const COUNTER_OPENS = [1.3, 1.85];
const READOUTS_PASS = [1.6, 2.6];
const SCREEN_DETAIL = [1.5, 3];
const GRID_OPACITY = 0.16;
/* The dark, and the letters losing their light, as parts of the whole dive. */
const GO_DARK = [0.44, 0.74];
const INK_DARK = [0.4, 0.78];
const INK = { lit: [233, 251, 247], edge: [157, 243, 230], mid: [38, 98, 91], off: [10, 20, 19] };
/* The letters' lit edge keeps this width on screen, in CSS pixels. */
const INK_EDGE = 0.7;
/* How far from a corner of the mark's outline its rounding reaches, in viewBox
   units: enough to turn the short segments of a curve into a curve, and no more
   than a trace of the mark's own soft corners on its long straight edges. */
const OUTLINE_ROUND = 2.6;

/* The light goes out through the page's own teal, never through grey. */
const inkAt = (from, t) => {
  const a = t < 0.5 ? from : INK.mid;
  const b = t < 0.5 ? INK.mid : INK.off;
  const u = t < 0.5 ? t * 2 : t * 2 - 1;
  return `rgb(${Math.round(mix(a[0], b[0], u))},${Math.round(mix(a[1], b[1], u))},${Math.round(mix(a[2], b[2], u))})`;
};

/* The O is the one letter that fills the frame, and the lens sits in it: it is
   drawn as the true rings its trace stands for, at the trace's own extents. */
function ringsOfO() {
  const path = new Path2D();
  const ring = (x, y, rx, ry) => {
    /* Its own subpath: otherwise a line joins the rings, and the edge shows it. */
    path.moveTo(x + rx, y);
    path.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    path.closePath();
  };
  ring(61.66, 28.95, 16.95, 16.51);
  ring(COUNTER.x, COUNTER.y, 10, 10.37);
  return path;
}

/* The wordmark's letters are traced as short straight segments, which is fine at
   its usual size but shows as facets once a letter fills the frame. */
function roundedOutline(d) {
  if (/[^MLZ\s\d.,-]/.test(d)) return new Path2D(d);
  const path = new Path2D();
  for (const part of d.split("M").slice(1)) {
    const n = part.match(/-?\d*\.?\d+/g).map(Number);
    const pts = [];
    for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
    const last = pts[pts.length - 1];
    if (pts.length > 1 && last[0] === pts[0][0] && last[1] === pts[0][1]) pts.pop();
    const towards = (a, b) => {
      const t = Math.min(0.5, OUTLINE_ROUND / Math.hypot(b[0] - a[0], b[1] - a[1]));
      return [mix(a[0], b[0], t), mix(a[1], b[1], t)];
    };
    pts.forEach((v, i) => {
      const enter = towards(v, pts[(i + pts.length - 1) % pts.length]);
      const leave = towards(v, pts[(i + 1) % pts.length]);
      if (i === 0) path.moveTo(enter[0], enter[1]);
      else path.lineTo(enter[0], enter[1]);
      path.quadraticCurveTo(v[0], v[1], leave[0], leave[1]);
    });
    path.closePath();
  }
  return path;
}

const smoother = (a, b, v) => {
  const t = clamp01((v - a) / (b - a || 1e-6));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

function measure() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const aspect = vw / Math.max(1, vh);
  const cover = Math.max(vw / ROOM.w, vh / ROOM.h);
  /* A tall screen would crop the room down to its backdrop, with both cameras
     out of frame. It keeps the width that holds them instead; the top and
     bottom of the photograph fade into the dark stage. */
  const base = aspect < 0.85 ? Math.min(cover, vw / (ROOM.w * 0.36)) : cover;
  const body = aspect < 1 ? vw * 0.94 : Math.min(vw * 0.62, vh * 1.15);
  const end = body / CAMERA.body;
  const vmax = Math.max(vw, vh);
  /* Where the push stops: the glass and its rings in frame, and sharp. Any closer
     and the frame is only the photograph's defocused reflections.
     From here the lens keeps moving through the iris, until the barrel has left the
     far corner of the frame. */
  const lensClose = (vmax * LENS_REST) / LENS_GLASS;
  const glassClose = (lensClose / LENS_PX) * LENS_GLASS_RADIUS;
  const corner = Math.hypot(vw / 2, vh * (1 - LENS_CENTER_Y));
  /* The camera's width when the mark has settled, and the counter at that size. */
  const settled = end * CAMERA.w;
  const counter = COUNTER_R * settled;
  /* The screen covers the frame once its nearest edge, seen from the O, is past
     the edge of the frame on either axis. */
  const screenFills =
    (SCREEN_MARGIN *
      Math.max(
        vw / 2 / (SCREEN.width / 2 + COUNTER_DX),
        (vh * (1 - LENS_CENTER_Y)) / (SCREEN_HALF_H - Math.abs(COUNTER_DY)),
      )) /
    settled;
  const lensStart = (LENS_FIT * counter) / (LENS_OUTER / 2);
  return {
    corner,
    counter,
    screenFills,
    lensStart,
    through: (corner * THROUGH_MARGIN) / counter,
    lensClose,
    irisZoom: Math.max(1.05, (corner * 1.12) / glassClose),
    irisRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    vw,
    vh,
    dpr,
    cover,
    base,
    end,
    mid: end * 0.8,
    cameraW: CAMERA_PX.w / dpr,
    lensW: LENS_PX / dpr,
    lensCloseW: LENS_CLOSE.px / dpr,
    vmax,
  };
}

function preload(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const done = () => resolve(img);
    img.onload = () => (img.decode ? img.decode().then(done, done) : done());
    img.onerror = reject;
    img.src = src;
  });
}

/* Holds the hole on a point, by default the axis of the frame, at any size of the
   lens. */
function lensPosition(m, size, cx = m.vw / 2, cy = m.vh * LENS_CENTER_Y) {
  const k = size / LENS_PX;
  return {
    k,
    x: cx - LENS_HOLE.x * k,
    y: cy - LENS_HOLE.y * k,
  };
}

const StudioPlates = forwardRef(function StudioPlates({ stageRef, irisRef, progress, onFail }, ref) {
  const [ready, setReady] = useState(false);
  const [metrics, setMetrics] = useState(null);

  const rootRef = useRef(null);
  const morphRef = useRef(null);
  const failRef = useRef(onFail);
  failRef.current = onFail;
  const softRef = useRef(null);
  const roomRef = useRef(null);
  const dimRef = useRef(null);
  const cameraRef = useRef(null);
  const planeRef = useRef(null);
  const blackRef = useRef(null);
  const throughRef = useRef(null);
  const lensRef = useRef(null);
  const lensCloseRef = useRef(null);
  const markRef = useRef(null);
  const screenRef = useRef(null);
  const gridRef = useRef(null);
  const sheenRef = useRef(null);
  const logoRef = useRef(null);
  const hudRef = useRef(null);
  const tcRef = useRef(null);

  const live = useRef({ ready: false, m: null, strokes: [], cache: new Map(), tc: "" });

  /* Writes only what changed; a hidden layer leaves the compositor. */
  const write = useCallback((el, opacity, transform) => {
    if (!el) return;
    const { cache } = live.current;
    let last = cache.get(el);
    if (!last) {
      last = { o: "", t: "", v: "" };
      cache.set(el, last);
    }
    const o = opacity.toFixed(3);
    if (o !== last.o) {
      last.o = o;
      el.style.opacity = o;
    }
    const v = opacity < 0.002 ? "hidden" : "visible";
    if (v !== last.v) {
      last.v = v;
      el.style.visibility = v;
    }
    if (transform && v === "visible" && transform !== last.t) {
      last.t = transform;
      el.style.transform = transform;
    }
  }, []);

  /* Repaints only when the frame changes; off-stage it costs nothing. */
  const paintIris = useCallback(
    (f, m) => {
      const state = live.current;
      const canvas = irisRef?.current;
      if (!canvas) return;
      const fade = smoothstep(BEAT.irisFade, BEAT.irisStart, f);
      const t = clamp01((f - BEAT.irisStart) / (BEAT.irisEnd - BEAT.irisStart));
      const on = fade > 0 && t < 1;
      if (on !== state.irisOn) {
        state.irisOn = on;
        canvas.style.display = on ? "block" : "none";
      }
      if (!on) return;

      const opacity = fade.toFixed(3);
      if (opacity !== state.irisOpacity) {
        state.irisOpacity = opacity;
        canvas.style.opacity = opacity;
      }
      const key = `${t.toFixed(4)}|${canvas.width}`;
      if (key === state.irisKey) return;
      state.irisKey = key;

      const ctx = canvas.getContext("2d");
      if (!ctx || !state.lensImage) return;
      if (!state.lensPattern) {
        state.lensPattern = ctx.createPattern(state.lensImage, "no-repeat");
      }
      /* The hole grows at a constant rate of its own size, slowly at first
         out of the black of the photograph and quickly once it is wide. */
      const hole = HOLE_CLOSED * (HOLE_OPEN / HOLE_CLOSED) ** (t ** 0.7);
      const size = m.lensClose * m.irisZoom ** smoothstep(0, 1, t);
      const pos = lensPosition(m, size);
      drawIris(ctx, state.lensPattern, {
        ratio: m.irisRatio,
        width: m.vw,
        height: m.vh,
        x: pos.x,
        y: pos.y,
        scale: pos.k,
        hole,
        reveal: smoothstep(0, 0.12, t),
        metal: smoothstep(0.02, 0.34, t),
      });
    },
    [irisRef],
  );

  /* The wordmark at the size the dive has reached, with its O on (x, y). */
  const paintMark = useCallback((m, on, x, y, unit, alpha, inkOff) => {
    const state = live.current;
    const canvas = markRef.current;
    if (!canvas) return;
    if (on !== state.markOn) {
      state.markOn = on;
      canvas.style.display = on ? "block" : "none";
    }
    if (!on) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(m.irisRatio, 0, 0, m.irisRatio, 0, 0);
    ctx.clearRect(0, 0, m.vw, m.vh);
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(unit, unit);
    ctx.translate(-COUNTER.x, -COUNTER.y);
    ctx.fillStyle = inkAt(INK.lit, inkOff);
    ctx.strokeStyle = inkAt(INK.edge, inkOff);
    ctx.lineWidth = INK_EDGE / unit;
    for (const path of state.markPaths) {
      ctx.fill(path, "evenodd");
      ctx.stroke(path);
    }
  }, []);

  const update = useCallback(
    (f, morph = 0) => {
      const state = live.current;
      const m = state.m;
      if (!state.ready || !m) return;

      const stage = stageRef.current;
      if (stage && !stage.hasAttribute("data-plates-full")) {
        stage.toggleAttribute("data-plates-full", true);
      }
      /* The iris is opaque around its hole from here on, and the finished hero
         lies behind it: nothing in this stack can be seen any more, so it leaves
         the compositor for the rest of the page. */
      const irisOpaque = f >= BEAT.irisStart;
      if (stage && stage.hasAttribute("data-iris") !== irisOpaque) {
        stage.toggleAttribute("data-iris", irisOpaque);
      }
      paintIris(f, m);
      write(rootRef.current, irisOpaque ? 0 : 1);
      if (irisOpaque) return;

      /* ---- the room building itself, onto the photograph underneath -------- */
      const passes = state.morph;
      const landed = morph >= 1;
      const morphCanvas = morphRef.current;
      if (morphCanvas && landed !== state.morphLanded) {
        state.morphLanded = landed;
        morphCanvas.style.display = landed || !passes ? "none" : "block";
      }
      if (passes && !landed) {
        const key = morph.toFixed(5);
        if (key !== state.morphKey) {
          state.morphKey = key;
          passes.draw(morph);
          morphCanvas.style.opacity = (1 - smoothstep(MORPH_LANDS[0], MORPH_LANDS[1], morph)).toFixed(3);
        }
      }
      /* Without WebGL for the passes, the photograph simply fades in. */
      const roomOn = passes ? (morph >= MORPH_LANDS[0] ? 1 : 0) : smoothstep(0, 1, morph);

      /* ---- the push: constant-feeling zoom, no stop between the two spans */
      const dolly = smoother(FINALE.hold, FINALE.dollyEnd + 0.03, f);
      const creep = smoothstep(FINALE.logoStart - 0.01, BEAT.logoEnd, f);
      const scale = Math.exp(
        Math.log(m.base) +
          dolly * Math.log(m.mid / m.base) +
          creep * Math.log(m.end / m.mid),
      );
      const zoom = scale / m.base;
      const travel = clamp01(
        Math.log(zoom) / Math.max(1e-6, Math.log(m.end / m.base)),
      );

      /* The target's distance from the frame centre shrinks with the push. */
      const offX = (TARGET.x - ROOM.w / 2) * m.base * (1 - travel);
      const offY = (TARGET.y - ROOM.h / 2) * m.base * (1 - travel) - 0.03 * m.vh * travel;

      /* ---- the dive through the O: a constant-feeling zoom in its logarithm,
         from rest, which brings the O onto the axis of the lens ------------ */
      const dive = clamp01((f - BEAT.diveStart) / (BEAT.diveEnd - BEAT.diveStart));
      const depth = smoothstep(0, 1, dive);
      const diveZoom = m.through ** depth;
      const planeIn = smoothstep(m.screenFills * 0.6, m.screenFills, diveZoom);
      const covered = planeIn >= 1;
      const counter = m.counter * diveZoom;
      /* The O has left the frame: only the lens is there. */
      const gone = counter >= m.corner * 1.08;

      const screenX = m.vw / 2 + offX + (CAMERA.x + CAMERA.w * SCREEN_CX - TARGET.x) * scale;
      const screenY = m.vh / 2 + offY + (CAMERA.y + CAMERA.h * SCREEN_CY - TARGET.y) * scale;
      const camWidth = scale * CAMERA.w;
      const startX = screenX + COUNTER_DX * camWidth;
      const startY = screenY + COUNTER_DY * camWidth;
      const aim = smoothstep(0, 0.55, dive);
      const counterX = mix(startX, m.vw / 2, aim);
      const counterY = mix(startY, m.vh * LENS_CENTER_Y, aim);

      /* ---- room --------------------------------------------------------- */
      const roomScale = scale * diveZoom ** DIVE_PARALLAX;
      const originX = m.vw / 2 + offX + (counterX - startX) - TARGET.x * roomScale;
      const originY = m.vh / 2 + offY + (counterY - startY) - TARGET.y * roomScale;
      const relative = roomScale / m.cover;
      const roomT = `translate3d(${originX.toFixed(2)}px,${originY.toFixed(2)}px,0) scale(${relative.toFixed(4)})`;
      write(roomRef.current, covered ? 0 : roomOn * (1 - smoothstep(1.6, 3.2, zoom)), roomT);
      write(softRef.current, covered ? 0 : roomOn, roomT);
      write(dimRef.current, covered ? 0 : smoothstep(0.1, 0.3, f) * 0.38);

      /* ---- camera ------------------------------------------------------- */
      const camScale = (camWidth / m.cameraW) * diveZoom;
      /* The camera is held by its O, which stays where the zoom is going. */
      const camX = counterX - COUNTER_DX * camWidth * diveZoom;
      const camY = counterY - COUNTER_DY * camWidth * diveZoom;
      const camT = `translate3d(${camX.toFixed(2)}px,${camY.toFixed(2)}px,0) scale(${camScale.toFixed(4)})`;
      write(cameraRef.current, covered ? 0 : smoothstep(1.35, 2.2, zoom), camT);

      /* ---- the screen --------------------------------------------------- */
      const draw = clamp01((f - FINALE.logoStart) / (BEAT.logoEnd - FINALE.logoStart));
      const count = state.strokes.length;
      for (let i = 0; i < count; i += 1) {
        const stroke = state.strokes[i];
        const start = (i / count) * 0.6;
        const value = (1 - clamp01((draw - start) / 0.34)).toFixed(3);
        if (value !== stroke.last) {
          stroke.last = value;
          stroke.el.style.strokeDashoffset = value;
        }
      }
      const fill = smoothstep(0.7, 0.96, draw).toFixed(3);
      if (fill !== state.fill) {
        state.fill = fill;
        if (logoRef.current) logoRef.current.style.setProperty("--logo-fill", fill);
      }
      const hud = smoothstep(0.12, 0.24, f).toFixed(3);
      if (hud !== state.hud) {
        state.hud = hud;
        if (screenRef.current) screenRef.current.style.setProperty("--screen-glow", hud);
      }
      /* The readouts, the grid and the scan lines are what the dive passes first:
         enlarged any further they would stop reading as a screen. */
      const passed = 1 - smoothstep(READOUTS_PASS[0], READOUTS_PASS[1], diveZoom);
      const hudOpacity = (Number(hud) * passed).toFixed(3);
      if (hudOpacity !== state.hudOpacity) {
        state.hudOpacity = hudOpacity;
        if (hudRef.current) hudRef.current.style.opacity = hudOpacity;
      }
      const detail = 1 - smoothstep(SCREEN_DETAIL[0], SCREEN_DETAIL[1], diveZoom);
      const detailKey = detail.toFixed(3);
      if (detailKey !== state.detail) {
        state.detail = detailKey;
        if (gridRef.current) gridRef.current.style.opacity = (detail * GRID_OPACITY).toFixed(3);
        if (sheenRef.current) sheenRef.current.style.opacity = detailKey;
      }
      /* From here the mark is drawn at its real size for every frame. */
      const markOpacity = (1 - smoothstep(DOM_MARK_LEAVES[0], DOM_MARK_LEAVES[1], diveZoom)).toFixed(3);
      if (markOpacity !== state.markOpacity) {
        state.markOpacity = markOpacity;
        if (logoRef.current) logoRef.current.style.opacity = markOpacity;
      }
      if (tcRef.current) {
        const frames = Math.floor(f * 1440);
        const tc = `00:00:${String(Math.floor(frames / 24)).padStart(2, "0")}:${String(frames % 24).padStart(2, "0")}`;
        if (tc !== state.tc) {
          state.tc = tc;
          tcRef.current.textContent = tc;
        }
      }

      /* ---- what is left of the screen, past the camera ------------------- */
      write(planeRef.current, gone ? 0 : planeIn);
      write(blackRef.current, gone ? 0 : smoothstep(GO_DARK[0], GO_DARK[1], depth));

      /* ---- the opening, and the lens in it ------------------------------ */
      const opening = smoothstep(COUNTER_OPENS[0], COUNTER_OPENS[1], diveZoom);
      write(throughRef.current, opening);
      /* Covering the whole frame, it needs no clip. */
      const openingR = counter * OPENING_OVER;
      const clip =
        openingR >= m.corner + Math.hypot(counterX - m.vw / 2, counterY - m.vh * LENS_CENTER_Y)
          ? "none"
          : `circle(${openingR.toFixed(1)}px at ${counterX.toFixed(1)}px ${counterY.toFixed(1)}px)`;
      if (clip !== state.clip) {
        state.clip = clip;
        if (throughRef.current) throughRef.current.style.clipPath = clip;
      }

      /* The lens takes part of the dive's growth, and a push of its own carries
         on from there, so the move never stops: the two overlap in the dark and
         come to rest on the closed iris. */
      const lensPush = smoothstep(BEAT.lensPush, BEAT.pushEnd, f);
      const lensDive = m.through ** (depth * LENS_DEPTH);
      const lensSize =
        m.lensStart * lensDive * (m.lensClose / (m.lensStart * m.through ** LENS_DEPTH)) ** lensPush;
      const lensScale = lensSize / m.lensW;
      const pose = lensPosition(m, lensSize, counterX, counterY);
      /* The layer is laid out with its centre at the middle of its own box. */
      const lensX = pose.x + (LENS_PX * pose.k) / 2 - m.lensW / 2;
      const lensY = pose.y + (LENS_PX * pose.k) / 2 - m.lensW / 2;
      const lensTf = `translate3d(${lensX.toFixed(2)}px,${lensY.toFixed(2)}px,0) scale(${lensScale.toFixed(4)})`;
      write(lensRef.current, opening > 0 ? 1 : 0, lensTf);
      /* The sharper plate takes over once the first would be enlarged. */
      const closeIn = opening > 0 ? smoothstep(0.7, 1.1, (lensSize * m.dpr) / LENS_PX) : 0;
      const closeTf = `translate3d(${(pose.x + LENS_CLOSE.x * pose.k).toFixed(2)}px,${(pose.y + LENS_CLOSE.y * pose.k).toFixed(2)}px,0) scale(${((LENS_CLOSE.size * pose.k) / m.lensCloseW).toFixed(4)})`;
      write(lensCloseRef.current, closeIn, closeTf);

      /* ---- the mark, in front of it all --------------------------------- */
      paintMark(
        m,
        dive > 0 && !gone,
        counterX,
        counterY,
        (MARK_W * camWidth * diveZoom) / MARK.w,
        smoothstep(MARK_TAKES_OVER[0], MARK_TAKES_OVER[1], diveZoom),
        smoothstep(INK_DARK[0], INK_DARK[1], depth),
      );

    },
    [paintIris, paintMark, stageRef, write],
  );

  useImperativeHandle(
    ref,
    () => ({ update }),
    [update],
  );

  /* The plates load behind the preloader; nothing shows until all of them can. */
  useEffect(() => {
    let cancelled = false;
    const names = Object.keys(SRC);
    const drawing = fetch(MORPH_DRAWING).then((res) =>
      res.ok ? res.json() : Promise.reject(new Error(MORPH_DRAWING)),
    );
    Promise.all([drawing, ...names.map((name) => preload(SRC[name]))]).then(
      ([art, ...images]) => {
        if (!cancelled) {
          const image = (name) => images[names.indexOf(name)];
          live.current.lensImage = image("lensClose");
          live.current.morphArt = art;
          live.current.morphImages = {
            photo: image("room"),
            depth: image("depth"),
            lights: image("lights"),
            ceiling: image("ceiling"),
          };
          setMetrics(measure());
          setReady(true);
        }
      },
      () => {
        /* A missing plate is not an error: the opening is the still hero. */
        if (!cancelled) failRef.current?.();
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  /* Prepare the wordmark for draw-on and adopt the current scroll position. */
  useLayoutEffect(() => {
    if (!ready || !metrics) return;
    const state = live.current;
    state.m = metrics;
    state.ready = true;
    state.cache = new Map();
    /* Setting the size clears a canvas and its context state. They are drawn in
       the coordinates of the window, as every layer here is: stretched to the
       stage, which stops at a classic scrollbar, they would slide off the photo. */
    for (const canvas of [irisRef?.current, markRef.current]) {
      if (canvas) {
        canvas.width = Math.round(metrics.vw * metrics.irisRatio);
        canvas.height = Math.round(metrics.vh * metrics.irisRatio);
        canvas.style.width = `${metrics.vw}px`;
        canvas.style.height = `${metrics.vh}px`;
      }
    }
    state.irisKey = "";
    state.lensPattern = null;
    const morphCanvas = morphRef.current;
    if (morphCanvas) {
      morphCanvas.width = Math.round(metrics.vw * metrics.irisRatio);
      morphCanvas.height = Math.round(metrics.vh * metrics.irisRatio);
      morphCanvas.style.width = `${metrics.vw}px`;
      morphCanvas.style.height = `${metrics.vh}px`;
      if (!state.morph) state.morph = createRoomMorph(morphCanvas, state.morphImages, state.morphArt);
      /* The photograph where the finale starts, at rest in the frame. */
      const w = ROOM.w * metrics.base;
      const h = ROOM.h * metrics.base;
      state.morph?.resize({
        width: metrics.vw,
        height: metrics.vh,
        x: metrics.vw / 2 - w / 2,
        y: metrics.vh / 2 - h / 2,
        w,
        h,
        ratio: metrics.irisRatio,
        fade: metrics.vw / metrics.vh <= 0.85 ? 1 : 0,
      });
      state.morphKey = "";
      state.morphLanded = undefined;
    }
    const logo = logoRef.current;
    const shapes = logo ? Array.from(logo.querySelectorAll("path, rect")) : [];
    state.strokes = shapes.map((el) => {
      el.setAttribute("pathLength", "1");
      return { el, last: "" };
    });
    /* The same official outlines, for the canvas the dive draws them on. */
    state.markPaths = shapes.map((el, i) => {
      if (i === O_SHAPE) return ringsOfO();
      if (el.tagName.toLowerCase() === "path") return roundedOutline(el.getAttribute("d"));
      const path = new Path2D();
      path.rect(
        Number(el.getAttribute("x")),
        Number(el.getAttribute("y")),
        Number(el.getAttribute("width")),
        Number(el.getAttribute("height")),
      );
      return path;
    });
    update(progress.finale, progress.morph);
  }, [ready, metrics, progress, update, irisRef]);

  useEffect(() => {
    if (!ready) return undefined;
    const onResize = () => setMetrics(measure());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ready]);

  useEffect(
    () => () => {
      stageRef.current?.removeAttribute("data-plates-full");
      stageRef.current?.removeAttribute("data-iris");
      live.current.morph?.dispose();
      live.current.morph = null;
    },
    [stageRef],
  );

  if (!ready || !metrics) return null;

  const roomStyle = {
    width: ROOM.w * metrics.cover,
    height: ROOM.h * metrics.cover,
  };
  const cameraStyle = {
    width: metrics.cameraW,
    height: (metrics.cameraW * CAMERA_PX.h) / CAMERA_PX.w,
    marginLeft: -metrics.cameraW * SCREEN_CX,
    marginTop: (-metrics.cameraW * (CAMERA_PX.h / CAMERA_PX.w)) * SCREEN_CY,
    transformOrigin: `${SCREEN_CX * 100}% ${SCREEN_CY * 100}%`,
    "--cam-w": `${metrics.cameraW}px`,
  };
  const lensStyle = { width: metrics.lensW, height: metrics.lensW };
  const lensCloseStyle = { width: metrics.lensCloseW, height: metrics.lensCloseW };

  return (
    <div ref={rootRef} className={s.root} aria-hidden="true">
      <img ref={softRef} className={s.room} style={roomStyle} src={SRC.soft} alt="" />
      <img ref={roomRef} className={s.room} style={roomStyle} src={SRC.room} alt="" />
      <canvas ref={morphRef} className={s.morph} style={{ display: "none" }} />
      <div ref={dimRef} className={s.dim} />

      <div ref={cameraRef} className={s.camera} style={cameraStyle}>
        <img className={s.fill} src={SRC.camera} alt="" />
        <div
          ref={screenRef}
          className={s.screen}
          style={{
            left: `${SCREEN.left * 100}%`,
            top: `${SCREEN.top * 100}%`,
            width: `${SCREEN.width * 100}%`,
            height: `${SCREEN.height * 100}%`,
          }}
        >
          <span ref={gridRef} className={s.grid} />
          <div ref={hudRef} className={s.hud}>
            <span className={s.hudTL}>
              <i className={s.rec} />
              REC <b ref={tcRef}>00:00:00:00</b>
            </span>
            <span className={s.hudTR}>4K · 24P</span>
            <span className={s.hudBL}>1/50 · F2.0</span>
            <span className={s.hudBR}>ISO 800 · 5600K</span>
            <i className={`${s.bracket} ${s.bTL}`} />
            <i className={`${s.bracket} ${s.bTR}`} />
            <i className={`${s.bracket} ${s.bBL}`} />
            <i className={`${s.bracket} ${s.bBR}`} />
          </div>
          <div ref={logoRef} className={s.logo}>
            <Wordmark height={72} />
          </div>
          <span ref={sheenRef} className={s.sheen} />
        </div>
      </div>

      <div ref={planeRef} className={s.plane} />
      <div ref={blackRef} className={s.black} />
      <div ref={throughRef} className={s.through}>
        <img ref={lensRef} className={s.lens} style={lensStyle} src={SRC.lens} alt="" />
        <img ref={lensCloseRef} className={s.lensClose} style={lensCloseStyle} src={SRC.lensClose} alt="" />
      </div>
      <canvas ref={markRef} className={s.mark} />
    </div>
  );
});

export default StudioPlates;
