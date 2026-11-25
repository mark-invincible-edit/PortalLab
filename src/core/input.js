// Unified input. Call update() once at the start of every frame; edge flags (fireBlue, jump, ...) are valid for that frame only.
//
// Quest Touch mapping (xr-standard gamepad): buttons[0] trigger, [1] grip, [3] thumbstick click, [4] A/X, [5] B/Y; axes[2],[3] thumbstick.
//   Gun-hand trigger = blue portal, off-hand trigger = orange portal. (Right-handed default: right trigger blue, left orange.)
//   Left stick move, right stick turn, A jump (right), B or Y clear portals, X pause, off-hand grip = use/pick up/drop.
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const BTN = ['fireBlue', 'fireOrange', 'jump', 'clear', 'pause', 'use', 'click'];

export class Input {
  constructor(renderer, rig, canvas) {
    this.renderer = renderer;
    this.rig = rig;
    this.canvas = canvas;
    this.mode = 'desktop';
    this.move = { x: 0, y: 0 };      // x: right+, y: forward+
    this.turn = { x: 0, y: 0 };
    this.lookDX = 0; this.lookDY = 0;
    this.hands = { left: null, right: null };
    this.controllers = [];
    this.mouse = { x: 0, y: 0, inside: false };   // client px, used for desktop UI picking
    this.locked = false;

    // per-button state: down (held), pressed (edge this frame), released (edge this frame)
    for (const b of BTN) { this[b] = false; this[b + 'Held'] = false; this[b + 'Released'] = false; }
    this._pending = {}; this._prevDown = {};
    this._keys = new Set();
    this.onToggleDebug = null;
    this.onPointerLockLost = null;
    this.onHandsChanged = null;
    this._snapReady = true;

    this._setupXR();
    this._setupDesktop();
  }

  // ------------------------------------------------------------------ XR controllers
  _setupXR() {
    const r = this.renderer;
    for (let i = 0; i < 2; i++) {
      const ctrl = r.xr.getController(i), grip = r.xr.getControllerGrip(i);
      this.rig.add(ctrl); this.rig.add(grip);
      const entry = { index: i, ctrl, grip, src: null, hand: null };
      this.controllers.push(entry);
      ctrl.addEventListener('connected', (e) => {
        entry.src = e.data;
        entry.hand = e.data.handedness === 'left' || e.data.handedness === 'right' ? e.data.handedness : (i === 0 ? 'left' : 'right');
        this._rebuildHands();
      });
      ctrl.addEventListener('disconnected', () => { entry.src = null; entry.hand = null; this._rebuildHands(); });
    }
  }

  _rebuildHands() {
    this.hands.left = null; this.hands.right = null;
    for (const c of this.controllers) if (c.src && c.hand) this.hands[c.hand] = c;
    if (this.onHandsChanged) this.onHandsChanged();
  }

  get gunHandName() { return CONFIG.handedness === 'left' ? 'left' : 'right'; }
  get offHandName() { return CONFIG.handedness === 'left' ? 'right' : 'left'; }

  /** True when this hand's controller exists and currently has a tracked pose. */
  handTracked(name) { const h = this.hands[name]; return !!(h && h.grip.visible); }

  /** Controller pointing ray (target-ray space) into out vectors. Returns false when untracked. */
  getRay(name, origin, dir) {
    const h = this.hands[name];
    if (!h || !h.ctrl.visible) return false;
    h.ctrl.updateWorldMatrix(true, false);
    const e = h.ctrl.matrixWorld.elements;
    origin.set(e[12], e[13], e[14]);
    dir.set(-e[8], -e[9], -e[10]).normalize();
    return true;
  }

