// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. main.js is the only place that knows about rounds, money and
// the charge — the player moves, the weapons fire, the bots think, and this file
// decides what any of it means. ?shot=start|play|buy|end with &seed=N stages a
// deterministic frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponRig, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenades.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import {
  createMatchState, resetMatch, resetRound, addFeed,
  BUY_SECONDS, ROUND_SECONDS, PLANT_SECONDS, FUSE_SECONDS, ROUNDS_TO_WIN, MAX_ROUNDS,
  START_MONEY, KILL_REWARD, WIN_REWARD, LOSS_REWARD, PLANT_REWARD,
} from './state.js';
import { mulberry32 } from './rng.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

// ---------------------------------------------------------------- renderer ---

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 85);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

// ------------------------------------------------------------------ systems ---

const audio = createAudio();
const world = createWorld(scene);
const bots = createBots(scene, world.colliders, world.shootables, random);
const combat = createCombat(scene);
const rig = createWeaponRig(camera);
const hud = createHud();
const player = createPlayer(world.colliders, MAP.playerSpawn[0], MAP.playerSpawn[1]);
const input = createInput(renderer.domElement, onLockChange);
const targets = world.shootables.concat(bots.hitMeshes);
const match = createMatchState();

const pstate = player.state;
const body = pstate.body;
const noise = { pos: new THREE.Vector3(), time: -99 };
const direction = new THREE.Vector3();

// -------------------------------------------------------------------- clock ---

let time = 0;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let frameCount = 0;
let shake = 0;
let lastDryAt = -99;
let lastPlantBeep = -99;
let minimapAt = -99;
let prevKeys = new Set();

const grenades = createGrenades(scene, world.colliders, onGrenadeExplode);

// -------------------------------------------------------------- camera/HUD ---

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + pstate.eye, body.position.z);
  camera.rotation.set(pstate.pitch, pstate.yaw, 0, 'YXZ');
  if (shake > 0.001) {
    camera.position.x += (random() * 2 - 1) * shake * 0.12;
    camera.position.y += (random() * 2 - 1) * shake * 0.12;
    shake *= 0.86;
  }
}

// Point the view at a world point (used by the ?shot= staging).
function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + pstate.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  pstate.yaw = Math.atan2(-dx, -dz);
  pstate.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function refreshHud() {
  hud.setHealth(match.playerHealth, rig.state.armor);
  hud.setAmmo(rig.state.ammo[rig.state.current].mag, rig.state.ammo[rig.state.current].reserve, WEAPONS[rig.state.current].short, rig.state.grenades);
  hud.setMoney(match.money);
  hud.setScore(match.wins, match.losses, match.round);
  hud.setAlive(match.playerAlive ? 1 : 0, bots.aliveCount());
}

// ------------------------------------------------------------ round machine ---

function startMatch() {
  resetMatch(match);
  rig.resetRound();
  player.reset(MAP.playerSpawn[0], MAP.playerSpawn[1]);
  bots.reset();
  hud.hideBanner();
  hud.setPlant(null, null);
  hud.setObjective('Buy phase — press 1-4 to buy, B to hide');
  hud.showBuy(true, rig.state.owned, match.money);
  refreshHud();
}

function startLive() {
  match.phase = 'live';
  match.timer = ROUND_SECONDS;
  hud.showBuy(false);
  hud.banner(`ROUND ${match.round}`, 'Plant the charge at Site A or Site B');
  hud.setObjective('Plant the charge at Site A or Site B');
  audio.unlock();
}

function endRound(won, reason) {
  if (match.phase !== 'live') return;
  match.phase = 'roundEnd';
  match.timer = 4.5;
  if (won) {
    match.wins += 1;
    match.money += WIN_REWARD;
    audio.roundWin();
  } else {
    match.losses += 1;
    match.money += LOSS_REWARD;
    audio.roundLose();
  }
  hud.banner(won ? 'ROUND WON' : 'ROUND LOST', reason, 4200);
  hud.setObjective(won ? 'Round won' : 'Round lost');
  hud.setPlant(null, null);
  addFeed(match, `${won ? 'Round won' : 'Round lost'} — ${reason}`, won ? 'kill' : 'death');
  hud.feed(`${won ? 'Round won' : 'Round lost'} — ${reason}`, won ? 'kill' : 'death');
  refreshHud();
  if (document.pointerLockElement) document.exitPointerLock();
}

