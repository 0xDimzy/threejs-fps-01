// Seeded RNG for EMBERLINE: mulberry32, plus the small helpers the game
// needs (ranges, picks, weighted chances). One stream drives bot jitter and
// cosmetic variation; the ?shot= staging uses its own fixed seed so staged
// frames are deterministic.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    // Uniform float in [lo, hi).
    range(lo, hi) {
      return lo + next() * (hi - lo);
    },
    // Uniform integer in [lo, hi].
    int(lo, hi) {
      return Math.floor(lo + next() * (hi - lo + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    chance(p) {
      return next() < p;
    },
    // Symmetric jitter: value + (next() - 0.5) * spread.
    jitter(value, spread) {
      return value + (next() - 0.5) * spread;
    },
  };
}
