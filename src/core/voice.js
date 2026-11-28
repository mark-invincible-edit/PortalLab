// Robot voice. Three modes (CONFIG.voice.mode, pause menu "VOICE"):
//   'tts'   the browser's own text-to-speech (speechSynthesis) with a low pitch + slow rate. Real, intelligible speech, but browsers do not let a
//           page route it through audio effects or 3D audio, so it is plain stereo and only "robotic" by pitch. May not exist on every device
//           (some standalone VR browsers ship no voices).
//   'synth' built-in formant synthesizer: letters are turned into vowels / fricatives / plosives with a monotone pitch, then ring-modulated and comb
//           filtered. It sounds like a robot MUMBLING THE SENTENCE (rhythm and punctuation follow the text), it is not intelligible speech. Works
//           everywhere, is spatialised at the robot's head and drives her eye (lip-sync from the amplitude envelope).
//   'off'   captions only.
//   'auto'  tts when the browser has a voice, otherwise synth.
// Captions are always shown (CONFIG.voice.captions) so nothing depends on the voice.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp } from './util.js';

const VOW = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [270, 2290, 3010], o: [570, 840, 2410], u: [300, 870, 2240], y: [300, 2100, 2900] };
const NAS = [350, 1200, 2400];

/** Text -> list of phoneme-ish tokens {k:'v'|'n'|'f'|'p'|'s'|'pause', f, hf, bw, dur}. */
function tokenize(text) {
  const t = text.toLowerCase().replace(/[^a-z .,!?'-]/g, ' ');
  const out = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i], n = t[i + 1];
    if (c === ' ') { out.push({ k: 's', dur: 0.045 }); continue; }
    if (c === ',' || c === '-') { out.push({ k: 'pause', dur: 0.2, mark: ',' }); continue; }
    if (c === '.' || c === '!' || c === '?') { out.push({ k: 'pause', dur: 0.38, mark: c }); while (t[i + 1] === '.' || t[i + 1] === '!' || t[i + 1] === '?') i++; continue; }
    if (c === "'") continue;
    if (c === 's' && n === 'h') { out.push({ k: 'f', hf: 3100, bw: 1600, dur: 0.1 }); i++; continue; }
    if (c === 'c' && n === 'h') { out.push({ k: 'p', hf: 3000, dur: 0.06 }); out.push({ k: 'f', hf: 3000, bw: 1600, dur: 0.06 }); i++; continue; }
    if (c === 't' && n === 'h') { out.push({ k: 'f', hf: 6200, bw: 3000, dur: 0.065 }); i++; continue; }
    if ('aeiouy'.includes(c)) {
      if (n === c && (c === 'e' || c === 'o')) { out.push({ k: 'v', f: VOW[c === 'e' ? 'i' : 'u'], dur: 0.17 }); i++; continue; }
      if ((c === 'o' && (n === 'u' || n === 'w')) || (c === 'a' && n === 'u')) { out.push({ k: 'v', f: VOW.o, dur: 0.08 }); out.push({ k: 'v', f: VOW.u, dur: 0.09 }); i++; continue; }
      if ((c === 'a' && (n === 'i' || n === 'y')) || (c === 'e' && n === 'a')) { out.push({ k: 'v', f: VOW.e, dur: 0.09 }); out.push({ k: 'v', f: VOW.i, dur: 0.08 }); i++; continue; }
      out.push({ k: 'v', f: VOW[c], dur: 0.095 }); continue;
    }
    if ('sz'.includes(c)) out.push({ k: 'f', hf: 5600, bw: 2400, dur: 0.08 });
    else if ('fv'.includes(c)) out.push({ k: 'f', hf: 4200, bw: 3600, dur: 0.07 });
    else if (c === 'h') out.push({ k: 'f', hf: 1700, bw: 2200, dur: 0.055 });
    else if ('mnlrw'.includes(c)) out.push({ k: 'n', f: NAS, dur: 0.07 });
    else if ('ptkcqbdgj'.includes(c)) out.push({ k: 'p', hf: c === 'p' || c === 'b' ? 900 : c === 't' || c === 'd' ? 3600 : 1900, dur: 0.045, voiced: 'bdgj'.includes(c) });
    else out.push({ k: 'f', hf: 3000, bw: 2000, dur: 0.06 });
  }
  return out;
}

