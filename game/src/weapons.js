// The arsenal: three hitscan weapons and a frag grenade. The defs own the
// numbers; main.js owns the ray and the damage. Spread punishes moving, airborne
// and sustained fire; crouching tightens it. One view model per weapon, swapped
// on select; the muzzle flash and its light are shared by all three.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'AR-77 Kestrel', short: 'KESTREL', price: 0, damage: 34, headMult: 3,
    fireGap: 0.096, auto: true, mag: 30, reserve: 90, reload: 1.9,
    spreadStill: 0.0022, spreadMove: 0.028, recoil: 0.011, pellets: 1,
  },
  smg: {
    id: 'smg', name: 'SMG-9 Wasp', short: 'WASP', price: 600, damage: 25, headMult: 2,
    fireGap: 0.07, auto: true, mag: 32, reserve: 96, reload: 1.6,
    spreadStill: 0.004, spreadMove: 0.034, recoil: 0.007, pellets: 1,
  },
  shotgun: {
    id: 'shotgun', name: 'SG-12 Breacher', short: 'BREACHER', price: 700, damage: 13, headMult: 1.5,
    fireGap: 0.85, auto: false, mag: 6, reserve: 24, reload: 2.4,
    spreadStill: 0.02, spreadMove: 0.05, recoil: 0.035, pellets: 8,
  },
};
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
export const WEAPON_ORDER = ['rifle', 'smg', 'shotgun'];

// View-model parts: [size, position, tilt-x] per weapon, built from two shared
// materials so the three guns read as one family.
function buildModel(def, dark, light) {
  const parts = {
    rifle: [
      [[0.09, 0.1, 0.42], [0, 0, 0], 0, light],
      [[0.045, 0.045, 0.4], [0, 0.025, -0.38], 0, dark],
      [[0.075, 0.08, 0.22], [0, -0.02, 0.3], 0, dark],
      [[0.03, 0.05, 0.08], [0, 0.075, -0.05], 0, dark],
    ],
    smg: [
      [[0.08, 0.09, 0.3], [0, 0, 0], 0, light],
      [[0.04, 0.04, 0.22], [0, 0.02, -0.25], 0, dark],
      [[0.05, 0.16, 0.07], [0, -0.11, -0.02], 0.2, dark],
      [[0.06, 0.06, 0.16], [0, -0.01, 0.22], 0, dark],
    ],
    shotgun: [
      [[0.1, 0.11, 0.34], [0, 0, 0], 0, light],
      [[0.06, 0.06, 0.42], [0, 0.03, -0.36], 0, dark],
      [[0.08, 0.07, 0.14], [0, -0.02, -0.3], 0, light],
      [[0.08, 0.09, 0.2], [0, -0.02, 0.26], 0, dark],
    ],
  }[def.id];
  const group = new THREE.Group();
  for (const [size, pos, tilt, material] of parts) {
    const part = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    part.position.set(pos[0], pos[1], pos[2]);
    if (tilt) part.rotation.x = tilt;
    group.add(part);
  }
  group.position.set(0.27, -0.24, -0.58);
  group.scale.set(0.6, 0.6, 0.6);
  group.visible = false;
  return group;
}

export function createWeaponRig(camera) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const light = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const models = {};
  for (const id of WEAPON_ORDER) {
    models[id] = buildModel(WEAPONS[id], dark, light);
    camera.add(models[id]);
  }
  models.rifle.visible = true;

  // Muzzle flash: a small radial-glow sprite painted once on a canvas (no image
  // file), so the flash reads as light, not as a flat card.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 64;
  flashCanvas.height = 64;
  const flashCtx = flashCanvas.getContext('2d');
  const gradient = flashCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255,244,214,1)');
  gradient.addColorStop(0.35, 'rgba(242,169,59,0.9)');
  gradient.addColorStop(1, 'rgba(242,169,59,0)');
  flashCtx.fillStyle = gradient;
  flashCtx.fillRect(0, 0, 64, 64);
  const flashTexture = new THREE.CanvasTexture(flashCanvas);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ map: flashTexture, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  flash.position.set(0.26, -0.19, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.26, -0.17, -0.6);
  camera.add(flashLight);

  const ammo = {};
  for (const id of WEAPON_ORDER) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  const state = {
    current: 'rifle',
    owned: new Set(['rifle']),
    ammo,
    grenades: 0,
    armor: false,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    heat: 0,
  };

  function def() {
    return WEAPONS[state.current];
  }

  // Per frame: cool down, decay the flash and the heat, spring the view model
  // back from its kick, and run the reload timer to completion.
  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.heat = Math.max(0, state.heat - dt * 0.55);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.58 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = 0;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      const d = def();
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      // Dip the gun while the magazine is out.
      model.rotation.x = -0.55 * Math.min(1, (d.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const a = state.ammo[state.current];
        const take = Math.min(d.mag - a.mag, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    step,
    ready() {
      return state.ammo[state.current].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const d = def();
      state.cooldown = d.fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.heat = Math.min(1, state.heat + (d.id === 'shotgun' ? 0.5 : 0.09));
    },
    takeRound() {
      const a = state.ammo[state.current];
      if (a.mag <= 0) return false;
      a.mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      const a = state.ammo[state.current];
      if (state.reloadLeft > 0 || a.mag === d.mag || a.reserve === 0) return;
      state.reloadLeft = d.reload;
    },
    // Spread: still < crouched < moving < airborne, plus heat from sustained fire.
    spread(speed, crouching, airborne) {
      const d = def();
      let spread = d.spreadStill + Math.min(1, speed / 5.4) * d.spreadMove + state.heat * 0.02;
      if (crouching) spread *= 0.6;
      if (airborne) spread *= 1.8;
      return spread;
    },
    select(id) {
      if (!state.owned.has(id) || state.reloadLeft > 0) return false;
      state.current = id;
      for (const key of WEAPON_ORDER) models[key].visible = key === id;
      state.cooldown = Math.max(state.cooldown, 0.25);
      return true;
    },
    buy(id) {
      const d = WEAPONS[id];
      if (!d || state.owned.has(id)) return -1;
      state.owned.add(id);
      state.ammo[id] = { mag: d.mag, reserve: d.reserve };
      return d.price;
    },
    // Between rounds: full magazines for what is owned, no armour, no grenades,
    // and only the rifle stays in the loadout — purchases are per round.
    resetRound() {
      for (const id of state.owned) {
        const d = WEAPONS[id];
        state.ammo[id] = { mag: d.mag, reserve: d.reserve };
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.heat = 0;
      state.armor = false;
      state.grenades = 0;
      state.owned = new Set(['rifle']);
      state.current = 'rifle';
      for (const key of WEAPON_ORDER) models[key].visible = key === 'rifle';
    },
    // Refill what is already owned (a new round after a round won, before the
    // buy phase resets the loadout).
    refillOwned() {
      for (const id of state.owned) {
        const d = WEAPONS[id];
        state.ammo[id] = { mag: d.mag, reserve: d.reserve };
      }
    },
  };
}
