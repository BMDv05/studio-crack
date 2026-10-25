import { useLayoutEffect, useRef } from 'react';
import { gsap, EASE, DUR, prefersReducedMotion } from '../lib/anim.js';

/* Heading that reveals line by line behind a mask.
   - <SplitText lines={['Line one', 'Line two']} />   explicit breaks
   - <SplitText text="Auto split by measured line width" />
   - manual: only split + set the "before" state, and let a parent timeline
     animate the .st-inner elements (used by the hero).
   Requires the .st-line / .st-inner / .st-word helpers in global.css. */
export default function SplitText({
  lines,
  text,
  as: Tag = 'h2',
  className,
  delay = 0,
  stagger = DUR.splitStagger,
  duration = 1,
  yPercent = 115,
  start = 'top 88%',
  once = true,
  manual = false,
  ...rest
}) {
  const ref = useRef(null);
  const key = Array.isArray(lines) ? lines.join('\u0000') : (text || '');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const reduced = prefersReducedMotion();
    const source = Array.isArray(lines) && lines.length
      ? lines
      : (text || el.textContent || '').split(/\n+/).filter(Boolean);
    if (!source.length) return undefined;

    const buildLines = (lineGroups) => {
      el.textContent = '';
      const inners = [];
      lineGroups.forEach((group) => {
        const mask = document.createElement('span');
        mask.className = 'st-line';
        const inner = document.createElement('span');
        inner.className = 'st-inner';
        if (Array.isArray(group)) {
          group.forEach((node, i) => {
            inner.appendChild(node);
            if (i < group.length - 1) inner.appendChild(document.createTextNode(' '));
          });
        } else {
          inner.textContent = group;
        }
        mask.appendChild(inner);
        el.appendChild(mask);
        inners.push(inner);
      });
      return inners;
    };

    let inners;
    if (Array.isArray(lines) && lines.length) {
      inners = buildLines(lines);
    } else {
      /* Auto-split: render words, measure their lines, then rebuild masked. */
      const text2 = text || el.textContent || '';
      const words = text2.split(/\s+/).filter(Boolean);
      el.textContent = '';
      const spans = words.map((w, i) => {
        const sp = document.createElement('span');
        sp.className = 'st-word';
        sp.textContent = w;
        el.appendChild(sp);
        if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
        return sp;
      });
      const groups = [];
      let cur = null;
      let top = null;
      spans.forEach((sp) => {
        const t = sp.offsetTop;
        if (cur === null || Math.abs(t - top) > 2) { cur = []; groups.push(cur); top = t; }
        cur.push(sp);
      });
      inners = buildLines(groups);
    }

    if (reduced) {
      gsap.set(inners, { yPercent: 0 });
      return undefined;
    }

    if (manual) {
      gsap.set(inners, { yPercent });
      return undefined;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(inners, { yPercent }, {
        yPercent: 0,
        duration,
        delay,
        stagger,
        ease: EASE.out,
        scrollTrigger: { trigger: el, start, once },
      });
    }, el);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delay, stagger, duration, yPercent, start, once, manual]);

  return <Tag ref={ref} className={className} {...rest}>{text || (Array.isArray(lines) ? lines[0] : '')}</Tag>;
}
