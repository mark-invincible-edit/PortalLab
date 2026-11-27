// CHAMBER 02 - GAP AND LEDGE: a 6 m bottomless gap and a 2.2 m ledge. Blue on the near wall, orange on a wall above the ledge.
import { slab, P, N } from './helpers.js';

export default {
  id: 'c02', number: 2, title: 'CHAMBER 02', sub: 'GAP AND LEDGE', hint: 'Portals can cross what you cannot jump.',
  ambience: 'ambience_chamber', killY: -6,
  spawn: { pos: [0, 0, 3], yaw: 0 },
  slabs: [
    slab([-4.5, -0.5, -3], [4.5, 0, 4.5], N, 'floor_tile'),            // near platform
    slab([-4.5, -8, -17.5], [4.5, 2.2, -9], N, 'floor_tile'),          // far block, top at y = 2.2
    slab([-5, -8, -18], [-4.5, 7, 5], P, 'wall_white'),                // west wall
    slab([4.5, -8, -18], [5, 7, 5], P, 'wall_white'),                  // east wall
    slab([-4.5, -8, -18], [4.5, 7, -17.5], P, 'wall_white'),           // far wall
    slab([-4.5, -8, 4.5], [4.5, 7, 5], N, 'wall_dark'),                // behind spawn
    slab([-5, 7, -18], [5, 7.5, 5], N, 'wall_dark'),                   // ceiling
  ],
  props: [
    { type: 'robot', pos: [0, 5.8, -6], ceiling: 7 },
    { type: 'exit', min: [-1.5, 2.2, -16], max: [1.5, 5.2, -14] },
    { type: 'sign', pos: [-4.47, 3.4, 1], yaw: 90, size: [1.3, 0.95], title: 'CHAMBER 02', sub: 'GAP AND LEDGE', icon: 'gap' },
  ],
  links: [], checkpoints: [],
};
