import { useEffect, useRef } from 'react';
import { gsap, EASE, prefersReducedMotion, isSmallScreen } from '../lib/anim.js';
import s from './ParallaxImage.module.css';

/* Media that "develops" as it enters the viewport:
   clip-path inset reveal + scale (1.15 → 1) + a subtle scroll parallax.
   Pass `src` for an <img>, or children for any media (e.g. a <video>).
   When parallax is on (strength > 0) the media settles at 1.12 so the
   movement never exposes the wrapper's edges. */
export default function ParallaxImage({
  src,
  alt = '',
  children,
  className,
  strength = 0.06,
  start = 'top 85%',
  once = true,
}) {
  const wrapRef = useRef(null);
  const mediaRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const media = mediaRef.current;
    if (!wrap || !media) return undefined;

    const parallax = strength > 0;

    if (prefersReducedMotion()) {
      gsap.set(wrap, { clipPath: 'inset(0% 0% 0% 0%)' });
      gsap.set(media, { scale: 1, yPercent: 0 });
      return undefined;
    }

    const amount = Math.min(strength, 0.06) * (isSmallScreen() ? 0.5 : 1);
    const restScale = parallax ? 1.12 : 1;

    const ctx = gsap.context(() => {
      gsap.fromTo(wrap,
        { clipPath: 'inset(0% 0% 100% 0%)' },
        {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: 1.1,
          ease: EASE.out,
          scrollTrigger: { trigger: wrap, start, once },
        });

      gsap.fromTo(media,
        { scale: 1.15 },
        {
          scale: restScale,
          duration: 1.4,
          ease: EASE.out,
          scrollTrigger: { trigger: wrap, start, once },
        });

      if (parallax) {
        gsap.fromTo(media,
          { yPercent: -amount * 100 },
          {
            yPercent: amount * 100,
            ease: 'none',
            scrollTrigger: { trigger: wrap, start: 'top bottom', end: 'bottom top', scrub: true },
          });
      }
    }, wrap);

    return () => ctx.revert();
  }, [strength, start, once]);

  return (
    <div ref={wrapRef} className={`${s.wrap} ${className || ''}`}>
      {src ? (
        <img ref={mediaRef} className={s.media} src={src} alt={alt} loading="lazy" />
      ) : (
        <div ref={mediaRef} className={s.media}>{children}</div>
      )}
    </div>
  );
}
