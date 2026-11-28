// Dev tool (not loaded by the game): node tools/validate_levels.mjs
// Checks level geometry sanity and replays the intended solution shots through the real raycast + placement code.
import { LEVELS, getLevel } from '../src/levels/index.js';
import { raycastSlabs, pointInAnySlab, boxesOverlap } from '../src/core/geom.js';
import { findPlacement } from '../src/portals/placement.js';

let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ok   ' : '  FAIL ') + msg); if (!c) fails++; };

function shoot(level, from, to, other = null) {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(...d); d[0] /= len; d[1] /= len; d[2] /= len;
  const hit = {}; 
  if (!raycastSlabs(level.slabs, from[0], from[1], from[2], d[0], d[1], d[2], 200, hit)) return { reason: 'miss' };
  const p = [from[0] + d[0] * hit.t, from[1] + d[1] * hit.t, from[2] + d[2] * hit.t];
  const pl = findPlacement({ slabs: level.slabs, hit: { point: p, axis: hit.axis, sign: hit.sign, slab: hit.slab }, aim: d, w: 1, h: 2, edgeMargin: 0.02, other });
  return { ...pl, hitPoint: p, surface: hit.slab.surface };
}
const asOther = (pl) => ({ axis: pl.axis, sign: pl.sign, c: pl.c, center: pl.center, half: pl.half });

for (const lv of LEVELS) {
  console.log(`\n== ${lv.id} ${lv.title} ${lv.sub || ''}`);
  for (const s of lv.slabs) for (let i = 0; i < 3; i++) if (!(s.min[i] < s.max[i])) { ok(false, `degenerate slab ${JSON.stringify(s)}`); }
  let overlaps = 0;
  for (let i = 0; i < lv.slabs.length; i++) for (let j = i + 1; j < lv.slabs.length; j++) if (boxesOverlap(lv.slabs[i], lv.slabs[j], 1e-4)) { overlaps++; console.log('   overlap', i, j); }
  ok(overlaps === 0, `no overlapping slabs (${overlaps})`);
  const sp = lv.spawn.pos;
  ok(!pointInAnySlab(lv.slabs, sp[0], sp[1] + 0.9, sp[2]), 'spawn capsule center is in free space');
  for (const p of lv.props) if (p.type === 'cube') ok(!pointInAnySlab(lv.slabs, ...p.pos), 'cube start free');
  const floorUnder = (x, y, z) => { const h = {}; return raycastSlabs(lv.slabs, x, y + 0.5, z, 0, -1, 0, 30, h) ? y + 0.5 - h.t : null; };
  for (const p of lv.props) if (p.type === 'button' || p.type === 'cube') {
    const f = floorUnder(p.pos[0], p.type === 'cube' ? p.pos[1] - 0.31 : p.pos[1], p.pos[2]);
    ok(f !== null && Math.abs(f - (p.type === 'cube' ? p.pos[1] - 0.31 : p.pos[1])) < 0.02, `${p.type} ${p.id || ''} stands on a floor (top ${f && f.toFixed(2)})`);
  }
  for (const p of lv.props) if (p.type === 'robot') {
    ok(!pointInAnySlab(lv.slabs, ...p.pos) && p.ceiling >= p.pos[1], `robot head is in free space, cable anchor above it`);
  }
  for (const p of lv.props) if (p.type === 'turret') {
    const yaw = (p.yaw || 0) * Math.PI / 180, f = [-Math.sin(yaw), 0, -Math.cos(yaw)], h = {};
    ok(!pointInAnySlab(lv.slabs, p.pos[0], p.pos[1] + 0.5, p.pos[2]) && !pointInAnySlab(lv.slabs, p.pos[0], p.pos[1] + 1.1, p.pos[2]), 'turret stands in free space');
    const fl = floorUnder(p.pos[0], p.pos[1], p.pos[2]);
    ok(fl !== null && Math.abs(fl - p.pos[1]) < 0.02, `turret stands on a floor (top ${fl && fl.toFixed(2)})`);
    ok(!raycastSlabs(lv.slabs, p.pos[0], p.pos[1] + 0.8, p.pos[2], f[0], 0, f[2], 3, h), 'turret has 3 m of open space in front (at gun height)');
    ok(raycastSlabs(lv.slabs, p.pos[0], p.pos[1] + 0.8, p.pos[2], -f[0], 0, -f[2], 0.7, h), 'turret stands close to a wall behind it (within 0.7 m)');
  }
  for (const l of lv.lights || []) ok(!pointInAnySlab(lv.slabs, ...l.pos), `light at ${l.pos} is in free space`);
  for (const l of lv.links) ok(lv.props.some((p) => p.id === l.button && p.type === 'button') && lv.props.some((p) => p.id === l.door && p.type === 'door'), `link ${l.button} -> ${l.door} refers to existing props`);
  for (const p of lv.props) if (p.type === 'door') {
    const d = { min: p.min, max: p.max };
    ok(!lv.slabs.some((s) => boxesOverlap(s, d, 1e-4)), `door ${p.id} sits in an opening`);
  }
}

