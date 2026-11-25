// CHAMBER 03 - CUBE AND BUTTON: the exit door opens only while the button (inside a sealed cell) is held down.
// The cell has a high aperture to shoot through. Carry the cube through a portal onto the pad.
import { slab, wall, P, N } from './helpers.js';

export default {
  id: 'c03', number: 3, title: 'CHAMBER 03', sub: 'CUBE AND BUTTON', hint: 'A cube can hold a button for you.',
  ambience: 'ambience_chamber', killY: -20,
  spawn: { pos: [0, 0, 2], yaw: 0 },
  slabs: [
    slab([-4.5, -0.5, -15.5], [4.5, 0, 3.5], N, 'floor_tile'),                 // floor (main + exit room)
    slab([-4.5, 4, -15.5], [4.5, 4.5, 3.5], N, 'wall_dark'),                    // ceiling
    slab([-4.5, 0, -10], [-4, 4, 3.5], P, 'wall_white'),                        // west wall, main room (portalable)
    slab([-4.5, 0, -15.5], [-4, 4, -10], N, 'wall_dark'),                       // west wall, exit room
    slab([4, 0, -4], [4.5, 4, 3.5], N, 'wall_dark'),                            // east wall
    slab([4, 0, -8], [4.5, 4, -4], P, 'wall_white'),                            // east wall inside the cell (portalable)
    slab([4, 0, -15.5], [4.5, 4, -8], N, 'wall_dark'),
    slab([-4, 0, 3], [4, 4, 3.5], N, 'wall_dark'),                              // behind spawn
    // far wall with the exit doorway (door prop d1 fills it)
    ...wall('z', -10.5, -10, -4, 4, 0, 4, [{ a0: -1, a1: 1, y0: 0, y1: 2.4 }], N, 'wall_dark'),
    slab([-4.5, 0, -16], [4.5, 4, -15.5], N, 'wall_dark'),                      // end of exit room
    // sealed cell on the east side: partition with aperture, plus north/south walls
    ...wall('x', 1.5, 2, -8.5, -3.5, 0, 4, [{ a0: -7, a1: -5, y0: 1.3, y1: 2.7 }], P, 'wall_white'),
    slab([2, 0, -4], [4, 4, -3.5], N, 'wall_dark'),
    slab([2, 0, -8.5], [4, 4, -8], N, 'wall_dark'),
  ],
  props: [
    { type: 'cube', pos: [-2, 0.31, 0] },
    { type: 'button', id: 'b1', pos: [3, 0, -6] },
    { type: 'door', id: 'd1', min: [-1, 0, -10.45], max: [1, 2.4, -10.05] },
    { type: 'exit', min: [-2, 0, -14], max: [2, 3, -12] },
    { type: 'sign', pos: [-3.97, 3.4, -2], yaw: 90, size: [1.3, 0.95], title: 'CHAMBER 03', sub: 'CUBE AND BUTTON', icon: 'cube' },
    { type: 'sign', pos: [2.8, 2.0, -9.97], yaw: 0, size: [1.0, 0.75], title: 'EXIT', sub: 'HOLD BUTTON', icon: 'button' },
  ],
  links: [{ button: 'b1', door: 'd1' }], checkpoints: [],
};
