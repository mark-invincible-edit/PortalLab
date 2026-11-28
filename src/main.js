// PortalLab entry point: boot, landing page, game flow and the per-frame loop.
//
// FRAME ORDER (matters for correctness, see comments):
//  0. health / death animation state (the rig and avatar fall over about the feet while dying)
//  1. input poll, refresh XR head pose (rig is still where it was last frame)
//  2. player moves (Rapier KCC) and the rig is re-placed; head-crossing teleport is checked
//  3. UI (decides if the trigger press was consumed by a panel), gun actions, carry targets
//  4. cubes: portal crossing, then physics step, then props/level logic (buttons, doors, goo, fizzlers)
//  5. body IK/walk (needs final rig + gun poses), VFX, audio listener, comfort vignette
//  6. re-refresh XR cameras (rig moved), render portal views for each eye, render the frame
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Save } from './core/save.js';
import { Assets } from './core/assets.js';
import { AudioSys } from './core/audio.js';
import { Input } from './core/input.js';
import { createRenderer, enterVR, xrSupported } from './core/renderer.js';
import { Physics } from './physics/physics.js';
import { Player } from './player/player.js';
import { PlayerBody } from './player/body.js';
import { PortalGun } from './player/portalgun.js';
import { PortalManager } from './portals/manager.js';
import { Level } from './world/level.js';
import { VFX } from './vfx/vfx.js';
import { UI } from './ui/ui.js';
import { Lighting } from './core/lighting.js';
import { Health } from './player/health.js';
import { Voice } from './core/voice.js';
import { StoryDirector } from './story/story.js';
import { LOBBY, CHAMBERS } from './levels/index.js';
import { clamp, damp, log, warn } from './core/util.js';

const $ = (id) => document.getElementById(id);
const landing = $('landing'), barFill = $('bar-fill'), statusEl = $('status'), btnVR = $('btn-vr'), btnDesk = $('btn-desktop'), msgEl = $('msg'), errEl = $('error');

function showError(text) { errEl.textContent = text; errEl.hidden = false; statusEl.textContent = 'FAILED'; }
function setProgress(f, label) { barFill.style.width = Math.round(clamp(f, 0, 1) * 100) + '%'; statusEl.textContent = label || ''; }

async function loadFont() {
  const f = CONFIG.font;
  try {
    const face = new FontFace(f.family, `url(${f.file})`);
    await face.load(); document.fonts.add(face);
  } catch (e) { warn(`font ${f.file} not available -> using system monospace`); }
}

// ------------------------------------------------------------------------------------------------ game flow
class Game {
  constructor(G) {
    this.G = G; this.queue = []; this.paused = false; this.started = false;
    this.modeDirty = true; this.completed = false; this.completeTimer = -1; this.expectUnlock = false;
    this.currentData = LOBBY;
    this.levelTime = 0; this.deathBase = 0; this.finalWait = false;
  }

  later(fn) { this.queue.push(fn); }
  runQueue() { while (this.queue.length) this.queue.shift()(); }

  loadLevel(data) {
    const G = this.G;
    if (G.gun && G.gun.held) G.gun.drop(true);
    G.portals.hardReset();
    if (G.level) G.level.dispose();
    this.currentData = data;
    G.level = new Level(G, data);
    G.health.reset(); G.input.stopHaptics();
    G.player.spawn(G.level.checkpoint.pos, G.level.checkpoint.yaw);
    this.completed = false; this.completeTimer = -1; this.finalWait = false; this.levelTime = 0; this.deathBase = G.health.deaths;
    G.story.onLevelStart(data);
    G.ui.hideComplete(); G.ui.wrist.dirty = true; G.ui.hud.dirty = true;
    log(`level loaded: ${data.id}`);
  }

  loadChamber(n) {
    const data = CHAMBERS.find((c) => c.number === n);
    if (!data || n > Save.data.unlocked) return;
    this.later(() => { this.setPaused(false); this.loadLevel(data); if (this.G.input.mode === 'desktop') this.G.input.requestLock(); });
  }
  loadLobby() { this.later(() => { this.setPaused(false); this.loadLevel(LOBBY); }); }
  restart() { this.later(() => { this.setPaused(false); this.loadLevel(this.currentData); }); }
  nextChamber() { const n = this.currentData.number + 1; if (n <= CHAMBERS.length) this.loadChamber(n); }

  completeLevel() {
    const G = this.G, d = this.currentData;
    if (this.completed || !d.number) return;
    this.completed = true;
    const final = d.number === CHAMBERS.length;
    const ex = G.level.exits[0]; if (ex) { const p = new THREE.Vector3(); ex.center(p); G.vfx.completeBurst(p); }
    G.audio.play('level_complete');
    Save.complete(d.number, CHAMBERS.length);
    const best = Save.setBest(d.number, this.levelTime);
    this.completeInfo = { number: d.number, hasNext: d.number < CHAMBERS.length, time: this.levelTime, deaths: G.health.deaths - this.deathBase, best, final };
    G.input.pattern('both', [0.8, 120, 0, 60, 0.5, 200]);
    G.story.onComplete(d);
    // the final chamber waits for HESTIA's goodbye to finish before the completion panel appears
    if (final) this.finalWait = true; else this.completeTimer = 1.4;
  }

