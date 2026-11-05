import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import SplitText from "../components/SplitText.jsx";
import Reveal from "../components/Reveal.jsx";
import StudioBlueprintAnimation from "../components/studio/StudioBlueprintAnimation.jsx";
import CallSlate from "../components/studio/CallSlate.jsx";
import { useLang } from "../i18n/LanguageContext.jsx";
import {
  gsap,
  ScrollTrigger,
  EASE,
  prefersReducedMotion,
} from "../lib/anim.js";
import styles from "./Home.module.css";

const HERO_SERVICE_KEYS = ["brand", "arch", "video", "social", "digital"];

/* The stage picture. Fixed for the page, inline for the hero inside the
   opening. Both use the same light: the wall stays visible across the frame,
   with only the left-hand scrim kept for copy contrast. */
function HomeBackdrop({ inline = false }) {
  return (
    <div
      className={`${styles.backdrop}${inline ? ` ${styles.backdropInline}` : ""}`}
      aria-hidden="true"
    >
      <div className={styles.backdropImage} />
      <div className={styles.backdropGrade} />
      <div className={styles.backdropScrim} />
      <div className={styles.backdropGrain} />
    </div>
  );
}

/* The finished website screen: the studio plate is the last frame of the
   lens crossing, so this is what the camera opens onto. The interface fades
   in with the aperture (--plate-ui) and the photograph resolves out of the
   dark (--plate-dark / --plate-blur) — both are written by the opening. */
function Hero() {
  const { t } = useLang();

  return (
    <section className={styles.hero} aria-label={t("home.hero.aria")}>
      <HomeBackdrop inline />
      <span className={styles.heroDarkness} aria-hidden="true" />

      <div className={styles.hud} aria-hidden="true">
        <span className={`${styles.hudCorner} ${styles.hudTL}`} />
        <span className={`${styles.hudCorner} ${styles.hudTR}`} />
        <span className={`${styles.hudCorner} ${styles.hudBL}`} />
        <span className={`${styles.hudCorner} ${styles.hudBR}`} />
      </div>

      <div className={styles.lock} aria-hidden="true">
        <span className={`${styles.lockCorner} ${styles.lockTL}`} />
        <span className={`${styles.lockCorner} ${styles.lockTR}`} />
        <span className={`${styles.lockCorner} ${styles.lockBL}`} />
        <span className={`${styles.lockCorner} ${styles.lockBR}`} />
        <span className={styles.lockDot} />
        <span className={styles.lockLabel}>AF LOCK</span>
      </div>

      {/* The finished screen wears the site's own header, not a second bar:
          the opening hands the top of the frame back to it once the aperture
          is full. See StudioBlueprintAnimation. */}
      <div className={styles.heroShell}>
        <div className={styles.heroBody}>
          <div className={styles.heroInner}>
            <p className={`${styles.eyebrow} eyebrow`}>
              {t("home.hero.eyebrow")}
            </p>
            <SplitText
              as="h1"
              className={styles.title}
              lines={[t("home.hero.title1"), t("home.hero.title2")]}
            />
            <p className={styles.lede}>{t("home.hero.lede")}</p>
            <div className={styles.ctaRow}>
              <Link className="btn btn-dark" to="/work">
                {t("home.hero.ctaWork")}
              </Link>
              <Link className="btn btn-ghost-dark" to="/book">
                {t("home.hero.ctaBook")}
              </Link>
            </div>
          </div>

          <div className={styles.heroSide} aria-hidden="true">
            <span className={styles.sideRule} />
            <span className={styles.sideText}>
              SHOWREEL / 2026
              <span className={styles.sideDot} />
              LOCKED
            </span>
          </div>
        </div>

        <div className={styles.heroRail}>
          <span className={styles.railRule} aria-hidden="true" />
          <span className={styles.railRec}>
            <span className={styles.recDot} />
            REC
          </span>
          <ul
            className={styles.railServices}
            aria-label={t("home.what.eyebrow")}
          >
            {HERO_SERVICE_KEYS.map((key) => (
              <li className={styles.railService} key={key}>
                <span className={styles.railMark} aria-hidden="true" />
                {t(`home.ticker.${key}`)}
              </li>
            ))}
          </ul>
          <span className={styles.railLocation}>
            {t("home.ticker.location")}
          </span>
        </div>
      </div>
    </section>
  );
}

const CRAFT_KEYS = ["brand", "arch", "video", "social", "digital"];
const STEP_KEYS = ["step1", "step2", "step3", "step4", "step5"];
const STEP_TIMES = ["00:00", "00:12", "00:28", "00:46", "01:00"];
const STOP_LABELS = ["f/1.4", "f/2", "f/2.8", "f/4", "f/5.6"];

