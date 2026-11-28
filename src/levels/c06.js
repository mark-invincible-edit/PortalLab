// CHAMBER 06 - TURRETS: two turrets guard the button at the far end of the hall. Their bullets hurt and are stopped by cubes:
// carry the cube in front of you and set it on the pad. The white side walls allow a portal shortcut.
import { slab, wall, room, P, N } from './helpers.js';

export default {
  id: 'c06', number: 6, title: 'CHAMBER 06', sub: 'TURRETS', hint: 'A cube stops their shots. Carry it in front of you.',
  ambience: 'ambience_chamber', killY: -10,
  spawn: { pos: [0, 0, 1.5], yaw: 0 },
  slabs: [
    ...room({ x0: -4, x1: 4, z0: -22, z1: 3.5, y1: 4.5, west: false, east: false, north: { surface: N, tex: 'wall_dark' }, south: { surface: N, tex: 'wall_dark' } }),
    slab([-4.5, 0, -3.5], [-4, 4.5, 4], N, 'wall_dark'),                   // start zone west
    slab([-4.5, 0, -17.5], [-4, 4.5, -3.5], P, 'wall_white'),              // hall west (portalable)
    slab([-4.5, 0, -22.5], [-4, 4.5, -17.5], N, 'wall_dark'),              // exit room west
    slab([4, 0, -3.5], [4.5, 4.5, 4], N, 'wall_dark'),
    slab([4, 0, -17.5], [4.5, 4.5, -3.5], P, 'wall_white'),
    slab([4, 0, -22.5], [4.5, 4.5, -17.5], N, 'wall_dark'),
    ...wall('z', -3.5, -3, -4, 4, 0, 4.5, [{ a0: -1.5, a1: 1.5, y0: 0, y1: 4.5 }], N, 'wall_dark'),   // start zone partition (open doorway)
    ...wall('z', -17.5, -17, -4, 4, 0, 4.5, [{ a0: -1, a1: 1, y0: 0, y1: 2.4 }], N, 'wall_dark'),     // turret wall + exit doorway
  ],
  props: [
    { type: 'cube', pos: [1.5, 0.31, 0.5] },
    { type: 'button', id: 'b1', pos: [0, 0, -14] },
    { type: 'door', id: 'd1', min: [-1, 0, -17.45], max: [1, 2.4, -17.05] },
    { type: 'turret', pos: [-3.1, 0, -16.55], yaw: 180 },
    { type: 'turret', pos: [3.1, 0, -16.55], yaw: 180 },
    { type: 'exit', min: [-2, 0, -21], max: [2, 3, -19] },
    { type: 'robot', pos: [0, 3.75, -1], ceiling: 4.5 },
    { type: 'sign', pos: [-3.97, 2.9, 1.5], yaw: 90, size: [1.3, 0.95], title: 'CHAMBER 06', sub: 'TURRETS', icon: 'sentry' },
    { type: 'sign', pos: [-3.97, 2.9, -8], yaw: 90, size: [1.1, 0.8], title: 'CAUTION', sub: 'TURRETS', icon: 'sentry' },
  ],
  links: [{ button: 'b1', door: 'd1' }],
  checkpoints: [{ min: [-4, 0, -17], max: [4, 3, -3.6], pos: [0, 0, -4.6], yaw: 0 }],
};
