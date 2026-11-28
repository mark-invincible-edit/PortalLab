# PortalLab

A first-person WebXR portal-puzzle game for **Meta Quest 2/3 (Quest Browser)** that also runs on **desktop** (mouse + keyboard) and in the
**Immersive Web Emulator** extension. Plain ES modules, **no build step**, hosted as static files (GitHub Pages).
All names, art and audio are original (placeholders are generated at runtime until you add your own files).

> **Status / honesty note:** this project was written without access to a browser, a headset or the CDN.
> It is syntax-checked, statically cross-checked (imports, config keys, asset keys), and the level geometry + portal placement
> logic is unit-tested in Node (`tools/`). **The WebXR rendering, Rapier physics and IK code has not been run.**
> Expect to do a first-boot debugging pass; "Troubleshooting" and "Known limitations" below list the most likely spots.

## What's new in 1.1

| Area | Change |
|---|---|
| **VR arms** | Fixed the warping / twisting arms and the huge or tiny hands. Cause: arm bones were rotated by the minimal swing from *last frame's* pose, so twist accumulated while you moved, and the hand was then forced to the controller orientation with no limit (candy-wrapper pinch at the wrist). Now every bone orientation is computed from scratch each frame (`src/player/armsolve.js`), the controller twist is spread over upper arm / forearm / wrist, and the wrist is clamped (`body.limits`). Bone scale is also reset every frame. |
| **Desktop hand** | The IK used to target the gun's root, which is the camera, so the hand sat inside your face. The arm now grips the gun (`gun.handNode` = where the VR controller grip would be). The other hand reaches to the side of a carried cube. |
| **Carrying through portals** | The held cube now chases the nearest of {real target, its images through both portals}, so it flies *into* the portal instead of through walls toward your body. When you walk through a portal the held cube comes along. It is only dropped after `gun.carryLostTime` s of being unable to follow. Releasing keeps velocity, so you can throw. |
| **Half-invisible cubes** | A cube half way through a portal now has a clipped ghost copy on the other side (`src/portals/ghosts.js`). |
| **Seeing yourself** | The head is shown while portal views render (hidden in the main view). |
| **Graphics** | PBR materials, generated environment map, ACES tone mapping, fog, a shadow-casting key light that follows you (desktop), pooled ceiling lights with emissive panels, portal glow lights, procedural fallback textures. Quality LOW / MED / HIGH / AUTO in the pause menu. |
| **Health + death** | 100 HP with regeneration. Damage from sentries and hard landings (goo and the void still kill). Hurt = double vibration on both controllers, red flash, sound, desktop camera kick, heartbeat when low. Death = you topple about your feet (the camera and the Mixamo body fall together, knees buckle), screen fades to black, respawn and fade in. |
| **Haptics** | Distinct patterns for the blue shot (one tap) and orange shot (tap + echo), portal open, teleport, pickup, landing, damage, death, level complete. Strength setting in the menu. |
| **Story + robot** | An original facility AI, HESTIA, hangs in every chamber, tracks you with her eye and speaks scripted lines (start / finish of each chamber, plus reactions). Captions always on. See "Story and voice". |
| **Cube model** | The cube is now a 3D model, `assets/cube.glb` (a generated chamfered weighted cube is included; drop in your own and it is auto-fitted to the 0.6 m physics box). Tuning: `models.cube` in `config.js`. Falls back to the textured box if the file is missing. Portal ghosts copy the whole model. |
| **Turrets** | Turrets are the model `assets/turret.glb`, driven by its clips: `idle`, `deploy` (notices you, guns out), `idlealert` (guns out, watching), `fire` (loops while shooting), `retract` (guns back in). They track you, then fire fast tracer bullets (bright head, fading streak, halo) from the `muzzle` nodes with a muzzle flash (star, glow, cone, brief light), sparks, scorch marks and smoke. A carried cube still blocks bullets. Tuning: `turret` and `models.turret` in `config.js`. Without the file a simple built-in turret is used. |
| **Levels** | Five new chambers (06 SENTRY, 07 TWIN BUTTONS, 08 LONG FLIGHT, 09 GAUNTLET, 10 THE CORE) = 10 total. New prop: turret. |
| **Quality of life** | Hint key (H / left stick click / menu) with per-chamber hints and an automatic offer after being stuck, reset cubes (T / wrist button), sprint (Shift), reticle that shows which portals are open, health bar on HUD and wrist, timer + best times + death counter, FOV and mouse sensitivity sliders, captions / voice / haptics / graphics / view-FX options, checkpoint feedback. |

