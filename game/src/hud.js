// HUD: health, armour, ammo, money, timer, score, objective, kill feed,
// buy menu, banners, plant progress, and the minimap. The minimap renders
// its static layer (walls, lanes, sites) once into an offscreen canvas and
// only redraws the moving dots per frame — no per-frame allocation in the
// hot path beyond the draw calls themselves.
import { MAP } from './map.js';
import { ECONOMY } from './state.js';
import { WEAPONS } from './weapons.js';
import { PAL, hexToRgba } from './palette.js';

const BUY_ROWS = [
  { id: 'wasp', key: '2', name: 'SMG-9 Wasp', price: ECONOMY.price.wasp, note: 'Fast, close range' },
  { id: 'breacher', key: '3', name: 'SG-12 Breacher', price: ECONOMY.price.breacher, note: '8-pellet spread' },
  { id: 'frag', key: 'G', name: 'Frag-9 grenade', price: ECONOMY.price.frag, note: 'Throw with G (max 2)' },
  { id: 'kevlar', key: '4', name: 'Kevlar vest', price: ECONOMY.price.kevlar, note: 'Halves damage taken' },
];

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const hud = {
    els: {
      healthNum: $('hud-health-num'),
      healthBar: $('hud-health-bar'),
      armour: $('hud-armour'),
      ammoMag: $('hud-ammo-mag'),
      ammoReserve: $('hud-ammo-reserve'),
      weaponName: $('hud-weapon'),
      grenades: $('hud-grenades'),
      money: $('hud-money'),
      timer: $('hud-timer'),
      round: $('hud-round'),
      score: $('hud-score'),
      objective: $('hud-objective'),
      feed: $('hud-feed'),
      banner: $('hud-banner'),
      bannerTitle: $('hud-banner-title'),
      bannerSub: $('hud-banner-sub'),
      crosshair: $('hud-crosshair'),
      hitmarker: $('hud-hitmarker'),
      plantWrap: $('hud-plant'),
      plantFill: $('hud-plant-fill'),
      plantLabel: $('hud-plant-label'),
      buyMenu: $('hud-buy'),
      buyRows: $('hud-buy-rows'),
      buyMoney: $('hud-buy-money'),
      startOverlay: $('overlay-start'),
      endOverlay: $('overlay-end'),
      endTitle: $('overlay-end-title'),
      endSub: $('overlay-end-sub'),
      minimap: $('hud-minimap'),
    },
    minimapStatic: null,
    bannerTimer: 0,
    hitTimer: 0,
  };

  // Build the buy menu rows once.
  hud.els.buyRows.innerHTML = BUY_ROWS.map((row) => `
    <div class="buy-row" data-item="${row.id}">
      <span class="buy-key">${row.key}</span>
      <span class="buy-name">${row.name}</span>
      <span class="buy-note">${row.note}</span>
      <span class="buy-price">$${row.price}</span>
    </div>`).join('');

  // Static minimap layer, rendered once.
  hud.minimapStatic = buildMinimapStatic();
  return hud;
}

function buildMinimapStatic() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  const sx = (x) => ((x + 20) / 40) * 200;
  const sy = (z) => ((z + 16) / 32) * 160;
  ctx.fillStyle = '#14181d';
  ctx.fillRect(0, 0, 200, 160);
  // Sites.
  for (const [key, site] of Object.entries(MAP.sites)) {
    ctx.beginPath();
    ctx.arc(sx(site.x), sy(site.z), (site.r / 40) * 200, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(site.color, 0.22);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(site.color, 0.9);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = `#${site.color.toString(16).padStart(6, '0')}`;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(key, sx(site.x), sy(site.z) + 4);
  }
  // Walls and cover.
  ctx.fillStyle = '#5a636e';
  for (const s of MAP.solids) {
    ctx.fillRect(sx(s.cx - s.sx / 2), sy(s.cz - s.sz / 2), (s.sx / 40) * 200, (s.sz / 32) * 160);
  }
  // Yard border.
  ctx.strokeStyle = '#8a94a0';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 198, 158);
  return canvas;
}

// --- Per-frame / per-event updates -----------------------------------------

export function hudSetHealth(hud, hp, kevlar) {
  hud.els.healthNum.textContent = String(Math.ceil(hp));
  hud.els.healthBar.style.width = `${Math.max(0, hp)}%`;
  hud.els.healthBar.style.background = hp > 50 ? PAL.ok : hp > 25 ? PAL.gold : PAL.danger;
  hud.els.armour.textContent = kevlar ? 'KEVLAR' : '';
}

