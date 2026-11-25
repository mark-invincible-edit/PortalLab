// World-space UI. Everything is drawn into CanvasTextures on planes (DOM is invisible in VR).
// Look: sterile industrial test facility. Flat hard-edged plates on an 8 px grid, graphite + off-white, monospace type,
// blue/orange only as functional accents. Motion is mechanical (150-400 ms): panels open with eased sliding slats, text types in
// 3-character blocks, level numbers tick, toggles slide like switches, buttons sink 2 px when pressed.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Save } from '../core/save.js';
import { CHAMBERS } from '../levels/index.js';
import { clamp, easeInOutCubic, DEG } from '../core/util.js';

const COL = CONFIG.ui.colors;
const font = (px, bold = true) => `${bold ? 'bold ' : ''}${px}px ${CONFIG.font.family}, ${CONFIG.font.fallback}`;
const _inv = new THREE.Matrix4(), _lo = new THREE.Vector3(), _ld = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3();
const _ndc = new THREE.Vector2(), _negZ = new THREE.Vector3(0, 0, -1), _hp = { px: 0, py: 0 };
const _ray = new THREE.Raycaster();

// ------------------------------------------------------------------------------------------------------------ Panel
class Panel {
  constructor(ui, o) {
    this.ui = ui; this.G = ui.G;
    this.w = o.w; this.h = o.h;
    const ppm = o.ppm || CONFIG.ui.pxPerMeter;
    this.pxW = Math.round(o.w * ppm); this.pxH = Math.round(o.h * ppm);
    this.canvas = document.createElement('canvas'); this.canvas.width = this.pxW; this.canvas.height = this.pxH;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: !!o.transparent, depthTest: !o.noDepth }));
    if (o.noDepth) this.mesh.renderOrder = 900;
    this.mesh.visible = false; this.visible = false;
    this.drawFn = o.draw; this.interactive = o.interactive !== false; this.shutters = o.shutters !== false;
    this.hits = []; this.hoverId = null; this.pressId = null; this.pressT = 0;
    this.anim = {}; this.time = 0; this.dirty = true; this._dt = 0.016; this.budget = Infinity;
  }

  show() { if (this.visible) return; this.visible = true; this.mesh.visible = true; this.time = 0; this.dirty = true; this.ui.G.audio.play('ui_click', { vol: 0.5 }); }
  hide() { this.visible = false; this.mesh.visible = false; this.hoverId = null; }
  isHover(id) { return this.hoverId === id; }

  /** Eased value (physical-switch feel) that moves toward target; marks the panel dirty while moving. */
  ease(id, target) {
    let a = this.anim[id]; if (a === undefined) a = this.anim[id] = target;
    const nv = a + (target - a) * (1 - Math.exp(-22 * this._dt));
    this.anim[id] = Math.abs(nv - target) < 0.002 ? target : nv;
    if (this.anim[id] !== target) this.dirty = true;
    return this.anim[id];
  }

  hit(o, d, out) {
    const m = this.mesh; m.updateWorldMatrix(true, false);
    _inv.copy(m.matrixWorld).invert();
    _lo.copy(o).applyMatrix4(_inv); _ld.copy(d).transformDirection(_inv);
    if (_ld.z > -1e-5) return -1;                                   // only from the front
    const t = -_lo.z / _ld.z; if (t < 0) return -1;
    const x = _lo.x + _ld.x * t, y = _lo.y + _ld.y * t;
    if (Math.abs(x) > this.w / 2 || Math.abs(y) > this.h / 2) return -1;
    out.px = (x / this.w + 0.5) * this.pxW; out.py = (0.5 - y / this.h) * this.pxH;
    return t;
  }

  hitButton(px, py) {
    for (let i = this.hits.length - 1; i >= 0; i--) { const b = this.hits[i]; if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b; }
    return null;
  }

  update(dt) {
    if (!this.visible) return;
    this._dt = dt; this.time += dt;
    if (this.pressT > 0) { this.pressT = Math.max(0, this.pressT - dt); this.dirty = true; }
    if (this.dirty || (this.shutters && this.time < 1.3)) this._redraw();
  }

  _redraw() {
    const g = this.g; this.hits.length = 0; this.dirty = false;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.pxW, this.pxH);
    this.budget = this.shutters && this.time < 1.2 ? Math.floor(Math.max(0, this.time - 0.2) * 150 / 3) * 3 : Infinity;
    this.drawFn(g, this);
    if (this.shutters && this.time < 0.6) this._slats(g);
    this.tex.needsUpdate = true;
  }

  _slats(g) {
    const n = 8, sh = this.pxH / n, pat = this.ui.platePattern(g);
    for (let i = 0; i < n; i++) {
      const e = easeInOutCubic(clamp((this.time - i * 0.03) / 0.26, 0, 1)), w = this.pxW * (1 - e);
      if (w < 1) continue;
      g.fillStyle = pat || COL.bg2; g.fillRect(0, i * sh, w, sh - 2);
      g.fillStyle = 'rgba(35,38,43,0.55)'; g.fillRect(0, i * sh, w, sh - 2);
      g.fillStyle = COL.line; g.fillRect(Math.max(0, w - 4), i * sh, 4, sh - 2);
    }
  }

  // ---- drawing helpers
  rect(x, y, w, h, fill) { this.g.fillStyle = fill; this.g.fillRect(x, y, w, h); }
  frame(x, y, w, h, col = COL.line, lw = 3) { const g = this.g; g.strokeStyle = col; g.lineWidth = lw; g.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw); }
  text(str, x, y, size, col = COL.ink, o = {}) {
    str = String(str);
    if (this.budget < str.length) { str = str.slice(0, this.budget); this.budget = 0; } else this.budget -= str.length;
    if (!str) return;
    const g = this.g; g.font = font(size, o.bold !== false); g.fillStyle = col; g.textAlign = o.align || 'left'; g.textBaseline = 'top';
    g.fillText(str, x, y, o.maxW || 4096);
  }
  /** Ticking number: digits spin, then settle left to right. */
  tick(n, digits = 2) {
    const s = String(n).padStart(digits, '0'); let out = '';
    for (let i = 0; i < s.length; i++) out += this.time > 0.5 + i * 0.15 ? s[i] : String(Math.floor(this.time * 30 + i * 3) % 10);
    return out;
  }
  btn(id, x, y, w, h, label, onClick, o = {}) {
    const g = this.g, hover = this.hoverId === id && !o.disabled, press = this.pressId === id && this.pressT > 0, oy = press ? 2 : 0;
    const ink = o.disabled ? COL.mute : hover ? COL.bg : COL.ink;
    if (hover) this.rect(x, y + oy, w, h, COL.ink);
    this.frame(x, y + oy, w, h, o.disabled ? COL.mute : COL.line);
    if (o.active) this.rect(x, y + oy, 8, h, hover ? COL.bg : COL.ink);
    const size = o.size || 26, ty = y + oy + (h - size) / 2 + 1;
    let lx = x + 20; if (o.active) lx += 4;
    if (o.lead) { this.text(o.lead, lx, ty, size, ink); lx += size * 0.62 * (o.lead.length + 1.2); }
    this.text(label, lx, ty, size, ink, { maxW: w - (lx - x) - 16 });
    if (o.right) this.text(o.right, x + w - 16, ty, size, ink, { align: 'right' });
    this.hits.push({ id, x, y, w, h, onClick, disabled: !!o.disabled });
  }
  /** Physical slide switch: slot with a block that slides. */
  toggle(id, x, y, w, label, on, onClick, valueText) {
    const hover = this.hoverId === id, h = 44, ink = hover ? COL.bg : COL.ink;
    if (hover) this.rect(x, y, w, h, COL.ink);
    this.frame(x, y, w, h, COL.line);
    this.text(label, x + 16, y + 9, 24, ink);
    const sx = x + w - 96, e = this.ease(id, on ? 1 : 0);
    this.frame(sx, y + 8, 80, 28, ink, 3);
    this.rect(sx + 4 + e * 40, y + 12, 32, 20, ink);
    if (valueText) this.text(valueText, sx - 12, y + 9, 22, hover ? COL.bg : COL.mute, { align: 'right' });
    this.hits.push({ id, x, y, w, h, onClick });
  }
  /** Row of blocks, `value` of `count` filled. Each block is clickable. */
  segments(id, x, y, count, value, onPick, size = 28) {
    for (let i = 0; i < count; i++) {
      const bx = x + i * (size + 8), on = i < value, hov = this.hoverId === id + i;
      this.frame(bx, y, size, size, hov ? COL.ink : COL.line, 3);
      if (on) this.rect(bx + 5, y + 5, size - 10, size - 10, COL.ink);
      this.hits.push({ id: id + i, x: bx, y, w: size, h: size, onClick: () => onPick(i) });
    }
  }
  header(title, right) {
    this.rect(0, 0, this.pxW, 80, COL.line);
    this.text(title, 32, 18, 48, COL.bg);
    if (right) this.text(right, this.pxW - 32, 30, 24, COL.bg, { align: 'right' });
  }
}

