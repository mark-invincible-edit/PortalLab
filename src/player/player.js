// Player: Rapier kinematic character controller (capsule) + XR rig placement.
//
// Coordinate model
//   cap  = feet position of the capsule (world). Capsule center = cap + (0, height/2, 0).
//   rig  = Group at (cap - R(yaw) * headLocal.xz, cap.y) rotated by `yaw` about +Y only (the player always stays upright).
//   head = rig * headLocal, so head.xz == cap.xz and head.y == cap.y + real headset height (local-floor reference space).
// Room-scale: if you physically walk, the head moves relative to the rig; that delta is fed into the controller as extra
// horizontal translation, so you collide with walls instead of poking your head through them.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { DEG, clamp, rotYaw, wrapPi, damp } from '../core/util.js';
import { subtractBox } from '../core/geom.js';

const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3();
const _hq = new THREE.Quaternion(), _yq = new THREE.Quaternion();
const _AXY = new THREE.Vector3(0, 1, 0), _AXX = new THREE.Vector3(1, 0, 0);
const _t = { x: 0, z: 0 }, _rd = { x: 0, z: 0 };
const _des = { x: 0, y: 0, z: 0 };

/** Yaw (rotation about +Y; yaw 0 faces -Z) of a quaternion's forward direction; robust when looking straight up/down. */
export function yawOfQuat(q) {
  _f.set(0, 0, -1).applyQuaternion(q);
  let x = _f.x, z = _f.z;
  if (x * x + z * z < 0.0025) {                                 // looking (almost) straight up/down: use the head's up vector
    _u.set(0, 1, 0).applyQuaternion(q);
    if (_f.y < 0) { x = _u.x; z = _u.z; } else { x = -_u.x; z = -_u.z; }
  }
  return Math.atan2(-x, -z);
}

export class Player {
  constructor(G) {
    this.G = G;
    this.cap = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.head = new THREE.Vector3(); this.prevHead = new THREE.Vector3();
    this.localHead = new THREE.Vector3(0, CONFIG.player.eyeHeight, 0); this.localYaw = 0;
    this.lastLocalX = 0; this.lastLocalZ = 0;
    this.yaw = 0; this.pitch = 0;
    this.grounded = false; this.coyote = 0; this.snapReady = true;
    this.walkVel = new THREE.Vector3(); this.speedH = 0; this.turnRate = 0; this.landed = 0;
    this.stand = 1.6;
    this.phys = G.physics.createPlayer();
    this.prevCap = new THREE.Vector3();
    this._vyPrev = 0;
  }

  get headYaw() { return this.yaw + this.localYaw; }

  /** Read the head pose relative to the rig: XR sub-poses come from three; desktop is a fixed eye height plus pitch. */
  readHeadLocal() {
    const cam = this.G.camera;
    if (this.G.input.mode === 'xr') {
      this.localHead.copy(cam.position);
      this.localYaw = yawOfQuat(cam.quaternion);
    } else {
      this.localHead.set(0, CONFIG.player.eyeHeight, 0);
      cam.position.copy(this.localHead);
      cam.quaternion.setFromAxisAngle(_AXX, this.pitch);
      this.localYaw = 0;
    }
  }

  spawn(pos, yawRad) {
    this.cap.copy(pos); this.vel.set(0, 0, 0); this.walkVel.set(0, 0, 0); this.prevCap.copy(pos);
    this.readHeadLocal();
    this.yaw = wrapPi(yawRad - this.localYaw); this.pitch = 0;
    this.lastLocalX = this.localHead.x; this.lastLocalZ = this.localHead.z;
    this.place(); this.prevHead.copy(this.head);
    this.G.physics.teleportPlayerCenter(this.cap.x, this.cap.y + CONFIG.player.height / 2, this.cap.z);
    this.grounded = false; this.coyote = 0;
  }

  /** Position the rig so that head.xz == cap.xz and the headset floor == feet. */
  place() {
    const rig = this.G.rig;
    rig.rotation.set(0, this.yaw, 0);
    rotYaw(this.localHead.x, this.localHead.z, this.yaw, _t);
    rig.position.set(this.cap.x - _t.x, this.cap.y, this.cap.z - _t.z);
    this.head.set(this.cap.x, this.cap.y + this.localHead.y, this.cap.z);
    this.lastLocalX = this.localHead.x; this.lastLocalZ = this.localHead.z;
    rig.updateMatrixWorld(true);
  }

