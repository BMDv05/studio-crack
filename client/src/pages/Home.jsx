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
import { Wordmark } from "../components/Wordmark.jsx";
import LanguageSwitcher from "../components/LanguageSwitcher.jsx";
import StudioBlueprintAnimation from "../components/studio/StudioBlueprintAnimation.jsx";
import StudioLens from "../components/studio/StudioLens.jsx";
import CallSlate from "../components/studio/CallSlate.jsx";
import WhatsAppCta from "../components/WhatsAppCta.jsx";
import { useLang } from "../i18n/LanguageContext.jsx";
import { useAppReady } from "../hooks/useAppReady.jsx";
import {
  gsap,
  ScrollTrigger,
  EASE,
  prefersReducedMotion,
} from "../lib/anim.js";
import styles from "./Home.module.css";

const HERO_SERVICE_KEYS = ["brand", "arch", "video", "social", "digital"];

/* The post-lens website plate. It is fixed rather than attached to the hero
   so the stage can dissolve into it without ever exposing a two-section
   seam. The plate is the studio wall from the supplied reference, with the
   floor removed and the image graded into the site's deep teal. */
function HomeBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.backdropImage} />
      <div className={styles.backdropGrade} />
      <div className={styles.backdropScrim} />
      <div className={styles.backdropGrain} />
    </div>
  );
}

/* Retired home hero. The studio plate is now the final frame of the opening,
   so this screen is intentionally not rendered. It is kept intact so the
   previous home layout can be restored without reconstructing it. */
