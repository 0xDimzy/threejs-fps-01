// The DOM HUD: health, armour, ammo, money, timer, score, team pips, kill feed,
// round banner, plant bar, buy menu and the minimap. It never touches the
// simulation; main.js pushes numbers in and reads the play/buy callbacks out.
// The minimap is drawn from the same MAP boxes the world is built from.
import { MAP } from './map.js';

// Overlay copy per mode; roundEnd/matchEnd get their score text from main.js.
const COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'Vanguard vs Cinder in the Cinderworks Yard. Plant the charge at Site A or Site B — or eliminate all four defenders. First to 5 rounds.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBERLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundEnd: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  matchEnd: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    overlay: $('overlay'),
    title: $('overlay-title'),
    copy: $('overlay-copy'),
    play: $('play'),
    healthNum: $('health-num'),
    healthFill: $('health-fill'),
    armorInd: $('armor-ind'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    grenadeCount: $('grenade-count'),
    moneyValue: $('money-value'),
    timerValue: $('timer-value'),
    roundScore: $('round-score-text'),
    aliveV: $('alive-v'),
    aliveC: $('alive-c'),
    objective: $('objective'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    plantBar: $('plant-bar'),
    plantFill: $('plant-fill'),
    plantLabel: $('plant-label'),
    buyPanel: $('buy'),
    buyMoney: $('buy-money'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    damage: $('damage'),
    minimap: $('minimap'),
  };
  const mapCtx = el.minimap.getContext('2d');

  // The minimap's static layer (floor, walls, site markers) is rendered once to
  // an offscreen canvas at load; each frame only blits it and draws the moving
  // dots and the player arrow on top.
  const mapStatic = document.createElement('canvas');
  mapStatic.width = el.minimap.width;
  mapStatic.height = el.minimap.height;
  let staticBuilt = false;
  function buildStaticMap() {
    const ctx = mapStatic.getContext('2d');
    const width = mapStatic.width;
    const height = mapStatic.height;
    const sx = (x) => ((x + 20) / 40) * width;
    const sz = (z) => ((z + 16) / 32) * height;
    ctx.fillStyle = 'rgba(16,20,27,0.85)';
    ctx.fillRect(0, 0, width, height);
    for (const [w, h, d, x, y, z] of MAP.boxes) {
      if (h < 1.5 || y < 0) continue;
      ctx.fillStyle = 'rgba(139,152,165,0.55)';
      ctx.fillRect(sx(x - w / 2), sz(z - d / 2), Math.max(1, (w / 40) * width), Math.max(1, (d / 32) * height));
    }
    for (const site of MAP.sites) {
      ctx.fillStyle = site.id === 'A' ? '#f2a93b' : '#4db2e8';
      ctx.beginPath();
      ctx.arc(sx(site.x), sz(site.z), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f141b';
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(site.id, sx(site.x), sz(site.z));
    }
    staticBuilt = true;
  }

  let hitTimer = 0;
  let bannerTimer = 0;
  // Last-written text per key, so the DOM is only touched when a value changes.
  let last = {};
  let buyHandler = null;

  function setText(element, value, key) {
    if (last[key] === value) return;
    last[key] = value;
    element.textContent = value;
  }

  el.buyPanel.querySelectorAll('[data-buy]').forEach((button) => {
    button.addEventListener('click', () => {
      if (buyHandler) buyHandler(button.dataset.buy);
    });
  });

  return {
    setHealth(hp, armor) {
      setText(el.healthNum, String(Math.max(0, Math.ceil(hp))), 'hp');
      el.healthFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      el.healthFill.classList.toggle('low', hp <= 30);
      el.armorInd.hidden = !armor;
    },
    setAmmo(mag, reserve, weapon, grenades) {
      setText(el.ammoMag, String(mag), 'mag');
      setText(el.ammoReserve, `/ ${reserve}`, 'res');
      setText(el.weaponName, weapon, 'wpn');
      setText(el.grenadeCount, grenades > 0 ? `◉ ${grenades}` : '', 'grn');
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      setText(el.moneyValue, `$${value}`, 'money');
      setText(el.buyMoney, `$${value}`, 'buymoney');
    },
    setTimer(seconds, phase) {
      const value = `${Math.max(0, Math.ceil(seconds))}`;
      setText(el.timerValue, value, 'timer');
      el.timerValue.classList.toggle('urgent', seconds <= 10 && phase === 'live');
      el.timerValue.classList.toggle('fuse', phase === 'fuse');
    },
    setScore(wins, losses, round) {
      setText(el.roundScore, `VANGUARD ${wins} — ${losses} CINDER · R${round}`, 'score');
    },
    setAlive(vanguard, cinder) {
      setText(el.aliveV, '●'.repeat(vanguard) + '○'.repeat(Math.max(0, 1 - vanguard)), 'av');
      setText(el.aliveC, '●'.repeat(cinder) + '○'.repeat(Math.max(0, 4 - cinder)), 'ac');
    },
    setObjective(text) {
      setText(el.objective, text, 'obj');
    },
    feed(text, kind) {
      const entry = document.createElement('div');
      entry.className = `feed-${kind || 'info'}`;
      entry.textContent = text;
      el.killfeed.prepend(entry);
      while (el.killfeed.children.length > 5) el.killfeed.removeChild(el.killfeed.lastChild);
      setTimeout(() => {
        if (entry.parentNode) entry.parentNode.removeChild(entry);
      }, 6000);
    },
    banner(titleText, subText, holdMs = 2600) {
      el.bannerTitle.textContent = titleText;
      el.bannerSub.textContent = subText || '';
      el.banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        el.banner.hidden = true;
      }, holdMs);
    },
    hideBanner() {
      el.banner.hidden = true;
      clearTimeout(bannerTimer);
    },
    setPlant(progress, fuse, label) {
      if (progress === null && fuse === null) {
        el.plantBar.hidden = true;
        return;
      }
      el.plantBar.hidden = false;
      if (progress !== null) {
        el.plantFill.style.width = `${Math.round(progress * 100)}%`;
        el.plantFill.classList.remove('fuse-fill');
      } else {
        el.plantFill.style.width = `${Math.round((fuse / 35) * 100)}%`;
        el.plantFill.classList.add('fuse-fill');
      }
      setText(el.plantLabel, label || '', 'plantlabel');
    },
    showBuy(show, owned, money) {
      el.buyPanel.hidden = !show;
      if (!show) return;
      el.buyPanel.querySelectorAll('[data-buy]').forEach((button) => {
        const id = button.dataset.buy;
        const price = Number(button.dataset.price);
        const isOwned = id === 'smg' || id === 'shotgun' ? owned.has(id) : false;
        button.disabled = isOwned || money < price;
        button.classList.toggle('owned', isOwned);
        button.querySelector('.buy-state').textContent = isOwned ? 'OWNED' : `$${price}`;
      });
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    hitMarker(killed, holdMs = 90) {
      el.hitmarker.classList.add('on');
      el.hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        el.hitmarker.classList.remove('on', 'kill');
      }, holdMs);
    },
    damageFlash() {
      el.damage.classList.remove('flash');
      void el.damage.offsetWidth;
      el.damage.classList.add('flash');
    },
    setSpread(px) {
      el.crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    drawMinimap(playerX, playerZ, yaw, bots, plant, time) {
      const width = el.minimap.width;
      const height = el.minimap.height;
      const sx = (x) => ((x + 20) / 40) * width;
      const sz = (z) => ((z + 16) / 32) * height;
      if (!staticBuilt) buildStaticMap();
      mapCtx.clearRect(0, 0, width, height);
      mapCtx.drawImage(mapStatic, 0, 0);
      // A planted site blinks on top of its static marker.
      if (plant.status === 'planted' && plant.site) {
        const blink = Math.floor(time * 3) % 2 === 0 ? 1 : 0.35;
        mapCtx.globalAlpha = blink;
        mapCtx.fillStyle = plant.site.id === 'A' ? '#f2a93b' : '#4db2e8';
        mapCtx.beginPath();
        mapCtx.arc(sx(plant.site.x), sz(plant.site.z), 5, 0, Math.PI * 2);
        mapCtx.fill();
        mapCtx.globalAlpha = 1;
      }
      // Bots only show once they have fired recently — or always, once the
      // charge is planted and every defender is converging.
      for (const bot of bots) {
        if (!bot.alive) continue;
        if (plant.status !== 'planted' && time - bot.lastShotAt > 3) continue;
        mapCtx.fillStyle = '#e5484d';
        mapCtx.beginPath();
        mapCtx.arc(sx(bot.x), sz(bot.z), 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
      // The player arrow, rotated to the view direction.
      const px = sx(playerX);
      const py = sz(playerZ);
      mapCtx.save();
      mapCtx.translate(px, py);
      mapCtx.rotate(Math.atan2(-Math.sin(yaw), -Math.cos(yaw)));
      mapCtx.fillStyle = '#35c4a5';
      mapCtx.beginPath();
      mapCtx.moveTo(0, -6);
      mapCtx.lineTo(4, 5);
      mapCtx.lineTo(-4, 5);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.restore();
    },
    showOverlay(mode, scoreText) {
      const text = COPY[mode];
      el.title.textContent = text.title;
      el.copy.textContent = mode === 'roundEnd' || mode === 'matchEnd' ? scoreText || text.copy : text.copy;
      el.play.textContent = text.action;
      el.overlay.hidden = false;
      el.play.focus();
    },
    hideOverlay() {
      el.overlay.hidden = true;
    },
    onPlay(handler) {
      el.play.addEventListener('click', handler);
    },
  };
}
