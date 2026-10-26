/* The finale camera.

   At the end of the build the camera is still the wide doorway shot. This
   component owns the real R3F camera from there on: a fast but eased dolly to
   the hero camera's rear screen, a slow creep while the logo draws, a swing
   around the camera body to the front of the lens, and a straight push down
   the actual lens axis into the glass.

   All anchor points come from refs inside the camera model, so the move stays
   correct if the hero camera is moved or re-posed. Nothing is allocated per
   frame. */

import { useCallback, useLayoutEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FINALE, clamp01, mix, smoothstep } from "./studioMath.js";

const V = () => new THREE.Vector3();

/* Cubic Hermite in scroll space. The old piecewise smoothsteps stopped the
   camera at every beat; the approach now uses two Hermite spans that share a
   non-zero slope at the dolly/creep boundary, so the camera keeps moving while
   it transitions from the fast dolly to the slow screen creep. */
function hermite(p0, p1, m0, m1, f0, f1, f) {
  const dt = f1 - f0 || 1e-6;
  const x = clamp01((f - f0) / dt);
  const x2 = x * x;
  const x3 = x2 * x;
  return (
    (2 * x3 - 3 * x2 + 1) * p0 +
    (x3 - 2 * x2 + x) * dt * m0 +
    (-2 * x3 + 3 * x2) * p1 +
    (x3 - x2) * dt * m1
  );
}

function basePose(aspect) {
  let fov = 34;
  let x = 0;
  let y = 1.5;
  let z = 10;
  let lookX = 0;

  if (aspect < 0.8) {
    fov = 50;
    x = -0.25;
    y = 1.55;
    z = 10.2;
    lookX = -0.25;
  } else if (aspect < 1.35) {
    fov = 39;
    x = -0.1;
    y = 1.52;
    lookX = -0.1;
  }

  return {
    fov,
    pos: new THREE.Vector3(x, y, z),
    look: new THREE.Vector3(lookX, 1.5, -6),
  };
}