## Story and voice

You are Test Subject 17. HESTIA (Hospitality and Evaluation System for Test Subject Intake and Assessment) runs a ten chamber evaluation, and slowly lets slip that the staff are gone and that earlier subjects "retired". In the last chamber she lets you leave. All lines are in `src/story/story.js` (plain strings, easy to rewrite).
HESTIA is an original character with original lines; she is not GLaDOS.

**Is a robot text-to-speech voice possible? Partly.** Pause menu, VOICE:
* `TTS`: the browser's own `speechSynthesis`, pitched down and slowed. Real, intelligible speech, but a page cannot run it through effects or 3D audio, so it is plain stereo. Needs the browser to have a voice (desktop Chrome / Edge / Safari do; some standalone VR browsers ship none).
* `SYNTH`: a built-in formant synthesizer (`src/core/voice.js`) that turns each line into robotic vowel / consonant sounds with a monotone pitch, ring modulation and a metallic comb filter. It is spatialised at her head and drives her eye. **It is a robot mumbling the sentence (rhythm, pauses and questions follow the text); it is not intelligible speech.** It works everywhere.
* `AUTO` (default): TTS if the browser has a voice, else SYNTH. `OFF`: captions only. Captions are always available (CAPTIONS toggle) so nothing depends on audio.
If you want real, characterful speech, record or generate MP3s and play them from `Voice.say()`; the caption / eye / queue plumbing is already there.

## Files

```
index.html                 landing page, import map (three r160 + addons, rapier3d-compat, lil-gui), loading progress, error display
src/main.js                boot, game flow, per-frame loop
src/config.js              ALL tunables (units + comments)
src/core/                  renderer, lighting, materials, assets (+procedural fallbacks), audio (+synth fallback), voice, input (+haptics), save, util, geom (pure)
src/physics/physics.js     Rapier wrapper (static boxes, cubes, kinematic doors, kinematic character controller)
src/player/                player (locomotion + rig), body (IK + walk), armsolve (pure arm math), health (damage + death), ik (math), portalgun
src/story/                 story script + director (captions, hints, event lines)
src/portals/               portal (visual/shader), manager (shots, link, teleport, per-eye views), ghosts, placement (pure)
src/world/                 level loader, props, robot (HESTIA), turret
src/levels/                one data file per level + helpers + index
src/vfx/vfx.js             pooled sprite particles, decals, flashes
src/ui/                    ui (world-space panels), debug (tuning tools)
tools/                     dev scripts (not loaded by the game): validate_levels, self_review, check_syntax, test_arms, test_carry, test_turret (+ three_stub), lint_static, make_cube_glb.py
docs/ASSET_MANIFEST.md     every texture / sound / model / font, with art prompts
assets/                    playermodel.glb + portalgun.glb (already in your repo) + cube.glb (new, replaceable), textures/ sounds/ fonts/ (you add files; missing textures are generated procedurally)
```

## Setup and GitHub Pages

1. Put the contents of this zip in the repo root (`https://github.com/mark-invincible-edit/PortalLab`). Keep `assets/playermodel.glb` and `assets/portalgun.glb` where they are.
2. Add your textures / sounds / font using the exact lowercase filenames from `docs/ASSET_MANIFEST.md` (optional: the game boots without them).
3. Commit and push to `main`.
4. GitHub: **Settings -> Pages -> Build and deployment -> Source: Deploy from a branch -> Branch: `main`, folder `/ (root)` -> Save.**
5. After about a minute the site is at `https://mark-invincible-edit.github.io/PortalLab/` (HTTPS, so WebXR works). `.nojekyll` is included.
6. All paths in the code are relative and lowercase. GitHub Pages is case-sensitive: `Wall_White.PNG` will NOT load.

Local desktop testing needs any static server over `http://localhost` (browsers treat localhost as secure), e.g. `python3 -m http.server`.
(The code itself never hardcodes localhost.)

## Testing on Quest

