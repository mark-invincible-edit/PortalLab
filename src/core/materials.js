// Shared material factory. Everything that was Lambert before is now physically based (MeshStandardMaterial) with a per-texture
// roughness / metalness preset, the generated environment map for reflections / ambient light and (optionally) the albedo as a bump map
// so panel grooves catch the light. The albedo PNGs are still the only art input: no normal / roughness maps are required.
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export const PRESETS = {
  wall_white:    { rough: 0.62, metal: 0.00, bump: 0.9, env: 0.9 },
  wall_dark:     { rough: 0.45, metal: 0.35, bump: 0.6, env: 1.0 },
  floor_tile:    { rough: 0.52, metal: 0.06, bump: 0.9, env: 1.0 },
  door_panel:    { rough: 0.45, metal: 0.40, bump: 0.7, env: 1.0 },
  cube_weighted: { rough: 0.40, metal: 0.35, bump: 0.5, env: 1.1 },
  button_pad:    { rough: 0.45, metal: 0.35, bump: 0.5, env: 1.0 },
  hazard_stripe: { rough: 0.55, metal: 0.10, bump: 0.0, env: 0.8 },
  ui_plate:      { rough: 0.50, metal: 0.30, bump: 0.0, env: 1.0 },
  _default:      { rough: 0.6,  metal: 0.05, bump: 0.0, env: 0.9 },
};

/** PBR material for a manifest texture key. extra: any MeshStandardMaterial parameters (override the preset). */
export function stdMat(G, texKey, extra = {}) {
  const p = PRESETS[texKey] || PRESETS._default;
  const map = texKey ? G.assets.tex(texKey) : null;
  const m = new THREE.MeshStandardMaterial({
    map, roughness: p.rough, metalness: p.metal,
    envMap: G.envMap || null, envMapIntensity: CONFIG.render.envIntensity * p.env,
    ...(p.bump > 0 && map ? { bumpMap: map, bumpScale: p.bump } : {}),
    ...extra,
  });
  return m;
}

/** Plain colored PBR material (robot, fallback turret). */
export function solidMat(G, color, rough = 0.4, metal = 0.6, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMap: G.envMap || null, envMapIntensity: CONFIG.render.envIntensity * 1.2, ...extra });
}

/** Glowing material that ignores lighting and tone mapping (light panels, eyes). */
export function glowMat(color, extra = {}) { return new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra }); }
