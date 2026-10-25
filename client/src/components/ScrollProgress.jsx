import { useEffect, useRef } from 'react';
import { ScrollTrigger, prefersReducedMotion } from '../lib/anim.js';
import s from './ScrollProgress.module.css';

/* Thin teal progress bar pinned to the top of the page.
   Uses scaleX (transform only) so it never triggers layout. */
export default function ScrollProgress() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (prefersReducedMotion()) { el.style.display = 'none'; return undefined; }

    const st = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => { el.style.transform = `scaleX(${self.progress})`; },
    });
    return () => st.kill();
  }, []);

  return <div ref={ref} className={s.bar} aria-hidden="true" />;
}
