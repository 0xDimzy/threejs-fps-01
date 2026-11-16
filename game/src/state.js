// The one match-state object. Everything about the match — rounds, money,
// phase clocks, the plant — lives here so the HUD, bots and main loop all
// read the same truth. Nothing here touches three.js or the DOM.
export const ECONOMY = {
  startMoney: 800,
  killBonus: 300,
  winBonus: 325,
  lossBonus: 190,
  plantBonus: 300,
  price: { wasp: 600, breacher: 700, frag: 300, kevlar: 650 },
};

export const TIMING = {
  buySeconds: 15,
  liveSeconds: 100,
  fuseSeconds: 35,
  plantSeconds: 3.5,
  defuseSeconds: 5,
  roundsToWin: 5,
  maxRounds: 9,
  roundEndSeconds: 4,
};

export function createMatch() {
  return {
    round: 1,
    vanguardRounds: 0,
    cinderRounds: 0,
    money: ECONOMY.startMoney,
    phase: 'menu', // menu | buy | live | planted | roundEnd | matchEnd
    phaseClock: 0,
    fuseClock: 0,
    plantedSite: null, // 'A' | 'B' | null
    plantHeld: 0,
    defuseHeld: 0,
    defusingBot: null,
    kills: 0,
    deaths: 0,
    plants: 0,
    lastRoundWinner: null, // 'vanguard' | 'cinder' | null
    lastRoundReason: '',
    matchWinner: null,
    shotMode: null, // set by main.js when ?shot= is present
    seed: 1,
    frozen: false,
  };
}

// Move the match into a phase and restart its clock.
export function setPhase(match, phase) {
  match.phase = phase;
  match.phaseClock = 0;
}

// Begin a fresh round: buy phase, plant/defuse cleared, money kept.
export function startRound(match) {
  match.plantedSite = null;
  match.fuseClock = 0;
  match.plantHeld = 0;
  match.defuseHeld = 0;
  match.defusingBot = null;
  match.lastRoundWinner = null;
  match.lastRoundReason = '';
  setPhase(match, 'buy');
}

// Pay out the round result and decide whether the match is over.
export function settleRound(match, winner, reason) {
  match.lastRoundWinner = winner;
  match.lastRoundReason = reason;
  if (winner === 'vanguard') {
    match.vanguardRounds += 1;
    match.money += ECONOMY.winBonus;
  } else {
    match.cinderRounds += 1;
    match.money += ECONOMY.lossBonus;
  }
  const done =
    match.vanguardRounds >= TIMING.roundsToWin ||
    match.cinderRounds >= TIMING.roundsToWin ||
    match.round >= TIMING.maxRounds;
  if (done) {
    match.matchWinner =
      match.vanguardRounds > match.cinderRounds ? 'vanguard' : 'cinder';
    setPhase(match, 'matchEnd');
  } else {
    match.round += 1;
    setPhase(match, 'roundEnd');
  }
  return done;
}

export function scoreText(match) {
  return `${match.vanguardRounds} — ${match.cinderRounds}`;
}

export function canAfford(match, item) {
  return match.money >= ECONOMY.price[item];
}
