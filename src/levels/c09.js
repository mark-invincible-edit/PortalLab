// CHAMBER 09 - GAUNTLET: a fizzler grid splits the hall (it clears portals and destroys cubes), two sentries cover the far half, and the cube
// has to get onto the pad. Place a portal before the grid and one after it on the white wall, carry the cube through, shield yourself with it.
import { slab, wall, room, P, N } from './helpers.js';

export default {
  id: 'c09', number: 9, title: 'CHAMBER 09', sub: 'GAUNTLET', hint: 'Portals skip the grid. A cube stops sentry shots.',
  ambience: 'ambience_chamber', killY: -10,
  spawn: { pos: [0, 0, 1.5], yaw: 0 },
  slabs: [
    ...room({ x0: -4, x1: 4, z0: -24, z1: 3.5, y1: 4.5, west: false, east: false, north: { surface: N, tex: 'wall_dark' }, south: { surface: N, tex: 'wall_dark' } }),
    slab([-4.5, 0, -17.5], [-4, 4.5, 4], P, 'wall_white'),                 // both halves of the hall: portalable on both sides of the grid
    slab([-4.5, 0, -24.5], [-4, 4.5, -17.5], N, 'wall_dark'),
    slab([4, 0, -17.5], [4.5, 4.5, 4], N, 'wall_dark'),
    slab([4, 0, -24.5], [4.5, 4.5, -17.5], N, 'wall_dark'),
    ...wall('z', -17.5, -17, -4, 4, 0, 4.5, [{ a0: -1, a1: 1, y0: 0, y1: 2.4 }], N, 'wall_dark'),
  ],
  props: [
    { type: 'fizzler', axis: 'z', pos: [0, 1.25, -9.5], size: [8, 5.5] },
    { type: 'cube', pos: [1.5, 0.31, 0.5] },
    { type: 'button', id: 'b1', pos: [0, 0, -14] },
    { type: 'door', id: 'd1', min: [-1, 0, -17.45], max: [1, 2.4, -17.05] },
    { type: 'sentry', pos: [-3.1, 1.3, -16.7], yaw: 180, range: 11 },
    { type: 'sentry', pos: [3.1, 1.3, -16.7], yaw: 180, range: 11 },
    { type: 'exit', min: [-2, 0, -23], max: [2, 3, -19] },
    { type: 'robot', pos: [0, 3.75, -2], ceiling: 4.5 },
    { type: 'sign', pos: [3.97, 2.9, 1.5], yaw: -90, size: [1.3, 0.95], title: 'CHAMBER 09', sub: 'GAUNTLET', icon: 'sentry' },
  ],
  links: [{ button: 'b1', door: 'd1' }],
  checkpoints: [],
};