* Open the Pages URL in **Quest Browser**. Wait for "READY", press **ENTER VR**.
* Put the gun in the other hand: pause menu -> GUN HAND.
* **Immersive Web Emulator** (Meta, Chrome/Edge extension): open the site on desktop, open the emulator panel, press ENTER VR on the landing page
  and drive the emulated Touch controllers; it exposes the same `xr-standard` gamepad layout the game reads.
* Remote debugging: Quest Browser -> `chrome://inspect` on a PC (USB) to see the console. The game logs every missing asset, the full node tree of both GLBs, and bone warnings.
* Performance: Quest defaults are `portal.recursion.xr = 1`, `portal.rtScale.xr = 0.75`, `xr.framebufferScale = 1.0`, fixed foveation 1, no antialiasing, no real-time shadows.
  Lower `rtScale.xr` first if the framerate dips while both portals are in view.

## Controls

| | Quest | Desktop |
|---|---|---|
| Blue portal | trigger of the gun hand (right by default) | LMB |
| Orange portal | trigger of the other hand | RMB |
| Move | left stick (relative to head, or hand: pause menu) | WASD |
| Turn | right stick: snap 30 deg (or smooth, config) | mouse (click the game to capture) |
| Jump | A | Space |
| Clear portals | B or Y | R |
| Pick up / drop cube (release while moving = throw) | off-hand grip | E |
| Hint from HESTIA | left stick click, wrist HINT | H |
| Reset cubes | wrist CUBE | T |
| Sprint | n/a | Shift |
| Menu | X | Esc |
| Wrist panel (off hand) | level, portals placed, health, RESTART / HINT / CUBE | HUD bottom-left |

Menus use a pointer ray (trigger to press, haptic pulse on press); on desktop the mouse / crosshair is the pointer.
The lobby terminal lists chambers; progress and settings are saved in `localStorage` (guarded by try/catch).

## Design choices (what was decided where the brief left room)

* **Shot model: visible projectile.** The hit is resolved analytically at fire time; a glowing bolt with a particle trail flies there at `gun.boltSpeed`; the portal opens on arrival.
* **Geometry is axis-aligned boxes ("slabs").** This keeps raycasts, footprint validation and collision holes exact and cheap. Portals on floors/ceilings face the direction you shot.
* **Portal footprint** is `portal.width x portal.height` (1 x 2 m) drawn as a rounded superellipse (`portal.shapePower`). Placement samples the whole footprint (+ `edgeMargin`) for flat portalable coverage and free space in front, then nudges up to 0.6 m to fit; otherwise the shot is rejected.
* **Collision through portals:** while a portal is open its footprint is cut through the full thickness of the slab(s) it sits on, so the player/cubes can pass; closing restores the wall (and pushes the player out if they were standing in it). This replaces "toggle collision per overlapping body" with the same visible result.
* **Teleport trigger = the player's HEAD crossing the portal plane** (cubes: their center). The rig then gets only a yaw change plus an offset so the head lands exactly at `T * head` (no pop for wall-to-wall; floor/ceiling exits re-upright the view).
* **Portal rendering:** per eye, per portal virtual camera `T * eyeWorld`, the eye's own projection, oblique near-plane clipping on the exit plane, per-eye render targets, projective UVs. Recursion works by repeatedly applying the same link transform (explained in `src/portals/manager.js`).
* **Fizzler:** a field that is NOT a ray blocker (shots pass through, so you can place portals across it). Cubes touching it disintegrate (and respawn); the player crossing it clears both portals. Walking through portals never crosses the field.

## Level format (`src/levels/*.js`)

