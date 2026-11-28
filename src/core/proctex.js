// Procedural fallback art for every texture in the manifest. Used ONLY when the PNG in assets/textures/ is missing (real files always win).
// Tileable textures are seamless (periodic noise, features drawn with wrap-around). Not meant to replace real art, but it makes the lighting,
// shadows and bump mapping look right out of the box instead of showing labelled checkerboards.

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Periodic fractal value noise in [0,1], size x size. cells = lattice period of the first octave. */
function noise(size, cells, octaves, seed, stretchX = 1, stretchY = 1) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const nx = Math.max(1, Math.round(cells * stretchX * (1 << o))), ny = Math.max(1, Math.round(cells * stretchY * (1 << o))), r = rng(seed + o * 977);
    const lat = new Float32Array(nx * ny); for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let y = 0; y < size; y++) {
      const fy = y / size * ny, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = x / size * nx, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const a = lat[(y0 % ny) * nx + (x0 % nx)], b = lat[(y0 % ny) * nx + ((x0 + 1) % nx)], c = lat[((y0 + 1) % ny) * nx + (x0 % nx)], d = lat[((y0 + 1) % ny) * nx + ((x0 + 1) % nx)];
        out[y * size + x] += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * amp;
      }
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

const hex = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Fill a canvas from base color + per-pixel brightness modulation (array of -1..1 or 0..1 around 0.5). */
function shaded(size, base, fn) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size), b = hex(base);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const m = fn(x, y), i = (y * size + x) * 4;
    img.data[i] = clamp255(b[0] * m); img.data[i + 1] = clamp255(b[1] * m); img.data[i + 2] = clamp255(b[2] * m); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return [c, g];
}

/** Draw with wrap-around so strokes crossing the edge continue on the other side. */
function wrap(g, s, fn) { for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) { g.save(); g.translate(dx, dy); fn(); g.restore(); } }

function panelGrid(g, s, n, dark, light, lw) {
  const step = s / n;
  wrap(g, s, () => {
    for (let i = 0; i <= n; i++) {
      const p = i * step;
      g.fillStyle = dark; g.fillRect(p - lw, 0, lw * 2, s); g.fillRect(0, p - lw, s, lw * 2);
      g.fillStyle = light; g.fillRect(p + lw, 0, 1.5, s); g.fillRect(0, p + lw, s, 1.5);
    }
  });
}

function rivets(g, s, n, col, hi) {
  const step = s / n, r = Math.max(2, s / 128);
  wrap(g, s, () => {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (const [ox, oy] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) {
      const x = (i + ox) * step, y = (j + oy) * step;
      g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = hi; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2); g.fill();
    }
  });
}

