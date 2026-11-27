// Debug tuning mode (OFF by default). Enable with CONFIG.debug.tuning = true or by opening the page with ?tune=1.
//  Desktop: press ` (backtick) -> lil-gui sliders for model offsets/scales (loaded lazily from the CDN importmap entry).
//  VR: the wrist panel shows a TUNE button -> a stepper panel (prev/next parameter, -/+ buttons).
//  Both can print a ready-to-paste config block ("Copy config to clipboard" / TO LOG).
import { CONFIG } from '../config.js';
import { warn } from '../core/util.js';

const r4 = (n) => Math.round(n * 10000) / 10000;

/** Serialize to a JS literal with unquoted keys and inline number arrays (ready to paste into config.js). */
function toJs(v, ind = 0) {
  const pad = '  '.repeat(ind);
  if (Array.isArray(v)) return '[' + v.map((x) => (typeof x === 'number' ? r4(x) : JSON.stringify(x))).join(', ') + ']';
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    return '{\n' + keys.map((k) => `${pad}  ${k}: ${toJs(v[k], ind + 1)},`).join('\n') + '\n' + pad + '}';
  }
  return typeof v === 'string' ? `'${v}'` : String(v);
}

function arr3(v) { return Array.isArray(v) ? v : [v, v, v]; }

export class DebugTuner {
  constructor(G) {
    this.G = G;
    for (const k of ['playermodel', 'portalgun']) CONFIG.models[k].scale = arr3(CONFIG.models[k].scale).slice();   // sliders need arrays
    this.gui = null; this.vrPanel = null; this.vrOpen = false; this.sel = 0; this.params = this._buildParams();
  }

  _apply() { const G = this.G; if (G.gun) G.gun.applyConfig(); if (G.body) G.body.applyConfig(); }

  exportText() {
    const m = CONFIG.models, b = CONFIG.body;
    const out = {
      models: {
        playermodel: { scale: m.playermodel.scale, positionOffset: m.playermodel.positionOffset, rotationOffset: m.playermodel.rotationOffset, targetHeight: m.playermodel.targetHeight },
        portalgun: { scale: m.portalgun.scale, positionOffset: m.portalgun.positionOffset, rotationOffset: m.portalgun.rotationOffset, targetLength: m.portalgun.targetLength, muzzleOffset: m.portalgun.muzzleOffset, handOffset: m.portalgun.handOffset, desktopOffset: m.portalgun.desktopOffset },
      },
      body: { handPositionOffset: b.handPositionOffset, handRotationOffsetDeg: b.handRotationOffsetDeg, poleWeight: b.poleWeight, strideLength: b.strideLength, stepFreqMax: b.stepFreqMax, hipBob: b.hipBob, bodyYawLag: b.bodyYawLag },
    };
    return '// --- PortalLab tuned values: merge these keys into src/config.js ---\n' + toJs(out) + '\n';
  }

  async copy() {
    const text = this.exportText();
    console.log(text);
    try { await navigator.clipboard.writeText(text); this.G.ui.toast('CONFIG COPIED'); }
    catch (e) { warn('clipboard unavailable; the config block was printed to the console'); this.G.ui.toast('SEE CONSOLE FOR CONFIG'); }
  }

  // ---------------------------------------------------------------------------------------------- desktop GUI
  async toggle() {
    if (this.G.input.mode === 'xr') return;
    if (!this.gui) {
      let GUI;
      try { GUI = (await import('lil-gui')).default; } catch (e) { warn('lil-gui could not be loaded from the CDN', e); return; }
      this.gui = new GUI({ title: 'PortalLab tuning' });
      const proxy = (arr) => { const o = {}; ['x', 'y', 'z'].forEach((k, i) => Object.defineProperty(o, k, { get: () => arr[i], set: (v) => { arr[i] = v; }, enumerable: true })); return o; };
      const vec = (f, name, arr, lo, hi, step) => { const sub = f.addFolder(name); sub.close(); const p = proxy(arr); for (const k of ['x', 'y', 'z']) sub.add(p, k, lo, hi, step).onChange(() => this._apply()); };
      const m = CONFIG.models;
      const fp = this.gui.addFolder('Player model');
      vec(fp, 'scale (xyz)', m.playermodel.scale, 0.2, 3, 0.01); vec(fp, 'positionOffset (m)', m.playermodel.positionOffset, -1, 1, 0.005); vec(fp, 'rotationOffset (deg)', m.playermodel.rotationOffset, -180, 180, 1);
      fp.add(m.playermodel, 'targetHeight', 1.2, 2.3, 0.01).onChange(() => this._apply());
      const fg = this.gui.addFolder('Portal gun');
      vec(fg, 'scale (xyz)', m.portalgun.scale, 0.2, 3, 0.01); vec(fg, 'positionOffset (m)', m.portalgun.positionOffset, -0.5, 0.5, 0.002); vec(fg, 'rotationOffset (deg)', m.portalgun.rotationOffset, -180, 180, 1);
      fg.add(m.portalgun, 'targetLength', 0.1, 0.9, 0.005).onChange(() => this._apply());
      vec(fg, 'muzzleOffset (m)', m.portalgun.muzzleOffset, -1, 1, 0.005);
      vec(fg, 'handOffset.position (VR)', m.portalgun.handOffset.position, -0.3, 0.3, 0.002); vec(fg, 'handOffset.rotation (VR deg)', m.portalgun.handOffset.rotation, -180, 180, 1);
      vec(fg, 'desktopOffset.position', m.portalgun.desktopOffset.position, -0.8, 0.8, 0.005); vec(fg, 'desktopOffset.rotation (deg)', m.portalgun.desktopOffset.rotation, -180, 180, 1);
      const fb = this.gui.addFolder('Arms / IK');
      fb.add(CONFIG.body, 'ikEnabled'); fb.add(CONFIG.body, 'poleWeight', 0, 1, 0.01); fb.add(CONFIG.debug, 'drawIK').name('draw IK debug');
      vec(fb, 'left hand pos offset', CONFIG.body.handPositionOffset.left, -0.2, 0.2, 0.002); vec(fb, 'right hand pos offset', CONFIG.body.handPositionOffset.right, -0.2, 0.2, 0.002);
      vec(fb, 'left hand rot offset (deg)', CONFIG.body.handRotationOffsetDeg.left, -180, 180, 1); vec(fb, 'right hand rot offset (deg)', CONFIG.body.handRotationOffsetDeg.right, -180, 180, 1);
      const fw = this.gui.addFolder('Walk');
      fw.add(CONFIG.body, 'strideLength', 0.6, 2.5, 0.01); fw.add(CONFIG.body, 'stepFreqMax', 1, 5, 0.05); fw.add(CONFIG.body, 'hipBob', 0, 0.08, 0.001); fw.add(CONFIG.body, 'bodyYawLag', 1, 20, 0.1);
      this.gui.add({ copy: () => this.copy() }, 'copy').name('Copy config to clipboard');
    } else this.gui.show(this.gui._hidden);
  }

