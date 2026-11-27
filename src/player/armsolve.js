// Arm solver: analytic two-bone IK + ABSOLUTE bone orientations (no frame-to-frame state) + wrist twist distribution.
// Pure array math (no three.js) so tools/test_arms.mjs can unit test it in plain Node.
//
// WHY THIS EXISTS (the VR "warped arms" bug):
//  * The old code rotated each bone by the minimal swing from its PREVIOUS frame's orientation. Minimal swings accumulate twist
//    along the path the hand travels (parallel transport), so the upper arm slowly wound itself up.
//  * The hand was then forced to the controller orientation with no limits, so a forearm that had wound up 120 deg while the controller
//    said 0 deg produced a 120 deg twist across the wrist: the skin pinches ("hand turns small and stretches").
// Here every bone orientation is computed from scratch each frame from (aim direction, elbow-plane reference), so there is no
// history and no drift. The twist between forearm and controller is then SPREAD over upper arm / forearm / wrist and the
// remaining wrist swing and twist are clamped to anatomical limits.
//
// Quaternions are [x, y, z, w], vectors are [x, y, z]. All results are WORLD space.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a); return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l]; };

export const qIdentity = () => [0, 0, 0, 1];
export function qMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export const qConj = (q) => [-q[0], -q[1], -q[2], q[3]];
export function qNorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; }
export function qRot(q, v) {
  const t = mul(cross([q[0], q[1], q[2]], v), 2);
  return add(add(v, mul(t, q[3])), cross([q[0], q[1], q[2]], t));
}
export function qAxisAngle(axis, ang) { const s = Math.sin(ang / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(ang / 2)]; }
export function qSlerp(a, b, t) {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (cos < 0) { cos = -cos; bb = [-b[0], -b[1], -b[2], -b[3]]; }
  if (cos > 0.9995) return qNorm([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
  const th = Math.acos(cos), s = Math.sin(th), w1 = Math.sin((1 - t) * th) / s, w2 = Math.sin(t * th) / s;
  return [a[0] * w1 + bb[0] * w2, a[1] * w1 + bb[1] * w2, a[2] * w1 + bb[2] * w2, a[3] * w1 + bb[3] * w2];
}

/** Rotation matrix given as three column vectors -> quaternion. */
function quatFromCols(c0, c1, c2) {
  const m00 = c0[0], m10 = c0[1], m20 = c0[2], m01 = c1[0], m11 = c1[1], m21 = c1[2], m02 = c2[0], m12 = c2[1], m22 = c2[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]; }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]; }
  return qNorm(q);
}

/** Orthonormal right-handed basis [a, r, a x r] from an aim axis and a reference vector (made perpendicular to the aim). */
function basis(aim, ref) {
  const a = norm(aim);
  let r = sub(ref, mul(a, dot(ref, a)));
  if (len(r) < 1e-6) {                                           // reference parallel to the aim: any perpendicular
    r = Math.abs(a[1]) < 0.9 ? cross(a, [0, 1, 0]) : cross(a, [1, 0, 0]);
  }
  r = norm(r);
  return [a, r, cross(a, r)];
}

/** Rotation Q with Q*aimL = aimW and Q*refL ~ refW (twist about the aim is fixed by the reference vectors). */
export function frameQuat(aimL, refL, aimW, refW) {
  const bl = basis(aimL, refL), bw = basis(aimW, refW);
  // M = sum_k bw_k * bl_k^T  -> columns of M are M*e_j = sum_k bw_k * bl_k[j]
  const col = (j) => add(add(mul(bw[0], bl[0][j]), mul(bw[1], bl[1][j])), mul(bw[2], bl[2][j]));
  return quatFromCols(col(0), col(1), col(2));
}

/** q = swing * twist where twist is a rotation about `axis` (unit). */
export function swingTwist(q, axis) {
  const p = q[0] * axis[0] + q[1] * axis[1] + q[2] * axis[2];
  let tw = [axis[0] * p, axis[1] * p, axis[2] * p, q[3]];
  const l = Math.hypot(tw[0], tw[1], tw[2], tw[3]);
  tw = l < 1e-9 ? [0, 0, 0, 1] : [tw[0] / l, tw[1] / l, tw[2] / l, tw[3] / l];
  return { swing: qMul(q, qConj(tw)), twist: tw };
}
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export function twistAngle(tw, axis) { return wrapPi(2 * Math.atan2(tw[0] * axis[0] + tw[1] * axis[1] + tw[2] * axis[2], tw[3])); }
/** 1 below 120 deg, smoothly 0 at 180 deg: a twist that big is anatomically impossible, and tapering it removes the pop where the angle wraps. */
export function twistFade(absAngle) {
  const t = Math.max(0, Math.min(1, (absAngle - 2.094) / (Math.PI - 2.094)));
  return 1 - t * t * (3 - 2 * t);
}
export function swingAngle(sw) { const w = Math.min(1, Math.abs(sw[3])); return 2 * Math.acos(w); }

