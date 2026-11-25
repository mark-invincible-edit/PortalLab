// Puzzle props. Every visible mesh uses a manifest texture (cube_weighted, button_pad, door_panel, hazard_stripe, goo,
// fizzler_grid, sign_plate, blob_shadow, wall_dark, glow). Sign text/icons are drawn on top of the sign_plate texture.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { raycastSlabs } from '../core/geom.js';
import { clamp, DEG } from '../core/util.js';

const _hit = { t: 0, axis: 0, sign: 0, slab: null };
const _v = new THREE.Vector3();

const lit = (map, extra = {}) => new THREE.MeshLambertMaterial({ map, ...extra });
const unlit = (map, extra = {}) => new THREE.MeshBasicMaterial({ map, ...extra });

/** BoxGeometry whose UVs are scaled in meters so tileable textures keep their texel density. */
export function tiledBox(w, h, d, meters) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const sc = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];            // px nx py ny pz nz
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i; uv.setXY(k, uv.getX(k) * sc[f][0] / meters, uv.getY(k) * sc[f][1] / meters);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------------- blob shadow
export class BlobShadow {
  constructor(G, level) {
    this.G = G; this.level = level;
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: G.assets.tex('blob_shadow'), transparent: true, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    this.mesh.renderOrder = 2; this.mesh.visible = false;
    G.scene.add(this.mesh);
  }
  update(x, y, z, size) {
    if (raycastSlabs(this.level.solids, x, y, z, 0, -1, 0, 8, _hit)) {
      this.mesh.visible = true;
      this.mesh.position.set(x, y - _hit.t + 0.014, z);
      this.mesh.scale.setScalar(size * (1 + _hit.t * 0.15));
      this.mesh.material.opacity = 0.65 * clamp(1 - _hit.t / 5, 0, 1);
    } else this.mesh.visible = false;
  }
  dispose() { this.G.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// ---------------------------------------------------------------------------------------------------- cube
export class Cube {
  constructor(G, level, data) {
    this.G = G; this.level = level;
    const s = CONFIG.physics.cubeSize;
    this.start = new THREE.Vector3().fromArray(data.pos);
    const { body, collider } = G.physics.createCube(data.pos[0], data.pos[1], data.pos[2]);
    this.body = body; this.collider = collider;
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), lit(G.assets.tex('cube_weighted')));
    this.mesh.userData.cube = this;
    G.scene.add(this.mesh);
    this.shadow = new BlobShadow(G, level);
    this.prev = new THREE.Vector3();
    this.held = false; this.dead = false; this.timer = 0;
    this.radius = s * 0.75;
    this._lastImpact = 0;
  }

  get position() { const t = this.body.translation(); return _v.set(t.x, t.y, t.z); }

  respawn() {
    this.dead = false; this.held = false; this.mesh.visible = true; this.collider.setEnabled(true);
    this.body.setTranslation({ x: this.start.x, y: this.start.y, z: this.start.z }, true);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setGravityScale(1, true);
    this.prev.set(0, 0, 0);
  }

  disintegrate(sound = 'fizzle_zap') {
    if (this.dead) return;
    const G = this.G, p = this.position;
    if (G.gun && G.gun.held === this) G.gun.drop(true);
    G.vfx.disintegrate(p, CONFIG.physics.cubeSize);
    G.audio.play(sound, { pos: p });
    this.dead = true; this.timer = CONFIG.physics.cubeRespawnDelay;
    this.mesh.visible = false; this.collider.setEnabled(false); this.shadow.mesh.visible = false;
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }

  update(dt) {
    if (this.dead) { this.timer -= dt; if (this.timer <= 0) this.respawn(); return; }
    const t = this.body.translation(), r = this.body.rotation();
    this.mesh.position.set(t.x, t.y, t.z); this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    if (t.y < this.level.killY - 2) this.disintegrate('goo_splash');
    this.shadow.update(t.x, t.y, t.z, 0.9);
    // impact sound: crude, based on vertical speed change
    const vy = this.body.linvel().y;
    if (this._vy < -2.5 && vy > this._vy + 2.0 && !this.held) this.G.audio.play('cube_drop', { pos: this.mesh.position, vol: clamp(-this._vy / 8, 0.2, 1) });
    this._vy = vy;
  }

