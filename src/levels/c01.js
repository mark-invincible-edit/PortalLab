// CHAMBER 01 - ORIENTATION: walk, fire both portals, step through, pick up and use a cube.
// Zone S (spawn, z 3.5..-3) -> low barrier (1.2 m; stack the cube and jump) -> zone M (z -3.5..-9.5)
// -> partition with an aperture you can shoot through (z -10..-9.5) -> zone F with the exit.
import { room, wall, slab, P, N } from './helpers.js';

export default {
  id: 'c01', number: 1, title: 'CHAMBER 01', sub: 'ORIENTATION', hint: 'Grip picks up a cube. Triggers fire portals.',
  ambience: 'ambience_chamber', killY: -20,
  spawn: { pos: [0, 0, 1.5], yaw: 0 },
  slabs: [
    ...room({ x0: -3, x1: 3, z0: -17, z1: 3.5, y0: 0, y1: 4.5, west: false, east: false,
      north: { surface: P, tex: 'wall_white' }, south: { surface: N, tex: 'wall_dark' } }),
    // side walls: dark in the spawn zone, white (portalable) beyond the barrier
    slab([-3.5, 0, -3.5], [-3, 4.5, 4], N, 'wall_dark'), slab([-3.5, 0, -17.5], [-3, 4.5, -3.5], P, 'wall_white'),
    slab([3, 0, -3.5], [3.5, 4.5, 4], N, 'wall_dark'), slab([3, 0, -17.5], [3.5, 4.5, -3.5], P, 'wall_white'),
    // low barrier
    slab([-3, 0, -3.5], [3, 1.2, -3], N, 'wall_dark'),
    // partition with an aperture at y 1.3..2.7 (too high to walk, wide enough to shoot through)
    ...wall('z', -10, -9.5, -3, 3, 0, 4.5, [{ a0: -1, a1: 1, y0: 1.3, y1: 2.7 }], P, 'wall_white'),
  ],
  props: [
    { type: 'robot', pos: [0, 3.75, -6], ceiling: 4.5 },
    { type: 'cube', pos: [1.5, 0.31, 0.5] },
    { type: 'exit', min: [-1.5, 0, -14], max: [1.5, 3, -12] },
    { type: 'sign', pos: [-2.97, 2.2, -0.5], yaw: 90, size: [1.1, 0.8], title: 'CHAMBER 01', sub: 'GRIP: PICK UP CUBE', icon: 'grip' },
    { type: 'sign', pos: [-2.97, 2.2, -2.2], yaw: 90, size: [1.1, 0.8], title: 'STEP UP', sub: 'CUBE + JUMP', icon: 'jump' },
    { type: 'sign', pos: [2.97, 3.4, -6.5], yaw: -90, size: [1.1, 0.8], title: 'PORTALS', sub: 'BLUE + ORANGE', icon: 'portals' },
  ],
  links: [], checkpoints: [],
};
