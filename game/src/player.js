// The Vanguard player: movement with acceleration and friction, crouch,
// jump, look with recoil, and damage. Position is the feet centre; the
// camera rides at eye height (1.62 m standing, 1.15 m crouched).
import * as THREE from 'three';
import { moveBody } from './physics.js';
import { clampToYard } from './map.js';

export const PLAYER = {
  half: 0.35,
  height: 1.7,
  crouchHeight: 1.2,
  eyeStanding: 1.62,
  eyeCrouch: 1.12,
  walkSpeed: 4.2,
  crouchSpeed: 2.2,
  accel: 38,
  friction: 11,
  jumpSpeed: 5.6,
  gravity: 14.5,
};

export function createPlayer(spawn) {
  return {
    pos: new THREE.Vector3(spawn.x, 0, spawn.z),
    vel: new THREE.Vector3(),
    yaw: spawn.yaw,
    pitch: 0,
    hp: 100,
    alive: true,
    crouched: false,
    onGround: true,
    stepPhase: 0, // accumulates distance for footstep sounds / bob
    bobPhase: 0,
    eyeHeight: PLAYER.eyeStanding,
    lastDamageAt: -10,
  };
}

export function resetPlayer(player, spawn) {
  player.pos.set(spawn.x, 0, spawn.z);
  player.vel.set(0, 0, 0);
  player.yaw = spawn.yaw;
  player.pitch = 0;
  player.hp = 100;
  player.alive = true;
  player.crouched = false;
  player.onGround = true;
  player.eyeHeight = PLAYER.eyeStanding;
}

// Forward/right on the ground plane from the yaw.
export function yawVectors(yaw) {
  return {
    forward: new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)),
    right: new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)),
  };
}

export function eyePosition(player) {
  return new THREE.Vector3(player.pos.x, player.pos.y + player.eyeHeight, player.pos.z);
}

// One fixed step of movement. Returns distance travelled (for footsteps).
export function updatePlayer(player, input, dt, solids, loadout) {
  if (!player.alive) return 0;
  const { forward, right } = yawVectors(player.yaw);

  // Look, with recoil recovering toward zero.
  const look = input.consumeLook();
  player.yaw -= look.dx * input.sensitivity;
  player.pitch -= look.dy * input.sensitivity;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
  if (loadout.recoil > 0) {
    const w = loadout.current;
    const rec = w === 'kestrel' ? 0.09 : w === 'wasp' ? 0.11 : 0.06;
    loadout.recoil = Math.max(0, loadout.recoil - rec * dt * 4);
  }

  // Crouch: Ctrl or C, lowers the profile and the eye.
  const wantCrouch = input.isDown('ControlLeft') || input.isDown('ControlRight') || input.isDown('KeyC');
  player.crouched = wantCrouch;
  const targetEye = wantCrouch ? PLAYER.eyeCrouch : PLAYER.eyeStanding;
  player.eyeHeight += (targetEye - player.eyeHeight) * Math.min(1, dt * 14);

  // Wish direction from WASD, normalised.
  const wish = new THREE.Vector3();
  if (input.isDown('KeyW')) wish.add(forward);
  if (input.isDown('KeyS')) wish.sub(forward);
  if (input.isDown('KeyD')) wish.add(right);
  if (input.isDown('KeyA')) wish.sub(right);
  if (wish.lengthSq() > 0) wish.normalize();

  const topSpeed = wantCrouch ? PLAYER.crouchSpeed : PLAYER.walkSpeed;
  const horizontal = new THREE.Vector3(player.vel.x, 0, player.vel.z);
  if (wish.lengthSq() > 0) {
    horizontal.addScaledVector(wish, PLAYER.accel * dt);
    if (horizontal.length() > topSpeed) horizontal.setLength(topSpeed);
  } else {
    // Friction bleeds speed when no key is held.
    const drop = Math.max(0, horizontal.length() - PLAYER.friction * dt);
    horizontal.setLength(drop);
  }
  player.vel.x = horizontal.x;
  player.vel.z = horizontal.z;

  // Jump.
  if (input.wasPressed('Space') && player.onGround) {
    player.vel.y = PLAYER.jumpSpeed;
    player.onGround = false;
  }
  player.vel.y -= PLAYER.gravity * dt;

  const height = wantCrouch ? PLAYER.crouchHeight : PLAYER.height;
  const hits = moveBody(player.pos, PLAYER.half, height, player.vel, dt, solids);
  if (hits.y) player.vel.y = 0;
  player.onGround = hits.grounded;
  const clamped = clampToYard(player.pos.x, player.pos.z);
  player.pos.x = clamped.x;
  player.pos.z = clamped.z;

  const moved = Math.hypot(player.vel.x, player.vel.z) * dt;
  player.stepPhase += moved;
  player.bobPhase += moved * 1.9;
  return moved;
}

// Damage the player; Kevlar halves it. Returns the damage actually taken.
export function damagePlayer(player, loadout, amount, now) {
  if (!player.alive) return 0;
  let taken = amount;
  if (loadout.kevlar) taken = Math.ceil(taken / 2);
  player.hp = Math.max(0, player.hp - taken);
  player.lastDamageAt = now;
  if (player.hp <= 0) player.alive = false;
  return taken;
}
