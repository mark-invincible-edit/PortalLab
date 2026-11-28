// Rapier wrapper: static boxes (level slabs), dynamic cubes, kinematic doors and the player's
// kinematic character controller (capsule). Everything is created through here so levels can be disposed cleanly.
import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config.js';

export class Physics {
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -CONFIG.physics.gravity, z: 0 });
    this.ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this._v = { x: 0, y: 0, z: 0 };
    this._exclude = null;
    this._predicate = (collider) => collider !== this._exclude;
    this.player = null;
  }

  step(dt) {
    this.world.timestep = Math.min(Math.max(dt, 1 / 144), 1 / 30);
    this.world.step();
  }

  // ------------------------------------------------------------------ static level geometry
  addStaticBox(min, max) {
    const hx = (max[0] - min[0]) / 2, hy = (max[1] - min[1]) / 2, hz = (max[2] - min[2]) / 2;
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(min[0] + hx, min[1] + hy, min[2] + hz).setFriction(0.8);
    return this.world.createCollider(desc, this.ground);
  }

  removeCollider(c) { if (c) this.world.removeCollider(c, true); }

  // ------------------------------------------------------------------ dynamic cube
  createCube(x, y, z) {
    const p = CONFIG.physics, h = p.cubeSize / 2;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z)
      .setLinearDamping(p.cubeLinearDamping).setAngularDamping(p.cubeAngularDamping).setCcdEnabled(true));
    const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(h, h, h).setDensity(p.cubeDensity)
      .setFriction(p.cubeFriction).setRestitution(p.cubeRestitution), body);
    return { body, collider };
  }

  // ------------------------------------------------------------------ kinematic box (doors)
  createKinematicBox(min, max) {
    const hx = (max[0] - min[0]) / 2, hy = (max[1] - min[1]) / 2, hz = (max[2] - min[2]) / 2;
    const cx = min[0] + hx, cy = min[1] + hy, cz = min[2] + hz;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(cx, cy, cz));
    const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.8), body);
    return { body, collider };
  }

  removeBody(b) { if (b) this.world.removeRigidBody(b); }

  // ------------------------------------------------------------------ player (kinematic capsule + character controller)
  createPlayer() {
    const c = CONFIG.player;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, c.height / 2, 0));
    const half = Math.max(0.01, (c.height - 2 * c.radius) / 2);
    const collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(half, c.radius).setFriction(0), body);
    const kcc = this.world.createCharacterController(0.02);
    kcc.setUp({ x: 0, y: 1, z: 0 });
    kcc.setSlideEnabled(true);
    kcc.enableAutostep(c.stepHeight, 0.12, false);
    kcc.enableSnapToGround(c.snapToGround);
    kcc.setMaxSlopeClimbAngle(50 * Math.PI / 180);
    kcc.setMinSlopeSlideAngle(60 * Math.PI / 180);
    kcc.setApplyImpulsesToDynamicBodies(true);
    kcc.setCharacterMass(c.bodyMass);
    this.player = { body, collider, kcc };
    return this.player;
  }

  /** Move the capsule by `desired` (world meters). Returns movement in this._v and grounded flag. */
  moveCharacter(desired, excludeCollider = null) {
    const p = this.player;
    this._exclude = excludeCollider;
    p.kcc.computeColliderMovement(p.collider, desired, undefined, undefined, this._predicate);
    const m = p.kcc.computedMovement();
    this._v.x = m.x; this._v.y = m.y; this._v.z = m.z;
    return { movement: this._v, grounded: p.kcc.computedGrounded() };
  }

  /** Commit the capsule center (kinematic body target). */
  setPlayerCenter(x, y, z) { this.player.body.setNextKinematicTranslation({ x, y, z }); }

  /** Hard-set (teleport, respawn). Colliders follow at the next world.step(); do not run the character controller before that. */
  teleportPlayerCenter(x, y, z) {
    this.player.body.setTranslation({ x, y, z }, true);
    this.player.body.setNextKinematicTranslation({ x, y, z });
  }
}