  dispose() {
    const G = this.G;
    G.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose();
    G.physics.world.removeRigidBody(this.body); this.shadow.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------- button
export class Button {
  constructor(G, level, data) {
    this.G = G; this.level = level; this.id = data.id;
    this.pos = new THREE.Vector3().fromArray(data.pos);
    const tex = G.assets.tex('button_pad');
    this.group = new THREE.Group(); this.group.position.copy(this.pos);
    this.base = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.05, 1.25), lit(tex)); this.base.position.y = 0.025;
    this.pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.08, 28), lit(tex)); this.pad.position.y = 0.09;
    this.group.add(this.base, this.pad); G.scene.add(this.group);
    this.pressed = false; this.press = 0;
  }

  update(dt) {
    const G = this.G, p = this.pos;
    let on = false;
    for (const c of this.level.cubes) {
      if (c.dead) continue;
      const q = c.body.translation();
      if (Math.abs(q.x - p.x) < 0.55 && Math.abs(q.z - p.z) < 0.55 && Math.abs(q.y - p.y) < 0.8) { on = true; break; }
    }
    if (!on) {
      const c = G.player.cap;
      if (Math.hypot(c.x - p.x, c.z - p.z) < 0.5 && Math.abs(c.y - p.y) < 0.25) on = true;
    }
    if (on !== this.pressed) {
      this.pressed = on;
      G.audio.play(on ? 'button_down' : 'button_up', { pos: this.pos });
      G.vfx.buttonBurst(this.pos, on);
    }
    this.press = clamp(this.press + (on ? 1 : -1) * dt * 8, 0, 1);
    this.pad.position.y = 0.09 - 0.045 * this.press;
  }

  dispose() { this.G.scene.remove(this.group); this.base.geometry.dispose(); this.pad.geometry.dispose(); this.base.material.dispose(); this.pad.material.dispose(); }
}

