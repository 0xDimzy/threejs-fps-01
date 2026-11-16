// Hitscan combat: the player's shots and the bots' shots, resolved against
// axis-aligned hitboxes with a ray-vs-box test, plus tracers, impact sparks
// and muzzle flashes. No three.js Raycaster — the same slab test physics.js
// uses for the map decides what a bullet hits.
import * as THREE from 'three';
import { rayBox, raySolids, bodyBox } from './physics.js';
import { PAL } from './palette.js';
import { currentWeapon, spreadFor } from './weapons.js';

// A bot's hitboxes: a body box and a smaller head box on top.
export function botHitboxes(bot) {
  const body = {
    minX: bot.pos.x - 0.38, maxX: bot.pos.x + 0.38,
    minZ: bot.pos.z - 0.38, maxZ: bot.pos.z + 0.38,
    minY: bot.pos.y, maxY: bot.pos.y + 1.35,
  };
  const head = {
    minX: bot.pos.x - 0.24, maxX: bot.pos.x + 0.24,
    minZ: bot.pos.z - 0.24, maxZ: bot.pos.z + 0.24,
    minY: bot.pos.y + 1.35, maxY: bot.pos.y + 1.72,
  };
  return { body, head };
}

export function playerHitboxes(player) {
  const h = player.crouched ? 1.2 : 1.7;
  const body = bodyBox(player.pos, 0.35, h);
  body.maxY = player.pos.y + h - 0.3;
  const head = {
    minX: player.pos.x - 0.22, maxX: player.pos.x + 0.22,
    minZ: player.pos.z - 0.22, maxZ: player.pos.z + 0.22,
    minY: player.pos.y + h - 0.3, maxY: player.pos.y + h,
  };
  return { body, head };
}

// Fire one trigger pull of the player's current weapon. Returns a report:
// { fired, hits: [{bot, head, damage}], wallHit: Vector3|null }.
// ctx carries scene, bots, solids, fx (the transient-effects list) and rng.
export function firePlayerWeapon(game, player, loadout, now) {
  const weapon = currentWeapon(loadout);
  const report = { fired: false, hits: [], wallHit: null };
  if (loadout.cooldown > 0 || loadout.reloading > 0) return report;
  if (loadout.mag[weapon.id] <= 0) return report;

  loadout.mag[weapon.id] -= 1;
  loadout.cooldown = 60 / weapon.rpm;
  loadout.lastShotAt = now;
  loadout.recoil = Math.min(0.09, loadout.recoil + weapon.recoilKick);
  loadout.heat = Math.min(1, loadout.heat + weapon.heatPerShot);
  report.fired = true;

  const origin = new THREE.Vector3(
    player.pos.x,
    player.pos.y + player.eyeHeight,
    player.pos.z,
  );
  const spread = spreadFor(weapon, {
    speed: Math.hypot(player.vel.x, player.vel.z),
    airborne: !player.onGround,
    crouched: player.crouched,
    heat: loadout.heat,
  });

  for (let p = 0; p < weapon.pellets; p++) {
    // Aim direction: camera forward, perturbed by the spread cone.
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(player.pitch + loadout.recoil, player.yaw, 0, 'YXZ'),
    );
    dir.x += (game.rng.next() - 0.5) * 2 * spread;
    dir.y += (game.rng.next() - 0.5) * 2 * spread;
    dir.z += (game.rng.next() - 0.5) * 2 * spread;
    dir.normalize();

    // Nearest wall caps the shot.
    const wallT = raySolids(origin, dir, game.solids, weapon.range);
    let bestT = wallT === null ? weapon.range : wallT;
    let bestBot = null;
    let bestHead = false;
    for (const bot of game.bots) {
      if (!bot.alive) continue;
      const { body, head } = botHitboxes(bot);
      const tHead = rayBox(origin, dir, head, bestT);
      if (tHead !== null) {
        bestT = tHead;
        bestBot = bot;
        bestHead = true;
        continue;
      }
      const tBody = rayBox(origin, dir, body, bestT);
      if (tBody !== null) {
        bestT = tBody;
        bestBot = bot;
        bestHead = false;
      }
    }
    const end = origin.clone().addScaledVector(dir, bestT);
    addTracer(game, origin, end);
    if (bestBot) {
      const dmg = Math.round(weapon.damage * (bestHead ? weapon.headMult : 1));
      report.hits.push({ bot: bestBot, head: bestHead, damage: dmg });
      addImpact(game, end, bestHead);
    } else if (wallT !== null) {
      report.wallHit = end;
      addImpact(game, end, false);
    }
  }
  return report;
}

