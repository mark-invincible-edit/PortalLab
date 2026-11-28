// CHAMBER 10 - THE CORE: the final test. A toxic pit and a 2.2 m ledge stand between you and the button that opens the last door.
// One portal beside you, one on the white wall above the ledge, carry the cube up and set it on the pad.
import { slab, wall, P, N } from './helpers.js';

export default {
  id: 'c10', number: 10, title: 'CHAMBER 10', sub: 'THE CORE', hint: 'Portal up to the ledge, cube on the pad.',
  ambience: 'ambience_chamber', killY: -10,
  spawn: { pos: [0, 0, 3], yaw: 0 },
  slabs: [
    slab([-4.5, -3.5, -3], [4.5, 0, 4], N, 'floor_tile'),                  // near platform
    slab([-4.5, -3.5, -9], [4.5, -3, -3], N, 'wall_dark'),                 // pit floor
    slab([-4.5, -3.5, -17.5], [4.5, 2.2, -9], N, 'floor_tile'),            // ledge block
    slab([-4.5, -3.5, -23], [4.5, 2.2, -17.5], N, 'floor_tile'),           // exit block (same height)
    slab([-5, -3.5, -3], [-4.5, 7, 4.5], P, 'wall_white'),                 // west wall near
    slab([-5, -3.5, -9], [-4.5, 7, -3], N, 'wall_dark'),
    slab([-5, -3.5, -17.5], [-4.5, 7, -9], P, 'wall_white'),               // west wall above the ledge
    slab([-5, -3.5, -23.5], [-4.5, 7, -17.5], N, 'wall_dark'),
    slab([4.5, -3.5, -23.5], [5, 7, 4.5], N, 'wall_dark'),                 // east wall
    slab([-4.5, -3.5, 4], [4.5, 7, 4.5], N, 'wall_dark'),
    slab([-5, 7, -23.5], [5, 7.5, 4.5], N, 'wall_dark'),
    slab([-4.5, -3.5, -23.5], [4.5, 7, -23], N, 'wall_dark'),              // far wall
    ...wall('z', -17.5, -17, -4.5, 4.5, 2.2, 7, [{ a0: -1, a1: 1, y0: 2.2, y1: 4.6 }], N, 'wall_dark'),   // wall + final doorway
  ],
  props: [
    { type: 'goo', min: [-4.5, -3, -9], max: [4.5, -1.5, -3] },
    { type: 'cube', pos: [-2, 0.31, 1.5] },
    { type: 'button', id: 'b1', pos: [3, 2.2, -12] },
    { type: 'door', id: 'd1', min: [-1, 2.2, -17.45], max: [1, 4.6, -17.05] },
    { type: 'exit', min: [-2, 2.2, -22.5], max: [2, 5.2, -19] },
    { type: 'robot', pos: [0, 5.9, -20.5], ceiling: 7, scale: 1.7 },
    { type: 'sign', pos: [-4.47, 3.4, 1.5], yaw: 90, size: [1.3, 0.95], title: 'CHAMBER 10', sub: 'THE CORE', icon: 'core' },
    { type: 'sign', pos: [-4.47, 3.0, -6], yaw: 90, size: [1.1, 0.8], title: 'DANGER', sub: 'TOXIC GOO', icon: 'goo' },
  ],
  links: [{ button: 'b1', door: 'd1' }],
  checkpoints: [{ min: [-4.5, 2.2, -17], max: [4.5, 5.2, -9.2], pos: [0, 2.2, -10], yaw: 0 }],
};
