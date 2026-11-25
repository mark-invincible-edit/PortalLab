import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (cur, target, lambda, dt) => target + (cur - target) * Math.exp(-lambda * dt);
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOutCubic = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const wrapPi = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
export const dampAngle = (cur, target, lambda, dt) => cur + wrapPi(target - cur) * (1 - Math.exp(-lambda * dt));

export const log = (...a) => console.log('[PortalLab]', ...a);
export const warn = (...a) => console.warn('[PortalLab]', ...a);

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Euler XYZ degrees -> quaternion (setup-time helper, allocates). */
const _eul = new THREE.Euler();
export function quatFromDeg(arr, out = new THREE.Quaternion()) {
  return out.setFromEuler(_eul.set(arr[0] * DEG, arr[1] * DEG, arr[2] * DEG, 'XYZ'));
}

/** Rotate local xz vector by yaw (rotation about +Y). Writes into out {x,z}. */
export function rotYaw(x, z, yaw, out) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  out.x = x * c + z * s;
  out.z = -x * s + z * c;
  return out;
}

/** Bounding box of an object that is safe for SkinnedMesh (uses skinned vertices). */
export function measureObject(root, out = new THREE.Box3()) {
  root.updateMatrixWorld(true);
  out.makeEmpty();
  const b = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.isSkinnedMesh) {
      o.skeleton.update();
      o.boundingBox = null;
      o.computeBoundingBox();
      b.copy(o.boundingBox).applyMatrix4(o.matrixWorld);
    } else {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    }
    out.union(b);
  });
  return out;
}

export function describeTree(root) {
  const lines = [];
  const walk = (o, d) => {
    lines.push(`${'  '.repeat(d)}${o.name || '(unnamed)'} [${o.type}]`);
    for (const c of o.children) walk(c, d + 1);
  };
  walk(root, 0);
  return lines.join('\n');
}

export function setHandCfg(obj, cfg) {
  obj.position.fromArray(cfg.position);
  obj.quaternion.copy(quatFromDeg(cfg.rotation));
}
