/* The Double H Studio wordmark — a physical decal on the hero camera's rear
   screen.

   The mark is not an HTML overlay. It is the official "Double H" / "STUDIO"
   lockup rebuilt as 3D line segments with low-opacity filled letterforms,
   parented to the screen, so it foreshortens with the camera and stays attached
   while the camera moves. The existing line shader draws each stroke from the
   same scroll progress that drives the studio build. */

import { useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createLineMaterial } from './BlueprintMaterials.js';
import { clamp01, smoothstep, FINALE } from './studioMath.js';
import { buildGuideGeometry, buildLogoFillGeometries, buildLogoLineGeometry } from './logoArt.js';

export default function StudioLogoReveal({ progress }) {
  const logoU = useMemo(() => ({
    build: { value: 0 },
    lineFade: { value: 1 },
    lineOpacity: { value: 1 },
  }), []);

  const guideU = useMemo(() => ({
    build: { value: 0 },
    lineFade: { value: 1 },
    lineOpacity: { value: 0.42 },
  }), []);

  const lineGeo = useMemo(() => buildLogoLineGeometry(), []);
  const guideGeo = useMemo(() => buildGuideGeometry(), []);
  const fillGeos = useMemo(() => buildLogoFillGeometries(), []);
  const lineMat = useMemo(() => createLineMaterial(logoU), [logoU]);
  const guideMat = useMemo(() => createLineMaterial(guideU), [guideU]);
  const fillMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffffff',
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }), []);

  useEffect(() => () => {
    lineGeo.dispose();
    guideGeo.dispose();
    fillGeos.forEach((g) => g.dispose());
    lineMat.dispose();
    guideMat.dispose();
    fillMat.dispose();
  }, [lineGeo, guideGeo, fillGeos, lineMat, guideMat, fillMat]);

  const update = useCallback((finale) => {
    const draw = clamp01((finale - FINALE.logoStart) / (FINALE.logoEnd - FINALE.logoStart));

    logoU.build.value = draw;
    guideU.build.value = draw;
    guideU.lineFade.value = 1 - smoothstep(0.34, 0.56, draw);

    /* The official letterforms fill in only after their outlines are drawn. */
    fillMat.opacity = smoothstep(0.68, 0.94, draw) * 0.22;

    /* A single, restrained brightening as the mark settles. */
    const settle = smoothstep(0.84, 0.93, draw) * (1 - smoothstep(0.93, 1, draw));
    logoU.lineOpacity.value = 1 + settle * 0.26;
  }, [logoU, guideU, fillMat]);

  useLayoutEffect(() => {
    update(progress.finale);
  }, [update, progress]);

  useFrame(() => update(progress.finale));

  return (
    <group name="double-h-logo">
      {fillGeos.map((geo, i) => (
        <mesh
          key={i}
          geometry={geo}
          material={fillMat}
          position={[0, 0, 0.0004]}
          renderOrder={15}
          userData={{ noEdges: true }}
        />
      ))}
      <lineSegments
        geometry={guideGeo}
        material={guideMat}
        position={[0, 0, 0.0008]}
        renderOrder={16}
        frustumCulled={false}
      />
      <lineSegments
        geometry={lineGeo}
        material={lineMat}
        position={[0, 0, 0.001]}
        renderOrder={17}
        frustumCulled={false}
      />
    </group>
  );
}
