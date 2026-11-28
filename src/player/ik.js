// Analytic two-bone IK helpers. No allocations after module load.
import * as THREE from 'three';

const _dir = new THREE.Vector3(), _p = new THREE.Vector3();
const _cq = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _pi = new THREE.Quaternion(), _cur = new THREE.Vector3();

/**
 * Two-bone IK. Root S, wanted end T, bone lengths a (S->mid) and b (mid->end), pole = hint direction for the middle joint
 * (any vector; only its component perpendicular to S->T is used). Writes the mid joint to outMid and the (reach-clamped) end
 * to outEnd. The chain is clamped to [|a-b|, a+b] so a fully extended or fully folded arm never produces NaN or a flip.
 * Returns the reach ratio 0..1 (1 = fully extended).
 */
export function solveTwoBone(S, T, a, b, pole, outMid, outEnd) {
  _dir.subVectors(T, S);
  let d = _dir.length();
  if (d < 1e-6) { _dir.set(0, -1, 0); d = 1e-6; } else _dir.divideScalar(d);
  const minD = Math.abs(a - b) + 1e-4, maxD = a + b - 1e-4;
  const dc = Math.min(maxD, Math.max(minD, d));
  outEnd.copy(S).addScaledVector(_dir, dc);
  // Law of cosines: distance along S->T of the mid joint's projection, and its height off the line.
  const x = (a * a - b * b + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  _p.copy(pole); _p.addScaledVector(_dir, -_p.dot(_dir));
  if (_p.lengthSq() < 1e-8) {                                   // pole parallel to the chain: pick any perpendicular
    _p.set(0, -1, 0); _p.addScaledVector(_dir, -_p.dot(_dir));
    if (_p.lengthSq() < 1e-8) { _p.set(1, 0, 0); _p.addScaledVector(_dir, -_p.dot(_dir)); }
  }
  _p.normalize();
  outMid.copy(S).addScaledVector(_dir, x).addScaledVector(_p, h);
  return dc / (a + b);
}

/**
 * Rotate `bone` (minimal swing) so that its local AIM axis points along world direction dirW.
 * aimLocal is measured from the rest pose (normalized rest position of the child bone in this bone's local space), so the
 * Mixamo T-pose orientation of the arm bones is compensated automatically instead of assuming "+X is along the arm".
 * parentWorldQ is the parent's current world quaternion.
 */
export function aimBone(bone, aimLocal, dirW, parentWorldQ) {
  _cq.copy(parentWorldQ).multiply(bone.quaternion);             // current world rotation of the bone
  _cur.copy(aimLocal).applyQuaternion(_cq);                     // where the bone currently points (world)
  _dq.setFromUnitVectors(_cur, dirW);                           // shortest rotation onto the wanted direction (safe for opposite vectors)
  _cq.premultiply(_dq);
  bone.quaternion.copy(_pi.copy(parentWorldQ).invert()).multiply(_cq);
}

/** Set a bone's WORLD rotation by writing its local quaternion given the parent's world quaternion. */
export function setBoneWorldQ(bone, worldQ, parentWorldQ) {
  bone.quaternion.copy(_pi.copy(parentWorldQ).invert()).multiply(worldQ);
}
