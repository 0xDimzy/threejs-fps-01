// The yard, built from MAP: every box is a mesh, a collider and a surface a
// bullet stops on. One material per palette name, shared by every mesh. Site
// beacons are glowing floor rings with a point light each; lane strips are flat
// paint on the floor. No textures, no models, no network — styled geometry only.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // One shared material per palette name, built once up front.
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  // Colliders are computed straight from the map data — the box bounds are
  // already in the table, so no per-mesh setFromObject pass runs at load.
  function addBox(width, height, depth, x, y, z, materialName) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[materialName]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - width / 2, y - height / 2, z - depth / 2),
      new THREE.Vector3(x + width / 2, y + height / 2, z + depth / 2),
    ));
    shootables.push(mesh);
    return mesh;
  }

  for (const [w, h, d, x, y, z, mat] of MAP.boxes) addBox(w, h, d, x, y, z, mat);

  // Painted lane strips: flat boxes 2 cm above the floor, never colliders.
  for (const [w, d, x, z, mat] of MAP.strips) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.02, d),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[mat]), roughness: 0.9, transparent: true, opacity: 0.35 }),
    );
    strip.position.set(x, 0.02, z);
    strip.receiveShadow = true;
    group.add(strip);
  }

  // Site beacons: a ring on the floor and a low post light each, in the site colour.
  const beacons = [];
  for (const site of MAP.sites) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(MAP.plantRadius - 0.25, MAP.plantRadius, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE[site.color]), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.04, site.z);
    group.add(ring);
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 2.6, 0.3),
      materials[site.color === 'siteA' ? 'accent' : 'surface'],
    );
    post.position.set(site.x, 1.3, site.z - MAP.plantRadius - 0.4);
    post.castShadow = true;
    group.add(post);
    const light = new THREE.PointLight(new THREE.Color(PALETTE[site.color]), 22, 13);
    light.position.set(site.x, 3.0, site.z);
    scene.add(light);
    beacons.push({ site, ring, light });
  }

  // Barrels: cylinders on the site corners, with a box collider each, also
  // computed from the numbers (radius 0.42, height 1.05, centre y 0.53).
  const barrelGeometry = new THREE.CylinderGeometry(0.42, 0.42, 1.05, 14);
  for (const [x, z] of [[-18.5, -5], [18.5, -5], [-6, 12.5], [6, 12.5], [-18.5, 12.5], [18.5, 12.5]]) {
    const barrel = new THREE.Mesh(barrelGeometry, materials.hairline);
    barrel.position.set(x, 0.53, z);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.42, 0, z - 0.42), new THREE.Vector3(x + 0.42, 1.06, z + 0.42)));
    shootables.push(barrel);
  }

  // Light: a low amber dusk sun, a cool fill, and a sky/ground gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#7d8ea6'), new THREE.Color(PALETTE.canvas), 2.0);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.6);
  key.position.set(-14, 18, 12);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 1.1);
  fill.position.set(12, 10, -12);
  scene.add(fill);

  return { colliders, shootables, group, beacons };
}