  commit() { this.G.physics.setPlayerCenter(this.cap.x, this.cap.y + CONFIG.player.height / 2, this.cap.z); }

  /** Move the player. `frozen` skips locomotion input (menus) but still tracks the headset. */
  update(dt, frozen) {
    const G = this.G, I = G.input, C = CONFIG, P = C.player, xr = I.mode === 'xr';
    this.prevHead.copy(this.head); this.prevCap.copy(this.cap);
    const yawPrev = this.yaw;
    this.readHeadLocal();

    // ---- turning
    this.turnRate = 0;
    if (!frozen) {
      if (!xr) {
        this.yaw -= I.lookDX * P.mouseSensitivity;
        this.pitch = clamp(this.pitch - I.lookDY * P.mouseSensitivity, -1.45, 1.45);
        I.lookDX = 0; I.lookDY = 0;
        this.localHead.set(0, P.eyeHeight, 0); G.camera.quaternion.setFromAxisAngle(_AXX, this.pitch);
      } else if (C.comfort.snapTurn) {
        if (Math.abs(I.turn.x) < 0.3) this.snapReady = true;
        else if (this.snapReady && Math.abs(I.turn.x) > 0.7) {
          this.yaw -= Math.sign(I.turn.x) * C.comfort.snapAngle * DEG; this.snapReady = false; this.turnRate = 1;
        }
      } else if (Math.abs(I.turn.x) > 0) {
        this.yaw -= I.turn.x * C.comfort.smoothTurnSpeed * DEG * dt; this.turnRate = Math.abs(I.turn.x);
      }
    } else { I.lookDX = 0; I.lookDY = 0; }

    // ---- room-scale delta: how far the head moved physically since last frame (in the previous rig yaw)
    rotYaw(this.localHead.x - this.lastLocalX, this.localHead.z - this.lastLocalZ, yawPrev, _rd);

    // ---- wish direction
    let wx = 0, wz = 0;
    if (!frozen) {
      let my = this.yaw + (xr ? this.localYaw : 0);
      if (xr && C.comfort.moveRelativeTo === 'controller' && I.getRay('left', _o, _d)) my = Math.atan2(-_d.x, -_d.z);
      const mx = I.move.x, mf = I.move.y;
      const fx = -Math.sin(my), fz = -Math.cos(my), rx = Math.cos(my), rz = -Math.sin(my);
      wx = fx * mf + rx * mx; wz = fz * mf + rz * mx;
      const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
    }
    const wl = Math.hypot(wx, wz), speed = P.walkSpeed * C.comfort.speedScale, vel = this.vel;

    if (this.grounded) {
      const tx = wx * speed, tz = wz * speed, ex = tx - vel.x, ez = tz - vel.z, el = Math.hypot(ex, ez), step = P.groundAccel * dt;
      if (el <= step) { vel.x = tx; vel.z = tz; } else { vel.x += ex / el * step; vel.z += ez / el * step; }
    } else if (wl > 0.01) {                                        // air control never removes momentum (flinging works)
      const dx = wx / wl, dz = wz / wl, cur = vel.x * dx + vel.z * dz, add = P.airControlSpeed * wl - cur;
      if (add > 0) { const a = Math.min(add, P.airAccel * dt); vel.x += dx * a; vel.z += dz * a; }
    }

    this.coyote = this.grounded ? 0.12 : this.coyote - dt;
    if (!frozen && I.jump && this.coyote > 0) { vel.y = P.jumpSpeed; this.coyote = 0; this.grounded = false; }
    vel.y -= P.gravity * dt;
    if (this.grounded && vel.y < 0) vel.y = -1;
    if (vel.y < -45) vel.y = -45;

    // ---- character controller
    _des.x = vel.x * dt + _rd.x; _des.y = vel.y * dt; _des.z = vel.z * dt + _rd.z;
    const held = G.gun ? G.gun.heldCollider : null;
    const res = G.physics.moveCharacter(_des, held);
    const m = res.movement;
    this.cap.x += m.x; this.cap.y += m.y; this.cap.z += m.z;
    if (Math.abs(m.x - _des.x) > 0.001) vel.x = 0;
    if (Math.abs(m.z - _des.z) > 0.001) vel.z = 0;
    if (_des.y > 0 && m.y < _des.y - 0.001) vel.y = 0;
    const was = this.grounded;
    this.grounded = res.grounded && vel.y <= 0.5;
    if (this.grounded && !was && this._vyPrev < -3.5) { this.landed = 1; G.audio.play('land', { pos: this.cap, vol: clamp(-this._vyPrev / 10, 0.3, 1) }); }
    this._vyPrev = vel.y;

    if (this.cap.y < G.level.killY) G.game.respawnPlayer();

    this.place();
    // velocity of the capsule for the body animation (includes room-scale walking)
    const inv = dt > 1e-5 ? 1 / dt : 0;
    const k = 1 - Math.exp(-14 * dt);
    this.walkVel.x += ((this.cap.x - this.prevCap.x) * inv - this.walkVel.x) * k;
    this.walkVel.z += ((this.cap.z - this.prevCap.z) * inv - this.walkVel.z) * k;
    this.speedH = Math.hypot(this.walkVel.x, this.walkVel.z);
    this.stand = Math.max(this.stand - dt * 0.02, Math.min(this.head.y - this.cap.y, 2.1));   // slowly decaying max head height
    this.stand = Math.max(this.stand, Math.min(1.45, this.head.y - this.cap.y));
  }