function nextRound() {
  if (match.wins >= ROUNDS_TO_WIN || match.losses >= ROUNDS_TO_WIN || match.round >= MAX_ROUNDS) {
    match.phase = 'matchEnd';
    const wonMatch = match.wins > match.losses;
    hud.showOverlay('matchEnd', wonMatch
      ? `Vanguard takes the match ${match.wins} — ${match.losses}. The yard is yours.`
      : `Cinder takes the match ${match.losses} — ${match.wins}. The yard holds.`);
    return;
  }
  match.round += 1;
  resetRound(match);
  player.reset(MAP.playerSpawn[0], MAP.playerSpawn[1]);
  bots.reset();
  rig.refillOwned();
  rig.state.grenades = 0;
  rig.state.armor = false;
  hud.hideBanner();
  hud.setObjective('Buy phase — press 1-4 to buy, B to hide');
  hud.showBuy(true, rig.state.owned, match.money);
  refreshHud();
}

// ------------------------------------------------------------------ economy ---

function buyItem(id) {
  if (match.phase !== 'buy') return;
  if (id === 'smg' || id === 'shotgun') {
    const def = WEAPONS[id];
    if (rig.state.owned.has(id) || match.money < def.price) return;
    match.money -= def.price;
    rig.buy(id);
    rig.select(id);
    audio.buy();
    hud.feed(`Bought ${def.name}`, 'info');
  } else if (id === 'grenade') {
    if (rig.state.grenades >= 2 || match.money < GRENADE_PRICE) return;
    match.money -= GRENADE_PRICE;
    rig.state.grenades += 1;
    audio.buy();
    hud.feed('Bought Frag-9 grenade', 'info');
  } else if (id === 'armor') {
    if (rig.state.armor || match.money < ARMOR_PRICE) return;
    match.money -= ARMOR_PRICE;
    rig.state.armor = true;
    audio.buy();
    hud.feed('Bought Kevlar vest', 'info');
  }
  hud.showBuy(true, rig.state.owned, match.money);
  refreshHud();
}

// ------------------------------------------------------------------- combat ---

function damagePlayer(amount, sourceName) {
  if (!match.playerAlive || match.phase !== 'live') return;
  if (rig.state.armor) amount = Math.ceil(amount / 2);
  match.playerHealth -= amount;
  hud.damageFlash();
  audio.hurt();
  if (match.playerHealth > 0) {
    refreshHud();
    return;
  }
  match.playerHealth = 0;
  match.playerAlive = false;
  hud.feed(`Eliminated by ${sourceName}`, 'death');
  addFeed(match, `Eliminated by ${sourceName}`, 'death');
  refreshHud();
  // Dying with the charge planted does not end the round: the fuse still runs.
  if (match.plant.status !== 'planted') {
    endRound(false, `Eliminated by ${sourceName}`);
  } else {
    hud.setObjective('Eliminated — the charge is still ticking');
  }
}

function onGrenadeExplode(pos, owner) {
  audio.explosion();
  const playerDist = Math.hypot(pos.x - body.position.x, pos.z - body.position.z);
  if (playerDist < 12) shake = Math.max(shake, 1.2 - playerDist * 0.08);
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const dist = Math.hypot(pos.x - bot.body.position.x, pos.z - bot.body.position.z);
    if (dist > 6.5) continue;
    const damage = Math.max(15, Math.round(100 - dist * 12));
    const killed = bots.damage(bot, damage, 'torso');
    bot.target.copy(body.position);
    if (killed && owner === 'player') {
      match.money += KILL_REWARD;
      match.kills += 1;
      hud.feed(`${bot.name} caught in the blast (+$${KILL_REWARD})`, 'kill');
      audio.kill();
    }
  }
  if (playerDist < 6.5 && match.playerAlive) {
    damagePlayer(Math.max(10, Math.round((100 - playerDist * 12) * 0.6)), 'the blast');
  }
  refreshHud();
}

