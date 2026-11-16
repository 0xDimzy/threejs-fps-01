// Shared AABB physics: axis-separated movement against the map solids, and
// ray-vs-box tests for hitscan. Player and bots both move through here, so
// collision behaves identically for both sides.
import * as THREE from 'three';

// A solid from map.js, normalised to min/max bounds once at load.
export function solidBounds(s) {
  const y0 = s.y0 ?? 0;
  return {
    minX: s.cx - s.sx / 2,
    maxX: s.cx + s.sx / 2,
    minZ: s.cz - s.sz / 2,
    maxZ: s.cz + s.sz / 2,
    minY: y0,
    maxY: y0 + s.h,
  };
}

// Do two axis-aligned boxes overlap? (2D footprint + height band.)
export function boxesOverlap(a, b) {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ &&
    a.minY < b.maxY &&
    a.maxY > b.minY
  );
}

// Move a standing body (position = feet centre) with axis separation:
// resolve X, then Z, then Y, so sliding along walls works and the body
// never tunnels into a solid. Returns which axes collided.
export function moveBody(pos, half, height, vel, dt, solids) {
  const hits = { x: false, z: false, y: false, grounded: false };
  // X axis.
  pos.x += vel.x * dt;
  let box = bodyBox(pos, half, height);
  for (const s of solids) {
    if (!boxesOverlap(box, s)) continue;
    if (vel.x > 0) pos.x = s.minX - half - 0.001;
    else if (vel.x < 0) pos.x = s.maxX + half + 0.001;
    else pos.x = pos.x; // pushed out by an overlap with no velocity: leave
    hits.x = true;
    box = bodyBox(pos, half, height);
  }
  // Z axis.
  pos.z += vel.z * dt;
  box = bodyBox(pos, half, height);
  for (const s of solids) {
    if (!boxesOverlap(box, s)) continue;
    if (vel.z > 0) pos.z = s.minZ - half - 0.001;
    else if (vel.z < 0) pos.z = s.maxZ + half + 0.001;
    hits.z = true;
    box = bodyBox(pos, half, height);
  }
  // Y axis: gravity lands on the ground plane or on top of a solid.
  pos.y += vel.y * dt;
  if (pos.y <= 0) {
    pos.y = 0;
    hits.y = true;
    hits.grounded = true;
  } else {
    box = bodyBox(pos, half, height);
    for (const s of solids) {
      if (!boxesOverlap(box, s)) continue;
      if (vel.y <= 0 && pos.y < s.maxY && pos.y + height > s.maxY) {
        pos.y = s.maxY;
        hits.y = true;
        hits.grounded = true;
      }
    }
  }
  return hits;
}

export function bodyBox(pos, half, height) {
  return {
    minX: pos.x - half,
    maxX: pos.x + half,
    minZ: pos.z - half,
    maxZ: pos.z + half,
    minY: pos.y,
    maxY: pos.y + height,
  };
}

// Ray vs AABB (slab test). Returns the entry distance, or null on a miss.
// dir must be normalised. maxDist caps the search.
export function rayBox(origin, dir, box, maxDist = Infinity) {
  let tmin = 0;
  let tmax = maxDist;
  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];
  const mn = [box.minX, box.minY, box.minZ];
  const mx = [box.maxX, box.maxY, box.maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return null;
    } else {
      let t1 = (mn[i] - o[i]) / d[i];
      let t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

// Nearest solid the ray hits, or null. Used to cap hitscan range and to
// decide whether a bot actually has line of sight on the player.
export function raySolids(origin, dir, solids, maxDist = 200) {
  let best = null;
  for (const s of solids) {
    const t = rayBox(origin, dir, s, maxDist);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

// Line-of-sight check between two points at eye height, ignoring the
// endpoints' own boxes: true when no solid blocks the segment.
export function hasLineOfSight(a, b, solids) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const dist = dir.length();
  if (dist < 0.001) return true;
  dir.multiplyScalar(1 / dist);
  const t = raySolids(a, dir, solids, dist - 0.05);
  return t === null;
}
