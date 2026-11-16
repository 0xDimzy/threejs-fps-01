// Cinder bots: four defenders with fixed routes, holds, sight and hearing.
// A bot walks its route, holds the last waypoint and watches a lane. Gunfire
// within earshot pulls it to investigate; line of sight starts a reaction
// delay, then aimed bursts with strafing. After a plant they converge on the
// site — one channels the defuse while the others hunt the planter.
import * as THREE from 'three';
import { MAP, clampToYard } from './map.js';
import { moveBody, hasLineOfSight } from './physics.js';
import { fireBotShot } from './combat.js';
import { TIMING } from './state.js';

export const BOT = {
  half: 0.35,
  height: 1.72,
  walkSpeed: 2.6,
  huntSpeed: 3.4,
  gravity: 14.5,
  sightRange: 34,
  hearRange: 26,
  reactMin: 0.35,
  reactMax: 0.6,
  burstSize: 3,
  burstGap: 0.11,
  burstPause: 0.9,
  hp: 100,
};

export function createBots() {
  return MAP.botSpawns.map((spawn, i) => {
    const group = buildBotMesh();
    group.position.set(spawn.x, 0, spawn.z);
    return {
      name: MAP.botNames[i],
      pos: new THREE.Vector3(spawn.x, 0, spawn.z),
      vel: new THREE.Vector3(),
      yaw: Math.PI, // face south, toward the Vanguard spawn
      hp: BOT.hp,
      alive: true,
      route: MAP.routes[i],
      waypoint: 0,
      mode: 'route', // route | hold | investigate | engage | retake | defuse
      holdTime: 0,
      watchYaw: Math.PI,
      reactTimer: 0,
      burstLeft: 0,
      burstTimer: 0,
      pauseTimer: 0,
      strafeDir: 1,
      strafeTimer: 0,
      investigateAt: null,
      lastSeenAt: -100,
      lastSeenPos: new THREE.Vector3(),
      heardAt: -100,
      heardPos: new THREE.Vector3(),
      group,
      flashTimer: 0,
    };
  });
}

// A bot is a capsule body, a head, a visor slit and a gun box — readable at
// a glance as an enemy, in Cinder red.
function buildBotMesh() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8c2f26, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc7a27a, roughness: 0.8 });
  const visorMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.36), bodyMat);
  torso.position.y = 0.92;
  torso.castShadow = true;
  group.add(torso);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.4), trimMat);
  chest.position.y = 1.1;
  group.add(chest);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.36, 0.38), skinMat);
  head.position.y = 1.53;
  head.castShadow = true;
  group.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.02), visorMat);
  visor.position.set(0, 1.55, 0.2);
  group.add(visor);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.32), trimMat);
  legs.position.y = 0.25;
  group.add(legs);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.7), trimMat);
  gun.position.set(0.25, 1.05, -0.25);
  group.add(gun);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  flash.position.set(0.25, 1.05, -0.65);
  flash.name = 'muzzleFlash';
  group.add(flash);
  return group;
}

export function resetBots(bots, scene) {
  for (let i = 0; i < bots.length; i++) {
    const b = bots[i];
    const spawn = MAP.botSpawns[i];
    b.pos.set(spawn.x, 0, spawn.z);
    b.vel.set(0, 0, 0);
    b.yaw = Math.PI;
    b.hp = BOT.hp;
    b.alive = true;
    b.waypoint = 0;
    b.mode = 'route';
    b.holdTime = 0;
    b.reactTimer = 0;
    b.burstLeft = 0;
    b.group.visible = true;
    b.group.position.copy(b.pos);
    if (!b.group.parent) scene.add(b.group);
  }
}

