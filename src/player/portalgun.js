// Portal gun. assets/portalgun.glb is auto-measured and normalized: its bounding box is centered on the pivot, its longest
// axis is rotated onto Z and it is scaled to config.models.portalgun.targetLength; config offsets are applied on top.
// An optional child node named "muzzle" defines the shot origin, otherwise config muzzleOffset (gun-root space) is used.
//   root (parented to the controller grip, or the camera on desktop)
//     offsetNode  = handOffset / desktopOffset            <- aim direction is its -Z
//       modelWrap = positionOffset * rotationOffset * scale
//         orientNode (auto-orient)  ->  model (position = -boundsCenter)
//       muzzleNode (only when the model has none)
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from '../config.js';
import { DEG, clamp, quatFromDeg, measureObject, setHandCfg, log, warn } from '../core/util.js';
import { pickCarryCandidate } from '../core/geom.js';

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _tgt = new THREE.Vector3(), _c = new THREE.Vector3(), _size = new THREE.Vector3();
const _AY = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1), _tq = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _hq = new THREE.Quaternion(), _hp = new THREE.Vector3(), _dir = new THREE.Vector3(), _w = new THREE.Vector3();

export class PortalGun {
  constructor(G) {
    this.G = G;
    this.root = new THREE.Group(); this.root.name = 'portalGun';
    this.offsetNode = new THREE.Group(); this.modelWrap = new THREE.Group(); this.orientNode = new THREE.Group();
    this.root.add(this.offsetNode); this.offsetNode.add(this.modelWrap); this.modelWrap.add(this.orientNode);
    this.muzzle = null; this.model = null;
    this.cool = 0; this.recoil = 0;
    this.held = null; this.heldCollider = null;
    this.mp = new THREE.Vector3(); this.md = new THREE.Vector3(0, 0, -1);   // muzzle position / aim direction (world), refreshed by pose()
    this.normScale = 1; this.indicatorKey = '';
    this.mode = '';
    this.parent = null;
    this.root.visible = false;
    // handNode: the point where the HAND grips the gun = where the VR controller grip would be. Child of offsetNode with the inverse of
    // the VR handOffset, so in VR it coincides with the controller grip, and on desktop the avatar's arm IKs to it (body.js _holder).
    this.handNode = new THREE.Group(); this.handNode.name = 'gunHandNode'; this.offsetNode.add(this.handNode);
    this.time = 0; this.basePos = new THREE.Vector3();
    this.cands = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]; this.candIdx = -1; this.lost = 0;
    this.info = { through: -1 };
  }

  init() {
    const G = this.G, cfg = CONFIG.models.portalgun, gltf = G.assets.models.portalgun;
    if (gltf) this.model = cloneSkinned(gltf.scene);
    else {
      warn('portalgun.glb not loaded: using a primitive placeholder gun (textured with wall_dark / ui_plate)');
      this.model = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.22), new THREE.MeshLambertMaterial({ map: G.assets.tex('wall_dark') }));
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.16, 16), new THREE.MeshLambertMaterial({ map: G.assets.tex('ui_plate') }));
      barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.18);
      const m = new THREE.Object3D(); m.name = 'muzzle'; m.position.set(0, 0.01, -0.27);
      this.model.add(body, barrel, m);
    }
    this.model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
    // measure + normalize (model is not attached to anything yet, so its world matrix == local)
    const box = measureObject(this.model);
    if (!box.isEmpty()) {
      box.getSize(_size); box.getCenter(_c);
      const longest = _size.x >= _size.y && _size.x >= _size.z ? 0 : _size.y >= _size.z ? 1 : 2;
      const q = new THREE.Quaternion();
      if (cfg.autoOrient && longest !== 2) q.setFromUnitVectors(longest === 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0), _Z);
      this.orientNode.quaternion.copy(q);
      const len = Math.max(_size.x, _size.y, _size.z) || 1;
      this.normScale = cfg.targetLength / len;
      if (cfg.centerPivot) this.model.position.copy(_c).negate();
      log(`portalgun: bounds ${_size.x.toFixed(3)} x ${_size.y.toFixed(3)} x ${_size.z.toFixed(3)} -> normalized to ${cfg.targetLength} m (scale ${this.normScale.toFixed(4)})`);
    } else warn('portalgun: empty bounding box, no normalization applied');
    this.orientNode.add(this.model);

    let found = null;
    this.model.traverse((o) => { if (!found && o.name && o.name.toLowerCase() === 'muzzle') found = o; });
    if (found) { this.muzzle = found; log('portalgun: using model node "muzzle" as the shot origin'); }
    else { this.muzzle = new THREE.Object3D(); this.muzzle.name = 'muzzleFallback'; this.offsetNode.add(this.muzzle); log('portalgun: no "muzzle" node, using config muzzleOffset'); }

    // diegetic indicator: small canvas screen on top of the gun (blue/orange placed + ready bar)
    this.canvas = document.createElement('canvas'); this.canvas.width = 128; this.canvas.height = 64;
    this.ctx2d = this.canvas.getContext('2d');
    this.indTex = new THREE.CanvasTexture(this.canvas); this.indTex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(0.07, 0.035); geo.rotateX(-Math.PI / 2);
    this.indicator = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.indTex }));
    this.offsetNode.add(this.indicator);
    G.portals.onChange = () => { this.indicatorKey = ''; };

    G.scene.add(this.root);   // temporary parent until update() attaches it to the grip / camera
    this.applyConfig();
  }

  applyConfig() {
    const cfg = CONFIG.models.portalgun;
    const sc = Array.isArray(cfg.scale) ? cfg.scale : [cfg.scale, cfg.scale, cfg.scale];
    this.modelWrap.scale.set(sc[0] * this.normScale, sc[1] * this.normScale, sc[2] * this.normScale);
    quatFromDeg(cfg.rotationOffset, this.modelWrap.quaternion);
    this.modelWrap.position.fromArray(cfg.positionOffset);
    if (this.muzzle && this.muzzle.name === 'muzzleFallback') this.muzzle.position.fromArray(cfg.muzzleOffset);
    this.indicator.position.fromArray(cfg.indicatorOffset);
    this.mode = '';   // force offset refresh
  }

  _applyOffsetForMode(mode) {
    const cfg = CONFIG.models.portalgun;
    if (mode === 'xr') setHandCfg(this.offsetNode, cfg.handOffset);
    else {
      const d = cfg.desktopOffset, left = this.G.input.gunHandName === 'left';       // left-handed: mirror the gun to the other side of the screen
      setHandCfg(this.offsetNode, left ? { position: [-d.position[0], d.position[1], d.position[2]], rotation: [d.rotation[0], -d.rotation[1], -d.rotation[2]] } : d);
    }
    this.basePos.copy(this.offsetNode.position);
    // hand grip point = inverse of the VR gun-in-hand offset (always the VR one: that is what the arm/hand rotation was tuned for)
    const ho = cfg.handOffset;
    _hp.fromArray(ho.position); quatFromDeg(ho.rotation, _hq);
    _m.compose(_hp, _hq, _one).invert().decompose(this.handNode.position, this.handNode.quaternion, this.handNode.scale);
    this.mode = mode + this.G.input.gunHandName;
  }

  /** Refresh muzzle position and aim direction from the current scene graph. */
  pose() {
    this.root.updateWorldMatrix(true, true);
    this.muzzle.getWorldPosition(this.mp);
    this.offsetNode.getWorldQuaternion(_q);
    this.md.set(0, 0, -1).applyQuaternion(_q).normalize();
  }

  _drawIndicator() {
    const P = this.G.portals, ready = clamp(1 - this.cool / CONFIG.gun.cooldown, 0, 1);
    const key = (P.isOpen(0) ? 1 : 0) + '' + (P.isOpen(1) ? 1 : 0) + Math.round(ready * 8);
    if (key === this.indicatorKey) return;
    this.indicatorKey = key;
    const g = this.ctx2d, ui = CONFIG.ui.colors;
    g.fillStyle = '#23262b'; g.fillRect(0, 0, 128, 64);
    const dot = (x, col, on) => { g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 5; g.strokeRect(x - 20, 6, 40, 30); if (on) g.fillRect(x - 20, 6, 40, 30); };
    dot(34, ui.blue, P.isOpen(0)); dot(94, ui.orange, P.isOpen(1));
    g.fillStyle = '#e8e6df'; g.fillRect(10, 46, 108 * ready, 8);
    g.strokeStyle = '#8c9097'; g.lineWidth = 2; g.strokeRect(10, 46, 108, 8);
    this.indTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    const G = this.G, I = G.input, xr = I.mode === 'xr';
    this.time += dt;
    // attach to the right parent
    let parent = null;
    if (xr) { const h = I.hands[I.gunHandName]; parent = h && h.grip.visible ? h.grip : null; }
    else parent = G.camera;
    if (parent !== this.parent) { if (parent) parent.add(this.root); else G.scene.add(this.root); this.parent = parent; }
    this.root.visible = !!parent && !(G.health && G.health.dead);
    if (this.mode !== (xr ? 'xr' : 'desktop') + I.gunHandName) this._applyOffsetForMode(xr ? 'xr' : 'desktop');

    this.cool = Math.max(0, this.cool - dt);
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.modelWrap.position.z = CONFIG.models.portalgun.positionOffset[2] + this.recoil * 0.03;
    if (!xr) {                                                       // desktop viewmodel: breathing + walking sway (the hand follows via handNode)
      const pl = G.player, k = CONFIG.effects.viewFx ? 1 : 0, bob = pl.bobAmt * k;
      this.offsetNode.position.set(this.basePos.x + (Math.sin(this.time * 1.1) * 0.0018 + Math.cos(pl.bobPhase) * 0.006 * bob) * k,
        this.basePos.y + (Math.sin(this.time * 1.7) * 0.0014 + Math.sin(pl.bobPhase * 2) * 0.005 * bob - pl.landDip * 0.5) * k, this.basePos.z + this.recoil * 0.02);
    }
    this._drawIndicator();
    if (!this.root.visible) { if (this.held) this.drop(true); return; }
    this.pose();
    this.updateCarry(dt);
  }

  fire(id) {
    if (this.cool > 0 || !this.root.visible) return false;
    const G = this.G;
    this.cool = CONFIG.gun.cooldown; this.recoil = 1; this.indicatorKey = '';
    this.pose();
    G.portals.fire(id, this.mp, this.md);
    G.vfx.muzzleFlash(this.mp, id === 0 ? CONFIG.portal.colors.blueRim : CONFIG.portal.colors.orangeRim);
    G.audio.play('gun_fire', { pos: this.mp, rate: id === 0 ? 1.08 : 0.92 });
    // distinct vibration per portal: blue = one sharp tap, orange = tap + softer echo
    G.input.pattern(G.input.gunHandName, id === 0 ? [0.75, 40] : [0.6, 35, 0, 22, 0.35, 35]);
    return true;
  }

  // ---------------------------------------------------------------------------------------------- carrying
  /** Use button: drop what you hold, otherwise pick up the cube you are pointing at (line of sight required). */
  use() {
    if (this.held) { this.drop(false); return; }
    if (!this.root.visible) return;
    this.pose();
    const G = this.G, range = CONFIG.gun.pickupRange, rad = CONFIG.gun.pickupRadius;
    let best = null, bestT = Infinity;
    for (const c of G.level.cubes) {
      if (c.dead) continue;
      const t = c.body.translation();
      _v.set(t.x - this.mp.x, t.y - this.mp.y, t.z - this.mp.z);
      const along = _v.dot(this.md);
      if (along < 0.05 || along > range) continue;
      if (_v.lengthSq() - along * along > rad * rad) continue;
      if (G.level.raycast(this.mp.x, this.mp.y, this.mp.z, this.md.x, this.md.y, this.md.z, along - 0.2, G._hit)) continue;   // wall in the way
      if (along < bestT) { bestT = along; best = c; }
    }
    if (!best) return;
    this.held = best; best.held = true; this.heldCollider = best.collider;
    best.body.setGravityScale(0, true);
    this.candIdx = -1; this.lost = 0;
    G.audio.play('cube_pickup', { pos: this.mp });
    G.input.pulse(G.input.offHandName, 0.5, 45); G.input.pulse(G.input.gunHandName, 0.3, 35);
    if (G.story) G.story.event('first_cube');
  }

  drop(silent) {
    const c = this.held; if (!c) return;
    c.held = false; c.body.setGravityScale(1, true);
    const v = c.body.linvel(), k = CONFIG.gun.throwScale, sp = Math.hypot(v.x, v.y, v.z), cap = 9, f = sp > cap ? cap / sp : 1;
    c.body.setLinvel({ x: v.x * k * f, y: v.y * k * f, z: v.z * k * f }, true);
    this.held = null; this.heldCollider = null;
    if (!silent) this.G.audio.play('cube_drop', { pos: this.mp, vol: 0.4 });
  }

  /**
   * The held cube is driven toward where you would be holding it, PORTAL AWARE.
   * carryTarget() traces the carry ray from the muzzle through a portal if it crosses one, giving the real target point (possibly in
   * another room). The cube may still be on the near side though, so we consider that target plus its images under both link
   * transforms and chase the NEAREST one. Example: you hold the cube in front of portal A while B is far away: the real target is at B, but
   * its image under T[B->A] is just in front of you, so the cube flies INTO the portal along the straight line, its centre crosses the plane,
   * it teleports (teleportCubes) and from then on the real target is the nearest. No more rushing through walls towards your body.
   */
  updateCarry(dt) {
    const c = this.held; if (!c) return;
    const G = this.G, cfg = CONFIG.gun, P = G.portals, info = this.info;
    if (c.dead) { this.drop(true); return; }
    P.carryTarget(this.mp, this.md, cfg.carryDistance, CONFIG.physics.cubeSize * 0.75, this.cands[0], info);
    let n = 1;
    if (P.linked) { this.cands[1].copy(this.cands[0]).applyMatrix4(P.T[0]); this.cands[2].copy(this.cands[0]).applyMatrix4(P.T[1]); n = 3; }
    const t = c.body.translation();
    const cp = [t.x, t.y, t.z], list = [];
    for (let i = 0; i < n; i++) list.push([this.cands[i].x, this.cands[i].y, this.cands[i].z]);
    this.candIdx = pickCarryCandidate(cp, list, this.candIdx);
    const tgt = this.cands[this.candIdx];
    _v.set(tgt.x - t.x, tgt.y - t.y, tgt.z - t.z);
    const dist = _v.length();
    // cannot follow (wall in the way, you ran off): drop it after a grace period instead of fighting the geometry
    if (dist > 6) { this.drop(false); return; }
    this.lost = dist > 2.0 ? this.lost + dt : Math.max(0, this.lost - dt * 2);
    if (this.lost > cfg.carryLostTime) { this.drop(false); G.ui.toast && G.ui.toast('CUBE DROPPED'); return; }
    _v.multiplyScalar(cfg.carryStiffness);
    const sp = _v.length(); if (sp > cfg.carryMaxSpeed) _v.multiplyScalar(cfg.carryMaxSpeed / sp);
    c.body.setLinvel({ x: _v.x, y: _v.y, z: _v.z }, true);
    c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    // keep the cube upright and facing along the gun's yaw, expressed in the frame the cube is actually in (through a portal the direction rotates)
    _dir.copy(this.md);
    if (info.through >= 0) _dir.applyQuaternion(P.qT[info.through]);
    if (this.candIdx > 0) _dir.applyQuaternion(P.qT[this.candIdx - 1]);
    const r = c.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const yaw = Math.atan2(-_dir.x, -_dir.z);
    const tq = _tq.setFromAxisAngle(_AY, Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2));   // snap to 90 degrees so it reads as a cube
    _q.slerp(tq, 1 - Math.exp(-9 * dt));
    c.body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
  }

  /**
   * The player just went through a portal (transform T, rotation qT). If the held cube is still on the near side, bring it along with
   * the same transform so it keeps its place in your hands instead of being left behind (or being dragged through walls).
   */
  carryTeleport(T, qT) {
    const c = this.held; if (!c || c.dead) return;
    this.pose();
    const t = c.body.translation();
    _v.set(t.x, t.y, t.z);
    _w.copy(_v).applyMatrix4(T);
    if (_w.distanceTo(this.mp) >= _v.distanceTo(this.mp)) return;            // already on the new side
    const lv = c.body.linvel(), av = c.body.angvel(), r = c.body.rotation();
    _q.set(r.x, r.y, r.z, r.w).premultiply(qT);
    _dir.set(lv.x, lv.y, lv.z).applyQuaternion(qT);
    c.body.setTranslation({ x: _w.x, y: _w.y, z: _w.z }, true);
    c.body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    c.body.setLinvel({ x: _dir.x, y: _dir.y, z: _dir.z }, true);
    _dir.set(av.x, av.y, av.z).applyQuaternion(qT);
    c.body.setAngvel({ x: _dir.x, y: _dir.y, z: _dir.z }, true);
    c.prev.copy(_w);                                                           // no spurious portal crossing next frame
    this.candIdx = -1; this.lost = 0;
  }
}
