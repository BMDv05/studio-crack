import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap, EASE, DUR, prefersReducedMotion } from '../lib/anim.js';
import { lockScroll, unlockScroll } from '../hooks/useLenis.js';
import { Wordmark } from './Wordmark.jsx';
import s from './Preloader.module.css';

/* "Build the studio from zero" intro.
   One master GSAP timeline drives: foundation line → blueprint grid → two H
   glyphs drawn with stroke then filled → the official wordmark rises into
   place. The screen then opens along the foundation line (top and bottom
   curtains part), handing the full frame to the studio build underneath.
   Only transform / opacity / clip-safe properties are animated. */

const H_PATH = 'M0,18 L14,0 V43 H56 V0 H70 V100 H56 V57 H14 V100 H0 Z';

function HGlyph() {
  return (
    <svg className={s.glyph} viewBox="0 0 70 100" aria-hidden="true" focusable="false">
      <path data-pl-h pathLength="1" d={H_PATH} />
    </svg>
  );
}

export default function Preloader({ onReveal, onDone }) {
  const rootRef = useRef(null);
  const [gone, setGone] = useState(false);
  const finishedRef = useRef(false);
  const beganRef = useRef(false);
  /* Keep the latest callbacks without restarting the intro effect. */
  const onRevealRef = useRef(onReveal);
  const onDoneRef = useRef(onDone);
  onRevealRef.current = onReveal;
  onDoneRef.current = onDone;

  /* Set the "before" state before first paint so nothing flashes. */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const q = gsap.utils.selector(root);
    gsap.set(root, { autoAlpha: 1 });
    gsap.set(q('[data-pl-line]'), { scaleX: 0, transformOrigin: 'center center' });
    gsap.set(q('[data-pl-grid]'), { opacity: 0, scale: 0.82 });
    gsap.set(q('[data-pl-crop]'), { opacity: 0, scale: 0.7 });
    gsap.set(q('[data-pl-h]'), { strokeDasharray: 1, strokeDashoffset: 1, fillOpacity: 0 });
    gsap.set(q('[data-pl-name]'), { yPercent: 110, autoAlpha: 0 });
    gsap.set(q('[data-pl-seam]'), { scaleX: 0, autoAlpha: 0 });
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const q = gsap.utils.selector(root);
    const panels = q('[data-pl-panel]');
    const reduced = prefersReducedMotion();

    /* Lock scrolling while the intro plays. */
    lockScroll();
    const unlock = () => unlockScroll();

    const finish = () => {
      try { sessionStorage.setItem('dh-intro', '1'); } catch { /* ignore */ }
      unlock();
      if (onDoneRef.current) onDoneRef.current();
      setGone(true);
    };

    /* ---- Exit: the brand settles, then the screen opens along the
       foundation line — top and bottom curtains part, a lit seam holds the
       middle of the frame, and the studio build underneath takes over. ---- */
    const exit = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const tl = gsap.timeline({ onComplete: finish });
      root.dataset.exit = '1'; /* fades in the soft edge along both curtains */
      if (onRevealRef.current) onRevealRef.current(); /* hero/scene animate in the same instant */

      if (reduced) {
        tl.to(root, { autoAlpha: 0, duration: 0.6, ease: EASE.soft });
        return;
      }

      const stage = root.querySelector('[data-pl-stage]');
      const content = root.querySelector('[data-pl-content]');
      const seam = root.querySelector('[data-pl-seam]');

      tl.to(stage, { scale: 1.045, duration: 0.95, ease: EASE.inOut }, 0)
        .to(content, { autoAlpha: 0, duration: 0.36, ease: EASE.inOut }, 0.1)
        .fromTo(
          seam,
          { scaleX: 0, autoAlpha: 0 },
          { scaleX: 1, autoAlpha: 1, duration: 0.5, ease: EASE.inOut },
          0.28,
        )
        .to(panels[0], { yPercent: -101, duration: 1, ease: EASE.curtain }, 0.55)
        .to(panels[1], { yPercent: 101, duration: 1, ease: EASE.curtain }, 0.55)
        .to(seam, { autoAlpha: 0, duration: 0.45, ease: EASE.soft }, 1.05);
    };

    /* ---- Reduced motion: a simple 600ms fade of the logo. ---- */
    if (reduced) {
      gsap.set(q('[data-pl-line]'), { scaleX: 1 });
      gsap.set(q('[data-pl-h]'), { fillOpacity: 1, strokeDashoffset: 0 });
      gsap.set(q('[data-pl-name]'), { yPercent: 0, autoAlpha: 1 });
      gsap.set(q('[data-pl-crop]'), { opacity: 1, scale: 1 });
      const t = setTimeout(exit, 260);
      return () => { clearTimeout(t); unlock(); };
    }

    /* ---- Master build timeline. ---- */
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: EASE.out } });
      tl.fromTo(q('[data-pl-line]'), { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: EASE.inOut }, 0.15)
        .fromTo(q('[data-pl-grid]'), { opacity: 0, scale: 0.82 }, { opacity: 1, scale: 1, duration: 1.1 }, 0.35)
        .fromTo(q('[data-pl-crop]'), { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.5, stagger: 0.06 }, 0.55)
        .fromTo(q('[data-pl-h]'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, stagger: 0.15, ease: EASE.inOut }, 0.7)
        .to(q('[data-pl-h]'), { fillOpacity: 1, duration: 0.5, stagger: 0.1 }, 1.35)
        .fromTo(
          q('[data-pl-name]'),
          { yPercent: 110, autoAlpha: 0 },
          { yPercent: 0, autoAlpha: 1, duration: 0.85, ease: EASE.out },
          1.25,
        );
    }, root);

    const begin = () => {
      if (beganRef.current || finishedRef.current) return;
      beganRef.current = true;
      exit();
    };

    /* Let the build finish, but never wait on a stalled asset longer than
       the hard cap. */
    const assetsReady = () => {
      const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      const load = document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise((res) => window.addEventListener('load', res, { once: true }));
      return Promise.all([fonts, load]);
    };

    let cancelled = false;
    let minTimer = null;
    const minWait = new Promise((res) => { minTimer = window.setTimeout(res, DUR.preloaderMin * 1000); });
    const capTimer = window.setTimeout(begin, DUR.preloaderMax * 1000);
    Promise.all([minWait, assetsReady()]).then(() => { if (!cancelled) begin(); });

    return () => {
      cancelled = true;
      window.clearTimeout(capTimer);
      window.clearTimeout(minTimer);
      ctx.revert();
      unlock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gone) return null;

  return (
    <div ref={rootRef} className={s.root} role="status" aria-live="polite" aria-label="Loading Double H Studio">
      <div className={s.panelTop} data-pl-panel aria-hidden="true" />
      <div className={s.panelBottom} data-pl-panel aria-hidden="true" />

      <div className={s.content} data-pl-content>
        <div className={s.grid} data-pl-grid aria-hidden="true" />
        <div className={s.foundation} data-pl-line aria-hidden="true" />

        <div className={s.stage} data-pl-stage>
          <div className={s.marks}>
            <HGlyph />
            <HGlyph />
          </div>
          <div className={s.nameMask}>
            <div className={s.nameInner} data-pl-name>
              <Wordmark className={s.wordmark} />
            </div>
          </div>
        </div>

        <span className={`${s.crop} ${s.cropTL}`} data-pl-crop aria-hidden="true" />
        <span className={`${s.crop} ${s.cropTR}`} data-pl-crop aria-hidden="true" />
        <span className={`${s.crop} ${s.cropBL}`} data-pl-crop aria-hidden="true" />
        <span className={`${s.crop} ${s.cropBR}`} data-pl-crop aria-hidden="true" />
      </div>

      <span className={s.seam} data-pl-seam aria-hidden="true" />
    </div>
  );
}
