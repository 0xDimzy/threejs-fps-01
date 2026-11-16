// EMBERLINE boot + fixed-step loop + round state machine.
// Simulation runs at a fixed 60 Hz, apart from rendering: the loop
// accumulates real time, steps the world in 1/60 s slices, then renders
// once. The match state machine lives here (menu → buy → live → planted →
// roundEnd → matchEnd); the bots, player and HUD only read it.
import * as THREE from 'three';
import { createMatch, setPhase, startRound, settleRound, ECONOMY, TIMING, scoreText } from './state.js';
import { MAP, siteAt } from './map.js';
import { buildWorld } from './world.js';
import { createInput } from './input.js';
import { createSoundBank } from './audio.js';
import {
  WEAPONS, WEAPON_ORDER, createLoadout, currentWeapon, buyItem,
  buildViewModel, swapViewModel,
} from './weapons.js';
import { createPlayer, resetPlayer, updatePlayer, damagePlayer, eyePosition } from './player.js';
import { firePlayerWeapon, tickEffects } from './combat.js';
import { createBots, resetBots, updateBot, alertBots, damageBot, assignDefuser, livingBots } from './bots.js';
import { createGrenades, throwGrenade, updateGrenades } from './grenades.js';
import {
  createHud, hudSetHealth, hudSetAmmo, hudSetMoney, hudSetTimer, hudSetScore,
  hudSetObjective, hudFeed, hudBanner, hudHitmarker, hudSetPlant, hudShowBuy,
  hudShowStart, hudShowEnd, hudTick, hudDrawMinimap,
} from './hud.js';
import { makeRng } from './rng.js';

const FIXED_DT = 1 / 60;

function parseQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    shot: params.get('shot'),
    seed: Number(params.get('seed') ?? 1) || 1,
  };
}

