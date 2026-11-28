// Lighting + shadows + quality levels.
//   hemisphere fill + generated room environment (ambient / reflections)
//   one shadow-casting key light that follows the player (desktop 'high'; off on Quest by default, see CONFIG.render.levels)
//   a small pool of point lights that is re-assigned to the nearest ceiling lights of the level (a fixed count, so no shader recompiles)
//   two portal glow lights (blue / orange) that light the surroundings of open portals
// Shadow maps are only re-rendered once per frame (autoUpdate = false, main.js sets needsUpdate), not once per portal view.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG } from '../config.js';
import { clamp } from './util.js';

const MAX_POOL = 4;
const _v = new THREE.Vector3();

export class Lighting {
  constructor(G) {
    this.G = G;
    const { renderer, scene } = G;
    const R = CONFIG.render;

    // environment (PMREM of a procedural room): ambient light + soft reflections for every PBR material, including the GLB models
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.env; G.envMap = this.env;

    this.hemi = new THREE.HemisphereLight(0xdfe6ee, 0x30343a, 0.6); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 2.4);
    this.sunDir = new THREE.Vector3(0.35, 0.9, 0.25).normalize();
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.035; this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);

    this.pool = [];
    for (let i = 0; i < MAX_POOL; i++) {
      const l = new THREE.PointLight(0xfff0dd, 0, 14, 2);
      l.userData = { spot: null, target: 0 };
      scene.add(l); this.pool.push(l);
    }
    this.flashLight = new THREE.PointLight(0xffb060, 0, 7, 2); scene.add(this.flashLight); this.flashI = 0;   // shared muzzle-flash light (one, so the light count never changes)
    this.portalLights = [0, 1].map((i) => { const l = new THREE.PointLight(i === 0 ? CONFIG.portal.colors.blue : CONFIG.portal.colors.orange, 0, 7, 2); scene.add(l); return l; });
    this.q = CONFIG.render.levels.high; this.qName = 'high'; this.mode = '';
    this.timer = 0;
    this.applyMode(false);
  }

  resolveQuality(xr) {
    const q = CONFIG.render.quality;
    return q === 'low' || q === 'med' || q === 'high' ? q : (xr ? 'med' : 'high');
  }

  /** Apply the quality level for the current presentation mode. Cheap to call; only changes things when needed. */
  applyMode(xr) {
    const name = this.resolveQuality(xr), key = name + (xr ? ':xr' : ':desktop');
    if (key === this.mode) return;
    this.mode = key; this.qName = name; this.q = CONFIG.render.levels[name];
    const { renderer, scene } = this.G;
    const wasShadows = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = this.q.shadows;
    this.sun.castShadow = this.q.shadows;
    const size = xr ? Math.min(1024, this.q.shadowMap) : this.q.shadowMap;
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    const r = CONFIG.render.shadowRadius, c = this.sun.shadow.camera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = 90; c.updateProjectionMatrix();
    if (wasShadows !== this.q.shadows) scene.traverse((o) => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.needsUpdate = true; }); });
    for (const l of this.pool) l.userData.target = 0;
    this.timer = 0;                                              // re-pick the pooled lights next update
  }

  /** Brief light at a muzzle flash. Only one at a time (the latest wins). */
  flash(pos, hex = 0xffb060, intensity = 14) {
    if (this.qName === 'low') return;
    this.flashLight.position.copy(pos); this.flashLight.color.set(hex); this.flashI = intensity;
  }

  setLevel(level) { this.level = level; this.timer = 0; for (const l of this.pool) { l.userData.spot = null; l.intensity = 0; } }

  update(dt) {
    const G = this.G, pl = G.player, P = G.portals;
    // key light follows the player (snapped to 0.5 m so shadows do not crawl)
    const sx = Math.round(pl.head.x * 2) / 2, sy = Math.round(pl.cap.y), sz = Math.round(pl.head.z * 2) / 2;
    this.sun.target.position.set(sx, sy, sz);
    this.sun.position.set(sx, sy, sz).addScaledVector(this.sunDir, 40);
    this.sun.target.updateMatrixWorld();

    // pooled ceiling lights: nearest spots to the head
    this.timer -= dt;
    const spots = this.level ? this.level.lightSpots : null;
    const n = Math.min(this.q.lights, MAX_POOL);
    if (spots && this.timer <= 0) {
      this.timer = 0.25;
      const order = spots.map((s) => ({ s, d: s.pos.distanceToSquared(pl.head) })).sort((a, b) => a.d - b.d).slice(0, n).map((o) => o.s);
      const free = [];
      this.pool.forEach((l, i) => { if (i >= n || !order.includes(l.userData.spot)) free.push(l); });
      for (const s of order) {
        if (this.pool.some((l, i) => i < n && l.userData.spot === s)) continue;
        const l = free.shift(); if (!l) break;
        l.userData.spot = s; l.position.copy(s.pos); l.color.set(s.color); l.distance = s.dist; l.intensity = 0;
      }
      for (const l of free) l.userData.spot = null;
    }
    const k = 1 - Math.exp(-7 * dt);
    this.pool.forEach((l, i) => {
      const s = l.userData.spot, tgt = i < n && s ? s.intensity : 0;
      l.intensity += (tgt - l.intensity) * k;
    });

    this.flashI *= Math.exp(-38 * dt); this.flashLight.intensity = this.flashI < 0.05 ? 0 : this.flashI;

    // portal glow
    for (let i = 0; i < 2; i++) {
      const p = P.portals[i], l = this.portalLights[i];
      const on = this.q.portalLights && (p.active ? p.anim : 0);
      l.intensity += ((on ? 3.2 * on : 0) - l.intensity) * k;
      if (p.active || l.intensity > 0.02) l.position.copy(p.pos).addScaledVector(p.normal, 0.7);
    }
  }
}
