import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PageMeta from '../components/PageMeta.jsx';
import { useRevealRoot } from '../hooks/useReveal.js';
import styles from './Home.module.css';

const HERO_SRC = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const HERO_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23134c4b'/%3E%3Cstop offset='1' stop-color='%23161919'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1280' height='720' fill='url(%23g)'/%3E%3C/svg%3E";

function Hero() {
  const videoRef = useRef(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    try {
      const saveData = navigator.connection && navigator.connection.saveData;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if ((saveData || reduced) && videoRef.current) {
        videoRef.current.pause();
        setPaused(true);
      }
    } catch { /* ignore */ }
  }, []);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPaused(false); }
    else { v.pause(); setPaused(true); }
  };

  return (
    <section className={styles.hero} aria-label="Showreel hero">
      <video ref={videoRef} autoPlay muted loop playsInline preload="metadata" poster={HERO_POSTER} className={styles.heroVideo}>
        <source src={HERO_SRC} type="video/mp4" />
      </video>
      <div className={styles.heroInner}>
        <p className={`${styles.eyebrow} eyebrow`}>Double H Studio</p>
        <h1 className={styles.title}>Cinematic stories,<br />built environments.</h1>
        <p className={styles.lede}>We are a creative studio working across brand identity, architectural visualization and cinematic short video — with one promise: education-grade craft, applied to real client work.</p>
        <div className={styles.ctaRow}>
          <Link className="btn btn-dark" to="/work">Explore Our Work</Link>
          <Link className="btn btn-ghost-dark" to="/book">Book a Meeting</Link>
        </div>
      </div>
      <div className={styles.heroCtrl}>
        <button type="button" onClick={toggle}>{paused ? 'Play background video' : 'Pause background video'}</button>
      </div>
    </section>
  );
}

const CRAFTS = [
  { h: 'Brand Identity & Logo', p: 'Premium marks, guidelines and launch kits in the deep-green Double H language.' },
  { h: 'Architectural Visualization', p: 'Stills and fly-throughs that connect architectural history with modern application.' },
  { h: 'Cinematic Video & Showreel', p: 'Short loops under 10 seconds for hero sections, plus full project films with sound design.' },
];

const STEPS = [
  ['1 · Visit', 'Explore the work.'],
  ['2 · Submit', 'Fill in the booking form.'],
  ['3 · Validate', 'We check and store it.'],
  ['4 · Notify', 'Email sent to the studio.'],
  ['5 · Confirm', 'Studio replies manually.'],
];

export default function Home() {
  const rootRef = useRevealRoot();
  return (
    <>
      <PageMeta
        title="Double H Studio — Cinematic productions & social videos"
        description="Double H Studio: cinematic short videos, brand identity and spatial design. Explore our work and book a meeting in one click."
      />
      <div ref={rootRef}>
        <Hero />
        <section className="section">
          <div className="wrap">
            <p className="eyebrow reveal">What we do</p>
            <h2 className="reveal">One studio, five crafts.</h2>
            <p className={`${styles.lede} reveal`} data-delay="1">Every project ships as a short cinematic piece plus the design system behind it — so you can see the work and use it.</p>
            <div className={styles.cards}>
              {CRAFTS.map((c, i) => (
                <div className={`${styles.card} reveal`} data-delay={i} key={c.h}>
                  <h3>{c.h}</h3>
                  <p>{c.p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="section section-light">
          <div className="wrap">
            <p className="eyebrow reveal">Booking</p>
            <h2 className="reveal">Request a meeting in under a minute.</h2>
            <p className={`${styles.lede} reveal`} data-delay="1">Send your preferred date and time. The studio replies by email — usually within 2 working days. A request is not a confirmed slot until we reply.</p>
            <div className={styles.steps} role="list" aria-label="Booking steps">
              {STEPS.map(([b, t]) => (
                <div className={`${styles.step} reveal`} role="listitem" key={b}><b>{b}</b>{t}</div>
              ))}
            </div>
            <div className={`${styles.ctaRow} reveal`}>
              <Link className="btn btn-light" to="/book">Book a Meeting</Link>
              <Link className="btn btn-ghost-light" to="/about">About the studio</Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