export function boot() {
  const query = parseQuery();
  const rng = makeRng(query.seed);
  const match = createMatch();
  match.seed = query.seed;
  match.shotMode = query.shot;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game-canvas').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 200);
  scene.add(camera);

  const world = buildWorld(scene);
  const input = createInput(renderer.domElement);
  const sound = createSoundBank();
  const hud = createHud();
  const loadout = createLoadout();
  const player = createPlayer(MAP.vanguardSpawn);
  const bots = createBots();
  for (const bot of bots) scene.add(bot.group);
  const grens = createGrenades(scene);

  let viewModel = buildViewModel('rifle');
  viewModel.userData.kind = 'rifle';
  camera.add(viewModel);

  const game = {
    scene, camera, renderer, rng, match, player, bots, loadout,
    solids: world.solids, fx: [], sound, hud, input, grens,
    now: 0, framesRendered: 0, shotFrozen: false,
    onBotHitPlayer(bot, damage, now) {
      const taken = damagePlayer(player, loadout, damage, now);
      if (taken > 0) {
        sound.hurt();
        hudFeed(hud, `${bot.name} hit you (−${taken})`);
        if (!player.alive) this.onPlayerDied(`taken down by ${bot.name}`);
      }
    },
    onPlayerDied(cause) {
      match.deaths += 1;
      hudFeed(hud, `You died — ${cause}`);
      sound.lose();
      endRound('cinder', cause);
    },
    onTeamWiped() {
      if (match.phase === 'live' || match.phase === 'planted') {
        endRound('vanguard', 'enemy team eliminated');
      }
    },
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- Round flow ----------------------------------------------------------
  function beginMatch() {
    sound.ensure();
    hudShowStart(hud, false);
    match.round = 1;
    match.vanguardRounds = 0;
    match.cinderRounds = 0;
    match.money = ECONOMY.startMoney;
    beginRound();
  }

  function beginRound() {
    resetPlayer(player, MAP.vanguardSpawn);
    resetBots(bots, scene);
    loadout.heat = 0;
    loadout.recoil = 0;
    loadout.reloading = 0;
    loadout.cooldown = 0;
    startRound(match);
    hudSetScore(hud, match);
    hudSetMoney(hud, match.money);
    hudSetHealth(hud, player.hp, loadout.kevlar);
    hudSetAmmo(hud, loadout);
    hudShowBuy(hud, false, loadout);
    hudBanner(hud, `ROUND ${match.round}`, 'Buy phase — press B for the buy menu', 3);
    hudSetObjective(hud, 'Buy phase — B opens the buy menu');
  }

  function endRound(winner, reason) {
    if (match.phase === 'roundEnd' || match.phase === 'matchEnd') return;
    const done = settleRound(match, winner, reason);
    hudSetScore(hud, match);
    hudSetMoney(hud, match.money);
    hudShowBuy(hud, false, loadout);
    hudSetPlant(hud, null);
    if (winner === 'vanguard') {
      sound.win();
      hudBanner(hud, 'ROUND WON', `${reason}  ·  +$${ECONOMY.winBonus}`, TIMING.roundEndSeconds);
    } else {
      sound.lose();
      hudBanner(hud, 'ROUND LOST', `${reason}  ·  +$${ECONOMY.lossBonus}`, TIMING.roundEndSeconds);
    }
    hudFeed(hud, `Round ${match.round - (done ? 0 : 1)}: ${winner === 'vanguard' ? 'Vanguard' : 'Cinder'} wins — ${reason}`);
    if (!done) {
      // The next round starts after the banner; the loop drives it.
    } else {
      hudShowEnd(
        hud, true,
        match.matchWinner === 'vanguard' ? 'VANGUARD WINS THE MATCH' : 'CINDER WINS THE MATCH',
        `${scoreText(match)}  ·  ${match.kills} eliminations  ·  click to play again`,
      );
    }
  }

  function maybeEndRoundFromTimer() {
    if (match.phase === 'live' && match.phaseClock >= TIMING.liveSeconds) {
      endRound('cinder', 'time expired — charge never planted');
    }
  }

  // --- Player actions ------------------------------------------------------
  function tryFire(now) {
    if (!player.alive) return;
    if (loadout.mag[currentWeapon(loadout).id] <= 0) {
      if (loadout.cooldown <= 0) {
        sound.dryFire();
        loadout.cooldown = 0.25;
        startReload();
      }
      return;
    }
    const report = firePlayerWeapon(game, player, loadout, now);
    if (!report.fired) return;
    sound.shot(loadout.current);
    flashViewModel();
    alertBots(bots, player.pos, now);
    for (const hit of report.hits) {
      sound.hit();
      hudHitmarker(hud, false);
      const killed = damageBot(hit.bot, hit.damage);
      if (killed) {
        match.kills += 1;
        match.money += ECONOMY.killBonus;
        hudSetMoney(hud, match.money);
        hudFeed(hud, `You eliminated ${hit.bot.name}${hit.head ? ' (headshot)' : ''} +$${ECONOMY.killBonus}`);
        hudHitmarker(hud, true);
        sound.kill();
        if (livingBots(bots).length === 0) game.onTeamWiped();
      }
    }
  }

  function startReload() {
    const w = currentWeapon(loadout);
    if (loadout.reloading > 0) return;
    if (loadout.mag[w.id] >= w.magSize) return;
    if (loadout.reserve[w.id] <= 0) return;
    loadout.reloading = w.reloadSeconds;
    sound.reload();
  }

  function finishReload() {
    const w = currentWeapon(loadout);
    const need = w.magSize - loadout.mag[w.id];
    const take = Math.min(need, loadout.reserve[w.id]);
    loadout.mag[w.id] += take;
    loadout.reserve[w.id] -= take;
  }

  function switchWeapon(slot) {
    const id = WEAPON_ORDER[slot - 1];
    if (!id || !loadout.owned[id]) return;
    if (loadout.current === id) return;
    loadout.current = id;
    loadout.reloading = 0;
    loadout.heat = 0;
    viewModel = swapViewModel(camera, viewModel, WEAPONS[id].kind);
    hudSetAmmo(hud, loadout);
    sound.click();
  }

  let viewFlash = 0; // seconds the view-model muzzle flash stays lit

  function flashViewModel() {
    const flash = viewModel.getObjectByName('muzzleFlash');
    if (!flash) return;
    flash.material.opacity = 0.95;
    flash.material.rotation = Math.random() * Math.PI;
    viewFlash = 0.05;
  }

  function tryPlant(dt) {
    if (match.phase !== 'live') return;
    const site = siteAt(player.pos.x, player.pos.z);
    const holding = input.isDown('KeyE');
    if (holding && site && player.alive) {
      match.plantHeld += dt;
      hudSetPlant(hud, match.plantHeld / TIMING.plantSeconds, `PLANTING AT SITE ${site}…`);
      if (Math.floor(match.plantHeld * 2) !== Math.floor((match.plantHeld - dt) * 2)) {
        sound.plantTick();
      }
      if (match.plantHeld >= TIMING.plantSeconds) {
        match.plantedSite = site;
        match.plants += 1;
        match.money += ECONOMY.plantBonus;
        match.fuseClock = 0;
        setPhase(match, 'planted');
        hudSetMoney(hud, match.money);
        hudSetPlant(hud, null);
        hudBanner(hud, `CHARGE PLANTED — SITE ${site}`, `Hold the site for ${TIMING.fuseSeconds} s  ·  +$${ECONOMY.plantBonus}`, 3);
        hudFeed(hud, `Charge planted at Site ${site} +$${ECONOMY.plantBonus}`);
        sound.plantDone();
        assignDefuser(bots, match);
      }
    } else {
      if (match.plantHeld > 0) hudSetPlant(hud, null);
      match.plantHeld = 0;
    }
  }

  function handleBuyKeys() {
    if (match.phase !== 'buy') return;
    const buyOpen = !hud.els.buyMenu.classList.contains('hidden');
    if (input.wasPressed('KeyB')) {
      hudShowBuy(hud, !buyOpen, loadout);
      sound.click();
      return;
    }
    if (!buyOpen) return;
    const picks = { Digit2: 'wasp', Digit3: 'breacher', Digit4: 'kevlar', KeyG: 'frag' };
    for (const [code, item] of Object.entries(picks)) {
      if (!input.wasPressed(code)) continue;
      const result = buyItem(match, loadout, item);
      if (result === 'bought') {
        sound.buy();
        hudSetMoney(hud, match.money);
        hudSetAmmo(hud, loadout);
        hudSetHealth(hud, player.hp, loadout.kevlar);
        hudFeed(hud, `Bought ${item === 'frag' ? 'Frag-9' : item === 'kevlar' ? 'Kevlar vest' : WEAPONS[item].name}`);
        if (item === 'wasp' || item === 'breacher') {
          viewModel = swapViewModel(camera, viewModel, WEAPONS[item].kind);
        }
      } else if (result === 'poor') {
        sound.denied();
        hudFeed(hud, 'Not enough money');
      }
      break;
    }
  }

  // True while the buy menu is on screen; digit keys buy instead of
  // switching weapons while it is open.
  function buyMenuOpen() {
    return !hud.els.buyMenu.classList.contains('hidden');
  }

  // Weapon slot keys 1-3, ignored while the buy menu is open (there the
  // same digits buy instead).
  function handleWeaponKeys() {
    if (buyMenuOpen()) return;
    if (input.wasPressed('Digit1')) switchWeapon(1);
    if (input.wasPressed('Digit2')) switchWeapon(2);
    if (input.wasPressed('Digit3')) switchWeapon(3);
  }

  // The trigger: automatic weapons fire while the mouse is held, the
  // pump shotgun fires once per click.
  function handleTrigger() {
    if (!input.firing || !input.locked) return;
    const w = currentWeapon(loadout);
    if (w.auto) {
      tryFire(game.now);
    } else if (loadout.cooldown <= 0) {
      tryFire(game.now);
      input.firing = false;
    }
  }

  // --- Fixed-step simulation ----------------------------------------------
  function step(dt) {
    game.now += dt;
    match.phaseClock += dt;

    // Phase transitions driven by the clocks.
    if (match.phase === 'buy' && match.phaseClock >= TIMING.buySeconds) {
      setPhase(match, 'live');
      hudShowBuy(hud, false, loadout);
      hudBanner(hud, 'GO — PLANT THE CHARGE', 'Eliminate Cinder or plant at Site A or B', 2.5);
      hudSetObjective(hud, 'Plant the charge at Site A or Site B');
    }
    if (match.phase === 'roundEnd' && match.phaseClock >= TIMING.roundEndSeconds) {
      beginRound();
    }
    if (match.phase === 'planted') {
      match.fuseClock += dt;
      if (match.fuseClock >= TIMING.fuseSeconds) {
        endRound('vanguard', 'charge detonated');
      } else if (match.defuseHeld >= TIMING.defuseSeconds) {
        endRound('cinder', `${match.defusingBot?.name ?? 'Cinder'} defused the charge`);
      }
    }
    maybeEndRoundFromTimer();

    // Input that only matters outside the menu.
    if (match.phase === 'buy' || match.phase === 'live' || match.phase === 'planted') {
      handleBuyKeys();
      handleWeaponKeys();
      if (input.wasPressed('KeyR')) startReload();
      if (input.wasPressed('KeyG') && loadout.grenades > 0 && match.phase !== 'buy') {
        loadout.grenades -= 1;
        hudSetAmmo(hud, loadout);
        const eye = eyePosition(player);
        const dir = new THREE.Vector3(0, 0, -1).applyEuler(
          new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'),
        );
        throwGrenade(grens, eye, dir);
        sound.click();
      }
      handleTrigger();
    }

    // Cooldowns and reload.
    if (loadout.cooldown > 0) loadout.cooldown -= dt;
    if (loadout.reloading > 0) {
      loadout.reloading -= dt;
      if (loadout.reloading <= 0) {
        loadout.reloading = 0;
        finishReload();
        hudSetAmmo(hud, loadout);
      }
    }
    loadout.heat = Math.max(0, loadout.heat - currentWeapon(loadout).heatCool * dt);

    // Movement + footsteps: only while a round is actually running.
    const roundRunning = match.phase === 'buy' || match.phase === 'live' || match.phase === 'planted';
    if (roundRunning) {
      const moved = updatePlayer(player, input, dt, world.solids, loadout);
      if (moved > 0 && player.onGround && player.stepPhase > 2.2) {
        player.stepPhase = 0;
        sound.step();
      }
    }

    // Planting, grenades, bots.
    tryPlant(dt);
    updateGrenades(grens, dt, game);
    if (roundRunning) {
      for (const bot of bots) updateBot(bot, dt, game, game.now);
    }

    // View-model muzzle flash decay.
    if (viewFlash > 0) {
      viewFlash -= dt;
      const flash = viewModel.getObjectByName('muzzleFlash');
      if (flash) flash.material.opacity = Math.max(0, viewFlash / 0.05) * 0.95;
    }

    // Camera follows the player, with recoil pitch and walk bob.
    const bob = Math.sin(player.bobPhase) * 0.02 * Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 4);
    camera.position.set(player.pos.x, player.pos.y + player.eyeHeight + bob, player.pos.z);
    camera.rotation.set(player.pitch + loadout.recoil, player.yaw, 0, 'YXZ');
    viewModel.position.y = -0.24 + bob * 0.5;
    viewModel.rotation.x = loadout.recoil * 2.2;

    // HUD.
    hudSetHealth(hud, player.hp, loadout.kevlar);
    hudSetAmmo(hud, loadout);
    if (match.phase === 'buy') {
      hudSetTimer(hud, TIMING.buySeconds - match.phaseClock);
      hudSetObjective(hud, 'Buy phase — B opens the buy menu');
    } else if (match.phase === 'live') {
      hudSetTimer(hud, TIMING.liveSeconds - match.phaseClock);
    } else if (match.phase === 'planted') {
      hudSetTimer(hud, TIMING.fuseSeconds - match.fuseClock);
      const defuse = match.defusingBot ? ` — ${match.defusingBot.name} defusing!` : '';
      hudSetObjective(hud, `Charge planted at Site ${match.plantedSite} — defend it${defuse}`);
    } else if (match.phase === 'roundEnd' || match.phase === 'matchEnd') {
      hudSetTimer(hud, 0);
    }
    hudTick(hud, dt);
    hudDrawMinimap(hud, player, bots, match);
    input.endFrame();
  }

  // --- Staging for screenshots --------------------------------------------
  // ?shot=start|play|buy|end&seed=N renders a deterministic frame, renders
  // it twice, then freezes and sets window.__shotReady for the capture.
  function applyShotStage() {
    const mode = match.shotMode;
    if (!mode) return;
    const seeded = makeRng(match.seed * 7919 + 13);
    if (mode === 'start') {
      hudShowStart(hud, true);
      player.pos.set(0, 0, 14);
      player.yaw = 0.12;
      player.pitch = -0.02;
      placeBotsForShot(seeded, 'hold');
    } else if (mode === 'play') {
      hudShowStart(hud, false);
      setPhase(match, 'live');
      match.phaseClock = TIMING.liveSeconds - 62;
      player.pos.set(0, 0, 8);
      player.yaw = 0.05;
      player.pitch = 0;
      loadout.mag.kestrel = 18;
      placeBotsForShot(seeded, 'mid');
      hudSetObjective(hud, 'Plant the charge at Site A or Site B');
      hudSetHealth(hud, 100, false);
      hudSetAmmo(hud, loadout);
    } else if (mode === 'buy') {
      hudShowStart(hud, false);
      startRound(match);
      hudShowBuy(hud, true, loadout);
      player.pos.set(0, 0, 14);
      player.yaw = 0;
      placeBotsForShot(seeded, 'spawn');
    } else if (mode === 'end') {
      hudShowStart(hud, false);
      match.vanguardRounds = 5;
      match.cinderRounds = 3;
      match.round = 8;
      match.kills = 11;
      setPhase(match, 'matchEnd');
      match.matchWinner = 'vanguard';
      hudShowEnd(hud, true, 'VANGUARD WINS THE MATCH', '5 — 3  ·  11 eliminations  ·  click to play again');
      player.pos.set(-14, 0, -8);
      player.yaw = -0.5;
      placeBotsForShot(seeded, 'dead');
    }
    hudSetScore(hud, match);
    hudSetMoney(hud, match.money);
    hudSetTimer(hud, match.phase === 'live' ? 62 : TIMING.buySeconds);
    syncCamera();
  }

  function placeBotsForShot(seeded, style) {
    for (let i = 0; i < bots.length; i++) {
      const bot = bots[i];
      if (style === 'dead') {
        bot.alive = false;
        bot.group.visible = false;
        continue;
      }
      bot.alive = true;
      bot.group.visible = true;
      if (style === 'spawn') {
        bot.pos.set(MAP.botSpawns[i].x, 0, MAP.botSpawns[i].z);
        bot.yaw = Math.PI;
      } else if (style === 'mid') {
        const wp = MAP.routes[i][2];
        bot.pos.set(wp[0] + seeded.jitter(0, 1), 0, wp[1] + seeded.jitter(0, 1));
        bot.yaw = Math.PI + seeded.jitter(0, 0.4);
      } else {
        const wp = MAP.routes[i][MAP.routes[i].length - 1];
        bot.pos.set(wp[0], 0, wp[1]);
        bot.yaw = Math.PI + seeded.jitter(0, 0.8);
      }
      bot.group.position.copy(bot.pos);
      bot.group.rotation.y = bot.yaw;
      bot.lastSeenAt = game.now;
    }
  }

  function syncCamera() {
    camera.position.set(player.pos.x, player.pos.y + player.eyeHeight, player.pos.z);
    camera.rotation.set(player.pitch + loadout.recoil, player.yaw, 0, 'YXZ');
  }

  // --- Main loop -----------------------------------------------------------
  let last = performance.now();
  let accumulator = 0;
  applyShotStage();

  function frame(nowMs) {
    if (match.shotMode) {
      // Staged capture: one simulation step, render, and after two renders
      // freeze and signal readiness.
      step(FIXED_DT);
      renderer.render(scene, camera);
      game.framesRendered += 1;
      if (game.framesRendered >= 2) {
        window.__shotReady = true;
        return;
      }
      requestAnimationFrame(frame);
      return;
    }
    const elapsed = Math.min(0.25, (nowMs - last) / 1000);
    last = nowMs;
    accumulator += elapsed;
    let guard = 0;
    while (accumulator >= FIXED_DT && guard < 5) {
      step(FIXED_DT);
      accumulator -= FIXED_DT;
      guard += 1;
    }
    if (guard === 5) accumulator = 0;
    renderer.render(scene, camera);
    tickEffects(game, elapsed);
    requestAnimationFrame(frame);
  }

  // Clicking the start overlay begins the match; clicking the end overlay
  // restarts it.
  document.getElementById('start-button').addEventListener('click', () => {
    sound.ensure();
    beginMatch();
    input.requestLock();
  });
  document.getElementById('again-button').addEventListener('click', () => {
    sound.ensure();
    hudShowEnd(hud, false);
    beginMatch();
    input.requestLock();
  });

  // The menu shows on load and the game waits for the click — except in a
  // staged capture, where the stage itself decides what is visible.
  if (!match.shotMode) hudShowStart(hud, true);
  hudSetScore(hud, match);
  hudSetMoney(hud, match.money);
  hudSetHealth(hud, player.hp, false);
  hudSetAmmo(hud, loadout);
  hudSetTimer(hud, TIMING.buySeconds);
  requestAnimationFrame(frame);
}

boot();
