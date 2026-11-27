// Player body from assets/playermodel.glb (Mixamo rig, no clips).
//  * Bones are found by case-insensitive SUFFIX match, so "mixamorig:LeftArm" / "mixamorigLeftArm" / "Armature_LeftArm" all work.
//  * Orientation and scale are auto-detected from the skeleton (up = hips->head, right = rightUpLeg->leftUpLeg), then
//    config.models.playermodel offsets are applied on top. Nothing is assumed about the file's axes or units.
//  * The Head bone is scaled to ~0 (meshes stay), so the camera never sits inside a head.
//  * Legs: procedural walk cycle written as FK in the model's REST frame (world-space rotations expressed against each
//    bone's rest orientation, so arbitrary Mixamo bone-local axes don't matter).
//  * Arms: analytic two-bone IK to the controller grips (or, on desktop, the grip point on the gun). Bone orientations are computed
//    ABSOLUTELY every frame by armsolve.js (no accumulated twist), with the controller twist spread over the arm and the wrist limited.
//  * The head bone is hidden in the main view but shown while portal views render, so you see your own head through a portal.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from '../config.js';
import { DEG, clamp, damp, lerp, dampAngle, wrapPi, rotYaw, quatFromDeg, measureObject, log, warn } from '../core/util.js';
import { setBoneWorldQ } from './ik.js';
import { solveArm, localRef } from './armsolve.js';

const BONE_NAMES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const SIDES = ['Left', 'Right'];

const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
const _v1 = V(), _v2 = V(), _v3 = V(), _v4 = V(), _S = V(), _E = V(), _T = V(), _Tc = V(), _pole = V(), _dir = V(), _t = { x: 0, z: 0 };
const _q1 = Q(), _q2 = Q(), _q3 = Q(), _q4 = Q(), _pq = Q(), _pq2 = Q(), _pq3 = Q(), _nat = Q(), _tgt = Q();
const _rq = Q(), _qa = Q(), _qb = Q(), _qc = Q();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);

function findBone(root, suffix) {
  const s = suffix.toLowerCase();
  let best = null;
  root.traverse((o) => {
    if (!o.name || !o.name.toLowerCase().endsWith(s)) return;
    if (!best || (o.isBone && !best.isBone)) best = o;
  });
  return best;
}

export class PlayerBody {
  constructor(G) {
    this.G = G;
    this.enabled = false;
    this.root = new THREE.Group(); this.root.name = 'playerBody';
    this.wrapper = new THREE.Group(); this.root.add(this.wrapper);
    this.bone = {}; this.restModelQ = {}; this.restLocalQ = {}; this.restLocalPos = {};
    this.aimLocal = {}; this.fModel = [V(), V()];
    this.alignQ = [Q(), Q()]; this.restRootHand = [Q(), Q()];
    this.qW = Q(); this.qFix = Q(); this.hipsParentRestModel = Q();
    this.H0 = 1; this.minY0 = 0; this.neckH0 = 1.5;
    this.bodyYaw = 0; this.phase = 0; this.blend = 0; this.dyn = 1;
    this.armW = [0, 0]; this.neckLX = 0; this.neckLZ = 0; this.stepIndex = 0;
    this.hasLegs = false; this.hasArms = [false, false]; this.hasSpine = false;
    this.dirty = true;
    this.dbg = null;
    this._lastTarget = [V(), V()]; this._lastQ = [Q(), Q()];
    this._ikDbg = [[V(), V(), V(), V()], [V(), V(), V(), V()]];
    this.restScale = {}; this.refLocal = {}; this.skinned = []; this._headShown = false;
  }

