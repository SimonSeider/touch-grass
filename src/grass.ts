import * as THREE from 'three';
import { meadowGrassScale } from './meadow';
import plantSurfaceUrl from './textures/plant-surfaces.png?url';
import { grassAt, type ShadowFieldUniforms } from './terrain';
import { resolveIncludes } from './shaderlib';
import grassVert from './shaders/terrain/grass.vert.glsl?raw';
import grassFrag from './shaders/terrain/grass.frag.glsl?raw';
import windDistUrl from './textures/WindDistortion.png?url';
import circleDispUrl from './textures/disp/CircleDisplacementObject.png?url';
import squareDispUrl from './textures/disp/SquareDisplacementObject.png?url';
import { iblUniforms } from './skyprobe';

export type HeightFn = (x: number, z: number) => number;

export interface GrassLayer {
  group: THREE.Group;
  material: THREE.ShaderMaterial & { light: THREE.DirectionalLight | null };
  update: (t: number, camPos: THREE.Vector3) => void;
  setViewDistance: (chunks: number) => void;
  setDensity: (scale: number) => void;
  setWireframe: (on: boolean) => void;
  chunkCount: () => number;
  dispose: () => void;
}

type ShaderMaterialWithLight = THREE.ShaderMaterial & { light: THREE.DirectionalLight | null };

const CHUNK = 16;
const DEFAULT_LOAD_RADIUS = 5;
const SEGS = 3;
const BUILD_BUDGET = 4;

const GRID_BASE = 80;
function gridFor(dist: number, density: number): number {
  return Math.max(8, Math.round((GRID_BASE * density) / (1.0 + dist * 0.28)));
}

function buildGroundTexture(): THREE.DataTexture {
  const TILE = 256;
  const SIZE = 512;
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      const wx = (i / (SIZE - 1)) * TILE;
      const wz = (j / (SIZE - 1)) * TILE;
      const g = grassAt(wx, wz);
      const o = (j * SIZE + i) * 4;
      data[o] = Math.round(g.r * 255);
      data[o + 1] = Math.round(g.g * 255);
      data[o + 2] = Math.round(g.b * 255);
      data[o + 3] = Math.round(g.mask * 255);
    }
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function loadTexture(url: string): THREE.Texture {
  const tex = new THREE.Texture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  new THREE.TextureLoader().load(url, (t) => {
    tex.image = t.image;
    tex.needsUpdate = true;
  });
  return tex;
}

const GROUND_TILE = 256;
const WIND_ST = new THREE.Vector4(1 / 128, 1 / 128, 0, 0);

