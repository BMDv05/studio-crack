import { useLayoutEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "../../lib/anim.js";
import { useLang } from "../../i18n/LanguageContext.jsx";
import s from "./StudioTicker.module.css";

const TICKER_KEYS = ["brand", "arch", "video", "social", "digital"];

/* A credits strip that moves with the page instead of looping on its own:
   no auto-play, nothing to pause, and it reverses naturally on scroll. */
export default function StudioTicker() {
  const { t } = useLang();
  const bandRef = useRef(null);
  const trackRef = useRef(null);

  useLayoutEffect(() => {
    const band = bandRef.current;
    const track = trackRef.current;
    if (!band || !track) return undefined;
    if (prefersReducedMotion()) return undefined;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        track,
        { xPercent: 0 },
        {
          xPercent: -50,
          ease: "none",
          scrollTrigger: {
            trigger: band,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.7,
          },
        },
      );
    }, band);

    return () => ctx.revert();
  }, []);

  const words = [
    ...TICKER_KEYS.map((key) => t(`home.ticker.${key}`)),
    t("home.ticker.location"),
  ];
  const items = [...words, ...words];

  return (
    <div ref={bandRef} className={s.band} aria-hidden="true">
      <div ref={trackRef} className={s.track}>
        {items.map((word, i) => (
          <span className={s.item} key={`${word}-${i}`}>
            <span className={s.mark} />
            {word}
          </span>
        ))}
      </div>
    </div>
  );
}
