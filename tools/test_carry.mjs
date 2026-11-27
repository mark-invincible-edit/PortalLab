// Dev tool: node tools/test_carry.mjs  - the held-cube chase target selection (src/core/geom.js pickCarryCandidate)
import { pickCarryCandidate } from '../src/core/geom.js';
let fails = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
// Portal A at (0,1,0) on a wall, portal B 30 m away. Player holds the cube 1.25 m in front, aiming through A.
const real = [30, 1, -4.5];              // where the cube "should" be: in front of B (real target, other room)
const imgA = [0, 1, 0.75];               // the same target seen from A's side (just behind A's plane, inside the hole)
const imgB = [-40, 1, 9];                // garbage image under the other transform
const cands = [real, imgA, imgB];
ok(pickCarryCandidate([0, 1, 1.4], cands, -1) === 1, 'cube still in front of portal A chases the near image (flies into the portal, not through walls to the far room)');
ok(pickCarryCandidate([30.2, 1, -4.0], cands, 1) === 0, 'after it crossed (teleported next to B) it chases the real target');
// hysteresis: two candidates almost equally far must not flip-flop
const c2 = [[0, 0, 1.0], [0, 0, -1.0]];
ok(pickCarryCandidate([0, 0, 0.05], c2, 1) === 1 && pickCarryCandidate([0, 0, -0.05], c2, 0) === 0, 'sticks with the previous choice inside the hysteresis band');
ok(pickCarryCandidate([0, 0, 0.9], [[0, 0, 1], [0, 0, 6]], 1) === 0, 'switches when the other candidate is clearly closer');
ok(pickCarryCandidate([0, 0, 0], [[1, 0, 0]], 2) === 0, 'stale previous index (portals closed) is ignored');
console.log(fails ? `\n${fails} FAILED` : '\nall carry checks passed'); process.exit(fails ? 1 : 0);
