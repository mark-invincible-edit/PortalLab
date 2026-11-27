// PortalManager: shot bolts, placement, link transform, teleporting, and portal view rendering.
//
// SHOT MODEL: "visible projectile". The hit is resolved analytically at fire time (so it is deterministic), but a glowing bolt
// with a particle trail visibly flies to the hit point at config.gun.boltSpeed; the portal opens when the bolt arrives.
//
// LINK TRANSFORM: with portal frames M_A, M_B (x = right, y = up, z = out of the wall), a point in front of A
// maps to behind B:   T_A = M_B * Rot180Y * M_A^-1   (Rot180Y flips x and z). The same T moves poses, velocities (rotation only) etc.
//
// PORTAL RENDERING STRATEGY (stereo-correct, "per-eye virtual camera + oblique clip"):
//  * For EACH eye sub-camera (renderer.xr.getCamera().cameras, or the single desktop camera) and each portal P that is
//    facing the eye and inside its frustum, a virtual camera is built:  world = T_P * eyeWorld   (so each eye gets its own parallax;
//    no mono / cross-eyed portals). It uses the eye's own projection matrix.
//  * The virtual camera's near plane is replaced with the EXIT portal's plane (Lengyel oblique clipping), so geometry
//    between the virtual camera and the exit wall (inside the wall / behind it) never shows.
//  * The result is rendered into a per-eye, per-portal render target (scaled by config.portal.rtScale). The portal quad samples it
//    using projective (screen-space) UVs derived from its clip position, which is exact because the RT used the eye's x/y projection.
//  * Recursion: through P you can only see P again (the exit portal is clipped away). Level n uses camera T_P^n(eye). Levels are
//    rendered deepest-first; at level n the portal quad samples the level n+1 target (or a swirl fill at the limit).
//  * While rendering into targets renderer.xr.enabled is switched off (otherwise three would swap in the XR camera).
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Portal } from './portal.js';
import { findPlacement } from './placement.js';
import { raycastSlabs } from '../core/geom.js';
import { warn } from '../core/util.js';
import { GhostSystem } from './ghosts.js';

const Y180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const R180M = new THREE.Matrix4().makeRotationY(Math.PI);
const CLIP_BIAS = 0.003;

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _qv = new THREE.Vector4();
const _hit = { t: 0, axis: 0, sign: 0, slab: null };
const _sz = new THREE.Vector2();