export default function FinaleCamera({ progress, screenRef, lensRef }) {
  const { camera, size, invalidate } = useThree();

  const base = useMemo(
    () => basePose(size.width / Math.max(1, size.height)),
    [size.width, size.height],
  );

  const t = useMemo(
    () => ({
      screen: V(),
      lens: V(),
      screenQ: new THREE.Quaternion(),
      lensQ: new THREE.Quaternion(),
      normal: V(),
      right: V(),
      dir: V(),
      back15: V(),
      back05: V(),
      approachPts: [V(), V(), V()],
      front055: V(),
      front004: V(),
      inside: V(),
      through: V(),
      pos: V(),
      target: V(),
      orbitPts: [V(), V(), V(), V(), V()],
    }),
    [],
  );

  const approach = useMemo(
    () => new THREE.CatmullRomCurve3(t.approachPts, false, "centripetal", 0.5),
    [t],
  );
  const orbit = useMemo(
    () => new THREE.CatmullRomCurve3(t.orbitPts, false, "centripetal", 0.5),
    [t],
  );

  const apply = useCallback(
    (finale) => {
      /* The finale does not stop at the glass any more: the last stretch of
         scroll carries the camera through the front element, accelerating as
         it crosses. The DOM side of that move (the optical blur, the glass
         reflections and the aperture that opens onto the site) is timed to the
         same curve in StudioBlueprintAnimation. */
      const f = clamp01(finale || 0);

      const setProjection = (fov, near) => {
        if (
          Math.abs(camera.fov - fov) > 0.01 ||
          Math.abs(camera.near - near) > 0.0001
        ) {
          camera.fov = fov;
          camera.near = near;
          camera.far = 170;
          camera.updateProjectionMatrix();
        }
      };

      if (f <= 0 || !screenRef.current || !lensRef.current) {
        camera.position.copy(base.pos);
        camera.up.set(0, 1, 0);
        camera.lookAt(base.look);
        setProjection(base.fov, 0.1);
        return;
      }

      screenRef.current.updateWorldMatrix(true, false);
      lensRef.current.updateWorldMatrix(true, false);
      screenRef.current.getWorldPosition(t.screen);
      screenRef.current.getWorldQuaternion(t.screenQ);
      lensRef.current.getWorldPosition(t.lens);
      lensRef.current.getWorldQuaternion(t.lensQ);

      t.normal.set(0, 0, 1).applyQuaternion(t.screenQ).normalize();
      t.right.set(1, 0, 0).applyQuaternion(t.screenQ).normalize();
      t.dir.set(0, 0, -1).applyQuaternion(t.lensQ).normalize();

      t.back15.copy(t.screen).addScaledVector(t.normal, 1.5);
      t.back05.copy(t.screen).addScaledVector(t.normal, 0.5);
      t.front055.copy(t.lens).addScaledVector(t.dir, 0.55);
      t.front004.copy(t.lens).addScaledVector(t.dir, 0.04);
      t.inside.copy(t.lens).addScaledVector(t.dir, -0.08);

      if (f <= FINALE.hold) {
        t.pos.copy(base.pos);
        t.target.copy(base.look);
      } else if (f < FINALE.logoEnd) {
        /* One continuous approach curve: base -> 1.5 m behind the screen ->
         0.5 m behind the screen. The Hermite spans share the same non-zero
         slope at dollyEnd, so the fast dolly decelerates into the creep instead
         of coming to a complete stop at the 1.5 m mark. */
        const a = t.approachPts;
        a[0].copy(base.pos);
        a[1].copy(t.back15);
        a[2].copy(t.back05);

        const u =
          f < FINALE.dollyEnd
            ? hermite(0, 0.5, 0, 1.6, FINALE.hold, FINALE.dollyEnd, f)
            : hermite(0.5, 1, 1.6, 0, FINALE.dollyEnd, FINALE.logoEnd, f);
        approach.getPoint(u, t.pos);

        t.target
          .copy(base.look)
          .lerp(t.screen, smoothstep(FINALE.hold, FINALE.dollyEnd - 0.008, f));
      } else if (f < FINALE.orbitEnd) {
        const u = smoothstep(FINALE.orbitStart, FINALE.orbitEnd, f);
        const o = t.orbitPts;
        o[0].copy(t.back05);
        o[1]
          .copy(t.screen)
          .addScaledVector(t.right, 0.85)
          .addScaledVector(t.normal, 0.2);
        o[2]
          .copy(t.screen)
          .addScaledVector(t.right, 0.95)
          .addScaledVector(t.normal, -0.5);
        o[3]
          .copy(t.screen)
          .addScaledVector(t.right, 0.35)
          .addScaledVector(t.normal, -1.6);
        o[4].copy(t.front055);
        orbit.getPoint(u, t.pos);
        t.target
          .copy(t.screen)
          .lerp(
            t.lens,
            smoothstep(FINALE.orbitStart, FINALE.orbitEnd - 0.02, f),
          );      } else {
        /* At the glass, then through it. The push from 0.55 m to 4 cm is a
           smooth arc; the crossing adds a second, accelerating span so the
           camera is still gaining speed when it passes the front element. A
           hard stop at the glass was what made the hand-off read as a
           cross-fade instead of a pass-through. */
        const u = smoothstep(FINALE.orbitEnd, FINALE.lensEnd, f);
        t.pos.copy(t.front055).lerp(t.front004, u);

        if (f > FINALE.lensEnd) {
          const crossing = clamp01(
            (f - FINALE.lensEnd) /
              Math.max(1e-6, FINALE.opticalEnd - FINALE.lensEnd),
          );
          /* Squared: nothing happens at the glass, then the barrel swallows
             the frame in the last few percent of the scroll. */
          t.through.copy(t.lens).addScaledVector(t.dir, -0.26);
          t.pos.lerp(t.through, crossing * crossing);
        }

        t.target.copy(t.lens);
      }

      camera.position.copy(t.pos);
      camera.up.set(0, 1, 0);
      camera.lookAt(t.target);

      const lensT = smoothstep(FINALE.orbitStart, FINALE.lensEnd, f);
      /* The glass bends the frame as the camera crosses it: a small, steady
         widening, never a snap. */
      const crossingT = clamp01(
        (f - FINALE.lensEnd) /
          Math.max(1e-6, FINALE.opticalEnd - FINALE.lensEnd),
      );
      const fov = mix(
        mix(base.fov, base.fov * 0.82, lensT),
        base.fov * 0.94,
        crossingT,
      );
      /* Open the near plane as the camera approaches the glass instead of
       snapping it at one scroll pixel. The change is small, but it removes the
       one-frame projection pop in the middle of the push. */
      const near = mix(0.1, 0.02, smoothstep(0.78, 0.9, f));
      setProjection(fov, near);
    },
    [base, camera, lensRef, screenRef, t, approach, orbit],
  );

  useLayoutEffect(() => {
    apply(progress.finale);
    invalidate();
  }, [apply, progress, invalidate]);

  useFrame(() => apply(progress.finale));

  return null;
}
