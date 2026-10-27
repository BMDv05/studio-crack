/* Double H Studio — animation config + GSAP setup.
   Every duration, easing and color the site animates with lives here,
   so timing stays consistent and is easy to change in one place. */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(ScrollTrigger, CustomEase);

/* The interface curve — cubic-bezier(0.16, 1, 0.3, 1). GSAP has no
   cubic-bezier parser, so the same curve is registered once and used by name.
   Long, soft expo with zero overshoot: the site assembles, it never bounces. */
CustomEase.create('dh-ui', 'M0,0 C0.16,1 0.3,1 1,1');

/* Brand colors — mirror styles/tokens.css (keep in sync). */
export const COLORS = {
  ink: '#12393a',
  green: '#134c4b',
  mist: '#e6ecec',
  sage: '#46766f',
  black: '#161919',
  white: '#ffffff',
};

/* Easings */
export const EASE = {
  out: 'expo.out',       // reveals, fades
  ui: 'dh-ui',           // the interface pop-up curve (cubic-bezier .16,1,.3,1)
  inOut: 'power3.inOut', // drawing lines, wipes
  curtain: 'power4.inOut', // preloader panels / page transitions
  soft: 'power2.out',
};

/* Durations (seconds) */
export const DUR = {
  preloaderMin: 2.6,  // the build settles here; no artificial hold after it
  preloaderMax: 3.8,  // hard cap, exit begins no later than this
  preloaderExit: 0.8,  // curtain slide
  reveal: 0.8,
  revealY: 40,
  stagger: 0.09,
  splitStagger: 0.11,
  nav: 0.45,
  transition: 0.6,     // route wipe
};

/* Lenis smooth-scroll options (duration ~1.1, expo easing) */
export const LENIS_OPTS = {
  duration: 1.1,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
  wheelMultiplier: 1,
  touchMultiplier: 1.6,
};

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const isSmallScreen = () =>
  typeof window !== 'undefined' && window.innerWidth < 760;

/* Reveals play once and feel "built", not bouncy. */
ScrollTrigger.defaults({ toggleActions: 'play none none none' });

export function refreshScroll() {
  ScrollTrigger.refresh();
}

export { gsap, ScrollTrigger };