export function hudSetAmmo(hud, loadout) {
  const w = WEAPONS[loadout.current];
  hud.els.weaponName.textContent = w.name;
  hud.els.ammoMag.textContent = String(loadout.mag[w.id]);
  hud.els.ammoReserve.textContent = String(loadout.reserve[w.id]);
  hud.els.grenades.textContent = loadout.grenades > 0 ? `FRAG ×${loadout.grenades}` : '';
}

export function hudSetMoney(hud, money) {
  hud.els.money.textContent = `$${money}`;
  hud.els.buyMoney.textContent = `$${money}`;
}

export function hudSetTimer(hud, seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  hud.els.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  hud.els.timer.style.color = s <= 10 ? PAL.danger : PAL.hudText;
}

export function hudSetScore(hud, match) {
  hud.els.round.textContent = `ROUND ${match.round}`;
  hud.els.score.textContent = `${match.vanguardRounds} — ${match.cinderRounds}`;
}

export function hudSetObjective(hud, text) {
  hud.els.objective.textContent = text;
}

export function hudFeed(hud, text) {
  const line = document.createElement('div');
  line.className = 'feed-line';
  line.textContent = text;
  hud.els.feed.prepend(line);
  while (hud.els.feed.children.length > 5) hud.els.feed.lastChild.remove();
  setTimeout(() => line.remove(), 9000);
}

export function hudBanner(hud, title, sub, seconds = 3) {
  hud.els.bannerTitle.textContent = title;
  hud.els.bannerSub.textContent = sub;
  hud.els.banner.classList.remove('hidden');
  hud.bannerTimer = seconds;
}

export function hudHideBanner(hud) {
  hud.els.banner.classList.add('hidden');
  hud.bannerTimer = 0;
}

export function hudHitmarker(hud, kill) {
  hud.els.hitmarker.classList.remove('hidden');
  hud.els.hitmarker.classList.toggle('kill', kill);
  hud.hitTimer = kill ? 0.5 : 0.18;
}

export function hudSetPlant(hud, fraction, label) {
  if (fraction === null) {
    hud.els.plantWrap.classList.add('hidden');
    return;
  }
  hud.els.plantWrap.classList.remove('hidden');
  hud.els.plantFill.style.width = `${Math.round(fraction * 100)}%`;
  hud.els.plantLabel.textContent = label;
}

export function hudShowBuy(hud, show, loadout) {
  hud.els.buyMenu.classList.toggle('hidden', !show);
  if (!show) return;
  for (const row of hud.els.buyRows.querySelectorAll('.buy-row')) {
    const id = row.dataset.item;
    const owned = id === 'kevlar'
      ? loadout.kevlar
      : id === 'frag'
        ? loadout.grenades >= 2
        : loadout.owned[id];
    row.classList.toggle('owned', !!owned);
  }
}

export function hudShowStart(hud, show) {
  hud.els.startOverlay.classList.toggle('hidden', !show);
}

export function hudShowEnd(hud, show, title = '', sub = '') {
  hud.els.endOverlay.classList.toggle('hidden', !show);
  if (show) {
    hud.els.endTitle.textContent = title;
    hud.els.endSub.textContent = sub;
  }
}

export function hudTick(hud, dt) {
  if (hud.bannerTimer > 0) {
    hud.bannerTimer -= dt;
    if (hud.bannerTimer <= 0) hudHideBanner(hud);
  }
  if (hud.hitTimer > 0) {
    hud.hitTimer -= dt;
    if (hud.hitTimer <= 0) hud.els.hitmarker.classList.add('hidden');
  }
}

// --- Minimap ---------------------------------------------------------------

export function hudDrawMinimap(hud, player, bots, match) {
  const canvas = hud.els.minimap;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const sx = (x) => ((x + 20) / 40) * W;
  const sy = (z) => ((z + 16) / 32) * H;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(hud.minimapStatic, 0, 0, W, H);
  // Planted charge blinks on the minimap.
  if (match.plantedSite) {
    const site = MAP.sites[match.plantedSite];
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 150);
    ctx.beginPath();
    ctx.arc(sx(site.x), sy(site.z), 7 + pulse * 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,60,40,${0.5 + pulse * 0.4})`;
    ctx.fill();
  }
  // Bots: only those spotted in the last few seconds.
  const now = performance.now() / 1000;
  for (const bot of bots) {
    if (!bot.alive) continue;
    if (now - bot.lastSeenAt > 4) continue;
    ctx.beginPath();
    ctx.arc(sx(bot.pos.x), sy(bot.pos.z), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4d3d';
    ctx.fill();
  }
  // Player arrow, rotated to the yaw.
  const px = sx(player.pos.x);
  const py = sy(player.pos.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.atan2(Math.sin(player.yaw), -Math.cos(player.yaw)) + Math.PI);
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4.5, 5);
  ctx.lineTo(0, 2.5);
  ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}
