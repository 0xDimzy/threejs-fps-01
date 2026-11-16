# EMBERLINE — a three.js tactical FPS

A round-based tactical shooter in the Counter-Strike style, built on three.js 0.187.0
(vendored, offline, no build step). You are Vanguard; four Cinder bots defend the
Cinderworks Yard. Win rounds by eliminating the enemy team or by planting the
sabotage charge at Site A or Site B and holding it until detonation.

## How a match plays

- **First to 5 rounds** (max 9). Each round: 15 s buy phase, then 100 s live.
- **Money:** start $800. Kill +$300, round win +$325, round loss +$190, plant +$300.
  Spend it in the buy menu (B) between rounds.
- **Arsenal:** AR-77 Kestrel rifle (owned), SMG-9 Wasp $600, SG-12 Breacher
  shotgun $700, Frag-9 grenade $300, Kevlar vest $650 (halves damage taken).
- **Objective:** carry the charge (E, hold 3.5 s inside a site) to plant it. The
  35 s fuse then runs; Cinder bots push the site and try to defuse (5 s channel).
  If the fuse runs out, the site blows and Vanguard wins the round. If the timer
  runs out unplanted, or you die before planting, the round is lost.

## Gunplay

Hitscan weapons with headshots (3x damage on the rifle, 2x on the SMG, 1.5x on the
shotgun). Recoil kicks the view up and recovers; spread grows with movement speed,
firing while airborne, and sustained fire — stopping to aim pays. Crouch (Ctrl/C)
tightens spread and lowers your profile; movement has acceleration and friction;
collision is an axis-separated AABB test against every wall and crate.

## Bots

Four Cinder bots take fixed routes through the yard (A-long, mid, B-tunnel), hold
angles, peek, and react to what they see and hear: gunfire within earshot pulls
them to investigate, line of sight triggers a reaction delay then aimed bursts
with strafing. After a plant they converge on the site; one defuses while the
others hunt you.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click to capture) |
| Click | Fire |
| R | Reload |
| 1 / 2 / 3 | Rifle / SMG / Shotgun |
| G | Throw frag grenade |
| E (hold) | Plant the charge (inside a site) |
| B | Buy menu (buy phase) |
| Ctrl / C | Crouch |
| Space | Jump |

## The map — Cinderworks Yard

An original industrial yard, 40 x 32 m: two bomb sites (A west, B east) joined by
three lanes — A-long past the furnace, mid through the container canyon, B-tunnel
under the gantry — with crates, containers and walls giving corners, cover and
long sightlines. Dusk lighting: a low amber sun, cool fill, and site beacons in
amber (A) and cyan (B).

## Run it

```sh
node serve.ts        # serves game/ at http://localhost:8080
```

Open the page in desktop Chrome, click to play. No network request is made;
all sound is synthesized with WebAudio. Screenshots in `screenshots/` are real
renders of this code (`?shot=start|play|buy|end&seed=1` stages deterministic
frames for capture).

## Files

- `game/index.html` — page, HUD DOM, import map for three.js
- `game/src/main.js` — boot, fixed-step loop, round/economy state machine
- `game/src/state.js` — the one match-state object
- `game/src/map.js` — map data: boxes, sites, spawns, bot routes
- `game/src/world.js` — meshes, colliders, lights built from the map data
- `game/src/physics.js` — shared AABB mover (player and bots)
- `game/src/player.js` — movement, crouch, jump, look, recoil
- `game/src/weapons.js` — weapon defs, view models, spread, reload
- `game/src/combat.js` — hitscan resolution, tracers, impacts
- `game/src/bots.js` — bot AI: routes, holds, sight, hearing, defuse
- `game/src/grenades.js` — thrown frags: bounce, fuse, blast
- `game/src/audio.js` — synthesized WebAudio effects
- `game/src/hud.js` — HUD, buy menu, kill feed, minimap
- `game/src/input.js` — keyboard, mouse, pointer lock
- `game/src/palette.js`, `game/src/rng.js` — palette, seeded RNG

## License

MIT — see `LICENSE`.