// What the bots call back into: their view of the player, the plant, and how
// one of their shots is resolved. A bot shot first has to clear the world; a
// blocked ray never lands, and a clear one still only hits on the roll.
const botCtx = {
  time: 0,
  frame: 0,
  player: { pos: body.position, alive: true, speed: 0 },
  noise,
  plant: match.plant,
  hasLineOfSight: (from, to, blockers) => combat.hasLineOfSight(from, to, blockers),
  onDefuseTick: () => audio.defuseBeep(),
  onDefused: () => {
    if (match.phase === 'live' && match.plant.status === 'planted') {
      endRound(false, 'Charge defused by Cinder');
    }
  },
  botShoot: (bot, playerInfo) => {
    const muzzle = new THREE.Vector3(bot.body.position.x, 1.4, bot.body.position.z);
    const forward = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    muzzle.addScaledVector(forward, 0.4);
    const chest = new THREE.Vector3(body.position.x, body.position.y + 1.2, body.position.z);
    const dist = muzzle.distanceTo(chest);
    direction.copy(chest).sub(muzzle).normalize();
    const spread = 0.02 + dist * 0.0012 + (player.groundSpeed() > 3 ? 0.01 : 0) - (pstate.crouching ? 0.006 : 0);
    const hit = combat.shoot(muzzle, direction, spread, random, world.shootables, 1);
    // The ray stopped short of the player: something is in the way.
    if (hit && hit.distance < dist - 0.5) return;
    const chance = Math.max(0.06, Math.min(0.38, 0.42 - dist * 0.007 - player.groundSpeed() * 0.025 - (pstate.crouching ? 0.1 : 0)));
    if (random() < chance) {
      const head = random() < 0.12;
      const damage = Math.round(11 * (head ? 2 : 1) * (dist > 25 ? 0.7 : 1));
      damagePlayer(damage, bot.name);
    }
    audio.enemyShot();
  },
};

// One trigger pull: spend a round, cast the pellets, pay out a kill.
function shoot(spreadOverride) {
  const def = rig.def();
  if (!rig.takeRound()) {
    if (time - lastDryAt > 0.3) {
      lastDryAt = time;
      audio.dry();
    }
    return false;
  }
  camera.getWorldDirection(direction);
  const spread = spreadOverride === 0 ? 0 : rig.spread(player.groundSpeed(), pstate.crouching, !body.onGround);
  const origin = camera.position;
  const hit = combat.shoot(origin, direction, spread, random, targets, def.pellets);
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const falloff = hit.distance > 25 ? 0.75 : 1;
    const damage = Math.round(def.damage * (hit.part === 'head' ? def.headMult : 1) * falloff);
    bot.target.copy(body.position);
    const killed = bots.damage(bot, damage, hit.part);
    hud.hitMarker(killed, shot ? 4000 : 90);
    if (killed) {
      match.money += KILL_REWARD;
      match.kills += 1;
      hud.feed(`${bot.name} eliminated ${hit.part === 'head' ? '(headshot)' : ''} (+$${KILL_REWARD})`, 'kill');
      audio.kill();
    } else {
      audio.hit();
    }
    refreshHud();
  }
  rig.pullTrigger();
  audio.shot(def.id);
  player.recoil(def.recoil + random() * 0.004, (random() * 2 - 1) * 0.004);
  noise.pos.copy(body.position);
  noise.time = time;
  hud.setAmmo(rig.state.ammo[rig.state.current].mag, rig.state.ammo[rig.state.current].reserve, def.short, rig.state.grenades);
  return true;
}

// -------------------------------------------------------------------- plant ---

function plantStep(dt, keys) {
  const plant = match.plant;
  if (plant.status === 'planted') {
    plant.fuse -= dt;
    hud.setPlant(null, plant.fuse, `CHARGE FUSE — SITE ${plant.site.id}`);
    if (plant.fuse <= 0) {
      audio.explosion();
      shake = 2;
      endRound(true, `Charge detonated at Site ${plant.site.id}`);
    }
    return;
  }
  let site = null;
  for (const candidate of MAP.sites) {
    const dist = Math.hypot(candidate.x - body.position.x, candidate.z - body.position.z);
    if (dist < MAP.plantRadius) {
      site = candidate;
      break;
    }
  }
  if (site && match.playerAlive && keys.has('KeyE')) {
    plant.progress += dt;
    if (time - lastPlantBeep > 0.5) {
      lastPlantBeep = time;
      audio.plantBeep();
    }
    hud.setPlant(plant.progress / PLANT_SECONDS, null, 'PLANTING THE CHARGE');
    if (plant.progress >= PLANT_SECONDS) {
      plant.status = 'planted';
      plant.site = site;
      plant.progress = 0;
      plant.fuse = FUSE_SECONDS;
      match.money += PLANT_REWARD;
      audio.plantDone();
      hud.banner('CHARGE PLANTED', `Defend Site ${site.id} — 35 seconds to detonation`, 3000);
      hud.feed(`Charge planted at Site ${site.id} (+$${PLANT_REWARD})`, 'objective');
      hud.setObjective(`Charge planted — defend Site ${site.id}`);
      refreshHud();
    }
  } else {
    plant.progress = Math.max(0, plant.progress - dt * 2);
    if (plant.progress > 0) hud.setPlant(plant.progress / PLANT_SECONDS, null, 'PLANTING THE CHARGE');
    else hud.setPlant(null, null);
  }
}