```js
import { room, wall, slab, carve, P, N, G } from './helpers.js';   // P/N/G = portalable / nonportalable / glass
export default {
  id: 'c06', number: 6,                 // number > 0 makes it a chamber; ids must be unique
  title: 'CHAMBER 06', sub: 'MY LEVEL', hint: 'shown nowhere yet',
  ambience: 'ambience_chamber',         // key from config.sounds (loop)
  killY: -6,                            // falling below this respawns at the checkpoint
  spawn: { pos: [0, 0, 3], yaw: 0 },    // feet position (m); yaw degrees, 0 faces -Z, 90 faces -X
  slabs: [                              // axis-aligned boxes; touching is fine, OVERLAPPING coplanar faces z-fight
    slab([-4, -0.5, -3], [4, 0, 4], N, 'floor_tile'),              // min[x,y,z], max[x,y,z], surface, texture key (optional)
    ...wall('z', -10.5, -10, -4, 4, 0, 4, [{ a0: -1, a1: 1, y0: 0, y1: 2.4 }], N),   // wall with a doorway
    ...room({ x0: -3, x1: 3, z0: -8, z1: 3, y1: 4 }),             // floor+ceiling+4 walls (omit a wall with west:false, etc.)
  ],
  props: [
    { type: 'cube',     pos: [0, 0.31, 0] },                               // center position
    { type: 'button',   id: 'b1', pos: [3, 0, -6] },                       // pos = floor center
    { type: 'door',     id: 'd1', min: [-1, 0, -10.45], max: [1, 2.4, -10.05] },   // slides UP into the slab above it
    { type: 'exit',     min: [-2, 0, -14], max: [2, 3, -12] },             // trigger volume (completion)
    { type: 'goo',      min: [-4, -3, -9], max: [4, -1.5, -3] },           // top face (max.y) is the surface; kills + respawns
    { type: 'fizzler',  axis: 'z', pos: [0, 1.25, -6], size: [9, 5.5] },   // plane normal axis, center, [width, height]
    { type: 'sign',     pos: [-3.97, 3.4, -2], yaw: 90, size: [1.3, 0.95], title: 'CHAMBER 06', sub: 'TEXT', icon: 'cube' },
    // icons: portals grip jump gap cube button white fling fizzler goo
    { type: 'terminal', pos: [0, 1.55, -5.97], yaw: 0 },                   // lobby menu panel (one per level at most is sensible)
  ],
  links: [{ button: 'b1', door: 'd1' }],        // a door is open while ALL buttons linked to it are pressed
  checkpoints: [{ min: [-4, 0, -13], max: [4, 3, -9], pos: [0, 0, -10], yaw: 0 }],   // entering the box sets the respawn point
};
```
Then add `import c06 from './c06.js'` and put it into `CHAMBERS` in `src/levels/index.js` (a data-only change, no engine code).
Rules of thumb: walls 0.5 m thick, a doorway needs a lintel above it thicker than the door, portals need >= 1 x 2 m of single-surface wall,
and `node tools/validate_levels.mjs` checks overlaps / spawn / door fit and can replay solution shots (extend it with your level).

## Retuning the models

**Cube (`models.cube`):** `fit: 'max'` scales the model so its longest side is `physics.cubeSize` and centers its bounding box on the physics body. If it faces the wrong way or sits off-center use `rotationOffset` / `positionOffset`; if its materials look wrong (no materials in the file) set `overrideMaterials: true` to use `cube_weighted.png`. The collider is always a box, so a model that is not cubic will not match its collision exactly. To regenerate the included model: `python3 tools/make_cube_glb.py assets/cube.glb`.

Everything lives in `src/config.js -> models`. Each model has `scale` (number or [x,y,z]), `positionOffset` [x,y,z] m, `rotationOffset` [x,y,z] degrees.

* **`playermodel`**: orientation and size are auto-detected from the skeleton; `targetHeight` (m) sets the fit, `scale` multiplies afterwards. `body.matchPlayerHeight` additionally scales the body to your real standing head height.
* **`portalgun`**: the model is centered, its longest axis is rotated onto Z, and it is scaled to `targetLength` automatically. Barrel pointing backwards? set `rotationOffset: [0, 180, 0]`. Gun in the wrong place on the controller: `handOffset` (VR) / `desktopOffset` (desktop). Muzzle: name a node `muzzle` in the GLB or set `muzzleOffset`.
* Hands not matching the controller: `body.handRotationOffsetDeg.{left,right}` and `body.handPositionOffset.{left,right}`.

**Live tuning:** open the page with `?tune=1` (or set `debug.tuning: true` temporarily). Desktop: press backtick for lil-gui sliders. VR: wrist panel -> TUNE -> stepper panel.
Both have **Copy config** which prints / copies a block of tuned values to paste back into `config.js`. `debug.tuning` is `false` in the shipped config and the debug module is not even imported unless enabled.
`debug.drawIK` draws the arm IK chains.

## Stretch features

| Feature | Included? |
|---|---|
| Laser emitter / receiver / reflector cube | **No** |
| Hard-light bridge | **No** |
| Turret | **Turret** (`assets/turret.glb`, animated, tracer bullets, blocked by cubes) |
| Gels | **No** |