/** Two-bone IK in array math. Returns { E, Tc, pdir } (elbow, reach-clamped end, unit elbow direction perpendicular to S->T). */
export function ik2(S, T, a, b, pole) {
  let d = sub(T, S), dl = len(d);
  let dir = dl < 1e-6 ? [0, -1, 0] : mul(d, 1 / dl);
  if (dl < 1e-6) dl = 1e-6;
  const minD = Math.abs(a - b) + 1e-4, maxD = a + b - 1e-4;
  const dc = Math.min(maxD, Math.max(minD, dl));
  const Tc = add(S, mul(dir, dc));
  const x = (a * a - b * b + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  let p = sub(pole, mul(dir, dot(pole, dir)));
  if (len(p) < 1e-4) { p = sub([0, -1, 0], mul(dir, dir[1] * -1)); if (len(p) < 1e-4) p = sub([1, 0, 0], mul(dir, dir[0])); }
  p = norm(p);
  const E = add(add(S, mul(dir, x)), mul(p, h));
  return { E, Tc, pdir: p };
}

/**
 * @param P.S, P.T         shoulder and wanted wrist (world)
 * @param P.a, P.b         upper arm / forearm length
 * @param P.pole           elbow hint direction (world, any length)
 * @param P.aimU, P.refU   upper arm: unit aim axis (toward elbow) and elbow-plane reference, both in the bone's LOCAL space
 * @param P.aimF, P.refF   same for the forearm
 * @param P.restHandRel    hand bone's rest rotation relative to the forearm (its local rest quaternion)
 * @param P.handTarget     wanted world rotation of the hand bone (or null)
 * @param P.w              0..1 blend toward the tracked hand orientation (0 = natural pose)
 * @param P.limits         { twistMax, swingMax, upShare, foreShare } radians / fractions
 * @returns { E, Tc, qU, qF, qH, twist, swing }  world quaternions for upper arm, forearm and hand
 */
export function solveArm(P) {
  const { E, Tc, pdir } = ik2(P.S, P.T, P.a, P.b, P.pole);
  const dirU = norm(sub(E, P.S)), dirF = norm(sub(Tc, E));
  const qU0 = frameQuat(P.aimU, P.refU, dirU, pdir);
  const qF0 = frameQuat(P.aimF, P.refF, dirF, pdir);
  const L = P.limits;
  let qU = qU0, qF = qF0, qH, twist = 0, swing = 0;
  const w = P.handTarget ? Math.max(0, Math.min(1, P.w)) : 0;
  const natural = (qf) => qMul(qf, P.restHandRel);
  if (w > 0.001) {
    const axisN = qRot(qConj(P.restHandRel), P.aimF);            // forearm axis expressed in the hand's natural frame
    // 1) total twist between the natural hand and the target about the forearm axis
    let rel = qMul(qConj(natural(qF0)), P.handTarget);
    if (rel[3] < 0) rel = [-rel[0], -rel[1], -rel[2], -rel[3]];
    const rawTheta = twistAngle(swingTwist(rel, axisN).twist, axisN);
    const theta = rawTheta * twistFade(Math.abs(rawTheta)) * w;
    // 2) spread it: some on the upper arm, most on the forearm, the rest stays at the wrist
    qU = qMul(qU0, qAxisAngle(P.aimU, theta * L.upShare));
    qF = qMul(qF0, qAxisAngle(P.aimF, theta * L.foreShare));
    // 3) what is left for the wrist, clamped
    let rel2 = qMul(qConj(natural(qF)), P.handTarget);
    if (rel2[3] < 0) rel2 = [-rel2[0], -rel2[1], -rel2[2], -rel2[3]];
    // cap the TOTAL deflection first (continuous), so the swing/twist split below is never evaluated near its 180 deg singularity
    // Beyond ~130 deg the wanted pose is unreachable; the deflection tapers back to 0 at 180 deg. (Any continuous clamp of rotations has
    // to do this: rotations 180 deg away in opposite directions are the same rotation, so a flat clamp would pop there.)
    const phi = 2 * Math.acos(Math.min(1, rel2[3])), phiMax = L.swingMax + 0.6;
    if (phi > phiMax) {
      const u = Math.max(0, Math.min(1, (phi - 2.27) / (Math.PI - 2.27))), keep = phiMax * (1 - u * u * (3 - 2 * u));
      rel2 = qSlerp(qIdentity(), rel2, keep / phi);
    }
    const st = swingTwist(rel2, axisN);
    let tAng = twistAngle(st.twist, axisN);
    tAng *= twistFade(Math.abs(tAng));
    tAng = Math.max(-L.twistMax, Math.min(L.twistMax, tAng));
    let sw = st.swing; if (sw[3] < 0) sw = [-sw[0], -sw[1], -sw[2], -sw[3]];
    const sAng = swingAngle(sw);
    if (sAng > L.swingMax) sw = qSlerp(qIdentity(), sw, L.swingMax / sAng);
    twist = tAng; swing = Math.min(sAng, L.swingMax);
    const wanted = qMul(natural(qF), qMul(sw, qAxisAngle(axisN, tAng)));
    qH = qSlerp(natural(qF), wanted, w);
  } else qH = natural(qF);
  return { E, Tc, qU, qF, qH: qNorm(qH), twist, swing };
}

/** Elbow-plane reference direction of a bone in its local space: root-space "back" (+Z) pulled into the bone frame. */
export function localRef(restWorldQ, aimL, backRoot = [0, 0, 1]) {
  const r = qRot(qConj(restWorldQ), backRoot);
  return norm(sub(r, mul(aimL, dot(r, aimL))));
}
