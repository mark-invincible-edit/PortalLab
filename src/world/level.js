// Level: builds geometry + colliders + props from a data file (see src/levels/*.js and the README format section).
//  - Static slabs are merged per texture into one mesh each (few draw calls). UVs are world-aligned in meters.
//  - Each slab has Rapier box colliders. An open portal cuts a hole through the slab(s) it sits on (the footprint box,
//    full thickness) so the player and cubes can pass; closing the portal restores the colliders.
//  - `solids` = slabs + moving door boxes. It is used for analytic raycasts (shots, carrying, placement validation).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config.js';
import { subtractBox, boxesOverlap, raycastSlabs } from '../core/geom.js';
import { createProp, BlobShadow } from './props.js';
import { stdMat, glowMat } from '../core/materials.js';
import { DEG, warn } from '../core/util.js';

const DEFAULT_TEX = { portalable: 'wall_white', nonportalable: 'wall_dark', glass: 'glass' };

/** Box geometry with world-aligned UVs (meters / metersPerTile). Position is baked into the vertices. */
function worldBox(min, max, meters) {
  const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    let u, v;
    if (nx > 0.5) { u = p.getZ(i); v = p.getY(i); } else if (ny > 0.5) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u / meters, v / meters);
  }
  return g;
}

export class Level {
  constructor(G, data) {
    this.G = G; this.data = data;
    this.slabs = []; this.solids = []; this.holes = [null, null];
    this.group = new THREE.Group(); this.group.name = 'level:' + data.id;
    this.props = []; this.cubes = []; this.buttons = new Map(); this.doors = new Map(); this.exits = [];
    this.links = data.links || [];
    this.checkpoints = (data.checkpoints || []).map((c) => ({ min: c.min, max: c.max, pos: c.pos, yaw: c.yaw || 0 }));
    this.checkpoint = { pos: new THREE.Vector3().fromArray(data.spawn.pos), yaw: (data.spawn.yaw || 0) * DEG };
    this.materials = []; this.geometries = [];
    this.lightSpots = []; this.robot = null; this.turrets = [];
    this.time = 0;
    this._build();
  }

  get killY() { return this.data.killY ?? -20; }

  _build() {
    const G = this.G;
    for (const s of this.data.slabs) {
      if (!s.min || !s.max) { warn('slab without min/max skipped', s); continue; }
      const slab = { min: s.min.slice(), max: s.max.slice(), surface: s.surface || 'portalable', tex: s.tex || DEFAULT_TEX[s.surface || 'portalable'], colliders: [] };
      this.slabs.push(slab); this.solids.push(slab);
    }
    // merged visuals per texture. Ceilings go into their own mesh that does not CAST shadows (otherwise the key light would be blocked and every
    // room would be pitch black); they still receive them.
    const groups = new Map();
    for (const s of this.slabs) {
      const tex = s.surface === 'glass' ? 'glass' : s.tex;
      const ceiling = this._isCeiling(s);
      const key = tex + (ceiling ? '|ceil' : '');
      const meters = (CONFIG.textures[tex] || { meters: 2 }).meters;
      if (!groups.has(key)) groups.set(key, { tex, ceiling, list: [] });
      groups.get(key).list.push(worldBox(s.min, s.max, meters));
    }
    for (const [name, grp] of groups) {
      const geo = mergeGeometries(grp.list, false);
      grp.list.forEach((g) => g.dispose());
      const isGlass = grp.tex === 'glass';
      const mat = isGlass
        ? stdMat(G, 'glass', { transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.04, metalness: 0.0, envMapIntensity: 1.6, bumpMap: null })
        : stdMat(G, grp.tex);
      const mesh = new THREE.Mesh(geo, mat); mesh.name = 'slabs:' + name;
      mesh.castShadow = !grp.ceiling && !isGlass; mesh.receiveShadow = !isGlass;
      if (isGlass) mesh.renderOrder = 3;
      this.group.add(mesh); this.geometries.push(geo); this.materials.push(mat);
    }
    this._buildLights();
    G.scene.add(this.group);
    for (const s of this.slabs) this._rebuildSlab(s);

    for (const p of this.data.props || []) {
      const obj = createProp(G, this, p);
      if (!obj) continue;
      this.props.push(obj);
      if (p.type === 'cube') this.cubes.push(obj);
      if (p.type === 'button') this.buttons.set(p.id, obj);
      if (p.type === 'door') this.doors.set(p.id, obj);
      if (p.type === 'exit') this.exits.push(obj);
      if (p.type === 'robot' && !this.robot) this.robot = obj;
      if (p.type === 'turret' || p.type === 'sentry') this.turrets.push(obj);
    }
    this.playerShadow = new BlobShadow(G, this);
    G.audio.setAmbience(this.data.ambience || null);
  }