// -------------------------------------------------------------- the step ---

function step(dt) {
  time += dt;
  botCtx.time = time;
  botCtx.frame = frameCount;
  botCtx.player.alive = match.playerAlive;
  botCtx.player.speed = player.groundSpeed();
  if (match.phase === 'buy') {
    match.timer -= dt;
    if (match.playerAlive) player.step(dt, input.state.keys);
    rig.step(dt);
    if (match.timer <= 0) startLive();
  } else if (match.phase === 'live') {
    if (match.plant.status !== 'planted') match.timer -= dt;
    if (match.playerAlive) player.step(dt, input.state.keys);
    rig.step(dt);
    bots.step(dt, botCtx);
    grenades.step(dt);
    combat.step(dt);
    // A dead player with a planted charge still lets the fuse run out.
    if (match.playerAlive || match.plant.status === 'planted') plantStep(dt, input.state.keys);
    const alive = bots.aliveCount();
    if (match.phase === 'live' && alive === 0) {
      endRound(true, match.plant.status === 'planted' ? 'Site secured' : 'Cinder team eliminated');
    } else if (match.phase === 'live' && match.plant.status !== 'planted' && match.timer <= 0) {
      endRound(false, 'Time expired — charge never planted');
    }
  } else if (match.phase === 'roundEnd') {
    match.timer -= dt;
    rig.step(dt);
    grenades.step(dt);
    combat.step(dt);
    if (match.timer <= 0) nextRound();
  } else {
    rig.step(dt);
    combat.step(dt);
  }
  if (shake > 0.001) shake *= Math.pow(0.02, dt);
  syncCamera();
}

// ------------------------------------------------------------- input wiring ---

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if (match.phase === 'live' && match.playerAlive) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (match.phase === 'menu' || match.phase === 'matchEnd') startMatch();
  input.requestLock();
});

renderer.domElement.addEventListener('click', () => {
  if (shot || match.phase === 'menu' || match.phase === 'matchEnd') return;
  if (!input.state.locked && match.phase !== 'roundEnd') input.requestLock();
});

hud.onBuy((id) => buyItem(id));

// -------------------------------------------------------------- the frame ---

function edgePressed(code) {
  return input.state.keys.has(code) && !prevKeys.has(code);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  frameCount += 1;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const keys = input.state.keys;
    if (match.phase === 'buy') {
      if (edgePressed('Digit1')) buyItem('smg');
      if (edgePressed('Digit2')) buyItem('shotgun');
      if (edgePressed('Digit3')) buyItem('grenade');
      if (edgePressed('Digit4')) buyItem('armor');
      if (edgePressed('KeyB')) hud.showBuy(document.getElementById('buy').hidden, rig.state.owned, match.money);
    } else if (match.phase === 'live') {
      if (edgePressed('Digit1')) rig.select('rifle');
      if (edgePressed('Digit2')) rig.select('smg');
      if (edgePressed('Digit3')) rig.select('shotgun');
      if (edgePressed('KeyG') && rig.state.grenades > 0 && match.playerAlive) {
        camera.getWorldDirection(direction);
        if (grenades.throwGrenade(camera.position, direction, 'player')) {
          rig.state.grenades -= 1;
          refreshHud();
        }
      }
      if (input.state.firing && rig.ready() && match.playerAlive) shoot();
      if (keys.has('KeyR')) rig.reload();
    }
    prevKeys = new Set(keys);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    hud.setSpread(3 + rig.spread(player.groundSpeed(), pstate.crouching, !body.onGround) * 400);
    if (time - minimapAt > 0.15) {
      minimapAt = time;
      hud.drawMinimap(body.position.x, body.position.z, pstate.yaw, bots.positions(), match.plant, time);
    }
    if (match.phase === 'buy') hud.setTimer(match.timer, 'buy');
    else if (match.phase === 'live') hud.setTimer(match.plant.status === 'planted' ? match.plant.fuse : match.timer, match.plant.status === 'planted' ? 'fuse' : 'live');
    else hud.setTimer(match.timer, match.phase);
  }
  renderer.render(scene, camera);
}

// ----------------------------------------------------------- ?shot= staging ---