// ---------------------------------------------------------------------------------------------------- door
export class Door {
  constructor(G, level, data) {
    this.G = G; this.level = level; this.id = data.id;
    this.min = data.min.slice(); this.max = data.max.slice();
    const w = this.max[0] - this.min[0], h = this.max[1] - this.min[1], d = this.max[2] - this.min[2];
    this.h = h;
    this.center = new THREE.Vector3((this.min[0] + this.max[0]) / 2, (this.min[1] + this.max[1]) / 2, (this.min[2] + this.max[2]) / 2);
    this.group = new THREE.Group(); this.group.position.copy(this.center);
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lit(G.assets.tex('door_panel')));
    const stripe = new THREE.Mesh(tiledBox(w, 0.16, d + 0.02, 1), lit(G.assets.tex('hazard_stripe')));
    stripe.position.y = -h / 2 + 0.1;
    this.group.add(this.mesh, stripe); G.scene.add(this.group);
    this.kin = G.physics.createKinematicBox(this.min, this.max);
    this.solid = { min: this.min.slice(), max: this.max.slice(), surface: 'nonportalable', tex: null, colliders: [], isDoor: true };
    level.solids.push(this.solid);
    this.open = 0; this.target = false;
  }

  update(dt) {
    const want = this.level.doorWanted(this.id);
    if (want !== this.target) {
      this.target = want;
      this.G.audio.play(want ? 'door_open' : 'door_close', { pos: this.center });
    }
    const prev = this.open;
    this.open = clamp(this.open + (want ? 1 : -1) * dt / 1.1, 0, 1);
    if (this.open !== prev) {
      const e = this.open * this.open * (3 - 2 * this.open);                 // smoothstep (mechanical ease)
      const dy = e * (this.h + 0.05);
      this.group.position.y = this.center.y + dy;
      this.kin.body.setNextKinematicTranslation({ x: this.center.x, y: this.center.y + dy, z: this.center.z });
      this.solid.min[1] = this.min[1] + dy; this.solid.max[1] = this.max[1] + dy;
      this.solid.noRay = this.open > 0.98;
    }
  }

  dispose() {
    const G = this.G;
    G.scene.remove(this.group); this.mesh.geometry.dispose(); this.mesh.material.dispose();
    G.physics.world.removeRigidBody(this.kin.body);
    const i = this.level.solids.indexOf(this.solid); if (i >= 0) this.level.solids.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------------------------------- sign drawing
function fontStr(px, bold = true) { return `${bold ? 'bold ' : ''}${px}px ${CONFIG.font.family}, ${CONFIG.font.fallback}`; }

function drawIcon(g, name, cx, cy, s) {
  const ink = '#1d1f22', blue = CONFIG.ui.colors.blue, orange = CONFIG.ui.colors.orange;
  g.lineWidth = Math.max(3, s / 14); g.strokeStyle = ink; g.fillStyle = ink; g.lineCap = 'butt'; g.lineJoin = 'miter';
  const oval = (x, y, col) => { g.strokeStyle = col; g.beginPath(); g.ellipse(x, y, s * 0.14, s * 0.26, 0, 0, Math.PI * 2); g.stroke(); g.strokeStyle = ink; };
  const arrow = (x0, y0, x1, y1) => {
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0), h = s * 0.12;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - Math.cos(a - 0.5) * h, y1 - Math.sin(a - 0.5) * h); g.lineTo(x1 - Math.cos(a + 0.5) * h, y1 - Math.sin(a + 0.5) * h); g.closePath(); g.fill();
  };
  const box = (x, y, w, h, fill) => { if (fill) g.fillRect(x, y, w, h); else g.strokeRect(x, y, w, h); };
  switch (name) {
    case 'portals': oval(cx - s * 0.3, cy, blue); oval(cx + s * 0.3, cy, orange); arrow(cx - s * 0.1, cy, cx + s * 0.1, cy); break;
    case 'grip': box(cx - s * 0.18, cy, s * 0.36, s * 0.36, false); arrow(cx, cy - s * 0.4, cx, cy - s * 0.08); break;
    case 'jump': box(cx - s * 0.5, cy + s * 0.1, s * 0.3, s * 0.3, false); box(cx - s * 0.2, cy - s * 0.1, s * 0.7, s * 0.5, true); arrow(cx - s * 0.35, cy - s * 0.05, cx + s * 0.1, cy - s * 0.4); break;
    case 'gap': box(cx - s * 0.6, cy + s * 0.15, s * 0.4, s * 0.3, true); box(cx + s * 0.2, cy - s * 0.15, s * 0.4, s * 0.6, true); oval(cx - s * 0.4, cy - s * 0.1, blue); oval(cx + s * 0.4, cy - s * 0.4, orange); break;
    case 'cube': box(cx - s * 0.6, cy - s * 0.1, s * 0.28, s * 0.28, false); arrow(cx - s * 0.25, cy + s * 0.04, cx + s * 0.1, cy + s * 0.04); g.beginPath(); g.arc(cx + s * 0.4, cy + s * 0.2, s * 0.2, 0, Math.PI * 2); g.stroke(); break;
    case 'button': g.beginPath(); g.arc(cx, cy + s * 0.1, s * 0.3, 0, Math.PI * 2); g.stroke(); box(cx - s * 0.12, cy - s * 0.1, s * 0.24, s * 0.2, true); arrow(cx, cy - s * 0.5, cx, cy - s * 0.2); break;
    case 'white': box(cx - s * 0.6, cy - s * 0.3, s * 0.45, s * 0.6, false); g.beginPath(); g.ellipse(cx - s * 0.375, cy, s * 0.1, s * 0.2, 0, 0, Math.PI * 2); g.stroke(); box(cx + s * 0.1, cy - s * 0.3, s * 0.45, s * 0.6, true); g.strokeStyle = '#d8d6ce'; g.beginPath(); g.moveTo(cx + s * 0.2, cy - s * 0.2); g.lineTo(cx + s * 0.45, cy + s * 0.2); g.moveTo(cx + s * 0.45, cy - s * 0.2); g.lineTo(cx + s * 0.2, cy + s * 0.2); g.stroke(); break;
    case 'fling': oval(cx - s * 0.1, cy + s * 0.35, blue); arrow(cx - s * 0.1, cy - s * 0.5, cx - s * 0.1, cy + s * 0.1); oval(cx + s * 0.55, cy - s * 0.2, orange); arrow(cx + s * 0.3, cy - s * 0.2, cx + s * 0.1, cy - s * 0.2); break;
    case 'fizzler': g.setLineDash([s * 0.08, s * 0.08]); g.beginPath(); g.moveTo(cx, cy - s * 0.5); g.lineTo(cx, cy + s * 0.5); g.stroke(); g.setLineDash([]); box(cx - s * 0.6, cy, s * 0.3, s * 0.3, false); g.beginPath(); g.moveTo(cx + s * 0.3, cy); g.lineTo(cx + s * 0.6, cy + s * 0.3); g.moveTo(cx + s * 0.6, cy); g.lineTo(cx + s * 0.3, cy + s * 0.3); g.stroke(); break;
    case 'goo': g.beginPath(); for (let i = 0; i <= 8; i++) { const x = cx - s * 0.6 + i * s * 0.15, y = cy + (i % 2 ? -s * 0.08 : s * 0.08); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); g.beginPath(); g.moveTo(cx - s * 0.6, cy + s * 0.3); g.lineTo(cx + s * 0.6, cy + s * 0.3); g.stroke(); break;
    default: break;
  }
}