(The core was prioritized; each would need its own manifest textures.)

## Dev tools

```
node tools/validate_levels.mjs     # geometry sanity + solution replays (placement/raycast code is the real engine code)
node tools/self_review.mjs         # imports exist, importmap covers bare imports, config keys exist, asset keys + manifest coverage
sh tools/check_syntax.sh           # node --check on every module
node tools/test_arms.mjs           # arm solver: exact IK, limits, no NaN, no history dependence, smoothness (pure math, runs in Node)
node tools/test_turret.mjs         # turret state machine + clip sequencing against a three.js stand-in (runs the real turret.js)
node tools/lint_static.mjs         # undeclared identifiers + named imports that do not exist (needs the `acorn` package, see the file header)
```

## Troubleshooting (first boot)

* Black page + red error box: read it, then the console. A required CDN module failed (check the versions in the import map at jsDelivr) or a path is wrong.
* "Texture missing" warnings: expected until you add files; placeholders carry the filename.
* No hands / body: check the console for the logged node hierarchy and `missing bone(s)` warnings from `playermodel`.
* Portals look black/empty in VR: lower `portal.recursion.xr` to 1, make sure the headset reports eye viewports; check the console for WebGL errors.
* Arms: the arm solver is unit tested, but the controller-to-hand alignment signs were never verified on a real model. If the hand is rotated wrongly relative to the gun, tune `body.handRotationOffsetDeg` (first suspect), then `poleVector`, then `models.playermodel.rotationOffset`. If a wrist looks crushed, lower `body.limits.twistMaxDeg` / `swingMaxDeg`.
* Portal views look darker or flatter than the room: the portal shader applies tone mapping itself because render targets are not tone mapped in three r160. If your three version already tone maps render targets, delete the `#include <tonemapping_fragment>` line in `src/portals/portal.js` (and in `src/vfx/vfx.js`).
* Too dark / too bright: `render.exposure`, `render.envIntensity`, the light intensities in `src/core/lighting.js`, and the per-material presets in `src/core/materials.js`. Quest too slow: pause menu GRAPHICS LOW.
* Turret looks wrong: front must be +Z (`models.turret.rotationOffset`), gun ends are found by node name (`muzzleNodes`, default `muzzle`; with `debug.logHierarchy` the node names are in the console), and the clip names are matched on the text after `|`. A missing clip is warned about in the console.
* No robot voice: pause menu VOICE, try SYNTH. Audio only starts after the first click / entering VR.
* Controls feel mirrored after handedness swap: the gun-hand trigger is always blue, the other orange.

## Known limitations

* **Not run on a device by the author** (see note at the top). Most likely first-run issues: XR per-eye portal rendering details, IK hand-orientation signs, Rapier API differences between versions, CDN version pins (written from memory: `three@0.160.0`, `rapier3d-compat@0.12.0`, `lil-gui@0.19.2`).
* Cubes that straddle a portal get a ghost on the other side. The player's own body and the gun do not (an arm pushed through a portal is cut at the plane).
* Floor/ceiling exits cannot tilt the headset: the view snaps upright instead of rolling smoothly.
* Axis-aligned slab geometry only; floor portals orient to the shot direction along X/Z.
* Portal collision is a rectangular hole through the whole slab, not an oval; the visible portal is a rounded superellipse.
* A cube held while the carry ray no longer reaches a portal it is on the far side of is dropped after `gun.carryLostTime`.
* Body: no finger curl, no twist bones (possible candy-wrapper skinning on extreme poses), blob shadows only.
* Seeing yourself through a portal: the head is shown during portal views by toggling the head bone's scale and forcing a skeleton refresh (`skeleton.frame = -1`). If your three.js version changes how skeleton updates are cached this may need adjusting (`PlayerBody.setHeadVisible`).
* Debug lines (`debug.drawIK`) and the portal/vignette shaders do not use PNG textures (allowed exceptions).
* No stretch features (lasers, bridge, gels).
* **Everything added in 1.1 is untested on a device**: the new code is syntax / import checked, the arm solver and the new level geometry and replays are unit tested in Node, but rendering (PBR look, shadows, ghosts, head in portals), the death animation, haptics and the voice have not been seen or heard by me.
* Real-time shadows are off on Quest by default (`render.levels`); the key light and the fall-over death are tuned by eye-less guesswork, expect to tweak.