// Run the simulation forward without rendering, for a deterministic capture.
function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function placeBot(index, x, z, yaw, stateName) {
  const bot = bots.bots[index];
  bot.body.position.set(x, 0, z);
  bot.body.velocity.set(0, 0, 0);
  bot.group.position.set(x, 0, z);
  bot.yaw = yaw;
  bot.state = stateName;
  bot.group.rotation.y = yaw;
}

function killBotForShot(index, x, z) {
  const bot = bots.bots[index];
  bot.alive = false;
  bot.fall = 1;
  bot.state = 'dead';
  bot.body.position.set(x, 0, z);
  bot.group.position.set(x, -0.08, z);
  bot.group.rotation.x = -1.45;
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBanner();
  rig.resetRound();
  bots.reset();
  match.wins = 0;
  match.losses = 0;
  match.money = START_MONEY;
  match.kills = 0;
  if (name === 'start') {
    match.phase = 'buy';
    match.round = 1;
    match.timer = BUY_SECONDS;
    player.reset(0, 13.5);
    placeBot(0, -8, -2, Math.PI, 'hold');
    placeBot(1, 0, -4, Math.PI, 'hold');
    placeBot(2, 8, -2, Math.PI, 'hold');
    placeBot(3, -14, -8, Math.PI * 0.75, 'hold');
    settle(20);
    aimAt(new THREE.Vector3(0, 1.4, -8));
    hud.showBuy(false);
    hud.setObjective('Buy phase — press 1-4 to buy, B to hide');
    hud.showOverlay('start');
    refreshHud();
  } else if (name === 'play') {
    match.phase = 'live';
    match.round = 1;
    match.wins = 1;
    match.timer = 71;
    match.money = 1100;
    match.playerHealth = 82;
    match.kills = 1;
    player.reset(0, 6);
    rig.state.ammo.rifle = { mag: 24, reserve: 90 };
    rig.state.grenades = 1;
    placeBot(0, -8, -2, Math.PI, 'hold');
    placeBot(1, 0, -6, Math.PI, 'hold');
    placeBot(2, -6, -8, Math.PI * 0.8, 'hold');
    placeBot(3, 10, -9, Math.PI * 1.2, 'hold');
    settle(20);
    aimAt(new THREE.Vector3(0, 1.58, -6));
    shoot(0);
    rig.step(0);
    killBotForShot(1, 0, -6);
    settle(1);
    hud.setObjective('Plant the charge at Site A or B');
    refreshHud();
    hud.setHealth(82, false);
    hud.setAmmo(23, 90, 'KESTREL', 1);
  } else if (name === 'buy') {
    match.phase = 'buy';
    match.round = 2;
    match.wins = 1;
    match.timer = 12;
    match.money = 1400;
    player.reset(0, 13.5);
    rig.buy('smg');
    match.money = 1400;
    placeBot(0, -16, -13.5, Math.PI, 'hold');
    placeBot(1, -5, -13.5, Math.PI, 'hold');
    placeBot(2, 5, -13.5, Math.PI, 'hold');
    placeBot(3, 16, -13.5, Math.PI, 'hold');
    settle(20);
    aimAt(new THREE.Vector3(0, 1.4, -8));
    hud.showBuy(true, rig.state.owned, 1400);
    hud.setObjective('Buy phase — press 1-4 to buy, B to hide');
    refreshHud();
  } else {
    match.phase = 'roundEnd';
    match.round = 3;
    match.wins = 2;
    match.losses = 1;
    match.timer = 4.5;
    match.money = 1425;
    match.playerHealth = 64;
    player.reset(0, 2);
    rig.state.ammo.rifle = { mag: 12, reserve: 90 };
    killBotForShot(0, -12, -9);
    killBotForShot(1, -15, -12);
    placeBot(2, 8, -6, Math.PI, 'hold');
    placeBot(3, 14, -8, Math.PI, 'hold');
    settle(20);
    aimAt(new THREE.Vector3(-14, 1.4, -11));
    hud.feed('Charge detonated at Site A (+$325)', 'objective');
    hud.feed('COAL eliminated (+$300)', 'kill');
    hud.setObjective('Round won');
    hud.showOverlay('roundEnd', 'VANGUARD 2 — 1 CINDER · Charge detonated at Site A');
    refreshHud();
    hud.setHealth(64, true);
    hud.setAmmo(12, 90, 'KESTREL', 0);
  }
  hud.setTimer(match.timer, match.phase);
  hud.drawMinimap(body.position.x, body.position.z, pstate.yaw, bots.positions(), match.plant, time);
  paintTwiceThenReady();
}

// Render twice so shadows and the minimap settle, then freeze the frame and
// signal the capture script.
function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
refreshHud();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
