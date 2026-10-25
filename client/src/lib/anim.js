/* Double H Studio — animation config + GSAP setup.
   Every duration, easing and color the site animates with lives here,
   so timing stays consistent and is easy to change in one place. */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

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
  inOut: 'power3.inOut', // drawing lines, wipes
  curtain: 'power4.inOut', // preloader panels / page transitions
  soft: 'power2.out',
};

/* Durations (seconds) */
export const DUR = {
  preloaderMin: 3,     // counter can never finish before this
  preloaderMax: 4.2,   // hard cap, exit begins no later than this
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
