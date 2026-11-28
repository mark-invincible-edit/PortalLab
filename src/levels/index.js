// Level registry. To add a level: create src/levels/cNN.js (see README) and add it to this list.
import lobby from './lobby.js';
import c01 from './c01.js';
import c02 from './c02.js';
import c03 from './c03.js';
import c04 from './c04.js';
import c05 from './c05.js';
import c06 from './c06.js';
import c07 from './c07.js';
import c08 from './c08.js';
import c09 from './c09.js';
import c10 from './c10.js';

export const LOBBY = lobby;
export const CHAMBERS = [c01, c02, c03, c04, c05, c06, c07, c08, c09, c10];
export const LEVELS = [lobby, ...CHAMBERS];
export const getLevel = (id) => LEVELS.find((l) => l.id === id) || lobby;
