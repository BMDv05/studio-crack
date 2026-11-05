/* The iris of the photographed lens, opened by scroll.

   Real iris geometry: every blade is rigid and turns about its own pivot on a
   ring outside the glass. Its inner edge is a circle of radius RHO, so the hole
   is the intersection of BLADES discs. Each blade is cut out of the lens
   photograph and carries that piece with it: when the iris is closed the blades
   add up to the untouched photograph, and the first movement splits the real
   lens rather than replacing it.

   All lengths in the geometry are in units of the glass radius. */

export const BLADES = 7;
const RHO = 1.16;
const TAU = Math.PI * 2;
/* Hole radius at each end of the move. It starts inside the black hole of the
   photograph and ends past the far edge of the glass, which is not concentric
   with the iris in the photograph. */
export const HOLE_CLOSED = 0.012;
export const HOLE_OPEN = 1.1;

/* Where the iris and the glass are in the lens photograph, in its own pixels. */
const HOLE = { x: 1405.7, y: 1401.6 };
const GLASS = { x: 1386, y: 1393, r: 330 };

export const LENS_HOLE = HOLE;
export const LENS_GLASS_RADIUS = GLASS.r;

/* The close-up plate: the middle of the lens photograph, super-resolved. x, y and
   size are in pixels of the photograph; it holds everything that can be in frame
   from the closed iris on, on any screen. */
export const LENS_CLOSE = { x: 520, y: 520, size: 1770, px: 3000 };
const CLOSE_SCALE = LENS_CLOSE.size / LENS_CLOSE.px;

const bladeTurn = (hole) => 2 * Math.asin((RHO - hole) / (2 * RHO));
const TURN_CLOSED = bladeTurn(HOLE_CLOSED);

const angleOf = (c, p) => Math.atan2(p.y - c.y, p.x - c.x);

/* An arc along the short way between two angles. */
function arcBetween(ctx, c, r, from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  ctx.arc(c.x, c.y, r, from, to, d < 0);
}

/* frame: { ratio, width, height, x, y, scale, hole, reveal, metal }
     x, y     the photograph's top-left corner in CSS pixels
     scale    CSS pixels per photograph pixel
     hole     hole radius in glass radii
     reveal   0..1, how far the drawn edges have come in
     metal    0..1, how far the blades have turned from photograph to metal */
