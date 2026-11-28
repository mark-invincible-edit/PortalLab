// CHAMBER 08 - LONG FLIGHT: an eight meter void separates the high start platform from the far platform. Fall 14 m into a portal on the floor
// patch and leave through a portal high on the back wall: the speed of the fall flings you across. Higher exit portal = farther flight.
import { slab, carve, P, N } from './helpers.js';

const patch = { min: [0, -0.5, 0.5], max: [4, 0, 3.5] };
const floorBase = slab([-0.5, -0.5, 0], [5, 0, 4], N, 'floor_tile');

export default {
  id: 'c08', number: 8, title: 'CHAMBER 08', sub: 'LONG FLIGHT', hint: 'Fall into the floor patch, leave high on the back wall.',
  ambience: 'ambience_chamber', killY: -8,
  spawn: { pos: [-2.7, 14, 2], yaw: -90 },
  slabs: [
    slab([-5, -0.5, 0], [-0.5, 14, 4], N, 'floor_tile'),                   // tall start platform
    ...carve(floorBase, [patch]),
    slab(patch.min, patch.max, P, 'wall_white'),                           // the only portalable floor
    slab([-5, -8, -25], [5, 0, -8], N, 'floor_tile'),                      // far platform
    slab([-5.5, -8, -25.5], [-5, 24, 4.5], N, 'wall_dark'),
    slab([5, -8, -25.5], [5.5, 24, 4.5], N, 'wall_dark'),
    slab([-5, -8, -25.5], [5, 24, -25], N, 'wall_dark'),
    slab([-5, -8, 4], [5, 3.5, 4.5], N, 'wall_dark'),                      // back wall, lower part rejects portals
    slab([-5, 3.5, 4], [5, 24, 4.5], P, 'wall_white'),                     // back wall, upper part accepts them
    slab([-5.5, 24, -25.5], [5.5, 24.5, 4.5], N, 'wall_dark'),
  ],
  props: [
    { type: 'exit', min: [-1.5, 0, -23], max: [1.5, 3, -20] },
    { type: 'robot', pos: [0, 19, -4], ceiling: 24, scale: 1.4 },
    { type: 'sign', pos: [-4.97, 16.4, 2], yaw: 90, size: [1.3, 0.95], title: 'CHAMBER 08', sub: 'LONG FLIGHT', icon: 'fling' },
  ],
  lights: [
    { pos: [-2.5, 17, 2], panel: false, intensity: 34, dist: 18 },
    { pos: [2, 7, 2], panel: false, intensity: 30, dist: 16 },
    { pos: [0, 8, -15], panel: false, intensity: 34, dist: 18 },
    { pos: [0, 8, -21], panel: false, intensity: 30, dist: 16 },
  ],
  links: [],
  checkpoints: [{ min: [-5, 0, -24], max: [5, 3, -9], pos: [0, 0, -10], yaw: 0 }],
};
