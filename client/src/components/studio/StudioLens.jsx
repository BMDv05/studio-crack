import { useId, useLayoutEffect, useRef } from 'react';
import { gsap, prefersReducedMotion } from '../../lib/anim.js';
import s from './StudioLens.module.css';

/* A drawn camera lens whose iris opens as the studio story scrolls.
   The whole object is decorative; the copy beside it carries the meaning. */
export default function StudioLens({ className = '' }) {
  const stageRef = useRef(null);
  const holeRef = useRef(null);
  const holeEdgeRef = useRef(null);
  const ringRef = useRef(null);
  const flareRef = useRef(null);

  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const metalId = `lens-metal-${uid}`;
  const glassId = `lens-glass-${uid}`;
  const irisId = `lens-iris-${uid}`;
  const maskId = `lens-hole-${uid}`;
  const clipId = `lens-clip-${uid}`;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const hole = holeRef.current;
    const holeEdge = holeEdgeRef.current;
    const ring = ringRef.current;
    const flare = flareRef.current;
    if (!stage || !hole) return undefined;

    if (prefersReducedMotion()) {
      gsap.set([hole, holeEdge], { scale: 1.4, svgOrigin: '260 260' });
      gsap.set(ring, { rotate: 8, svgOrigin: '260 260' });
      gsap.set(flare, { opacity: 0.45 });
      return undefined;
    }

    const ctx = gsap.context(() => {
      gsap.set([hole, holeEdge], { scale: 0.16, svgOrigin: '260 260' });
      gsap.set(ring, { rotate: -24, svgOrigin: '260 260' });
      gsap.set(flare, { opacity: 0 });

      /* Use the section rather than the sticky lens: the aperture then opens
         across the whole read-through, not before the lens reaches the screen. */
      const trigger = {
        trigger: stage.closest('section') || stage,
        start: 'top 86%',
        end: 'bottom 42%',
        scrub: 0.7,
      };

      gsap.to([hole, holeEdge], { scale: 1.55, ease: 'none', scrollTrigger: trigger });
      gsap.to(ring, { rotate: 10, ease: 'none', scrollTrigger: trigger });
      gsap.to(flare, { opacity: 0.72, ease: 'none', scrollTrigger: trigger });
    }, stage);

    return () => ctx.revert();
  }, []);

  const ribs = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return {
      i,
      x1: 260 + Math.cos(a) * 225,
      y1: 260 + Math.sin(a) * 225,
      x2: 260 + Math.cos(a) * 238,
      y2: 260 + Math.sin(a) * 238,
    };
  });

  return (
    <div ref={stageRef} className={`${s.stage} ${className}`.trim()} aria-hidden="true">
      <span className={`${s.corner} ${s.tl}`} />
      <span className={`${s.corner} ${s.tr}`} />
      <span className={`${s.corner} ${s.bl}`} />
      <span className={`${s.corner} ${s.br}`} />
      <span className={s.flare} ref={flareRef} />

      <svg
        className={s.lens}
        viewBox="0 0 520 520"
        role="presentation"
        focusable="false"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={metalId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className={s.metalLight} />
            <stop offset="0.2" className={s.metalDark} />
            <stop offset="0.48" className={s.metalMid} />
            <stop offset="0.72" className={s.metalDark} />
            <stop offset="1" className={s.metalLight} />
          </linearGradient>

          <radialGradient id={glassId} cx="41%" cy="34%" r="74%">
            <stop offset="0" className={s.glassHot} />
            <stop offset="0.28" className={s.glassMid} />
            <stop offset="0.72" className={s.glassDeep} />
            <stop offset="1" className={s.glassEdge} />
          </radialGradient>

          <radialGradient id={irisId} cx="50%" cy="45%" r="66%">
            <stop offset="0" className={s.irisMid} />
            <stop offset="0.7" className={s.irisDeep} />
            <stop offset="1" className={s.irisEdge} />
          </radialGradient>

          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="520" height="520">
            <rect width="520" height="520" fill="#fff" />
            <polygon
              ref={holeRef}
              points="260,198 314,229 314,291 260,322 206,291 206,229"
              fill="#000"
            />
          </mask>

          <clipPath id={clipId}>
            <circle cx="260" cy="260" r="246" />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          <circle cx="260" cy="260" r="246" fill={`url(#${metalId})`} />
          <circle cx="260" cy="260" r="232" className={s.metalInner} />
          <circle cx="260" cy="260" r="224" className={s.metalHairline} />

          <g ref={ringRef} className={s.ribs}>
            {ribs.map(({ i, x1, y1, x2, y2 }) => (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
            ))}
          </g>

          <circle cx="260" cy="260" r="213" className={s.rimGroove} />
          <circle cx="260" cy="260" r="192" className={s.rimInner} />
          <circle cx="260" cy="260" r="188" fill={`url(#${glassId})`} />
          <circle cx="260" cy="260" r="188" className={s.glassWash} />

          <g className={s.glassHighlights}>
            <path d="M 117 166 C 168 105, 279 80, 353 110 C 263 120, 178 154, 117 166 Z" />
            <path d="M 386 344 C 355 402, 273 442, 197 426 C 276 405, 344 377, 386 344 Z" />
            <ellipse cx="185" cy="193" rx="28" ry="12" transform="rotate(-32 185 193)" />
          </g>

          <g mask={`url(#${maskId})`}>
            <circle cx="260" cy="260" r="188" fill={`url(#${irisId})`} />
            <g className={s.blades}>
              {Array.from({ length: 6 }, (_, i) => (
                <path
                  key={i}
                  d="M260 260 L260 76 A184 184 0 0 1 419 168 Z"
                  transform={`rotate(${i * 60} 260 260)`}
                />
              ))}
            </g>
          </g>

          <polygon
            ref={holeEdgeRef}
            points="260,198 314,229 314,291 260,322 206,291 206,229"
            className={s.apertureHex}
          />
          <circle cx="260" cy="260" r="190" className={s.apertureEdge} />
          <circle cx="260" cy="260" r="150" className={s.focusRing} />

          <g className={s.reticle}>
            <path d="M260 84v14M260 422v14M84 260h14M422 260h14" />
            <path d="M260 116v7M260 397v7M116 260h7M397 260h7" />
          </g>

          <g className={s.rimType}>
            <text x="260" y="44" textAnchor="middle">DOUBLE H · OPTICS</text>
            <text x="260" y="486" textAnchor="middle">50MM · F/1.4</text>
          </g>
        </g>
      </svg>

      <div className={s.readout}>
        <span><i className={s.liveDot} />LENS / LIVE</span>
        <span>∞ — 0.45M</span>
      </div>
    </div>
  );
}