console.log('\n== solution replays');
{ // c01
  const lv = getLevel('c01');
  const a = shoot(lv, [-2, 1.62, -6.5], [-2, 1.5, -9.5]);
  ok(a.ok, 'c01 blue on partition near face (left slab)');
  const b = shoot(lv, [0, 1.62, -6.5], [0, 1.5, -17], a.ok ? asOther(a) : null);
  ok(b.ok, 'c01 orange through aperture onto far wall');
  const c = shoot(lv, [0, 1.62, 1.5], [-3, 1.5, 0]);
  ok(c.surface === 'nonportalable' && !c.ok, 'c01 spawn zone wall rejects portals');
  const d = shoot(lv, [0, 1.62, 1.5], [0, 1.5, -9.7]);
  ok(d.surface === 'portalable' && d.ok, 'c01 can aim over the barrier at M (first portal ok, no second portal possible in S)');
  const e = shoot(lv, [0, 1.62, -6.5], [0, 0.3, -9.5]);
  ok(!e.ok, 'c01 partition below aperture is too short for a portal');
}
{ // c02
  const lv = getLevel('c02');
  const a = shoot(lv, [0, 1.62, 3], [-4.5, 1.5, 1]);
  ok(a.ok, 'c02 blue on near west wall');
  const b = shoot(lv, [-2, 1.62, 1], [-4.5, 3.5, -13], a.ok ? asOther(a) : null);
  ok(b.ok && b.center[1] >= 2.2 + 0.0, `c02 orange above ledge (center y=${b.center && b.center[1].toFixed(2)})`);
}
{ // c03
  const lv = getLevel('c03');
  const b = shoot(lv, [-1, 1.62, -6], [4, 1.5, -6]);
  ok(b.ok && b.hitPoint[0] > 3.9, 'c03 orange through cell aperture onto cell east wall');
  const a = shoot(lv, [-2, 1.62, 0], [-4, 1.5, -2], b.ok ? asOther(b) : null);
  ok(a.ok, 'c03 blue on west wall');
  const w = shoot(lv, [-1, 1.62, -6], [2, 0.5, -6]);
  ok(!w.ok, 'c03 cell partition below aperture rejects (too short)');
}
{ // c04
  const lv = getLevel('c04');
  const edge = [-0.8, 9.62, 2];
  const blue = shoot(lv, edge, [2, 0, 2]);
  ok(blue.ok && blue.axis === 1, 'c04 blue on floor patch');
  const orange = shoot(lv, edge, [1.5, 5, 4], blue.ok ? asOther(blue) : null);
  ok(orange.ok, `c04 orange on upper back wall (center y=${orange.center && orange.center[1].toFixed(2)})`);
  const bad = shoot(lv, edge, [1.5, 1.5, 4]);
  ok(bad.surface === 'nonportalable', 'c04 lower back wall rejects');
  const floorBad = shoot(lv, edge, [4.8, 0, 2]);
  ok(!floorBad.ok, 'c04 floor outside the patch rejects');
  // fling: free fall from the platform edge into the floor portal, exit through a wall portal at height cy
  const g = 14, drop = 8 + 1.6;
  const v = Math.sqrt(2 * g * drop);
  for (const cy of [orange.ok ? orange.center[1] : 4, 4.02]) {
    const feetY = cy - 1.62; const t = Math.sqrt(2 * Math.max(feetY, 0) / g);
    const landZ = 4 - v * t;
    ok(landZ < -4.2 && landZ > -16, `c04 fling lands z=${landZ.toFixed(1)} on far platform (portal center y=${cy.toFixed(2)}, v=${v.toFixed(1)} m/s)`);
  }
}
{ // c05
  const lv = getLevel('c05');
  const a = shoot(lv, [0, 1.62, 3], [-4.5, 1.5, 1]);
  ok(a.ok, 'c05 blue on near west wall');
  const b = shoot(lv, [-2, 1.62, 2.5], [-4.5, 1.5, -11], a.ok ? asOther(a) : null);
  ok(b.ok && b.hitPoint[2] < -9, 'c05 orange across pit/fizzler onto far west wall');
}

