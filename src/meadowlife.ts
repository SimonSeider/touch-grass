import * as THREE from 'three';
import butterflyUrl from './textures/butterfly.png?url';
import { meadowAt } from './meadow';
import type { HeightFn } from './grass';
import lifeVertex from './shaders/terrain/meadowlife.vert.glsl?raw';

const SEEDS = 110;
const BUTTERFLIES = 16;
const RADIUS = 35;

function geometry(butterfly: boolean): THREE.BufferGeometry {
  const vertices: number[] = [], colors: number[] = [], wings: number[] = [];
  function triangle(points: number[][], hex: string, wing = 0) {
    const color = new THREE.Color(hex);
    for (const p of points) { vertices.push(...p); colors.push(color.r, color.g, color.b); wings.push(wing); }
  }
  if (butterfly) {
    // Two UV-mapped wing surfaces hinge along the body then the image supplies the silhouette.
    for (const side of [-1, 1]) {
      const x = side * 0.27;
      triangle([[0, 0, -0.27], [x, 0, -0.27], [x, 0, 0.27]], '#ffffff', side);
      triangle([[0, 0, -0.27], [x, 0, 0.27], [0, 0, 0.27]], '#ffffff', side);
    }
  } else {
    // A tiny seed suspended below a loose star of fine, pale filaments.
    triangle([[-0.009, -0.09, 0], [0.009, -0.09, 0], [0, 0.018, 0]], '#a3976c');
    triangle([[0, -0.09, -0.009], [0, -0.09, 0.009], [0, 0.018, 0]], '#a3976c');
    for (let i = 0; i < 9; i++) {
      const angle = i * Math.PI * 2 / 9;
      const x = Math.cos(angle) * 0.065, z = Math.sin(angle) * 0.065;
      triangle([[0, 0.015, 0], [x, 0.046, z], [x - Math.sin(angle) * 0.007, 0.04, z + Math.cos(angle) * 0.007]], '#eee8cf');
    }
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(vertices.flatMap((_, i) => i % 3 === 0 ? [vertices[i] / 0.54 + 0.5, 0.5 - vertices[i + 2] / 0.54] : []), 2));
  result.setAttribute('aWing', new THREE.Float32BufferAttribute(wings, 1));
  result.computeVertexNormals();
  return result;
}

