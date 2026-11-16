// Deterministic randomness for the match: mulberry32, one stream per page load
// seeded from the URL, so the ?shot= captures render the same frame every time
// and a round's bot behaviour can be replayed from its seed.
export function mulberry32(initialSeed) {
  let state = initialSeed | 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A value uniformly in [min, max) from a stream.
export function range(random, min, max) {
  return min + random() * (max - min);
}