  // ---------------------------------------------------------------------------------------------- VR stepper
  _buildParams() {
    const m = CONFIG.models, P = [];
    const add = (label, arr, i, step, lo, hi) => P.push({ label, get: () => arr[i], set: (v) => { arr[i] = Math.min(hi, Math.max(lo, v)); }, step });
    const v3 = (label, arr, step, lo, hi) => ['X', 'Y', 'Z'].forEach((a, i) => add(`${label} ${a}`, arr, i, step, lo, hi));
    v3('GUN SCALE', m.portalgun.scale, 0.02, 0.1, 4); v3('GUN POS', m.portalgun.positionOffset, 0.005, -0.5, 0.5); v3('GUN ROT', m.portalgun.rotationOffset, 5, -360, 360);
    add('GUN LENGTH', m.portalgun, 'targetLength', 0.01, 0.1, 1);
    v3('MUZZLE', m.portalgun.muzzleOffset, 0.005, -1, 1);
    v3('HAND POS', m.portalgun.handOffset.position, 0.005, -0.3, 0.3); v3('HAND ROT', m.portalgun.handOffset.rotation, 5, -360, 360);
    v3('BODY SCALE', m.playermodel.scale, 0.02, 0.2, 3); v3('BODY POS', m.playermodel.positionOffset, 0.01, -1, 1); v3('BODY ROT', m.playermodel.rotationOffset, 5, -360, 360);
    add('BODY HEIGHT', m.playermodel, 'targetHeight', 0.02, 1.2, 2.4);
    v3('L WRIST POS', CONFIG.body.handPositionOffset.left, 0.005, -0.2, 0.2); v3('R WRIST POS', CONFIG.body.handPositionOffset.right, 0.005, -0.2, 0.2);
    v3('L HAND ROT', CONFIG.body.handRotationOffsetDeg.left, 5, -360, 360); v3('R HAND ROT', CONFIG.body.handRotationOffsetDeg.right, 5, -360, 360);
    return P;
  }

  toggleVR() {
    const G = this.G;
    if (!this.vrPanel) {
      this.vrPanel = G.ui._add({
        w: 1.5, h: 1.1, draw: (g, p) => {
          const par = this.params[this.sel];
          p.rect(0, 0, p.pxW, p.pxH, '#23262b'); p.header('TUNING', 'DEBUG');
          p.text(par.label, 32, 112, 40); p.text(par.get().toFixed(3), 32, 168, 56);
          p.btn('pp', 32, 260, 270, 56, 'PREV PARAM', () => { this.sel = (this.sel + this.params.length - 1) % this.params.length; p.dirty = true; }, { size: 22 });
          p.btn('pn', 318, 260, 270, 56, 'NEXT PARAM', () => { this.sel = (this.sel + 1) % this.params.length; p.dirty = true; }, { size: 22 });
          const step = (k) => () => { par.set(par.get() + par.step * k); this._apply(); p.dirty = true; };
          p.btn('m10', 32, 332, 130, 56, '-x10', step(-10), { size: 22 }); p.btn('m1', 174, 332, 130, 56, '-', step(-1), { size: 22 });
          p.btn('p1', 316, 332, 130, 56, '+', step(1), { size: 22 }); p.btn('p10', 458, 332, 130, 56, '+x10', step(10), { size: 22 });
          p.btn('log', 32, 404, 556, 56, 'COPY CONFIG (TO LOG)', () => this.copy(), { size: 22 });
          p.text(`${this.sel + 1} / ${this.params.length}`, 32, 480, 20, '#8c9097');
        },
      });
      G.scene.add(this.vrPanel.mesh);
    }
    this.vrOpen = !this.vrOpen;
    if (this.vrOpen) { G.ui.placeFront(this.vrPanel, 1.4); this.vrPanel.show(); } else this.vrPanel.hide();
  }
}
