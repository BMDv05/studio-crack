import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger, LENIS_OPTS, prefersReducedMotion, refreshScroll } from '../lib/anim.js';

/* While the preloader plays (or a modal is open) scrolling is locked.
   The flag is module-level so it still applies when Lenis is created after
   the lock was requested (hooks run child-first). */
let scrollLocked = false;

export function lockScroll() {
  scrollLocked = true;
  if (typeof document !== 'undefined') document.body.style.overflow = 'hidden';
  if (window.__lenis && window.__lenis.stop) window.__lenis.stop();
}

export function unlockScroll() {
  scrollLocked = false;
  if (typeof document !== 'undefined') document.body.style.overflow = '';
  if (window.__lenis && window.__lenis.start) window.__lenis.start();
}

/* Lenis smooth scrolling wired into the GSAP ticker + ScrollTrigger.
   Disabled entirely under prefers-reduced-motion (native scroll is used).
   Anchor links (#hash) scroll smoothly; expose scrollToTop() for route changes. */
export default function useLenis(enabled = true) {
  useEffect(() => {
    if (!enabled || prefersReducedMotion()) return undefined;

    const lenis = new Lenis(LENIS_OPTS);
    window.__lenis = lenis;
    if (scrollLocked) lenis.stop();

    /* Keep ScrollTrigger in sync with Lenis. */
    lenis.on('scroll', ScrollTrigger.update);
    const raf = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    /* Anchor links scroll smoothly. */
    const onClick = (e) => {
      const link = e.target && e.target.closest && e.target.closest('a[href^="#"]');
      if (!link) return;
      const id = link.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -80 });
    };
    document.addEventListener('click', onClick);

    refreshScroll();

    return () => {
      document.removeEventListener('click', onClick);
      gsap.ticker.remove(raf);
      lenis.destroy();
      window.__lenis = null;
    };
  }, [enabled]);
}

/* Jump/scroll to the top — via Lenis when it is running.
   immediate=true is an instant jump (route changes); false animates smoothly. */
export function scrollToTop(immediate = true) {
  if (typeof window === 'undefined') return;
  if (window.__lenis && window.__lenis.scrollTo) {
    window.__lenis.scrollTo(0, { immediate });
    return;
  }
  window.scrollTo({ top: 0, left: 0, behavior: immediate ? 'auto' : 'smooth' });
}
