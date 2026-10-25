/* Double H Studio — "studio reveal" asset contract + timeline configuration.
 *
 * This module is the single source of truth shared by:
 *   - components/StudioReveal.jsx   (the scroll-driven construction sequence)
 *   - tools/traceStudio.js          (the tracer that prepares the line-art layer)
 *   - public/studio/README.md       (the hand-off instructions)
 *
 * Nothing here invents architecture: the photograph is the reference and the
 * line-art layer is traced from that exact file. See public/studio/README.md.
 */

/* ---------------------------------------------------------------------------
 * ASSETS
 *
 * PHOTO: the real studio photograph, dropped into client/public/studio/.
 *        The first name that resolves wins, so .webp / .jpg / .png all work.
 *        The photograph is displayed EXACTLY as supplied — never cropped,
 *        stretched, re-coloured or regenerated. The frame takes its intrinsic
 *        aspect ratio, so the traced lines cannot drift out of alignment.
 *
 * LINES: the prepared architectural line-art layer, traced from the SAME
 *        photograph. Output of the tracer at /trace.html. Its viewBox must
 *        equal the photograph's pixel dimensions.
 * ------------------------------------------------------------------------- */
export const PHOTO_SOURCES = [
  '/studio/studio.webp',
  '/studio/studio.jpg',
  '/studio/studio.jpeg',
  '/studio/studio.png',
];

export const LINES_SOURCE = '/studio/studio.lines.svg';

/* ---------------------------------------------------------------------------
 * DRAWING STAGES
 *
 * `n` maps to data-stage="n" in the traced SVG. Array order IS the build order:
 * structure first, decorative detail last, the way an architect works.
 *
 *   stagger  seconds between consecutive strokes inside the stage
 *   min/max  clamp on the stage's total drawing time, so a stage with 400
 *            paths does not take four times as long as one with 40
 * ------------------------------------------------------------------------- */
export const STAGES = [
  { n: 1, id: 'guides', stagger: 0.040, min: 0.55, max: 1.6 },
  { n: 2, id: 'structure', stagger: 0.030, min: 0.75, max: 2.2 },
  { n: 3, id: 'openings', stagger: 0.026, min: 0.65, max: 1.9 },
  { n: 4, id: 'furniture', stagger: 0.018, min: 0.90, max: 2.6 },
  { n: 5, id: 'details', stagger: 0.012, min: 1.00, max: 3.0 },
];

/* Time budget for the phases that are not drawing (seconds inside the
   timeline; the whole timeline is mapped to the pinned scroll distance). */
export const PHASES = {
  intro: 1,       // the photograph settles into its final framing
  introHold: 0.35,
  substrate: 1,   // the photograph recedes into the blueprint substrate
  resolve: 1.7,   // line work recedes, full colour returns
  rest: 0.35,     // short beat before the pin releases
};

/* How far the section stays pinned, in viewport heights. Longer on desktop
   because there is more drawing to appreciate per screen. */
export const SCROLL_VH = { mobile: 260, tablet: 340, desktop: 440 };

/* Blueprint substrate: opacity of the ink wash laid over the photograph while
   the drawing is being constructed. 0 = photograph untouched. */
export const BLUEPRINT_OPACITY = 0.84;

/* Gentle entry: the photograph settles by this much, then holds perfectly
   still for the rest of the sequence (no drifting camera). */
export const INTRO_SCALE = 1.03;

export function scrollLengthVh(width = typeof window === 'undefined' ? 1440 : window.innerWidth) {
  if (width < 760) return SCROLL_VH.mobile;
  if (width < 1100) return SCROLL_VH.tablet;
  return SCROLL_VH.desktop;
}
