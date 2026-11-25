// Level authoring helpers. Pure functions that return slab objects {min, max, surface, tex}.
// Coordinates: meters, +Y up. Spawn yaw 0 faces -Z.  Slab surface: 'portalable' | 'nonportalable' | 'glass'.
import { subtractBox } from '../core/geom.js';

export const P = 'portalable';
export const N = 'nonportalable';
export const G = 'glass';

export function slab(min, max, surface = P, tex) {
  return { min: min.slice(), max: max.slice(), surface, tex };
}

/** Wall perpendicular to `axis` ('x' or 'z'), thickness n0..n1 on that axis, running a0..a1 along the other
 *  horizontal axis, from yBot to yTop, with rectangular openings [{a0,a1,y0,y1}] cut out. */
export function wall(axis, n0, n1, a0, a1, yBot, yTop, openings = [], surface = P, tex) {
  const mk = (p0, p1, y0, y1) => (axis === 'z'
    ? slab([p0, y0, n0], [p1, y1, n1], surface, tex)
    : slab([n0, y0, p0], [n1, y1, p1], surface, tex));
  const ops = openings.slice().sort((p, q) => p.a0 - q.a0);
  const out = [];
  let cur = a0;
  for (const o of ops) {
    if (o.a0 > cur) out.push(mk(cur, o.a0, yBot, yTop));
    if (o.y0 > yBot) out.push(mk(o.a0, o.a1, yBot, o.y0));
    if (yTop > o.y1) out.push(mk(o.a0, o.a1, o.y1, yTop));
    cur = o.a1;
  }
  if (cur < a1) out.push(mk(cur, a1, yBot, yTop));
  return out;
}

/** Rectangular room. Interior is x0..x1, y0..y1, z0..z1; walls are t thick outside it.
 *  Pass {west:false} etc. to omit a wall (then build it yourself), or {west:{surface,tex}} to restyle it. */
export function room(o) {
  const { x0, x1, z0, z1, y0 = 0, y1 = 4, t = 0.5 } = o;
  const pick = (v, def) => (v === false ? null : { ...def, ...(v || {}) });
  const F = pick(o.floor, { surface: N, tex: 'floor_tile' });
  const C = pick(o.ceiling, { surface: N, tex: 'wall_dark' });
  const W = pick(o.west, { surface: P }), E = pick(o.east, { surface: P });
  const NN = pick(o.north, { surface: P }), S = pick(o.south, { surface: P });
  const out = [];
  if (F) out.push(slab([x0 - t, y0 - t, z0 - t], [x1 + t, y0, z1 + t], F.surface, F.tex));
  if (C) out.push(slab([x0 - t, y1, z0 - t], [x1 + t, y1 + t, z1 + t], C.surface, C.tex));
  if (W) out.push(slab([x0 - t, y0, z0 - t], [x0, y1, z1 + t], W.surface, W.tex));
  if (E) out.push(slab([x1, y0, z0 - t], [x1 + t, y1, z1 + t], E.surface, E.tex));
  if (NN) out.push(slab([x0, y0, z0 - t], [x1, y1, z0], NN.surface, NN.tex));
  if (S) out.push(slab([x0, y0, z1], [x1, y1, z1 + t], S.surface, S.tex));
  return out;
}

/** Subtract boxes [{min,max}] from a slab; returns the remaining pieces as slabs (same surface/tex). */
export function carve(s, boxes) {
  let pieces = [{ min: s.min, max: s.max }];
  for (const b of boxes) pieces = pieces.flatMap((p) => subtractBox(p, b));
  return pieces.map((p) => slab(p.min, p.max, s.surface, s.tex));
}
