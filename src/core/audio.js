// WebAudio mixer: master -> {sfx, amb} buses. Positional sounds use PannerNode (HRTF).
// Any sound whose mp3 is missing/undecodable is replaced by a small procedural WebAudio-synthesized buffer
// (with a console warning), so the game is fully audible before the real files exist.
import { CONFIG } from '../config.js';
import { warn } from './util.js';

// Synth recipes. tones: {f0,f1,wave,vol,dec,att?}; noise: {vol, lp (0..1 one-pole coeff), dec}; seq: notes [freq,start,len]
// loop recipes use `hum` partials with integer cycle counts so the buffer loops seamlessly.
const SYNTH = {
  portal_open_blue:   { dur: 0.5,  tones: [{ f0: 420, f1: 980, vol: 0.5, dec: 0.22 }, { f0: 840, f1: 1700, vol: 0.2, dec: 0.15 }] },
  portal_open_orange: { dur: 0.5,  tones: [{ f0: 300, f1: 760, vol: 0.5, dec: 0.22 }, { f0: 600, f1: 1200, vol: 0.2, dec: 0.15 }] },
  portal_close:       { dur: 0.32, tones: [{ f0: 720, f1: 180, vol: 0.5, dec: 0.12 }] },
  portal_reject:      { dur: 0.24, tones: [{ f0: 190, f1: 110, wave: 'square', vol: 0.3, dec: 0.08 }], noise: { vol: 0.3, lp: 0.5, dec: 0.06 } },
  portal_enter:       { dur: 0.36, tones: [{ f0: 520, f1: 190, vol: 0.45, dec: 0.15 }], noise: { vol: 0.2, lp: 0.1, dec: 0.15 } },
  gun_fire:           { dur: 0.26, tones: [{ f0: 1300, f1: 280, wave: 'saw', vol: 0.25, dec: 0.08 }], noise: { vol: 0.25, lp: 0.4, dec: 0.05 } },
  door_open:          { dur: 0.8,  tones: [{ f0: 90, f1: 150, vol: 0.4, dec: 0.5 }], noise: { vol: 0.25, lp: 0.05, dec: 0.45 } },
  door_close:         { dur: 0.6,  tones: [{ f0: 150, f1: 80, vol: 0.4, dec: 0.35 }], noise: { vol: 0.25, lp: 0.05, dec: 0.3 } },
  button_down:        { dur: 0.14, tones: [{ f0: 230, f1: 110, wave: 'square', vol: 0.35, dec: 0.04 }] },
  button_up:          { dur: 0.12, tones: [{ f0: 160, f1: 230, wave: 'square', vol: 0.25, dec: 0.04 }] },
  cube_drop:          { dur: 0.22, tones: [{ f0: 130, f1: 60, vol: 0.6, dec: 0.06 }], noise: { vol: 0.3, lp: 0.3, dec: 0.03 } },
  cube_pickup:        { dur: 0.16, tones: [{ f0: 300, f1: 520, wave: 'tri', vol: 0.3, dec: 0.06 }] },
  fizzle_zap:         { dur: 0.5,  tones: [{ f0: 1500, f1: 200, wave: 'saw', vol: 0.2, dec: 0.2 }], noise: { vol: 0.45, lp: 0.6, dec: 0.15 } },
  goo_splash:         { dur: 0.5,  tones: [{ f0: 200, f1: 80, vol: 0.4, dec: 0.2 }], noise: { vol: 0.35, lp: 0.08, dec: 0.2 } },
  footstep:           { dur: 0.1,  tones: [{ f0: 95, f1: 60, vol: 0.5, dec: 0.03 }], noise: { vol: 0.3, lp: 0.12, dec: 0.025 } },
  land:               { dur: 0.2,  tones: [{ f0: 100, f1: 55, vol: 0.6, dec: 0.06 }], noise: { vol: 0.35, lp: 0.15, dec: 0.05 } },
  level_complete:     { dur: 1.0,  seq: [[523, 0, 0.25], [659, 0.14, 0.25], [784, 0.28, 0.3], [1047, 0.44, 0.5]] },
  ui_click:           { dur: 0.07, tones: [{ f0: 820, f1: 600, wave: 'square', vol: 0.25, dec: 0.02 }] },
  ambience_lobby:     { dur: 4, loop: true, hum: [[55, 0.16], [110, 0.08], [165, 0.04]], trem: 0.5 },
  ambience_chamber:   { dur: 4, loop: true, hum: [[62, 0.16], [124, 0.07], [186, 0.035]], trem: 0.25 },
  player_hurt:        { dur: 0.35, tones: [{ f0: 160, f1: 70, wave: 'saw', vol: 0.35, dec: 0.12 }], noise: { vol: 0.5, lp: 0.25, dec: 0.08 } },
  player_death:       { dur: 1.1,  tones: [{ f0: 220, f1: 38, vol: 0.5, dec: 0.5 }, { f0: 110, f1: 30, wave: 'saw', vol: 0.2, dec: 0.4 }], noise: { vol: 0.3, lp: 0.1, dec: 0.35 } },
  heartbeat:          { dur: 0.9,  seq: [[58, 0, 0.16], [52, 0.2, 0.2]] },
  sentry_alert:       { dur: 0.3,  seq: [[880, 0, 0.09], [1175, 0.11, 0.14]] },
  sentry_fire:        { dur: 0.28, tones: [{ f0: 700, f1: 120, wave: 'square', vol: 0.22, dec: 0.09 }], noise: { vol: 0.2, lp: 0.5, dec: 0.04 } },
  sentry_hit:         { dur: 0.2,  tones: [{ f0: 900, f1: 300, wave: 'tri', vol: 0.25, dec: 0.05 }], noise: { vol: 0.3, lp: 0.6, dec: 0.04 } },
  robot_chime:        { dur: 0.45, seq: [[392, 0, 0.3], [587, 0.1, 0.3]] },
  checkpoint:         { dur: 0.5,  seq: [[660, 0, 0.18], [880, 0.1, 0.3]] },
  fizzler_hum:        { dur: 2, loop: true, hum: [[120, 0.12], [240, 0.09], [360, 0.07], [480, 0.04]], trem: 6 },
};