{ // c06
  const lv = getLevel('c06');
  const a = shoot(lv, [0, 1.62, 1.5], [-4, 1.5, -12]);
  ok(a.ok && a.surface === 'portalable', 'c06 blue far down the hall west wall (from the safe start zone, through the doorway)');
  const b = shoot(lv, [0, 1.62, 1.5], [-4, 1.5, -15.5], a.ok ? asOther(a) : null);
  ok(b.ok, 'c06 orange beside the button');
  const near = shoot(lv, [0, 1.62, 1.5], [-4, 1.5, -6]);
  ok(!near.ok, 'c06 the near part of the wall is hidden by the doorway pillars from the spawn (step into the doorway to use it)');
  const door = shoot(lv, [-1, 1.62, -3.2], [-4, 1.5, -6]);
  ok(door.ok, 'c06 from inside the doorway the near wall is reachable');
  const c = shoot(lv, [0, 1.62, 1.5], [-4, 1.5, 0]);
  ok(!c.ok, 'c06 start zone wall rejects portals');
}
{ // c07
  const lv = getLevel('c07');
  const b = shoot(lv, [0, 1.62, 3], [-4.5, 1.5, 1]);
  ok(b.ok, 'c07 blue on near west wall');
  const o = shoot(lv, [-2, 1.62, 2.5], [-4.5, 1.5, -11], b.ok ? asOther(b) : null);
  ok(o.ok && o.hitPoint[2] < -9, 'c07 orange onto the far west wall');
  ok(lv.links.filter((l) => l.door === 'd1').length === 2, 'c07 door needs both buttons');
}
{ // c08: same fling model as c04, bigger numbers
  const lv = getLevel('c08');
  const edge = [-0.6, 15.62, 2];
  const blue = shoot(lv, edge, [2, 0, 2]);
  ok(blue.ok && blue.axis === 1, 'c08 blue on floor patch (from the platform edge, clearing the platform corner)');
  const orange = shoot(lv, edge, [1.5, 6.5, 4], blue.ok ? asOther(blue) : null);
  ok(orange.ok, `c08 orange on upper back wall (center y=${orange.center && orange.center[1].toFixed(2)})`);
  const low = shoot(lv, edge, [1.5, 2, 4]);
  ok(low.surface === 'nonportalable', 'c08 lower back wall rejects');
  const g = 14, drop = 14 + 1.62, v = Math.min(Math.sqrt(2 * g * drop), 32);
  // lowest possible portal: bottom of the portalable region (3.5) + 1 m half height + margin
  const cys = [orange.ok ? orange.center[1] : 6.5, 4.52, 4.54, 8, 12];
  for (const cy of cys) {
    const feetY = cy - 1.62, t = Math.sqrt(2 * Math.max(feetY, 0) / g), landZ = 4 - v * t, vy = g * t;
    ok(landZ < -8.5 && landZ > -24.5, `c08 fling lands z=${landZ.toFixed(1)} on the far platform (portal y=${cy.toFixed(2)}, v=${v.toFixed(1)} m/s, landing vy=${vy.toFixed(1)})`);
  }
  const floorOnly = [0.5, 3.5].every((x) => { const r = shoot(lv, edge, [x, 0, 2]); return r.ok; });
  ok(floorOnly, 'c08 the patch is reachable from the edge');
  ok(Math.sqrt(2 * g * (14 + 1.62)) > 18, 'c08 a plain fall off the platform is a hard landing (health system punishes missing the patch)');
}
{ // c09
  const lv = getLevel('c09');
  const a = shoot(lv, [0, 1.62, 1.5], [-4, 1.5, -2]);
  ok(a.ok, 'c09 blue before the grid');
  const b = shoot(lv, [0, 1.62, 1.5], [-4, 1.5, -14], a.ok ? asOther(a) : null);
  ok(b.ok && b.hitPoint[2] < -9.6, 'c09 orange behind the grid, shot through it');
  const s = lv.props.filter((p) => p.type === 'turret');
  ok(s.every((p) => Math.hypot(p.pos[0] - 0, p.pos[2] - 1.5) > (p.range || 16)), 'c09 turrets cannot see the spawn point');
}
{ // c10
  const lv = getLevel('c10');
  const a = shoot(lv, [0, 1.62, 3], [-4.5, 1.5, 1]);
  ok(a.ok, 'c10 blue on near west wall');
  const b = shoot(lv, [-2, 1.62, 1], [-4.5, 3.6, -13], a.ok ? asOther(a) : null);
  ok(b.ok && b.center[1] >= 2.2 + 1 - 0.01, `c10 orange above the ledge (center y=${b.center && b.center[1].toFixed(2)})`);
  const lowWall = shoot(lv, [-2, 1.62, 1], [-4.5, 1.0, -13]);
  ok(!lowWall.ok, 'c10 cannot put a portal into the ledge block');
}
{ // story data covers every chamber
  const { STORY } = await import('../src/story/story.js');
  for (const lv of LEVELS) if (lv.id !== 'lobby') ok(STORY.levels[lv.id] && STORY.levels[lv.id].start.length && STORY.levels[lv.id].done.length && STORY.hints[lv.id], `story: ${lv.id} has start / done lines and hints`);
}
console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nall level checks passed');
process.exit(fails ? 1 : 0);
