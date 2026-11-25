// One portal: a quad with a shader that shows the live render target (or a swirl fill), an animated rim and
// open/close animation. The quad's screen-space UV comes from its own clip position, which matches the
// projection used to render the per-eye render target (see manager.js).
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { easeOutCubic } from '../core/util.js';

const VERT = /* glsl */`
varying vec2 vUv; varying vec4 vClip;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vClip = gl_Position;
}`;

const FRAG = /* glsl */`
uniform sampler2D uMap; uniform sampler2D uNoise;
uniform float uHasMap; uniform float uTime; uniform float uOpen; uniform float uPow;
uniform vec3 uColor; uniform vec3 uRim; uniform vec2 uAspect;
varying vec2 vUv; varying vec4 vClip;
void main(){
  // normalized shape coordinates: r == 1.0 at the portal edge (superellipse: oval / rounded rect)
  vec2 q = (vUv * 2.0 - 1.0) * uAspect;
  float sc = max(uOpen, 0.001);
  vec2 qs = abs(q) / sc;
  float r = pow(pow(qs.x, uPow) + pow(qs.y, uPow), 1.0 / uPow);
  float n  = texture2D(uNoise, vUv * vec2(1.0, 1.6) + vec2(uTime * 0.12, -uTime * 0.32)).r;
  float n2 = texture2D(uNoise, vUv * 2.3 + vec2(-uTime * 0.21, uTime * 0.17)).r;
  float edge = r + (n - 0.5) * 0.10;
  float body = 1.0 - smoothstep(0.90, 0.97, edge);
  float rim  = smoothstep(0.82, 0.93, edge) * (1.0 - smoothstep(0.99, 1.10, edge));
  float ring = exp(-pow((r - 1.0) * 7.0, 2.0)) * (1.0 - uOpen) * 1.5;   // ripple while opening / collapsing
  vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
  vec3 view = texture2D(uMap, suv).rgb;
  vec3 fill = uColor * (0.30 + 0.55 * n2);
  vec3 col = mix(fill, view, uHasMap);
  col *= 1.0 - 0.30 * smoothstep(0.6, 0.95, edge);
  vec3 rimCol = uRim * (1.1 + 0.9 * n) + vec3(ring);
  col = mix(col, rimCol, clamp(rim + ring * 0.5, 0.0, 1.0));
  float a = max(body, rim) * clamp(uOpen * 2.0, 0.0, 1.0);
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

const _basis = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);

export class Portal {
  constructor(id, G) {
    this.id = id;
    const c = CONFIG.portal;
    this.w = c.width; this.h = c.height;
    this.active = false;          // logical state (teleporting, collision hole)
    this.place = null;            // placement result from findPlacement (also used as "other" for validation)
    this.pos = new THREE.Vector3(); this.normal = new THREE.Vector3(); this.up = new THREE.Vector3(); this.right = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.matrix = new THREE.Matrix4(); this.matrixInv = new THREE.Matrix4();
    this.anim = 0;                // visual open amount 0..1
    this.color = id === 0 ? c.colors.blue : c.colors.orange;
    const rim = id === 0 ? c.colors.blueRim : c.colors.orangeRim;

    const m = c.quadMargin;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: {
        uMap: { value: null }, uNoise: { value: G.assets.tex('portal_noise') },
        uHasMap: { value: 0 }, uTime: { value: 0 }, uOpen: { value: 0 }, uPow: { value: c.shapePower },
        uColor: { value: new THREE.Color(this.color) }, uRim: { value: new THREE.Color(rim) },
        uAspect: { value: new THREE.Vector2((c.width / 2 + m) / (c.width / 2), (c.height / 2 + m) / (c.height / 2)) },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(c.width + 2 * m, c.height + 2 * m), this.material);
    this.mesh.renderOrder = 5; this.mesh.visible = false; this.mesh.name = 'portal' + id;
  }

  set(pl) {
    this.place = pl; this.active = true; this.anim = 0;
    this.normal.fromArray(pl.normal); this.up.fromArray(pl.up); this.right.fromArray(pl.right);
    this.pos.fromArray(pl.center).addScaledVector(this.normal, CONFIG.portal.surfaceOffset);
    _basis.makeBasis(this.right, this.up, this.normal);          // columns: x = right, y = up, z = normal (out of the wall)
    this.quat.setFromRotationMatrix(_basis);
    this.matrix.compose(this.pos, this.quat, _one);
    this.matrixInv.copy(this.matrix).invert();
    this.mesh.position.copy(this.pos); this.mesh.quaternion.copy(this.quat);
    this.mesh.visible = true;
  }

  update(dt, time) {
    const c = CONFIG.portal;
    if (this.active) this.anim = Math.min(1, this.anim + dt / c.openTime);
    else this.anim = Math.max(0, this.anim - dt / c.closeTime);
    this.mesh.visible = this.anim > 0.002;
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uOpen.value = this.active ? easeOutCubic(this.anim) : this.anim;
  }
}
