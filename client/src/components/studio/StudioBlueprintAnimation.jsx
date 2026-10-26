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
import FinalePlate from "./FinalePlate.jsx";
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

export default function StudioBlueprintAnimation({ onDone, onFreeze }) {
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
  const frozeRef = useRef(false);
  const freezePendingRef = useRef(false);

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
    /* The live pin owns the header while it runs. A static or fallback
       opening is just a section: the header must stay usable immediately. */
    slot.toggleAttribute("data-above", !settled);
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [settled]);

  /* A still scene has no build to finish: the site opens immediately, and the
     header comes back if a live scene fails after mount. */
  useEffect(() => {
    if (!settled) return undefined;
    const stage = rootRef.current;
    const header = document.querySelector("header");
    slotRef.current?.removeAttribute("data-above");
    doneRef.current?.();

    if (!stage || !header) return undefined;

    /* The still plate is the whole opening: keep the header off it until the
       stage's bottom has passed the top of the viewport. */
    const sync = (hide) => {
      if (hide) header.setAttribute("data-under-hero", "true");
      else header.removeAttribute("data-under-hero");
    };
    const stageGone = () => stage.getBoundingClientRect().bottom <= 0;
    const trigger = ScrollTrigger.create({
      trigger: stage,
      start: "bottom top",
      end: "max",
      onEnter: () => sync(false),
      onLeaveBack: () => sync(true),
    });
    sync(!stageGone());

    return () => {
      trigger.kill();
      header.removeAttribute("data-under-hero");
    };
  }, [settled]);

  /* Scroll -> progress. Held back until the preloader curtain has opened. */
  useEffect(() => {
    if (!ready || reduced || !webgl || failed) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;

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

      const entry =
        smoothstep(0.855, 0.95, f) * (1 - smoothstep(0.958, 0.992, f));
      const aperture = smoothstep(0.9, 0.99, f);
      const rim = smoothstep(0.9, 0.942, f) * (1 - smoothstep(0.962, 0.992, f));
      const flare =
        smoothstep(0.895, 0.955, f) * (1 - smoothstep(0.972, 0.998, f));
      const blur =
        2.2 * smoothstep(0.875, 0.952, f) * (1 - smoothstep(0.966, 0.996, f));
      const veil = smoothstep(0.84, 0.95, f);

      /* The photograph emerges from the dark interior. The final frame is
         exactly 0 darkness, 0 blur and a fully opaque interface. */
      const plateDark = 1 - smoothstep(0.905, 0.988, f);
      const plateUi = smoothstep(0.925, 0.988, f);
      const plateBlur =
        2.4 * smoothstep(0.9, 0.95, f) * (1 - smoothstep(0.965, 0.992, f));

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

      /* The veil is the light that floods the glass while the camera crosses
         it. Never a black frame: the portal opens inside this halo. */
      const veilKey = veil.toFixed(3);
      if (lens && veilKey !== lastVeil) {
        lastVeil = veilKey;
        lens.style.opacity = veilKey;
        /* Keep the veil out of the compositor for the whole build. */
        lens.style.visibility = veil < 0.004 ? "hidden" : "visible";
        lens.style.setProperty("--wash", f.toFixed(3));
      }

      /* The held lens frame, kept for the transition path that wants a still.
         Only captured when something is listening: it is an expensive read of
         the whole drawing buffer. */
      if (
        freezeRef.current &&
        !frozeRef.current &&
        !freezePendingRef.current &&
        veil > 0.995
      ) {
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
      progress.invalidate?.();

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

      const pct = active.toFixed(3);
      if (pct !== lastPct) {
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

    /* The plate is the page's hero. The global header stays out of its frame
       until the stage's bottom has passed the top of the viewport; because the
       stage is pinned, that is the pin end plus one stage height. */
    const header = document.querySelector("header");
    const headerTrigger = header
      ? ScrollTrigger.create({
          trigger: root,
          start: () => trigger.end + root.offsetHeight,
          end: "max",
          onEnter: () => header.removeAttribute("data-under-hero"),
          onLeaveBack: () =>
            header.setAttribute("data-under-hero", "true"),
        })
      : null;
    if (header) {
      const stageGone =
        window.scrollY >= trigger.end + root.offsetHeight;
      if (stageGone) header.removeAttribute("data-under-hero");
      else header.setAttribute("data-under-hero", "true");
    }

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
    if (slotRef.current)
      slotRef.current.toggleAttribute("data-above", trigger.progress < 1);
    if (trigger.progress >= 1) doneRef.current?.();

    return () => {
      window.cancelAnimationFrame(lenisResizeFrame);
      headerTrigger?.kill();
      header?.removeAttribute("data-under-hero");
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

        {/* Reduced motion, no WebGL, or a scene failure: the final plate is
            still the page's opening, shown as a still frame instead of a
            build. */}
        {settled && (
          <div className={s.staticPlate}>
            <FinalePlate />
          </div>
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
            hot core of the aperture, then the studio plate itself inside the
            opening. The plate sits below the glass so the reflections pass
            over the emerging photograph and fade before the final frame. All
            of it reads the custom properties written by the scroll progress —
            no extra timers, no extra renders. */}
        {!settled && (
          <div className={s.crossing}>
            <div className={s.aperture}>
              <FinalePlate />
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
