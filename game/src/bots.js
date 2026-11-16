// Cinder bots: four defenders with routes, holds, sight and hearing. Each bot
// runs a small state machine — route (walk its ROUTES waypoints) -> hold (watch
// an angle, sweeping its yaw) -> hunt (move to the last place the player was seen
// or heard) -> push (converge on a planted site) -> defuse (channel the defuse).
// Sight is a real line-of-sight ray against the world's shootables; hearing is
// gunfire within earshot. Shooting is hitscan with a tracer: the ray must clear
// the world, then a hit roll accounts for distance, the player's speed and
// crouch. Bots strafe while engaging, burst fire with a reaction delay, and stop
// to defuse only when the player is not in sight.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';
import { createBody, moveBody } from './physics.js';
import { range } from './rng.js';

const NAMES = ['ASH', 'COAL', 'FLINT', 'SLAG'];
const HEALTH = 100;
const BOT_SPEED = 3.6;
const HUNT_SPEED = 4.4;
const SIGHT_RANGE = 46;
const HEAR_RANGE = 28;
const EYE_HEIGHT = 1.5;

export function createBots(scene, colliders, shootables, random) {
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.enemy), roughness: 0.6, metalness: 0.05 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#232830'), roughness: 0.85 });
  const visorMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.3, metalness: 0.2, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.35 });
  const torsoGeometry = new THREE.BoxGeometry(0.55, 0.78, 0.32);
  const headGeometry = new THREE.SphereGeometry(0.16, 14, 10);
  const legGeometry = new THREE.BoxGeometry(0.2, 0.62, 0.2);
  const gunGeometry = new THREE.BoxGeometry(0.07, 0.09, 0.62);
  const visorGeometry = new THREE.BoxGeometry(0.24, 0.05, 0.05);

  const bots = [];
  const hitMeshes = [];

  for (let index = 0; index < 4; index += 1) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeometry, bodyMaterial.clone());
    torso.position.y = 1.05;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeometry, darkMaterial);
    head.position.y = 1.58;
    head.userData.part = 'head';
    const visor = new THREE.Mesh(visorGeometry, visorMaterial);
    visor.position.set(0, 1.58, -0.14);
    const legL = new THREE.Mesh(legGeometry, darkMaterial);
    legL.position.set(-0.14, 0.31, 0);
    const legR = new THREE.Mesh(legGeometry, darkMaterial);
    legR.position.set(0.14, 0.31, 0);
    const gun = new THREE.Mesh(gunGeometry, darkMaterial);
    gun.position.set(0.2, 1.15, -0.35);
    group.add(torso, head, visor, legL, legR, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);
    const bot = {
      id: index,
      name: NAMES[index],
      group,
      torso,
      head,
      body: createBody(colliders, MAP.botSpawns[index][0], MAP.botSpawns[index][1]),
      health: HEALTH,
      alive: true,
      yaw: Math.PI,
      state: 'route',
      routeIndex: 0,
      hold: MAP.holds[index],
      target: new THREE.Vector3(),
      lastSeen: -99,
      seenNow: false,
      reactionAt: 0,
      burstLeft: 0,
      nextShotAt: 0,
      strafeDir: 1,
      strafeUntil: 0,
      heardAt: -99,
      heardPos: new THREE.Vector3(),
      defuse: 0,
      fall: 0,
      lastShotAt: -99,
      stuckAt: 0,
      lastPos: new THREE.Vector3(),
      detour: null,
      flash: 0,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
  }

  const nodeKeys = Object.keys(MAP.nodes);
  // Reused temporaries: the bot step runs every frame, so no vector is allocated there.
  const eyeV = new THREE.Vector3();
  const chestV = new THREE.Vector3();
  const goalV = new THREE.Vector3();

  function nearestNode(x, z) {
    let best = nodeKeys[0];
    let bestDist = Infinity;
    for (const key of nodeKeys) {
      const [nx, nz] = MAP.nodes[key];
      const dist = (nx - x) * (nx - x) + (nz - z) * (nz - z);
      if (dist < bestDist) {
        bestDist = dist;
        best = key;
      }
    }
    return best;
  }

  // Turn toward (x, z) at most `rate` radians per second.
  function faceToward(bot, x, z, dt, rate) {
    const want = Math.atan2(-(x - bot.body.position.x), -(z - bot.body.position.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  // Walk toward (x, z); true when close enough to count as arrived.
  function moveToward(bot, x, z, speed, dt) {
    const dx = x - bot.body.position.x;
    const dz = z - bot.body.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return true;
    moveBody(bot.body, dt, dx / len, dz / len, speed, 30, 8);
    return len < 0.6;
  }

  // Pick a new strafe direction after a random interval.
  function refreshStrafe(bot, time, minDelay, maxDelay) {
    if (time <= bot.strafeUntil) return;
    bot.strafeUntil = time + range(random, minDelay, maxDelay);
    bot.strafeDir = random() < 0.5 ? -1 : 1;
  }

  function reset() {
    for (let index = 0; index < bots.length; index += 1) {
      const bot = bots[index];
      const [x, z] = MAP.botSpawns[index];
      bot.body.position.set(x, 0, z);
      bot.body.velocity.set(0, 0, 0);
      bot.health = HEALTH;
      bot.alive = true;
      bot.yaw = Math.PI;
      bot.state = 'route';
      bot.routeIndex = 0;
      bot.target.set(0, 0, 0);
      bot.lastSeen = -99;
      bot.seenNow = false;
      bot.heardAt = -99;
      bot.defuse = 0;
      bot.fall = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.set(x, 0, z);
      bot.group.visible = true;
      bot.torso.material.emissive = new THREE.Color(0x000000);
      bot.lastShotAt = -99;
      bot.detour = null;
      bot.burstLeft = 0;
    }
  }

  // Returns true when the damage killed the bot. Being shot pulls a routing or
  // holding bot off its route: main.js points it at the shooter.
  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.flash = 0.12;
    bot.torso.material.emissive = new THREE.Color(PALETTE.accent);
    bot.torso.material.emissiveIntensity = 0.9;
    if (bot.health > 0) {
      if (bot.state === 'route' || bot.state === 'hold') bot.state = 'hunt';
      return false;
    }
    bot.alive = false;
    bot.fall = 0;
    bot.state = 'dead';
    return true;
  }

  function step(dt, ctx) {
    const time = ctx.time;
    for (const bot of bots) {
      if (!bot.alive) {
        // Fall over: pitch the body back over 0.4 s.
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
        bot.group.position.y = -bot.fall * 0.08;
        continue;
      }
      if (bot.flash > 0) {
        bot.flash -= dt;
        if (bot.flash <= 0) bot.torso.material.emissiveIntensity = 0;
      }
      const pos = bot.body.position;
      const player = ctx.player;
      eyeV.set(pos.x, EYE_HEIGHT, pos.z);
      chestV.set(player.pos.x, player.pos.y + 1.2, player.pos.z);

      // Perception, throttled per bot by its index so the four rays spread over frames.
      if (player.alive && (ctx.frame + bot.id) % 6 === 0) {
        const dist = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
        const seen = dist < SIGHT_RANGE && ctx.hasLineOfSight(eyeV, chestV, shootables);
        bot.seenNow = seen;
        if (seen) {
          const firstSpot = time - bot.lastSeen > 1.2;
          bot.lastSeen = time;
          bot.target.set(player.pos.x, 0, player.pos.z);
          if (firstSpot) bot.reactionAt = time + range(random, 0.5, 0.9);
          if (bot.state === 'route' || bot.state === 'hold') bot.state = 'hunt';
        }
      }
      // Hearing: a shot within earshot pulls the bot to investigate.
      if (ctx.noise.time > 0 && time - ctx.noise.time < 1.5) {
        const dist = Math.hypot(ctx.noise.pos.x - pos.x, ctx.noise.pos.z - pos.z);
        if (dist < HEAR_RANGE && time - bot.heardAt > 2) {
          bot.heardAt = time;
          bot.heardPos.copy(ctx.noise.pos);
          if (bot.state === 'route' || bot.state === 'hold') {
            bot.state = 'hunt';
            bot.target.copy(ctx.noise.pos);
          }
        }
      }
      // A planted charge overrides everything: converge on the site, then defuse.
      if (ctx.plant.status === 'planted') {
        if (bot.state !== 'defuse') bot.state = 'push';
      }

      const speed = bot.state === 'hunt' || bot.state === 'push' ? HUNT_SPEED : BOT_SPEED;
      if (bot.state === 'route') {
        const route = MAP.routes[bot.id];
        const node = MAP.nodes[route[bot.routeIndex]];
        const arrived = moveToward(bot, node[0], node[1], speed, dt);
        faceToward(bot, node[0], node[1], dt, 6);
        if (arrived) {
          bot.routeIndex += 1;
          if (bot.routeIndex >= route.length) {
            bot.state = 'hold';
            bot.yaw = bot.hold[2];
          }
        }
      } else if (bot.state === 'hold') {
        // Watch the angle: slow sweep around the hold yaw, small strafe peeks.
        bot.yaw = bot.hold[2] + Math.sin(time * 0.5 + bot.id * 1.7) * 0.45;
        refreshStrafe(bot, time, 1.5, 3);
        const side = Math.cos(bot.yaw) * bot.strafeDir * 0.4;
        const fwd = -Math.sin(bot.yaw) * bot.strafeDir * 0.4;
        moveBody(bot.body, dt, fwd, side, 0.8, 30, 8);
      } else if (bot.state === 'hunt' || bot.state === 'push') {
        if (bot.state === 'push' && ctx.plant.site) goalV.set(ctx.plant.site.x, 0, ctx.plant.site.z);
        else goalV.copy(bot.target);
        // Stuck detection: if barely moved in a second, detour via the nearest node.
        if (time - bot.stuckAt > 1) {
          const moved = Math.hypot(pos.x - bot.lastPos.x, pos.z - bot.lastPos.z);
          bot.lastPos.copy(pos);
          bot.stuckAt = time;
          if (moved < 0.25 && !bot.detour) bot.detour = MAP.nodes[nearestNode(pos.x, pos.z)];
        }
        let gx = goalV.x;
        let gz = goalV.z;
        if (bot.detour) {
          gx = bot.detour[0];
          gz = bot.detour[1];
          if (Math.hypot(gx - pos.x, gz - pos.z) < 0.8) bot.detour = null;
        }
        const arrived = moveToward(bot, gx, gz, speed, dt);
        faceToward(bot, gx, gz, dt, 7);
        if (bot.state === 'push' && ctx.plant.site && Math.hypot(ctx.plant.site.x - pos.x, ctx.plant.site.z - pos.z) < 1.6) {
          bot.state = 'defuse';
          bot.defuse = 0;
        } else if (bot.state === 'hunt' && arrived && time - bot.lastSeen > 2) {
          bot.state = 'hold';
          bot.hold = [pos.x, pos.z, bot.yaw];
        }
      } else if (bot.state === 'defuse') {
        // Channel the defuse; taking fire or spotting the player breaks it off.
        if (bot.seenNow && time > bot.reactionAt) {
          bot.state = 'hunt';
          bot.defuse = 0;
        } else {
          bot.defuse += dt;
          if (Math.floor(bot.defuse * 2) !== Math.floor((bot.defuse - dt) * 2)) ctx.onDefuseTick();
          if (bot.defuse >= 5) ctx.onDefused(bot);
        }
      }

      // Engage: after the reaction delay, burst fire at the last seen position.
      if (bot.seenNow && player.alive && time >= bot.reactionAt) {
        faceToward(bot, player.pos.x, player.pos.z, dt, 10);
        if (bot.burstLeft <= 0 && time >= bot.nextShotAt) {
          bot.burstLeft = 3 + Math.floor(random() * 3);
          bot.nextShotAt = time + range(random, 0.5, 0.9);
        }
        if (bot.burstLeft > 0 && time >= bot.nextShotAt) {
          bot.burstLeft -= 1;
          bot.nextShotAt = time + 0.13;
          bot.lastShotAt = time;
          ctx.botShoot(bot, player);
        }
        // Strafe while engaging so the player cannot pre-aim a still target.
        refreshStrafe(bot, time, 0.6, 1.2);
        const sideX = Math.cos(bot.yaw) * bot.strafeDir;
        const sideZ = -Math.sin(bot.yaw) * bot.strafeDir;
        moveBody(bot.body, dt, sideX, sideZ, 1.6, 30, 8);
      }

      bot.group.position.set(pos.x, bot.group.position.y, pos.z);
      bot.group.rotation.y = bot.yaw;
    }
  }

  return {
    bots,
    hitMeshes,
    reset,
    damage,
    step,
    aliveCount() {
      return bots.filter((bot) => bot.alive).length;
    },
    positions() {
      return bots.map((bot) => ({ x: bot.body.position.x, z: bot.body.position.z, alive: bot.alive, lastShotAt: bot.lastShotAt, yaw: bot.yaw }));
    },
  };
}