// Can this bot see the player right now? Range, roughly in front, and a
// clear line of sight from its eyes to the player's chest.
export function canSeePlayer(bot, player, solids) {
  if (!player.alive) return false;
  const dx = player.pos.x - bot.pos.x;
  const dz = player.pos.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > BOT.sightRange) return false;
  const facing = new THREE.Vector3(Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
  const toPlayer = new THREE.Vector3(dx / dist, 0, dz / dist);
  if (facing.dot(toPlayer) < 0.15 && dist > 4) return false; // outside the view cone
  const eye = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.55, bot.pos.z);
  const chest = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
  return hasLineOfSight(eye, chest, solids);
}

// Tell every living bot about a loud noise (a shot, a blast) at a position.
export function alertBots(bots, pos, now) {
  for (const b of bots) {
    if (!b.alive) continue;
    const dist = Math.hypot(pos.x - b.pos.x, pos.z - b.pos.z);
    if (dist > BOT.hearRange) continue;
    b.heardAt = now;
    b.heardPos.set(pos.x, 0, pos.z);
    if (b.mode === 'hold' || b.mode === 'route') b.mode = 'investigate';
  }
}

// Walk toward a target point with collision; returns true on arrival.
function walkTo(bot, target, speed, dt, solids) {
  const dx = target.x - bot.pos.x;
  const dz = target.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.4) return true;
  const vx = (dx / dist) * speed;
  const vz = (dz / dist) * speed;
  bot.vel.set(vx, 0, vz);
  bot.vel.y -= BOT.gravity * dt;
  const hits = moveBody(bot.pos, BOT.half, BOT.height, bot.vel, dt, solids);
  if (hits.y) bot.vel.y = 0;
  const clamped = clampToYard(bot.pos.x, bot.pos.z);
  bot.pos.x = clamped.x;
  bot.pos.z = clamped.z;
  bot.yaw = Math.atan2(dx, -dz);
  return dist < 0.6;
}