  /**
   * Teleport through a portal link (T: matrix, qT: its rotation). The headset pose cannot be rotated physically, so we keep the
   * player upright: only YAW of the rig changes, and the rig is offset so the HEAD lands exactly at T * head (no visible pop
   * for wall-to-wall portals; floor/ceiling transitions re-upright the view).
   */
  applyTeleport(T, qT) {
    const cam = this.G.camera, Ly = this.localHead.y;
    _hq.setFromAxisAngle(_AXY, this.yaw).multiply(cam.quaternion);       // head world orientation
    _p.copy(this.head).applyMatrix4(T);                                  // head world position after the link
    _hq.premultiply(qT);
    const newHeadYaw = yawOfQuat(_hq);
    this.yaw = wrapPi(newHeadYaw - this.localYaw);                       // rig yaw such that head yaw == newHeadYaw
    this.cap.set(_p.x, _p.y - Ly, _p.z);                                  // rig/feet height from the headset floor offset
    this.vel.applyQuaternion(qT);
    const sp = this.vel.length(); if (sp > 32) this.vel.multiplyScalar(32 / sp);
    this.walkVel.set(0, 0, 0); this.grounded = false; this.coyote = 0;
    this.place();
    this.depenetrate(this.G.level);
    this.prevHead.copy(this.head);
    this.G.physics.teleportPlayerCenter(this.cap.x, this.cap.y + CONFIG.player.height / 2, this.cap.z);
  }

  /** Push the capsule out of any solid collider piece it overlaps (after a teleport or when a portal closes). */
  depenetrate(level) {
    const r = CONFIG.player.radius, h = CONFIG.player.height;
    let moved = false;
    for (let iter = 0; iter < 3; iter++) {
      let again = false;
      for (const s of level.slabs) {
        let pieces = [{ min: s.min, max: s.max }];
        for (const hole of level.holes) if (hole) pieces = pieces.flatMap((p) => subtractBox(p, hole));
        for (const p of pieces) {
          const ox = Math.min(this.cap.x + r, p.max[0]) - Math.max(this.cap.x - r, p.min[0]);
          const oy = Math.min(this.cap.y + h, p.max[1]) - Math.max(this.cap.y, p.min[1]);
          const oz = Math.min(this.cap.z + r, p.max[2]) - Math.max(this.cap.z - r, p.min[2]);
          if (ox <= 0.001 || oy <= 0.001 || oz <= 0.001) continue;
          const cx = (p.min[0] + p.max[0]) / 2, cz = (p.min[2] + p.max[2]) / 2, cy = (p.min[1] + p.max[1]) / 2;
          const up = p.max[1] - this.cap.y;                               // distance to lift feet onto the top
          if (up <= 1.0 && up <= Math.min(ox, oz) + 0.5) { this.cap.y = p.max[1] + 0.001; if (this.vel.y < 0) this.vel.y = 0; }
          else if (ox <= oz) this.cap.x += this.cap.x < cx ? -ox : ox;
          else this.cap.z += this.cap.z < cz ? -oz : oz;
          moved = again = true;
        }
      }
      if (!again) break;
    }
    if (moved) { this.place(); this.prevHead.copy(this.head); this.G.physics.teleportPlayerCenter(this.cap.x, this.cap.y + h / 2, this.cap.z); }
  }

  pulseHaptics(i, ms) { this.G.input.pulse(this.G.input.gunHandName, i, ms); }
}