function Hero({ open, landed }) {
  const heroRef = useRef(null);
  const { t, lang } = useLang();
  const { ready } = useAppReady();
  const live = ready && open && landed;

  /* Set the pre-entrance state before paint. The copy rises from its line
     masks; every other piece is a small, clean pop with no overshoot. */
  useLayoutEffect(() => {
    const el = heroRef.current;
    if (!el || prefersReducedMotion()) return;
    const q = gsap.utils.selector(el);
    const originX =
      document.documentElement.dir === "rtl" ? "right center" : "left center";

    gsap.set(
      [
        q("[data-hero-brand]"),
        q("[data-hero-nav]"),
        q("[data-hero-lang]"),
        q("[data-hero-eyebrow]"),
        q("[data-hero-lede]"),
        q("[data-hero-cta] a"),
        q("[data-hero-rail-label]"),
        q("[data-hero-service]"),
        q("[data-hero-side]"),
        q("[data-hero-hud]"),
        q("[data-hero-lock]"),
      ],
      { opacity: 0 },
    );
    gsap.set(q("[data-hero-brand]"), { y: 10, scale: 0.98 });
    gsap.set(q("[data-hero-nav]"), { y: 10, scale: 0.98 });
    gsap.set(q("[data-hero-lang]"), { y: 8, scale: 0.98 });
    gsap.set(q("[data-hero-title]"), {
      opacity: 0,
      scale: 0.96,
      transformOrigin: "center center",
    });
    gsap.set(q("[data-hero-eyebrow]"), { y: 16, scale: 0.98 });
    gsap.set(q("[data-hero-lede]"), { y: 18, scale: 0.98 });
    gsap.set(q("[data-hero-cta] a"), { y: 14, scale: 0.96 });
    gsap.set(q("[data-hero-service]"), { y: 8, scale: 0.98 });
    gsap.set(q("[data-hero-rail-label]"), { y: 8, scale: 0.98 });
    gsap.set(q("[data-hero-side]"), { y: 10, scale: 0.98 });
    gsap.set(q("[data-hero-rule]"), { scaleX: 0, transformOrigin: originX });
    gsap.set(q("[data-hero-rail-rule]"), { scaleX: 0, transformOrigin: originX });
    gsap.set(q("[data-hero-side-rule]"), {
      scaleY: 0,
      transformOrigin: "50% 0%",
    });
  }, []);

  /* Replayed on a language change as well: SplitText rebuilds the heading,
     and every element must return to its place instead of staying hidden. */
  useEffect(() => {
    if (!live) return undefined;
    const el = heroRef.current;
    if (!el) return undefined;      const ctx = gsap.context(() => {
        const q = gsap.utils.selector(el);
        const tl = gsap.timeline({ defaults: { ease: EASE.ui } });

      if (prefersReducedMotion()) {
        tl.set(
          [
            q("[data-hero-brand]"),
            q("[data-hero-nav]"),
            q("[data-hero-lang]"),
            q("[data-hero-eyebrow]"),
            q("[data-hero-title]"),
            q("[data-hero-lede]"),
            q("[data-hero-cta] a"),
            q("[data-hero-rail-label]"),
            q("[data-hero-service]"),
            q("[data-hero-side]"),
            q("[data-hero-hud]"),
            q(".st-inner"),
          ],
          { opacity: 1, y: 0, yPercent: 0, scale: 1 },
        );
        tl.set(q("[data-hero-lock]"), { opacity: 0 });
        tl.set(q("[data-hero-rule]"), { scaleX: 1 });
        tl.set(q("[data-hero-rail-rule]"), { scaleX: 1 });
        tl.set(q("[data-hero-side-rule]"), { scaleY: 1 });
        return;
      }

      /* The camera has stopped and the plate is holding. The interface
         arrives in reading order: statement, supporting copy, wayfinding,
         indices, actions, and only then the decorative rules. Every item uses
         the same long, soft expo curve; no bounce, no float, no spin. */
      tl.to(
        q("[data-hero-title]"),
        { opacity: 1, scale: 1, duration: 0.68, ease: EASE.ui },
        0,
      )
        .fromTo(
          q(".st-inner"),
          { yPercent: 115 },
          { yPercent: 0, duration: 0.72, stagger: 0.1, ease: EASE.ui },
          0.02,
        )
        .to(
          q("[data-hero-eyebrow]"),
          { opacity: 1, y: 0, scale: 1, duration: 0.5 },
          0.14,
        )
        .to(
          q("[data-hero-lede]"),
          { opacity: 1, y: 0, scale: 1, duration: 0.62 },
          0.3,
        )
        .to(
          q("[data-hero-brand]"),
          { opacity: 1, y: 0, scale: 1, duration: 0.55 },
          0.42,
        )
        .to(
          q("[data-hero-nav]"),
          { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.1 },
          0.48,
        )
        .to(
          q("[data-hero-lang]"),
          { opacity: 1, y: 0, scale: 1, duration: 0.5 },
          0.55,
        )
        .to(
          q("[data-hero-service]"),
          { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.09 },
          0.58,
        )
        .to(
          q("[data-hero-rail-label]"),
          { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.09 },
          0.64,
        )
        .to(
          q("[data-hero-side]"),
          { opacity: 1, y: 0, scale: 1, duration: 0.55 },
          0.66,
        )
        .to(
          q("[data-hero-cta] a"),
          { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.12 },
          0.78,
        )
        /* Last: the frame's thin rules and corner marks, once every piece of
           content is already in place. */
        .to(
          q("[data-hero-rule]"),
          { scaleX: 1, duration: 0.65 },
          1.48,
        )
        .to(
          q("[data-hero-rail-rule]"),
          { scaleX: 1, duration: 0.7 },
          1.54,
        )
        .to(
          q("[data-hero-side-rule]"),
          { scaleY: 1, duration: 0.6 },
          1.6,
        )
        .to(q("[data-hero-hud]"), { opacity: 1, duration: 0.5 }, 1.56)
        .fromTo(
          q("[data-hero-lock]"),
          { opacity: 0, scale: 1.35 },
          { opacity: 1, scale: 1, duration: 0.45, ease: EASE.ui },
          1.6,
        )
        .to(
          q("[data-hero-lock]"),
          { opacity: 0.55, scale: 1, duration: 0.5, ease: "power2.out" },
          2.1,
        );
    }, el);

    return () => ctx.revert();
  }, [live, lang]);

  /* The finished frame owns the screen while its own nav is on it: the global
     header stays out only while the hero's navigation row is showing — the two
     share the same slot, so there is never a second bar over the plate. The
     moment that row scrolls away the sticky header takes over, which keeps a
     bar with its hairline on screen all the way down instead of leaving a gap.
     An observer is used rather than a scroll trigger because the language
     switch rebuilds the surrounding triggers; visibility must not depend on
     that refresh order. */
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return undefined;
    const header = document.querySelector("header");
    if (!header) return undefined;

    /* The hero's own header row (falls back to the section if it is missing). */
    const navRow = hero.querySelector("header") || hero;

    let overHero = false;
    const sync = (next) => {
      if (next === overHero) return;
      overHero = next;
      if (next) header.setAttribute("data-under-hero", "true");
      else header.removeAttribute("data-under-hero");
    };

    const observer = new IntersectionObserver(
      ([entry]) => sync(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(navRow);

    const rect = navRow.getBoundingClientRect();
    sync(rect.bottom > 0 && rect.top < window.innerHeight);

    return () => {
      observer.disconnect();
      header.removeAttribute("data-under-hero");
    };
  }, []);

  return (
    <section
      ref={heroRef}
      className={styles.hero}
      aria-label={t("home.hero.aria")}
    >
      <div className={styles.hud} data-hero-hud aria-hidden="true">
        <span className={`${styles.hudCorner} ${styles.hudTL}`} />
        <span className={`${styles.hudCorner} ${styles.hudTR}`} />
        <span className={`${styles.hudCorner} ${styles.hudBL}`} />
        <span className={`${styles.hudCorner} ${styles.hudBR}`} />
      </div>

      <div className={styles.lock} data-hero-lock aria-hidden="true">
        <span className={`${styles.lockCorner} ${styles.lockTL}`} />
        <span className={`${styles.lockCorner} ${styles.lockTR}`} />
        <span className={`${styles.lockCorner} ${styles.lockBL}`} />
        <span className={`${styles.lockCorner} ${styles.lockBR}`} />
        <span className={styles.lockDot} />
        <span className={styles.lockLabel}>AF LOCK</span>
      </div>

      <div className={styles.heroShell}>
        <header className={styles.heroTop}>
          <Link
            className={styles.heroBrand}
            to="/"
            aria-label={t("common.home")}
            data-hero-brand
          >
            <Wordmark height={30} title="Double H Studio" />
          </Link>

          <div className={styles.heroTopRight}>
            <nav className={styles.heroNav} aria-label="Primary">
              <Link to="/work" data-hero-nav>
                {t("common.work")}
              </Link>
              <Link to="/about" data-hero-nav>
                {t("common.about")}
              </Link>
            </nav>
            <div className={styles.heroLang} data-hero-lang>
              <LanguageSwitcher />
            </div>
          </div>

          <span className={styles.topRule} data-hero-rule aria-hidden="true" />
        </header>

        <div className={styles.heroBody}>
          <div className={styles.heroInner}>
            <p className={`${styles.eyebrow} eyebrow`} data-hero-eyebrow>
              {t("home.hero.eyebrow")}
            </p>
            <SplitText
              as="h1"
              manual
              className={styles.title}
              lines={[t("home.hero.title1"), t("home.hero.title2")]}
              data-hero-title
            />
            <p className={styles.lede} data-hero-lede>
              {t("home.hero.lede")}
            </p>
            <div className={styles.ctaRow} data-hero-cta>
              <Link className="btn btn-dark" to="/work">
                {t("home.hero.ctaWork")}
              </Link>
              <Link className="btn btn-ghost-dark" to="/book">
                {t("home.hero.ctaBook")}
              </Link>
            </div>
          </div>

          <div className={styles.heroSide} aria-hidden="true" data-hero-side>
            <span
              className={styles.sideRule}
              data-hero-side-rule
            />
            <span className={styles.sideText}>
              SHOWREEL / 2026
              <span className={styles.sideDot} />
              LOCKED
            </span>
          </div>
        </div>

        <div className={styles.heroRail}>
          <span
            className={styles.railRule}
            data-hero-rail-rule
            aria-hidden="true"
          />
          <span className={styles.railRec} data-hero-rail-label>
            <span className={styles.recDot} />
            REC
          </span>
          <ul
            className={styles.railServices}
            aria-label={t("home.what.eyebrow")}
          >
            {HERO_SERVICE_KEYS.map((key) => (
              <li className={styles.railService} key={key} data-hero-service>
                <span className={styles.railMark} aria-hidden="true" />
                {t(`home.ticker.${key}`)}
              </li>
            ))}
          </ul>
          <span className={styles.railLocation} data-hero-rail-label>
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

    const ctx = gsap.context(() => {
      gsap.fromTo(
        line,
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top 74%",
            end: "bottom 68%",
            scrub: 0.6,
          },
        },
      );
    }, section);

    return () => ctx.revert();
  }, [homeReady]);

  return (
    <>
      <PageMeta
        title={t("home.meta.title")}
        description={t("home.meta.description")}
      />
      {/* The studio plate is the page's opening and its final frame. The old
          home hero is not rendered underneath it: the camera resolves into the
          plate and the plate stays on screen until the visitor scrolls past
          it. The header returns only once that frame has left the viewport. */}
      <h1 className="sr-only">
        {t("home.hero.title1")} {t("home.hero.title2")}
      </h1>
      <HomeBackdrop />
      <StudioBlueprintAnimation onDone={openSite} />

      <Fragment key={homeReady ? "home-ready" : "home-intro"}>
        <section
          className={`section ${styles.lensSection}`}
          aria-labelledby="studio-lens-title"
        >
          <div className={`wrap ${styles.lensGrid}`}>
            <div className={styles.lensCol}>
              <StudioLens />
            </div>
            <div className={styles.lensCopy}>
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

      <WhatsAppCta />
    </>
  );
}
