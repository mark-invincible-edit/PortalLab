// Asset loading with real progress + generated placeholders for anything missing.
// - Textures: any failure produces generated procedural art (core/proctex.js) + a console warning; real PNGs always win.
// - Sounds: raw bytes are fetched here; core/audio.js decodes them and synthesizes tones for missing ones.
// - Models: optional by default. A model flagged `required: true` in config aborts loading with a clear error.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../config.js';
import { log, warn, describeTree, hashString } from './util.js';
import { makeProcedural } from './proctex.js';

const SPRITE_KEYS = new Set(['blob_shadow', 'spark', 'glow', 'smoke', 'scorch']);

export class Assets {
  constructor(renderer) {
    this.renderer = renderer;
    this.textures = {};
    this.placeholders = [];
    this.models = {};
    this.soundData = {};
    this.missing = [];
    this.maxAniso = Math.min(CONFIG.render.anisotropy, renderer.capabilities.getMaxAnisotropy());
  }

  // ------------------------------------------------------------------ placeholders
  _placeholderTexture(key, cfg) {
    const proc = makeProcedural(key, cfg.size);                 // good looking generated art first; the labelled checkerboard is the last resort
    if (proc) { const t = new THREE.CanvasTexture(proc); t.userData.placeholder = true; return t; }
    const s = cfg.size, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const hue = hashString(key) % 360;
    if (SPRITE_KEYS.has(key)) {
      // soft round sprite so particles/decals still read correctly
      const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, s, s);
    } else if (key === 'portal_noise') {
      const img = g.createImageData(s, s);
      for (let i = 0; i < s * s; i++) { const v = 90 + Math.random() * 165; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
      g.putImageData(img, 0, 0);
    } else {
      const cell = Math.max(8, s / 8);
      for (let y = 0; y < s; y += cell) for (let x = 0; x < s; x += cell) {
        const alt = ((x / cell) + (y / cell)) % 2 === 0;
        g.fillStyle = `hsl(${hue},18%,${alt ? 62 : 50}%)`; g.fillRect(x, y, cell, cell);
      }
      g.strokeStyle = '#111'; g.lineWidth = Math.max(2, s / 64); g.strokeRect(0, 0, s, s);
      if (key === 'glass') { g.globalAlpha = 0.5; g.fillStyle = '#9fc4d8'; g.fillRect(0, 0, s, s); g.globalAlpha = 1; }
    }
    // label (not on pure sprites, they would look wrong; sprites get a tiny label in a corner)
    g.fillStyle = '#000'; g.font = `bold ${Math.max(10, s / 12)}px monospace`; g.textBaseline = 'top';
    const label = `PLACEHOLDER ${cfg.file}`;
    if (!SPRITE_KEYS.has(key)) { g.fillRect(0, s / 2 - s / 10, s, s / 5); g.fillStyle = '#ff0'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(label, s / 2, s / 2, s * 0.95); }
    const t = new THREE.CanvasTexture(c);
    t.userData.placeholder = true;
    return t;
  }

  _configureTexture(t, cfg) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = cfg.tile ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.anisotropy = this.maxAniso;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
    return t;
  }

  // ------------------------------------------------------------------ loading
  async loadAll(onProgress) {
    const texKeys = Object.keys(CONFIG.textures);
    const sndKeys = Object.keys(CONFIG.sounds);
    const modelKeys = Object.keys(CONFIG.models);
    const total = texKeys.length + sndKeys.length + modelKeys.length;
    let done = 0;
    const tick = (label) => { done++; if (onProgress) onProgress(done / total, label); };

    const texLoader = new THREE.TextureLoader();
    await Promise.all(texKeys.map(async (key) => {
      const cfg = CONFIG.textures[key];
      const url = CONFIG.paths.textures + cfg.file;
      let tex = null;
      try { tex = await texLoader.loadAsync(url); } catch (e) { /* handled below */ }
      if (!tex) {
        warn(`texture missing: ${url} -> using generated placeholder`);
        this.missing.push(url); this.placeholders.push(key);
        tex = this._placeholderTexture(key, cfg);
      }
      this.textures[key] = this._configureTexture(tex, cfg);
      tick(url);
    }));

    await Promise.all(sndKeys.map(async (key) => {
      const url = CONFIG.paths.sounds ? CONFIG.paths.sounds + CONFIG.sounds[key].file : CONFIG.sounds[key].file;
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        this.soundData[key] = await r.arrayBuffer();
      } catch (e) {
        this.soundData[key] = null; this.missing.push(url);
        warn(`sound missing: ${url} -> will be synthesized with WebAudio`);
      }
      tick(url);
    }));

    const loader = new GLTFLoader();
    for (const key of modelKeys) {
      const mc = CONFIG.models[key];
      try {
        const gltf = await loader.loadAsync(mc.path);
        this.models[key] = gltf;
        if (CONFIG.debug.logHierarchy) log(`model "${key}" (${mc.path}) node hierarchy:\n${describeTree(gltf.scene)}`);
      } catch (e) {
        this.models[key] = null; this.missing.push(mc.path);
        if (mc.required) throw new Error(`Required file missing or invalid: ${mc.path} (${e && e.message ? e.message : e})`);
        warn(`model missing/invalid: ${mc.path} (${e && e.message ? e.message : e}) -> the game continues without it`);
      }
      tick(mc.path);
    }
    if (this.missing.length) warn(`${this.missing.length} asset file(s) missing; placeholders in use. See docs/ASSET_MANIFEST.md`);
  }

  tex(key) {
    const t = this.textures[key];
    if (!t) { warn(`unknown texture key "${key}"`); return this.textures.wall_dark || null; }
    return t;
  }
}
