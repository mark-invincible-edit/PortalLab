// Renderer / scene / player rig.
//   scene -> rig (Group, moved by locomotion, yaw only) -> camera (+ XR controllers added by Input)
// The camera's LOCAL transform is the headset pose (XR) or (0, eyeHeight, 0) + pitch (desktop).
// We take control of XR camera updates (cameraAutoUpdate = false) so that we can place the rig first and
// compute portal views from the final eye poses in the same frame.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { warn } from './util.js';

const VIGNETTE_VERT = /* glsl */`
varying vec2 vP;
void main(){ vP = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const VIGNETTE_FRAG = /* glsl */`
varying vec2 vP; uniform float uS; uniform float uI; uniform float uO;
void main(){ float r = length(vP * vec2(0.85, 1.0)); gl_FragColor = vec4(0.0, 0.0, 0.0, smoothstep(uI, uO, r) * uS); }`;

export function createRenderer() {
  const cfg = CONFIG.render;
  const renderer = new THREE.WebGLRenderer({ antialias: cfg.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(cfg.clearColor);
  renderer.shadowMap.enabled = false;               // no real-time shadows (Quest); blob shadows are used instead
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFramebufferScaleFactor(CONFIG.xr.framebufferScale);
  renderer.xr.cameraAutoUpdate = false;
  document.getElementById('app').appendChild(renderer.domElement);
  renderer.domElement.id = 'gl';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, cfg.nearPlane, cfg.farPlane);
  const rig = new THREE.Group(); rig.name = 'rig';
  rig.add(camera); scene.add(rig);

  scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x3a3e44, 1.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(3, 9, 4); scene.add(sun);

  // Comfort vignette: full-screen triangle in clip space so it covers each eye's viewport exactly (VFX, no texture).
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const vmat = new THREE.ShaderMaterial({
    vertexShader: VIGNETTE_VERT, fragmentShader: VIGNETTE_FRAG, transparent: true, depthTest: false, depthWrite: false,
    uniforms: { uS: { value: 0 }, uI: { value: CONFIG.comfort.vignetteInner }, uO: { value: CONFIG.comfort.vignetteOuter } },
  });
  const vignette = new THREE.Mesh(geo, vmat);
  vignette.frustumCulled = false; vignette.renderOrder = 1000; vignette.visible = false;
  scene.add(vignette);

  window.addEventListener('resize', () => {
    if (renderer.xr.isPresenting) return;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  });

  return { renderer, scene, camera, rig, vignette };
}

/** Ask for an immersive-vr session. Resolves to true when the session started. */
export async function enterVR(renderer, onEnd) {
  if (!navigator.xr) throw new Error('WebXR is not available in this browser.');
  const opts = { optionalFeatures: ['local-floor', 'bounded-floor'] };
  const session = await navigator.xr.requestSession('immersive-vr', opts);
  renderer.xr.setFramebufferScaleFactor(CONFIG.xr.framebufferScale);
  await renderer.xr.setSession(session);
  try { renderer.xr.setFoveation(CONFIG.xr.foveation); } catch (e) { warn('foveation not supported', e); }
  session.addEventListener('end', () => { if (onEnd) onEnd(); });
  return true;
}

export async function xrSupported() {
  try { return !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')); } catch (e) { return false; }
}
