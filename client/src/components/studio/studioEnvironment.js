/* A reflection environment that matches the studio it lights.

   three's RoomEnvironment is a generic grey box with white ceiling strips; its
   reflections were what made the camera bodies, stands and floor read as CG.
   This builds a coarse proxy of *this* room instead — dark green side walls,
   pale concrete floor, black ceiling, white cyc at the back — with the actual
   softboxes, LED panels and rig spots as emissive cards in their real places.
   PMREM bakes it once; metals and the satin floor then reflect the studio
   they stand in. */

import * as THREE from 'three';
import { MODIFIERS } from './StudioEquipment.jsx';
import { SPOTS } from './ArchitecturalStructure.jsx';

/* The bake is taken from the middle of the set, at eye height. */
const CENTER = new THREE.Vector3(0, 1.5, 0.5);

function basic(color, boost = 1) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false });
  m.color.multiplyScalar(boost);
  return m;
}

export function buildStudioEnvironment() {
  const scene = new THREE.Scene();
  const disposables = [];
  const keep = (o) => {
    disposables.push(o);
    return o;
  };

  const plane = keep(new THREE.PlaneGeometry(1, 1));
  const octa = keep(new THREE.CircleGeometry(1, 8));
  const disc = keep(new THREE.CircleGeometry(1, 20));

  const add = (geometry, material, position, scale, lookAt) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]).sub(CENTER);
    mesh.scale.set(scale[0], scale[1], 1);
    if (lookAt) mesh.lookAt(new THREE.Vector3(lookAt[0], lookAt[1], lookAt[2]).sub(CENTER));
    scene.add(mesh);
    return mesh;
  };

  const wall = keep(basic('#1c5c35', 0.45));
  const floor = keep(basic('#6f6a60', 0.45));
  const ceiling = keep(basic('#050606', 1));
  const cyc = keep(basic('#c9c7bf', 0.55));
  const backdrop = keep(basic('#303134', 0.6));
  const front = keep(basic('#0a0c0b', 1));
  const panel = keep(basic('#0c0d0d', 1));

  /* shell */
  add(plane, floor, [0, 0, 1.7], [10, 17.8], [0, 1, 1.7]);
  add(plane, ceiling, [0, 4.2, 1.7], [10, 17.8], [0, 0, 1.7]);
  add(plane, wall, [-5, 2.1, 1.7], [17.8, 4.2], [0, 2.1, 1.7]);
  add(plane, wall, [5, 2.1, 1.7], [17.8, 4.2], [0, 2.1, 1.7]);
  add(plane, cyc, [0, 2.1, -7.2], [10, 4.2], [0, 2.1, 0]);
  add(plane, backdrop, [0, 2.07, -7.1], [4.6, 3.9], [0, 2.07, 0]);
  add(plane, front, [0, 2.1, 10.6], [10, 4.2], [0, 2.1, 0]);

  /* dark acoustic panels break up the long wall reflections */
  [[-4.95, -0.15, 0.72], [-4.95, -1.75, 1.0], [-4.95, -3.6, 1.15], [-4.95, -5.8, 1.05], [4.95, -2.55, 1.2], [4.95, -4.85, 1.15]].forEach(
    ([x, z, w]) => add(plane, panel, [x, 2.15, z], [w, 2.2], [0, 2.15, z]),
  );

  /* the lit faces of the modifiers, in their real positions */
  MODIFIERS.forEach((m) => {
    const dir = new THREE.Vector3(...m.target).sub(new THREE.Vector3(...m.pos)).normalize();
    const p = new THREE.Vector3(...m.pos).addScaledVector(dir, 0.15);
    if (m.kind === 'panel') {
      add(plane, keep(basic('#ffcf96', 9)), p.toArray(), [m.w, m.h], m.target);
    } else if (m.kind === 'octa') {
      add(octa, keep(basic('#fff4e4', 7)), p.toArray(), [m.size, m.size], m.target);
    } else {
      add(disc, keep(basic('#fff2df', 5)), p.toArray(), [m.size * 0.7, m.size * 0.7], m.target);
    }
  });

  /* rig spots: small hot points just under the ceiling */
  const spot = keep(basic('#ffe2b8', 14));
  SPOTS.forEach(({ p: [x, z] }) => add(disc, spot, [x, 3.72, z], [0.09, 0.09], [x, 0, z]));

  /* the warm-lit white returns either side of the backdrop */
  [-3.75, 3.75].forEach((x) => add(plane, keep(basic('#f4e3c8', 1.5)), [x, 2.0, -7.0], [2.3, 3.4], [x, 2.0, 0]));

  const dispose = () => disposables.forEach((d) => d.dispose());
  return { scene, dispose };
}
