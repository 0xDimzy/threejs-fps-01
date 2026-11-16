// World building: turn the map data into three.js meshes, lights and
// colliders. Geometry is styled, not copied: crates, containers, the furnace
// and the gantry are plain boxes with a chosen palette, lit by a low amber
// sun and a cool fill, with fog and a dusk sky. The minimap reads the same
// map data, so the HUD and the 3D yard always agree.
import * as THREE from 'three';
import { MAP } from './map.js';
import { PAL } from './palette.js';
import { solidBounds } from './physics.js';

function boxMesh(w, h, d, color, roughness = 0.9) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.08 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Pick a container colour from its position so the canyon reads varied.
function containerColor(cx, cz) {
  const n = Math.abs(Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1;
  if (n < 0.4) return PAL.containerA;
  if (n < 0.75) return PAL.containerB;
  return PAL.containerC;
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(PAL.sky);
  scene.fog = new THREE.Fog(PAL.fog, 28, 78);

  const solids = MAP.solids.map(solidBounds);
  const group = new THREE.Group();
  scene.add(group);

  // Ground: one slab plus a darker yard stripe down the middle lane.
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(MAP.width + 2, 0.2, MAP.depth + 2),
    new THREE.MeshStandardMaterial({ color: PAL.ground, roughness: 1 }),
  );
  ground.position.set(0, -0.1, 0);
  ground.receiveShadow = true;
  group.add(ground);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(3, 0.02, MAP.depth),
    new THREE.MeshStandardMaterial({ color: PAL.groundDark, roughness: 1 }),
  );
  stripe.position.set(0, 0.011, 0);
  stripe.receiveShadow = true;
  group.add(stripe);

  // Every map solid becomes a mesh. Crates get a warm timber tone, the
  // furnace a dark brick with a glowing mouth, the gantry rusted steel.
  for (const s of MAP.solids) {
    const y0 = s.y0 ?? 0;
    let mesh;
    if (s.h >= 3.9 && (s.sx === 1 || s.sz === 1)) {
      // Perimeter wall or gantry pillar: darker steel.
      mesh = boxMesh(s.sx, s.h, s.sz, s.sx > s.sz ? PAL.wall : PAL.wallDark);
    } else if (s.cx === -17 && s.cz === -3) {
      mesh = boxMesh(s.sx, s.h, s.sz, PAL.furnace, 0.7);
    } else if (s.sx >= 5 && s.sz <= 2.5) {
      mesh = boxMesh(s.sx, s.h, s.sz, containerColor(s.cx, s.cz), 0.6);
    } else if (s.h <= 1.5) {
      mesh = boxMesh(s.sx, s.h, s.sz, s.h >= 1.4 ? PAL.wallDark : PAL.crate);
    } else if (y0 > 0) {
      mesh = boxMesh(s.sx, s.h, s.sz, PAL.gantryRust, 0.6);
    } else {
      mesh = boxMesh(s.sx, s.h, s.sz, PAL.crateDark);
    }
    mesh.position.set(s.cx, y0 + s.h / 2, s.cz);
    group.add(mesh);
  }

  // Furnace mouth: a glowing slit on the furnace's south face.
  const mouth = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 0.9),
    new THREE.MeshBasicMaterial({ color: PAL.furnaceGlow }),
  );
  mouth.position.set(-17, 1.1, -1.48);
  group.add(mouth);
  const furnaceLight = new THREE.PointLight(PAL.furnaceGlow, 18, 14, 1.8);
  furnaceLight.position.set(-17, 1.6, -0.5);
  group.add(furnaceLight);

  // Site beacons: a glowing ring on the ground and a light column.
  const beacons = {};
  for (const [key, site] of Object.entries(MAP.sites)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.25, site.r, 40),
      new THREE.MeshBasicMaterial({ color: site.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    group.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(site.r, 32),
      new THREE.MeshBasicMaterial({ color: site.color, transparent: true, opacity: 0.08, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(site.x, 0.015, site.z);
    group.add(disc);
    const light = new THREE.PointLight(site.color, 10, 12, 1.6);
    light.position.set(site.x, 3.2, site.z);
    group.add(light);
    const letter = makeLetterSprite(key, site.color);
    letter.position.set(site.x, 4.6, site.z);
    group.add(letter);
    beacons[key] = { ring, light };
  }

  // Lighting: low amber sun from the west, cool fill from the east, a dim
  // hemisphere so shadows never go black.
  const sun = new THREE.DirectionalLight(0xffb36b, 2.4);
  sun.position.set(-28, 14, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 80;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x7fa8c9, 0.55);
  fill.position.set(24, 18, -12);
  scene.add(fill);
  scene.add(new THREE.HemisphereLight(0x8a94a8, 0x2a2118, 0.5));

  return { solids, group, beacons, furnaceLight };
}

// A floating letter sprite ("A" / "B") above each site, drawn on canvas.
function makeLetterSprite(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.font = 'bold 84px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.2, 2.2, 1);
  return sprite;
}
