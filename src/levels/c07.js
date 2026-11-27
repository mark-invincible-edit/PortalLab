// CHAMBER 07 - TWIN BUTTONS: the door needs BOTH pads held at once. One cube goes on the near pad, the other has to cross the toxic pit
// through a portal and sit on the far pad. Carry it through the portal: it follows you.
import { slab, wall, P, N } from './helpers.js';

export default {
  id: 'c07', number: 7, title: 'CHAMBER 07', sub: 'TWIN BUTTONS', hint: 'Both pads must be pressed at once.',
  ambience: 'ambience_chamber', killY: -10,
  spawn: { pos: [0, 0, 3], yaw: 0 },
  slabs: [
    slab([-4.5, -3.5, -3], [4.5, 0, 4], N, 'floor_tile'),                  // near platform block
    slab([-4.5, -3.5, -14.5], [4.5, 0, -9], N, 'floor_tile'),              // far platform block
    slab([-4.5, -3.5, -9], [4.5, -3, -3], N, 'wall_dark'),                 // pit floor
    slab([-5, -3.5, -3], [-4.5, 5, 4.5], P, 'wall_white'),
    slab([-5, -3.5, -9], [-4.5, 5, -3], N, 'wall_dark'),
    slab([-5, -3.5, -15], [-4.5, 5, -9], P, 'wall_white'),
    slab([4.5, -3.5, -3], [5, 5, 4.5], P, 'wall_white'),
    slab([4.5, -3.5, -9], [5, 5, -3], N, 'wall_dark'),
    slab([4.5, -3.5, -15], [5, 5, -9], P, 'wall_white'),
    slab([-4.5, -3.5, 4], [4.5, 5, 4.5], N, 'wall_dark'),
    slab([-5, 5, -15], [5, 5.5, 4.5], N, 'wall_dark'),
    ...wall('z', -15, -14.5, -4.5, 4.5, -3.5, 5, [{ a0: -1, a1: 1, y0: 0, y1: 2.4 }], N, 'wall_dark'),
    // exit room
    slab([-5, -0.5, -20], [5, 0, -15], N, 'floor_tile'),
    slab([-5, 5, -20], [5, 5.5, -15], N, 'wall_dark'),
    slab([-5, 0, -20], [-4.5, 5, -15], N, 'wall_dark'),
    slab([4.5, 0, -20], [5, 5, -15], N, 'wall_dark'),
    slab([-4.5, 0, -20], [4.5, 5, -19.5], N, 'wall_dark'),
  ],
  props: [
    { type: 'goo', min: [-4.5, -3, -9], max: [4.5, -1.5, -3] },
    { type: 'cube', pos: [-1.5, 0.31, 1.5] },
    { type: 'cube', pos: [1.5, 0.31, 1.5] },
    { type: 'button', id: 'bA', pos: [-2.5, 0, -1] },
    { type: 'button', id: 'bB', pos: [2, 0, -12] },
    { type: 'door', id: 'd1', min: [-1, 0, -14.95], max: [1, 2.4, -14.55] },
    { type: 'exit', min: [-2, 0, -19], max: [2, 3, -17] },
    { type: 'robot', pos: [0, 4.0, -5], ceiling: 5 },
    { type: 'sign', pos: [-4.47, 3.4, 1.5], yaw: 90, size: [1.3, 0.95], title: 'CHAMBER 07', sub: 'TWIN BUTTONS', icon: 'button' },
    { type: 'sign', pos: [-4.47, 3.0, -6], yaw: 90, size: [1.1, 0.8], title: 'DANGER', sub: 'TOXIC GOO', icon: 'goo' },
  ],
  links: [{ button: 'bA', door: 'd1' }, { button: 'bB', door: 'd1' }],
  checkpoints: [{ min: [-4.5, 0, -14], max: [4.5, 3, -9.2], pos: [0, 0, -10], yaw: 0 }],
};