  pulse(name, intensity = 0.5, ms = 40) {
    const h = this.hands[name];
    const gp = h && h.src && h.src.gamepad;
    if (!gp) return;
    try {
      if (gp.hapticActuators && gp.hapticActuators[0] && gp.hapticActuators[0].pulse) gp.hapticActuators[0].pulse(intensity, ms);
      else if (gp.vibrationActuator && gp.vibrationActuator.playEffect) gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity });
    } catch (e) { /* haptics are optional */ }
  }

  // ------------------------------------------------------------------ desktop
  _setupDesktop() {
    const cv = this.canvas;
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'desktop') return;
      if (e.repeat) return;
      this._keys.add(e.code);
      if (e.code === 'Space') { this._pending.jump = true; e.preventDefault(); }
      else if (e.code === 'KeyE') this._pending.use = true;
      else if (e.code === 'KeyR') this._pending.clear = true;
      else if (e.code === 'Escape') this._pending.pause = true;   // only fires when the pointer is NOT locked
      else if (e.code === 'Backquote' && this.onToggleDebug) this.onToggleDebug();
    });
    window.addEventListener('keyup', (e) => this._keys.delete(e.code));
    window.addEventListener('blur', () => this._keys.clear());
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('mousedown', (e) => {
      if (this.mode !== 'desktop') return;
      if (e.button === 0) { this._pending.click = true; this._mouseL = true; if (this.locked) this._pending.fireBlue = true; }
      if (e.button === 2 && this.locked) this._pending.fireOrange = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this._mouseL = false; });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
      if (this.locked) { this.lookDX += e.movementX || 0; this.lookDY += e.movementY || 0; }
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === cv;
      if (was && !this.locked && this.onPointerLockLost) this.onPointerLockLost();
    });
  }

  requestLock() { if (this.mode === 'desktop' && !this.locked) { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* needs a user gesture */ } } }
  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  // ------------------------------------------------------------------ per-frame poll
  _edge(name, down) {
    const prev = !!this._prevDown[name];
    this[name + 'Held'] = down;
    this[name] = down && !prev;
    this[name + 'Released'] = !down && prev;
    this._prevDown[name] = down;
  }

  _stick(gp, out) {
    if (!gp || !gp.axes) { out.x = 0; out.y = 0; return; }
    const ax = gp.axes.length >= 4 ? 2 : 0;
    let x = gp.axes[ax] || 0, y = gp.axes[ax + 1] || 0;
    const m = Math.hypot(x, y), dz = CONFIG.comfort.stickDeadzone;
    if (m < dz) { out.x = 0; out.y = 0; return; }
    const k = (m - dz) / (1 - dz) / m;
    out.x = x * k; out.y = y * k;
  }

  update() {
    this.mode = this.renderer.xr.isPresenting ? 'xr' : 'desktop';
    if (this.mode === 'xr') {
      const L = this.hands.left, R = this.hands.right;
      const gl = L && L.src && L.src.gamepad, gr = R && R.src && R.src.gamepad;
      const b = (gp, i) => !!(gp && gp.buttons[i] && gp.buttons[i].pressed);
      const gunGp = this.gunHandName === 'right' ? gr : gl, offGp = this.gunHandName === 'right' ? gl : gr;
      this._edge('fireBlue', b(gunGp, 0));
      this._edge('fireOrange', b(offGp, 0));
      this._edge('jump', b(gr, 4));
      this._edge('clear', b(gr, 5) || b(gl, 5));
      this._edge('pause', b(gl, 4));
      this._edge('use', b(offGp, 1));
      this._edge('click', b(gunGp, 0) || b(offGp, 0));
      const mv = { x: 0, y: 0 }, tn = { x: 0, y: 0 };
      this._stick(gl, mv); this._stick(gr, tn);
      this.move.x = mv.x; this.move.y = -mv.y;
      this.turn.x = tn.x; this.turn.y = -tn.y;
      this.lookDX = 0; this.lookDY = 0;
      return;
    }
    // desktop
    const k = this._keys, p = this._pending;
    this._edge('fireBlue', !!p.fireBlue); this._edge('fireOrange', !!p.fireOrange);
    this._edge('jump', !!p.jump); this._edge('clear', !!p.clear); this._edge('pause', !!p.pause);
    this._edge('use', !!p.use); this._edge('click', !!p.click);
    this._pending = {};
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const m = Math.hypot(f, s) || 1;
    this.move.x = s / m * (s || f ? 1 : 0); this.move.y = f / m * (s || f ? 1 : 0);
    this.turn.x = 0; this.turn.y = 0;
  }

  /** Desktop mouse position as NDC (for UI picking while the pointer is free). */
  mouseNDC(out) {
    const r = this.canvas.getBoundingClientRect();
    out.set(((this.mouse.x - r.left) / r.width) * 2 - 1, -(((this.mouse.y - r.top) / r.height) * 2 - 1));
    return out;
  }
}