  respawnPlayer() {
    const G = this.G, cp = G.level.checkpoint;
    G.player.spawn(cp.pos, cp.yaw);
    G.ui.toast('RESPAWNED');
  }

  /** Put every cube back where it started (stuck cube / dropped through a gap). */
  resetCubes() {
    const G = this.G;
    if (G.gun.held) G.gun.drop(true);
    for (const c of G.level.cubes) { if (!c.dead) G.vfx.smokePuff(c.position, 3); c.respawn(); }
    G.ui.toast('CUBES RESET');
  }

  applyFov() {
    const G = this.G;
    if (G.input.mode === 'xr') return;
    G.camera.fov = CONFIG.render.fov; G.camera.updateProjectionMatrix();
  }

  setPaused(p) {
    const G = this.G;
    if (p === this.paused) return;
    this.paused = p;
    if (p) { G.ui.showPause(); this.releaseCursor(); }
    else { G.ui.hidePause(); G.ui.pause.hoverId = null; if (G.input.mode === 'desktop' && this.started) G.input.requestLock(); }
  }

  releaseCursor() { if (this.G.input.locked) { this.expectUnlock = true; this.G.input.releaseLock(); } }
  quitVR() { const s = this.G.renderer.xr.getSession(); if (s) s.end(); }
}

