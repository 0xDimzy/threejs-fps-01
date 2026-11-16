// Thrown frag grenades: a fixed pool of four, gravity, axis-separated bounce off
// the world's colliders, a 1.6 s fuse, then a blast. The blast itself is the
// caller's job (onExplode receives the position); this module only moves the
// grenade and flashes the explosion light.
import * as THREE from 'three';
import { overlapsAt } from './physics.js';
import { PALETTE } from './palette.js';

const POOL = 4;
const FUSE = 1.6;
const GRAVITY = 18;

export function createGrenades(scene, colliders, onExplode) {
  const geometry = new THREE.SphereGeometry(0.09, 10, 8);
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.4, metalness: 0.6 });
  const items = [];
  for (let i = 0; i < POOL; i += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    scene.add(mesh);
    items.push({ mesh, velocity: new THREE.Vector3(), fuse: 0, alive: false, owner: 'player' });
  }
  const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 14);
  scene.add(blastLight);
  let blastLife = 0;

  function throwGrenade(from, direction, owner) {
    const item = items.find((entry) => !entry.alive);
    if (!item) return false;
    item.alive = true;
    item.owner = owner;
    item.fuse = FUSE;
    item.mesh.position.copy(from);
    item.mesh.visible = true;
    item.velocity.copy(direction).multiplyScalar(14);
    item.velocity.y += 3.5;
    return true;
  }

  function step(dt) {
    if (blastLife > 0) {
      blastLife -= dt;
      blastLight.intensity = Math.max(0, blastLife / 0.25) * 60;
    }
    for (const item of items) {
      if (!item.alive) continue;
      item.fuse -= dt;
      item.velocity.y -= GRAVITY * dt;
      const pos = item.mesh.position;
      // Bounce off walls, one axis at a time, losing energy each time.
      const nextX = pos.x + item.velocity.x * dt;
      if (!overlapsAt(colliders, nextX, pos.y - 0.09, pos.z, 0.09, 0.18, 0.02)) pos.x = nextX;
      else item.velocity.x *= -0.45;
      const nextZ = pos.z + item.velocity.z * dt;
      if (!overlapsAt(colliders, pos.x, pos.y - 0.09, nextZ, 0.09, 0.18, 0.02)) pos.z = nextZ;
      else item.velocity.z *= -0.45;
      const nextY = pos.y + item.velocity.y * dt;
      if (nextY < 0.09) {
        pos.y = 0.09;
        item.velocity.y = Math.abs(item.velocity.y) * 0.45;
        item.velocity.x *= 0.8;
        item.velocity.z *= 0.8;
      } else if (!overlapsAt(colliders, pos.x, nextY - 0.09, pos.z, 0.09, 0.18, 0)) {
        pos.y = nextY;
      } else {
        item.velocity.y *= -0.45;
      }
      if (item.fuse <= 0) {
        item.alive = false;
        item.mesh.visible = false;
        blastLight.position.copy(pos);
        blastLight.intensity = 60;
        blastLife = 0.25;
        onExplode(pos, item.owner);
      }
    }
  }

  return { throwGrenade, step, alive: () => items.some((item) => item.alive) };
}
