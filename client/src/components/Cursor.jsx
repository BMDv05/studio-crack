import { useEffect, useRef } from 'react';
import { gsap, EASE, prefersReducedMotion } from '../lib/anim.js';
import s from './Cursor.module.css';

/* Custom cursor: shows a teal "View" pill over elements that opt in with
   data-cursor="View". Touch devices, coarse pointers and reduced motion
   keep the native cursor. */
export default function Cursor() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fine = window.matchMedia('(pointer: fine)').matches;
    if (!fine || prefersReducedMotion()) return undefined;

    const label = el.querySelector('[data-cursor-label]');
    const xTo = gsap.quickTo(el, 'x', { duration: 0.35, ease: EASE.soft });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.35, ease: EASE.soft });
    gsap.set(el, { xPercent: -50, yPercent: -50, autoAlpha: 0, scale: 0.6 });

    let showing = false;
    const move = (e) => { xTo(e.clientX); yTo(e.clientY); };
    const over = (e) => {
      const target = e.target && e.target.closest && e.target.closest('[data-cursor]');
      const active = !!target;
      if (active === showing) return;
      showing = active;
      if (active) {
        if (label) label.textContent = target.getAttribute('data-cursor') || 'View';
        gsap.to(el, { autoAlpha: 1, scale: 1, duration: 0.3, ease: EASE.out });
      } else {
        gsap.to(el, { autoAlpha: 0, scale: 0.6, duration: 0.25, ease: EASE.soft });
      }
    };

    window.addEventListener('mousemove', move, { passive: true });
    window.addEventListener('mouseover', over, { passive: true });
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseover', over);
      gsap.killTweensOf(el);
    };
  }, []);

  return (
    <div ref={ref} className={s.cursor} aria-hidden="true">
      <span data-cursor-label>View</span>
    </div>
  );
}