// ------------------------------------------------------------------------------------------------ boot
async function boot() {
  Save.load();
  if (new URLSearchParams(location.search).get('tune') === '1') CONFIG.debug.tuning = true;

  const R = createRenderer();
  const { renderer, scene, camera, rig, vignette, fade } = R;
  setProgress(0.02, 'LOADING ASSETS');
  const assets = new Assets(renderer);
  await loadFont();
  await assets.loadAll((f, label) => setProgress(0.02 + f * 0.9, label));
  setProgress(0.94, 'STARTING PHYSICS');
  const physics = await Physics.create();
  setProgress(0.97, 'PREPARING AUDIO');
  const audio = new AudioSys(); await audio.init(assets.soundData);

  const G = { renderer, scene, camera, rig, vignette, assets, audio, physics, save: Save, level: null, debug: null, _hit: { t: 0, axis: 0, sign: 0, slab: null } };
  G.lighting = new Lighting(G);
  G.input = new Input(renderer, rig, renderer.domElement);
  G.health = new Health(G);
  G.voice = new Voice(G);
  G.vfx = new VFX(G);
  G.portals = new PortalManager(G);
  G.player = new Player(G);
  G.ui = new UI(G);
  G.gun = new PortalGun(G);
  G.body = new PlayerBody(G);
  G.game = new Game(G);
  G.story = new StoryDirector(G);
  G.portals.hideInViews = [vignette, fade, ...G.ui.screenPanels];
  G.game.applyFov();
  window.PortalLab = G;                                  // handy for console debugging

  if (CONFIG.debug.tuning) {
    const { DebugTuner } = await import('./ui/debug.js');
    G.debug = new DebugTuner(G);
    G.input.onToggleDebug = () => G.debug.toggle();
    warn('DEBUG TUNING ENABLED (backtick on desktop, TUNE button on the wrist panel in VR). Never ship this on.');
  }

  G.game.loadLevel(LOBBY);
  G.gun.init();
  G.body.init();

  G.input.onPointerLockLost = () => {
    const game = G.game;
    if (game.expectUnlock) { game.expectUnlock = false; return; }
    if (game.started && !game.paused && !G.ui.wantsFreeCursor()) game.later(() => game.setPaused(true));
  };

  renderer.xr.addEventListener('sessionstart', () => {
    audio.resume(); G.game.modeDirty = true; landing.hidden = true; G.game.started = true; G.lighting.applyMode(true);
    try { renderer.xr.setFoveation(CONFIG.xr.foveation); } catch (e) { /* optional */ }
    log('XR session started');
  });
  renderer.xr.addEventListener('sessionend', () => {
    camera.fov = CONFIG.render.fov; camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    G.lighting.applyMode(false);
    renderer.setSize(window.innerWidth, window.innerHeight);
    G.game.modeDirty = true; G.game.setPaused(false);
    landing.hidden = false; msgEl.textContent = 'VR SESSION ENDED.'; btnVR.disabled = false;
    log('XR session ended');
  });

  // ---- landing page buttons
  const vrOk = await xrSupported();
  btnVR.disabled = !vrOk;
  msgEl.textContent = vrOk ? '' : 'WEBXR IMMERSIVE-VR IS NOT AVAILABLE HERE. USE QUEST BROWSER (HTTPS), THE IMMERSIVE WEB EMULATOR, OR PLAY ON DESKTOP.';
  btnVR.addEventListener('click', async () => {
    audio.resume(); btnVR.disabled = true;
    try { await enterVR(renderer); } catch (e) { btnVR.disabled = false; msgEl.textContent = 'COULD NOT START VR: ' + (e && e.message ? e.message : e); warn('enterVR failed', e); }
  });
  btnDesk.addEventListener('click', () => {
    audio.resume(); landing.hidden = true; G.game.started = true; G.input.requestLock();
  });
  document.querySelectorAll('.loading-only').forEach((el) => { el.hidden = true; });
  document.querySelectorAll('.ready-only').forEach((el) => { el.hidden = false; });
  setProgress(1, 'READY');
  window.__portallabBooted = true;

  // ------------------------------------------------------------------------------------------ frame loop
  const clock = new THREE.Clock();
  let vig = 0;

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const game = G.game, input = G.input, player = G.player, ui = G.ui, gun = G.gun, portals = G.portals;
    game.runQueue();
    input.update();
    G.health.update(dt);
    const xr = input.mode === 'xr';
    if (xr) renderer.xr.updateCamera(camera);

    // one-time sync when switching between desktop and XR so room-scale offsets don't register as movement
    if (game.modeDirty) {
      player.readHeadLocal();
      player.lastLocalX = player.localHead.x; player.lastLocalZ = player.localHead.z;
      player.place(); player.prevHead.copy(player.head);
      game.modeDirty = false;
    }

    // pause toggle
    if (input.pause && game.started) game.setPaused(!game.paused);
    const paused = game.paused;

    // 2. player
    const dead = G.health.dead;
    player.update(dt, paused || !game.started || dead);
    portals.teleportPlayer(player);

    // 3. ui + actions
    ui.update(dt);
    if (!paused && game.started && !dead) {
      if (input.hint) G.story.hint();
      if (input.resetCube) game.resetCubes();
      if (!xr && !input.locked && input.click && !ui.consumed && !ui.wantsFreeCursor()) input.requestLock();
      if (!ui.consumed) { if (input.fireBlue) gun.fire(0); if (input.fireOrange) gun.fire(1); }
      if (input.use) gun.use();
      if (input.clear && portals.clearAll()) ui.toast('PORTALS CLEARED');
    }
    gun.update(dt);

    // 4. simulation
    if (!paused) {
      portals.teleportCubes(G.level.cubes);
      player.commit();
      physics.step(dt);
      G.level.update(dt);
      if (game.started && !dead) game.levelTime += dt;
      if (game.finalWait && !G.story.cur && !G.story.queue.length) { game.finalWait = false; game.completeTimer = 1.0; }
      if (game.completeTimer > 0) {
        game.completeTimer -= dt;
        if (game.completeTimer <= 0) { ui.showComplete(game.completeInfo); game.releaseCursor(); }
      }
    }
    G.voice.update(dt); G.story.update(dt);
    portals.update(dt);

    // 5. visuals that depend on final poses
    G.body.update(dt);
    G.lighting.update(dt);
    G.vfx.update(dt); G.vfx.updateMainViewHeight();
    {
      const e = camera.matrixWorld.elements;
      audio.setListener(e[12], e[13], e[14], -e[8], -e[9], -e[10], e[4], e[5], e[6]);
    }
    const moveAmt = clamp(player.speedH / CONFIG.player.walkSpeed, 0, 1) * (player.grounded ? 1 : 0.6);
    const vigT = CONFIG.comfort.vignette && xr ? CONFIG.comfort.vignetteStrength * clamp(moveAmt + player.turnRate * 0.8, 0, 1) : 0;
    vig = damp(vig, vigT, vigT > vig ? 10 : 4, dt);
    vignette.visible = vig > 0.01; vignette.material.uniforms.uS.value = vig;
    { const o = G.health.overlay; fade.visible = o.a > 0.003; fade.material.uniforms.uC.value.set(o.r, o.g, o.b, o.a); }

    // 6. render
    player.place();                                              // refresh rig/camera world matrices after all moves
    if (xr) renderer.xr.updateCamera(camera);
    renderer.shadowMap.needsUpdate = true;                       // shadow map is rendered once, by the first render call of this frame
    portals.renderViews();
    renderer.render(scene, camera);
  });
}

window.addEventListener('error', (e) => {
  if (e.target && (e.target.src || e.target.href) && e.target !== window) showError(`Failed to load required file: ${e.target.src || e.target.href}`);
}, true);
window.addEventListener('unhandledrejection', (e) => showError('Startup error: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)));

boot().catch((e) => { console.error(e); showError(e && e.message ? e.message : String(e)); });