export class PortalManager {
  constructor(G) {
    this.G = G;
    this.portals = [new Portal(0, G), new Portal(1, G)];
    this.T = [new THREE.Matrix4(), new THREE.Matrix4()];
    this.qT = [new THREE.Quaternion(), new THREE.Quaternion()];
    this.linked = false;
    this.time = 0;
    this.onChange = null;
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.blank.needsUpdate = true;

    for (const p of this.portals) {
      G.scene.add(p.mesh);
      p.mesh.onBeforeRender = (renderer, scene, camera) => this._bindQuad(p, camera);
    }

    // bolts (pooled)
    this.bolts = [];
    for (let i = 0; i < 4; i++) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.assets.tex('glow'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      spr.scale.setScalar(0.2); spr.visible = false;
      G.scene.add(spr);
      this.bolts.push({ active: false, spr, id: 0, start: new THREE.Vector3(), dir: new THREE.Vector3(), travel: 0, length: 0, hasHit: false, point: [0, 0, 0], axis: 0, sign: 1, slab: null });
    }

    // render targets [eye][portal][level]
    this.rt = [0, 1].map(() => [0, 1].map(() => [null, null, null, null]));
    this.valid = [0, 1].map(() => [0, 1].map(() => [false, false, false, false]));
    this.pass = { active: false, eye: 0, level: 0 };
    this.maxLevel = 1;
    this.vcam = new THREE.PerspectiveCamera();
    this.vcam.matrixAutoUpdate = false; this.vcam.matrixWorldAutoUpdate = false;
    this.mats = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()];
    this.baseProj = new THREE.Matrix4(); this._pv = new THREE.Matrix4(); this._inv = new THREE.Matrix4();
    this._fr = new THREE.Frustum(); this._sph = new THREE.Sphere();
    this.ghosts = new GhostSystem(G);
    this.hideInViews = [];        // objects hidden while rendering portal views (vignette, camera HUD)
    this.lastViewCount = 0;
  }

  get bothOpen() { return this.linked; }
  isOpen(id) { return this.portals[id].active; }

  // ------------------------------------------------------------------ shooting
  /** Fire a shot from the gun muzzle. id 0 = blue, 1 = orange. */
  fire(id, muzzle, dir) {
    const G = this.G, bolt = this.bolts.find((b) => !b.active) || this.bolts[0];
    const back = 0.2;                                  // start the ray behind the muzzle so a gun poking into a wall still hits it
    _v1.copy(muzzle).addScaledVector(dir, -back);
    const range = CONFIG.gun.range;
    const has = raycastSlabs(G.level.solids, _v1.x, _v1.y, _v1.z, dir.x, dir.y, dir.z, range, _hit);
    bolt.active = true; bolt.id = id; bolt.start.copy(muzzle); bolt.dir.copy(dir); bolt.travel = 0;
    bolt.hasHit = has;
    if (has) {
      bolt.point[0] = _v1.x + dir.x * _hit.t; bolt.point[1] = _v1.y + dir.y * _hit.t; bolt.point[2] = _v1.z + dir.z * _hit.t;
      bolt.axis = _hit.axis; bolt.sign = _hit.sign; bolt.slab = _hit.slab;
      bolt.length = Math.max(0.05, _hit.t - back);
    } else bolt.length = range;
    bolt.spr.material.color.set(id === 0 ? CONFIG.portal.colors.blueRim : CONFIG.portal.colors.orangeRim);
    bolt.spr.position.copy(muzzle); bolt.spr.visible = true;
  }

  _resolveBolt(b) {
    const G = this.G, id = b.id;
    _v2.set(0, 0, 0); _v2.setComponent(b.axis, b.sign);
    _v1.fromArray(b.point);
    const color = id === 0 ? CONFIG.portal.colors.blue : CONFIG.portal.colors.orange;
    const surface = b.slab.surface;
    if (surface === 'glass') { G.vfx.sparks(_v1, _v2, 0xbfe8ff, 8); G.vfx.flash(_v1, 0xbfe8ff, 0.3, 0.12); G.audio.play('portal_reject', { pos: _v1, vol: 0.6, rate: 1.3 }); return; }
    if (surface !== 'portalable') {
      G.vfx.sparks(_v1, _v2, 0xffc060, CONFIG.vfx.sparkCount); G.vfx.flash(_v1, 0xffe0a0, 0.5, 0.15);
      G.vfx.scorch(_v1, _v2); G.audio.play('portal_reject', { pos: _v1 }); return;
    }
    const other = this.portals[1 - id];
    const pl = findPlacement({
      slabs: G.level.solids, hit: { point: b.point, axis: b.axis, sign: b.sign, slab: b.slab }, aim: [b.dir.x, b.dir.y, b.dir.z],
      w: CONFIG.portal.width, h: CONFIG.portal.height, edgeMargin: CONFIG.portal.edgeMargin, other: other.active ? other.place : null,
    });
    if (!pl.ok) {                                      // no room for the full footprint
      G.vfx.sparks(_v1, _v2, color, 10); G.vfx.flash(_v1, color, 0.3, 0.12); G.audio.play('portal_reject', { pos: _v1, vol: 0.7, rate: 0.8 });
      return;
    }
    this.open(id, pl);
  }

  // ------------------------------------------------------------------ open / close
  _holeBox(pl) {
    const min = [0, 0, 0], max = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      if (i === pl.axis) { min[i] = pl.slab.min[i] - 0.02; max[i] = pl.slab.max[i] + 0.02; }
      else { min[i] = pl.center[i] - pl.half[i]; max[i] = pl.center[i] + pl.half[i]; }
    }
    return { min, max };
  }

  open(id, pl) {
    const G = this.G, p = this.portals[id];
    if (p.active) { p.active = false; G.level.setHole(id, null); }
    p.set(pl);
    G.level.setHole(id, this._holeBox(pl));
    this._relink();
    G.vfx.portalBurst(p.pos, p.normal, p.color);
    G.audio.play(id === 0 ? 'portal_open_blue' : 'portal_open_orange', { pos: p.pos });
    G.input.pulse(G.input.gunHandName, 0.45, 70);
    if (G.story) G.story.event('first_portal');
    if (this.onChange) this.onChange();
  }

  close(id, silent = false) {
    const G = this.G, p = this.portals[id];
    if (!p.active) return;
    p.active = false;                                  // visual collapse continues via Portal.update (anim -> 0)
    G.level.setHole(id, null);
    this._relink();
    if (!silent) { G.vfx.portalBurst(p.pos, p.normal, p.color); G.audio.play('portal_close', { pos: p.pos }); }
    if (this.onChange) this.onChange();
  }

  clearAll(silent = false) {
    const had = this.portals[0].active || this.portals[1].active;
    this.close(0, silent); this.close(1, silent);
    return had;
  }

  /** Immediate reset without effects (level change). */
  hardReset() {
    for (const p of this.portals) { p.active = false; p.anim = 0; p.mesh.visible = false; p.place = null; }
    for (const b of this.bolts) { b.active = false; b.spr.visible = false; }
    this._relink();
    this.ghosts.hideAll();
    if (this.onChange) this.onChange();
  }

  _relink() {
    const A = this.portals[0], B = this.portals[1];
    this.linked = A.active && B.active;
    if (!this.linked) return;
    this.T[0].copy(B.matrix).multiply(R180M).multiply(A.matrixInv);
    this.T[1].copy(A.matrix).multiply(R180M).multiply(B.matrixInv);
    this.qT[0].copy(B.quat).multiply(Y180).multiply(_q1.copy(A.quat).invert());
    this.qT[1].copy(A.quat).multiply(Y180).multiply(_q1.copy(B.quat).invert());
  }

  // ------------------------------------------------------------------ per-frame
  update(dt) {
    this.time += dt;
    for (const p of this.portals) p.update(dt, this.time);
    const G = this.G;
    if (G.level) this.ghosts.update(G.level.cubes);
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.travel += CONFIG.gun.boltSpeed * dt;
      const d = Math.min(b.travel, b.length);
      b.spr.position.copy(b.start).addScaledVector(b.dir, d);
      G.vfx.trail(b.spr.position, b.id === 0 ? CONFIG.portal.colors.blue : CONFIG.portal.colors.orange);
      if (b.travel >= b.length) {
        b.active = false; b.spr.visible = false;
        if (b.hasHit) this._resolveBolt(b);
      }
    }
  }

  // ------------------------------------------------------------------ crossing tests
  /** Is world point p inside footprint of portal P (in-plane, with margin)? */
  _inFootprint(P, p, margin) {
    _v4.copy(p).sub(P.pos);
    return Math.abs(_v4.dot(P.right)) <= P.w / 2 + margin && Math.abs(_v4.dot(P.up)) <= P.h / 2 + margin;
  }

  /** Test a tracked point moving prev -> cur against both portals. Returns the entered portal or null. */
  _crossed(prev, cur, margin) {
    if (!this.linked) return null;
    for (let i = 0; i < 2; i++) {
      const P = this.portals[i];
      const d0 = _v3.copy(prev).sub(P.pos).dot(P.normal);
      const d1 = _v3.copy(cur).sub(P.pos).dot(P.normal);
      if (d0 >= 0 && d1 < 0) {
        const s = d0 / (d0 - d1);
        _v2.copy(prev).lerp(cur, s);                   // crossing point on the plane
        if (this._inFootprint(P, _v2, margin)) return P;
      }
    }
    return null;
  }

  /** The player's HEAD is the tracked point (so the camera crosses the plane exactly when the view switches). */
  teleportPlayer(player) {
    if (this.G.health && this.G.health.dead) return false;
    const P = this._crossed(player.prevHead, player.head, 0.05);
    if (!P) return false;
    const id = P.id, exit = this.portals[1 - id], G = this.G;
    G.audio.play('portal_enter', { pos: P.pos });
    player.applyTeleport(this.T[id], this.qT[id]);
    if (G.gun && G.gun.held) G.gun.carryTeleport(this.T[id], this.qT[id]);      // the held cube comes along, in your hands
    if (exit.normal.y > 0.7) {                         // leaving a floor portal: guarantee a hop out of the hole
      const vn = player.vel.dot(exit.normal);
      if (vn < CONFIG.portal.minExitSpeed) player.vel.addScaledVector(exit.normal, CONFIG.portal.minExitSpeed - vn);
    }
    G.audio.play('portal_enter', { pos: exit.pos, vol: 0.8 });
    G.input.pattern('both', [0.55, 60, 0, 30, 0.3, 60]);
    if (G.story) G.story.event('first_teleport');
    return true;
  }

  /** Cubes are tracked by their center. They keep velocity, spin and rotation (rotated through the link). */
  teleportCubes(cubes) {
    for (const c of cubes) {
      const t = c.body.translation();
      _v1.set(t.x, t.y, t.z);
      const P = c.prev.lengthSq() > 0 ? this._crossed(c.prev, _v1, 0.15) : null;
      if (P) {
        const id = P.id, exit = this.portals[1 - id];
        const lv = c.body.linvel(), av = c.body.angvel(), r = c.body.rotation();
        _v1.applyMatrix4(this.T[id]);
        _v2.set(lv.x, lv.y, lv.z).applyQuaternion(this.qT[id]);
        _v3.set(av.x, av.y, av.z).applyQuaternion(this.qT[id]);
        _q2.set(r.x, r.y, r.z, r.w).premultiply(this.qT[id]);
        if (exit.normal.y > 0.7) { const vn = _v2.dot(exit.normal); if (vn < CONFIG.portal.cubeMinExit) _v2.addScaledVector(exit.normal, CONFIG.portal.cubeMinExit - vn); }
        c.body.setTranslation({ x: _v1.x, y: _v1.y, z: _v1.z }, true);
        c.body.setRotation({ x: _q2.x, y: _q2.y, z: _q2.z, w: _q2.w }, true);
        c.body.setLinvel({ x: _v2.x, y: _v2.y, z: _v2.z }, true);
        c.body.setAngvel({ x: _v3.x, y: _v3.y, z: _v3.z }, true);
        this.G.audio.play('portal_enter', { pos: P.pos, vol: 0.5 });
        this.G.audio.play('portal_enter', { pos: exit.pos, vol: 0.5 });
      }
      c.prev.copy(_v1);
    }
  }

  // ------------------------------------------------------------------ carry ray (portal aware)
  /**
   * Trace a carry ray of length `dist` from origin along dir, passing through a portal if the ray crosses one,
   * and stopping `margin` before walls. Writes the target position into out. Returns true if it went through a portal.
   */
  carryTarget(origin, dir, dist, margin, out, info = null) {
    const G = this.G;
    if (info) info.through = -1;
    let tp = Infinity, through = null;
    if (this.linked) {
      for (let i = 0; i < 2; i++) {
        const P = this.portals[i];
        const d0 = _v1.copy(origin).sub(P.pos).dot(P.normal), dn = dir.dot(P.normal);
        if (d0 > 0 && dn < -1e-4) {
          const t = -d0 / dn;
          if (t < dist && t < tp) { _v2.copy(origin).addScaledVector(dir, t); if (this._inFootprint(P, _v2, -0.05)) { tp = t; through = P; } }
        }
      }
    }
    let tw = dist;
    if (raycastSlabs(G.level.solids, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, dist, _hit)) tw = _hit.t;
    if (through && tp <= tw + 0.03) {
      const id = through.id, remaining = dist - tp;
      if (info) info.through = id;
      _v2.copy(origin).addScaledVector(dir, tp).applyMatrix4(this.T[id]);      // exit point
      _v3.copy(dir).applyQuaternion(this.qT[id]);                              // exit direction
      let t2 = remaining;
      _v4.copy(_v2).addScaledVector(this.portals[1 - id].normal, 0.03);
      if (raycastSlabs(G.level.solids, _v4.x, _v4.y, _v4.z, _v3.x, _v3.y, _v3.z, remaining, _hit)) t2 = _hit.t;
      out.copy(_v2).addScaledVector(_v3, Math.max(0, t2 - margin));
      return true;
    }
    out.copy(origin).addScaledVector(dir, Math.max(0.25, tw - margin));
    return false;
  }

  // ------------------------------------------------------------------ rendering
  _bindQuad(p, camera) {
    let map = null;
    if (this.pass.active) {
      const lv = this.pass.level + 1;
      if (lv <= this.maxLevel && this.valid[this.pass.eye][p.id][lv]) map = this.rt[this.pass.eye][p.id][lv].texture;
    } else if (this.linked) {
      let e = 0;
      if (this.G.renderer.xr.isPresenting) { const cams = this.G.renderer.xr.getCamera().cameras; e = cams.length > 1 && cams[1] === camera ? 1 : 0; }
      if (this.valid[e][p.id][1]) map = this.rt[e][p.id][1].texture;
    }
    const u = p.material.uniforms;
    u.uMap.value = map || this.blank; u.uHasMap.value = map ? 1 : 0;
    p.material.uniformsNeedUpdate = true;          // same material is drawn once per eye with different textures
  }

  _getRT(e, pid, lv, w, h) {
    let rt = this.rt[e][pid][lv];
    if (!rt) {
      rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      this.rt[e][pid][lv] = rt;
    } else if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    return rt;
  }

  _facingAndVisible(P, camMatrix) {
    const el = camMatrix.elements;
    _v1.set(el[12], el[13], el[14]);
    if (_v2.copy(_v1).sub(P.pos).dot(P.normal) < 0.02) return false;                 // viewer behind the portal plane
    this._pv.multiplyMatrices(this.baseProj, this._inv.copy(camMatrix).invert());
    this._fr.setFromProjectionMatrix(this._pv);
    this._sph.center.copy(P.pos); this._sph.radius = Math.hypot(P.w, P.h) * 0.5 + 0.2;
    return this._fr.intersectsSphere(this._sph);
  }

  _obliqueClip(proj, viewInv, exit) {
    _plane.setFromNormalAndCoplanarPoint(exit.normal, exit.pos).applyMatrix4(viewInv);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const e = proj.elements;
    // Lengyel: corner point of the frustum opposite the clip plane, in clip space
    _qv.x = (Math.sign(_clip.x) + e[8]) / e[0];
    _qv.y = (Math.sign(_clip.y) + e[9]) / e[5];
    _qv.z = -1.0;
    _qv.w = (1.0 + e[10]) / e[14];
    _clip.multiplyScalar(2.0 / _clip.dot(_qv));
    e[2] = _clip.x; e[6] = _clip.y; e[10] = _clip.z + 1.0 - CLIP_BIAS; e[14] = _clip.w;   // replace the near plane row
  }

  /** Render all needed portal views for this frame. Call after the rig/camera are final, before the main render. */
  renderViews() {
    const G = this.G, r = G.renderer;
    for (let e = 0; e < 2; e++) for (let p = 0; p < 2; p++) for (let l = 0; l < 4; l++) this.valid[e][p][l] = false;
    this.lastViewCount = 0;
    if (!this.linked) return;
    const xr = r.xr.isPresenting;
    const N = Math.min(3, Math.max(0, xr ? CONFIG.portal.recursion.xr : CONFIG.portal.recursion.desktop));
    if (N < 1) return;
    this.maxLevel = N;
    const scale = xr ? CONFIG.portal.rtScale.xr : CONFIG.portal.rtScale.desktop;
    const eyes = xr ? r.xr.getCamera().cameras : null;
    const nEyes = xr ? Math.min(2, eyes.length) : 1;

    const prevRT = r.getRenderTarget(), prevXr = r.xr.enabled;
    r.xr.enabled = false;
    for (const o of this.hideInViews) o.visible = false;
    if (G.body) G.body.setHeadVisible(true);               // you can see your own head through a portal
    const vcam = this.vcam;

    for (let e = 0; e < nEyes; e++) {
      const cam = xr ? eyes[e] : G.camera;
      let ew, eh;
      if (xr) { ew = cam.viewport.z; eh = cam.viewport.w; } else { r.getDrawingBufferSize(_sz); ew = _sz.x; eh = _sz.y; }
      if (!(ew > 0 && eh > 0)) continue;
      const rw = Math.max(16, Math.round(ew * scale)), rh = Math.max(16, Math.round(eh * scale));
      this.baseProj.copy(cam.projectionMatrix);

      for (let pid = 0; pid < 2; pid++) {
        const P = this.portals[pid], L = this.portals[1 - pid];
        if (!P.active || P.anim < 0.3) continue;
        this.mats[0].copy(cam.matrixWorld);
        let depth = 0;
        for (let n = 1; n <= N; n++) {
          if (!this._facingAndVisible(P, this.mats[n - 1])) break;
          this.mats[n].multiplyMatrices(this.T[pid], this.mats[n - 1]);              // virtual camera = T_P * previous camera
          depth = n;
        }
        if (depth === 0) continue;
        const exitWasVisible = L.mesh.visible;
        L.mesh.visible = false;                                                       // the exit quad is clipped away anyway
        for (let n = depth; n >= 1; n--) {
          vcam.matrixWorld.copy(this.mats[n]);
          vcam.matrixWorldInverse.copy(this.mats[n]).invert();
          vcam.projectionMatrix.copy(this.baseProj);
          this._obliqueClip(vcam.projectionMatrix, vcam.matrixWorldInverse, L);
          vcam.projectionMatrixInverse.copy(vcam.projectionMatrix).invert();
          const rt = this._getRT(e, pid, n, rw, rh);
          this.pass.active = true; this.pass.eye = e; this.pass.level = n;
          G.vfx.setViewHeight(rh);
          r.setRenderTarget(rt);
          r.render(G.scene, vcam);
          this.valid[e][pid][n] = true;
          this.lastViewCount++;
        }
        L.mesh.visible = exitWasVisible;
      }
    }
    this.pass.active = false;
    if (G.body) G.body.setHeadVisible(false);
    for (const o of this.hideInViews) o.visible = true;
    G.vfx.setViewHeight(G.vfx.mainViewH);                  // point sprites were sized for the render target; restore for the main view
    r.xr.enabled = prevXr;
    r.setRenderTarget(prevRT);
  }

  dispose() {
    this.ghosts.dispose();
    for (const e of this.rt) for (const p of e) for (const rt of p) if (rt) rt.dispose();
  }
}
