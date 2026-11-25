// Progress + settings persistence (localStorage, always wrapped in try/catch).
import { CONFIG } from '../config.js';
import { warn } from './util.js';

const KEY = 'portallab.save.v1';

export const Save = {
  data: { unlocked: 1, completed: [], settings: {} },

  load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === 'object') {
          this.data.unlocked = Math.max(1, Math.min(99, d.unlocked | 0 || 1));
          this.data.completed = Array.isArray(d.completed) ? d.completed.filter((n) => Number.isInteger(n)) : [];
          this.data.settings = d.settings && typeof d.settings === 'object' ? d.settings : {};
        }
      }
    } catch (e) { warn('save: could not read localStorage', e); }
    this.applySettings();
  },

  write() {
    try { window.localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { warn('save: could not write localStorage', e); }
  },

  /** Copy saved settings into CONFIG (called once at boot). */
  applySettings() {
    const s = this.data.settings;
    const c = CONFIG;
    if (s.handedness === 'left' || s.handedness === 'right') c.handedness = s.handedness;
    if (typeof s.snapTurn === 'boolean') c.comfort.snapTurn = s.snapTurn;
    if (typeof s.snapAngle === 'number') c.comfort.snapAngle = s.snapAngle;
    if (typeof s.vignette === 'boolean') c.comfort.vignette = s.vignette;
    if (s.moveRelativeTo === 'head' || s.moveRelativeTo === 'controller') c.comfort.moveRelativeTo = s.moveRelativeTo;
    if (typeof s.speedScale === 'number') c.comfort.speedScale = s.speedScale;
    if (typeof s.master === 'number') c.audio.master = s.master;
    if (typeof s.sfx === 'number') c.audio.sfx = s.sfx;
    if (typeof s.amb === 'number') c.audio.amb = s.amb;
  },

  /** Capture current CONFIG settings into the save data and write. */
  saveSettings() {
    const c = CONFIG;
    this.data.settings = {
      handedness: c.handedness, snapTurn: c.comfort.snapTurn, snapAngle: c.comfort.snapAngle, vignette: c.comfort.vignette,
      moveRelativeTo: c.comfort.moveRelativeTo, speedScale: c.comfort.speedScale,
      master: c.audio.master, sfx: c.audio.sfx, amb: c.audio.amb,
    };
    this.write();
  },

  complete(chamberNumber, totalChambers) {
    if (!this.data.completed.includes(chamberNumber)) this.data.completed.push(chamberNumber);
    this.data.unlocked = Math.max(this.data.unlocked, Math.min(totalChambers, chamberNumber + 1));
    this.write();
  },

  reset() { this.data.unlocked = 1; this.data.completed = []; this.write(); },
};