export function createGrass(heightAt: HeightFn, shadowUniforms: ShadowFieldUniforms): GrassLayer {
  const group = new THREE.Group();
  const chunks = new Map<string, { mesh: THREE.InstancedMesh; grid: number }>();

  let loadRadius = DEFAULT_LOAD_RADIUS;
  let density = 1;

  const groundTex = buildGroundTexture();
  const atlas = new THREE.TextureLoader().load(plantSurfaceUrl);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  const windTex = loadTexture(windDistUrl);

  const dispTex = loadTexture(circleDispUrl);
  const dispTex2 = loadTexture(squareDispUrl);

  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    depthWrite: true,
    transparent: false,
    defines: { USE_INSTANCING: '', MEADOW_TEXTURE: '' },
    uniforms: {
      uTime: { value: 0 },
      uWindStrength: { value: 1.0 },
      uWindFrequency: { value: new THREE.Vector2(0.008, 0.008) },
      uWindDistMapST: { value: WIND_ST },
      uBladeHeight: { value: 0.85 },
      uBladeHeightRandom: { value: 0.3 },
      uBladeWidth: { value: 0.12 },
      uBladeWidthRandom: { value: 0.025 },
      uBladeForward: { value: 0.38 },
      uBladeCurve: { value: 2.0 },
      uBendRotationRandom: { value: 0.2 },
      uGrassMaskThreshold: { value: 0.08 },
      uDensityFloor: { value: 0.85 },
      uWidthDistanceGain: { value: 0.6 },
      uWindDistortionMap: { value: windTex },
      uGroundTexture: { value: groundTex },
      uAlbedoMap: { value: atlas },
      uGroundScale: { value: new THREE.Vector2(1 / GROUND_TILE, 1 / GROUND_TILE) },
      uSunDir: { value: new THREE.Vector3(0.45, 0.85, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(1.0, 0.97, 0.92) },
      uSunEnergy: { value: 1.0 },
      uSunRadiance: { value: 2.8 },

      uTranslucentGain: { value: 0.55 },

      ...iblUniforms,
      ...shadowUniforms,
    },
    vertexShader: grassVert,
    fragmentShader: resolveIncludes(grassFrag),
  });

  (mat as ShaderMaterialWithLight).light = null;

  function buildBladeGeometry(): THREE.BufferGeometry {
    const verts: number[] = [];
    const heights: number[] = [];
    const sides: number[] = [];
    const crosses: number[] = [];
    const idx: number[] = [];
    const rows = SEGS + 1;
    // Three ridged, curved blades per root; texture adds veins without a flat cutout.
    for (let c = 0; c < 3; c++) {
      const base = rows * 3 * c;
      for (let r = 0; r <= SEGS; r++) {
        const t = r / SEGS;
        for (const side of [-1, 0, 1]) {
          verts.push(side, t, 0); heights.push(t); sides.push(side); crosses.push(c);
        }
      }
      for (let r = 0; r < SEGS; r++) for (let column = 0; column < 2; column++) {
        const a = base + r * 3 + column, b = a + 1, cc = a + 3, d = cc + 1;
        idx.push(a, b, cc, b, d, cc);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    geo.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(sides), 1));
    geo.setAttribute('aHeight', new THREE.BufferAttribute(new Float32Array(heights), 1));
    geo.setAttribute('aCross', new THREE.BufferAttribute(new Float32Array(crosses), 1));
    geo.setIndex(idx);
    return geo;
  }

  const baseGeo = buildBladeGeometry();
  const dummy = new THREE.Object3D();

  function buildMesh(cx: number, cz: number, grid: number): THREE.InstancedMesh {
    const baseX = cx * CHUNK;
    const baseZ = cz * CHUNK;
    const count = grid * grid;
    const spacing = CHUNK / grid;

    const jx = (n: number) => ((Math.sin(n * 12.9898) * 43758.5453123) % 1 + 1) % 1 - 0.5;

    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const meadowScales = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const col = i % grid;
      const row = (i / grid) | 0;
      const gx = baseX + (col + jx(i * 7.3)) * spacing;
      const gz = baseZ + (row + jx(i * 2.1)) * spacing;
      positions[i * 3] = gx;
      positions[i * 3 + 1] = heightAt(gx, gz);
      positions[i * 3 + 2] = gz;
      seeds[i] = jx(i * 3.3) + 0.5;
      meadowScales[i] = meadowGrassScale(gx, gz);
    }

    const chunkGeo = baseGeo.clone();
    const mesh = new THREE.InstancedMesh(chunkGeo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) {
      dummy.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    chunkGeo.setAttribute('aMeadowScale', new THREE.InstancedBufferAttribute(meadowScales, 1));
    chunkGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    return mesh;
  }

  function update(t: number, camPos: THREE.Vector3) {
    mat.uniforms.uTime.value = t;

    const L = (mat as unknown as ShaderMaterialWithLight).light;
    if (L && L.isDirectionalLight) {
      mat.uniforms.uSunDir.value.copy(L.position).normalize();
      mat.uniforms.uSunColor.value.copy(L.color);
      mat.uniforms.uSunEnergy.value = L.intensity;
    }

    const ccx = Math.floor(camPos.x / CHUNK);
    const ccz = Math.floor(camPos.z / CHUNK);
    const wanted = new Set<string>();
    const missing: Array<{ cx: number; cz: number; key: string; dist: number }> = [];
    for (let dz = -loadRadius; dz <= loadRadius; dz++) {
      for (let dx = -loadRadius; dx <= loadRadius; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dz));
        const k = ccx + dx + ',' + (ccz + dz);
        wanted.add(k);
        if (chunks.get(k)?.grid !== gridFor(dist, density)) missing.push({ cx: ccx + dx, cz: ccz + dz, key: k, dist });
      }
    }
    // Building every missing chunk at once stalls for seconds after a view-distance
    // or density change, so fill in nearest-first over a few frames instead.
    missing.sort((a, b) => a.dist - b.dist);
    for (const m of missing.slice(0, BUILD_BUDGET)) {
      const grid = gridFor(m.dist, density);
      const mesh = buildMesh(m.cx, m.cz, grid);
      const previous = chunks.get(m.key);
      if (previous) {
        group.remove(previous.mesh);
        previous.mesh.dispose();
        previous.mesh.geometry.dispose();
      }
      chunks.set(m.key, { mesh, grid });
      group.add(mesh);
    }
    for (const [k, ch] of chunks) {
      if (!wanted.has(k)) {
        group.remove(ch.mesh);
        ch.mesh.dispose();
        ch.mesh.geometry.dispose();
        chunks.delete(k);
      }
    }
  }

  function dropChunks() {
    for (const [, ch] of chunks) {
      group.remove(ch.mesh);
      ch.mesh.dispose();
      ch.mesh.geometry.dispose();
    }
    chunks.clear();
  }

  return {
    group,
    material: mat as unknown as ShaderMaterialWithLight,
    update,
    setViewDistance(next) {
      const radius = Math.max(1, Math.round(next));
      if (radius === loadRadius) return;
      loadRadius = radius;
    },
    setDensity(scale) {
      const next = Math.max(0.05, scale);
      if (Math.abs(next - density) < 1e-4) return;
      density = next;
      dropChunks();
    },
    setWireframe(on) {
      mat.wireframe = on;
    },
    chunkCount() {
      return chunks.size;
    },
    dispose() {
      mat.dispose();
      baseGeo.dispose();
      groundTex.dispose();
      atlas.dispose();
      windTex.dispose();
      dispTex.dispose();
      dispTex2.dispose();
      for (const [, ch] of chunks) {
        ch.mesh.dispose();
        ch.mesh.geometry.dispose();
      }
    },
  };
}
