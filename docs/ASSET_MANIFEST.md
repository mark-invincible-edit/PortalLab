# PortalLab asset manifest

Every external file the game loads. All paths are relative, lowercase and case-sensitive (GitHub Pages).
**Nothing here is required to boot.** Missing textures become labeled canvas placeholders (the filename is drawn on them),
missing sounds are synthesized with WebAudio, a missing model is skipped. Every miss logs a console warning.
When the real file exists at the listed path, it is used automatically.

Texture rules used by the engine: albedo only, sRGB, mipmaps on, anisotropy capped at `render.anisotropy` (4).
"Tileable" textures use `RepeatWrapping`; the engine scales UVs so one tile covers the `meters` value from `config.textures`.
Level geometry uses world-aligned UVs, so tileable textures must tile seamlessly in both directions.
Every visible mesh in the game samples one of these textures. Exceptions that use no PNG: the portal quad shader (emissive),
the comfort vignette (screen-space VFX), and the optional IK debug lines (debug only).

## Textures (`assets/textures/*.png`)

| File | Res | Tileable | Tile size | Used by | Art-direction prompt (paste into an image generator) |
|---|---|---|---|---|---|
| `wall_white.png` | 512 | yes | 2 m | portalable wall/ceiling slabs | seamless tileable texture, flat off-white matte enamel wall panels, 1 m squares separated by thin recessed grooves, faint scuffs, sterile industrial test facility, orthographic front view, even lighting, no text, no perspective |
| `wall_dark.png` | 512 | yes | 2 m | non-portalable walls, door-frame lintels, fizzler posts, placeholder gun body | seamless tileable texture, dark graphite brushed steel wall panels, riveted seams, fine scratches, matte, orthographic front view, even lighting, no text |
| `floor_tile.png` | 512 | yes | 2 m | all floors and platform blocks | seamless tileable texture, mid grey rubberized industrial floor tiles, 0.5 m squares with thin dark joints, light wear, orthographic top-down view, even lighting |
| `glass.png` | 256 | no | 2 m | glass slabs (rejects portals) | pale cyan-grey glass pane with a thin dark metal frame border and faint diagonal reflection streaks, semi-transparent PNG (about 35% alpha in the glass area), flat orthographic |
| `hazard_stripe.png` | 256 | yes | 1 m | trim at the bottom of doors | seamless tileable diagonal black and yellow hazard stripes, flat, slightly worn paint, orthographic |
| `door_panel.png` | 512 | no | n/a | sliding doors (all faces) | front view of a heavy sliding industrial door panel, graphite steel with a central vertical seam, off-white stencil chevrons near the bottom edge, rivets, flat orthographic, no perspective |
| `cube_weighted.png` | 256 | no | n/a | weighted cube (same image on all 6 faces) | single face of a weighted storage cube, graphite steel plate with a beveled frame, circular off-white stencil mark in the center, corner bolts, flat orthographic, square |
| `button_pad.png` | 256 | no | n/a | floor button base and pad | top-down floor pressure pad, off-white circle with a concentric ring on a graphite square plate, subtle wear, flat orthographic, square |
| `goo.png` | 512 | yes | 4 m | toxic goo surface (scrolls slowly) | seamless tileable toxic green-yellow sludge, thick viscous swirls, top-down, no foam highlights, slightly dull, orthographic |
| `fizzler_grid.png` | 256 | yes | 1 m | fizzler field (additive blend, scrolls) | seamless tileable thin cyan-white vertical energy lines with fine horizontal scan lines on pure black background, emissive look, orthographic |
| `sign_plate.png` | 512 | no | n/a | chamber signs and the exit floor plate (text and pictograms are drawn on top at runtime) | blank off-white enameled sign plate, subtle wear, small screw holes in the corners, flat orthographic, leave the center empty |
| `ui_plate.png` | 256 | yes | 1 m | UI panel slats, placeholder gun barrel | seamless tileable dark graphite slatted metal plate, fine horizontal grooves, matte, orthographic |
| `blob_shadow.png` | 64 | no | n/a | fake blob shadows under cubes and the player | soft round black radial gradient on transparent background, alpha only falloff, centered, no hard edge |
| `spark.png` | 64 | no | n/a | spark particles (additive) | small bright white-yellow four-point star spark with soft falloff on transparent background |
| `glow.png` | 128 | no | n/a | glow particles, bolt, flashes, exit beacon, pointer rays (additive) | soft white radial glow, smooth falloff to fully transparent edge, centered |
| `smoke.png` | 128 | no | n/a | smoke puffs | soft light-grey smoke puff with noisy cloudy edges on transparent background, centered |
| `scorch.png` | 128 | no | n/a | scorch decal where shots hit non-portalable surfaces | irregular black burn mark with a soft radial edge on transparent background, centered, slightly uneven |
| `portal_noise.png` | 256 | yes | 1 m | portal rim shimmer and swirl (red channel is used) | seamless tileable greyscale cloudy fractal noise, mid contrast, no alpha, no visible seams |

