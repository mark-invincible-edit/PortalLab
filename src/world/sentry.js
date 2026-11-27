// Sentry: a wall mounted turret that watches a cone in front of it. Once it has had you in view for aimTime it fires SLOW glowing pellets.
// Pellets are blocked by walls and by CUBES, so a carried cube is a shield. A hit costs CONFIG.sentry.damage hit points (health.js).
// Level data: { type: 'sentry', pos: [x, y, z] (head centre), yaw: degrees (0 faces -Z like the player), range?: m }
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { solidMat, glowMat } from '../core/materials.js';
import { raycastSlabs } from '../core/geom.js';

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3(), _tp = new THREE.Vector3();
const _hit = { t: 0, axis: 0, sign: 0, slab: null };
const N = 8;

export class Sentry {
  constructor(G, level, data) {
    this.G = G; this.level = level;
    this.range = data.range || CONFIG.sentry.range;
    const yaw = (data.yaw || 0) * Math.PI / 180;
    this.front = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.restQ = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(this.front.x, this.front.z));
    this.group = new THREE.Group(); this.group.position.fromArray(data.pos);
    this.head = new THREE.Group(); this.head.quaternion.copy(this.restQ); this.group.add(this.head);
    this.geos = []; this.mats = [];
    const g = (x) => { this.geos.push(x); return x; }, m = (x) => { this.mats.push(x); return x; };
    const shell = m(solidMat(G, 0x2a2e33, 0.3, 0.8)), steel = m(solidMat(G, 0x9aa0a6, 0.35, 0.9)), dark = m(solidMat(G, 0x0e0f11, 0.6, 0.4));
    const add = (parent, geo, mat, x, y, z) => { const o = new THREE.Mesh(g(geo), mat); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    add(this.head, new THREE.SphereGeometry(0.22, 24, 16), shell, 0, 0, 0);
    for (const sx of [-1, 1]) add(this.head, new THREE.CylinderGeometry(0.035, 0.045, 0.34, 10).rotateX(Math.PI / 2), steel, sx * 0.1, -0.04, 0.26);
    this.eye = new THREE.Mesh(g(new THREE.CircleGeometry(0.075, 20)), m(glowMat(0xff2a1a)));
    this.eye.position.set(0, 0.06, 0.205); this.head.add(this.eye);
    this.glow = new THREE.Sprite(m(new THREE.SpriteMaterial({ map: G.assets.tex('glow'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xff2a1a, opacity: 0.3 })));
    this.glow.scale.setScalar(0.55); this.glow.position.set(0, 0.06, 0.25); this.head.add(this.glow);
    // mount: yoke + back plate (static, aligned with the rest facing)
    const mount = new THREE.Group(); mount.quaternion.copy(this.restQ); this.group.add(mount);
    add(mount, new THREE.BoxGeometry(0.5, 0.5, 0.08), dark, 0, 0, -0.3);
    add(mount, new THREE.BoxGeometry(0.06, 0.34, 0.3), steel, 0.27, 0, -0.17);
    add(mount, new THREE.BoxGeometry(0.06, 0.34, 0.3), steel, -0.27, 0, -0.17);
    G.scene.add(this.group);

    this.pellets = [];
    for (let i = 0; i < N; i++) {
      const spr = new THREE.Sprite(m(new THREE.SpriteMaterial({ map: G.assets.tex('glow'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xff4a2a })));
      spr.scale.setScalar(0.42); spr.visible = false; G.scene.add(spr);
      this.pellets.push({ spr, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, on: false });
    }
    this.aim = 0; this.cool = 0.5; this.seen = false;
  }

  get headPos() { return this.group.position; }

  /** Can the sentry see point p (distance, cone, static geometry)? */
  _sees(p) {
    const o = this.group.position;
    _v.copy(p).sub(o); const d = _v.length();
    if (d > this.range || d < 0.5) return false;
    _v.multiplyScalar(1 / d);
    if (_v.dot(this.front) < 0.05) return false;               // behind its mounting wall
    if (this.level.raycast(o.x, o.y, o.z, _v.x, _v.y, _v.z, d - 0.2, _hit)) return false;
    return true;
  }

  update(dt) {
    const G = this.G, S = CONFIG.sentry, pl = G.player;
    const alive = !(G.health && G.health.dead);
    _tp.set(pl.cap.x, pl.cap.y + 1.0, pl.cap.z);
    const sees = alive && this._sees(_tp);
    if (sees) {
      if (!this.seen) { this.seen = true; G.audio.play('sentry_alert', { pos: this.group.position }); }
      this.aim += dt;
      _m.lookAt(_tp, this.group.position, UP); _q.setFromRotationMatrix(_m);
      this.head.quaternion.slerp(_q, 1 - Math.exp(-8 * dt));
      this.cool -= dt;
      if (this.aim >= S.aimTime && this.cool <= 0) { this._fire(_tp); this.cool = S.fireEvery * (0.9 + Math.random() * 0.3); }
    } else {
      this.seen = false; this.aim = Math.max(0, this.aim - dt * 1.5);
      this.head.quaternion.slerp(this.restQ, 1 - Math.exp(-2.5 * dt));
    }
    const heat = Math.min(1, this.aim / S.aimTime);
    this.eye.material.color.setRGB(0.35 + 0.65 * heat, 0.05 + 0.1 * heat, 0.04);
    this.glow.material.opacity = 0.12 + 0.6 * heat;

    for (const p of this.pellets) if (p.on) this._stepPellet(p, dt);
  }

  _fire(target) {
    const G = this.G, S = CONFIG.sentry;
    const p = this.pellets.find((x) => !x.on); if (!p) return;
    _f.set(0, 0, 1).applyQuaternion(this.head.quaternion);
    p.pos.copy(this.group.position).addScaledVector(_f, 0.4);
    p.vel.copy(target).sub(p.pos).normalize().multiplyScalar(S.pelletSpeed);
    p.life = this.range / S.pelletSpeed + 0.5; p.on = true; p.spr.visible = true; p.spr.position.copy(p.pos);
    G.audio.play('sentry_fire', { pos: p.pos });
    G.vfx.sparks(p.pos, _f, 0xff6a3a, 6);
  }

  _kill(p, sound = true) { p.on = false; p.spr.visible = false; if (sound) this.G.audio.play('sentry_hit', { pos: p.pos }); this.G.vfx.sparks(p.pos, _v.copy(p.vel).negate().normalize(), 0xff7a4a, 10); }

  _stepPellet(p, dt) {
    const G = this.G, S = CONFIG.sentry;
    p.life -= dt; if (p.life <= 0) { this._kill(p, false); return; }
    const step = p.vel.length() * dt;
    _w.copy(p.vel).normalize();
    // walls
    if (raycastSlabs(this.level.solids, p.pos.x, p.pos.y, p.pos.z, _w.x, _w.y, _w.z, step + S.pelletRadius, _hit)) { p.pos.addScaledVector(_w, Math.max(0, _hit.t - 0.02)); this._kill(p); return; }
    const nx = p.pos.x + p.vel.x * dt, ny = p.pos.y + p.vel.y * dt, nz = p.pos.z + p.vel.z * dt;
    // cubes block pellets (closest point on the step segment to the cube centre)
    for (const c of this.level.cubes) {
      if (c.dead) continue;
      const t = c.body.translation();
      const sx = nx - p.pos.x, sy = ny - p.pos.y, sz = nz - p.pos.z, l2 = sx * sx + sy * sy + sz * sz || 1e-6;
      const k = Math.max(0, Math.min(1, ((t.x - p.pos.x) * sx + (t.y - p.pos.y) * sy + (t.z - p.pos.z) * sz) / l2));
      const dx = p.pos.x + sx * k - t.x, dy = p.pos.y + sy * k - t.y, dz = p.pos.z + sz * k - t.z;
      if (Math.hypot(dx, dy, dz) < CONFIG.physics.cubeSize * 0.62 + S.pelletRadius) { this._kill(p); return; }
    }
    // player (vertical capsule axis, sampled at the segment end and middle)
    const cap = G.player.cap;
    if (!(G.health && G.health.dead)) {
      for (const f of [0.5, 1]) {
        const x = p.pos.x + (nx - p.pos.x) * f, y = p.pos.y + (ny - p.pos.y) * f, z = p.pos.z + (nz - p.pos.z) * f;
        if (Math.hypot(x - cap.x, z - cap.z) < 0.34 + S.pelletRadius && y > cap.y - 0.05 && y < cap.y + 1.8) {
          p.pos.set(x, y, z);
          G.health.damage(S.damage, 'sentry', this.group.position);
          this._kill(p, true); return;
        }
      }
    }
    p.pos.set(nx, ny, nz); p.spr.position.copy(p.pos);
    p.spr.material.rotation += dt * 6;
  }

  dispose() {
    const G = this.G;
    G.scene.remove(this.group);
    for (const p of this.pellets) G.scene.remove(p.spr);
    for (const x of this.geos) x.dispose();
    for (const x of this.mats) x.dispose();
  }
}
