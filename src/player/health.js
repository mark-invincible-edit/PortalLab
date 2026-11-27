// Health: hit points, damage feedback, regeneration and the death sequence.
//
// FEEDBACK WHEN HURT: controller vibration on both hands (two-pulse pattern scaled by the damage), red screen flash, hurt sound,
// desktop camera kick, a heartbeat + red screen edge while low on health.
//
// DEATH ('topple' = damage): the player falls over like a tree about their feet. The SAME rotation is applied to the camera rig and to the
// avatar root (see applyToObject), so the view falls with the body and ends up lying on the floor; the knees buckle (body.collapse),
// the screen fades to black, then the player respawns at the checkpoint and the screen fades back in.
//   'sink' = goo (slowly sinking, quick fade), 'void' = fell out of the world (fast fade, no topple).
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp } from '../core/util.js';

const _q = new THREE.Quaternion(), _p = new THREE.Vector3();
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

export class Health {
  constructor(G) {
    this.G = G;
    this.hp = CONFIG.health.max; this.dead = false; this.deathT = 0; this.style = 'topple';
    this.time = 0; this.lastHit = -99;
    this.hitFlash = 0; this.black = 0; this.respawnT = 0; this.lowT = 0;
    this.fallAngle = 0; this.fallAxis = new THREE.Vector3(1, 0, 0); this.sinkY = 0; this.collapse = 0;
    this.kickPitch = 0; this.kickRoll = 0;                 // desktop camera kick (decays)
    this.overlay = { r: 0, g: 0, b: 0, a: 0 };
    this.deaths = 0;
  }

  get max() { return CONFIG.health.max; }
  get fraction() { return clamp(this.hp / this.max, 0, 1); }
  get fxActive() { return this.fallAngle !== 0 || this.sinkY !== 0; }

  reset() {
    this.hp = this.max; this.dead = false; this.deathT = 0; this.fallAngle = 0; this.sinkY = 0; this.collapse = 0;
    this.hitFlash = 0; this.black = 0; this.respawnT = 0; this.kickPitch = 0; this.kickRoll = 0; this.lastHit = -99;
  }

  /** Apply damage. kind: 'fall' | 'sentry' | 'goo' | 'void' ... srcPos (optional THREE.Vector3) is only used for the camera kick. */
  damage(amount, kind = 'generic', srcPos = null) {
    if (this.dead || amount <= 0) return;
    const G = this.G;
    this.hp = Math.max(0, this.hp - amount);
    this.lastHit = this.time;
    this.hitFlash = Math.min(1, 0.5 + amount / 40);
    G.audio.play('player_hurt', { vol: clamp(0.5 + amount / 40, 0.5, 1) });
    // feel it: both controllers, strong double pulse
    const k = clamp(0.55 + amount / 35, 0.55, 1);
    G.input.pattern('both', [k, 110, 0, 45, k * 0.65, 150]);
    // desktop kick (and VR only if the player opted in)
    if (G.input.mode !== 'xr' || CONFIG.effects.vrDamageShake) {
      let side = Math.random() < 0.5 ? -1 : 1;
      if (srcPos) { const dx = srcPos.x - G.player.head.x, dz = srcPos.z - G.player.head.z; side = Math.sign(Math.sin(G.player.headYaw) * dz - Math.cos(G.player.headYaw) * dx) || side; }
      this.kickPitch = 0.06 + amount * 0.0016; this.kickRoll = side * (0.04 + amount * 0.001);
    }
    if (this.hp <= 0) this._die(kind);
  }

  /** Instant death (goo, falling out of the level). */
  kill(kind) {
    if (this.dead) return;
    this.hp = 0; this.hitFlash = 1;
    this._die(kind);
  }

  _die(kind) {
    const G = this.G;
    this.dead = true; this.deathT = 0; this.deaths++;
    this.style = kind === 'goo' ? 'sink' : kind === 'void' ? 'void' : 'topple';
    if (G.gun && G.gun.held) G.gun.drop(true);
    G.input.stopHaptics();
    G.audio.play('player_death');
    if (this.style === 'topple') {
      G.input.pattern('both', [1, 420, 0, 80, 0.55, 380, 0.25, 300]);
      this._pickFallDirection();
    } else G.input.pattern('both', [0.8, 250, 0, 60, 0.4, 250]);
    if (G.story) G.story.onDeath(kind);
    if (G.save) { G.save.data.deaths = (G.save.data.deaths | 0) + 1; }
  }