## 3D models (`assets/*.glb`)

| File | Status | Real-world size | PNG textures | Notes |
|---|---|---|---|---|
| `assets/playermodel.glb` | **EXISTS** | auto-fit to `models.playermodel.targetHeight` (1.75 m) | embedded materials | Mixamo rig, T-pose, no clips. Orientation, scale and bone names are auto-detected (see README). |
| `assets/portalgun.glb` | **EXISTS** | auto-normalized to `models.portalgun.targetLength` (0.34 m) | embedded materials | Optional child node named `muzzle` = shot origin, else `muzzleOffset`. |

**No new `.glb` files are needed.** Every puzzle prop (cube, button, door, fizzler, goo, signs) is built from textured primitives.
If `portalgun.glb` fails to load, a primitive placeholder gun is built from `wall_dark.png` and `ui_plate.png`.
If `playermodel.glb` fails to load, the game runs without a body (gun still works).

## Sounds (`assets/sounds/*.mp3`)

All of these have a **WebAudio synthesized fallback** (generated into an AudioBuffer at startup, see `src/core/audio.js`),
so none is required. Positional = uses a PannerNode at the event position; otherwise global.

| File | ~Duration | Loop | Trigger | Description |
|---|---|---|---|---|
| `portal_open_blue.mp3` | 0.5 s | no | blue portal opens (positional) | rising airy whoosh with a bright shimmer, cooler/higher than the orange one |
| `portal_open_orange.mp3` | 0.5 s | no | orange portal opens (positional) | rising whoosh, slightly lower and warmer than the blue one |
| `portal_close.mp3` | 0.3 s | no | a portal is cleared / replaced (positional) | falling collapse sweep with a soft pop |
| `portal_reject.mp3` | 0.25 s | no | shot hits a non-portalable surface, glass or no room (positional) | short dry electrical buzz-zap |
| `portal_enter.mp3` | 0.35 s | no | player or cube passes through a portal (positional, entry and exit) | soft low whoosh |
| `gun_fire.mp3` | 0.25 s | no | portal gun fires (positional) | sharp energy discharge, quick downward sweep |
| `door_open.mp3` | 0.8 s | no | door starts opening (positional) | heavy sliding servo, low rumble |
| `door_close.mp3` | 0.6 s | no | door starts closing (positional) | same servo, shorter, ends with a soft thunk |
| `button_down.mp3` | 0.15 s | no | button pressed (positional) | solid mechanical click-clunk |
| `button_up.mp3` | 0.12 s | no | button released (positional) | lighter click |
| `cube_drop.mp3` | 0.2 s | no | cube dropped / lands hard (positional) | dull metallic thud |
| `cube_pickup.mp3` | 0.15 s | no | cube picked up (positional) | short magnetic latch chirp |
| `fizzle_zap.mp3` | 0.5 s | no | cube disintegrates / player crosses fizzler (positional) | electric crackle sizzle |
| `goo_splash.mp3` | 0.5 s | no | player or cube falls into goo (positional) | wet heavy splash |
| `footstep.mp3` | 0.1 s | no | each footfall of the walk cycle (positional, pitch varied) | soft rubber-sole step on tile |
| `land.mp3` | 0.2 s | no | player lands after a fall (positional) | heavier step thump |
| `level_complete.mp3` | 1.0 s | no | chamber exit reached | short rising four-note chime |
| `ui_click.mp3` | 0.07 s | no | UI press or panel open | crisp mechanical tick |
| `ambience_lobby.mp3` | 4 s, seamless | yes | lobby (global, ambience bus) | quiet room tone, low ventilation hum |
| `ambience_chamber.mp3` | 4 s, seamless | yes | chambers (global, ambience bus) | quiet low machinery hum, slightly colder |
| `fizzler_hum.mp3` | 2 s, seamless | yes | fizzler position (positional loop) | steady electrical buzz around 120 Hz with harmonics |

## Font

One open-license font is used for in-world UI, signs and the landing page:
**IBM Plex Mono** (Medium weight), SIL Open Font License 1.1.
Get it from <https://github.com/IBM/plex> (release zip, `IBM-Plex-Mono/fonts/complete/ttf/IBMPlexMono-Medium.ttf`) or Google Fonts.
Save it as `assets/fonts/ibmplexmono-medium.ttf` (lowercase). If it is missing the UI falls back to the system monospace font.
