import * as THREE from 'three';
import surfaceUrl from './textures/plant-surfaces.png?url';
import { plantGeometry, type PlantKind } from './plantgeometry';
import { meadowAt } from './meadow';
import type { GrassLayer, HeightFn } from './grass';
import { resolveIncludes } from './shaderlib';
import vertexShader from './shaders/terrain/vegetation.vert.glsl?raw';
import fragmentShader from './shaders/terrain/grass.frag.glsl?raw';

const KINDS: PlantKind[] = ['daisy', 'buttercup', 'purple', 'clover', 'seeds'];
const CHUNK = 16;

export function createVegetation(heightAt: HeightFn, grass: GrassLayer) {
  const group = new THREE.Group();
  const atlas = new THREE.TextureLoader().load(surfaceUrl);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  const material = new THREE.ShaderMaterial({
    uniforms: { ...grass.material.uniforms, uAlbedoMap: { value: atlas } },
    defines: { MEADOW_PLANT: '', MEADOW_TEXTURE: '' },
    vertexShader, fragmentShader: resolveIncludes(fragmentShader), side: THREE.DoubleSide,
  });
  const geometries = KINDS.map(plantGeometry);
  const chunks = new Map<string, THREE.InstancedMesh[]>();
  let radius = 3, density = 1;
  const dummy = new THREE.Object3D();
  function drop(key: string) {
    for (const mesh of chunks.get(key) ?? []) { group.remove(mesh); mesh.dispose(); }
    chunks.delete(key);
  }
  function build(cx: number, cz: number) {
    const matrices: THREE.Matrix4[][] = KINDS.map(() => []);
    let seed = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ 83492791) >>> 0;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 320; i++) {
      const x = (cx + random()) * CHUNK, z = (cz + random()) * CHUNK;
      const choose = random(), keep = random(), rotation = random() * Math.PI * 2, scale = 0.8 + random() * 0.45;
      if (keep > density) continue;
      const patch = meadowAt(x, z);
      let kind: number;
      if (patch.clover > 0.65) kind = 3;
      else if (patch.flowers > 0.61 && choose < 0.65) kind = patch.flowers > 0.78 ? 2 : choose < 0.38 ? 0 : 1;
      else if (patch.seeds > 0.56 && choose > 0.65) kind = 4;
      else continue;
      const y = heightAt(x, z);
      if (Math.hypot(heightAt(x + 0.5, z) - y, heightAt(x, z + 0.5) - y) > 0.36) continue;
      dummy.position.set(x, y, z); dummy.rotation.set(0, rotation, 0); dummy.scale.setScalar(scale); dummy.updateMatrix();
      matrices[kind].push(dummy.matrix.clone());
    }
    const meshes: THREE.InstancedMesh[] = [];
    matrices.forEach((instances, index) => {
      if (!instances.length) return;
      const mesh = new THREE.InstancedMesh(geometries[index], material, instances.length);
      instances.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      // Include shader-driven wind sway in frustum culling bounds.
      if (mesh.boundingSphere) mesh.boundingSphere.radius += 2;
      meshes.push(mesh); group.add(mesh);
    });
    chunks.set(`${cx},${cz}`, meshes);
  }
  return {
    group, material,
    update(camera: THREE.Vector3) {
      const cx = Math.floor(camera.x / CHUNK), cz = Math.floor(camera.z / CHUNK);
      const wanted = new Set<string>();
      const missing: { x: number; z: number; distance: number }[] = [];
      for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        const key = `${cx + dx},${cz + dz}`;
        wanted.add(key);
        if (!chunks.has(key)) missing.push({ x: cx + dx, z: cz + dz, distance: dx * dx + dz * dz });
      }
      for (const key of chunks.keys()) if (!wanted.has(key)) drop(key);
      missing.sort((a, b) => a.distance - b.distance).slice(0, 2).forEach(p => build(p.x, p.z));
    },
    setViewDistance(value: number) { radius = Math.min(4, Math.max(1, Math.round(value))); },
    setDensity(value: number) {
      const next = Math.min(1, Math.max(0.05, value));
      if (Math.abs(next - density) < 0.001) return;
      density = next; for (const key of chunks.keys()) drop(key);
    },
    dispose() { for (const key of chunks.keys()) drop(key); geometries.forEach(g => g.dispose()); material.dispose(); atlas.dispose(); },
  };
}