  _isCeiling(s) {
    const h = s.max[1] - s.min[1], w = s.max[0] - s.min[0], d = s.max[2] - s.min[2];
    return h <= 1.0 && s.min[1] >= 2.0 && w >= 2 && d >= 2;
  }

  /**
   * Ceiling light panels (emissive, merged into one draw call) + the list of light spots the pooled point lights are assigned to.
   * data.lights = [{pos, color?, intensity?, dist?, panel?}] overrides the automatic placement (use it for very tall rooms).
   */
  _buildLights() {
    const G = this.G, spots = this.lightSpots, panels = [];
    const add = (x, y, z, o = {}) => {
      spots.push({ pos: new THREE.Vector3(x, y, z), color: o.color ?? 0xfff0dd, intensity: o.intensity ?? 22, dist: o.dist ?? 14 });
      if (o.panel !== false) { const g = new THREE.BoxGeometry(1.5, 0.05, 0.6); g.translate(x, y + 0.48, z); panels.push(g); }
    };
    if (this.data.lights) for (const l of this.data.lights) add(l.pos[0], l.pos[1], l.pos[2], l);
    else {
      for (const s of this.slabs) {
        if (!this._isCeiling(s) || spots.length >= 28) continue;
        const w = s.max[0] - s.min[0], d = s.max[2] - s.min[2];
        const nx = Math.max(1, Math.round(w / 6.5)), nz = Math.max(1, Math.round(d / 6.5));
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) add(s.min[0] + w * (i + 0.5) / nx, s.min[1] - 0.5, s.min[2] + d * (j + 0.5) / nz);
      }
    }
    if (panels.length) {
      const geo = mergeGeometries(panels, false); panels.forEach((g) => g.dispose());
      const mat = glowMat(0xfff4e2), mesh = new THREE.Mesh(geo, mat); mesh.name = 'lightPanels';
      this.group.add(mesh); this.geometries.push(geo); this.materials.push(mat);
    }
    if (G.lighting) G.lighting.setLevel(this);
  }

  // ------------------------------------------------------------------ collision holes for portals
  _rebuildSlab(s) {
    const phys = this.G.physics;
    for (const c of s.colliders) phys.removeCollider(c);
    s.colliders.length = 0;
    let pieces = [{ min: s.min, max: s.max }];
    for (const h of this.holes) if (h) pieces = pieces.flatMap((p) => subtractBox(p, h));
    for (const p of pieces) s.colliders.push(phys.addStaticBox(p.min, p.max));
  }

  /** Cut (or restore, with box = null) the collision hole of portal `id`. */
  setHole(id, box) {
    const old = this.holes[id];
    this.holes[id] = box;
    for (const s of this.slabs) if ((old && boxesOverlap(s, old)) || (box && boxesOverlap(s, box))) this._rebuildSlab(s);
    if (!box && old && this.G.player) this.G.player.depenetrate(this);      // closing a portal while standing in its hole
  }

  // ------------------------------------------------------------------ queries
  raycast(ox, oy, oz, dx, dy, dz, maxT, out) { return raycastSlabs(this.solids, ox, oy, oz, dx, dy, dz, maxT, out); }

  /** A door is wanted open when every button linked to it is pressed (and it has at least one link). */
  doorWanted(id) {
    let any = false;
    for (const l of this.links) {
      if (l.door !== id) continue;
      any = true;
      const b = this.buttons.get(l.button);
      if (!b || !b.pressed) return false;
    }
    return any;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    this.time += dt;
    for (const p of this.props) if (p.update) p.update(dt);
    const c = this.G.player.cap;
    for (const cp of this.checkpoints) {
      if (c.x > cp.min[0] && c.x < cp.max[0] && c.y > cp.min[1] - 0.3 && c.y < cp.max[1] && c.z > cp.min[2] && c.z < cp.max[2]) {
        if (this.checkpoint.pos.x !== cp.pos[0] || this.checkpoint.pos.z !== cp.pos[2]) {
          this.checkpoint.pos.fromArray(cp.pos); this.checkpoint.yaw = cp.yaw * DEG;
          this.G.audio.play('checkpoint'); if (this.G.ui) this.G.ui.toast('CHECKPOINT');
        }
      }
    }
    this.playerShadow.update(c.x, c.y + 0.3, c.z, 0.9);
  }

  dispose() {
    const G = this.G;
    for (const p of this.props) if (p && p.dispose) p.dispose();
    for (const s of this.slabs) { for (const c of s.colliders) G.physics.removeCollider(c); s.colliders.length = 0; }
    G.scene.remove(this.group);
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.playerShadow.dispose();
    this.holes = [null, null];
  }
}
