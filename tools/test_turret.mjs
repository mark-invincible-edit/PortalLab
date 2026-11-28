// Dev tool: node tools/test_turret.mjs
// Runs the REAL src/world/turret.js against a tiny stand-in for three.js (tools/three_stub.mjs: real Vector3 math, no-op scene graph, a fake
// AnimationMixer that finishes LoopOnce clips) and checks the state machine, clip sequencing, muzzle detection, shooting and damage.
// It cannot check how anything LOOKS; it checks that the logic does what the comments in turret.js say.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url)), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'portallab_turret_'));
const stub = pathToFileURL(path.join(here, 'three_stub.mjs')).href;
(function copy(src, dst) {                                   // copy src/ with 'three' imports pointed at the stub
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) copy(s, d);
    else if (f.endsWith('.js')) fs.writeFileSync(d, fs.readFileSync(s, 'utf8').replace(/from 'three\/addons\/[^']*'/g, `from '${stub}'`).replace(/from 'three'/g, `from '${stub}'`));
  }
})(path.join(here, '..', 'src'), path.join(tmp, 'src'));
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
const { Turret } = await import(pathToFileURL(path.join(tmp, 'src/world/turret.js')).href);
const { Group, Mesh, CylinderGeometry, Object3D } = await import(stub);

let dmg = 0, fired = 0, fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const names = ['idle', 'deploy', 'idlealert', 'fire', 'retract'], dur = { idle: 2, deploy: 1.0, idlealert: 2, fire: 0.5, retract: 0.8 };
// a fake model: a mesh plus two bones named like gun ends
const scene = new Group(); scene.add(new Mesh(new CylinderGeometry(), {}));
const mL = new Object3D(); mL.name = 'Turret_01_muzzle_L'; mL.position.set(-0.1, 0.9, 0.3);
const mR = new Object3D(); mR.name = 'Turret_01_muzzle_R'; mR.position.set(0.1, 0.9, 0.3); scene.add(mL, mR);
const G = {
  assets: { models: { turret: { scene, animations: names.map((n) => ({ name: 'Turret_01_reference_skeleton | ' + n, duration: dur[n] })) } }, tex: () => ({}) },
  envMap: null, scene: new Group(),
  audio: { play: (k) => { if (k === 'sentry_fire') fired++; } },
  vfx: { sparks() {}, flash() {}, scorch() {}, smokePuff() {} }, lighting: { flash() {} },
  player: { cap: { x: 0, y: 0, z: 5 } }, health: { dead: false, damage: (a) => { dmg += a; } },
  level: { raycast: () => false, solids: [], cubes: [] },
};
const t = new Turret(G, G.level, { pos: [0, 0, 0], yaw: 180 });          // faces +Z; the player starts 5 m in front of it
const clipOf = () => t.cur && t.cur.clip.name.split('|').pop().trim();
const seq = []; let last = '';
const step = (secs, label) => { for (let i = 0; i < Math.round(secs * 60); i++) { t.update(1 / 60); const s = t.state + ':' + clipOf(); if (s !== last) { seq.push(`${s}  (${label})`); last = s; } } };

ok(t.muzzles.length === 2 && t.muzzles.every((m) => /muzzle/i.test(m.name)), `muzzle nodes found by name (${t.muzzles.map((m) => m.name).join(', ')})`);
ok(Object.keys(t.actions).sort().join() === 'deploy,fire,idle,idlealert,retract', 'all five clips matched by the text after "|" (idle is not confused with idlealert)');
step(0.7, 'player visible');
ok(t.state === 'deploying' && clipOf() === 'deploy', 'notices the player -> deploy clip');
step(0.45, 'deploy ends');
ok(t.state === 'alert' && clipOf() === 'idlealert', 'deploy finished -> idlealert loop');
step(0.7, 'aim time');
ok(t.state === 'firing' && clipOf() === 'fire', 'after the aim time -> fire loop');
const f0 = fired; step(2.0, 'shooting');
ok(fired - f0 >= 10 && fired - f0 <= 14, `fires about 6 bullets per second (${fired - f0} in 2 s)`);
ok(dmg > 0 && dmg < 100, `bullets hit a player standing still, a few seconds are survivable (${dmg} damage)`);
ok(t.bullets.some((b) => b.on), 'bullets are in flight');
G.player.cap.z = -6;                                                        // player is now behind the turret: out of its cone
step(0.4, 'sight lost'); ok(t.state === 'firing', 'still firing inside the grace period');
step(0.5, 'grace over'); ok(t.state === 'alert' && clipOf() === 'idlealert', 'lost sight -> back to idlealert');
step(2.4, 'nobody around'); ok(t.state === 'retracting' && clipOf() === 'retract', 'nobody for a while -> retract clip');
step(0.5, 'retracting'); G.player.cap.z = 5; step(0.15, 'player back');
ok(t.state === 'deploying' && clipOf() === 'deploy', 'player returns during retract -> deploys again');
G.player.cap.z = -6; step(5.5, 'player gone');
ok(t.state === 'idle' && clipOf() === 'idle', 'retract finished -> idle loop');
ok(Math.abs(t.curYaw) < 0.05, 'turret turned back to its mounting direction');
G.health.dead = true; G.player.cap.z = 5; step(0.5, 'player dead'); ok(t.state === 'idle', 'does nothing while the player is dead');
// ---- no turret.glb: the built-in post turret must still run the same state machine (timers instead of clips)
{
  const G2 = { ...G, assets: { models: { turret: null }, tex: () => ({}) } };
  const f = new Turret(G2, G2.level, { pos: [0, 0, 0], yaw: 180 });
  G.health.dead = false; G.player.cap.z = 5; const seen = new Set();
  for (let i = 0; i < 60 * 3; i++) { f.update(1 / 60); seen.add(f.state); }
  ok(['deploying', 'alert', 'firing'].every((s) => seen.has(s)) && f.muzzles.length === 2, 'fallback turret (no model): deploys, aims and fires with its own barrels');
  G.player.cap.z = -6; for (let i = 0; i < 60 * 6; i++) f.update(1 / 60);
  ok(f.state === 'idle', 'fallback turret retracts to idle');
}
console.log('\nstate / clip sequence:\n  ' + seq.join('\n  '));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `\n${fails} FAILED` : '\nall turret checks passed'); process.exit(fails ? 1 : 0);
