// CHAMBER 05 - FIZZLER: a fizzler grid spans a toxic pit. Anything that crosses the grid is disintegrated and
// your portals close, so carry the cube across with portals (shots pass through the grid). Cube on the pad opens the door.
import { slab, wall, P, N } from './helpers.js';

export default {
  id: 'c05', number: 5, title: 'CHAMBER 05', sub: 'FIZZLER', hint: 'Portals let you skip the grid.',
  ambience: 'ambience_chamber', killY: -10,
  spawn: { pos: [0, 0, 3], yaw: 0 },
  slabs: [
    slab([-4.5, -3.5, -3], [4.5, 0, 4], N, 'floor_tile'),                  // near platform block
    slab([-4.5, -3.5, -13.5], [4.5, 0, -9], N, 'floor_tile'),              // far platform block
    slab([-4.5, -3.5, -9], [4.5, -3, -3], N, 'wall_dark'),                 // pit floor (under the goo)
    slab([-5, -3.5, -3], [-4.5, 5, 4.5], P, 'wall_white'),                 // west wall near
    slab([-5, -3.5, -9], [-4.5, 5, -3], N, 'wall_dark'),                   // west wall pit
    slab([-5, -3.5, -14], [-4.5, 5, -9], P, 'wall_white'),                 // west wall far
    slab([4.5, -3.5, -3], [5, 5, 4.5], P, 'wall_white'),
    slab([4.5, -3.5, -9], [5, 5, -3], N, 'wall_dark'),
    slab([4.5, -3.5, -14], [5, 5, -9], P, 'wall_white'),
    slab([-4.5, -3.5, 4], [4.5, 5, 4.5], N, 'wall_dark'),                  // behind spawn
    slab([-5, 5, -14], [5, 5.5, 4.5], N, 'wall_dark'),                     // ceiling
    ...wall('z', -14, -13.5, -4.5, 4.5, -3.5, 5, [{ a0: -1, a1: 1, y0: 0, y1: 2.4 }], N, 'wall_dark'),  // end wall + doorway
    // exit room
    slab([-5, -0.5, -18.5], [5, 0, -14], N, 'floor_tile'),
    slab([-5, 5, -18.5], [5, 5.5, -14], N, 'wall_dark'),
    slab([-5, 0, -18.5], [-4.5, 5, -14], N, 'wall_dark'),
    slab([4.5, 0, -18.5], [5, 5, -14], N, 'wall_dark'),
    slab([-4.5, 0, -18.5], [4.5, 5, -18], N, 'wall_dark'),
  ],
  props: [
    { type: 'robot', pos: [0, 4.0, -6], ceiling: 5 },
    { type: 'goo', min: [-4.5, -3, -9], max: [4.5, -1.5, -3] },
    { type: 'fizzler', axis: 'z', pos: [0, 1.25, -6], size: [9, 5.5] },
    { type: 'cube', pos: [-1.5, 0.31, 1.5] },
    { type: 'button', id: 'b1', pos: [0, 0, -11] },
    { type: 'door', id: 'd1', min: [-1, 0, -13.95], max: [1, 2.4, -13.55] },
    { type: 'exit', min: [-2, 0, -17], max: [2, 3, -15] },
    { type: 'sign', pos: [-4.47, 3.4, 1.5], yaw: 90, size: [1.3, 0.95], title: 'CHAMBER 05', sub: 'FIZZLER', icon: 'fizzler' },
    { type: 'sign', pos: [-4.47, 3.0, -6], yaw: 90, size: [1.1, 0.8], title: 'DANGER', sub: 'TOXIC GOO', icon: 'goo' },
  ],
  links: [{ button: 'b1', door: 'd1' }],
  checkpoints: [{ min: [-4.5, 0, -13], max: [4.5, 3, -9.2], pos: [0, 0, -10], yaw: 0 }],
};
