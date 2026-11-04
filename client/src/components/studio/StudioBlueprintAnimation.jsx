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
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ScrollTrigger, prefersReducedMotion } from "../../lib/anim.js";
import { useAppReady } from "../../hooks/useAppReady.jsx";
import { useLang } from "../../i18n/LanguageContext.jsx";
import FinalePlate from "./FinalePlate.jsx";

/* The 3D scene is the heaviest part of the site. It lives in its own chunk so
   the preloader, the header and the page shell paint first; the chunk starts
   loading as soon as this component mounts, behind the preloader. */
const StudioScene = lazy(() => import("./StudioScene.jsx"));
import {
  activeScrollFraction,
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

export default function StudioBlueprintAnimation({ onDone, finale }) {
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
  const railRef = useRef(null);
  const hintRef = useRef(null);
  const chromeRef = useRef(null);
  const lensRef = useRef(null);

  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  /* One mutable channel between the scroll trigger and the renderer. The scene
     installs its invalidate() here; progress is the only thing that changes.
     `p` is the original build; `finale` is the appended logo/lens sequence. */
  const progress = useMemo(
    () => ({
      p: reduced || !webgl ? 1 : 0,
      finale: 0,
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
    /* The live pin owns the header while it runs: the opening must not show
       the site bar until the aperture is full. A static or fallback opening is
       just a still hero, and the header is its top bar, so it is there before
       paint and the plate never flashes without it. */
    if (settled) header?.removeAttribute("data-under-hero");
    else header?.setAttribute("data-under-hero", "true");
    slot.toggleAttribute("data-above", !settled);
    rootRef.current?.toggleAttribute("data-header", settled);
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [settled]);

  /* A still scene has no build to finish: the site opens immediately, with the
     final plate as its first frame. */
  useEffect(() => {
    if (!settled) return undefined;
    const header = document.querySelector("header");
    slotRef.current?.removeAttribute("data-above");
    doneRef.current?.();
    header?.removeAttribute("data-under-hero");

    return () => {
      header?.removeAttribute("data-under-hero");
    };
  }, [settled]);

  /* Scroll -> progress. Held back until the preloader curtain has opened. */
  useEffect(() => {
    if (!ready || reduced || !webgl || failed) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;
    const slot = slotRef.current;
    const header = document.querySelector("header");

    let lastPct = "";
    let lastHint = "";
    let lastChrome = "";
    let lastVeil = "";
    const lastVars = {
      entry: "",
      aperture: "",
      rim: "",
      flare: "",
      blur: "",
      plateDark: "",
      plateUi: "",
      plateBlur: "",
      realScale: "",
    };

    /* The plate is the final scene now, so the stage must never switch itself
       off under the portal. Clear any opacity left by a previous mount. */
    root.style.opacity = "";

    /* ---- the lens crossing and the final plate ---------------------------

       The camera no longer stops 4 cm in front of the glass: it accelerates
       into it over the last stretch of the finale. Everything the DOM has to
       do for that move is read off the same finale progress, so the 3D shot
       and the overlays can never drift apart, and a paused wheel pauses the
       crossing:

         entry     glass reflections + the streak smear of speed
         flare     the hot core of the aperture as the camera reaches the glass
         aperture  the studio plate seen through the lens (0 = closed, 1 = full)
         rim       the iris rim, gone once the portal is wider than the plate

       The portal is clipped, not scaled: the plate inside it is already at
       its final size, so the reveal is an opening and never a zoom. The stage
       stays opaque at the end and holds the final frame for the plate hold;
       when the pin releases, the whole frame scrolls away to the next
       section. */
    const applyHandoff = () => {
      const lens = lensRef.current;
      const f = progress.finale;

      /* The site header is the hero's top bar — the opening does not invent a
         second one. It stays out of the shot while the glass is closed and
         arrives with the last of the interface fade, once the aperture has
         cleared the corners of the viewport. The stage drops below the sticky
         bar on that same frame. */
      const showHeader = f >= 0.88;
      const hidden = !showHeader;
      if (header && header.hasAttribute("data-under-hero") !== hidden) {
        header.toggleAttribute("data-under-hero", hidden);
      }
      if (slot && slot.hasAttribute("data-above") !== hidden) {
        slot.toggleAttribute("data-above", hidden);
      }
      if (root.hasAttribute("data-header") !== showHeader) {
        root.toggleAttribute("data-header", showHeader);
      }

      const aperture = smoothstep(0.01, 0.20, f);
      const realBloom =
        smoothstep(0.02, 0.10, f) * (1 - smoothstep(0.10, 0.20, f));
      const entry = realBloom;
      const flare = realBloom;
      const rim = 0;
      const blur = 0;
      const veil = 0;

      /* The interface emerges smoothly over the real studio */
      const plateDark = 0;
      const plateUi = smoothstep(0.30, 0.70, f);
      const plateBlur = 0;
      const realScale = 1.0 + 0.04 * smoothstep(0.20, 0.75, f);

      const write = (slot, name, value) => {
        const next = value.toFixed(3);
        if (lastVars[slot] === next) return;
        lastVars[slot] = next;
        root.style.setProperty(name, next);
      };

      write("entry", "--lens-entry", entry);
      write("aperture", "--lens-aperture", aperture);
      write("rim", "--lens-rim", rim);
      write("flare", "--lens-flare", flare);
      write("plateDark", "--plate-dark", plateDark);
      write("plateUi", "--plate-ui", plateUi);
      write("realScale", "--real-studio-scale", realScale);

      const blurPx = blur.toFixed(2);
      if (lastVars.blur !== blurPx) {
        lastVars.blur = blurPx;
        root.style.setProperty("--lens-blur", `${blurPx}px`);
      }

      const plateBlurPx = plateBlur.toFixed(2);
      if (lastVars.plateBlur !== plateBlurPx) {
        lastVars.plateBlur = plateBlurPx;
        root.style.setProperty("--plate-blur", `${plateBlurPx}px`);
      }

      const open = aperture > 0.001;
      if (root.hasAttribute("data-aperture") !== open) {
        root.toggleAttribute("data-aperture", open);
      }

      /* The barrel darkens around the glass as the camera crosses; the
         opening itself carries the light. */
      const veilKey = veil.toFixed(3);
      if (lens && veilKey !== lastVeil) {
        lastVeil = veilKey;
        lens.style.opacity = veilKey;
        /* Keep the veil out of the compositor for the whole build. */
        lens.style.visibility = veil < 0.004 ? "hidden" : "visible";
        lens.style.setProperty("--wash", f.toFixed(3));
      }
    };

    const render = (total) => {
      /* Only the build + lens move drive the scene. The plate hold at the end
         of the pin is extra scroll during which this value stays at 1, so the
         camera path and its speed do not change. */
      const activeFraction = activeScrollFraction();
      const active = clamp01(total / Math.max(activeFraction, 1e-6));
      const split = scrollSplit();
      const p = clamp01(active / Math.max(split, 1e-6));
      const finale = clamp01((active - split) / Math.max(1 - split, 1e-6));

      progress.p = p;
      progress.finale = finale;
      progress.total = active;
      /* From here on the camera is parked on the glass and the DOM crossing
         (reflections, flare, aperture) carries the shot. Rendering the close-up
         behind an opening portal is the most expensive frames of the whole
         sequence; freezing the last approach frame keeps the reveal at 60fps.
         At 0.97 the aperture covers the viewport and the canvas is removed
         entirely (see the CSS). */
      if (finale < 0.9) progress.invalidate?.();

      if (railRef.current)
        railRef.current.style.transform = `scaleX(${active})`;

      /* These strings only change at a couple of beats. Avoid writing the same
         style/ARIA values on every scroll event; that keeps the scroll handler
         from touching layout at all through most of the finale. */
      const hintOpacity = active > 0.015 ? "0" : "1";
      if (hintRef.current && hintOpacity !== lastHint) {
        lastHint = hintOpacity;
        hintRef.current.style.opacity = hintOpacity;
        hintRef.current.setAttribute(
          "aria-hidden",
          hintOpacity === "0" ? "true" : "false",
        );
      }

      const chromeOpacity = (1 - smoothstep(0.35, 0.65, finale)).toFixed(3);
      if (chromeRef.current && chromeOpacity !== lastChrome) {
        lastChrome = chromeOpacity;
        chromeRef.current.style.opacity = chromeOpacity;
        /* The rail and hint are decorative once the finale has closed; keep
           them out of the accessibility tree while the home page takes over. */
        chromeRef.current.setAttribute(
          "aria-hidden",
          finale > 0.65 ? "true" : "false",
        );
      }

      const pct = active.toFixed(3);
      if (import.meta.env.DEV && pct !== lastPct) {
        lastPct = pct;
        root.dataset.progress = pct;
        root.dataset.finale = finale.toFixed(3);
      }

      applyHandoff();
    };

    const trigger = ScrollTrigger.create({
      trigger: root,
      start: "top top",
      end: () => `+=${totalScrollLengthVh()}%`,
      pin: true,
      pinSpacing: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => render(self.progress),
      onLeave: (self) => {
        render(self.progress);
        doneRef.current?.();
      },
      onLeaveBack: (self) => render(self.progress),
    });

    /* The pin's spacing was added after Lenis measured the document. Remeasure
       on the next frame so the new final scene and the sections below it are
       reachable by wheel/touch, not just by scripted scroll. */
    const lenisResizeFrame = window.requestAnimationFrame(() => {
      window.__lenis?.resize?.();
    });

    /* Adopt the scroll position we were remounted into (StrictMode, HMR, or a
       browser restoring a deep scroll) instead of resetting the build. */
    render(trigger.progress);
    applyHandoff();
    if (trigger.progress >= 1) doneRef.current?.();

    return () => {
      window.cancelAnimationFrame(lenisResizeFrame);
      trigger.kill();
      header?.removeAttribute("data-under-hero");
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
            <Suspense fallback={null}>
              <StudioScene
                progress={progress}
                low={low}
                onFail={() => setFailed(true)}
              />
            </Suspense>
          </SceneBoundary>
        ) : (
          <StudioFallback />
        )}

        {/* Reduced motion, no WebGL, or a scene failure: the final hero
            screen is still the page's opening, shown as a still frame
            instead of a build. */}
        {settled && (
          <div className={s.staticPlate}>{finale ?? <FinalePlate />}</div>
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

        {/* The crossing: reflections on the glass, the smear of speed, the
            hot core of the aperture, then the finished website screen inside
            the opening. The screen sits below the glass so the reflections
            pass over the emerging photograph and fade before the final frame.
            All of it reads the custom properties written by the scroll
            progress — no extra timers, no extra renders. */}
        {!settled && (
          <div className={s.crossing}>
            <div className={s.aperture}>
              <div className={s.finale}>{finale ?? <FinalePlate />}</div>
            </div>
            <div className={s.streaks} />
            <div className={s.glass} />
            <div className={s.flare} />
            <div className={s.rim} />
          </div>
        )}

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