const MAKERS = {
  wall_white(s) {
    const n1 = noise(s, 4, 4, 11), n2 = noise(s, 2, 3, 23, 0.5, 3);                        // blotches + vertical streaks
    const [c, g] = shaded(s, 0xdedcd4, (x, y) => 0.9 + (n1[y * s + x] - 0.5) * 0.14 - Math.max(0, n2[y * s + x] - 0.55) * 0.35);
    panelGrid(g, s, 2, 'rgba(70,68,62,0.75)', 'rgba(255,255,250,0.55)', 2);
    rivets(g, s, 2, 'rgba(90,88,82,0.9)', 'rgba(255,255,255,0.7)');
    return c;
  },
  wall_dark(s) {
    const streak = noise(s, 3, 4, 31, 0.12, 4), n1 = noise(s, 5, 3, 37);
    const [c, g] = shaded(s, 0x3b4048, (x, y) => 0.8 + (streak[y * s + x] - 0.5) * 0.5 + (n1[y * s + x] - 0.5) * 0.15);
    panelGrid(g, s, 2, 'rgba(8,9,11,0.9)', 'rgba(150,158,168,0.35)', 2);
    rivets(g, s, 2, 'rgba(120,126,134,0.9)', 'rgba(220,226,232,0.8)');
    return c;
  },
  floor_tile(s) {
    const n1 = noise(s, 6, 4, 41), r = rng(7), tiles = 4, step = s / tiles;
    const shade = []; for (let i = 0; i < tiles * tiles; i++) shade.push(0.93 + r() * 0.12);
    const [c, g] = shaded(s, 0xb9b7af, (x, y) => shade[Math.floor(y / step) * tiles + Math.floor(x / step)] * (0.92 + (n1[y * s + x] - 0.5) * 0.18));
    panelGrid(g, s, tiles, 'rgba(60,58,54,0.85)', 'rgba(255,255,250,0.25)', 2.5);
    return c;
  },
  glass(s) {
    const [c, g] = shaded(s, 0xa9d3e4, () => 1);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = s / 24;
    for (let i = -1; i < 4; i++) { g.beginPath(); g.moveTo(i * s / 3, s); g.lineTo(i * s / 3 + s * 0.6, 0); g.stroke(); }
    g.strokeStyle = 'rgba(40,70,90,0.9)'; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
    return c;
  },
  hazard_stripe(s) {
    const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
    g.fillStyle = '#17181a'; g.fillRect(0, 0, s, s); g.fillStyle = '#e8b81a';
    wrap(g, s, () => { for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * s / 2, 0); g.lineTo(i * s / 2 + s / 4, 0); g.lineTo(i * s / 2 + s / 4 + s, s); g.lineTo(i * s / 2 + s, s); g.closePath(); g.fill(); } });
    return c;
  },
  door_panel(s) {
    const n1 = noise(s, 4, 4, 51), streak = noise(s, 3, 3, 53, 0.15, 3);
    const [c, g] = shaded(s, 0x41464d, (x, y) => 0.85 + (n1[y * s + x] - 0.5) * 0.2 + (streak[y * s + x] - 0.5) * 0.25);
    g.strokeStyle = 'rgba(8,9,11,0.9)'; g.lineWidth = 6; g.strokeRect(10, 10, s - 20, s - 20);
    g.fillStyle = 'rgba(8,9,11,0.85)'; g.fillRect(s / 2 - 2, 10, 4, s - 20);                  // door seam
    g.strokeStyle = 'rgba(190,196,204,0.35)'; g.lineWidth = 2; g.strokeRect(16, 16, s - 32, s - 32);
    g.fillStyle = '#e8b81a'; for (let i = 0; i < 8; i++) { g.save(); g.translate(40 + i * 50, s - 52); g.transform(1, 0, -0.6, 1, 0, 0); g.fillRect(0, 0, 24, 30); g.restore(); }
    rivets(g, s, 4, 'rgba(160,166,174,0.9)', 'rgba(240,244,248,0.8)');
    return c;
  },
  cube_weighted(s) {
    const n1 = noise(s, 5, 4, 61);
    const [c, g] = shaded(s, 0x8d9299, (x, y) => 0.88 + (n1[y * s + x] - 0.5) * 0.25);
    g.strokeStyle = 'rgba(30,32,36,0.95)'; g.lineWidth = s / 20; g.strokeRect(s / 40, s / 40, s - s / 20, s - s / 20);
    g.strokeStyle = 'rgba(215,220,226,0.6)'; g.lineWidth = 3; g.strokeRect(s / 10, s / 10, s * 0.8, s * 0.8);
    g.fillStyle = 'rgba(40,43,48,0.85)'; g.fillRect(s * 0.2, s * 0.2, s * 0.6, s * 0.6);
    g.strokeStyle = '#ff8a1f'; g.lineWidth = s / 28; g.beginPath(); g.arc(s / 2, s / 2, s * 0.16, 0, Math.PI * 2); g.stroke();       // orange cube emblem
    g.beginPath(); g.moveTo(s * 0.38, s * 0.5); g.lineTo(s * 0.62, s * 0.5); g.moveTo(s / 2, s * 0.38); g.lineTo(s / 2, s * 0.62); g.stroke();
    for (const [x, y] of [[0.14, 0.14], [0.86, 0.14], [0.14, 0.86], [0.86, 0.86]]) { g.fillStyle = '#1b1d20'; g.beginPath(); g.arc(s * x, s * y, s / 40, 0, Math.PI * 2); g.fill(); }
    return c;
  },
  button_pad(s) {
    const [c, g] = shaded(s, 0x7d838b, () => 1);
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, '#e2552a'); grad.addColorStop(0.5, '#c8431c'); grad.addColorStop(0.62, '#2a2c30'); grad.addColorStop(0.7, '#9aa0a8'); grad.addColorStop(1, '#5d6269');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(20,20,22,0.8)'; g.lineWidth = 4; g.beginPath(); g.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(s / 2, s / 2, s * 0.18, 0, Math.PI * 2); g.stroke();
    return c;
  },
  goo(s) {
    const n1 = noise(s, 4, 5, 71), n2 = noise(s, 8, 3, 73);
    const [c] = shaded(s, 0x4f8a24, (x, y) => { const v = n1[y * s + x], b = Math.max(0, n2[y * s + x] - 0.6) * 3; return 0.55 + v * 0.7 + b * 0.5; });
    return c;
  },
  fizzler_grid(s) {
    const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
    wrap(g, s, () => {
      g.strokeStyle = 'rgba(140,225,255,0.9)'; g.lineWidth = 3;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.stroke(); g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); }
      g.fillStyle = 'rgba(220,250,255,1)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(i * s / 4, j * s / 4, 6, 0, Math.PI * 2); g.fill(); }
    });
    return c;
  },
  sign_plate(s) {
    const n1 = noise(s, 5, 4, 81);
    const [c, g] = shaded(s, 0xd9d7cf, (x, y) => 0.92 + (n1[y * s + x] - 0.5) * 0.12);
    g.strokeStyle = 'rgba(60,58,54,0.6)'; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
    return c;
  },
  ui_plate(s) {
    const n1 = noise(s, 6, 3, 91);
    const [c, g] = shaded(s, 0x2d3137, (x, y) => 0.9 + (n1[y * s + x] - 0.5) * 0.2);
    g.strokeStyle = 'rgba(255,255,255,0.04)'; g.lineWidth = 2; wrap(g, s, () => { for (let i = -4; i < 8; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4 + s, s); g.stroke(); } });
    return c;
  },
  portal_noise(s) {
    const n = noise(s, 4, 5, 101);
    const [c] = shaded(s, 0xffffff, (x, y) => 0.35 + n[y * s + x] * 0.65);
    return c;
  },
  blob_shadow(s) { return radial(s, [[0, 'rgba(0,0,0,0.9)'], [0.55, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]); },
  glow(s) { return radial(s, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]); },
  spark(s) {
    const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.5)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(s / 2 - 1, 2, 2, s - 4); g.fillRect(2, s / 2 - 1, s - 4, 2);
    return c;
  },
  smoke(s) {
    const n = noise(s, 3, 4, 111), c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d'), img = g.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const d = Math.hypot(x - s / 2, y - s / 2) / (s / 2), a = Math.max(0, 1 - d * d) * (0.35 + n[y * s + x] * 0.9), i = (y * s + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = clamp255(a * 200);
    }
    g.putImageData(img, 0, 0); return c;
  },
  scorch(s) {
    const n = noise(s, 3, 5, 121), c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d'), img = g.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const d = Math.hypot(x - s / 2, y - s / 2) / (s / 2), a = Math.max(0, 1 - d * (0.8 + n[y * s + x] * 0.5)), i = (y * s + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 8; img.data[i + 3] = clamp255(a * 255);
    }
    g.putImageData(img, 0, 0); return c;
  },
};

function radial(s, stops) {
  const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  for (const [t, col] of stops) grad.addColorStop(t, col);
  g.fillStyle = grad; g.fillRect(0, 0, s, s); return c;
}

/** Procedural canvas for a manifest texture key, or null if there is no generator for it. */
export function makeProcedural(key, size) {
  const f = MAKERS[key];
  return f ? f(size) : null;
}