/** Compose the sign texture: sign_plate.png base + stenciled text + pictogram. */
export function makeSignTexture(G, { title = '', sub = '', icon = '', w = 512, h = 384 }) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const base = G.assets.tex('sign_plate').image;
  try { g.drawImage(base, 0, 0, w, h); } catch (e) { g.fillStyle = '#d8d6ce'; g.fillRect(0, 0, w, h); }
  g.fillStyle = 'rgba(216,214,206,0.55)'; g.fillRect(0, 0, w, h);                       // keep text legible on any plate art
  g.strokeStyle = '#1d1f22'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = '#1d1f22'; g.textBaseline = 'top'; g.textAlign = 'left';
  g.font = fontStr(Math.round(h * 0.17)); g.fillText(title, 32, 28, w - 64);
  g.fillRect(32, 28 + h * 0.2, w - 64, 4);
  g.font = fontStr(Math.round(h * 0.085), false); g.fillText(sub, 32, 28 + h * 0.23, w - 64);
  if (icon) drawIcon(g, icon, w / 2, h * 0.7, h * 0.32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class Sign {
  constructor(G, level, data) {
    this.G = G;
    const [w, h] = data.size || [1.2, 0.9];
    this.tex = makeSignTexture(G, { title: data.title, sub: data.sub, icon: data.icon, w: 512, h: Math.round(512 * h / w / 8) * 8 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), unlit(this.tex));
    this.mesh.position.fromArray(data.pos); this.mesh.rotation.y = (data.yaw || 0) * DEG;
    G.scene.add(this.mesh);
  }
  dispose() { this.G.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.tex.dispose(); }
}

// ---------------------------------------------------------------------------------------------------- exit
export class Exit {
  constructor(G, level, data) {
    this.G = G; this.level = level;
    this.min = data.min; this.max = data.max; this.fired = false; this.t = 0;
    const w = data.max[0] - data.min[0], d = data.max[2] - data.min[2];
    this.tex = makeSignTexture(G, { title: 'EXIT', sub: '', icon: '', w: 512, h: 256 });
    const geo = new THREE.PlaneGeometry(Math.min(w, 2.4), Math.min(d, 1.2)); geo.rotateX(-Math.PI / 2);
    this.marker = new THREE.Mesh(geo, unlit(this.tex));
    this.marker.position.set((data.min[0] + data.max[0]) / 2, data.min[1] + 0.015, (data.min[2] + data.max[2]) / 2);
    this.beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.assets.tex('glow'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffe0a0 }));
    this.beacon.position.set(this.marker.position.x, data.min[1] + 1.4, this.marker.position.z); this.beacon.scale.set(0.9, 1.8, 1);
    G.scene.add(this.marker, this.beacon);
  }
  update(dt) {
    this.t += dt;
    this.beacon.material.opacity = 0.45 + 0.2 * Math.sin(this.t * 3);
    const c = this.G.player.cap;
    if (!this.fired && c.x > this.min[0] && c.x < this.max[0] && c.z > this.min[2] && c.z < this.max[2] && c.y > this.min[1] - 0.3 && c.y < this.max[1]) {
      this.fired = true; this.G.game.completeLevel();
    }
  }
  center(out) { return out.copy(this.marker.position); }
  dispose() { this.G.scene.remove(this.marker, this.beacon); this.marker.geometry.dispose(); this.marker.material.dispose(); this.tex.dispose(); this.beacon.material.dispose(); }
}