// A bot fires one burst pellet at the player. Hit chance falls with range
// and with the player moving or crouched; each hit does flat damage.
export function fireBotShot(game, bot, player, loadout, now) {
  const origin = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.45, bot.pos.z);
  const target = new THREE.Vector3(
    player.pos.x,
    player.pos.y + (player.crouched ? 0.9 : 1.35),
    player.pos.z,
  );
  const dist = origin.distanceTo(target);
  const dir = target.clone().sub(origin).normalize();
  const wallT = raySolids(origin, dir, game.solids, dist);
  if (wallT !== null && wallT < dist - 0.1) {
    // The shot dies in a wall: show the tracer stopping there.
    addTracer(game, origin, origin.clone().addScaledVector(dir, wallT));
    return { hit: false, blocked: true };
  }
  const speed = Math.hypot(player.vel.x, player.vel.z);
  let chance = 0.42 - dist * 0.008 - Math.min(0.12, speed * 0.02);
  if (player.crouched) chance -= 0.06;
  chance = Math.max(0.06, chance);
  const hit = game.rng.next() < chance;
  // Tracer: on a hit it lands on the player, on a miss it flies wide.
  const end = hit
    ? target
    : target.clone().add(new THREE.Vector3(
        (game.rng.next() - 0.5) * 1.6,
        (game.rng.next() - 0.5) * 1.2,
        (game.rng.next() - 0.5) * 1.6,
      ));
  addTracer(game, origin, end);
  return { hit, blocked: false, damage: 11 };
}

// --- Transient effects (tracers, impacts) ---------------------------------
// main.js ticks these every frame and removes them when their life ends;
// nothing is allocated per frame in the hot loop beyond the two vectors
// the tracer already owns.

export function addTracer(game, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({
    color: PAL.tracer, transparent: true, opacity: 0.9,
  });
  const line = new THREE.Line(geo, mat);
  game.scene.add(line);
  game.fx.push({ kind: 'tracer', obj: line, life: 0.07, max: 0.07 });
}

export function addImpact(game, at, headshot) {
  const geo = new THREE.SphereGeometry(headshot ? 0.09 : 0.06, 6, 5);
  const mat = new THREE.MeshBasicMaterial({
    color: headshot ? 0xff5a3c : 0xffd27a, transparent: true, opacity: 1,
  });
  const spark = new THREE.Mesh(geo, mat);
  spark.position.copy(at);
  game.scene.add(spark);
  game.fx.push({ kind: 'impact', obj: spark, life: 0.14, max: 0.14 });
}

export function tickEffects(game, dt) {
  for (let i = game.fx.length - 1; i >= 0; i--) {
    const fx = game.fx[i];
    fx.life -= dt;
    if (fx.life <= 0) {
      game.scene.remove(fx.obj);
      if (fx.light) game.scene.remove(fx.light);
      fx.obj.geometry?.dispose?.();
      fx.obj.material?.dispose?.();
      game.fx.splice(i, 1);
    } else if (fx.kind === 'tracer') {
      fx.obj.material.opacity = 0.9 * (fx.life / fx.max);
    } else {
      fx.obj.material.opacity = fx.life / fx.max;
      fx.obj.scale.multiplyScalar(1 + dt * 6);
    }
  }
}