// ------------------------------------------------------------------------------------------------------------ UI
export class UI {
  constructor(G) {
    this.G = G;
    this.panels = []; this.terminals = [];
    this.consumed = false; this.toastT = 0; this.frameId = 0;
    const mk = () => ({ o: new THREE.Vector3(), d: new THREE.Vector3(), name: null, trig: false });
    this.ptrs = [mk(), mk()];
    this._pattern = null; this._patternFor = null; this._wristKey = ''; this._wristParent = null;
    this.completeInfo = null;
    const A = G.assets;

    this.pause = this._add({ w: 2.0, h: 1.7, draw: (g, p) => this._drawPause(g, p) });
    this.complete = this._add({ w: 1.6, h: 1.0, draw: (g, p) => this._drawComplete(g, p) });
    const wp = CONFIG.ui.wristPanel;
    this.wrist = this._add({ w: wp.w, h: wp.h, ppm: 700, shutters: false, draw: (g, p) => this._drawWrist(g, p) });
    this.toastPanel = this._add({ w: 0.7, h: 0.09, ppm: 800, shutters: false, interactive: false, noDepth: true, transparent: true, draw: (g, p) => this._drawToast(g, p) });
    this.cross = this._add({ w: 0.05, h: 0.05, ppm: 1280, shutters: false, interactive: false, noDepth: true, transparent: true, draw: (g, p) => this._drawCross(g, p) });
    this.hud = this._add({ w: 0.42, h: 0.07, ppm: 800, shutters: false, interactive: false, noDepth: true, transparent: true, draw: (g, p) => this._drawHud(g, p) });
    G.camera.add(this.toastPanel.mesh, this.cross.mesh, this.hud.mesh);
    this.toastPanel.mesh.position.set(0, -0.3, -1.1); this.cross.mesh.position.set(0, 0, -1); this.hud.mesh.position.set(-0.46, -0.31, -1);
    G.scene.add(this.pause.mesh, this.complete.mesh);
    this.screenPanels = [this.toastPanel.mesh, this.cross.mesh, this.hud.mesh];

    // pointer ray visuals (crossed glow strips, textured with glow.png)
    const a = new THREE.PlaneGeometry(0.005, 1); a.rotateX(-Math.PI / 2); a.translate(0, 0, -0.5);
    const b = new THREE.PlaneGeometry(0.005, 1); b.rotateX(-Math.PI / 2); b.rotateZ(Math.PI / 2); b.translate(0, 0, -0.5);
    this.rayGeo = [a, b];
    this.rays = [0, 1].map(() => {
      const grp = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ map: A.tex('glow'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide, color: 0xe8e6df });
      grp.add(new THREE.Mesh(a, mat), new THREE.Mesh(b, mat)); grp.visible = false; grp.renderOrder = 950;
      G.scene.add(grp); return grp;
    });
  }

  _add(o) { const p = new Panel(this, o); this.panels.push(p); return p; }

  /** Fill pattern from the ui_plate texture (falls back to flat graphite). */
  platePattern(g) {
    if (this._pattern && this._patternFor === g) return this._pattern;
    try { this._pattern = g.createPattern(this.G.assets.tex('ui_plate').image, 'repeat'); this._patternFor = g; } catch (e) { this._pattern = null; }
    return this._pattern;
  }

  // ------------------------------------------------------------------ panels
  createTerminal(data) {
    const panel = this._add({ w: 2.4, h: 1.7, draw: (g, p) => this._drawTerminal(g, p) });
    panel.mesh.position.fromArray(data.pos); panel.mesh.rotation.y = (data.yaw || 0) * DEG;
    this.G.scene.add(panel.mesh); panel.show();
    const t = { panel, update() {}, dispose: () => { this.G.scene.remove(panel.mesh); panel.mesh.geometry.dispose(); panel.mesh.material.dispose(); panel.tex.dispose(); const i = this.panels.indexOf(panel); if (i >= 0) this.panels.splice(i, 1); } };
    this.terminals.push(t);
    return t;
  }

  _drawTerminal(g, p) {
    const G = this.G;
    p.rect(0, 0, p.pxW, p.pxH, COL.bg);
    p.header('PORTALLAB', 'TEST FACILITY  TERMINAL 01');
    p.text('SELECT CHAMBER', 32, 104, 24, COL.mute);
    CHAMBERS.forEach((lv, i) => {
      const unlocked = lv.number <= Save.data.unlocked, done = Save.data.completed.includes(lv.number);
      p.btn('ch' + i, 32, 152 + i * 72, 896, 60, lv.sub, () => G.game.loadChamber(lv.number), { disabled: !unlocked, lead: p.tick(lv.number), right: !unlocked ? 'LOCKED' : done ? 'DONE' : 'OPEN', size: 30 });
    });
    p.btn('settings', 32, 536, 436, 56, 'SETTINGS', () => G.game.setPaused(true), { size: 24 });
    p.btn('reset', 492, 536, 436, 56, 'RESET PROGRESS', () => { Save.reset(); p.dirty = true; G.ui.toast('PROGRESS RESET'); }, { size: 24 });
    p.text(G.input.mode === 'xr' ? 'POINT + TRIGGER' : 'CLICK A ROW', 32, 620, 20, COL.mute);
    p.text('NON-PORTALABLE WALLS IN THIS ROOM. PRACTICE FIRING.', 928, 620, 20, COL.mute, { align: 'right' });
  }

  _drawPause(g, p) {
    const G = this.G, C = CONFIG, lv = G.level.data;
    p.rect(0, 0, p.pxW, p.pxH, COL.bg);
    p.header('PAUSED', `${lv.title}  ${lv.sub || ''}`);
    p.btn('resume', 32, 104, 352, 56, 'RESUME', () => G.game.setPaused(false), { size: 26 });
    p.btn('restart', 32, 168, 352, 56, 'RESTART', () => G.game.restart(), { size: 26 });
    p.btn('lobby', 32, 232, 352, 56, 'LOBBY', () => G.game.loadLobby(), { size: 26 });
    if (G.input.mode === 'xr') p.btn('quit', 32, 296, 352, 56, 'EXIT VR', () => G.game.quitVR(), { size: 26 });
    const sv = () => { Save.saveSettings(); p.dirty = true; };
    p.toggle('snap', 416, 104, 352, 'SNAP TURN', C.comfort.snapTurn, () => { C.comfort.snapTurn = !C.comfort.snapTurn; sv(); });
    p.toggle('vig', 416, 160, 352, 'VIGNETTE', C.comfort.vignette, () => { C.comfort.vignette = !C.comfort.vignette; sv(); });
    p.toggle('hand', 416, 216, 352, 'GUN HAND', C.handedness === 'left', () => { C.handedness = C.handedness === 'left' ? 'right' : 'left'; sv(); }, C.handedness === 'left' ? 'LEFT' : 'RIGHT');
    p.toggle('rel', 416, 272, 352, 'MOVE REL', C.comfort.moveRelativeTo === 'controller', () => { C.comfort.moveRelativeTo = C.comfort.moveRelativeTo === 'head' ? 'controller' : 'head'; sv(); }, C.comfort.moveRelativeTo === 'head' ? 'HEAD' : 'HAND');
    const rows = [
      ['TURN ANGLE', 3, [15, 30, 45].indexOf(C.comfort.snapAngle) + 1, (i) => { C.comfort.snapAngle = [15, 30, 45][i]; sv(); }, `${C.comfort.snapAngle} DEG`],
      ['SPEED', 6, Math.round((C.comfort.speedScale - 0.6) / 0.2) + 1, (i) => { C.comfort.speedScale = +(0.6 + i * 0.2).toFixed(1); sv(); }, `${C.comfort.speedScale.toFixed(1)}X`],
      ['MASTER', 10, Math.round(C.audio.master * 10), (i) => { C.audio.master = (i + 1) / 10; G.audio.applyVolumes(); sv(); }, ''],
      ['SFX', 10, Math.round(C.audio.sfx * 10), (i) => { C.audio.sfx = (i + 1) / 10; G.audio.applyVolumes(); sv(); }, ''],
      ['AMBIENCE', 10, Math.round(C.audio.amb * 10), (i) => { C.audio.amb = (i + 1) / 10; G.audio.applyVolumes(); sv(); }, ''],
    ];
    p.rect(32, 372, p.pxW - 64, 3, COL.line);
    rows.forEach((r, i) => {
      const y = 396 + i * 56;
      p.text(r[0], 32, y + 3, 24, COL.ink);
      p.segments('seg' + i + '_', 232, y, r[1], r[2], r[3]);
      if (r[4]) p.text(r[4], 232 + r[1] * 36 + 16, y + 3, 24, COL.mute);
    });
    p.text(G.input.mode === 'xr' ? 'X: CLOSE MENU' : 'ESC: CLOSE MENU', 32, 668 - 8, 20, COL.mute);
  }

  _drawComplete(g, p) {
    const G = this.G, info = this.completeInfo || { number: 1, hasNext: false };
    p.rect(0, 0, p.pxW, p.pxH, COL.bg);
    p.header(`CHAMBER ${p.tick(info.number)}`, 'TEST COMPLETE');
    p.text('COMPLETE', 32, 112, 72, COL.ink);
    p.btn('next', 32, 232, 576, 64, 'NEXT CHAMBER', () => G.game.nextChamber(), { disabled: !info.hasNext, size: 28 });
    p.btn('lobby2', 32, 312, 576, 64, 'RETURN TO LOBBY', () => G.game.loadLobby(), { size: 28 });
  }

  _drawWrist(g, p) {
    const G = this.G, P = G.portals, lv = G.level.data;
    p.rect(0, 0, p.pxW, p.pxH, COL.bg); p.frame(0, 0, p.pxW, p.pxH, COL.line, 3);
    p.text(`${lv.title}`, 10, 8, 17, COL.ink, { maxW: p.pxW - 20 });
    p.text(lv.sub || '', 10, 28, 14, COL.mute, { maxW: p.pxW - 20 });
    const sq = (x, col, on) => { p.frame(x, 52, 30, 24, col, 3); if (on) p.rect(x, 52, 30, 24, col); };
    sq(10, COL.blue, P.isOpen(0)); sq(48, COL.orange, P.isOpen(1));
    p.btn('wr', 8, 88, p.pxW - 16, 36, 'RESTART', () => G.game.restart(), { size: 18 });
    if (CONFIG.debug.tuning) p.btn('wt', 8, 128, p.pxW - 16, 32, 'TUNE', () => G.debug && G.debug.toggleVR(), { size: 16 });
  }

  _drawToast(g, p) {
    p.rect(0, 0, p.pxW, p.pxH, COL.bg); p.frame(0, 0, p.pxW, p.pxH, COL.line, 3);
    p.text(this._toastText || '', p.pxW / 2, 16, 32, COL.ink, { align: 'center', maxW: p.pxW - 24 });
  }

  _drawCross(g, p) {
    g.strokeStyle = 'rgba(232,230,223,0.9)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(p.pxW / 2, 8); g.lineTo(p.pxW / 2, p.pxH / 2 - 7); g.moveTo(p.pxW / 2, p.pxH / 2 + 7); g.lineTo(p.pxW / 2, p.pxH - 8);
    g.moveTo(8, p.pxH / 2); g.lineTo(p.pxW / 2 - 7, p.pxH / 2); g.moveTo(p.pxW / 2 + 7, p.pxH / 2); g.lineTo(p.pxW - 8, p.pxH / 2); g.stroke();
  }

  _drawHud(g, p) {
    const P = this.G.portals, lv = this.G.level.data;
    p.rect(0, 0, p.pxW, p.pxH, 'rgba(35,38,43,0.85)'); p.frame(0, 0, p.pxW, p.pxH, COL.line, 2);
    const sq = (x, col, on) => { p.frame(x, 12, 32, 32, col, 3); if (on) p.rect(x, 12, 32, 32, col); };
    sq(14, COL.blue, P.isOpen(0)); sq(54, COL.orange, P.isOpen(1));
    p.text(`${lv.title}  ${lv.sub || ''}`, 104, 16, 24, COL.ink, { maxW: p.pxW - 116 });
  }

  toast(msg) { this._toastText = msg; this.toastT = 1.6; this.toastPanel.show(); this.toastPanel.dirty = true; }

  /** Place a panel in front of the player, facing them (yaw only). */
  placeFront(panel, dist) {
    const pl = this.G.player, yaw = pl.headYaw;
    const px = pl.head.x - Math.sin(yaw) * dist, pz = pl.head.z - Math.cos(yaw) * dist;
    panel.mesh.position.set(px, Math.max(pl.cap.y + 0.9, pl.head.y - 0.15), pz);
    panel.mesh.rotation.set(0, Math.atan2(pl.head.x - px, pl.head.z - pz), 0);
    panel.mesh.updateMatrixWorld(true);
  }

  showPause() { this.placeFront(this.pause, CONFIG.ui.pausePanel.distance); this.pause.show(); this.pause.dirty = true; }
  hidePause() { this.pause.hide(); }
  showComplete(info) { this.completeInfo = info; this.placeFront(this.complete, 1.6); this.complete.show(); this.complete.dirty = true; }
  hideComplete() { this.complete.hide(); }
  wantsFreeCursor() { return this.pause.visible || this.complete.visible; }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const G = this.G, I = G.input, xr = I.mode === 'xr';
    this.consumed = false;

    // wrist panel on the off hand (VR only)
    const off = xr ? I.hands[I.offHandName] : null;
    const parent = off && off.grip.visible ? off.grip : null;
    if (parent !== this._wristParent) {
      this._wristParent = parent;
      if (parent) { const wp = CONFIG.ui.wristPanel; parent.add(this.wrist.mesh); this.wrist.mesh.position.fromArray(wp.offset); this.wrist.mesh.rotation.set(wp.rotation[0] * DEG, wp.rotation[1] * DEG, wp.rotation[2] * DEG); this.wrist.show(); this.wrist.dirty = true; }
      else this.wrist.hide();
    }
    const key = (G.portals.isOpen(0) ? 1 : 0) + '' + (G.portals.isOpen(1) ? 1 : 0) + G.level.data.id;
    if (key !== this._wristKey) { this._wristKey = key; this.wrist.dirty = true; this.hud.dirty = true; }
    // desktop HUD
    if (!xr) { this.hud.show(); this.cross.visible || this.cross.show(); } else { this.hud.hide(); this.cross.hide(); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastPanel.hide(); }

    for (const p of this.panels) p.update(dt);

    // pointers (preallocated slots: no per-frame allocation)
    let n = 0;
    const addPtr = (name, trig) => { const q = this.ptrs[n++]; q.name = name; q.trig = trig; q.o.copy(_o); q.d.copy(_d); };
    if (xr) {
      for (const name of ['left', 'right']) if (I.getRay(name, _o, _d)) addPtr(name, name === I.gunHandName ? I.fireBlue : I.fireOrange);
    } else if (I.locked) {
      G.camera.getWorldPosition(_o); G.camera.getWorldDirection(_d); addPtr(null, I.fireBlue);
    } else if (this.wantsFreeCursor() || this.terminals.length) {
      I.mouseNDC(_ndc); _ray.setFromCamera(_ndc, G.camera); _o.copy(_ray.ray.origin); _d.copy(_ray.ray.direction); addPtr(null, I.click);
    }
    this.frameId++;
    this.rays[0].visible = this.rays[1].visible = false;
    for (let idx = 0; idx < n; idx++) {
      const ptr = this.ptrs[idx];
      let best = null, bestT = 8;
      for (const p of this.panels) {
        if (!p.visible || !p.interactive) continue;
        const t = p.hit(ptr.o, ptr.d, _hp);
        if (t >= 0 && t < bestT) { bestT = t; best = p; best._px = _hp.px; best._py = _hp.py; }
      }
      // while a modal panel is open only it (and the wrist panel) receives pointer input
      if (best && this.wantsFreeCursor() && best !== this.pause && best !== this.complete && best !== this.wrist) best = null;
      if (!best) continue;
      const b = best.hitButton(best._px, best._py), id = b && !b.disabled ? b.id : null;
      best._hovFrame = this.frameId;
      if (best.hoverId !== id) { best.hoverId = id; best.dirty = true; if (id && ptr.name) I.pulse(ptr.name, 0.15, 15); }
      if (xr) {
        const r = this.rays[idx]; r.visible = true; r.position.copy(ptr.o); r.quaternion.setFromUnitVectors(_negZ, ptr.d); r.scale.set(1, 1, bestT);
      }
      if (ptr.trig) {
        this.consumed = true;
        if (b && !b.disabled) {
          best.pressId = b.id; best.pressT = 0.12; best.dirty = true;
          if (ptr.name) I.pulse(ptr.name, 0.5, 40);
          G.audio.play('ui_click');
          b.onClick();
        }
      }
    }
    for (const p of this.panels) if (p._hovFrame !== this.frameId && p.hoverId !== null) { p.hoverId = null; p.dirty = true; }
  }
}