// ---------------------------------------------------------------------------------------------------- goo
export class Goo {
  constructor(G, level, data) {
    this.G = G; this.level = level; this.min = data.min; this.max = data.max; this.top = data.max[1];
    const w = data.max[0] - data.min[0], d = data.max[2] - data.min[2], m = CONFIG.textures.goo.meters;
    const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / m, uv.getY(i) * d / m);
    this.mesh = new THREE.Mesh(geo, unlit(G.assets.tex('goo'), { transparent: true, opacity: 0.93 }));
    this.mesh.position.set((data.min[0] + data.max[0]) / 2, this.top, (data.min[2] + data.max[2]) / 2);
    G.scene.add(this.mesh);
    this.cool = 0;
  }
  update(dt) {
    const G = this.G;
    G.assets.tex('goo').offset.x += dt * 0.025; G.assets.tex('goo').offset.y += dt * 0.012;
    this.cool -= dt;
    const c = G.player.cap;
    if (this.cool <= 0 && c.x > this.min[0] && c.x < this.max[0] && c.z > this.min[2] && c.z < this.max[2] && c.y < this.top - 0.05 && c.y > this.min[1] - 1) {
      this.cool = 1;
      _v.set(c.x, this.top, c.z); G.vfx.smokePuff(_v, 6); G.vfx.sparks(_v, new THREE.Vector3(0, 1, 0), 0x9bd54a, 14);
      G.audio.play('goo_splash', { pos: _v }); G.game.respawnPlayer();
    }
    for (const cube of this.level.cubes) {
      if (cube.dead) continue;
      const q = cube.body.translation();
      if (q.x > this.min[0] && q.x < this.max[0] && q.z > this.min[2] && q.z < this.max[2] && q.y < this.top) cube.disintegrate('goo_splash');
    }
  }
  dispose() { this.G.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// ---------------------------------------------------------------------------------------------------- fizzler
export class Fizzler {
  constructor(G, level, data) {
    this.G = G; this.level = level;
    this.axis = data.axis === 'x' ? 'x' : 'z';
    this.center = new THREE.Vector3().fromArray(data.pos);
    this.w = data.size[0]; this.h = data.size[1];
    this.normal = this.axis === 'z' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    this.side = this.axis === 'z' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const tex = G.assets.tex('fizzler_grid');
    const geo = new THREE.PlaneGeometry(this.w, this.h);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * this.w, uv.getY(i) * this.h);
    this.grid = new THREE.Mesh(geo, unlit(tex, { transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.grid.position.copy(this.center); this.grid.rotation.y = this.axis === 'z' ? 0 : Math.PI / 2; this.grid.renderOrder = 4;
    this.posts = [];
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(tiledBox(0.3, this.h + 0.1, 0.3, 2), lit(G.assets.tex('wall_dark')));
      post.position.copy(this.center).addScaledVector(this.side, s * (this.w / 2 + 0.05));
      this.posts.push(post); G.scene.add(post);
    }
    G.scene.add(this.grid);
    this.hum = G.audio.loop('fizzler_hum', this.center, 0.8);
    this.cool = 0; this.t = 0; this.lu = 0; this.lv = 0; this.ln = 0;
    this.tex = tex;
  }

  /** local coordinates of world point p: along plane (u), up (v), and distance to the plane (n) */
  _local(p) { _v.copy(p).sub(this.center); this.lu = _v.dot(this.side); this.lv = _v.y; this.ln = _v.dot(this.normal); }

  update(dt) {
    const G = this.G; this.t += dt;
    this.tex.offset.y -= dt * 0.35;
    this.grid.material.opacity = 0.5 + 0.12 * Math.sin(this.t * 9);
    this.cool -= dt;
    for (const c of this.level.cubes) {
      if (c.dead) continue;
      const q = c.body.translation(); _v.set(q.x, q.y, q.z);
      this._local(_v);
      if (Math.abs(this.ln) < 0.35 && Math.abs(this.lu) < this.w / 2 + 0.2 && Math.abs(this.lv) < this.h / 2 + 0.2) c.disintegrate();
    }
    const cap = G.player.cap;
    _v.set(cap.x, cap.y + 0.9, cap.z);
    this._local(_v);
    if (this.cool <= 0 && Math.abs(this.ln) < 0.25 && Math.abs(this.lu) < this.w / 2 && Math.abs(this.lv) < this.h / 2 + 0.9) {
      this.cool = 1.0;
      G.vfx.sparks(_v, this.normal, 0xbfefff, 16);
      G.audio.play('fizzle_zap', { pos: _v });
      if (G.portals.clearAll(false)) G.ui.toast && G.ui.toast('PORTALS CLEARED');
    }
  }

  dispose() {
    const G = this.G;
    if (this.hum) this.hum.stop();
    G.scene.remove(this.grid, ...this.posts);
    this.grid.geometry.dispose(); this.grid.material.dispose();
    for (const p of this.posts) { p.geometry.dispose(); p.material.dispose(); }
  }
}

// ---------------------------------------------------------------------------------------------------- factory
export function createProp(G, level, data) {
  switch (data.type) {
    case 'cube': return new Cube(G, level, data);
    case 'button': return new Button(G, level, data);
    case 'door': return new Door(G, level, data);
    case 'exit': return new Exit(G, level, data);
    case 'goo': return new Goo(G, level, data);
    case 'fizzler': return new Fizzler(G, level, data);
    case 'sign': return new Sign(G, level, data);
    case 'terminal': return G.ui.createTerminal(data);
    default: console.warn('[PortalLab] unknown prop type', data.type); return null;
  }
}