export default function Home() {
  const { t, lang } = useLang();
  const [filmDone, setFilmDone] = useState(false);
  const [homeReady, setHomeReady] = useState(false);
  const callRef = useRef(null);
  const callLineRef = useRef(null);
  const openSite = useCallback(() => setFilmDone(true), []);

  /* Re-create the homepage's scroll triggers after the pinned studio has let go.
     Triggers born while a pin is active measure the rest of the page without
     the pin's spacing, and a later refresh does not repair their cached
     start/end points. The copy stays in the document the whole time; only the
     animated sections are re-keyed once the pin has released, so every new
     trigger is measured against the final document height. */
  useEffect(() => {
    if (!filmDone) return undefined;
    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => setHomeReady(true));
    });
    return () => {
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
    };
  }, [filmDone]);

  /* Re-measure once the new sections are in the document, and again after a
     language switch changes their line heights. */
  useEffect(() => {
    if (!homeReady) return undefined;
    const id = window.requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => window.cancelAnimationFrame(id);
  }, [homeReady, lang]);

  /* Draw the call-sheet timeline as the booking section passes through. */
  useLayoutEffect(() => {
    if (!homeReady) return undefined;
    const section = callRef.current;
    const line = callLineRef.current;
    if (!section || !line) return undefined;

    if (prefersReducedMotion()) {
      gsap.set(line, { scaleY: 1, transformOrigin: "top center" });
      return undefined;
    }

    const timelineWrap = line.parentElement;
    const mm = gsap.matchMedia();

    /* Mobile: speed up the line so it tracks the 5 steps directly, not the whole section which includes the slate below */
    mm.add('(max-width: 999px)', () => {
      gsap.fromTo(
        line,
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: 'none',
          transformOrigin: 'top center',
          scrollTrigger: {
            trigger: timelineWrap || section,
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
            start: 'top 74%',
            end: 'bottom 68%',
            scrub: 0.6,
          },
        },
      );
    });

    return () => mm.revert();
  }, [homeReady]);

  return (
    <>
      <PageMeta
        title={t("home.meta.title")}
        description={t("home.meta.description")}
      />
      {/* The studio opening is the first frame; the camera crosses the lens and
          opens onto the finished website screen (the hero). The hero is the
          opening's final frame, so the two never show as separate sections. */}
      <HomeBackdrop />
      <StudioBlueprintAnimation onDone={openSite} finale={<Hero />} />

      <Fragment key={homeReady ? "home-ready" : "home-intro"}>
        <section
          className={`section ${styles.lensSection}`}
          aria-labelledby="studio-lens-title"
        >
          <div className={`wrap ${styles.lensGrid}`}>
            <div className={styles.lensCol}>
              <p className="eyebrow">{t("home.what.eyebrow")}</p>
              <SplitText
                id="studio-lens-title"
                as="h2"
                className={styles.lensTitle}
                text={t("home.what.title")}
              />
              <Reveal
                as="p"
                className={`${styles.lede} ${styles.lensLede}`}
                delay={0.15}
              >
                {t("home.what.lede")}
              </Reveal>
              <Reveal className={styles.lensPicture} delay={0.25}>
                <img
                  src="/hero/craft-lens.webp"
                  alt=""
                  width="1200"
                  height="800"
                  loading="lazy"
                  decoding="async"
                />
              </Reveal>
            </div>
            <div className={styles.lensCopy}>
              <Reveal as="ul" className={styles.focusList} stagger>
                {CRAFT_KEYS.map((key, i) => (
                  <li className={styles.focusItem} key={key}>
                    <span className={styles.focusIndex}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className={styles.focusBody}>
                      <h3>{t(`home.crafts.${key}.h`)}</h3>
                      <p>{t(`home.crafts.${key}.p`)}</p>
                    </div>
                    <span className={styles.focusStop}>{STOP_LABELS[i]}</span>
                  </li>
                ))}
              </Reveal>
            </div>
          </div>
        </section>

        <section
          ref={callRef}
          className={`section section-light ${styles.callSection}`}
        >
          <div className="wrap">
            <div className={styles.callGrid}>
              <div className={styles.slateCol}>
                <CallSlate />
              </div>
              <div className={styles.callCopy}>
                <p className="eyebrow">{t("home.booking.eyebrow")}</p>
                <SplitText as="h2" text={t("home.booking.title")} />
                <Reveal as="p" className={styles.lede} delay={0.15}>
                  {t("home.booking.lede")}
                </Reveal>
                <div className={styles.timelineWrap}>
                  <span
                    ref={callLineRef}
                    className={styles.timelineLine}
                    aria-hidden="true"
                  />
                  <Reveal
                    as="ol"
                    className={styles.timeline}
                    aria-label={t("home.booking.stepsAria")}
                    stagger
                  >
                    {STEP_KEYS.map((key, i) => (
                      <li className={styles.step} key={key}>
                        <span className={styles.stepTime}>{STEP_TIMES[i]}</span>
                        <div className={styles.stepBody}>
                          <b>{t(`home.booking.${key}[0]`)}</b>
                          <p>{t(`home.booking.${key}[1]`)}</p>
                        </div>
                      </li>
                    ))}
                  </Reveal>
                </div>
                <Reveal className={styles.ctaRow}>
                  <Link className="btn btn-light" to="/book">
                    {t("home.booking.ctaBook")}
                  </Link>
                  <Link className="btn btn-ghost-light" to="/about">
                    {t("home.booking.ctaAbout")}
                  </Link>
                </Reveal>
              </div>
            </div>
          </div>
        </section>
      </Fragment>

    </>
  );
}
