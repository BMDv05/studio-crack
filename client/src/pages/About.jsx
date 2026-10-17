import { Link } from 'react-router-dom';
import PageMeta from '../components/PageMeta.jsx';
import { useRevealRoot } from '../hooks/useReveal.js';
import styles from './About.module.css';

const CRAFTS = [
  ['Brand Identity & Logo', 'Premium marks, wordmarks, and launch kits — built in the deep-green Double H language with full usage guidelines.'],
  ['Architectural Visualization', 'Stills and fly-throughs that connect architectural history with modern application — spatial design as storytelling.'],
  ['Cinematic Video & Showreel', 'Short loops under 10 seconds for hero sections, plus full project films with sound design.'],
  ['Social Media Video', 'Vertical cuts engineered for Reels, TikTok and Shorts — the same craft, reframed for the feed.'],
  ['Digital Design Systems', 'Component libraries, tokens and documentation so the identity survives contact with real product work.'],
];

const VALUES = [
  ['Education-grade craft', 'Techniques borrowed from academic rigor: reference, iterate, document.'],
  ['One studio, one language', 'Every deliverable speaks the same visual dialect — green, mist, sage.'],
  ['Proof over promises', 'We show the work before we describe it. The portfolio is the pitch.'],
];

export default function About() {
  const rootRef = useRevealRoot();
  return (
    <>
      <PageMeta
        title="About — Double H Studio"
        description="Double H Studio is a creative studio working across brand identity, architectural visualization and cinematic video."
      />
      <div ref={rootRef}>
        <section className="section">
          <div className="wrap">
            <p className="eyebrow reveal">About</p>
            <h1 className="reveal">A studio built on craft.</h1>
            <p className={`${styles.lede} reveal`} data-delay="1">
              Double H Studio works across brand identity, architectural visualization and cinematic
              video. We treat every project like a piece of research: reference deeply, iterate
              visibly, document everything — then ship work that feels inevitable.
            </p>

            <div className={styles.crafts}>
              {CRAFTS.map(([h, p], i) => (
                <div className={`${styles.craft} reveal`} data-delay={i % 3} key={h}>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-light">
          <div className="wrap">
            <p className="eyebrow reveal">How we work</p>
            <h2 className="reveal">Three principles, applied daily.</h2>
            <div className={styles.values}>
              {VALUES.map(([h, p], i) => (
                <div className={`${styles.value} reveal`} data-delay={i} key={h}>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </div>
              ))}
            </div>
            <div className={`${styles.ctaRow} reveal`}>
              <Link className="btn btn-light" to="/work">Explore Our Work</Link>
              <Link className="btn btn-ghost-light" to="/book">Book a Meeting</Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
