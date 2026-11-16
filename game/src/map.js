// Cinderworks Yard — map data for EMBERLINE. An original industrial yard,
// 40 x 32 m. x runs west (-) to east (+), z runs north (-) to south (+).
// Vanguard spawns south, Cinder bots spawn north. Site A sits west, Site B
// east, joined by three lanes: A-long past the furnace (west), mid through
// the container canyon (centre), B-tunnel under the gantry (east).
//
// A solid is { cx, cz, sx, sz, h, y0 }: centre, footprint, height, base
// height (y0 defaults to 0; the gantry beam floats above head height so the
// lane under it stays walkable).
export const MAP = {
  width: 40,
  depth: 32,
  // Perimeter walls.
  solids: [
    { cx: 0, cz: -16.5, sx: 42, sz: 1, h: 4 }, // north
    { cx: 0, cz: 16.5, sx: 42, sz: 1, h: 4 }, // south
    { cx: -20.5, cz: 0, sx: 1, sz: 34, h: 4 }, // west
    { cx: 20.5, cz: 0, sx: 1, sz: 34, h: 4 }, // east
    // Furnace block on A-long.
    { cx: -17, cz: -3, sx: 4, sz: 3, h: 3.2 },
    // A-long cover crates.
    { cx: -13.5, cz: -8, sx: 2, sz: 2, h: 1.2 },
    { cx: -13.5, cz: -8, sx: 1.2, sz: 1.2, h: 2.4, y0: 1.2 },
    { cx: -15, cz: 4, sx: 1.8, sz: 1.8, h: 1.1 },
    // Site A low walls.
    { cx: -16, cz: -12.5, sx: 3, sz: 1, h: 1.4 },
    { cx: -12.5, cz: -13, sx: 1.5, sz: 1.5, h: 1.2 },
    // Container canyon, mid.
    { cx: -3, cz: -6, sx: 6, sz: 2.4, h: 2.6 },
    { cx: 3, cz: 3, sx: 6, sz: 2.4, h: 2.6 },
    { cx: 0, cz: -1, sx: 1.6, sz: 1.6, h: 1.1 },
    // Mid cover walls.
    { cx: -8, cz: 6, sx: 4, sz: 1, h: 2.2 },
    { cx: 8, cz: -2, sx: 4, sz: 1, h: 2.2 },
    // B-tunnel gantry: two pillars and a beam floating above head height.
    { cx: 15, cz: -7, sx: 1, sz: 1, h: 4 },
    { cx: 19, cz: -7, sx: 1, sz: 1, h: 4 },
    { cx: 17, cz: -7, sx: 5, sz: 1, h: 0.8, y0: 3.0 },
    // B-lane crates.
    { cx: 13, cz: 6, sx: 2, sz: 2, h: 1.2 },
    { cx: 14.5, cz: 8.5, sx: 1.5, sz: 1.5, h: 1 },
    // Site B low walls.
    { cx: 16, cz: -12.5, sx: 3, sz: 1, h: 1.4 },
    { cx: 12.5, cz: -13, sx: 1.5, sz: 1.5, h: 1.2 },
    // Vanguard spawn cover.
    { cx: -3, cz: 12, sx: 3, sz: 1, h: 1.5 },
    { cx: 3, cz: 12, sx: 3, sz: 1, h: 1.5 },
    // North mid block the bots filter around.
    { cx: -6, cz: -11, sx: 2, sz: 2, h: 1.3 },
    { cx: 6, cz: -11, sx: 2, sz: 2, h: 1.3 },
  ],
  sites: {
    A: { x: -16, z: -10.5, r: 4.5, color: 0xffb020 },
    B: { x: 16, z: -10.5, r: 4.5, color: 0x35d0e0 },
  },
  vanguardSpawn: { x: 0, z: 14, yaw: 0 },
  botSpawns: [
    { x: -18, z: -14 },
    { x: -6, z: -14.5 },
    { x: 6, z: -14.5 },
    { x: 18, z: -14 },
  ],
  botNames: ['Ash', 'Slag', 'Cinder', 'Rust'],
  // Fixed routes from the north spawns down into the yard. Each bot walks
  // its route, then holds the last waypoint and watches a lane.
  routes: [
    // Ash — A-long, past the furnace, holds the west mid.
    [
      [-18, -13], [-17, -6], [-16, 2], [-13, 8], [-8, 11],
    ],
    // Slag — mid through the container canyon.
    [
      [-6, -13], [-4, -8], [-1, -2], [1, 5], [5, 10],
    ],
    // Cinder — B-tunnel under the gantry.
    [
      [18, -13], [17, -7], [17, 0], [14, 6], [10, 11],
    ],
    // Rust — flex, drifts centre-west and watches mid.
    [
      [6, -13], [4, -8], [0, -2], [-3, 4], [-1, 10],
    ],
  ],
};

// True when (x, z) is inside the named site's plant circle.
export function insideSite(x, z, site) {
  const s = MAP.sites[site];
  const dx = x - s.x;
  const dz = z - s.z;
  return dx * dx + dz * dz <= s.r * s.r;
}

// Which site, if any, contains (x, z).
export function siteAt(x, z) {
  if (insideSite(x, z, 'A')) return 'A';
  if (insideSite(x, z, 'B')) return 'B';
  return null;
}

// Clamp a point into the playable yard (inside the perimeter walls).
export function clampToYard(x, z) {
  return {
    x: Math.max(-19.4, Math.min(19.4, x)),
    z: Math.max(-15.4, Math.min(15.4, z)),
  };
}