export function createMeadowLife(heightAt: HeightFn, plantMaterial: THREE.ShaderMaterial) {
  const group = new THREE.Group();
  const material = new THREE.ShaderMaterial({
    uniforms: { ...plantMaterial.uniforms }, defines: { MEADOW_PLANT: '' },
    side: THREE.DoubleSide, fragmentShader: plantMaterial.fragmentShader,
    vertexShader: lifeVertex,
  });
  const wingTexture = new THREE.TextureLoader().load(butterflyUrl);
  wingTexture.colorSpace = THREE.SRGBColorSpace;
  wingTexture.anisotropy = 4;
  const butterflyMaterial = new THREE.ShaderMaterial({
    uniforms: { ...material.uniforms, uAlbedoMap: { value: wingTexture } },
    defines: { MEADOW_PLANT: '', MEADOW_TEXTURE: '' },
    vertexShader: lifeVertex, fragmentShader: material.fragmentShader,
    side: THREE.DoubleSide,
  });
  const seeds = new THREE.InstancedMesh(geometry(false), material, SEEDS);
  const butterflies = new THREE.InstancedMesh(geometry(true), butterflyMaterial, BUTTERFLIES);
  for (const mesh of [seeds, butterflies]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  let randomState = 91283;
  const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
  const fluff = Array.from({ length: SEEDS }, () => ({ position: new THREE.Vector3(), phase: random() * Math.PI * 2, size: 0.65 + random() * 0.8 }));
  const insects = Array.from({ length: BUTTERFLIES }, () => ({ anchor: new THREE.Vector3(), phase: random() * 20, active: false }));
  const dummy = new THREE.Object3D();
  let initialized = false, last = 0;
  function placeSeed(p: THREE.Vector3, camera: THREE.Vector3) {
    const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * RADIUS;
    p.set(camera.x + Math.cos(angle) * radius, 0, camera.z + Math.sin(angle) * radius);
    p.y = heightAt(p.x, p.z) + 1.2 + random() * 5;
  }
  function placeButterfly(insect: typeof insects[number], camera: THREE.Vector3) {
    insect.active = false;
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = camera.x + (random() - 0.5) * RADIUS * 1.6;
      const z = camera.z + (random() - 0.5) * RADIUS * 1.6;
      const patch = meadowAt(x, z), y = heightAt(x, z);
      if (patch.flowers < 0.61 || patch.clover > 0.65) continue;
      if (Math.hypot(heightAt(x + 0.5, z) - y, heightAt(x, z + 0.5) - y) > 0.36) continue;
      insect.anchor.set(x, y + 1.2, z); insect.active = true; break;
    }
  }
  return {
    group,
    update(t: number, camera: THREE.Vector3, sunDir: THREE.Vector3) {
      const dt = Math.min(Math.max(t - last, 0), 0.05); last = t;
      if (!group.visible) { initialized = false; return; }
      if (!initialized) {
        fluff.forEach(seed => placeSeed(seed.position, camera));
        insects.forEach(insect => placeButterfly(insect, camera));
        initialized = true;
      }
      const activity = THREE.MathUtils.smoothstep(sunDir.y, -0.04, 0.16);
      const windX = 0.55 + Math.sin(t * 0.21) * 0.35;
      const windZ = 0.18 + Math.cos(t * 0.17) * 0.3;
      fluff.forEach((seed, i) => {
        const p = seed.position;
        p.x += (windX + Math.sin(t * 0.6 + seed.phase) * 0.14) * dt;
        p.z += (windZ + Math.cos(t * 0.5 + seed.phase) * 0.14) * dt;
        p.y += (Math.sin(t * 0.7 + seed.phase) * 0.1 - 0.045) * dt;
        const distance = Math.hypot(p.x - camera.x, p.z - camera.z);
        if (distance > RADIUS || p.y < heightAt(p.x, p.z) + 0.25) placeSeed(p, camera);
        const fade = 1 - THREE.MathUtils.smoothstep(Math.hypot(p.x - camera.x, p.z - camera.z), RADIUS - 7, RADIUS);
        dummy.position.copy(p); dummy.rotation.set(Math.sin(t * 0.6 + seed.phase) * 0.3, t * 0.15 + seed.phase, 0.2);
        dummy.scale.setScalar(seed.size * fade); dummy.updateMatrix(); seeds.setMatrixAt(i, dummy.matrix);
      });
      insects.forEach((insect, i) => {
        if ((!insect.active && Math.floor(t) % BUTTERFLIES === i) || Math.hypot(insect.anchor.x - camera.x, insect.anchor.z - camera.z) > RADIUS) placeButterfly(insect, camera);
        const phase = t * 0.65 + insect.phase;
        dummy.position.copy(insect.anchor);
        dummy.position.x += Math.sin(phase) * 1.4;
        dummy.position.z += Math.sin(phase * 0.73) * 1.1;
        dummy.position.y = heightAt(dummy.position.x, dummy.position.z) + 1.15 + (0.5 + 0.5 * Math.sin(phase * 1.3)) * 1.1 + Math.sin(t * 3 + insect.phase) * 0.12;
        dummy.rotation.set(0.12 * Math.sin(phase), Math.PI + Math.atan2(Math.cos(phase) * 1.4, Math.cos(phase * 0.73) * 0.803), Math.sin(phase * 1.7) * 0.2);
        const fade = 1 - THREE.MathUtils.smoothstep(dummy.position.distanceTo(camera), RADIUS - 8, RADIUS);
        dummy.scale.setScalar(insect.active ? activity * fade : 0); dummy.updateMatrix(); butterflies.setMatrixAt(i, dummy.matrix);
      });
      seeds.instanceMatrix.needsUpdate = true; butterflies.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const mesh of [seeds, butterflies]) { group.remove(mesh); mesh.dispose(); mesh.geometry.dispose(); }
      material.dispose(); butterflyMaterial.dispose(); wingTexture.dispose();
    },
  };
}
