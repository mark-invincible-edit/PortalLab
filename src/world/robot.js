// HESTIA, the facility AI: an original character (not GLaDOS). A glossy hanging eye-unit on a cable bundle.
//  - the head turns to look at the player's head (smoothed), with a slow idle sway
//  - the iris pulses with the voice (G.voice.level) and shifts color with her mood (calm amber / angry red / low-power dim)
//  - G.voice plays her speech from head position (spatial audio) via robot.speakPos()
// Level data: { type: 'robot', pos: [x, y, z], ceiling: y of the cable anchor (default pos.y + 1.2), scale: 1 }
import * as THREE from 'three';
import { solidMat, glowMat } from '../core/materials.js';

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _t = new THREE.Vector3();
const AMBER = new THREE.Color(0xffb04a), RED = new THREE.Color(0xff3a22), DIM = new THREE.Color(0x6a4a22);

export class Robot {
  constructor(G, level, data) {
    this.G = G; this.level = level;
    const s = data.scale || 1;
    this.group = new THREE.Group(); this.group.position.fromArray(data.pos); this.group.scale.setScalar(s);
    this.head = new THREE.Group(); this.group.add(this.head);
    this.geos = []; this.mats = [];
    const g = (geo) => { this.geos.push(geo); return geo; };
    const m = (mat) => { this.mats.push(mat); return mat; };
    const shell = m(solidMat(G, 0x1a1d21, 0.22, 0.85)), metal = m(solidMat(G, 0xc7cbd0, 0.3, 0.9)), dark = m(solidMat(G, 0x0c0d0f, 0.6, 0.4));
    const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g(geo), mat); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };

    add(this.head, new THREE.SphereGeometry(0.34, 36, 24), shell);
    const ring = add(this.head, new THREE.TorusGeometry(0.205, 0.034, 14, 44), metal, 0, 0, 0.285);
    add(this.head, new THREE.TorusGeometry(0.255, 0.016, 10, 44), dark, 0, 0, 0.27);
    add(this.head, new THREE.CylinderGeometry(0.075, 0.075, 0.2, 16).rotateZ(Math.PI / 2), metal, 0.355, 0, 0);       // side servos
    add(this.head, new THREE.CylinderGeometry(0.075, 0.075, 0.2, 16).rotateZ(Math.PI / 2), metal, -0.355, 0, 0);
    for (const sx of [-1, 1]) { const a = add(this.head, new THREE.BoxGeometry(0.03, 0.15, 0.2), dark, sx * 0.25, 0.22, 0.12); a.rotation.z = -sx * 0.4; }   // brow plates
    this.iris = new THREE.Mesh(g(new THREE.CircleGeometry(0.175, 40)), m(glowMat(0xffb04a)));
    this.iris.position.z = 0.292; this.head.add(this.iris);
    this.pupil = new THREE.Mesh(g(new THREE.CircleGeometry(0.06, 24)), m(glowMat(0xfff0cf)));
    this.pupil.position.z = 0.295; this.head.add(this.pupil);
    this.glow = new THREE.Sprite(m(new THREE.SpriteMaterial({ map: G.assets.tex('glow'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffa040, opacity: 0.55 })));
    this.glow.scale.setScalar(1.2); this.glow.position.z = 0.34; this.head.add(this.glow);
    ring.rotation.z = 0;

    // cable bundle from the ceiling anchor down to the head (does not turn with the head)
    const top = (data.ceiling ?? data.pos[1] + 1.2) - data.pos[1], len = Math.max(0.3, top / s - 0.3);
    const cable = add(this.group, new THREE.CylinderGeometry(0.055, 0.055, len, 10), dark, 0, 0.3 + len / 2, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2, c2 = add(this.group, new THREE.CylinderGeometry(0.018, 0.018, len, 6), dark, Math.cos(a) * 0.09, 0.3 + len / 2, Math.sin(a) * 0.09);
      c2.castShadow = false;
    }
    cable.castShadow = false;
    add(this.group, new THREE.CylinderGeometry(0.16, 0.2, 0.1, 18), metal, 0, 0.3 + len, 0);                         // ceiling mount
    G.scene.add(this.group);
    this.t = Math.random() * 10; this.mood = 'calm'; this.pulse = 0;
    this.pos = this.group.position;
    this.color = new THREE.Color().copy(AMBER);
    this.q = new THREE.Quaternion(); this.head.quaternion.identity();
  }

  /** Where her voice comes from. */
  speakPos(out) { return out.copy(this.group.position); }

  update(dt) {
    const G = this.G; this.t += dt;
    // look at the player's head
    _t.copy(G.player.head);
    _p.copy(this.group.position);
    _m.lookAt(_t, _p, UP);                                    // Object3D convention: +Z of the head points at the target
    _q.setFromRotationMatrix(_m);
    // idle sway
    _q.multiply(this.q.setFromEuler(new THREE.Euler(Math.sin(this.t * 0.7) * 0.04, Math.sin(this.t * 0.5 + 1) * 0.05, 0)));
    this.head.quaternion.slerp(_q, 1 - Math.exp(-4 * dt));
    this.group.position.y += 0;                                // (cable keeps it from drifting; kept for clarity)

    // voice reaction
    const V = G.voice, lv = V && V.speaking ? V.level : 0;
    this.pulse += (lv - this.pulse) * (1 - Math.exp(-18 * dt));
    const dead = G.health && G.health.dead;
    const target = dead ? RED : (this.mood === 'angry' ? RED : AMBER);
    this.color.lerp(target, 1 - Math.exp(-3 * dt));
    const flicker = dead ? 0.6 + 0.4 * Math.sin(this.t * 40) : 1;
    this.iris.material.color.copy(this.color).multiplyScalar(0.8 + 0.6 * this.pulse);
    this.iris.scale.setScalar(1 + 0.22 * this.pulse);
    this.glow.material.color.copy(this.color);
    this.glow.material.opacity = (0.35 + 0.55 * this.pulse) * flicker;
    this.glow.scale.setScalar(1.1 + 0.5 * this.pulse);
  }

  dispose() {
    this.G.scene.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