  // ---------------------------------------------------------------------------------------------- setup
  init() {
    const G = this.G, gltf = G.assets.models.playermodel, M = CONFIG.models.playermodel;
    if (!gltf) { warn('playermodel.glb not loaded: no player body (the game still works)'); return false; }
    this.model = cloneSkinned(gltf.scene);
    this.wrapper.add(this.model);
    this.model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = false; if (o.isSkinnedMesh) this.skinned.push(o); } });
    G.scene.add(this.root);

    const missing = [];
    for (const n of BONE_NAMES) { const b = findBone(this.model, n); this.bone[n] = b; if (!b) missing.push(n); }
    if (missing.length) warn(`playermodel: missing bone(s): ${missing.join(', ')}. Features depending on them are disabled. (Expected Mixamo names; matching is case-insensitive suffix.)`);
    const B = this.bone;
    this.hasSpine = !!(B.Hips && B.Spine);
    this.hasLegs = SIDES.every((s) => B[s + 'UpLeg'] && B[s + 'Leg'] && B[s + 'Foot']) && !!B.Hips;
    SIDES.forEach((s, i) => { this.hasArms[i] = !!(B[s + 'Arm'] && B[s + 'ForeArm'] && B[s + 'Hand']); });
    if (!B.Hips) { warn('playermodel: no Hips bone -> body disabled'); this.root.visible = false; return false; }

    // --- orientation fix from the skeleton itself
    this.root.position.set(0, 0, 0); this.root.quaternion.identity(); this.wrapper.position.set(0, 0, 0); this.wrapper.scale.set(1, 1, 1); this.wrapper.quaternion.identity();
    this.root.updateMatrixWorld(true);
    const wp = (b, out) => out.setFromMatrixPosition(b.matrixWorld);
    this.qFix.identity();
    if (B.Head && B.LeftUpLeg && B.RightUpLeg) {
      const up = wp(B.Head, V()).sub(wp(B.Hips, V()));
      const right = wp(B.RightUpLeg, V()).sub(wp(B.LeftUpLeg, V()));         // character's right
      up.normalize(); right.addScaledVector(up, -right.dot(up)).normalize();
      const back = new THREE.Vector3().crossVectors(right, up).normalize();   // character's back (+Z in canonical frame)
      if ([up, right, back].every((v) => isFinite(v.x + v.y + v.z) && v.lengthSq() > 0.5)) {
        _m1.makeBasis(right, up, back);                                       // canonical -> model
        this.qFix.setFromRotationMatrix(_m1).invert();                        // model -> canonical (right=+X, up=+Y, forward=-Z)
      } else warn('playermodel: could not derive orientation from bones, assuming +Z forward');
    } else { this.qFix.setFromAxisAngle(AY, Math.PI); warn('playermodel: orientation guessed (+Z forward) because Head/UpLeg bones are missing'); }
    this.wrapper.quaternion.copy(this.qFix);
    this.root.updateMatrixWorld(true);

    const box = measureObject(this.root);
    this.H0 = Math.max(1e-3, box.max.y - box.min.y); this.minY0 = box.min.y;
    this.neckH0 = B.Neck ? Math.max(0.1, wp(B.Neck, V()).y - box.min.y) : this.H0 * 0.85;
    log(`playermodel: height ${this.H0.toFixed(3)} (model units), fit scale ${(M.targetHeight / this.H0).toFixed(4)}, bones ok: legs=${this.hasLegs} arms=${this.hasArms} spine=${this.hasSpine}`);

    // --- rest data (relative to the model frame, i.e. with qFix removed)
    const qFixInv = this.qFix.clone().invert();
    const wq = (o, out) => o.getWorldQuaternion(out);
    for (const n of BONE_NAMES) {
      const b = B[n]; if (!b) continue;
      this.restModelQ[n] = qFixInv.clone().multiply(wq(b, Q()));
      this.restLocalQ[n] = b.quaternion.clone(); this.restLocalPos[n] = b.position.clone(); this.restScale[n] = b.scale.clone();
    }
    if (B.Hips.parent) this.hipsParentRestModel.copy(qFixInv).multiply(wq(B.Hips.parent, Q())); else this.hipsParentRestModel.identity();
    // aim axes: rest-pose direction to the child bone, in the bone's own local space (no hard-coded axes)
    for (const s of SIDES) {
      const arm = B[s + 'Arm'], fore = B[s + 'ForeArm'], hand = B[s + 'Hand'];
      if (arm && fore && hand) {
        this.aimLocal[s + 'Arm'] = fore.position.clone().normalize();
        this.aimLocal[s + 'ForeArm'] = hand.position.clone().normalize();
        const mid = findBone(hand, s + 'HandMiddle1');
        const f = (mid ? wp(mid, V()).sub(wp(hand, V())) : wp(hand, V()).sub(wp(fore, V()))).normalize();
        this.fModel[SIDES.indexOf(s)].copy(f).applyQuaternion(qFixInv);
      }
    }
    this.root.visible = true; this.enabled = true; this.dirty = true;
    return true;
  }

  /** Called by the tuner after config changes. */
  applyConfig() { this.dirty = true; }

  _derive() {
    const M = CONFIG.models.playermodel;
    this.qW.copy(quatFromDeg(M.rotationOffset, _q1)).multiply(this.qFix);
    SIDES.forEach((s, i) => {
      if (!this.hasArms[i]) return;
      this.restRootHand[i].copy(this.qW).multiply(this.restModelQ[s + 'Hand']);
      const f = _v1.copy(this.fModel[i]).applyQuaternion(this.qW).normalize();             // fingers (root space, rest)
      const n = _v2.copy(DOWN); n.addScaledVector(f, -n.dot(f)).normalize();                // palm normal (T-pose: palms down)
      const t = _v3.set(0, 0, -1); t.addScaledVector(f, -t.dot(f)); t.addScaledVector(n, -t.dot(n)); t.normalize();   // thumb (forward)
      _m1.makeBasis(f, n, t);
      // controller grip frame: fingers -Z, palm faces inward (+/-X), thumb +Y
      _v4.set(0, 0, -1); const gn = new THREE.Vector3(i === 0 ? 1 : -1, 0, 0), gt = new THREE.Vector3(0, 1, 0);
      _m2.makeBasis(_v4, gn, gt);
      _m3.copy(_m2).multiply(_m1.invert());                                                 // rest frame -> grip frame (proper rotation)
      this.alignQ[i].setFromRotationMatrix(_m3);
      // elbow-plane reference of the arm bones in their local space: the rest pose's "back" direction (elbows point back in a T-pose)
      for (const nm of ['Arm', 'ForeArm']) {
        const q = _q1.copy(this.qW).multiply(this.restModelQ[s + nm]);
        const aim = this.aimLocal[s + nm];
        this.refLocal[s + nm] = localRef([q.x, q.y, q.z, q.w], [aim.x, aim.y, aim.z]);
      }
    });
    this.dirty = false;
  }

  _restRoot(name, out) { return out.copy(this.qW).multiply(this.restModelQ[name]); }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    if (!this.enabled) return;
    const G = this.G, C = CONFIG.body, M = CONFIG.models.playermodel, pl = G.player, H = G.health;
    this.collapse = H ? H.collapse : 0;
    this.root.visible = C.enabled;
    if (!C.enabled) return;
    if (this.dirty) this._derive();
    const B = this.bone;

    // ---- body yaw follows head yaw with a dead zone and smoothing
    const headYaw = pl.headYaw, moving = pl.speedH > 0.35, diff = wrapPi(headYaw - this.bodyYaw), dz = C.bodyYawDeadzoneDeg * DEG;
    if (moving) this.bodyYaw = dampAngle(this.bodyYaw, headYaw, C.bodyYawLag * 1.6, dt);
    else if (Math.abs(diff) > dz) this.bodyYaw = dampAngle(this.bodyYaw, headYaw - Math.sign(diff) * dz * 0.6, C.bodyYawLag, dt);

    // ---- fit transform (recomputed every frame so tuning sliders are live)
    const sc = Array.isArray(M.scale) ? M.scale : [M.scale, M.scale, M.scale];
    const fit = M.targetHeight / this.H0;
    const dynTarget = C.matchPlayerHeight ? clamp((pl.stand - C.neckBelowEyes) / (this.neckH0 * fit * sc[1]), 0.7, 1.4) : 1;
    this.dyn = damp(this.dyn, dynTarget, 3, dt);
    const s = fit * this.dyn;
    this.wrapper.scale.set(s * sc[0], s * sc[1], s * sc[2]);
    this.wrapper.quaternion.copy(this.qW);
    this.wrapper.position.set(M.positionOffset[0], -this.minY0 * s * sc[1] + M.positionOffset[1], M.positionOffset[2]);
    this.setHeadVisible(false);                                   // hidden in the main view; renderViews() shows it for portal views

    // ---- place root: neck under the camera (slightly behind), feet on the capsule bottom
    const fx = -Math.sin(this.bodyYaw), fz = -Math.cos(this.bodyYaw);
    rotYaw(this.neckLX, this.neckLZ, this.bodyYaw, _t);
    this.root.rotation.set(0, this.bodyYaw, 0);
    this.root.position.set(pl.head.x - fx * C.neckBackOffset - _t.x, pl.cap.y, pl.head.z - fz * C.neckBackOffset - _t.z);
    this.root.updateMatrixWorld(true);

    // ---- locomotion state in body frame
    const rx = Math.cos(this.bodyYaw), rz = -Math.sin(this.bodyYaw);
    const vf = pl.walkVel.x * fx + pl.walkVel.z * fz, vs = pl.walkVel.x * rx + pl.walkVel.z * rz, speed = pl.speedH;
    const ampT = pl.grounded ? clamp(speed / (CONFIG.player.walkSpeed * 0.9), 0, 1) : (speed > 0.5 ? 0.25 : 0);
    this.blend = damp(this.blend, speed < 0.12 ? 0 : ampT, C.blendSpeed, dt);
    const freq = Math.min(speed / C.strideLength, C.stepFreqMax);
    const dirSign = vf < -0.05 * Math.max(speed, 0.01) ? -1 : 1;             // backward: run the cycle in reverse
    this.phase += dirSign * freq * Math.PI * 2 * dt;
    const fwdW = speed > 0.05 ? Math.abs(vf) / speed : 1, amp = this.blend * (0.55 + 0.45 * fwdW);   // strafing: reduced amplitude
    if (this.hasLegs && this.hasSpine) this._fk(amp, pl);

    // ---- keep the neck exactly under the camera after FK (hip twist moves it a little)
    this.root.updateMatrixWorld(true);
    if (B.Neck) {
      _v1.setFromMatrixPosition(B.Neck.matrixWorld);
      const tx = pl.head.x - fx * C.neckBackOffset, tz = pl.head.z - fz * C.neckBackOffset;
      this.root.position.x += tx - _v1.x; this.root.position.z += tz - _v1.z;
      this.root.updateMatrixWorld(true);
      // remember neck offset in root-local space for next frame's estimate
      _v2.setFromMatrixPosition(B.Neck.matrixWorld);
      const ox = _v2.x - this.root.position.x, oz = _v2.z - this.root.position.z;
      this.neckLX = ox * Math.cos(this.bodyYaw) - oz * Math.sin(this.bodyYaw);
      this.neckLZ = ox * Math.sin(this.bodyYaw) + oz * Math.cos(this.bodyYaw);
    }

    // ---- dying: the whole body topples about the feet (same rotation the camera rig gets, see Health.applyToRig)
    if (H && H.fxActive) H.applyToObject(this.root, pl.cap);
    this.root.updateMatrixWorld(true);

    // ---- footsteps tied to the walk cycle (heel strikes at phase = pi/2 + k*pi)
    const idx = Math.floor((this.phase - Math.PI / 2) / Math.PI);
    if (idx !== this.stepIndex) {
      this.stepIndex = idx;
      if (C.footstepSounds && this.blend > 0.3 && pl.grounded) G.audio.play('footstep', { pos: pl.cap, vol: 0.5 + 0.5 * this.blend, rate: 0.92 + Math.random() * 0.16 });
    }

    for (let i = 0; i < 2; i++) if (this.hasArms[i]) this._arm(i, dt, C);
    this._debug(C);
  }

  // ---------------------------------------------------------------------------------------------- legs / hips (FK)
  _fk(amp, pl) {
    const C = CONFIG.body, B = this.bone, G = this.G;
    const swing = C.swingDeg * DEG, knee = C.kneeFlexDeg * DEG, twist = C.hipTwistDeg * DEG;
    const ph = this.phase;
    const tw = -twist * amp * Math.sin(ph);                      // left leg forward -> hips turn clockwise (seen from above)

    // hips: world rotation = twist * rest
    const hipsW = _q1.setFromAxisAngle(AY, tw).multiply(this._restRoot('Hips', _q2));
    const hipsParentRest = _q3.copy(this.qW).multiply(this.hipsParentRestModel);
    setBoneWorldQ(B.Hips, hipsW, hipsParentRest);
    // spine counter-rotation (absolute world angles, so each bone is independent of its parent's animation)
    const spineChain = ['Spine', 'Spine1', 'Spine2'], k = [-0.5, -0.8, -1.0];
    let parentW = _q4.copy(hipsW);
    for (let i = 0; i < 3; i++) {
      const b = B[spineChain[i]]; if (!b) continue;
      const w = _pq.setFromAxisAngle(AY, tw * k[i]).multiply(this._restRoot(spineChain[i], _pq2));
      setBoneWorldQ(b, w, parentW); parentW = _q4.copy(w);
    }

    // crouch: lower the hips and bend the knees so the feet stay planted (law of cosines)
    const dropWanted = Math.max(CONFIG.body.crouchBend ? clamp(pl.stand - (pl.head.y - pl.cap.y), 0, 0.6) : 0, (this.collapse || 0) * 0.5);
    const a = _v1.setFromMatrixPosition(B.LeftUpLeg.matrixWorld).distanceTo(_v2.setFromMatrixPosition(B.LeftLeg.matrixWorld)) || 0.4;
    const b = _v2.distanceTo(_v3.setFromMatrixPosition(B.LeftFoot.matrixWorld)) || 0.4;
    const h = Math.max(Math.abs(a - b) + 0.02, a + b - dropWanted);
    const tilt = Math.acos(clamp((a * a + h * h - b * b) / (2 * a * h), -1, 1));
    const flexC = Math.PI - Math.acos(clamp((a * a + b * b - h * h) / (2 * a * b), -1, 1));
    const drop = a + b - h;

    // hip height: bob + crouch, converted to the hips parent's local space (it may carry a 0.01 armature scale)
    const bob = C.hipBob * amp * Math.cos(2 * ph) - drop;
    const par = B.Hips.parent;
    if (par) {
      _m1.copy(this.root.matrixWorld).invert().multiply(par.matrixWorld);                // parent in root space
      const sc = _m1.getMaxScaleOnAxis() || 1;
      _dir.copy(AY).transformDirection(_m2.copy(_m1).invert()).normalize();
      B.Hips.position.copy(this.restLocalPos.Hips).addScaledVector(_dir, bob / sc);
    }

    for (let i = 0; i < 2; i++) {
      const s = SIDES[i], pi = ph + (i === 1 ? Math.PI : 0), sn = Math.sin(pi), cs = Math.cos(pi);
      const th1 = swing * amp * sn + tilt;
      const flex = knee * amp * Math.max(0, cs) + flexC;
      const foot = amp * (0.22 * Math.max(0, sn) - 0.3 * Math.max(0, -sn));
      const up = B[s + 'UpLeg'], leg = B[s + 'Leg'], ft = B[s + 'Foot'];
      const wUp = _pq.setFromAxisAngle(AX, th1).multiply(this._restRoot(s + 'UpLeg', _pq2));
      setBoneWorldQ(up, wUp, hipsW);
      const wLeg = _pq3.setFromAxisAngle(AX, th1 - flex).multiply(this._restRoot(s + 'Leg', _nat));
      setBoneWorldQ(leg, wLeg, wUp);
      const wFoot = _tgt.setFromAxisAngle(AX, foot).multiply(this._restRoot(s + 'Foot', _q4));   // foot compensation: stay level
      setBoneWorldQ(ft, wFoot, wLeg);
    }
  }

  // ---------------------------------------------------------------------------------------------- arms (IK)
  /** Show / hide the head bone (scale hack). Forces the skeleton texture to refresh so the change shows in the very next draw call. */
  setHeadVisible(v) {
    const h = this.bone.Head;
    if (!h || this._headShown === v) return;
    this._headShown = v;
    h.scale.setScalar(v ? (this.restScale.Head ? this.restScale.Head.x : 1) : CONFIG.body.headScale);
    h.updateMatrixWorld(true);
    for (const m of this.skinned) m.skeleton.frame = -1;
  }

  /**
   * World pose of the "hand holder" for hand i (outPos, outQuat). XR: the controller grip. Desktop: the GRIP POINT ON THE GUN
   * (gun.handNode = where the controller grip would be if the gun were in VR), so the arm visibly holds the gun instead of the hand
   * sitting inside the camera. The off hand reaches to the side of a carried cube.
   */
  _holder(i, outPos, outQuat) {
    const G = this.G, I = G.input, name = i === 0 ? 'left' : 'right';
    if (I.mode === 'xr') {
      const h = I.hands[name];
      if (!h || !h.grip.visible) return false;
      h.grip.updateWorldMatrix(true, false);
      h.grip.matrixWorld.decompose(outPos, outQuat, _v4);
      return true;
    }
    if (!G.gun) return false;
    if (name === I.gunHandName) {
      if (!G.gun.root.visible) return false;
      G.gun.handNode.updateWorldMatrix(true, false);
      G.gun.handNode.matrixWorld.decompose(outPos, outQuat, _v4);
      return true;
    }
    if (G.gun.held && G.gun.held.mesh) {                                         // off hand: touch the carried cube
      const yaw = G.player.headYaw, side = i === 0 ? -1 : 1;
      outPos.copy(G.gun.held.mesh.position);
      outPos.x += Math.cos(yaw) * side * 0.34 - Math.sin(yaw) * -0.04; outPos.z += -Math.sin(yaw) * side * 0.34 - Math.cos(yaw) * -0.04;
      outQuat.setFromAxisAngle(AY, yaw);
      return true;
    }
    return false;
  }

  _arm(i, dt, C) {
    const B = this.bone, s = SIDES[i], arm = B[s + 'Arm'], fore = B[s + 'ForeArm'], hand = B[s + 'Hand'];
    const sign = i === 0 ? -1 : 1, H = this.G.health, dead = !!(H && H.dead), col = H ? H.collapse : 0;
    // defensive: nothing may ever change the scale of the arm bones (a polluted scale is what "big / small / stretched hand" looks like)
    for (const n of ['Arm', 'ForeArm', 'Hand']) B[s + n].scale.copy(this.restScale[s + n]);
    this.root.updateMatrixWorld(true);
    _S.setFromMatrixPosition(arm.matrixWorld);
    _v1.setFromMatrixPosition(fore.matrixWorld);
    _v2.setFromMatrixPosition(hand.matrixWorld);
    const a = _S.distanceTo(_v1) || 0.3, b = _v1.distanceTo(_v2) || 0.3, L = a + b;
    // body space (x right, y up, z back) -> world, through the root's FULL rotation (yaw + death topple)
    this.root.getWorldQuaternion(_rq);
    const toWorld = (x, y, z, out) => out.set(x, y, z).applyQuaternion(_rq);

    const tracked = C.ikEnabled && !dead && this._holder(i, _v3, _q1);
    this.armW[i] = damp(this.armW[i], tracked ? 1 : 0, 9, dt);
    const w = this.armW[i];

    // relaxed rest pose target (arms hang slightly out and forward; limp and spread when collapsing)
    toWorld(sign * lerp(C.relaxedArmOut, 0.85, col), -0.93 + 0.5 * col, -lerp(C.relaxedArmFwd, -0.1, col), _T).multiplyScalar(L).add(_S);
    if (tracked) {
      const off = CONFIG.body.handPositionOffset[i === 0 ? 'left' : 'right'];
      _v4.set(off[0], off[1], off[2]).applyQuaternion(_q1).add(_v3);          // wrist = grip + offset (in grip space)
      _T.lerp(_v4, w);
      this._lastTarget[i].copy(_v4); this._lastQ[i].copy(_q1);
    } else if (w > 0.001) _T.lerp(this._lastTarget[i], w);              // tracking lost: ease back to the relaxed pose

    // pole (elbow hint): body-space vector, mirrored for the left arm
    const pv = C.poleVector;
    toWorld(sign * pv[0], pv[1], pv[2], _pole);
    _pole.lerp(DOWN, 1 - clamp(C.poleWeight, 0, 1));

    // wanted hand orientation (controller / gun grip, rest-pose compensated)
    let handTarget = null;
    if (w > 0.001) {
      const gq = tracked ? _q1 : this._lastQ[i];
      const extra = C.handRotationOffsetDeg[i === 0 ? 'left' : 'right'];
      _tgt.copy(gq).multiply(quatFromDeg(extra, _q2)).multiply(this.alignQ[i]).multiply(this.restRootHand[i]);
      handTarget = [_tgt.x, _tgt.y, _tgt.z, _tgt.w];
    }
    const au = this.aimLocal[s + 'Arm'], af = this.aimLocal[s + 'ForeArm'], ru = this.refLocal[s + 'Arm'], rf = this.refLocal[s + 'ForeArm'], rh = this.restLocalQ[s + 'Hand'];
    const LM = C.limits;
    const r = solveArm({
      S: [_S.x, _S.y, _S.z], T: [_T.x, _T.y, _T.z], a, b, pole: [_pole.x, _pole.y, _pole.z],
      aimU: [au.x, au.y, au.z], refU: ru, aimF: [af.x, af.y, af.z], refF: rf,
      restHandRel: [rh.x, rh.y, rh.z, rh.w], handTarget, w,
      limits: { twistMax: LM.twistMaxDeg * DEG, swingMax: LM.swingMaxDeg * DEG, upShare: LM.upperTwistShare, foreShare: LM.foreTwistShare },
    });

    // world rotations -> local bone rotations
    arm.parent.getWorldQuaternion(_pq);
    _qa.set(r.qU[0], r.qU[1], r.qU[2], r.qU[3]);
    arm.quaternion.copy(_pq).invert().multiply(_qa).normalize();
    arm.updateWorldMatrix(false, false);
    _qb.set(r.qF[0], r.qF[1], r.qF[2], r.qF[3]);
    fore.quaternion.copy(_qa).invert().multiply(_qb).normalize();
    fore.updateWorldMatrix(false, false);
    _qc.set(r.qH[0], r.qH[1], r.qH[2], r.qH[3]);
    hand.quaternion.copy(_qb).invert().multiply(_qc).normalize();
    hand.updateWorldMatrix(false, true);
    _Tc.set(r.Tc[0], r.Tc[1], r.Tc[2]); _E.set(r.E[0], r.E[1], r.E[2]);
    this._ikDbg[i][0].copy(_S); this._ikDbg[i][1].copy(_E); this._ikDbg[i][2].copy(_Tc); this._ikDbg[i][3].copy(_T);
  }

  // ---------------------------------------------------------------------------------------------- debug draw
  _debug(C) {
    const want = CONFIG.debug.drawIK;
    if (!want) { if (this.dbg) this.dbg.visible = false; return; }
    if (!this.dbg) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 6 * 3), 3));
      this.dbg = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x00ffaa, depthTest: false }));   // debug only (exempt from texture rule)
      this.dbg.frustumCulled = false; this.dbg.renderOrder = 999; this.G.scene.add(this.dbg);
    }
    this.dbg.visible = true;
    const p = this.dbg.geometry.attributes.position; let k = 0;
    const seg = (a, b) => { p.setXYZ(k++, a.x, a.y, a.z); p.setXYZ(k++, b.x, b.y, b.z); };
    for (let i = 0; i < 2; i++) {
      const d = this._ikDbg[i];
      seg(d[0], d[1]); seg(d[1], d[2]);
      _v1.copy(d[3]).add(_v2.set(0.05, 0, 0)); _v3.copy(d[3]).sub(_v2); seg(_v1, _v3);
    }
    p.needsUpdate = true;
  }

  dispose() { if (this.root.parent) this.root.parent.remove(this.root); }
}