/** Render a line to mono samples. Returns { data: Float32Array, env: Float32Array (per 20 ms), dur }. */
export function synthLine(text, sr, f0, mood = 'calm') {
  const tokens = tokenize(text), speed = mood === 'angry' ? 0.85 : 1.0, base = f0 * (mood === 'angry' ? 0.9 : 1.0);
  // sentence index of each token -> prosody (fall on '.', rise on '?')
  const sent = []; let start = 0;
  tokens.forEach((tk, i) => { if (tk.k === 'pause') { sent.push([start, i, tk.mark]); start = i + 1; } });
  if (start < tokens.length) sent.push([start, tokens.length, '.']);
  const pitchAt = new Float32Array(tokens.length).fill(1);
  for (const [a, b, mark] of sent) {
    for (let i = a; i < b; i++) {
      const p = (i - a) / Math.max(1, b - a - 1);
      const wob = 1 + 0.035 * Math.sin((i - a) * 1.7 + a);
      pitchAt[i] = wob * (mark === '?' ? 1 + 0.22 * p * p * p : mark === '!' ? 1.06 - 0.1 * p : mark === ',' ? 1 - 0.04 * p : 1 - 0.14 * p * p);
    }
  }
  const chunks = []; let total = 0;
  const res = [{ y1: 0, y2: 0 }, { y1: 0, y2: 0 }, { y1: 0, y2: 0 }, { y1: 0, y2: 0 }];
  const cf = [500, 1500, 2500], cur = [500, 1500, 2500];
  const coef = (f, bw) => { const r = Math.exp(-Math.PI * bw / sr), C = -r * r, B = 2 * r * Math.cos(2 * Math.PI * f / sr); return [1 - B - C, B, C]; };
  let phase = 0, seed = 1234567;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  tokens.forEach((tk, idx) => {
    const n = Math.max(1, Math.round(tk.dur * speed * sr)), buf = new Float32Array(n);
    const att = Math.min(n / 3, 0.012 * sr), rel = Math.min(n / 3, 0.02 * sr);
    if (tk.k === 's' || tk.k === 'pause') { chunks.push(buf); total += n; return; }
    const voiced = tk.k === 'v' || tk.k === 'n' || (tk.k === 'p' && tk.voiced);
    const target = tk.k === 'v' ? tk.f : tk.k === 'n' ? tk.f : [tk.hf || 3000, 0, 0];
    const f0t = base * pitchAt[idx];
    let c1 = coef(cur[0], 90), c2 = coef(cur[1], 110), c3 = coef(cur[2], 170), cn = coef(tk.hf || 3000, tk.bw || 1800);
    for (let i = 0; i < n; i++) {
      if ((i & 31) === 0) {                                                     // glide formants toward the token's, refresh coefficients
        if (tk.k === 'v' || tk.k === 'n') for (let j = 0; j < 3; j++) cur[j] += (target[j] - cur[j]) * 0.35;
        c1 = coef(cur[0], 90); c2 = coef(cur[1], 110); c3 = coef(cur[2], 170);
      }
      let env = Math.min(1, i / att, (n - i) / rel);
      let s = 0;
      if (voiced) {
        phase += f0t / sr; if (phase >= 1) phase -= 1;
        const src = (phase * 2 - 1) * 0.6 + rnd() * 0.04;                       // sawtooth glottal source + a little breath
        const r1 = res[0], r2 = res[1], r3 = res[2];
        const y1 = c1[0] * src + c1[1] * r1.y1 + c1[2] * r1.y2; r1.y2 = r1.y1; r1.y1 = y1;
        const y2 = c2[0] * src + c2[1] * r2.y1 + c2[2] * r2.y2; r2.y2 = r2.y1; r2.y1 = y2;
        const y3 = c3[0] * src + c3[1] * r3.y1 + c3[2] * r3.y2; r3.y2 = r3.y1; r3.y1 = y3;
        s = (y1 * 1.0 + y2 * 0.55 + y3 * 0.25) * (tk.k === 'n' ? 0.55 : tk.k === 'p' ? 0.3 : 1.0);
      }
      if (tk.k === 'f' || tk.k === 'p') {
        const x = rnd(), r4 = res[3];
        const y = cn[0] * x + cn[1] * r4.y1 + cn[2] * r4.y2; r4.y2 = r4.y1; r4.y1 = y;
        s += y * (tk.k === 'p' ? 0.9 : 0.7) * (tk.k === 'p' ? Math.exp(-i / (n * 0.35)) : 1);
      }
      buf[i] = s * env;
    }
    chunks.push(buf); total += n;
  });
  // concatenate, robot-ify: ring modulation + metallic comb + 2x sample hold, normalise
  const data = new Float32Array(total + Math.round(sr * 0.1));
  let o = 0; for (const c of chunks) { data.set(c, o); o += c.length; }
  const d = Math.max(2, Math.round(sr * 0.0062));
  for (let i = 0; i < data.length; i++) {
    const t = i / sr, ring = 0.62 + 0.38 * Math.sin(2 * Math.PI * 57 * t);
    let x = data[i] * ring;
    if (i >= d) x += 0.42 * data[i - d];
    data[i] = x;
  }
  for (let i = 1; i < data.length; i += 2) data[i] = data[i - 1];
  let peak = 1e-6; for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const g = 0.85 / peak; for (let i = 0; i < data.length; i++) data[i] *= g;
  const win = Math.round(sr * 0.02), env = new Float32Array(Math.ceil(data.length / win));
  for (let w = 0; w < env.length; w++) { let e = 0; const a = w * win, b = Math.min(data.length, a + win); for (let i = a; i < b; i++) e += data[i] * data[i]; env[w] = clamp(Math.sqrt(e / (b - a)) * 2.6, 0, 1); }
  return { data, env, dur: data.length / sr };
}

