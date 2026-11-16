// Weapons: definitions, the player's loadout, spread/recoil maths, and the
// first-person view models. Spread grows with movement speed, firing while
// airborne, and sustained fire — stopping to aim pays. Crouching tightens
// it. Headshots multiply damage per weapon.
import * as THREE from 'three';
import { PAL } from './palette.js';
import { ECONOMY } from './state.js';

export const WEAPONS = {
  kestrel: {
    id: 'kestrel',
    name: 'AR-77 Kestrel',
    kind: 'rifle',
    slot: 1,
    price: 0, // owned from the start
    damage: 34,
    headMult: 3,
    rpm: 600,
    magSize: 25,
    reserveMax: 75,
    pellets: 1,
    auto: true,
    baseSpread: 0.011,
    moveSpread: 0.028,
    airSpread: 0.05,
    crouchSpread: 0.006,
    heatPerShot: 0.012,
    heatCool: 0.05,
    recoilKick: 0.011,
    recoilRecover: 0.09,
    reloadSeconds: 2.1,
    range: 120,
  },
  wasp: {
    id: 'wasp',
    name: 'SMG-9 Wasp',
    kind: 'smg',
    slot: 2,
    price: ECONOMY.price.wasp,
    damage: 22,
    headMult: 2,
    rpm: 900,
    magSize: 30,
    reserveMax: 90,
    pellets: 1,
    auto: true,
    baseSpread: 0.02,
    moveSpread: 0.03,
    airSpread: 0.055,
    crouchSpread: 0.011,
    heatPerShot: 0.009,
    heatCool: 0.07,
    recoilKick: 0.007,
    recoilRecover: 0.11,
    reloadSeconds: 1.7,
    range: 80,
  },
  breacher: {
    id: 'breacher',
    name: 'SG-12 Breacher',
    kind: 'shotgun',
    slot: 3,
    price: ECONOMY.price.breacher,
    damage: 9,
    headMult: 1.5,
    rpm: 70,
    magSize: 6,
    reserveMax: 24,
    pellets: 8,
    auto: false,
    baseSpread: 0.055,
    moveSpread: 0.04,
    airSpread: 0.07,
    crouchSpread: 0.035,
    heatPerShot: 0.05,
    heatCool: 0.08,
    recoilKick: 0.038,
    recoilRecover: 0.06,
    reloadSeconds: 2.6,
    range: 40,
  },
};

export const WEAPON_ORDER = ['kestrel', 'wasp', 'breacher'];

// A fresh loadout: rifle owned, everything else bought in the buy menu.
export function createLoadout() {
  return {
    current: 'kestrel',
    owned: { kestrel: true, wasp: false, breacher: false },
    mag: { kestrel: 25, wasp: 0, breacher: 0 },
    reserve: { kestrel: 75, wasp: 0, breacher: 0 },
    grenades: 0,
    kevlar: false,
    heat: 0, // sustained-fire spread, 0..1
    recoil: 0, // accumulated pitch kick, radians
    reloading: 0, // seconds left, 0 = not reloading
    cooldown: 0, // seconds until the next shot may fire
    lastShotAt: -10,
  };
}

export function currentWeapon(loadout) {
  return WEAPONS[loadout.current];
}

// Spread in radians for one shot, from the shooter's state.
export function spreadFor(weapon, { speed, airborne, crouched, heat }) {
  let s = weapon.baseSpread;
  s += Math.min(1, speed / 4.2) * weapon.moveSpread;
  if (airborne) s += weapon.airSpread;
  if (crouched) s -= weapon.crouchSpread;
  s += heat * 0.02;
  return Math.max(0.003, s);
}

// Buy a weapon (or a consumable) if the money is there. Returns a result
// string the HUD shows: 'bought' | 'owned' | 'poor'.
export function buyItem(match, loadout, item) {
  if (item === 'frag') {
    if (loadout.grenades >= 2) return 'owned';
    if (match.money < ECONOMY.price.frag) return 'poor';
    match.money -= ECONOMY.price.frag;
    loadout.grenades += 1;
    return 'bought';
  }
  if (item === 'kevlar') {
    if (loadout.kevlar) return 'owned';
    if (match.money < ECONOMY.price.kevlar) return 'poor';
    match.money -= ECONOMY.price.kevlar;
    loadout.kevlar = true;
    return 'bought';
  }
  const w = WEAPONS[item];
  if (!w) return 'poor';
  if (loadout.owned[item]) return 'owned';
  if (match.money < w.price) return 'poor';
  match.money -= w.price;
  loadout.owned[item] = true;
  loadout.mag[item] = w.magSize;
  loadout.reserve[item] = w.reserveMax;
  loadout.current = item;
  return 'bought';
}

// --- View models -----------------------------------------------------------
// Simple low-poly guns built from boxes, parented to the camera. Each kind
// reads differently at a glance: long barrel rifle, short SMG, wide shotgun.
function gunMaterial() {
  return new THREE.MeshStandardMaterial({ color: PAL.gun, roughness: 0.5, metalness: 0.55 });
}
function accentMaterial() {
  return new THREE.MeshStandardMaterial({ color: PAL.gunAccent, roughness: 0.6, metalness: 0.4 });
}

export function buildViewModel(kind) {
  const group = new THREE.Group();
  const body = gunMaterial();
  const accent = accentMaterial();
  const add = (w, h, d, x, y, z, mat = body) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  if (kind === 'rifle') {
    add(0.07, 0.1, 0.62, 0, 0, -0.1); // receiver
    add(0.035, 0.035, 0.42, 0, 0.02, -0.5); // barrel
    add(0.05, 0.12, 0.1, 0, -0.09, -0.05, accent); // grip
    add(0.05, 0.16, 0.08, 0, -0.1, -0.28); // fore grip
    add(0.06, 0.05, 0.2, 0, -0.07, 0.12, accent); // stock
    add(0.02, 0.05, 0.02, 0, 0.07, -0.32); // front sight
  } else if (kind === 'smg') {
    add(0.07, 0.09, 0.42, 0, 0, -0.05);
    add(0.03, 0.03, 0.24, 0, 0.015, -0.36);
    add(0.05, 0.14, 0.07, 0, -0.1, -0.18); // mag
    add(0.05, 0.1, 0.08, 0, -0.08, 0.02, accent);
    add(0.055, 0.04, 0.14, 0, -0.06, 0.1, accent);
  } else {
    // shotgun
    add(0.08, 0.11, 0.55, 0, 0, -0.08);
    add(0.05, 0.05, 0.4, 0, 0.03, -0.5); // fat barrel
    add(0.06, 0.05, 0.4, 0, -0.045, -0.42, accent); // pump
    add(0.05, 0.11, 0.09, 0, -0.09, -0.02, accent);
    add(0.07, 0.05, 0.18, 0, -0.07, 0.12); // stock
  }
  // Muzzle flash quad, hidden until a shot fires.
  const flashMat = new THREE.MeshBasicMaterial({
    color: PAL.muzzle, transparent: true, opacity: 0, side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
  flash.position.set(0, 0.02, -0.72);
  flash.name = 'muzzleFlash';
  group.add(flash);
  group.position.set(0.26, -0.24, -0.42);
  return group;
}

// Swap the visible gun when the player changes weapon.
export function swapViewModel(camera, group, kind) {
  if (group.userData.kind === kind) return group;
  camera.remove(group);
  const next = buildViewModel(kind);
  next.userData.kind = kind;
  camera.add(next);
  return next;
}
