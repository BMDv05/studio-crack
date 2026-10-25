import { useEffect, useRef } from 'react';
import { gsap, EASE, DUR, prefersReducedMotion } from '../lib/anim.js';

/* Wrap anything to get a fade-up on scroll.
   - <Reveal>Single element</Reveal>
   - <Reveal stagger>…children animate one after another…</Reveal>
   Reduced motion: content is shown immediately, no animation. */
export default function Reveal({
  as: Tag = 'div',
  children,
  className,
  delay = 0,
  y = DUR.revealY,
  duration = DUR.reveal,
  stagger = 0,
  start = 'top 88%',
  once = true,
  ...rest
}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const targets = stagger ? Array.from(el.children) : el;
    if (!targets || (Array.isArray(targets) && targets.length === 0)) return undefined;

    if (prefersReducedMotion()) {
      gsap.set(targets, { opacity: 1, y: 0 });
      return undefined;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(targets, { opacity: 0, y }, {
        opacity: 1,
        y: 0,
        duration,
        delay,
        stagger,
        ease: EASE.out,
        scrollTrigger: { trigger: el, start, once },
        /* Drop the inline transform once done so CSS hover effects win. */
        onComplete: () => gsap.set(targets, { clearProps: 'transform' }),
      });
    }, el);

    return () => ctx.revert();
  }, [delay, y, duration, stagger, start, once]);

  return <Tag ref={ref} className={className} {...rest}>{children}</Tag>;
}
