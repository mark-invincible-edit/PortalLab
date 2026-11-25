// Portal placement: given a ray hit on an axis-aligned slab face, find the closest position where the
// full portal footprint (w x h) lies flat on portalable surface, is not blocked by geometry in front of it,
// stays clear of the other portal, and keeps an edge margin. Pure JS (no three.js) so it can be unit tested.
import { pointInAnySlab } from '../core/geom.js';

export const SURFACE_TYPES = { PORTALABLE: 'portalable', NONPORTALABLE: 'nonportalable', GLASS: 'glass' };

const SAMPLES_R = 5, SAMPLES_U = 9;
let _offsets = null, _offsetsKey = '';

function getOffsets(maxShift, step) {
  const key = maxShift + ':' + step;
  if (_offsets && _offsetsKey === key) return _offsets;
  const list = [];
  const n = Math.round(maxShift / step);
  for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) list.push([a * step, b * step]);
  list.sort((p, q) => (p[0] * p[0] + p[1] * p[1]) - (q[0] * q[0] + q[1] * q[1]));
  _offsets = list; _offsetsKey = key;
  return list;
}

function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

/**
 * @param opts.slabs      all solid slabs {min,max,surface,noRay?}
 * @param opts.hit        {point:[x,y,z], axis, sign, slab}  (normal = sign on axis)
 * @param opts.aim        [x,y,z] shot direction (used to orient floor/ceiling portals)
 * @param opts.w,h        footprint size (m)
 * @param opts.edgeMargin keep-away from surface edges (m)
 * @param opts.other      other portal {axis, sign, c, center:[3], half:[3]} or null
 * @returns {ok:true, center, normal, up, right, axis, sign, ir, iu, half, slab} | {ok:false, reason}
 */
export function findPlacement(opts) {
  const { slabs, hit, aim, w, h, edgeMargin, other } = opts;
  const maxShift = opts.maxShift ?? 0.6, step = opts.step ?? 0.1;
  const slab = hit.slab, axis = hit.axis, sign = hit.sign;
  if (slab.surface !== SURFACE_TYPES.PORTALABLE) return { ok: false, reason: 'surface' };

  const cPlane = sign > 0 ? slab.max[axis] : slab.min[axis];

  // Portal "up": world +Y on walls; on floors/ceilings the horizontal axis the shooter faces (keeps footprints axis-aligned).
  let iu, upSign = 1;
  if (axis === 1) {
    if (Math.abs(aim[0]) >= Math.abs(aim[2])) { iu = 0; upSign = aim[0] >= 0 ? 1 : -1; } else { iu = 2; upSign = aim[2] >= 0 ? 1 : -1; }
  } else { iu = 1; }
  const ir = 3 - axis - iu;

  const normal = [0, 0, 0]; normal[axis] = sign;
  const up = [0, 0, 0]; up[iu] = upSign;
  const right = cross(up, normal);       // (right, up, normal) is right-handed

  const hr = w / 2, hu = h / 2;
  const ex = hr + edgeMargin, eu = hu + edgeMargin;
  const half = [0, 0, 0]; half[ir] = hr; half[iu] = hu;

  const p = [0, 0, 0];
  p[axis] = cPlane;

  const coveredBy = (pr, pu) => {
    for (let i = 0; i < slabs.length; i++) {
      const f = slabs[i];
      if (f.surface !== SURFACE_TYPES.PORTALABLE || f.noRay) continue;
      const face = sign > 0 ? f.max[axis] : f.min[axis];
      if (Math.abs(face - cPlane) > 1e-3) continue;
      if (pr >= f.min[ir] - 1e-4 && pr <= f.max[ir] + 1e-4 && pu >= f.min[iu] - 1e-4 && pu <= f.max[iu] + 1e-4) return true;
    }
    return false;
  };

  const valid = (cr, cu) => {
    if (other && other.axis === axis && other.sign === sign && Math.abs(other.c - cPlane) < 1e-3) {
      if (Math.abs(cr - other.center[ir]) < hr + other.half[ir] + 0.05 &&
          Math.abs(cu - other.center[iu]) < hu + other.half[iu] + 0.05) return false;
    }
    for (let a = 0; a < SAMPLES_R; a++) {
      const pr = cr - ex + (2 * ex) * a / (SAMPLES_R - 1);
      for (let b = 0; b < SAMPLES_U; b++) {
        const pu = cu - eu + (2 * eu) * b / (SAMPLES_U - 1);
        if (!coveredBy(pr, pu)) return false;
        p[ir] = pr; p[iu] = pu;
        if (pointInAnySlab(slabs, p[0] + normal[0] * 0.04, p[1] + normal[1] * 0.04, p[2] + normal[2] * 0.04, 1e-3)) return false;
      }
    }
    return true;
  };

  const cr0 = hit.point[ir], cu0 = hit.point[iu];
  const offs = getOffsets(maxShift, step);
  for (let i = 0; i < offs.length; i++) {
    const cr = cr0 + offs[i][0], cu = cu0 + offs[i][1];
    if (valid(cr, cu)) {
      const center = [0, 0, 0];
      center[axis] = cPlane; center[ir] = cr; center[iu] = cu;
      return { ok: true, center, normal, up, right, axis, sign, ir, iu, half, slab, c: cPlane };
    }
  }
  return { ok: false, reason: 'space' };
}
