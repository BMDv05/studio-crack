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

const WA_NUMBER = '+963 963 1020 26';
const WA_LINK = 'https://wa.me/963963102026';

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

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
        <section className="section" aria-label="WhatsApp contact">
          <div className="wrap">
            <div className={styles.waCard}>
              <div className="reveal">
                <p className="eyebrow">Chat with us</p>
                <h2>Talk to the studio on WhatsApp.</h2>
                <p className={styles.waLede}>Quick questions, briefs and references — message us directly and we usually reply within 2 working days.</p>
              </div>
              <div className={`${styles.waActions} reveal`} data-delay="1">
                <a className="btn btn-dark" href={WA_LINK} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon /> WhatsApp the studio
                </a>
                <a className={styles.waNumber} href={WA_LINK} target="_blank" rel="noopener noreferrer">{WA_NUMBER}</a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
