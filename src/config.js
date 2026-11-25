// PortalLab - every tunable lives here.
// Units: meters, seconds, degrees (unless a comment says otherwise).
// Rotation offsets are Euler XYZ in degrees.

export const CONFIG = {
  version: '1.0.0',

  debug: {
    tuning: false,          // MASTER SWITCH for the tuning tools (backtick on desktop). NEVER ship true.
    drawIK: false,          // draw IK chains + targets (needs no tuning switch)
    logHierarchy: true,     // log node hierarchy of loaded models
  },

  handedness: 'right',      // gun hand: 'right' | 'left' (can be swapped in the pause menu)

  render: {
    antialias: false,       // context attribute; keep false for Quest
    maxPixelRatio: 2,       // desktop only
    anisotropy: 4,
    clearColor: 0x14171a,
    nearPlane: 0.03,
    farPlane: 120,
  },

  xr: {
    framebufferScale: 1.0,  // 0.8..1.4 ; lower = faster
    foveation: 1.0,         // 0..1 fixed foveation
  },

  // ---------------------------------------------------------------- assets
  paths: { textures: 'assets/textures/', sounds: 'assets/sounds/' },

  font: { family: 'IBM Plex Mono', file: 'assets/fonts/ibmplexmono-medium.ttf', fallback: 'ui-monospace, Menlo, Consolas, monospace' },

  // meters = world size of one texture tile (for tileable textures); size = placeholder resolution
  textures: {
    wall_white:    { file: 'wall_white.png',    tile: true,  size: 512, meters: 2 },
    wall_dark:     { file: 'wall_dark.png',     tile: true,  size: 512, meters: 2 },
    floor_tile:    { file: 'floor_tile.png',    tile: true,  size: 512, meters: 2 },
    glass:         { file: 'glass.png',         tile: false, size: 256, meters: 2 },
    hazard_stripe: { file: 'hazard_stripe.png', tile: true,  size: 256, meters: 1 },
    door_panel:    { file: 'door_panel.png',    tile: false, size: 512, meters: 2 },
    cube_weighted: { file: 'cube_weighted.png', tile: false, size: 256, meters: 1 },
    button_pad:    { file: 'button_pad.png',    tile: false, size: 256, meters: 1 },
    goo:           { file: 'goo.png',           tile: true,  size: 512, meters: 4 },
    fizzler_grid:  { file: 'fizzler_grid.png',  tile: true,  size: 256, meters: 1 },
    sign_plate:    { file: 'sign_plate.png',    tile: false, size: 512, meters: 1 },
    ui_plate:      { file: 'ui_plate.png',      tile: true,  size: 256, meters: 1 },
    blob_shadow:   { file: 'blob_shadow.png',   tile: false, size: 64,  meters: 1 },
    spark:         { file: 'spark.png',         tile: false, size: 64,  meters: 1 },
    glow:          { file: 'glow.png',          tile: false, size: 128, meters: 1 },
    smoke:         { file: 'smoke.png',         tile: false, size: 128, meters: 1 },
    scorch:        { file: 'scorch.png',        tile: false, size: 128, meters: 1 },
    portal_noise:  { file: 'portal_noise.png',  tile: true,  size: 256, meters: 1 },
  },

  // kind: 'sfx' | 'amb' (mixer bus). If the mp3 is missing a WebAudio tone is synthesized instead.
  sounds: {
    portal_open_blue:   { file: 'portal_open_blue.mp3',   kind: 'sfx', vol: 0.8 },
    portal_open_orange: { file: 'portal_open_orange.mp3', kind: 'sfx', vol: 0.8 },
    portal_close:       { file: 'portal_close.mp3',       kind: 'sfx', vol: 0.7 },
    portal_reject:      { file: 'portal_reject.mp3',      kind: 'sfx', vol: 0.7 },
    portal_enter:       { file: 'portal_enter.mp3',       kind: 'sfx', vol: 0.8 },
    gun_fire:           { file: 'gun_fire.mp3',           kind: 'sfx', vol: 0.7 },
    door_open:          { file: 'door_open.mp3',          kind: 'sfx', vol: 0.8 },
    door_close:         { file: 'door_close.mp3',         kind: 'sfx', vol: 0.8 },
    button_down:        { file: 'button_down.mp3',        kind: 'sfx', vol: 0.8 },
    button_up:          { file: 'button_up.mp3',          kind: 'sfx', vol: 0.6 },
    cube_drop:          { file: 'cube_drop.mp3',          kind: 'sfx', vol: 0.7 },
    cube_pickup:        { file: 'cube_pickup.mp3',        kind: 'sfx', vol: 0.6 },
    fizzle_zap:         { file: 'fizzle_zap.mp3',         kind: 'sfx', vol: 0.8 },
    goo_splash:         { file: 'goo_splash.mp3',         kind: 'sfx', vol: 0.8 },
    footstep:           { file: 'footstep.mp3',           kind: 'sfx', vol: 0.45 },
    land:               { file: 'land.mp3',               kind: 'sfx', vol: 0.6 },
    level_complete:     { file: 'level_complete.mp3',     kind: 'sfx', vol: 0.9 },
    ui_click:           { file: 'ui_click.mp3',           kind: 'sfx', vol: 0.6 },
    ambience_lobby:     { file: 'ambience_lobby.mp3',     kind: 'amb', vol: 0.5, loop: true },
    ambience_chamber:   { file: 'ambience_chamber.mp3',   kind: 'amb', vol: 0.5, loop: true },
    fizzler_hum:        { file: 'fizzler_hum.mp3',        kind: 'amb', vol: 0.6, loop: true },
  },

  // ---------------------------------------------------------------- models
  // scale: uniform number or [x,y,z]. positionOffset meters, rotationOffset degrees.
  models: {
    playermodel: {
      path: 'assets/playermodel.glb',
      required: false,
      scale: [1, 1, 1],            // multiplier applied AFTER auto-fit to targetHeight
      positionOffset: [0, 0, 0],   // in body space (x right, y up, -z forward), after auto-fit
      rotationOffset: [0, 0, 0],   // applied after automatic orientation fix
      targetHeight: 1.75,          // m, auto-fit of the full model height
      overrideMaterials: false,
    },
    portalgun: {
      path: 'assets/portalgun.glb',
      required: false,
      scale: [1, 1, 1],            // multiplier applied AFTER normalization to targetLength
      positionOffset: [0, 0, 0],   // inside gun root space
      rotationOffset: [0, 0, 0],   // use [0,180,0] if the barrel points backwards
      targetLength: 0.34,          // m, longest bounding-box side after normalization
      centerPivot: true,           // move bounding-box center to the pivot
      autoOrient: true,            // rotate so the longest axis lies along Z
      muzzleOffset: [0, 0, -0.2],  // gun root space; used when no node named "muzzle" exists
      handOffset: { position: [0, -0.03, 0.07], rotation: [0, 0, 0] },       // gun root relative to controller (VR)
      desktopOffset: { position: [0.2, -0.18, -0.38], rotation: [0, 0, 0] }, // gun root relative to camera (desktop)
      indicatorOffset: [0, 0.05, -0.02],
      overrideMaterials: false,
    },
  },

  // ---------------------------------------------------------------- portals
  portal: {
    width: 1.0, height: 2.0,        // footprint (oval inscribed in this rect)
    shapePower: 2.6,                // 2 = oval, higher = rounder rectangle (footprint corners stay physically open)
    quadMargin: 0.14,               // extra quad size around the oval for the rim
    surfaceOffset: 0.012,           // quad offset from wall
    edgeMargin: 0.02,               // min distance from surface edge
    teleportLead: 0.04,             // teleport when body crosses this far in front of the plane
    minExitSpeed: 3.5,              // player, only when exit is a floor
    cubeMinExit: 1.5,               // cubes
    openTime: 0.35, closeTime: 0.22,
    rtScale: { xr: 0.75, desktop: 1.0 },   // render target resolution vs eye resolution
    recursion: { xr: 1, desktop: 2 },
    colors: { blue: 0x2f8cff, blueRim: 0xa9d4ff, orange: 0xff8a1f, orangeRim: 0xffd09a },
  },

  gun: {
    cooldown: 0.28,
    boltSpeed: 70,                  // m/s of the visual bolt
    range: 90,
    pickupRange: 3.2,
    pickupRadius: 0.55,
    carryDistance: 1.25, carryMin: 0.7, carryStiffness: 24,
    muzzleFlashSize: 0.22,
  },

  // ---------------------------------------------------------------- player
  player: {
    radius: 0.28, height: 1.7, eyeHeight: 1.62,
    walkSpeed: 3.4,
    groundAccel: 38, airAccel: 9, airControlSpeed: 4.2,
    jumpSpeed: 5.4, gravity: 14,
    stepHeight: 0.35, snapToGround: 0.25,
    mouseSensitivity: 0.0022,
    fallRespawnY: -40,
    bodyMass: 70,
  },

  comfort: {
    snapTurn: true, snapAngle: 30, snapCooldown: 0.28, smoothTurnSpeed: 110,
    stickDeadzone: 0.18,
    vignette: true, vignetteStrength: 0.8, vignetteInner: 0.45, vignetteOuter: 1.1,
    moveRelativeTo: 'head',          // 'head' | 'controller'
    speedScale: 1.0,                 // 0.6 .. 1.6
  },

  physics: {
    gravity: 14,
    cubeSize: 0.6, cubeDensity: 1.6, cubeFriction: 0.9, cubeRestitution: 0.05,
    cubeLinearDamping: 0.05, cubeAngularDamping: 0.6,
    cubeRespawnDelay: 1.2,
  },

  // ---------------------------------------------------------------- body IK + walk
  body: {
    enabled: true,
    ikEnabled: true,
    poleWeight: 1.0,                      // 0 = elbows hang straight down, 1 = use poleVector
    poleVector: [0.55, -1.0, 0.45],       // right arm, body space (x out, y up, z back); mirrored for left
    strideLength: 1.45,                   // m traveled per full cycle (two steps)
    stepFreqMax: 3.4,                     // cycles / s cap
    swingDeg: 28, kneeFlexDeg: 40, hipBob: 0.022, hipTwistDeg: 4,
    bodyYawLag: 9,                        // 1/s smoothing of body yaw following head
    bodyYawDeadzoneDeg: 38,
    neckBackOffset: 0.08,                 // m the neck sits behind the camera
    handPositionOffset: { left: [0, 0, 0.03], right: [0, 0, 0.03] },   // wrist in controller grip space
    handRotationOffsetDeg: { left: [0, 0, 0], right: [0, 0, 0] },      // extra rotation on top of auto alignment
    relaxedArmOut: 0.2, relaxedArmFwd: 0.06,
    blendSpeed: 6,
    crouchBend: true,
    headScale: 0.001,                     // head bone scale (hides head without removing meshes)
    matchPlayerHeight: true,              // scale the body so its neck matches your real standing head height
    neckBelowEyes: 0.12,                  // m between eyes and neck base (used by matchPlayerHeight)
    footstepSounds: true,
  },

  // ---------------------------------------------------------------- vfx / audio / ui
  vfx: {
    intensity: 1.0,
    sparkCount: 22, decalLife: 14, portalBurst: 26,
    maxSparks: 256, maxGlow: 192, maxSmoke: 96,
  },

  audio: { master: 0.8, sfx: 1.0, amb: 0.5, refDistance: 1.5, maxDistance: 60 },

  ui: {
    pxPerMeter: 400,
    pointerMax: 6,
    pausePanel: { w: 1.8, h: 1.56, distance: 1.5 },
    wristPanel: { w: 0.3, h: 0.24, offset: [0, 0.06, 0.02], rotation: [-70, 0, 0] },
    colors: { bg: '#23262b', bg2: '#2d3137', ink: '#e8e6df', mute: '#8c9097', line: '#d8d6ce', blue: '#2f8cff', orange: '#ff8a1f' },
  },
};

export const SURFACE = { PORTALABLE: 'portalable', NONPORTALABLE: 'nonportalable', GLASS: 'glass' };
