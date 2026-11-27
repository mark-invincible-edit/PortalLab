// Lobby: safe room with the main-menu terminal. Every wall is non-portalable so you can practice firing.
import { room, N } from './helpers.js';

export default {
  id: 'lobby', number: 0, title: 'LOBBY', sub: 'TEST FACILITY', hint: 'Use the terminal to pick a chamber.',
  ambience: 'ambience_lobby', killY: -20,
  spawn: { pos: [0, 0, 2], yaw: 0 },
  slabs: [...room({ x0: -5, x1: 5, z0: -6, z1: 4, y0: 0, y1: 4, west: { surface: N, tex: 'wall_dark' }, east: { surface: N, tex: 'wall_dark' }, north: { surface: N, tex: 'wall_dark' }, south: { surface: N, tex: 'wall_dark' } })],
  props: [
    { type: 'robot', pos: [0, 3.2, -1], ceiling: 4 },
    { type: 'terminal', pos: [0, 1.55, -5.97], yaw: 0 },
    { type: 'sign', pos: [-4.97, 2.0, -1], yaw: 90, size: [1.4, 1.0], title: 'PORTALLAB', sub: 'TEST FACILITY', icon: 'portals' },
    { type: 'sign', pos: [4.97, 2.0, -1], yaw: -90, size: [1.4, 1.0], title: 'PRACTICE', sub: 'WALLS HERE REJECT PORTALS', icon: 'white' },
  ],
  links: [], checkpoints: [],
};
