/* Small deterministic helpers shared by the studio scene.
   Nothing here runs a clock: every value is derived from scroll progress, so
   the same scroll position always resolves to the same scene. */

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
};

export const mix = (a, b, t) => a + (b - a) * t;

/* Stable pseudo-random in [0, 1) — used to stagger line strokes once. */
export const hash01 = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
};

/* The timeline. One source of truth: scroll progress 0..1 -> every visual.
   These are tuned against the reference clip: plan, structure, rig, gear,
   full wireframe, then the materialisation sweep. */
export const PHASE = {
  planEnd: 0.12,
  structure: 0.12,
  rig: 0.38,
  gear: 0.5,
  details: 0.66,
  wireframeFull: 0.74,

  /* Lights come up as the surfaces begin to exist. */
  lightsIn: 0.795,
  lightsFull: 0.945,

  /* Cyan front on the rising surfaces. */
  edgesIn: 0.825,
  edgesLit: 0.855,
  edgesOut: 0.925,
  edgesGone: 0.955,

  /* The floor rolls in from the backdrop toward the viewer. */
  floorStart: 0.835,
  floorEnd: 0.89,

  /* Solids grow from the floor to above the ceiling. */
  materialStart: 0.84,
  materialEnd: 0.955,

  /* The drawing is replaced by the surfaces it describes. */
  linesFadeStart: 0.865,
  linesFadeEnd: 0.935,
  gridFadeStart: 0.845,
  gridFadeEnd: 0.93,

  finish: 1,
};

/* Scroll length in viewport heights — the same pacing as the site's other
   pinned sequences (more room on desktop where the detail is visible).
   The build keeps its original length; the finale is appended after it, so
   the completed studio is reached at exactly the same scroll distance. */
export const SCROLL_VH = { desktop: 400, tablet: 330, mobile: 260 };
export const FINALE_SCROLL_VH = { desktop: 360, tablet: 300, mobile: 240 };

export function scrollLengthVh() {
  if (typeof window === 'undefined') return SCROLL_VH.desktop;
  const w = window.innerWidth;
  if (w < 760) return SCROLL_VH.mobile;
  if (w < 1100) return SCROLL_VH.tablet;
  return SCROLL_VH.desktop;
}

export function finaleLengthVh() {
  if (typeof window === 'undefined') return FINALE_SCROLL_VH.desktop;
  const w = window.innerWidth;
  if (w < 760) return FINALE_SCROLL_VH.mobile;
  if (w < 1100) return FINALE_SCROLL_VH.tablet;
  return FINALE_SCROLL_VH.desktop;
}

export function totalScrollLengthVh() {
  return scrollLengthVh() + finaleLengthVh();
}

/* Where the build ends inside the total pinned range. */
export function scrollSplit() {
  const total = totalScrollLengthVh();
  return scrollLengthVh() / total;
}

/* The finale's internal beats. They overlap on purpose: the camera is already
   moving while the wordmark is being drawn, and the orbit begins at the exact
   moment the mark has settled on the screen — no stationary hold between the
   reveal and the move. */
export const FINALE = {
  hold: 0.07,
  dollyEnd: 0.19,
  logoStart: 0.18,
  logoEnd: 0.56,
  orbitStart: 0.56,
  orbitEnd: 0.76,
  lensStart: 0.76,
  lensEnd: 0.92,
  opticalStart: 0.92,
  opticalEnd: 1,
};
