// Pooled VFX. All particles are THREE.Points sprites sampling manifest PNGs (spark.png, glow.png, smoke.png),
// decals use scorch.png, flashes use glow.png. Fixed-size pools: nothing is allocated per frame or per spawn.
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const PVERT = /* glsl */`
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
uniform float uViewH; varying float vA; varying vec3 vC;
void main(){
  vA = aAlpha; vC = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(128.0, aSize * projectionMatrix[1][1] * uViewH * 0.5 / max(gl_Position.w, 0.02));
}`;
const PFRAG = /* glsl */`
uniform sampler2D uMap; varying float vA; varying vec3 vC;
void main(){
  vec4 t = texture2D(uMap, gl_PointCoord);
  float a = t.a * vA; if (a < 0.01) discard;
  gl_FragColor = vec4(t.rgb * vC, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const _c = new THREE.Color();
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1);

class Pool {
  constructor(scene, map, max, additive, viewHUniform) {
    this.max = max; this.cursor = 0;
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max).fill(1);
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.col = new Float32Array(max * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uMap: { value: map }, uViewH: viewHUniform },
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 8;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, grav = 0, drag = 1) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.grav[i] = grav; this.drag[i] = drag;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const i3 = i * 3;
      this.vel[i3 + 1] -= this.grav[i] * dt;
      const d = Math.pow(this.drag[i], dt * 60);
      this.vel[i3] *= d; this.vel[i3 + 1] *= d; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const k = Math.max(0, this.life[i]) / this.maxLife[i];     // 1 -> 0
      this.size[i] = this.s1[i] + (this.s0[i] - this.s1[i]) * k;
      this.alpha[i] = Math.min(1, k * 1.6);
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true; this.geo.attributes.aColor.needsUpdate = true;
  }
}

export class VFX {
  constructor(G) {
    this.G = G;
    const A = G.assets, V = CONFIG.vfx;
    this.viewH = { value: 1000 };
    this.mainViewH = 1000;
    this.sparkPool = new Pool(G.scene, A.tex('spark'), V.maxSparks, true, this.viewH);
    this.glowPool = new Pool(G.scene, A.tex('glow'), V.maxGlow, true, this.viewH);
    this.smokePool = new Pool(G.scene, A.tex('smoke'), V.maxSmoke, false, this.viewH);

    // scorch decals
    this.decals = [];
    const dgeo = new THREE.PlaneGeometry(0.55, 0.55);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(dgeo, new THREE.MeshBasicMaterial({ map: A.tex('scorch'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      m.visible = false; m.renderOrder = 3; G.scene.add(m);
      this.decals.push({ mesh: m, life: 0 });
    }
    this.decalCursor = 0;

    // flash sprites
    this.flashes = [];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.tex('glow'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false; s.renderOrder = 9; G.scene.add(s);
      this.flashes.push({ spr: s, life: 0, maxLife: 0.1, size: 0.3 });
    }
    this.flashCursor = 0;
  }

  /** Point sprite size depends on render-target height; the portal pass sets it per target. */
  setViewHeight(px) { this.viewH.value = px; }
  updateMainViewHeight() {
    const r = this.G.renderer;
    if (r.xr.isPresenting) { const c = r.xr.getCamera().cameras; this.mainViewH = c.length && c[0].viewport ? c[0].viewport.w : 1400; }
    else { r.getDrawingBufferSize(_t1v); this.mainViewH = _t1v.y; }
    this.viewH.value = this.mainViewH;
  }

  _tangents(n) {
    _t1.crossVectors(n, _up); if (_t1.lengthSq() < 1e-4) _t1.set(1, 0, 0);
    _t1.normalize(); _t2.crossVectors(n, _t1).normalize();
  }

  sparks(pos, normal, hex, count) {
    const k = CONFIG.vfx.intensity; _c.set(hex);
    this._tangents(normal);
    const n = Math.round(count * k);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3.5, up = 1 + Math.random() * 2.2;
      const ca = Math.cos(a) * sp, sa = Math.sin(a) * sp;
      this.sparkPool.spawn(pos.x + normal.x * 0.02, pos.y + normal.y * 0.02, pos.z + normal.z * 0.02,
        _t1.x * ca + _t2.x * sa + normal.x * up, _t1.y * ca + _t2.y * sa + normal.y * up, _t1.z * ca + _t2.z * sa + normal.z * up,
        0.25 + Math.random() * 0.35, 0.07, 0.015, Math.min(1, _c.r * 1.4), Math.min(1, _c.g * 1.4), Math.min(1, _c.b * 1.4), 6, 0.98);
    }
  }

  trail(pos, hex) {
    _c.set(hex);
    this.glowPool.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.28, 0.17, 0.02, _c.r, _c.g, _c.b, 0, 0.96);
  }

  flash(pos, hex, size, life) {
    const f = this.flashes[this.flashCursor]; this.flashCursor = (this.flashCursor + 1) % this.flashes.length;
    f.spr.material.color.set(hex); f.spr.position.copy(pos); f.life = f.maxLife = life; f.size = size * CONFIG.vfx.intensity;
    f.spr.visible = true; f.spr.scale.setScalar(f.size); f.spr.material.opacity = 1;
  }

  muzzleFlash(pos, hex) { this.flash(pos, hex, CONFIG.gun.muzzleFlashSize, 0.07); }

  scorch(pos, normal) {
    const d = this.decals[this.decalCursor]; this.decalCursor = (this.decalCursor + 1) % this.decals.length;
    d.mesh.position.copy(pos).addScaledVector(normal, 0.012);
    _q.setFromUnitVectors(_z, normal); d.mesh.quaternion.copy(_q); d.mesh.rotateZ(Math.random() * 6.283);
    d.mesh.scale.setScalar(0.7 + Math.random() * 0.5);
    d.life = CONFIG.vfx.decalLife; d.mesh.material.opacity = 1; d.mesh.visible = true;
  }

  portalBurst(pos, normal, hex) {
    const k = CONFIG.vfx.intensity, n = Math.round(CONFIG.vfx.portalBurst * k); _c.set(hex);
    this._tangents(normal);
    const hw = CONFIG.portal.width / 2, hh = CONFIG.portal.height / 2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      // ring at the portal rim, plane axes are the portal's right/up when the wall is vertical (t1 x t2 from the normal)
      const px = pos.x + _t1.x * ca * hw + _t2.x * sa * hh, py = pos.y + _t1.y * ca * hw + _t2.y * sa * hh, pz = pos.z + _t1.z * ca * hw + _t2.z * sa * hh;
      const sp = 0.4 + Math.random() * 0.9;
      this.glowPool.spawn(px, py, pz, (_t1.x * ca + _t2.x * sa) * sp + normal.x * 0.5, (_t1.y * ca + _t2.y * sa) * sp + normal.y * 0.5, (_t1.z * ca + _t2.z * sa) * sp + normal.z * 0.5,
        0.45 + Math.random() * 0.3, 0.16, 0.02, _c.r, _c.g, _c.b, 0, 0.95);
    }
    this.flash(pos, hex, 1.4, 0.18);
  }

  smokePuff(pos, count = 4) {
    for (let i = 0; i < count; i++) this.smokePool.spawn(pos.x + (Math.random() - 0.5) * 0.3, pos.y, pos.z + (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 0.5, 0.2, 0.8, 0.55, 0.57, 0.6, 0, 0.985);
  }

  /** Cube/fizzler disintegration: rising glow motes, sparks, a little smoke. */
  disintegrate(pos, size = 0.6) {
    const k = CONFIG.vfx.intensity; _c.set(0x9fe8ff);
    for (let i = 0; i < Math.round(34 * k); i++) {
      this.glowPool.spawn(pos.x + (Math.random() - 0.5) * size, pos.y + (Math.random() - 0.5) * size, pos.z + (Math.random() - 0.5) * size,
        (Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 0.8, 0.7 + Math.random() * 0.6, 0.12, 0.01, _c.r, _c.g, _c.b, -0.4, 0.97);
    }
    this.sparks(pos, _up, 0xbfefff, 18);
    this.smokePuff(pos, 3);
    this.flash(pos, 0xbfefff, 1.1, 0.2);
  }

  buttonBurst(pos, pressed) {
    _c.set(pressed ? 0x9bd7ff : 0xffb070);
    for (let i = 0; i < Math.round(8 * CONFIG.vfx.intensity); i++) {
      const a = Math.random() * 6.283;
      this.glowPool.spawn(pos.x, pos.y + 0.05, pos.z, Math.cos(a) * 0.8, 0.5 + Math.random() * 0.5, Math.sin(a) * 0.8, 0.4, 0.1, 0.01, _c.r, _c.g, _c.b, 1, 0.96);
    }
  }

  completeBurst(pos) {
    const k = CONFIG.vfx.intensity;
    for (let i = 0; i < Math.round(70 * k); i++) {
      const a = Math.random() * 6.283, sp = 1 + Math.random() * 3;
      const warm = Math.random() < 0.5;
      this.glowPool.spawn(pos.x, pos.y + 0.2, pos.z, Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp, 1.2 + Math.random() * 0.8, 0.14, 0.02, warm ? 1 : 0.6, warm ? 0.7 : 0.85, warm ? 0.3 : 1, 5, 0.99);
    }
    this.flash(_t1.set(pos.x, pos.y + 0.8, pos.z), 0xffffff, 2.4, 0.4);
  }

  update(dt) {
    this.sparkPool.update(dt); this.glowPool.update(dt); this.smokePool.update(dt);
    for (const d of this.decals) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) d.mesh.visible = false; else d.mesh.material.opacity = Math.min(1, d.life / 3);
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) { f.spr.visible = false; continue; }
      const k = f.life / f.maxLife;
      f.spr.material.opacity = k; f.spr.scale.setScalar(f.size * (1.4 - 0.4 * k));
    }
  }
}

const _t1v = new THREE.Vector2();
