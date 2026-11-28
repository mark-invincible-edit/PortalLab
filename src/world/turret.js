// Turret: assets/turret.glb driven by its five animation clips (names are the text after the "|" in the glTF clip name):
//   idle       looping, guns away, nobody around
//   deploy     once, it noticed someone and is releasing the guns
//   idlealert  looping, guns out, watching (after deploy, and between bursts when it lost sight for a moment)
//   fire       looping, while shooting
//   retract    once, nobody around for a while, guns go back in
// State machine:  idle -> deploying -> alert -> firing -> alert -> retracting -> idle   (seeing someone again during retract re-deploys)
// Bullets: fast tracers (bright head, long fading streak, glow) from the muzzle nodes, with a muzzle flash (star + glow + cone + a brief light).
// They are stopped by walls and by CUBES (a carried cube is a shield) and hurt the player (CONFIG.turret.damage per hit).
// Level data: { type: 'turret', pos: [x, 0, z] (feet), yaw: degrees (0 faces -Z like the player), range?: m }
// Without assets/turret.glb a simple post turret (no clips) is built so levels stay playable.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from '../config.js';
import { solidMat, glowMat } from '../core/materials.js';
import { raycastSlabs } from '../core/geom.js';
import { measureObject, quatFromDeg, wrapPi, clamp, log, warn } from '../core/util.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _tp = new THREE.Vector3(), _eye = new THREE.Vector3(), _q = new THREE.Quaternion();
const _hit = { t: 0, axis: 0, sign: 0, slab: null };
const NB = 20;                       // bullet pool per turret
const CLIPS = ['idle', 'deploy', 'idlealert', 'fire', 'retract'];

