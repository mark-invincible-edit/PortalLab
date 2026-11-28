// Minimal stand-in for three.js, ONLY for tools/test_turret.mjs: real Vector3 math, no-op scene graph, a fake AnimationMixer that completes LoopOnce clips.
export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(k) { this.x = this.y = this.z = k; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  fromArray(a) { this.x = a[0]; this.y = a[1]; this.z = a[2]; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  setY(y) { this.y = y; return this; }
  setComponent(i, v) { if (i === 0) this.x = v; else if (i === 1) this.y = v; else this.z = v; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  applyQuaternion() { return this; } applyMatrix4() { return this; } negate() { return this.multiplyScalar(-1); } lerp() { return this; } sub2() { return this; }
  setFromMatrixPosition() { return this; } distanceToSquared(v) { return (this.x - v.x) ** 2 + (this.y - v.y) ** 2 + (this.z - v.z) ** 2; }
}
export class Quaternion { constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; } set() { return this; } copy() { return this; } setFromUnitVectors() { return this; } setFromAxisAngle() { return this; } setFromEuler() { return this; } multiply() { return this; } premultiply() { return this; } slerp() { return this; } invert() { return this; } clone() { return new Quaternion(); } setFromRotationMatrix() { return this; } }
export class Euler { constructor() {} set() { return this; } }
export class Matrix4 { constructor() {} compose() { return this; } invert() { return this; } multiply() { return this; } multiplyMatrices() { return this; } copy() { return this; } decompose() {} makeBasis() { return this; } lookAt() { return this; } }
export class Box3 { constructor() { this.min = new Vector3(); this.max = new Vector3(); this.e = true; } makeEmpty() { this.e = true; return this; } isEmpty() { return this.e; } copy() { return this; } applyMatrix4() { return this; } union() { return this; } getSize() { return this; } getCenter() { return this; } expandByObject() { return this; } setFromObject() { return this; } }
export class Plane { constructor() {} setFromNormalAndCoplanarPoint() { return this; } }
export class Object3D {
  constructor() { this.position = new Vector3(); this.scale = new Vector3(1, 1, 1); this.quaternion = new Quaternion(); this.rotation = { x: 0, y: 0, z: 0, set() {} }; this.children = []; this.parent = null; this.visible = true; this.name = ''; this.userData = {}; this.matrixWorld = new Matrix4(); }
  add(...o) { for (const c of o) { c.parent = this; this.children.push(c); } return this; }
  remove(c) { this.children = this.children.filter((x) => x !== c); return this; }
  traverse(f) { f(this); for (const c of this.children) c.traverse(f); }
  getWorldPosition(out) { out.copy(this.position); let p = this.parent; while (p) { out.add(p.position); p = p.parent; } return out; }
  updateMatrixWorld() {} updateWorldMatrix() {} clone() { const o = new this.constructor(); o.name = this.name; o.position.copy(this.position); for (const c of this.children) o.add(c.clone()); return o; }
  rotateX() { return this; } rotateZ() { return this; } lookAt() {} getWorldQuaternion(q) { return q; }
}
export class Group extends Object3D {}
export class Mesh extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true; } clone() { const o = new Mesh(this.geometry, this.material); o.name = this.name; o.position.copy(this.position); return o; } }
export class Sprite extends Object3D { constructor(m) { super(); this.material = m; this.isSprite = true; } }
export class Bone extends Object3D {}
export class BufferAttribute { constructor(a) { this.array = a; } }
class Geo { constructor() { this.attributes = { position: { count: 8, getY: (i) => -(i / 8) * 0.8 } }; } translate() { return this; } rotateX() { return this; } rotateZ() { return this; } setAttribute() { return this; } dispose() {} computeBoundingBox() { this.boundingBox = new Box3(); } }
export class CylinderGeometry extends Geo {} export class SphereGeometry extends Geo {} export class ConeGeometry extends Geo {} export class BoxGeometry extends Geo {} export class CircleGeometry extends Geo {} export class BufferGeometry extends Geo {} export class PlaneGeometry extends Geo {}
class Mat { constructor(o = {}) { Object.assign(this, o); this.color = { set() { return this; }, setRGB() { return this; }, copy() { return this; }, multiplyScalar() { return this; } }; } dispose() {} clone() { return new this.constructor(this); } }
export class MeshBasicMaterial extends Mat {} export class MeshStandardMaterial extends Mat { constructor(o) { super(o); this.isMeshStandardMaterial = true; } } export class SpriteMaterial extends Mat {} export class ShaderMaterial extends Mat {} export class MeshLambertMaterial extends Mat {}
export class Color { constructor() {} set() { return this; } copy() { return this; } lerp() { return this; } multiplyScalar() { return this; } setRGB() { return this; } }
export class Texture {} export class CanvasTexture extends Texture {}
export const DoubleSide = 2, AdditiveBlending = 2, LoopOnce = 2200, LoopRepeat = 2201, RepeatWrapping = 1000, SRGBColorSpace = 'srgb', NoToneMapping = 0, ACESFilmicToneMapping = 4;
// ---- fake animation system: LoopOnce clips finish after their duration
export class AnimationMixer {
  constructor() { this.actions = []; this.listeners = {}; this.time = 0; }
  clipAction(clip) {
    const m = this, a = { clip, enabled: false, t: 0, loop: LoopRepeat, weight: 0, fading: 0, done: false,
      reset() { this.t = 0; this.done = false; this.enabled = true; return this; }, setEffectiveTimeScale() { return this; }, setEffectiveWeight(w) { this.weight = w; return this; },
      fadeIn() { return this; }, fadeOut() { this.fading = 1; return this; }, play() { this.enabled = true; this.playing = true; return this; }, stop() { this.enabled = false; this.playing = false; return this; },
      setLoop(l) { this.loop = l; return this; }, clampWhenFinished: false };
    this.actions.push(a); return a;
  }
  addEventListener(n, f) { (this.listeners[n] ||= []).push(f); }
  update(dt) {
    for (const a of this.actions) {
      if (!a.enabled || !a.playing) continue;
      a.t += dt;
      if (a.loop === LoopOnce && !a.done && a.t >= a.clip.duration) { a.done = true; for (const f of this.listeners.finished || []) f({ action: a }); }
    }
  }
  stopAllAction() {}
}
export class Raycaster {} export class Vector2 {} export class WebGLRenderTarget {} export class PerspectiveCamera {} export class Scene {} export class PMREMGenerator {}
export class InstancedMesh {} export class Line {} export class LineSegments {} export class BufferGeometry2 {}
// addon stand-ins (the test copies map every 'three/addons/...' import to this file too)
export const clone = (o) => o.clone();
export class GLTFLoader {} export class RoomEnvironment {} export function mergeGeometries() { return null; }
