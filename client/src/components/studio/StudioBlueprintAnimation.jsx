/* The studio opening — a real-time 3D build, driven by scroll.

   The section takes the exact slot the old studio film used (first in the page,
   full-screen after the preloader). Its pin is one deterministic timeline: the
   ScrollTrigger writes a single number, and the scene resolves every pixel from
   that number. Pausing the wheel freezes the build; scrolling back un-builds it
   in exactly the same order.

   The canvas is only rendered when that number changes (frameloop="demand"),
   so an idle pinned section costs nothing.

   No video, no frames, no sprites: the object on screen is the object in the
   scene graph. */

import {
  Component,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ScrollTrigger, prefersReducedMotion } from "../../lib/anim.js";
import { useAppReady } from "../../hooks/useAppReady.jsx";
import { useLang } from "../../i18n/LanguageContext.jsx";
import StudioScene from "./StudioScene.jsx";
import {
  clamp01,
  scrollSplit,
  smoothstep,
  totalScrollLengthVh,
} from "./studioMath.js";
import s from "./StudioBlueprintAnimation.module.css";

/* A quiet CSS-only plate, used when WebGL is unavailable or the scene cannot
   start. It is decorative, static, and never pretends to be the film. */
function StudioFallback() {
  return (
    <div className={s.fallback} aria-hidden="true">
      <div className={s.fallbackGlow} />
      <div className={s.fallbackGrid} />
      <div className={s.fallbackHorizon} />
    </div>
  );
}

class SceneBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail?.();
  }

  render() {
    if (this.state.failed) return <StudioFallback />;
    return this.props.children;
  }
}

function canUseWebGL() {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return false;
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    return true;
  } catch {
    return false;
  }
}

