import { useLayoutEffect, useRef } from 'react';
import { gsap, prefersReducedMotion } from '../../lib/anim.js';
import s from './CallSlate.module.css';

/* A production slate, drawn in the brand palette. Its clapper closes once
   when the booking section enters. Decorative: the booking copy is the source
   of truth for screen readers. */
export default function CallSlate({ className = '' }) {
  const stageRef = useRef(null);
  const clapperRef = useRef(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const clapper = clapperRef.current;
    if (!stage || !clapper) return undefined;

    if (prefersReducedMotion()) {
      gsap.set(clapper, { rotate: 0 });
      return undefined;
    }

    const ctx = gsap.context(() => {
      gsap.set(clapper, { rotate: -23, transformOrigin: '9% 100%' });
      gsap.to(clapper, {
        rotate: 0,
        duration: 0.72,
        ease: 'back.out(1.45)',
        scrollTrigger: { trigger: stage, start: 'top 82%', once: true },
      });
    }, stage);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={stageRef} className={`${s.stage} ${className}`.trim()} aria-hidden="true">
      <div className={s.slate}>
        <div ref={clapperRef} className={s.clapper}>
          <span className={s.stripe} />
          <span className={s.clapLabel}>Double H</span>
          <span className={s.hinge} />
        </div>

        <div className={s.board}>
          <span className={s.tape} />
          <div className={s.topRow}>
            <span>PROD. 001</span>
            <span>DAMASCUS / SY</span>
          </div>

          <div className={s.brand}>
            DOUBLE H
            <span>Studio</span>
          </div>

          <div className={s.info}>
            <div><span>Scene</span><b>01</b></div>
            <div><span>Take</span><b>01</b></div>
            <div><span>Roll</span><b>A</b></div>
          </div>

          <p className={s.caption}>Call<br /><em>Sheet</em></p>

          <div className={s.bottomRow}>
            <span>2026 · 35 MM</span>
            <span className={s.barcode} />
          </div>
        </div>
      </div>
      <p className={s.note}>Production desk / 01 <span>·</span> Studio call</p>
    </div>
  );
}