export function drawIris(ctx, pattern, frame) {
  const { ratio, width, height, x, y, scale, hole, reveal, metal } = frame;
  const G = GLASS.r * scale;
  const glass = { x: x + GLASS.x * scale, y: y + GLASS.y * scale };
  const O = { x: x + HOLE.x * scale, y: y + HOLE.y * scale };
  const rho = RHO * G;
  /* The pattern is the close-up plate, so it has its own corner and scale. */
  const plateX = x + LENS_CLOSE.x * scale;
  const plateY = y + LENS_CLOSE.y * scale;
  const plateScale = scale * CLOSE_SCALE;

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  /* The barrel: everything of the photograph outside the glass. */
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.arc(glass.x, glass.y, G, 0, TAU);
  ctx.fillStyle = "#000";
  ctx.fill("evenodd");
  pattern.setTransform(new DOMMatrix([plateScale, 0, 0, plateScale, plateX, plateY]));
  ctx.fillStyle = pattern;
  ctx.fill("evenodd");

  ctx.save();
  ctx.beginPath();
  ctx.arc(glass.x, glass.y, G, 0, TAU);
  ctx.clip();

  /* The blades stop on straight lines between their pivots, and the glass is not
     concentric with the iris: on its far side a sliver of it lies past those lines.
     It stays the lens, or the page would show through. */
  const blades = rho * Math.cos(Math.PI / BLADES) * 0.99;
  ctx.beginPath();
  ctx.arc(glass.x, glass.y, G, 0, TAU);
  ctx.moveTo(O.x + blades, O.y);
  ctx.arc(O.x, O.y, blades, 0, TAU);
  ctx.fill("evenodd");
  if (metal > 0) {
    ctx.fillStyle = `rgba(9, 13, 13, ${metal.toFixed(3)})`;
    ctx.fill("evenodd");
  }

  /* ---- layout of this frame ---------------------------------------------- */
  const turn = bladeTurn(hole);
  const centreDistance = (RHO - hole) * G;
  const pivots = [];
  const centres = [];
  for (let i = 0; i < BLADES; i += 1) {
    const a = (i / BLADES) * TAU;
    pivots.push({
      x: O.x + rho * Math.cos(a),
      y: O.y + rho * Math.sin(a),
    });
    const c = a + Math.PI / 2 - turn / 2;
    centres.push({
      x: O.x + centreDistance * Math.cos(c),
      y: O.y + centreDistance * Math.sin(c),
    });
  }

  /* corners[i]: the hole's corner where the edges of blade i and i + 1 meet. */
  const half = Math.PI / BLADES;
  const toMid = centreDistance * Math.cos(half);
  const halfChord = centreDistance * Math.sin(half);
  const cornerDistance = Math.sqrt(rho * rho - halfChord * halfChord) - toMid;
  const corners = [];
  for (let i = 0; i < BLADES; i += 1) {
    const a = (i / BLADES) * TAU + Math.PI / 2 - turn / 2 + half + Math.PI;
    corners.push({
      x: O.x + cornerDistance * Math.cos(a),
      y: O.y + cornerDistance * Math.sin(a),
    });
  }

  const angles = [];
  for (let i = 0; i < BLADES; i += 1) {
    const prev = (i + BLADES - 1) % BLADES;
    angles.push({
      pivot: angleOf(centres[i], pivots[i]),
      near: angleOf(centres[i], corners[i]),
      far: angleOf(centres[i], corners[prev]),
    });
  }

  /* ---- blades -------------------------------------------------------------
     What can be seen of blade i is bounded by its own edge (pivot to the far
     corner, through the side of the hole) and by the edge of blade i - 1 lying
     on top of it, so the pinwheel overlap needs no draw order. */
  const moved = TURN_CLOSED - turn;
  for (let i = 0; i < BLADES; i += 1) {
    const prev = (i + BLADES - 1) % BLADES;
    ctx.beginPath();
    ctx.moveTo(pivots[i].x, pivots[i].y);
    arcBetween(ctx, centres[i], rho, angles[i].pivot, angles[i].far);
    arcBetween(ctx, centres[prev], rho, angles[prev].near, angles[prev].pivot);
    ctx.closePath();

    const p = pivots[i];
    /* Fully metal, the photograph is covered: there is no need to draw it. */
    if (metal < 1) {
      const cos = Math.cos(moved);
      const sin = Math.sin(moved);
      pattern.setTransform(
        new DOMMatrix([
          cos * plateScale,
          sin * plateScale,
          -sin * plateScale,
          cos * plateScale,
          p.x + cos * (plateX - p.x) - sin * (plateY - p.y),
          p.y + sin * (plateX - p.x) + cos * (plateY - p.y),
        ]),
      );
      ctx.fillStyle = pattern;
      ctx.fill();
    }

    /* The reflections belong to the glass, and only the closed iris lines up
       with them: copies of them would ride outward on every blade. They give
       way to dark metal, and each blade turns through the light at its own
       moment, so a sheen runs around the iris. */
    if (metal > 0) {
      const phase = 0.5 + 0.5 * Math.sin(i * 2.4 + moved * 5);
      ctx.fillStyle = `rgba(9, 13, 13, ${metal.toFixed(3)})`;
      ctx.fill();
      const corner = corners[prev];
      const sheen = ctx.createLinearGradient(p.x, p.y, corner.x, corner.y);
      const peak = 0.12 + 0.5 * phase;
      const light = (metal * (0.05 + 0.1 * phase)).toFixed(3);
      sheen.addColorStop(0, "rgba(150, 178, 172, 0)");
      sheen.addColorStop(peak, `rgba(150, 178, 172, ${light})`);
      sheen.addColorStop(1, "rgba(150, 178, 172, 0)");
      ctx.fillStyle = sheen;
      ctx.fill();
    }
  }

  if (reveal > 0) {
    /* ---- shadows -----------------------------------------------------------
       Along a seam, a blade's edge shadows the blade under it, which lies inside
       its circle: a stroke on a slightly smaller radius falls only on that side.
       Nothing falls into the hole, so the room stays exactly as it will be when
       the iris has gone. Many faint bands read as one soft falloff. */
    if (metal > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      /* Each side runs from corner i to corner i - 1, so walk the blades down
         for one closed outline. */
      for (let i = BLADES - 1; i >= 0; i -= 1) {
        arcBetween(ctx, centres[i], rho, angles[i].near, angles[i].far);
      }
      ctx.closePath();
      ctx.clip("evenodd");
      ctx.lineCap = "butt";
      const BANDS = 6;
      ctx.strokeStyle = `rgba(0, 3, 3, ${(0.11 * metal).toFixed(3)})`;
      for (let b = 1; b <= BANDS; b += 1) {
        const w = (0.003 + 0.0028 * b * b) * G;
        ctx.lineWidth = w;
        for (let i = 0; i < BLADES; i += 1) {
          ctx.beginPath();
          arcBetween(ctx, centres[i], rho - w / 2, angles[i].pivot, angles[i].far);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    /* ---- the machined edge, catching light from the room ------------------- */
    ctx.lineWidth = Math.max(1, 0.0024 * G);
    ctx.strokeStyle = `rgba(214, 240, 232, ${(0.36 * reveal).toFixed(3)})`;
    for (let i = 0; i < BLADES; i += 1) {
      ctx.beginPath();
      arcBetween(ctx, centres[i], rho, angles[i].near, angles[i].far);
      ctx.stroke();
    }
    ctx.lineWidth = Math.max(0.75, 0.0014 * G);
    ctx.strokeStyle = `rgba(170, 200, 194, ${(0.22 * reveal).toFixed(3)})`;
    for (let i = 0; i < BLADES; i += 1) {
      ctx.beginPath();
      arcBetween(ctx, centres[i], rho, angles[i].pivot, angles[i].near);
      ctx.stroke();
    }
  }

  ctx.restore();
}