export default function StudioBlueprintAnimation({ onDone, onFreeze, onReveal }) {
  const { t } = useLang();
  const { ready } = useAppReady();
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const [webgl] = useState(canUseWebGL);
  const [failed, setFailed] = useState(false);
  const [low] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 760 : false,
  );

  const slotRef = useRef(null);
  const rootRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    /* StrictMode runs this effect, cleans it up, then runs it again. The
       cleanup used to leave the ref false for the life of the dev session, so
       the one-shot freeze was silently dropped and the hero never received
       the held camera frame. Reset it on every mount pass. */
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const railRef = useRef(null);
  const hintRef = useRef(null);
  const chromeRef = useRef(null);
  const lensRef = useRef(null);

  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const freezeRef = useRef(onFreeze);
  freezeRef.current = onFreeze;
  const revealRef = useRef(onReveal);
  revealRef.current = onReveal;
  const frozeRef = useRef(false);
  const freezePendingRef = useRef(false);

  /* One mutable channel between the scroll trigger and the renderer. The scene
     installs its invalidate() here; progress is the only thing that changes.
     `p` is the original build; `finale` is the appended logo/lens sequence. */
  const progress = useMemo(
    () => ({
      p: reduced || !webgl ? 1 : 0,
      finale: 0,
      reveal: 0,
      total: 0,
      invalidate: null,
    }),
    [reduced, webgl],
  );

  const settled = reduced || !webgl || failed;

  /* The opening owns the viewport from its first pixel: measure the sticky
     header and pull the section up underneath it, before paint. */
  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot) return undefined;
    const header = document.querySelector("header");
    const apply = () => {
      const h = header ? header.getBoundingClientRect().height : 0;
      slot.style.setProperty("--sba-header", `${Math.round(h)}px`);
    };
    apply();
    /* The live pin owns the header while it runs. A static or fallback
       opening is just a section: the header must stay usable immediately. */
    slot.toggleAttribute("data-above", !settled);
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [settled]);

  /* A still scene has no build to finish: the site opens immediately, and the
     header comes back if a live scene fails after mount. */
  useEffect(() => {
    if (!settled) return;
    slotRef.current?.removeAttribute("data-above");
    doneRef.current?.();
    /* There is no scroll hand-off without the live scene, so the hero must
       open immediately instead of waiting for a reveal that never runs. */
    revealRef.current?.();
  }, [settled]);

  /* Scroll -> progress. Held back until the preloader curtain has opened. */
  useEffect(() => {
    if (!ready || reduced || !webgl || failed) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;

    let lastPct = "";
    let lastHint = "";
    let lastChrome = "";
    let lastWash = "";
    let lastStage = "";

    /* The pinned scene ends before the hero is actually in front of the
       visitor. The shot is still sliding away for the length of one viewport,
       so firing the hero entrance at onLeave hides the whole thing behind the
       stage. Hand the hero its cue only once the held frame owns enough of the
       screen for the focus lock and the pop to be seen. */
    const HERO_LAND_AT = 0.78;
    let landed = false;
    const announceLand = (value) => {
      if (landed || value < HERO_LAND_AT) return;
      landed = true;
      revealRef.current?.();
    };

    /* The optical close and the hand-off to the home page, in one veil.
       As the camera crosses the lens glass the veil floods with light — never
       a black frame — then the whole stage dissolves into the fixed studio
       plate behind it. The plate is already viewport-filling, so the hand-off
       never exposes an upper scene band over a separate lower hero. */
    const applyWash = () => {
      const lens = lensRef.current;
      const washIn = smoothstep(0.86, 1, progress.finale);
      const opacity = washIn * (1 - smoothstep(0.28, 0.92, progress.reveal));
      const key = opacity.toFixed(3);

      /* The instant the light fully covers the lens, the live frame is
         copied out. It is kept for the transition/fallback path; the finished
         website plate itself is the supplied studio wall. The copy waits one
         frame: render() invalidates the demand loop in the same tick, and this
         must read the lens frame that render produces, not the previous frame
         left in the buffer. */
      if (!frozeRef.current && !freezePendingRef.current && washIn > 0.995) {
        freezePendingRef.current = true;
        window.requestAnimationFrame(() => {
          freezePendingRef.current = false;
          if (!mountedRef.current) return;
          const url = progress.freeze?.();
          if (url) {
            frozeRef.current = true;
            freezeRef.current?.(url);
          }
        });
      }

      if (lens && key !== lastWash) {
        lastWash = key;
        lens.style.opacity = key;
        /* Keep the veil out of the compositor for the whole build. */
        lens.style.visibility = opacity < 0.004 ? "hidden" : "visible";
        lens.style.setProperty("--wash", progress.reveal.toFixed(3));
      }

      /* The opening dissolves while the fixed plate is already behind it.
         Keep this earlier and quicker than the copy cue: once the stage
         unpins, any residual stage would read as a strip above the hero.
         By 14% of the hand-off the viewport is one continuous studio frame. */
      const stageKey = (1 - smoothstep(0, 0.14, progress.reveal)).toFixed(3);
      if (stageKey !== lastStage) {
        lastStage = stageKey;
        root.style.opacity = stageKey === "1.000" ? "" : stageKey;
      }
    };

    const render = (total) => {
      const split = scrollSplit();
      const p = clamp01(total / Math.max(split, 1e-6));
      const finale = clamp01((total - split) / Math.max(1 - split, 1e-6));

      progress.p = p;
      progress.finale = finale;
      progress.total = total;
      progress.invalidate?.();

      if (railRef.current) railRef.current.style.transform = `scaleX(${total})`;

      /* These strings only change at a couple of beats. Avoid writing the same
         style/ARIA values on every scroll event; that keeps the scroll handler
         from touching layout at all through most of the finale. */
      const hintOpacity = total > 0.015 ? "0" : "1";
      if (hintRef.current && hintOpacity !== lastHint) {
        lastHint = hintOpacity;
        hintRef.current.style.opacity = hintOpacity;
        hintRef.current.setAttribute(
          "aria-hidden",
          hintOpacity === "0" ? "true" : "false",
        );
      }

      const chromeOpacity = (1 - smoothstep(0.9, 0.97, finale)).toFixed(3);
      if (chromeRef.current && chromeOpacity !== lastChrome) {
        lastChrome = chromeOpacity;
        chromeRef.current.style.opacity = chromeOpacity;
        /* The rail and hint are decorative once the finale has closed; keep
           them out of the accessibility tree while the home page takes over. */
        chromeRef.current.setAttribute(
          "aria-hidden",
          finale > 0.97 ? "true" : "false",
        );
      }

      const pct = total.toFixed(3);
      if (pct !== lastPct) {
        lastPct = pct;
        root.dataset.progress = pct;
        root.dataset.finale = finale.toFixed(3);
      }

      applyWash();
    };

    const trigger = ScrollTrigger.create({
      trigger: root,
      start: "top top",
      end: () => `+=${totalScrollLengthVh()}%`,
      pin: true,
      pinSpacing: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onToggle: (self) => {
        /* The opening owns the whole screen while the pin is running (header
           included); once the finale is finished the header comes back. */
        if (slotRef.current)
          slotRef.current.toggleAttribute("data-above", self.progress < 1);
      },
      onUpdate: (self) => render(self.progress),
      onLeave: (self) => {
        render(self.progress);
        doneRef.current?.();
      },
      onLeaveBack: (self) => render(self.progress),
    });

    /* The hand-off: the veil owns exactly the viewport of scroll between the
       pin releasing and the hero arriving. It is not pinned itself — it only
       dissolves — so the visitor keeps scrolling straight through it. The
       range is taken from the pin trigger's own end, so the two ranges share
       one exact boundary at every refresh and viewport size. */
    const reveal = ScrollTrigger.create({
      trigger: root,
      start: () => trigger.end,
      end: () => trigger.end + window.innerHeight,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        progress.reveal = self.progress;
        applyWash();
        announceLand(self.progress);
      },
      onLeaveBack: () => {
        progress.reveal = 0;
        applyWash();
      },
    });

    /* Adopt the scroll position we were remounted into (StrictMode, HMR, or a
       browser restoring a deep scroll) instead of resetting the build. */
    render(trigger.progress);
    progress.reveal = reveal.progress;
    applyWash();
    /* Adopt a page restored past the hand-off too: the hero must not stay
       hidden just because its entrance trigger was already behind us. */
    announceLand(reveal.progress);
    if (slotRef.current)
      slotRef.current.toggleAttribute("data-above", trigger.progress < 1);
    if (trigger.progress >= 1) doneRef.current?.();

    return () => {
      reveal.kill();
      trigger.kill();
    };
  }, [ready, reduced, webgl, failed, progress]);

  return (
    <div ref={slotRef} className={s.slot}>
      <section
        ref={rootRef}
        className={s.stage}
        data-studio={
          reduced ? "static" : !webgl || failed ? "fallback" : "live"
        }
        aria-label={t("studio.aria")}
      >
        {webgl && !failed ? (
          <SceneBoundary onFail={() => setFailed(true)}>
            <StudioScene
              progress={progress}
              low={low}
              onFail={() => setFailed(true)}
            />
          </SceneBoundary>
        ) : (
          <StudioFallback />
        )}

        {!settled && (
          <div className={s.chrome} ref={chromeRef}>
            <span ref={hintRef} className={s.hint}>
              {t("studio.hint")}
            </span>
            <span className={s.rail} aria-hidden="true">
              <span ref={railRef} className={s.railFill} />
            </span>
          </div>
        )}

        <div className={s.vignette} aria-hidden="true" />
        {!settled && (
          <div
            ref={lensRef}
            className={s.lens}
            data-lens="true"
            aria-hidden="true"
          />
        )}
      </section>
    </div>
  );
}
