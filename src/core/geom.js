// Pure geometry helpers on axis-aligned boxes {min:[x,y,z], max:[x,y,z]}.
// No imports, so this module is unit-testable in plain Node.

/** a minus b -> array of boxes (new arrays). The part of a inside b is discarded. */
export function subtractBox(a, b, eps = 1e-4) {
  for (let i = 0; i < 3; i++) if (b.max[i] <= a.min[i] + eps || b.min[i] >= a.max[i] - eps) return [a];
  const out = [];
  const cur = { min: a.min.slice(), max: a.max.slice() };
  for (let i = 0; i < 3; i++) {
    if (b.min[i] > cur.min[i] + eps) {
      const p = { min: cur.min.slice(), max: cur.max.slice() }; p.max[i] = b.min[i]; out.push(p); cur.min[i] = b.min[i];
    }
    if (b.max[i] < cur.max[i] - eps) {
      const p = { min: cur.min.slice(), max: cur.max.slice() }; p.min[i] = b.max[i]; out.push(p); cur.max[i] = b.max[i];
    }
  }
  return out;
}

export function boxesOverlap(a, b, eps = 0) {
  for (let i = 0; i < 3; i++) if (a.max[i] <= b.min[i] + eps || a.min[i] >= b.max[i] - eps) return false;
  return true;
}

export function pointInBox(x, y, z, box, eps = 0) {
  return x > box.min[0] + eps && x < box.max[0] - eps &&
         y > box.min[1] + eps && y < box.max[1] - eps &&
         z > box.min[2] + eps && z < box.max[2] - eps;
}

/** Axis-aligned unit normals: index 0..2, sign +-1 -> component helpers. */
export const AXIS_NAMES = ['x', 'y', 'z'];

const _st = { tmin: 0, tmax: 0, axis: -1, sign: 0 };
function axisTest(o, d, mn, mx, i) {
  if (Math.abs(d) < 1e-12) return o >= mn && o <= mx;
  let t1 = (mn - o) / d, t2 = (mx - o) / d, s = -1;
  if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
  if (t1 > _st.tmin) { _st.tmin = t1; _st.axis = i; _st.sign = s; }
  if (t2 < _st.tmax) _st.tmax = t2;
  return _st.tmin <= _st.tmax;
}

/**
 * Ray vs box (slab method). Rays that START INSIDE the box are ignored.
 * out: {t, axis, sign} where (axis, sign) is the normal of the face that was entered.
 */
export function rayBox(ox, oy, oz, dx, dy, dz, box, maxT, out) {
  _st.tmin = -Infinity; _st.tmax = Infinity; _st.axis = -1; _st.sign = 0;
  if (!axisTest(ox, dx, box.min[0], box.max[0], 0)) return false;
  if (!axisTest(oy, dy, box.min[1], box.max[1], 1)) return false;
  if (!axisTest(oz, dz, box.min[2], box.max[2], 2)) return false;
  if (_st.tmin < 0 || _st.tmin > maxT || _st.axis < 0) return false;
  out.t = _st.tmin; out.axis = _st.axis; out.sign = _st.sign;
  return true;
}

const _tmp = { t: 0, axis: 0, sign: 0 };
/**
 * Nearest hit against a list of slabs {min,max,noRay?}. Returns true and fills out
 * {t, axis, sign, slab}. Slabs flagged noRay are skipped.
 */
export function raycastSlabs(slabs, ox, oy, oz, dx, dy, dz, maxT, out) {
  let best = maxT, found = false;
  for (let i = 0; i < slabs.length; i++) {
    const s = slabs[i];
    if (s.noRay) continue;
    if (rayBox(ox, oy, oz, dx, dy, dz, s, best, _tmp)) {
      best = _tmp.t; out.t = _tmp.t; out.axis = _tmp.axis; out.sign = _tmp.sign; out.slab = s; found = true;
    }
  }
  return found;
}

/** Is a point inside any slab (strict, shrunk by eps)? */
export function pointInAnySlab(slabs, x, y, z, eps = 1e-3) {
  for (let i = 0; i < slabs.length; i++) if (!slabs[i].noRay && pointInBox(x, y, z, slabs[i], eps)) return true;
  return false;
}