  /** Fall away from the nearest wall so the camera does not end up inside geometry; backwards is preferred. */
  _pickFallDirection() {
    const G = this.G, pl = G.player, yaw = pl.headYaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const dirs = [[-fx, -fz, 1.0], [fz, -fx, 0.9], [-fz, fx, 0.9], [fx, fz, 0.6]];   // back, left, right, forward (with preference weights)
    let best = dirs[0], bestScore = -1;
    for (const d of dirs) {
      let clear = 2.2;
      if (G.level.raycast(pl.cap.x, pl.cap.y + 0.5, pl.cap.z, d[0], 0, d[1], 2.2, G._hit)) clear = G._hit.t;
      const score = Math.min(clear, 2.0) * d[2];
      if (score > bestScore) { bestScore = score; best = d; }
    }
    // axis = up x dir  (rotating the up vector toward dir)
    this.fallAxis.set(best[1], 0, -best[0]).normalize();
  }

  update(dt) {
    const H = CONFIG.health, G = this.G;
    this.time += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.4);
    this.kickPitch *= Math.exp(-9 * dt); this.kickRoll *= Math.exp(-7 * dt);

    if (!this.dead) {
      if (this.hp < this.max && this.time - this.lastHit > H.regenDelay) this.hp = Math.min(this.max, this.hp + H.regenRate * dt);
      if (this.hp > 0 && this.hp < H.lowHp) {
        this.lowT -= dt;
        if (this.lowT <= 0) { this.lowT = 0.95; G.audio.play('heartbeat', { vol: 0.5 + 0.5 * (1 - this.hp / H.lowHp) }); }
      } else this.lowT = 0;
    } else {
      this.deathT += dt;
      const t = this.deathT;
      const total = this.style === 'topple' ? H.deathTime : this.style === 'sink' ? 1.5 : 0.9;
      if (this.style === 'topple') {
        const p = clamp(t / H.toppleTime, 0, 1), A = Math.PI / 2 * 0.96;
        // accelerating fall (gravity), then a small damped bounce when the body hits the floor
        this.fallAngle = p < 1 ? A * p * p : A * (1 - 0.045 * Math.exp(-9 * (t - H.toppleTime)) * Math.abs(Math.cos(15 * (t - H.toppleTime))));
        this.collapse = clamp(t / 0.55, 0, 1);
        this.black = smooth((t - H.fadeStart) / (H.fadeEnd - H.fadeStart));
      } else if (this.style === 'sink') {
        this.sinkY = 0.95 * smooth(t / 1.2); this.black = smooth((t - 0.35) / 0.85);
      } else this.black = smooth((t - 0.1) / 0.55);
      if (t >= total) this._respawn();
    }
    if (this.respawnT > 0 && !this.dead) { this.respawnT = Math.max(0, this.respawnT - dt); this.black = this.respawnT / H.respawnFade; }

    // screen overlay: red (hit flash + low health edge pulse) blended into black (death / respawn fade)
    const low = this.hp > 0 && this.hp < H.lowHp && !this.dead ? (1 - this.hp / H.lowHp) * (0.18 + 0.1 * Math.sin(this.time * 6.5)) : 0;
    const red = Math.min(0.6, this.hitFlash * 0.5 + low);
    const o = this.overlay, b = this.black;
    o.r = 0.55 * (1 - b); o.g = 0; o.b = 0.02 * (1 - b);
    o.a = Math.max(red * (1 - b), b);
  }

  _respawn() {
    const G = this.G, H = CONFIG.health;
    this.dead = false; this.deathT = 0; this.fallAngle = 0; this.sinkY = 0; this.collapse = 0;
    this.hp = this.max; this.lastHit = this.time; this.hitFlash = 0;
    this.black = 1; this.respawnT = H.respawnFade;
    G.game.respawnPlayer();
    G.input.stopHaptics();
  }

  /** Rotate / sink an object (the camera rig or the avatar root) about the player's feet. Call AFTER its normal pose was written. */
  applyToObject(o, feet) {
    if (this.fallAngle !== 0) {
      _q.setFromAxisAngle(this.fallAxis, this.fallAngle);
      o.quaternion.premultiply(_q);
      _p.copy(o.position).sub(feet).applyQuaternion(_q).add(feet);
      o.position.copy(_p);
    }
    if (this.sinkY) o.position.y -= this.sinkY;
  }
}
