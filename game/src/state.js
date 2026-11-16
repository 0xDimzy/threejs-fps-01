// The single match-state object. Every number the round machine, the economy
// and the HUD read lives in here — the player, the bots and the weapon rig keep
// only their own bodies and loadouts. Phase flow:
//   menu -> buy -> live -> roundEnd -> (buy | matchEnd)
export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const PLANT_SECONDS = 3.5;
export const FUSE_SECONDS = 35;
export const DEFUSE_SECONDS = 5;
export const ROUNDS_TO_WIN = 5;
export const MAX_ROUNDS = 9;
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 325;
export const LOSS_REWARD = 190;
export const PLANT_REWARD = 300;

// A fresh match. The plant sub-object tracks the charge through its whole life:
// 'none' -> planting (progress 0..1) -> 'planted' (fuse counting down) -> done.
export function createMatchState() {
  return {
    phase: 'menu',
    round: 1,
    wins: 0,
    losses: 0,
    money: START_MONEY,
    timer: BUY_SECONDS,
    playerHealth: 100,
    playerAlive: true,
    kills: 0,
    plant: { status: 'none', site: null, progress: 0, fuse: 0, defuse: 0, defuser: null },
    feed: [],
  };
}

// Start a new match from the menu: score, money and round all back to their
// opening values, the charge cleared, the player back at full health.
export function resetMatch(state) {
  state.phase = 'buy';
  state.round = 1;
  state.wins = 0;
  state.losses = 0;
  state.money = START_MONEY;
  state.timer = BUY_SECONDS;
  state.playerHealth = 100;
  state.playerAlive = true;
  state.kills = 0;
  state.plant = { status: 'none', site: null, progress: 0, fuse: 0, defuse: 0, defuser: null };
  state.feed = [];
}

// Between rounds: a fresh buy phase and a fresh player, but the score, the money
// and the kill count carry over.
export function resetRound(state) {
  state.timer = BUY_SECONDS;
  state.phase = 'buy';
  state.playerHealth = 100;
  state.playerAlive = true;
  state.plant = { status: 'none', site: null, progress: 0, fuse: 0, defuse: 0, defuser: null };
}

// The kill feed keeps its last five entries.
export function addFeed(state, text, kind) {
  state.feed.push({ text, kind: kind || 'info', time: 0 });
  if (state.feed.length > 5) state.feed.shift();
}
