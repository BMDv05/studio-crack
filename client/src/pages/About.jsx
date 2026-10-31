import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import PageMeta from '../components/PageMeta.jsx';
import SplitText from '../components/SplitText.jsx';
import Reveal from '../components/Reveal.jsx';
import ParallaxImage from '../components/ParallaxImage.jsx';
import { HMark } from '../components/Wordmark.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useAppReady } from '../hooks/useAppReady.jsx';
import { gsap, EASE, prefersReducedMotion } from '../lib/anim.js';
import styles from './About.module.css';

const CRAFT_KEYS = ['brand', 'arch', 'video', 'social', 'digital'];
const FACT_KEYS = ['base', 'room', 'craft', 'formats', 'hours'];
const METHOD_KEYS = ['s1', 's2', 's3', 's4'];
const VALUE_KEYS = ['v1', 'v2', 'v3'];
const CHAPTERS = [
  { id: 'studio', key: 'studio' },
  { id: 'craft', key: 'craft' },
  { id: 'method', key: 'method' },
];

export default function About() {
  const { t, lang } = useLang();
  const { ready } = useAppReady();
  const heroRef = useRef(null);
  const methodRef = useRef(null);
  const methodLineRef = useRef(null);

  /* Set the hero's pre-entrance state before paint. */
  useLayoutEffect(() => {
    const el = heroRef.current;
    if (!el || prefersReducedMotion()) return;
    const q = gsap.utils.selector(el);
    gsap.set(q('[data-hero-fade]'), { opacity: 0, y: 20 });
    gsap.set(q('[data-hero-plate]'), {
      opacity: 0,
      clipPath: 'inset(0% 0% 100% 0%)',
    });
  }, []);

  /* The dossier assembles once the intro curtain has opened: plate first,
     then the title lines, then the editorial annotations. */
  useLayoutEffect(() => {
    if (!ready) return undefined;
    const el = heroRef.current;
    if (!el) return undefined;

    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(el);

      if (prefersReducedMotion()) {
        gsap.set(q('[data-hero-fade]'), { opacity: 1, y: 0 });
        gsap.set(q('[data-hero-plate]'), {
          opacity: 1,
          clipPath: 'inset(0% 0% 0% 0%)',
        });
        gsap.set(q('.st-inner'), { yPercent: 0 });
        return;
      }

      const tl = gsap.timeline({ defaults: { ease: EASE.ui } });
      tl.to(
        q('[data-hero-plate]'),
        {
          opacity: 1,
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: 0.9,
          ease: EASE.out,
        },
        0,
      )
        .to(
          q('.st-inner'),
          { yPercent: 0, duration: 0.85, stagger: 0.1, ease: EASE.out },
          0.18,
        )
        .to(
          q('[data-hero-fade]'),
          { opacity: 1, y: 0, duration: 0.55, stagger: 0.06 },
          0.4,
        );
    }, el);

    return () => ctx.revert();
  }, [ready, lang]);

  /* Draw the method line with the scroll, exactly like the home call sheet. */
  useLayoutEffect(() => {
    const section = methodRef.current;
    const line = methodLineRef.current;
    if (!section || !line) return undefined;

    if (prefersReducedMotion()) {
      gsap.set(line, { scaleY: 1, transformOrigin: 'top center' });
      return undefined;
    }

    const stepsWrap = line.parentElement;
    const mm = gsap.matchMedia();

    /* Mobile: speed up line drawing to track steps directly */
    mm.add('(max-width: 999px)', () => {
      gsap.fromTo(
        line,
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: 'none',
          transformOrigin: 'top center',
          scrollTrigger: {
            trigger: stepsWrap || section,
            start: 'top 75%',
            end: 'bottom 55%',
            scrub: 0.15,
          },
        },
      );
    });

    /* Desktop: untouched original values */
    mm.add('(min-width: 1000px)', () => {
      gsap.fromTo(
        line,
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: 'none',
          transformOrigin: 'top center',
          scrollTrigger: {
            trigger: section,
            start: 'top 76%',
            end: 'bottom 70%',
            scrub: 0.6,
          },
        },
      );
    });

    return () => mm.revert();
  }, []);

  return (
    <>
      <PageMeta
        title={t('about.meta.title')}
        description={t('about.meta.description')}
      />

      <div className={styles.page}>
        {/* ------------------------------------------------------------------ */}
        {/* Hero                                                               */}
        {/* ------------------------------------------------------------------ */}
        <section
          ref={heroRef}
          className={`on-dark ${styles.hero}`}
          aria-labelledby="about-title"
        >
          <div className="wrap">
            <div className={styles.heroTopline} data-hero-fade>
              <span className={styles.annotation}>{t('about.hero.topline')}</span>
              <span className={styles.mono}>31.9539° N · 35.9106° E</span>
              <span className={styles.annotation}>{t('about.hero.year')}</span>
            </div>

            <div className={styles.heroGrid}>
              <div className={styles.heroTitleCol}>
                <p
                  className={`eyebrow ${styles.heroEyebrow}`}
                  data-hero-fade
                >
                  {t('about.hero.eyebrow')}
                </p>
                <SplitText
                  as="h1"
                  id="about-title"
                  manual
                  text={t('about.hero.title')}
                  className={styles.heroTitle}
                />
              </div>

              <div className={styles.heroAside} data-hero-fade>
                <p className={styles.heroLede}>{t('about.hero.lede')}</p>
                <div className={styles.heroActions}>
                  <Link className="btn btn-dark" to="/book">
                    {t('common.book')}
                  </Link>
                  <Link className="btn btn-ghost-dark" to="/work">
                    {t('about.hero.ctaWork')}
                  </Link>
                </div>
                <p className={styles.heroNote}>{t('about.hero.note')}</p>
              </div>
            </div>

            <figure className={styles.heroPlate} data-hero-plate>
              <img
                src="/video/studio-build-still.webp"
                alt={t('about.hero.plateAlt')}
                width="1280"
                height="720"
                loading="eager"
                decoding="async"
              />
              <span className={styles.plateGrade} aria-hidden="true" />
              <span className={styles.plateGrain} aria-hidden="true" />
              <span className={styles.plateLabelTop}>
                {t('about.hero.plate')}
              </span>
              <span className={styles.cropTL} aria-hidden="true" />
              <span className={styles.cropTR} aria-hidden="true" />
              <span className={styles.cropBL} aria-hidden="true" />
              <span className={styles.cropBR} aria-hidden="true" />
              <figcaption className={styles.plateCaption}>
                <span className={styles.annotation}>
                  {t('about.dossier.eyebrow')}
                </span>
                <p>{t('about.hero.plateCaption')}</p>
              </figcaption>
              <span className={styles.plateMeta}>
                {t('about.hero.plateMeta')}
              </span>
            </figure>

            <nav
              className={styles.heroIndex}
              aria-label={t('about.chapters.label')}
              data-hero-fade
            >
              <span className={styles.indexLabel}>
                {t('about.chapters.label')}
              </span>
              <ol className={styles.indexList}>
                {CHAPTERS.map((chapter, i) => (
                  <li key={chapter.id}>
                    <a className={styles.indexLink} href={`#${chapter.id}`}>
                      <span className={styles.indexNum}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span>{t(`about.chapters.${chapter.key}`)}</span>
                    </a>
                  </li>
                ))}
              </ol>
              <span className={styles.indexScroll}>
                {t('about.hero.scroll')}
                <span aria-hidden="true"> ↓</span>
              </span>
            </nav>
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* The room                                                           */}
        {/* ------------------------------------------------------------------ */}
        <section
          id="studio"
          className={`on-dark ${styles.section} ${styles.dossier}`}
          aria-labelledby="studio-title"
        >
          <div className="wrap">
            <header className={styles.sectionHead}>
              <div className={styles.sectionHeadTitle}>
                <p className={`eyebrow ${styles.sectionEyebrow}`}>
                  {t('about.dossier.eyebrow')}
                </p>
                <SplitText
                  as="h2"
                  id="studio-title"
                  text={t('about.dossier.title')}
                  className={styles.headTitle}
                />
              </div>
              <Reveal as="p" className={styles.headLede} delay={0.1}>
                {t('about.dossier.lede')}
              </Reveal>
            </header>

            <div className={styles.dossierGrid}>
              <Reveal as="figure" className={styles.dossierFigure} y={30}>
                <div className={styles.dossierMedia}>
                  <ParallaxImage
                    src="/hero/studio-wall.jpg"
                    alt={t('about.dossier.alt')}
                    className={styles.dossierParallax}
                    strength={0.05}
                  />
                  <span className={styles.cropTL} aria-hidden="true" />
                  <span className={styles.cropTR} aria-hidden="true" />
                  <span className={styles.cropBL} aria-hidden="true" />
                  <span className={styles.cropBR} aria-hidden="true" />
                  <span className={styles.mediaTag}>
                    {t('about.chapters.studio')} / 01
                  </span>
                </div>
                <figcaption className={styles.mediaCaption}>
                  <span>{t('about.dossier.caption')}</span>
                  <span className={styles.mono}>ISO 400 · ƒ/2.8</span>
                </figcaption>
              </Reveal>

              <Reveal className={styles.dossierCopy} delay={0.12}>
                <p className={styles.dossierLead}>{t('about.dossier.body1')}</p>
                <p>{t('about.dossier.body2')}</p>
                <dl className={styles.factList}>
                  {FACT_KEYS.map((key) => (
                    <div className={styles.factRow} key={key}>
                      <dt className={styles.annotation}>
                        {t(`about.dossier.facts.${key}.k`)}
                      </dt>
                      <dd>{t(`about.dossier.facts.${key}.v`)}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
            </div>

            <Reveal className={styles.studioNote} delay={0.08}>
              <span className={styles.annotation}>
                {t('about.dossier.noteLabel')}
              </span>
              <blockquote className={styles.quote}>
                {t('about.dossier.note')}
              </blockquote>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* Five crafts                                                        */}
        {/* ------------------------------------------------------------------ */}
        <section
          id="craft"
          className={`on-dark ${styles.section} ${styles.craftSection}`}
          aria-labelledby="craft-title"
        >
          <div className="wrap">
            <header className={styles.sectionHead}>
              <div className={styles.sectionHeadTitle}>
                <p className={`eyebrow ${styles.sectionEyebrow}`}>
                  {t('about.craft.eyebrow')}
                </p>
                <SplitText
                  as="h2"
                  id="craft-title"
                  text={t('about.craft.title')}
                  className={styles.headTitle}
                />
              </div>
              <Reveal as="p" className={styles.headLede} delay={0.1}>
                {t('about.craft.lede')}
              </Reveal>
            </header>

            <Reveal as="ol" className={styles.craftList} stagger={0.07}>
              {CRAFT_KEYS.map((key, i) => (
                <li className={styles.craftRow} key={key}>
                  <span className={styles.craftNum}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className={styles.craftName}>
                    <h3>{t(`about.crafts.${key}.h`)}</h3>
                    <div className={styles.craftTags}>
                      <span>{t(`about.craft.tags.${key}.a`)}</span>
                      <span>{t(`about.craft.tags.${key}.b`)}</span>
                    </div>
                  </div>
                  <p className={styles.craftDesc}>
                    {t(`about.crafts.${key}.p`)}
                  </p>
                </li>
              ))}
            </Reveal>

            <Reveal className={styles.craftFoot} delay={0.05}>
              <p>{t('about.craft.note')}</p>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* Method + principles                                                */}
        {/* ------------------------------------------------------------------ */}
        <section
          id="method"
          className={`${styles.section} ${styles.methodSection}`}
          aria-labelledby="method-title"
        >
          <div className="wrap">
            <header className={styles.sectionHead}>
              <div className={styles.sectionHeadTitle}>
                <p className="eyebrow">{t('about.method.eyebrow')}</p>
                <SplitText
                  as="h2"
                  id="method-title"
                  text={t('about.method.title')}
                  className={styles.headTitle}
                />
              </div>
              <Reveal as="p" className={styles.headLede} delay={0.1}>
                {t('about.method.lede')}
              </Reveal>
            </header>

            <div className={styles.methodGrid} ref={methodRef}>
              <div className={styles.methodSteps}>
                <span
                  ref={methodLineRef}
                  className={styles.methodLine}
                  aria-hidden="true"
                />
                <Reveal as="ol" className={styles.methodList} stagger={0.08}>
                  {METHOD_KEYS.map((key, i) => (
                    <li className={styles.methodStep} key={key}>
                      <span className={styles.methodIndex}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <h3>{t(`about.method.steps.${key}.h`)}</h3>
                      <p>{t(`about.method.steps.${key}.p`)}</p>
                    </li>
                  ))}
                </Reveal>
              </div>

              <Reveal as="aside" className={styles.principles} delay={0.1}>
                <p className="eyebrow">
                  {t('about.method.principlesEyebrow')}
                </p>
                <h3 className={styles.principlesTitle}>
                  {t('about.method.principlesTitle')}
                </h3>
                <ol className={styles.principlesList}>
                  {VALUE_KEYS.map((key, i) => (
                    <li className={styles.principle} key={key}>
                      <span className={styles.principleIndex}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <h4>{t(`about.values.${key}.h`)}</h4>
                        <p>{t(`about.values.${key}.p`)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* CTA                                                                */}
        {/* ------------------------------------------------------------------ */}
        <section
          className={`on-dark ${styles.ctaSection}`}
          aria-labelledby="about-cta-title"
        >
          <span className={styles.ctaBackdrop} aria-hidden="true" />
          <span className={styles.ctaGrade} aria-hidden="true" />
          <span className={styles.ctaGrain} aria-hidden="true" />

          <div className={`wrap ${styles.ctaInner}`}>
            <Reveal className={styles.ctaCard}>
              <span className={styles.cropTL} aria-hidden="true" />
              <span className={styles.cropTR} aria-hidden="true" />
              <span className={styles.cropBL} aria-hidden="true" />
              <span className={styles.cropBR} aria-hidden="true" />

              <div className={styles.ctaCopy}>
                <p className={`eyebrow ${styles.sectionEyebrow}`}>
                  {t('about.cta.eyebrow')}
                </p>
                <SplitText
                  as="h2"
                  id="about-cta-title"
                  text={t('about.cta.title')}
                  className={styles.ctaTitle}
                />
                <p className={styles.ctaLede}>{t('about.cta.lede')}</p>
                <div className={styles.ctaActions}>
                  <Link className="btn btn-dark" to="/book">
                    {t('about.cta.primary')}
                  </Link>
                  <Link className="btn btn-ghost-dark" to="/work">
                    {t('about.cta.secondary')}
                  </Link>
                </div>
                <p className={styles.ctaNote}>{t('about.cta.note')}</p>
              </div>

              <div className={styles.ctaAside}>
                <span className={styles.ctaMark} aria-hidden="true">
                  <HMark size={52} />
                </span>
                <dl className={styles.contactList}>
                  <div>
                    <dt>{t('about.cta.emailLabel')}</dt>
                    <dd>
                      <a href="mailto:studio@doubleh.example" dir="ltr">
                        {t('about.cta.email')}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>{t('about.cta.locationLabel')}</dt>
                    <dd>{t('about.cta.location')}</dd>
                  </div>
                  <div>
                    <dt>{t('about.cta.hoursLabel')}</dt>
                    <dd>{t('about.cta.hours')}</dd>
                  </div>
                </dl>
              </div>
            </Reveal>
          </div>
        </section>
      </div>
    </>
  );
}
