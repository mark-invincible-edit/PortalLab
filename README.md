# PortalLab

A first-person WebXR portal-puzzle game for **Meta Quest 2/3 (Quest Browser)** that also runs on **desktop** (mouse + keyboard) and in the
**Immersive Web Emulator** extension. Plain ES modules, **no build step**, hosted as static files (GitHub Pages).
All names, art and audio are original (placeholders are generated at runtime until you add your own files).

> **Status / honesty note:** this project was written without access to a browser, a headset or the CDN.
> It is syntax-checked, statically cross-checked (imports, config keys, asset keys), and the level geometry + portal placement
> logic is unit-tested in Node (`tools/`). **The WebXR rendering, Rapier physics and IK code has not been run.**
> Expect to do a first-boot debugging pass; "Troubleshooting" and "Known limitations" below list the most likely spots.

## Files

```
index.html                 landing page, import map (three r160 + addons, rapier3d-compat, lil-gui), loading progress, error display
src/main.js                boot, game flow, per-frame loop
src/config.js              ALL tunables (units + comments)
src/core/                  renderer, assets (+placeholders), audio (+synth fallback), input, save, util, geom (pure)
src/physics/physics.js     Rapier wrapper (static boxes, cubes, kinematic doors, kinematic character controller)
src/player/                player (locomotion + rig), body (IK + walk), ik (math), portalgun
src/portals/               portal (visual/shader), manager (shots, link, teleport, per-eye views), placement (pure)
src/world/                 level loader, props
src/levels/                one data file per level + helpers + index
src/vfx/vfx.js             pooled sprite particles, decals, flashes
src/ui/                    ui (world-space panels), debug (tuning tools)
tools/                     dev scripts (not loaded by the game): validate_levels, self_review, check_syntax
docs/ASSET_MANIFEST.md     every texture / sound / model / font, with art prompts
assets/                    playermodel.glb + portalgun.glb (already in your repo), textures/ sounds/ fonts/ (you add files)
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
| Pick up / drop cube | off-hand grip | E |
| Menu | X | Esc |
| Wrist panel (off hand) | level, portals placed, RESTART | HUD bottom-left |

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
| Turret | **No** |
| Gels | **No** |

(The core was prioritized; each would need its own manifest textures.)

## Dev tools

```
node tools/validate_levels.mjs     # geometry sanity + solution replays (placement/raycast code is the real engine code)
node tools/self_review.mjs         # imports exist, importmap covers bare imports, config keys exist, asset keys + manifest coverage
sh tools/check_syntax.sh           # node --check on every module
```

## Troubleshooting (first boot)

* Black page + red error box: read it, then the console. A required CDN module failed (check the versions in the import map at jsDelivr) or a path is wrong.
* "Texture missing" warnings: expected until you add files; placeholders carry the filename.
* No hands / body: check the console for the logged node hierarchy and `missing bone(s)` warnings from `playermodel`.
* Portals look black/empty in VR: lower `portal.recursion.xr` to 1, make sure the headset reports eye viewports; check the console for WebGL errors.
* Arms twisted or hands rotated wrongly: tune `body.handRotationOffsetDeg` (first suspect), `poleVector`, then `models.playermodel.rotationOffset`.
* Controls feel mirrored after handedness swap: the gun-hand trigger is always blue, the other orange.

## Known limitations

* **Not run on a device by the author** (see note at the top). Most likely first-run issues: XR per-eye portal rendering details, IK hand-orientation signs, Rapier API differences between versions, CDN version pins (written from memory: `three@0.160.0`, `rapier3d-compat@0.12.0`, `lil-gui@0.19.2`).
* Props that straddle a portal are not duplicated on the other side; a cube teleports when its center crosses (visible pop of the half-through part).
* Floor/ceiling exits cannot tilt the headset: the view snaps upright instead of rolling smoothly.
* Axis-aligned slab geometry only; floor portals orient to the shot direction along X/Z.
* Portal collision is a rectangular hole through the whole slab, not an oval; the visible portal is a rounded superellipse.
* The player pushes cubes only through Rapier's character-controller impulses; cubes cannot be thrown.
* Body: no finger curl, no twist bones (possible candy-wrapper skinning on extreme poses), blob shadows only.
* Seeing yourself through a portal shows the real body, which is correct for recursion but has no special handling for the head.
* Debug lines (`debug.drawIK`) and the portal/vignette shaders do not use PNG textures (allowed exceptions).
* No stretch features (lasers, bridge, turret, gels).