// One fixed step for one bot.
export function updateBot(bot, dt, game, now) {
  if (!bot.alive) {
    bot.group.visible = false;
    return;
  }
  const { player, solids, match, rng } = game;
  const sees = canSeePlayer(bot, player, solids);

  if (sees) {
    bot.lastSeenAt = now;
    bot.lastSeenPos.copy(player.pos);
    if (bot.mode !== 'engage') {
      bot.mode = 'engage';
      bot.reactTimer = rng.range(BOT.reactMin, BOT.reactMax);
      bot.burstLeft = 0;
      bot.pauseTimer = 0;
    }
  }

  switch (bot.mode) {
    case 'route': {
      const wp = bot.route[bot.waypoint];
      const arrived = walkTo(bot, { x: wp[0], z: wp[1] }, BOT.walkSpeed, dt, solids);
      if (arrived) {
        bot.waypoint += 1;
        if (bot.waypoint >= bot.route.length) {
          bot.mode = 'hold';
          bot.holdTime = 0;
          // Watch back up the lane it came down.
          bot.watchYaw = bot.yaw + Math.PI;
        }
      }
      break;
    }
    case 'hold': {
      bot.holdTime += dt;
      // Slow scan: sweep the watch yaw, and peek a few metres sideways.
      bot.yaw = bot.watchYaw + Math.sin(bot.holdTime * 0.5) * 0.6;
      if (bot.heardAt > now - 4 && bot.mode === 'hold') bot.mode = 'investigate';
      break;
    }
    case 'investigate': {
      const arrived = walkTo(bot, bot.heardPos, BOT.huntSpeed, dt, solids);
      if (arrived || bot.heardAt < now - 6) {
        bot.mode = 'hold';
        bot.watchYaw = bot.yaw;
        bot.holdTime = 0;
      }
      break;
    }
    case 'engage': {
      if (!sees && now - bot.lastSeenAt > 2.5) {
        bot.mode = bot.lastSeenPos.lengthSq() > 0 ? 'investigate' : 'hold';
        bot.heardPos.copy(bot.lastSeenPos);
        bot.heardAt = now;
        break;
      }
      // Face the player and strafe; fire in bursts after the reaction delay.
      const dx = player.pos.x - bot.pos.x;
      const dz = player.pos.z - bot.pos.z;
      bot.yaw = Math.atan2(dx, -dz);
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeTimer = rng.range(0.7, 1.4);
        bot.strafeDir = rng.chance(0.5) ? 1 : -1;
      }
      const side = new THREE.Vector3(Math.cos(bot.yaw), 0, Math.sin(bot.yaw));
      bot.pos.x += side.x * bot.strafeDir * 1.1 * dt;
      bot.pos.z += side.z * bot.strafeDir * 1.1 * dt;
      bot.reactTimer -= dt;
      if (bot.reactTimer > 0) break;
      if (bot.burstLeft > 0) {
        bot.burstTimer -= dt;
        if (bot.burstTimer <= 0) {
          bot.burstTimer = BOT.burstGap;
          bot.burstLeft -= 1;
          const shot = fireBotShot(game, bot, player, game.loadout, now);
          game.sound.shot('bot');
          flashBotMuzzle(bot);
          if (shot.hit) {
            game.onBotHitPlayer(bot, shot.damage, now);
          }
        }
      } else {
        bot.pauseTimer -= dt;
        if (bot.pauseTimer <= 0) {
          bot.burstLeft = BOT.burstSize;
          bot.pauseTimer = BOT.burstPause;
        }
      }
      break;
    }
    case 'retake':
    case 'defuse': {
      // After a plant, converge on the planted site.
      const site = MAP.sites[match.plantedSite];
      if (!site) break;
      const near = Math.hypot(bot.pos.x - site.x, bot.pos.z - site.z) < 2.2;
      if (bot.mode === 'defuse') {
        if (!near) {
          walkTo(bot, { x: site.x, z: site.z }, BOT.huntSpeed, dt, solids);
        } else {
          // Channel the defuse.
          match.defuseHeld += dt;
          match.defusingBot = bot;
          if (Math.floor(match.defuseHeld * 4) !== Math.floor((match.defuseHeld - dt) * 4)) {
            game.sound.defuseTick();
          }
        }
      } else if (!near) {
        walkTo(bot, { x: site.x, z: site.z }, BOT.huntSpeed, dt, solids);
      }
      break;
    }
    default:
      break;
  }

  // Retake orders override everything once the charge is planted.
  if (match.phase === 'planted' && match.plantedSite) {
    if (bot.mode !== 'engage' && bot.mode !== 'defuse' && bot.mode !== 'retake') {
      bot.mode = 'retake';
    }
  }

  // Sync the mesh to the body.
  bot.group.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
  bot.group.rotation.y = bot.yaw;
  if (bot.flashTimer > 0) {
    bot.flashTimer -= dt;
    const flash = bot.group.getObjectByName('muzzleFlash');
    if (flash) flash.material.opacity = bot.flashTimer > 0 ? 0.9 : 0;
  }
}

function flashBotMuzzle(bot) {
  const flash = bot.group.getObjectByName('muzzleFlash');
  if (!flash) return;
  flash.material.opacity = 0.9;
  bot.flashTimer = 0.06;
}

// Assign the retake: the closest living bot defuses, the rest hunt.
export function assignDefuser(bots, match) {
  let best = null;
  let bestDist = Infinity;
  for (const b of bots) {
    if (!b.alive) continue;
    const site = MAP.sites[match.plantedSite];
    const d = Math.hypot(b.pos.x - site.x, b.pos.z - site.z);
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }
  for (const b of bots) {
    if (!b.alive) continue;
    b.mode = b === best ? 'defuse' : 'retake';
  }
  match.defuseHeld = 0;
  match.defusingBot = best;
}

// Damage a bot; returns true when the hit killed it.
export function damageBot(bot, damage) {
  if (!bot.alive) return false;
  bot.hp -= damage;
  if (bot.hp <= 0) {
    bot.hp = 0;
    bot.alive = false;
    bot.group.visible = false;
    return true;
  }
  return false;
}

export function livingBots(bots) {
  return bots.filter((b) => b.alive);
}