export class Voice {
  constructor(G) {
    this.G = G; this.speaking = false; this.level = 0; this.mood = 'calm';
    this._handle = null; this._env = null; this._t0 = 0; this._dur = 0; this._cb = null; this._timer = 0; this._ttsVoice = null; this._cache = new Map();
    this.ttsReady = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const pick = () => {
        const vs = window.speechSynthesis.getVoices() || [];
        if (!vs.length) return;
        const en = vs.filter((v) => /^en/i.test(v.lang));
        const pref = en.find((v) => /google uk english male|daniel|microsoft (guy|david|mark)|alex|fred|david/i.test(v.name));
        this._ttsVoice = pref || en[0] || vs[0]; this.ttsReady = true;
      };
      pick();
      try { window.speechSynthesis.addEventListener('voiceschanged', pick); } catch (e) { /* older browsers */ }
    }
  }

  /** The mode that will actually be used right now. */
  get mode() {
    const m = CONFIG.voice.mode;
    if (m === 'off') return 'off';
    if (!this.G.audio.ctx) return m === 'tts' && this.ttsReady ? 'tts' : 'off';
    if (m === 'synth') return 'synth';
    if (m === 'tts') return this.ttsReady ? 'tts' : 'synth';
    return this.ttsReady ? 'tts' : 'synth';
  }

  /** Pre-render a line into the cache (synth mode) so the first playback does not hitch. */
  warm(text, mood = 'calm') { const k = text + '|' + mood; if (!this._cache.has(k)) this._cache.set(k, synthLine(text, 22050, CONFIG.voice.synthPitch, mood)); }

  /** Speak one line. Returns its estimated duration in seconds. onEnd is called when it finishes (or is cut by stop()). */
  say(text, { mood = 'calm', onEnd = null } = {}) {
    this.stop(false);
    const G = this.G, V = CONFIG.voice, mode = this.mode;
    this.mood = mood; this._cb = onEnd; this.speaking = true; this._t0 = performance.now() / 1000;
    const robot = G.level && G.level.robot;
    if (robot) robot.mood = mood;
    const pos = robot ? robot.speakPos(new THREE.Vector3()) : null;
    if (mode !== 'off') G.audio.play('robot_chime', { pos, vol: 0.7 });
    let dur = Math.max(2.2, text.length * 0.058 + 0.9);
    this._env = null;
    if (mode === 'synth') {
      let cached = this._cache.get(text + '|' + mood);
      if (!cached) { cached = synthLine(text, 22050, V.synthPitch, mood); this._cache.set(text + '|' + mood, cached); }
      const ctx = G.audio.ctx, buf = ctx.createBuffer(1, cached.data.length, 22050);
      buf.copyToChannel(cached.data, 0);
      this._handle = G.audio.playBuffer(buf, { pos, vol: V.volume * 1.3, refDistance: 5, rolloff: 0.6 });
      this._env = cached.env; dur = cached.dur + 0.25;
    } else if (mode === 'tts') {
      try {
        const u = new SpeechSynthesisUtterance(text);
        if (this._ttsVoice) u.voice = this._ttsVoice;
        u.pitch = mood === 'angry' ? V.ttsPitch * 0.8 : V.ttsPitch; u.rate = mood === 'angry' ? V.ttsRate * 1.08 : V.ttsRate;
        u.volume = clamp(V.volume * CONFIG.audio.master * CONFIG.audio.sfx * 1.2, 0, 1);
        u.onend = () => { if (this._utt === u) this._finish(); };
        u.onerror = () => { if (this._utt === u) this._finish(); };
        this._utt = u; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
        dur += 2.5;                                                              // safety timer in case onend never fires
      } catch (e) { /* captions only */ }
    }
    this._dur = dur;
    return dur;
  }

  stop(callCb = true) {
    if (this._handle) { this._handle.stop(); this._handle = null; }
    if (this._utt) { try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } this._utt = null; }
    const was = this.speaking, cb = this._cb;
    this.speaking = false; this.level = 0; this._cb = null; this._env = null;
    if (callCb && was && cb) cb();
  }

  _finish() {
    const cb = this._cb;
    this.speaking = false; this.level = 0; this._cb = null; this._env = null; this._handle = null; this._utt = null;
    if (cb) cb();
  }

  update(dt) {
    if (!this.speaking) return;
    const t = performance.now() / 1000 - this._t0;
    if (t >= this._dur) { this._finish(); return; }
    if (this._env) this.level = this._env[Math.min(this._env.length - 1, Math.floor(Math.max(0, t - 0.0) / 0.02))] || 0;
    else this.level = clamp(0.3 + 0.55 * Math.abs(Math.sin(t * 11.3)) * Math.abs(Math.sin(t * 4.1 + 1)), 0, 1);
  }
}
