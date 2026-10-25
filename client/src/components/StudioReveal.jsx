import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap, EASE, ScrollTrigger, prefersReducedMotion } from '../lib/anim.js';
import { useAppReady } from '../hooks/useAppReady.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import {
  PHOTO_SOURCES,
  LINES_SOURCE,
  STAGES,
  PHASES,
  BLUEPRINT_OPACITY,
  INTRO_SCALE,
  scrollLengthVh,
} from '../lib/studioReveal.js';
import s from './StudioReveal.module.css';

/* Any SVG geometry element can be revealed with stroke-dasharray/dashoffset. */
const SHAPE_SELECTOR = 'path, line, polyline, polygon, rect, circle, ellipse';

/* --------------------------------------------------------------------------
 * Asset loading
 * ----------------------------------------------------------------------- */

function loadPhoto(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    const ok = () => resolve({ src, width: img.naturalWidth, height: img.naturalHeight });
    img.onload = () => {
      if (img.decode) img.decode().then(ok, ok);
      else ok();
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/* First existing photograph wins — .webp → .jpg → .jpeg → .png. */
async function findPhoto() {
  for (const src of PHOTO_SOURCES) {
    // eslint-disable-next-line no-await-in-loop
    const photo = await loadPhoto(src);
    if (photo && photo.width > 0 && photo.height > 0) return photo;
  }
  return null;
}

/* The traced line-art layer is inlined (not linked) so GSAP can animate every
   stroke individually. Missing file is not an error: the section degrades.
   `no-cache` revalidates, so dropping a new studio.lines.svg in and reloading
   always picks it up (force-cache would happily reuse a cached 404). */
async function loadLines() {
  try {
    const res = await fetch(LINES_SOURCE, { cache: 'no-cache' });
    if (!res.ok) return null;
    const text = await res.text();
    return /<svg[\s>]/i.test(text) ? text : null;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------------------
 * StudioReveal
 *
 * Scroll-driven construction of the studio photograph: the real photograph
 * settles into frame, the sheet washes over to a blueprint, the traced line
 * work is drawn stage by stage, then the line work recedes and the original
 * full-colour photograph returns. One scrubbed timeline, one pin, fully
 * reversible. See lib/studioReveal.js for the asset contract.
 * ----------------------------------------------------------------------- */
export default function StudioReveal() {
  const { t } = useLang();
  const { ready } = useAppReady();

  const rootRef = useRef(null);
  const photoRef = useRef(null);
  const linesRef = useRef(null);
  const tintRef = useRef(null);
  const gridRef = useRef(null);
  const railRef = useRef(null);
  const pctRef = useRef(null);
  const labelRef = useRef(null);
  const hintRef = useRef(null);
  const chromeRef = useRef(null);

  // null = still loading · false = no photograph available · object = ready
  const [asset, setAsset] = useState(null);
  const [stageIndex, setStageIndex] = useState(0);
  const stageIndexRef = useRef(0);
  /* The stages actually present in the SVG — a hand-edited file may omit one. */
  const [sequence, setSequence] = useState(() => STAGES.map((item) => item.id));
  const sequenceRef = useRef(sequence);
  const reduced = useMemo(() => prefersReducedMotion(), []);

  /* ---- assets ---------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const photo = await findPhoto();
      if (cancelled) return;
      if (!photo) {
        console.warn(
          `[StudioReveal] No studio photograph found. Add one of ${PHOTO_SOURCES.join(', ')} — see client/public/studio/README.md`,
        );
        setAsset(false);
        return;
      }
      const lines = await loadLines();
      if (cancelled) return;
      if (!lines) {
        console.warn(
          `[StudioReveal] ${LINES_SOURCE} not found — showing the photograph with a still reveal. Trace it at /trace.html.`,
        );
      }
      setAsset({ ...photo, lines });
    })();
    return () => { cancelled = true; };
  }, []);

  /* ---- the sequence ---------------------------------------------------- */
  useLayoutEffect(() => {
    if (!asset || !ready) return undefined;
    const root = rootRef.current;
    const photo = photoRef.current;
    const host = linesRef.current;
    const tint = tintRef.current;
    if (!root || !photo || !host || !tint) return undefined;

    /* Inline the traced layer before measuring — getTotalLength() needs it live. */
    if (asset.lines && !host.firstChild) host.innerHTML = asset.lines;

    const aspect = asset.width / Math.max(1, asset.height);
    root.style.setProperty('--sb-aspect', String(aspect));

    const ctx = gsap.context(() => {
      /* Reduced motion — no pin, no scrubbing. The CSS media query already
         guarantees the photograph is fully visible; this only fades it in. */
      if (reduced) {
        gsap.set(root, { opacity: 1 });
        return;
      }

      /* ---- collect the drawing: one entry per stage present in the SVG --- */
      const svg = host.querySelector('svg');
      let timelineStages = [];
      if (svg) {
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        const found = STAGES
          .map((stage) => ({ stage, group: svg.querySelector(`[data-stage="${stage.n}"]`) }))
          .filter((entry) => entry.group);
        timelineStages = found.length ? found : [{ stage: STAGES[0], group: svg }];
        if (!found.length) {
          console.warn('[StudioReveal] studio.lines.svg has no [data-stage] groups — every stroke is drawn in one pass.');
        }
        const svgAspect = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.height
          ? svg.viewBox.baseVal.width / svg.viewBox.baseVal.height
          : aspect;
        if (Math.abs(svgAspect - aspect) > 0.01) {
          console.warn(
            `[StudioReveal] studio.lines.svg aspect (${svgAspect.toFixed(3)}) does not match the photograph (${aspect.toFixed(3)}) — re-trace it at /trace.html so the strokes stay aligned.`,
          );
        }
      }

      for (const entry of timelineStages) {
        entry.items = [];
        for (const el of entry.group.querySelectorAll(SHAPE_SELECTOR)) {
          let len = 0;
          try { len = el.getTotalLength(); } catch { len = 0; }
          if (Number.isFinite(len) && len > 0.5) entry.items.push({ el, len });
        }
        entry.items.forEach(({ el, len }) => gsap.set(el, { strokeDasharray: len, strokeDashoffset: len }));
      }

      /* Counter + rail follow the stages that are actually drawn. */
      const ids = timelineStages.map((entry) => entry.stage.id);
      if (sequenceRef.current.join('|') !== ids.join('|')) {
        sequenceRef.current = ids;
        setSequence(ids);
      }

      /* ---- one timeline, mapped 1:1 to the scroll position --------------- */
      const tl = gsap.timeline({ defaults: { ease: EASE.inOut } });

      /* Phase A — the photograph settles into its final framing. */
      tl.addLabel('intro')
        .fromTo(
          photo,
          { opacity: 0, scale: INTRO_SCALE },
          { opacity: 1, scale: 1, duration: PHASES.intro, ease: EASE.out },
          'intro',
        )
        .fromTo(
          chromeRef.current,
          { opacity: 0, y: 26 },
          { opacity: 1, y: 0, duration: PHASES.intro * 0.85, ease: EASE.out },
          'intro+=0.18',
        )
        .to(hintRef.current, { opacity: 0, duration: 0.4, ease: EASE.out }, 'intro+=0.1')
        .to({}, { duration: PHASES.introHold });

      /* Phase B — the photograph recedes into the blueprint substrate. */
      tl.addLabel('substrate')
        .to(tint, { opacity: BLUEPRINT_OPACITY, duration: PHASES.substrate }, 'substrate')
        .to(gridRef.current, { opacity: 1, duration: PHASES.substrate }, 'substrate');

      /* Phase C — the construction, one stage after another. */
      for (const entry of timelineStages) {
        const { stage, group, items } = entry;
        tl.addLabel(stage.id);
        if (items.length) {
          /* The stage's time budget grows with its stroke count but is clamped,
             and the stagger is spread across that budget, so a stage with 400
             paths does not take four times as long as one with 40. */
          const budget = gsap.utils.clamp(stage.min, stage.max, items.length * stage.stagger);
          tl.to(
            items.map((item) => item.el),
            {
              strokeDashoffset: 0,
              duration: budget * 0.45,
              stagger: { amount: budget * 0.55 },
              ease: EASE.inOut,
            },
            stage.id,
          );
          tl.fromTo(group, { opacity: 0.55 }, { opacity: 1, duration: budget * 0.5, ease: EASE.out }, stage.id);
        }
        tl.to({}, { duration: 0.2 });
      }

      /* Phase D — the line work recedes and the photograph returns in colour. */
      tl.addLabel('resolve')
        .to(host, { opacity: 0, duration: PHASES.resolve * 0.75, ease: EASE.inOut }, 'resolve')
        .to(tint, { opacity: 0, duration: PHASES.resolve, ease: EASE.inOut }, `resolve+=${PHASES.resolve * 0.14}`)
        .to(gridRef.current, { opacity: 0, duration: PHASES.resolve * 0.5, ease: EASE.inOut }, 'resolve')
        .to({}, { duration: PHASES.rest });

      /* ---- scroll wiring -------------------------------------------------- */
      const total = tl.duration() || 1;
      const bounds = timelineStages.map((entry) => (tl.labels[entry.stage.id] ?? 0) / total);
      const setRail = railRef.current ? gsap.quickSetter(railRef.current, 'scaleY') : null;

      ScrollTrigger.create({
        trigger: root,
        start: 'top top',
        end: () => `+=${scrollLengthVh()}%`,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        animation: tl,
        scrub: 1,
        onUpdate: (self) => {
          const p = self.progress;
          if (pctRef.current) pctRef.current.textContent = `${Math.round(p * 100)}%`;
          if (setRail) setRail(Math.max(0.001, Math.min(1, p)));
          let idx = 0;
          for (let i = 0; i < bounds.length; i += 1) {
            if (p >= bounds[i] - 0.0005) idx = i;
          }
          if (idx !== stageIndexRef.current) {
            stageIndexRef.current = idx;
            setStageIndex(idx);
          }
        },
      });

      /* The section changes height when the photograph arrives. */
      ScrollTrigger.refresh();
    }, root);

    return () => ctx.revert();
  }, [asset, ready, reduced]);

  /* ---- stage label: mask slide-up on every change ---------------------- */
  useLayoutEffect(() => {
    const el = labelRef.current;
    if (!el || reduced) return undefined;
    const anim = gsap.fromTo(
      el,
      { yPercent: 110, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.5, ease: EASE.out, overwrite: true },
    );
    return () => anim.kill();
  }, [stageIndex, reduced]);

  if (!asset) return null;

  const drawable = Boolean(asset.lines);
  const stageId = sequence[Math.min(stageIndex, sequence.length - 1)] || STAGES[0].id;

  return (
    <section
      ref={rootRef}
      className={s.root}
      data-draw={drawable ? 'on' : 'off'}
      aria-label={t('studio.aria')}
    >
      <div className={s.sheet} aria-hidden="true">
        <span className={s.sheetGrid} />
        <span className={`${s.crop} ${s.cropTL}`} />
        <span className={`${s.crop} ${s.cropTR}`} />
        <span className={`${s.crop} ${s.cropBL}`} />
        <span className={`${s.crop} ${s.cropBR}`} />
      </div>

      <div className={s.inner}>
        <div className={s.aside} ref={chromeRef}>
          <p className={`${s.eyebrow} eyebrow`}>{t('studio.eyebrow')}</p>

          <p className={s.counter}>
            <span className={s.counterNow}>{String(stageIndex + 1).padStart(2, '0')}</span>
            <span className={s.counterSep}>/</span>
            <span className={s.counterAll}>{String(sequence.length).padStart(2, '0')}</span>
          </p>

          <p className={s.labelMask}>
            <span className={s.label} ref={labelRef}>{t(`studio.stage.${stageId}`)}</span>
          </p>

          <div className={s.rail} aria-hidden="true">
            <span className={s.railTrack} />
            <span className={s.railFill} ref={railRef} />
            {sequence.map((id, i) => (
              <span
                key={id}
                className={s.dot}
                style={{ top: `${(i / Math.max(1, sequence.length - 1)) * 100}%` }}
                data-on={i <= stageIndex ? 'true' : 'false'}
              />
            ))}
          </div>

          <p className={s.progress}>
            <span className={s.pct} ref={pctRef}>0%</span>
            <span className={s.pctLabel}>{t('studio.pctLabel')}</span>
          </p>

          <p className={s.caption}>{drawable ? t('studio.caption') : t('studio.captionStill')}</p>
        </div>

        <figure className={s.frameWrap}>
          <div className={s.frame}>
            <img
              ref={photoRef}
              className={s.photo}
              src={asset.src}
              alt={t('studio.alt')}
              width={asset.width}
              height={asset.height}
              decoding="async"
            />
            <span className={s.tint} ref={tintRef} aria-hidden="true" />
            <span className={s.grid} ref={gridRef} aria-hidden="true" />
            <div className={s.lines} ref={linesRef} aria-hidden="true" />
          </div>
          <p className={s.hint} ref={hintRef}>
            <span className={s.hintArrow} aria-hidden="true" />
            {t('studio.hint')}
          </p>
        </figure>
      </div>
    </section>
  );
}
