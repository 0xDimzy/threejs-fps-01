// Shared AABB movement: one mover serves the player and every bot, so collision
// behaves identically for both. A body is an upright box; each axis is tested and
// resolved on its own, so a wall never swallows a body and sliding along it works.
import * as THREE from 'three';

const GRAVITY = 20;

// A body at (x, z) on the floor, with a fixed collision radius and height.
export function createBody(colliders, x, z, radius = 0.34, height = 1.72) {
  return {
    colliders,
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    radius,
    height,
    onGround: true,
  };
}

// One scratch box, reused so the hot path allocates nothing.
const probe = new THREE.Box3();

// The first collider the upright box at (x, y, z) would overlap, or null. `lift`
// shrinks the box vertically so a body standing exactly on a surface does not
// count as intersecting it.
export function overlapsAt(colliders, x, y, z, radius, height, lift = 0) {
  probe.min.set(x - radius, y + lift, z - radius);
  probe.max.set(x + radius, y + height - lift, z + radius);
  for (const collider of colliders) {
    if (probe.intersectsBox(collider)) return collider;
  }
  return null;
}

// wishX/wishZ is a unit (or zero) direction on the ground plane; speed is the
// target speed. Acceleration pulls the velocity toward the wish, friction damps
// it to a stop when there is no wish.
export function moveBody(body, dt, wishX, wishZ, speed, accel, friction) {
  const blend = Math.min(1, (accel * dt) / Math.max(speed, 0.01));
  body.velocity.x += (wishX * speed - body.velocity.x) * blend;
  body.velocity.z += (wishZ * speed - body.velocity.z) * blend;
  if (body.onGround && wishX === 0 && wishZ === 0) {
    const damp = Math.max(0, 1 - friction * dt);
    body.velocity.x *= damp;
    body.velocity.z *= damp;
  }
  body.velocity.y -= GRAVITY * dt;

  // Horizontal axes first, one at a time: a blocked axis stops and zeroes its
  // velocity, the other still moves, which is what makes wall-sliding work.
  const lift = 0.04;
  const nextX = body.position.x + body.velocity.x * dt;
  if (!overlapsAt(body.colliders, nextX, body.position.y, body.position.z, body.radius, body.height, lift)) {
    body.position.x = nextX;
  } else {
    body.velocity.x = 0;
  }
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!overlapsAt(body.colliders, body.position.x, body.position.y, nextZ, body.radius, body.height, lift)) {
    body.position.z = nextZ;
  } else {
    body.velocity.z = 0;
  }

  // Then the vertical axis: land on a collider's top, or bonk the head on its
  // underside, or fall back to the floor at y = 0.
  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = overlapsAt(body.colliders, body.position.x, body.position.y, body.position.z, body.radius, body.height, 0);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - body.height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  body.velocity.y = Math.max(-30, body.velocity.y);
}

export function groundSpeed(body) {
  return Math.hypot(body.velocity.x, body.velocity.z);
}
