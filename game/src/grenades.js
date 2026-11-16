// Frag-9 grenades: thrown on an arc, bouncing off the map, a 2.2 s fuse,
// then a blast that hurts bots and the player alike. The explosion is a
// growing sphere plus a light flash; the throw itself is an arc the player
// can read, so grenades reward a planned toss, not a panic throw.
import * as THREE from 'three';
import { moveBody } from './physics.js';
import { botHitboxes } from './combat.js';
import { damageBot } from './bots.js';
import { damagePlayer } from './player.js';
import { hudFeed } from './hud.js';

export const GRENADE = {
  fuseSeconds: 2.2,
  throwSpeed: 13,
  upBoost: 3.5,
  bounce: 0.42,
  blastRadius: 6,
  maxDamage: 130,
  minDamage: 20,
};

export function createGrenades(scene) {
  return { scene, live: [] };
}

// Throw from the player's eye, along the camera direction.
export function throwGrenade(grens, origin, dir) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x2e4a2e, roughness: 0.5, metalness: 0.5 }),
  );
  mesh.position.copy(origin);
  grens.scene.add(mesh);
  const vel = dir.clone().multiplyScalar(GRENADE.throwSpeed);
  vel.y += GRENADE.upBoost;
  grens.live.push({ mesh, pos: origin.clone(), vel, fuse: GRENADE.fuseSeconds });
}

export function updateGrenades(grens, dt, game) {
  for (let i = grens.live.length - 1; i >= 0; i--) {
    const g = grens.live[i];
    g.vel.y -= 14.5 * dt;
    const hits = moveBody(g.pos, 0.11, 0.22, g.vel, dt, game.solids);
    if (hits.x) g.vel.x *= -GRENADE.bounce;
    if (hits.z) g.vel.z *= -GRENADE.bounce;
    if (hits.y) {
      g.vel.y = Math.abs(g.vel.y) * GRENADE.bounce;
      if (Math.abs(g.vel.y) < 0.6) g.vel.y = 0;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    if (g.pos.y < 0.11) g.pos.y = 0.11;
    g.mesh.position.copy(g.pos);
    g.fuse -= dt;
    if (g.fuse <= 0) {
      detonate(grens, g, game);
      game.scene.remove(g.mesh);
      g.mesh.geometry.dispose();
      g.mesh.material.dispose();
      grens.live.splice(i, 1);
    }
  }
}

function detonate(grens, g, game) {
  const { bots, player, loadout, match, hud, sound } = game;
  sound.explosion();
  // Blast sphere + light, faded by the effects tick.
  const geo = new THREE.SphereGeometry(1, 18, 14);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffa040, transparent: true, opacity: 0.85,
  });
  const ball = new THREE.Mesh(geo, mat);
  ball.position.copy(g.pos);
  ball.scale.setScalar(0.3);
  game.scene.add(ball);
  const light = new THREE.PointLight(0xff8c30, 40, 16, 1.5);
  light.position.copy(g.pos).y += 0.5;
  game.scene.add(light);
  game.fx.push({ kind: 'blast', obj: ball, light, life: 0.4, max: 0.4 });

  const blastAt = g.pos.clone();
  const damageAt = (pos) => {
    const d = blastAt.distanceTo(pos);
    if (d > GRENADE.blastRadius) return 0;
    const t = 1 - d / GRENADE.blastRadius;
    return Math.round(GRENADE.minDamage + (GRENADE.maxDamage - GRENADE.minDamage) * t);
  };

  for (const bot of bots) {
    if (!bot.alive) continue;
    const dmg = damageAt(new THREE.Vector3(bot.pos.x, bot.pos.y + 1, bot.pos.z));
    if (dmg <= 0) continue;
    const killed = damageBot(bot, dmg);
    if (killed) {
      match.kills += 1;
      match.money += 300;
      hudFeed(hud, `You fragged ${bot.name} +$300`);
      sound.kill();
      if (bots.every((b) => !b.alive)) game.onTeamWiped();
    } else {
      hudFeed(hud, `Frag hit ${bot.name} (−${dmg})`);
    }
  }
  // Self-damage: half strength, so a close toss hurts but rarely kills.
  const selfDmg = Math.floor(damageAt(new THREE.Vector3(player.pos.x, player.pos.y + 1, player.pos.z)) / 2);
  if (selfDmg > 0 && player.alive) {
    damagePlayer(player, loadout, selfDmg, game.now);
    sound.hurt();
    if (!player.alive) game.onPlayerDied('caught by your own frag');
  }
}
