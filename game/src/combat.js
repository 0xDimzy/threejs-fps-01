// Hitscan resolution: one ray per pellet against the world's shootables and the
// bots' hit meshes, nearest hit wins. Tracers and impact flashes come from fixed
// pools — no objects are allocated in the hot path. The caller owns damage;
// this module only says what was hit, where, and which body part.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 10;
const IMPACTS = 8;

export function createCombat(scene) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  // Scratch vectors, reused so shoot() allocates nothing but the result.
  const direction = new THREE.Vector3();
  const end = new THREE.Vector3();

  // Tracer pool: one reusable line per shot, fading out after 70 ms.
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  // Impact pool: small glowing spheres that shrink and fade at the hit point.
  const impacts = [];
  const impactGeometry = new THREE.SphereGeometry(0.09, 8, 6);
  for (let i = 0; i < IMPACTS; i += 1) {
    const mesh = new THREE.Mesh(impactGeometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }));
    mesh.visible = false;
    scene.add(mesh);
    impacts.push({ mesh, life: 0 });
  }
  let impactIndex = 0;

  function showTracer(from, to) {
    const tracer = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % TRACERS;
    const positions = tracer.line.geometry.attributes.position.array;
    positions[0] = from.x;
    positions[1] = from.y;
    positions[2] = from.z;
    positions[3] = to.x;
    positions[4] = to.y;
    positions[5] = to.z;
    tracer.line.geometry.attributes.position.needsUpdate = true;
    tracer.line.material.opacity = 0.85;
    tracer.life = 0.07;
  }

  function showImpact(point) {
    const impact = impacts[impactIndex];
    impactIndex = (impactIndex + 1) % IMPACTS;
    impact.mesh.position.copy(point);
    impact.mesh.visible = true;
    impact.mesh.material.opacity = 0.9;
    impact.mesh.scale.set(1, 1, 1);
    impact.life = 0.16;
  }

  function step(dt) {
    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      if (tracer.life <= 0) tracer.line.material.opacity = 0;
    }
    for (const impact of impacts) {
      if (impact.life <= 0) continue;
      impact.life -= dt;
      const scale = Math.max(0.01, impact.life / 0.16);
      impact.mesh.scale.set(scale, scale, scale);
      impact.mesh.material.opacity = Math.max(0, impact.life / 0.16) * 0.9;
      if (impact.life <= 0) impact.mesh.visible = false;
    }
  }

  // origin/direction are Vector3s; spread is added per pellet by jittering the
  // direction before the ray is cast. Returns the nearest hit or null.
  function shoot(origin, baseDirection, spread, random, targets, pelletCount = 1) {
    let best = null;
    for (let p = 0; p < pelletCount; p += 1) {
      direction.copy(baseDirection);
      direction.x += (random() * 2 - 1) * spread;
      direction.y += (random() * 2 - 1) * spread;
      direction.z += (random() * 2 - 1) * spread;
      direction.normalize();
      raycaster.set(origin, direction);
      const hit = raycaster.intersectObjects(targets, false)[0];
      end.copy(origin).addScaledVector(direction, hit ? hit.distance : 80);
      showTracer(origin, end);
      if (hit) {
        showImpact(hit.point);
        if (!best || hit.distance < best.distance) {
          best = { object: hit.object, point: hit.point.clone(), distance: hit.distance, part: hit.object.userData.part || 'world' };
        }
      }
    }
    return best;
  }

  // Line of sight: true when nothing in `blockers` stands between the two points.
  function hasLineOfSight(from, to, blockers) {
    direction.copy(to).sub(from);
    const distance = direction.length();
    if (distance < 0.01) return true;
    direction.normalize();
    raycaster.set(from, direction);
    raycaster.far = distance;
    const hit = raycaster.intersectObjects(blockers, false)[0];
    raycaster.far = 90;
    return !hit;
  }

  return { shoot, step, hasLineOfSight };
}
