// Cinderworks Yard, as data. One source of truth — world.js builds meshes and
// colliders from BOXES, hud.js draws the minimap from the same boxes, bots.js
// walks ROUTES through the same waypoint graph. Coordinates: x east, z south;
// the yard is 40 x 32 m, the two sites at the north end (z = -11), Vanguard
// spawning south (z = +13.5), Cinder spawning north. Three lanes join them:
// A-long down the west side past the furnace, mid through the container canyon,
// B-tunnel under the gantry on the east side.
export const MAP = {
  bounds: { minX: -20, maxX: 20, minZ: -16, maxZ: 16 },
  playerSpawn: [0, 13.5],
  botSpawns: [[-16, -13.5], [-5, -13.5], [5, -13.5], [16, -13.5]],
  plantRadius: 3.4,
  sites: [
    { id: 'A', name: 'Site A', x: -14, z: -11, color: 'siteA' },
    { id: 'B', name: 'Site B', x: 14, z: -11, color: 'siteB' },
  ],
  // Boxes: [width, height, depth, x, y, z, palette material]. Every box is a
  // mesh, a collider and a surface a bullet stops on.
  boxes: [
    // Floor and perimeter walls.
    [40.8, 0.4, 32.8, 0, -0.2, 0, 'canvas'],
    [0.4, 4.6, 32.8, -20.2, 2.3, 0, 'surface'],
    [0.4, 4.6, 32.8, 20.2, 2.3, 0, 'surface'],
    [40.8, 4.6, 0.4, 0, 2.3, -16.2, 'surface'],
    [40.8, 4.6, 0.4, 0, 2.3, 16.2, 'surface'],
    // The furnace block on A-long, with an amber cap.
    [2.6, 3.4, 2.2, -17.5, 1.7, -8, 'hairline'],
    [1.4, 1.1, 1.4, -17.5, 3.95, -8, 'accent'],
    // A-long cover: a low wall and crates the attacker can crouch behind.
    [0.8, 1.15, 4.4, -12.4, 0.58, -4, 'hairline'],
    [1.5, 1.1, 1.5, -15.5, 0.55, 2.5, 'hairline'],
    [1.5, 1.1, 1.5, -15.5, 0.55, 4.2, 'surface'],
    [1.2, 2.2, 1.2, -10.5, 1.1, -9.5, 'surface'],
    // Mid canyon: two container rows with a gap to peek through.
    [5.4, 2.6, 1.6, -4.2, 1.3, 1.5, 'surface'],
    [5.4, 2.6, 1.6, 4.2, 1.3, 1.5, 'surface'],
    [1.6, 1.1, 1.6, -1.2, 0.55, -3.5, 'hairline'],
    [1.6, 1.1, 1.6, 1.4, 0.55, -3.5, 'hairline'],
    [1.2, 2.4, 1.2, 0, 1.2, -8.5, 'hairline'],
    // Mid doors: pillars framing the sightline into both sites.
    [1.0, 3.6, 1.0, -6.5, 1.8, -9.5, 'surface'],
    [1.0, 3.6, 1.0, 6.5, 1.8, -9.5, 'surface'],
    // B side: gantry deck over the tunnel lane (walk under it, 2.6 m clear).
    [7.0, 0.5, 6.0, 15.5, 2.85, 3.5, 'surface'],
    [0.8, 2.6, 0.8, 12.4, 1.3, 1.0, 'hairline'],
    [0.8, 2.6, 0.8, 12.4, 1.3, 6.0, 'hairline'],
    [0.8, 2.6, 0.8, 18.6, 1.3, 1.0, 'hairline'],
    [0.8, 2.6, 0.8, 18.6, 1.3, 6.0, 'hairline'],
    [1.5, 1.1, 1.5, 16.5, 0.55, -3.5, 'hairline'],
    [1.5, 2.2, 1.5, 11.0, 1.1, -6.5, 'surface'],
    // South cover near Vanguard spawn: crates to stage behind.
    [2.6, 1.0, 1.2, -3.0, 0.5, 9.0, 'hairline'],
    [2.6, 1.0, 1.2, 3.0, 0.5, 9.0, 'hairline'],
    [1.2, 1.0, 1.2, 0, 0.5, 11.5, 'surface'],
    // Site props: barrels and a low wall on each site.
    [1.1, 1.1, 1.1, -17.0, 0.55, -13.5, 'hairline'],
    [1.1, 1.1, 1.1, -11.0, 0.55, -13.5, 'hairline'],
    [1.1, 1.1, 1.1, 11.0, 0.55, -13.5, 'hairline'],
    [1.1, 1.1, 1.1, 17.0, 0.55, -13.5, 'hairline'],
    [3.2, 1.0, 0.8, -14, 0.5, -7.6, 'hairline'],
    [3.2, 1.0, 0.8, 14, 0.5, -7.6, 'hairline'],
  ],
  // Painted floor strips, visual only — no collider. [width, depth, x, z, material]
  strips: [
    [2.2, 24, -14, -2, 'siteA'],
    [2.2, 24, 14, -2, 'siteB'],
    [2.2, 20, 0, 2, 'hairline'],
  ],
  // Waypoint graph: id -> [x, z]. Bots follow ROUTES; a hunting bot steers to the
  // nearest node, then along nodes toward its target.
  nodes: {
    spawn: [0, 13],
    aCorner: [-15, 6],
    aLong: [-16, -2],
    aDoor: [-14, -7],
    aSite: [-14, -11],
    aMid: [-8, -2],
    midLow: [0, 7],
    midCanyon: [0, -1],
    midDoor: [0, -7],
    bCorner: [15, 6],
    bTun: [15, 0],
    bDoor: [14, -7],
    bSite: [14, -11],
    bMid: [8, -2],
    northMid: [0, -12],
  },
  // One route per bot: waypoints in order, the last one is the hold position.
  routes: [
    ['aCorner', 'aLong', 'aDoor', 'aSite'],
    ['midLow', 'midCanyon', 'midDoor', 'northMid'],
    ['bCorner', 'bTun', 'bDoor', 'bSite'],
    ['aMid', 'midCanyon', 'aMid', 'bMid'],
  ],
  // Where each bot holds: [x, z, facing yaw]. Yaw 0 faces south (-z is north
  // here, so a bot facing the player spawn uses yaw Math.PI).
  holds: [
    [-14, -9.5, Math.PI],
    [0, -11.5, Math.PI],
    [14, -9.5, Math.PI],
    [-8, -2, Math.PI * 0.75],
  ],
};
