// Ghost copies of cubes that straddle a portal.
//
// A cube half way through a portal exists physically on one side only, so the part behind the portal plane is hidden by the wall and
// nothing shows on the other side: "half of the object turns invisible". The fix is the classic one: draw a second copy of the cube
// (its whole visual, so this works for assets/cube.glb as well as the fallback box) transformed by the link (T[j] * cubePose) and
// clipped with the EXIT portal's plane so only the part that has emerged shows.
// The real cube's hidden part sits inside the (opaque) wall slab and is already hidden by it; portal views clip it with their oblique
// near plane. Ghosts are ordinary scene objects, so they also appear inside portal views and cast shadows.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _p = new THREE.Matrix4(), _d = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);

export class GhostSystem {
  constructor(G) {
    this.G = G; this.pool = []; this.used = 0;
  }

  /** Next free ghost; created on demand from `cube` (all cubes look the same). */
  _acquire(cube) {
    if (this.used < this.pool.length) return this.pool[this.used++];
    const plane = new THREE.Plane();
    const { root, mats } = cube.makeGhost(plane);
    this.G.scene.add(root);
    const g = { root, plane, mats };
    this.pool.push(g); this.used = this.pool.length;
    return g;
  }

  /** Call after the cubes' poses were updated this frame. */
  update(cubes) {
    const G = this.G, P = G.portals;
    this.used = 0;
    if (P.linked) {
      const R = 0.58, margin = 0.5;
      for (const cube of cubes) {
        if (cube.dead || !cube.mesh.visible) continue;
        for (let j = 0; j < 2; j++) {
          const p = P.portals[j];
          if (p.anim < 0.5) continue;
          _d.copy(cube.mesh.position).sub(p.pos);
          if (Math.abs(_d.dot(p.normal)) > R) continue;
          if (Math.abs(_d.dot(p.right)) > p.w / 2 + margin || Math.abs(_d.dot(p.up)) > p.h / 2 + margin) continue;
          const exit = P.portals[1 - j], g = this._acquire(cube);
          g.plane.setFromNormalAndCoplanarPoint(exit.normal, exit.pos);
          _p.compose(cube.mesh.position, cube.mesh.quaternion, _one);        // pose from the physics-driven transform (matrixWorld may be a frame old)
          _m.multiplyMatrices(P.T[j], _p);
          _m.decompose(g.root.position, g.root.quaternion, g.root.scale);
          g.root.visible = true;
        }
      }
    }
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].root.visible = false;
  }

  hideAll() { for (const g of this.pool) g.root.visible = false; this.used = 0; }

  dispose() {
    for (const g of this.pool) { this.G.scene.remove(g.root); for (const m of g.mats) m.dispose(); }
    this.pool.length = 0;
  }
}
