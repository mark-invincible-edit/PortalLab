// CHAMBER 04 - LIMITS: only the floor patch and the upper back wall accept portals.
// Drop from the 8 m platform into a floor portal, exit a high wall portal at speed and fly across the gap.
import { slab, carve, P, N } from './helpers.js';

const floorBase = slab([-0.5, -0.5, 0], [5, 0, 4], N, 'floor_tile');
const patch = { min: [0, -0.5, 0.5], max: [4, 0, 3.5] };

export default {
  id: 'c04', number: 4, title: 'CHAMBER 04', sub: 'LIMITS', hint: 'Falling speed is not lost in a portal.',
  ambience: 'ambience_chamber', killY: -6,
  spawn: { pos: [-2.7, 8, 2], yaw: -90 },
  slabs: [
    ...carve(floorBase, [patch]),
    slab(patch.min, patch.max, P, 'wall_white'),                         // the only portalable floor
    slab([-5, -0.5, 0], [-0.5, 8, 4], N, 'floor_tile'),                  // 8 m start platform
    slab([-5, -8, -16.5], [5, 0, -4], N, 'floor_tile'),                  // far platform
    slab([-5.5, -8, -17], [-5, 16, 4.5], N, 'wall_dark'),                // west wall
    slab([5, -8, -17], [5.5, 16, 4.5], N, 'wall_dark'),                  // east wall
    slab([-5, -8, -17], [5, 16, -16.5], N, 'wall_dark'),                 // far wall
    slab([-5, -8, 4], [5, 3, 4.5], N, 'wall_dark'),                      // back wall, lower: rejects portals
    slab([-5, 3, 4], [5, 16, 4.5], P, 'wall_white'),                     // back wall, upper: accepts portals
    slab([-5.5, 16, -17], [5.5, 16.5, 4.5], N, 'wall_dark'),             // ceiling
  ],
  props: [
    { type: 'robot', pos: [0, 13, -8], ceiling: 16, scale: 1.3 },
    { type: 'exit', min: [-1.5, 0, -14], max: [1.5, 3, -12] },
    { type: 'sign', pos: [4.97, 9.5, 1.5], yaw: -90, size: [1.7, 1.2], title: 'CHAMBER 04', sub: 'WHITE PANELS ONLY', icon: 'fling' },
  ],
  lights: [
    { pos: [-2.7, 11.5, 2], panel: false, intensity: 32, dist: 16 },
    { pos: [2, 5, 2], panel: false, intensity: 26, dist: 14 },
    { pos: [0, 5.5, -10], panel: false, intensity: 28, dist: 16 },
  ],
  links: [], checkpoints: [],
};
