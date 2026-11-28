// Dev tool: node tools/test_arms.mjs
// Builds a fake arm (rest = T-pose, Mixamo-like local axes that are NOT aligned with the world) and checks the solver:
//  1. elbow and wrist land where the IK says (bones really point at their children)
//  2. no NaN for random controller poses, including extreme ones
//  3. the wrist swing/twist limits hold
//  4. the result does not depend on history (same inputs -> same bone rotations), which was the cause of the VR arm twisting
import { solveArm, qMul, qConj, qRot, qNorm, qAxisAngle, swingTwist, twistAngle, swingAngle, localRef } from '../src/player/armsolve.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(...a);
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const randQ = () => qNorm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);

for (const side of ['right', 'left']) {
  console.log(`\n== ${side} arm`);
  const sgn = side === 'right' ? 1 : -1;
  // T-pose in root space: arm along +-X. Bone local frames are rotated arbitrarily (like FBX bones), aim axis = local +Y here.
  const restU = qNorm([0.3, 0.5, -0.2, 0.8]), restF = restU, restHand = restU;         // rest world rotation of each bone
  const dirRest = [sgn, 0, 0];
  const aimU = qRot(qConj(restU), dirRest), aimF = aimU;                                    // local aim axes
  const refU = localRef(restU, aimU), refF = localRef(restF, aimF);
  const restHandRel = qMul(qConj(restF), restHand);
  const a = 0.29, b = 0.27;
  const limits = { twistMax: 55 * Math.PI / 180, swingMax: 75 * Math.PI / 180, upShare: 0.2, foreShare: 0.5 };
  const S = [sgn * 0.2, 1.4, 0];
  const base = { S, a, b, aimU, refU, aimF, refF, restHandRel, limits, pole: [sgn * 0.55, -1, 0.45], w: 1 };

  let maxPosErr = 0, nan = 0, maxSwing = 0, maxTwist = 0;
  for (let i = 0; i < 4000; i++) {
    const T = [S[0] + (rnd() - 0.5) * 1.4, S[1] + (rnd() - 0.5) * 1.4, S[2] + (rnd() - 0.5) * 1.4];
    const r = solveArm({ ...base, T, handTarget: randQ() });
    const all = [...r.E, ...r.Tc, ...r.qU, ...r.qF, ...r.qH];
    if (all.some((v) => !Number.isFinite(v))) { nan++; continue; }
    // bones point at their children
    const E2 = [S[0] + qRot(r.qU, aimU)[0] * a, S[1] + qRot(r.qU, aimU)[1] * a, S[2] + qRot(r.qU, aimU)[2] * a];
    const f = qRot(r.qF, aimF);
    const W2 = [E2[0] + f[0] * b, E2[1] + f[1] * b, E2[2] + f[2] * b];
    maxPosErr = Math.max(maxPosErr, len(sub(E2, r.E)), len(sub(W2, r.Tc)));
    maxSwing = Math.max(maxSwing, r.swing); maxTwist = Math.max(maxTwist, Math.abs(r.twist));
    // hand really is within the swing limit of the natural orientation (axis of the hand vs forearm)
    const nat = qMul(r.qF, restHandRel);
    const rel = qMul(qConj(nat), r.qH);
    const ang = swingAngle(swingTwist(rel.slice(), qRot(qConj(restHandRel), aimF)).swing);
    if (ang > limits.swingMax + 1e-3) ok(false, `hand swing ${ang} exceeds limit`);
  }
  ok(nan === 0, `no NaN in 4000 random poses (${nan})`);
  ok(maxPosErr < 1e-6, `elbow + wrist exactly where IK put them (max err ${maxPosErr.toExponential(2)} m)`);
  ok(maxSwing <= limits.swingMax + 1e-6, `wrist swing clamped (max ${(maxSwing * 180 / Math.PI).toFixed(1)} deg)`);
  ok(maxTwist <= limits.twistMax + 1e-6, `wrist twist clamped (max ${(maxTwist * 180 / Math.PI).toFixed(1)} deg)`);

  // history independence: run a long random walk, then the SAME input must give the SAME output as a fresh solve
  const T0 = [S[0] + 0.1, S[1] - 0.2, S[2] - 0.5], H0 = randQ();
  const fresh = solveArm({ ...base, T: T0, handTarget: H0 });
  for (let i = 0; i < 500; i++) solveArm({ ...base, T: [S[0] + (rnd() - 0.5), S[1] + (rnd() - 0.5), S[2] + (rnd() - 0.5)], handTarget: randQ() });
  const again = solveArm({ ...base, T: T0, handTarget: H0 });
  ok(JSON.stringify(fresh.qU) === JSON.stringify(again.qU) && JSON.stringify(fresh.qF) === JSON.stringify(again.qF) && JSON.stringify(fresh.qH) === JSON.stringify(again.qH), 'same input -> identical bone rotations after 500 other poses (no accumulated twist)');

  // continuity: small hand motion -> small bone change (no flips) along a smooth path
  let maxJump = 0, prev = null;
  for (let i = 0; i <= 600; i++) {
    const t = i / 600 * Math.PI * 4;
    const T = [S[0] + 0.25 * Math.cos(t) * sgn, S[1] - 0.15 + 0.2 * Math.sin(t), S[2] - 0.35 - 0.15 * Math.cos(t * 0.5)];
    const r = solveArm({ ...base, T, handTarget: qAxisAngle([0, 0, 1], t * 0.5) });
    if (prev) for (const k of ['qU', 'qF', 'qH']) { const d = Math.abs(dot4(prev[k], r[k])); maxJump = Math.max(maxJump, 2 * Math.acos(Math.min(1, d))); }
    prev = r;
  }
  ok(maxJump < 0.55, `smooth path incl. a full 360 deg controller spin (extreme): largest per-step bone rotation ${(maxJump * 180 / Math.PI).toFixed(2)} deg`);

  // untracked: w = 0 gives the natural hand, finite
  const nat = solveArm({ ...base, w: 0, T: [S[0], S[1] - 0.55, S[2]], handTarget: null });
  ok(nat.qH.every(Number.isFinite), 'untracked pose is finite');
}
console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nall arm checks passed');
process.exit(fails ? 1 : 0);