function wave(kind, ph) {
  const p = ph - Math.floor(ph);
  switch (kind) {
    case 'square': return p < 0.5 ? 1 : -1;
    case 'saw': return 2 * p - 1;
    case 'tri': return 4 * Math.abs(p - 0.5) - 1;
    default: return Math.sin(ph * Math.PI * 2);
  }
}

function synthBuffer(ctx, key) {
  const r = SYNTH[key] || { dur: 0.2, tones: [{ f0: 440, f1: 440, vol: 0.3, dec: 0.08 }] };
  const sr = ctx.sampleRate, n = Math.floor(sr * r.dur);
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  if (r.hum) {
    for (let i = 0; i < n; i++) {
      const t = i / sr; let v = 0;
      for (const [f, a] of r.hum) { const fi = Math.max(1, Math.round(f * r.dur)) / r.dur; v += Math.sin(t * fi * Math.PI * 2) * a; }
      const tf = Math.max(1, Math.round(r.trem * r.dur)) / r.dur;
      d[i] = v * (0.75 + 0.25 * Math.sin(t * tf * Math.PI * 2));
    }
    return buf;
  }
  if (r.seq) {
    for (const [f, st, len] of r.seq) {
      const s0 = Math.floor(st * sr), s1 = Math.min(n, s0 + Math.floor(len * sr));
      for (let i = s0; i < s1; i++) { const t = (i - s0) / sr; d[i] += Math.sin(t * f * Math.PI * 2) * 0.3 * Math.exp(-t / (len * 0.45)) * Math.min(1, t / 0.005); }
    }
    return buf;
  }
  const phases = (r.tones || []).map(() => 0);
  let nz = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr; let v = 0;
    (r.tones || []).forEach((tn, k) => {
      const f = tn.f0 + (tn.f1 - tn.f0) * (t / r.dur);
      phases[k] += f / sr;
      v += wave(tn.wave, phases[k]) * tn.vol * Math.exp(-t / tn.dec) * Math.min(1, t / (tn.att || 0.004));
    });
    if (r.noise) { nz += ((Math.random() * 2 - 1) - nz) * r.noise.lp; v += nz * r.noise.vol * Math.exp(-t / r.noise.dec); }
    d[i] = Math.max(-1, Math.min(1, v));
  }
  return buf;
}

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.synthesized = [];
    this.ambience = null;
    this.ambKey = null;
  }

  /** Decode loaded mp3 bytes (or synthesize) for all configured sounds. Safe to call before a user gesture. */
  async init(soundData) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { warn('WebAudio not supported: game will be silent'); return; }
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.sfxBus = c.createGain(); this.ambBus = c.createGain();
    this.sfxBus.connect(this.master); this.ambBus.connect(this.master); this.master.connect(c.destination);
    this.applyVolumes();
    await Promise.all(Object.keys(CONFIG.sounds).map(async (key) => {
      let buf = null;
      const bytes = soundData[key];
      if (bytes) { try { buf = await c.decodeAudioData(bytes.slice(0)); } catch (e) { warn(`sound "${key}" could not be decoded -> synthesized`); } }
      if (!buf) { buf = synthBuffer(c, key); this.synthesized.push(key); }
      this.buffers[key] = buf;
    }));
    if (this.synthesized.length) warn(`synthesized ${this.synthesized.length} sound(s) with WebAudio: ${this.synthesized.join(', ')}`);
  }

  applyVolumes() {
    if (!this.ctx) return;
    const a = CONFIG.audio;
    this.master.gain.value = a.master; this.sfxBus.gain.value = a.sfx; this.ambBus.gain.value = a.amb;
  }

  /** Must be called from a user gesture (click / session start). */
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }

  /** Update the listener (called every frame; takes plain numbers, no allocation). */
  setListener(px, py, pz, fx, fy, fz, ux, uy, uz) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = px; l.positionY.value = py; l.positionZ.value = pz;
      l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
      l.upX.value = ux; l.upY.value = uy; l.upZ.value = uz;
    } else if (l.setPosition) { l.setPosition(px, py, pz); l.setOrientation(fx, fy, fz, ux, uy, uz); }
  }

  /**
   * Play a sound. opts: {pos:{x,y,z}|null, vol, rate, loop}. Returns a handle {stop(), setPos(v)} or null.
   */
  play(key, opts = {}) {
    if (!this.ctx || !this.buffers[key]) return null;
    return this._start(this.buffers[key], CONFIG.sounds[key] || { kind: 'sfx', vol: 1 }, opts);
  }

  /** Play an arbitrary AudioBuffer (runtime generated, e.g. the robot voice) on the sfx bus. opts as in play(). */
  playBuffer(buf, opts = {}) {
    if (!this.ctx || !buf) return null;
    return this._start(buf, { kind: 'sfx', vol: 1 }, opts);
  }

  _start(buffer, cfg, opts) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = buffer;
    src.loop = !!(opts.loop ?? cfg.loop);
    src.playbackRate.value = opts.rate || 1;
    const g = c.createGain(); g.gain.value = (cfg.vol ?? 1) * (opts.vol ?? 1);
    src.connect(g);
    let panner = null;
    if (opts.pos) {
      panner = c.createPanner();
      panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
      panner.refDistance = opts.refDistance || CONFIG.audio.refDistance; panner.maxDistance = CONFIG.audio.maxDistance; panner.rolloffFactor = opts.rolloff ?? 1.2;
      if (panner.positionX) { panner.positionX.value = opts.pos.x; panner.positionY.value = opts.pos.y; panner.positionZ.value = opts.pos.z; }
      else panner.setPosition(opts.pos.x, opts.pos.y, opts.pos.z);
      g.connect(panner); panner.connect(cfg.kind === 'amb' ? this.ambBus : this.sfxBus);
    } else g.connect(cfg.kind === 'amb' ? this.ambBus : this.sfxBus);
    src.start();
    return {
      src, gain: g,
      stop() { try { src.stop(); } catch (e) { /* already stopped */ } },
      setPos(p) { if (!panner) return; if (panner.positionX) { panner.positionX.value = p.x; panner.positionY.value = p.y; panner.positionZ.value = p.z; } else panner.setPosition(p.x, p.y, p.z); },
    };
  }

  loop(key, pos, vol) { return this.play(key, { pos, vol, loop: true }); }

  /** Quiet looping ambience for the current room (non-positional). */
  setAmbience(key) {
    if (this.ambKey === key) return;
    if (this.ambience) this.ambience.stop();
    this.ambience = key ? this.play(key, { loop: true }) : null;
    this.ambKey = key;
  }
}