/** Tracer streak: open cylinder, head at the origin pointing +Y, tail at y = -len; vertex colors fade to black (additive blending = fade out). */
function tracerGeometry(len, r0, r1, hot) {
  const g = new THREE.CylinderGeometry(r0, r1, len, 6, 1, true);
  g.translate(0, -len / 2, 0);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = clamp(-pos.getY(i) / len, 0, 1), k = Math.pow(1 - t, 1.7);
    col[i * 3] = hot[0] * k; col[i * 3 + 1] = hot[1] * k; col[i * 3 + 2] = hot[2] * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class Turret {
  constructor(G, level, data) {
    this.G = G; this.level = level; this.data = data;
    const T = CONFIG.turret, cfg = CONFIG.models.turret;
    this.range = data.range || T.range;
    const yaw = (data.yaw || 0) * Math.PI / 180;
    this.front = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));          // mounting direction (never changes)
    this.restYaw = Math.atan2(this.front.x, this.front.z);                      // model front is +Z
    this.group = new THREE.Group(); this.group.position.fromArray(data.pos); this.group.rotation.y = this.restYaw;
    this.yawNode = new THREE.Group(); this.group.add(this.yawNode);              // rotates (relative to the mounting direction) to track the player
    this.geos = []; this.mats = []; this.muzzles = []; this.mixer = null; this.actions = {};
    this.curYaw = 0; this.height = cfg.targetHeight; this.usingModel = false;

    const gltf = G.assets.models.turret;
    if (gltf) this._buildModel(gltf); else this._buildFallback();
    G.scene.add(this.group);
    this.eyeY = this.height * (this.usingModel ? cfg.eyeHeight : 0.78);

    // state machine
    this.state = 'idle'; this.stateT = 0; this.sinceSeen = 99; this.aim = 0; this.fireT = 0; this.mi = 0; this.hitSfxT = 0;
    this._clipDone = false; this.cur = null;
    this._play('idle', 0);

    // bullets + muzzle flashes (shared geometry per turret)
    this.gTracer = tracerGeometry(T.tracerLength, 0.012, 0.003, [1.0, 0.92, 0.65]); this.geos.push(this.gTracer);
    this.gHalo = tracerGeometry(T.tracerLength * 0.8, 0.034, 0.008, [1.0, 0.45, 0.12]); this.geos.push(this.gHalo);
    this.gHead = new THREE.SphereGeometry(0.03, 10, 8); this.geos.push(this.gHead);
    this.gCone = new THREE.ConeGeometry(0.04, 0.3, 10, 1, true); this.gCone.translate(0, 0.15, 0); this.geos.push(this.gCone);
    this.mTracer = new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    this.mHalo = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xff8a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.45, side: THREE.DoubleSide, toneMapped: false });
    this.mHead = new THREE.MeshBasicMaterial({ color: 0xfff6d0, toneMapped: false });
    this.mats.push(this.mTracer, this.mHalo, this.mHead);
    this.bullets = [];
    for (let i = 0; i < NB; i++) {
      const grp = new THREE.Group(); grp.visible = false;
      grp.add(new THREE.Mesh(this.gTracer, this.mTracer), new THREE.Mesh(this.gHalo, this.mHalo), new THREE.Mesh(this.gHead, this.mHead));
      const glow = new THREE.Sprite(this._m(new THREE.SpriteMaterial({ map: G.assets.tex('glow'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffa040, opacity: 0.9 })));
      glow.scale.setScalar(0.32); grp.add(glow);
      G.scene.add(grp);
      this.bullets.push({ grp, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, on: false });
    }
    this.flashes = [];
    for (let i = 0; i < 2; i++) {
      const star = new THREE.Sprite(this._m(new THREE.SpriteMaterial({ map: G.assets.tex('spark'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffe0a0 })));
      const glow = new THREE.Sprite(this._m(new THREE.SpriteMaterial({ map: G.assets.tex('glow'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xff9a3a })));
      const cone = new THREE.Mesh(this.gCone, this._m(new THREE.MeshBasicMaterial({ color: 0xffb04a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false })));
      const grp = new THREE.Group(); grp.visible = false; grp.add(star, glow, cone); G.scene.add(grp);
      this.flashes.push({ grp, star, glow, cone, t: 0 });
    }
    this.flashI = 0;
  }

  _m(m) { this.mats.push(m); return m; }
  _g(g) { this.geos.push(g); return g; }

  // ------------------------------------------------------------------ visuals
  _buildModel(gltf) {
    const G = this.G, cfg = CONFIG.models.turret;
    const model = cloneSkinned(gltf.scene);
    model.quaternion.copy(quatFromDeg(cfg.rotationOffset));
    const mats = new Set();
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;     // skinned bounds do not follow the animation
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) mats.add(m);
    });
    for (const m of mats) if (m.isMeshStandardMaterial) { m.envMap = G.envMap || m.envMap; m.envMapIntensity = CONFIG.render.envIntensity * cfg.envIntensity; }
    const holder = new THREE.Group(); holder.add(model);
    this.yawNode.add(holder);

    // clips -> actions
    this.mixer = new THREE.AnimationMixer(model);
    const byToken = new Map();
    for (const a of gltf.animations || []) byToken.set(a.name.split('|').pop().trim().toLowerCase(), a);
    for (const k of CLIPS) {
      const clip = byToken.get(String(cfg.clips[k]).toLowerCase());
      if (!clip) { warn(`turret.glb: no animation clip "${cfg.clips[k]}" (found: ${[...byToken.keys()].join(', ') || 'none'})`); continue; }
      const act = this.mixer.clipAction(clip);
      if (k === 'deploy' || k === 'retract') { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; } else act.setLoop(THREE.LoopRepeat, Infinity);
      this.actions[k] = act;
    }
    this.mixer.addEventListener('finished', (e) => { if (e.action === this.actions[this.state === 'deploying' ? 'deploy' : 'retract']) this._clipDone = true; });

    // fit: feet at the origin, centered on x / z, IDLE pose height = targetHeight
    if (this.actions.idle) this.actions.idle.play();
    this.mixer.update(0);
    const box = measureObject(holder), size = new THREE.Vector3(), center = new THREE.Vector3();
    if (box.isEmpty()) warn('turret.glb has no meshes');
    else {
      box.getSize(size); box.getCenter(center);
      const k = cfg.targetHeight / (size.y || 1);
      model.position.set(-center.x, -box.min.y, -center.z);
      holder.scale.set(k * cfg.scale[0], k * cfg.scale[1], k * cfg.scale[2]);
      log(`turret.glb: idle bounds ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)} -> scale ${k.toFixed(4)}, clips: ${Object.keys(this.actions).join(', ')}`);
    }
    holder.position.fromArray(cfg.positionOffset);
    this.usingModel = true;

    // muzzle anchors: nodes / bones whose name matches (animated, so the flash follows the guns), else fixed fallback points
    let re = null; try { re = new RegExp(cfg.muzzleNodes, 'i'); } catch (e) { warn('turret muzzleNodes is not a valid regex'); }
    const found = [];
    if (re) model.traverse((o) => { if (re.test(o.name)) found.push(o); });
    const nodes = found.filter((o) => !o.isMesh);
    this.muzzles = (nodes.length ? nodes : found).slice(0, 4);
    if (this.muzzles.length) log(`turret.glb: muzzles = ${this.muzzles.map((m) => m.name).join(', ')}`);
    else {
      warn('turret.glb: no node matches models.turret.muzzleNodes; using muzzleFallback points. Set muzzleNodes to your gun-end bone name (the model hierarchy is logged when debug.logHierarchy is on).');
      for (const [x, y, z] of cfg.muzzleFallback) { const a = new THREE.Object3D(); a.position.set(x * cfg.targetHeight, y * cfg.targetHeight, z * cfg.targetHeight); this.yawNode.add(a); this.muzzles.push(a); }
    }
  }

  /** No model: a post with a head and two barrels (no animation clips), so the level still works. */
  _buildFallback() {
    const G = this.G, g = (x) => this._g(x), m = (x) => this._m(x);
    this.height = 1.1;
    const shell = m(solidMat(G, 0x2a2e33, 0.3, 0.8)), steel = m(solidMat(G, 0x9aa0a6, 0.35, 0.9)), dark = m(solidMat(G, 0x0e0f11, 0.6, 0.4));
    const add = (parent, geo, mat, x, y, z) => { const o = new THREE.Mesh(g(geo), mat); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    add(this.group, new THREE.CylinderGeometry(0.28, 0.32, 0.08, 20), dark, 0, 0.04, 0);
    add(this.group, new THREE.CylinderGeometry(0.05, 0.07, 0.8, 12), steel, 0, 0.46, 0);
    this.head = new THREE.Group(); this.head.position.y = 0.9; this.yawNode.add(this.head);
    add(this.head, new THREE.SphereGeometry(0.22, 24, 16), shell, 0, 0, 0);
    for (const sx of [-1, 1]) {
      add(this.head, new THREE.CylinderGeometry(0.035, 0.045, 0.34, 10).rotateX(Math.PI / 2), steel, sx * 0.1, -0.04, 0.26);
      const a = new THREE.Object3D(); a.name = 'muzzle'; a.position.set(sx * 0.1, -0.04, 0.44); this.head.add(a); this.muzzles.push(a);
    }
    this.eye = new THREE.Mesh(g(new THREE.CircleGeometry(0.075, 20)), m(glowMat(0xff2a1a)));
    this.eye.position.set(0, 0.06, 0.205); this.head.add(this.eye);
    this.group.position.y += 0;
  }

  // ------------------------------------------------------------------ animation + state machine
  _play(name, fade = 0.18) {
    const next = this.actions[name];
    if (!next) { this.cur = null; return; }
    if (this.cur === next) return;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    if (fade > 0 && this.cur) next.fadeIn(fade); next.play();
    if (this.cur && fade > 0) this.cur.fadeOut(fade); else if (this.cur) this.cur.stop();
    this.cur = next;
  }

  _enter(state) {
    const G = this.G;
    this.state = state; this.stateT = 0; this._clipDone = false;
    switch (state) {
      case 'idle': this.aim = 0; this._play('idle'); break;
      case 'deploying': G.audio.play('sentry_alert', { pos: this._eyePos(_w) }); this._play('deploy', 0.1); break;
      case 'alert': this._play('idlealert'); break;
      case 'firing': this._play('fire', 0.1); break;
      case 'retracting': this.aim = 0; this._play('retract', 0.12); break;
      default: break;
    }
  }

  _eyePos(out) { return out.copy(this.group.position).setY(this.group.position.y + this.eyeY); }

  _sees(p) {
    const o = this._eyePos(_eye);
    _d.copy(p).sub(o); const dist = _d.length();
    if (dist > this.range || dist < 0.4) return false;
    _d.multiplyScalar(1 / dist);
    if (_d.dot(this.front) < 0.05) return false;                 // behind its mounting direction
    if (this.level.raycast(o.x, o.y, o.z, _d.x, _d.y, _d.z, dist - 0.2, _hit)) return false;
    return true;
  }

  update(dt) {
    const G = this.G, T = CONFIG.turret, pl = G.player;
    const alive = !(G.health && G.health.dead);
    _tp.set(pl.cap.x, pl.cap.y + 1.15, pl.cap.z);
    const sees = alive && this._sees(_tp);
    this.sinceSeen = sees ? 0 : this.sinceSeen + dt;
    this.stateT += dt; this.hitSfxT -= dt;

    // ---- state transitions
    const noClip = (k) => !this.actions[k];
    switch (this.state) {
      case 'idle': if (sees) this._enter('deploying'); break;
      case 'deploying':
        if (this._clipDone || (noClip('deploy') && this.stateT > 0.5)) this._enter('alert');
        break;
      case 'alert':
        if (sees) { this.aim += dt; if (this.aim >= T.aimTime) this._enter('firing'); }
        else { this.aim = Math.max(0, this.aim - dt); if (this.sinceSeen > T.retractDelay) this._enter('retracting'); }
        break;
      case 'firing':
        if (!sees && this.sinceSeen > T.lostGrace) { this.aim = 0; this._enter('alert'); }
        break;
      case 'retracting':
        if (sees) this._enter('deploying');
        else if (this._clipDone || (noClip('retract') && this.stateT > 0.5)) this._enter('idle');
        break;
      default: break;
    }

    // ---- turn toward the player while the guns are out
    let want = 0;
    if ((this.state === 'deploying' || this.state === 'alert' || this.state === 'firing') && this.sinceSeen < 2.5) {
      const o = this._eyePos(_eye);
      want = wrapPi(Math.atan2(_tp.x - o.x, _tp.z - o.z) - this.restYaw);
      const lim = T.trackLimitDeg * Math.PI / 180; want = clamp(want, -lim, lim);
    }
    this.curYaw += clamp(wrapPi(want - this.curYaw), -T.trackSpeed * dt, T.trackSpeed * dt);
    this.yawNode.rotation.y = this.curYaw;
    if (!this.usingModel && this.eye) {
      const heat = this.state === 'firing' ? 1 : this.state === 'alert' || this.state === 'deploying' ? 0.55 : 0.12;
      this.eye.material.color.setRGB(0.3 + 0.7 * heat, 0.05 + 0.1 * heat, 0.04);
    }

    // ---- animation, then fire (muzzle positions must follow the animated pose)
    if (this.mixer) this.mixer.update(dt);
    if (this.state === 'firing' && sees) {
      this.fireT -= dt;
      if (this.fireT <= 0) { this.group.updateMatrixWorld(true); this._fire(_tp); this.fireT += 1 / T.fireRate; if (this.fireT < 0) this.fireT = 0; }
    } else this.fireT = Math.min(this.fireT, 0.05);

    for (const b of this.bullets) if (b.on) this._stepBullet(b, dt);
    for (const f of this.flashes) if (f.grp.visible) {
      f.t += dt; const k = 1 - f.t / 0.075;
      if (k <= 0) { f.grp.visible = false; continue; }
      f.star.scale.setScalar(f.size * (0.6 + 0.6 * k)); f.glow.scale.setScalar(f.size * 1.5 * k); f.star.material.opacity = k; f.glow.material.opacity = k; f.cone.material.opacity = 0.85 * k; f.cone.scale.set(1, 0.6 + 0.8 * k, 1);
    }
  }

  // ------------------------------------------------------------------ shooting
  _fire(target) {
    const G = this.G, T = CONFIG.turret;
    const b = this.bullets.find((x) => !x.on), anchor = this.muzzles[this.mi % this.muzzles.length]; this.mi++;
    if (!b || !anchor) return;
    anchor.getWorldPosition(b.pos);
    _d.copy(target).sub(b.pos).normalize();
    _d.x += (Math.random() - 0.5) * 2 * T.spread; _d.y += (Math.random() - 0.5) * 2 * T.spread; _d.z += (Math.random() - 0.5) * 2 * T.spread; _d.normalize();
    b.vel.copy(_d).multiplyScalar(T.bulletSpeed);
    b.life = this.range / T.bulletSpeed + 0.4; b.on = true; b.grp.visible = true;
    b.grp.position.copy(b.pos); b.grp.quaternion.setFromUnitVectors(UP, _d);
    // muzzle flash: star + glow + cone along the barrel, plus a brief light and a wisp of smoke
    const f = this.flashes[this.mi % 2];
    f.grp.position.copy(b.pos); f.cone.quaternion.setFromUnitVectors(UP, _d); f.t = 0; f.size = 0.34 + Math.random() * 0.16;
    f.star.material.rotation = Math.random() * 6.283; f.grp.visible = true;
    G.lighting.flash(b.pos, 0xffb060, 16);
    if ((this.mi & 3) === 0) G.vfx.smokePuff(b.pos, 1);
    G.audio.play('sentry_fire', { pos: b.pos, vol: 0.55, rate: 0.92 + Math.random() * 0.2 });
  }

  _impact(b, normal, sound = true) {
    const G = this.G;
    b.on = false; b.grp.visible = false;
    G.vfx.sparks(b.pos, normal, 0xffc070, 12);
    G.vfx.flash(b.pos, 0xffa040, 0.3, 0.08);
    if (sound && this.hitSfxT <= 0) { G.audio.play('sentry_hit', { pos: b.pos, vol: 0.5 }); this.hitSfxT = 0.07; }
  }

  _stepBullet(b, dt) {
    const G = this.G, T = CONFIG.turret;
    b.life -= dt; if (b.life <= 0) { b.on = false; b.grp.visible = false; return; }
    const sp = b.vel.length(), step = sp * dt;
    _w.copy(b.vel).multiplyScalar(1 / sp);
    // walls: stop at the surface, leave a scorch mark
    if (raycastSlabs(this.level.solids, b.pos.x, b.pos.y, b.pos.z, _w.x, _w.y, _w.z, step + T.bulletRadius, _hit)) {
      b.pos.addScaledVector(_w, Math.max(0, _hit.t - 0.01));
      _v.set(0, 0, 0); _v.setComponent(_hit.axis, _hit.sign);
      if (Math.random() < 0.6) G.vfx.scorch(b.pos, _v);
      this._impact(b, _v); return;
    }
    const nx = b.pos.x + b.vel.x * dt, ny = b.pos.y + b.vel.y * dt, nz = b.pos.z + b.vel.z * dt;
    // cubes block bullets (closest point of the step segment to the cube centre)
    for (const c of this.level.cubes) {
      if (c.dead) continue;
      const t = c.body.translation();
      const sx = nx - b.pos.x, sy = ny - b.pos.y, sz = nz - b.pos.z, l2 = sx * sx + sy * sy + sz * sz || 1e-6;
      const k = clamp(((t.x - b.pos.x) * sx + (t.y - b.pos.y) * sy + (t.z - b.pos.z) * sz) / l2, 0, 1);
      const dx = b.pos.x + sx * k - t.x, dy = b.pos.y + sy * k - t.y, dz = b.pos.z + sz * k - t.z;
      if (Math.hypot(dx, dy, dz) < CONFIG.physics.cubeSize * 0.62 + T.bulletRadius) { b.pos.set(b.pos.x + sx * k, b.pos.y + sy * k, b.pos.z + sz * k); this._impact(b, _v.set(-_w.x, -_w.y, -_w.z)); return; }
    }
    // the player: vertical capsule axis, sampled along the step (bullets are fast)
    const cap = G.player.cap;
    if (!(G.health && G.health.dead)) {
      for (const f of [0.25, 0.5, 0.75, 1]) {
        const x = b.pos.x + (nx - b.pos.x) * f, y = b.pos.y + (ny - b.pos.y) * f, z = b.pos.z + (nz - b.pos.z) * f;
        if (Math.hypot(x - cap.x, z - cap.z) < 0.34 + T.bulletRadius && y > cap.y - 0.05 && y < cap.y + 1.8) {
          b.pos.set(x, y, z);
          G.health.damage(T.damage, 'turret', this.group.position);
          this._impact(b, _v.set(-_w.x, -_w.y, -_w.z)); return;
        }
      }
    }
    b.pos.set(nx, ny, nz); b.grp.position.copy(b.pos);
  }

  dispose() {
    const G = this.G;
    G.scene.remove(this.group);
    for (const b of this.bullets) G.scene.remove(b.grp);
    for (const f of this.flashes) G.scene.remove(f.grp);
    if (this.mixer) this.mixer.stopAllAction();
    for (const x of this.geos) x.dispose();
    for (const x of this.mats) x.dispose();
  }
}
