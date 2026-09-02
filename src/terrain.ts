import * as THREE from 'three';
import { resolveIncludes } from './shaderlib';
import toonVert from './shaders/terrain/toon.vert.glsl?raw';
import toonFrag from './shaders/terrain/toon.frag.glsl?raw';
import { iblUniforms } from './skyprobe';

function hash2(x: number, y: number): number {
  let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function noise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbm(x: number, y: number): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 5; i++) {
    value += amp * noise2(x * freq, y * freq);
    amp *= 0.5;
    freq *= 2.06;
  }
  return value;
}

export function heightAt(x: number, z: number): number {
  const big = fbm(x * 0.006 + 100, z * 0.006 + 100);
  const mid = fbm(x * 0.03, z * 0.03);
  const ridge = fbm(x * 0.05, z * 0.05);
  let h = big * 26 + mid * 6 + ridge * 2.5;
  h -= 8;
  return h;
}

export function grassAt(x: number, z: number): { r: number; g: number; b: number; mask: number } {
  const detail = fbm(x * 0.35, z * 0.35);
  const patch = detail - 0.5;

  let r = 0.105 + patch * 0.042;
  let g = 0.215 + patch * 0.032;
  let b = 0.058 + patch * 0.014;

  if (heightAt(x, z) < -2) { r += 0.018; g += 0.011; }
  const hband = smoothstep(Math.abs(heightAt(x, z)) / 40.0);
  r += hband * 0.032; g += hband * 0.011; b -= hband * 0.021;

  const e = 1.2;
  const slope = Math.min(Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e), 2.0);
  let mask = 1.0 - smoothstep(Math.min(Math.max((slope - 0.30) / 0.45, 0), 1));
  mask = Math.min(mask, 1.0 - smoothstep(Math.min(Math.max((Math.abs(heightAt(x, z)) - 12) / 16, 0), 1)));
  mask *= 0.68 + 0.32 * noise2(x * 0.04 + 31.7, z * 0.04 + 12.3);
  mask = Math.max(0.45, Math.min(1.0, mask));
  return { r, g, b, mask };
}

const CHUNK_SIZE = 120;
const RES = 96;
const LOAD_RADIUS = 2;

export interface ShadowFieldUniforms {
  uHeightMap: { value: THREE.DataTexture };
  uHeightMapCenter: { value: THREE.Vector2 };
  uHeightMapSpan: { value: number };
  uHeightMapRes: { value: number };
  uHeightRangeMin: { value: number };
  uHeightRangeMax: { value: number };
}

export interface TerrainLayer {
  group: THREE.Group;
  heightAt: (x: number, z: number) => number;
  update: (camPos: THREE.Vector3) => void;
  material: THREE.ShaderMaterial & { light: THREE.DirectionalLight | null };
  shadowUniforms: ShadowFieldUniforms;
}

type ShaderMaterialWithLight = THREE.ShaderMaterial & { light: THREE.DirectionalLight | null };

export function createTerrain(): TerrainLayer {
  const group = new THREE.Group();
  const chunks = new Map<string, THREE.Mesh>();

  const HM_RES = 256;
  const HM_SPAN = 6144;
  const HM_HEIGHT_MIN = -20;
  const HM_HEIGHT_MAX = 60;
  const HM_DATA = new Float32Array(HM_RES * HM_RES);
  const heightTex = new THREE.DataTexture(HM_DATA, HM_RES, HM_RES, THREE.RedFormat, THREE.FloatType);
  heightTex.minFilter = THREE.LinearFilter;
  heightTex.magFilter = THREE.LinearFilter;
  heightTex.wrapS = THREE.ClampToEdgeWrapping;
  heightTex.wrapT = THREE.ClampToEdgeWrapping;
  heightTex.needsUpdate = true;
  let heightCenter = new THREE.Vector2(NaN, NaN);

  function regenHeightField(cx: number, cz: number) {
    const half = HM_SPAN / 2;
    for (let j = 0; j < HM_RES; j++) {
      for (let i = 0; i < HM_RES; i++) {
        const wx = cx - half + (i / (HM_RES - 1)) * HM_SPAN;
        const wz = cz - half + (j / (HM_RES - 1)) * HM_SPAN;
        const h = heightAt(wx, wz);
        HM_DATA[j * HM_RES + i] = (h - HM_HEIGHT_MIN) / (HM_HEIGHT_MAX - HM_HEIGHT_MIN);
      }
    }
    heightTex.needsUpdate = true;
    heightCenter.set(cx, cz);
  }

  const shadowUniforms: ShadowFieldUniforms = {
    uHeightMap: { value: heightTex },
    uHeightMapCenter: { value: heightCenter },
    uHeightMapSpan: { value: HM_SPAN },
    uHeightMapRes: { value: HM_RES },
    uHeightRangeMin: { value: HM_HEIGHT_MIN },
    uHeightRangeMax: { value: HM_HEIGHT_MAX },
  };

  const mat = new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(120, 200, 80).normalize() },
      uSunColor: { value: new THREE.Color(1.0, 0.97, 0.92) },
      uSunEnergy: { value: 1.0 },

      uSunRadiance: { value: 3.0 },
      uRim: { value: 0.30 },
      uFogDensity: { value: 0.0016 },

      ...iblUniforms,
      ...shadowUniforms,
    },
    vertexShader: toonVert,
    fragmentShader: resolveIncludes(toonFrag),
  });
  (mat as ShaderMaterialWithLight).light = null;

  function buildChunk(cx: number, cz: number) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(RES * RES * 3);
    const colors = new Float32Array(RES * RES * 3);
    const idx = new Uint32Array((RES - 1) * (RES - 1) * 6);

    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    let p = 0;
    for (let j = 0; j < RES; j++) {
      for (let i = 0; i < RES; i++) {
        const gx = baseX + (i / (RES - 1)) * CHUNK_SIZE;
        const gz = baseZ + (j / (RES - 1)) * CHUNK_SIZE;
        const h = heightAt(gx, gz);
        positions[p] = gx;
        positions[p + 1] = h;
        positions[p + 2] = gz;

        const e = 1.5;
        const slope = Math.min(
          Math.hypot(heightAt(gx + e, gz) - heightAt(gx - e, gz), heightAt(gx, gz + e) - heightAt(gx, gz - e)) / (2 * e),
          2.5,
        );

        const detail = fbm(gx * 0.35, gz * 0.35);
        const patch = detail - 0.5;

        let r = 0.105, g = 0.215, b = 0.058;
        r += patch * 0.042;
        g += patch * 0.032;
        b += patch * 0.014;

        const rockT = smoothstep(Math.min(Math.max((slope - 0.28) / 0.42, 0), 1));
        const rockR = 0.205 + patch * 0.035;
        const rockG = 0.170 + patch * 0.028;
        const rockB = 0.128 - patch * 0.018;
        r = r + (rockR - r) * rockT;
        g = g + (rockG - g) * rockT;
        b = b + (rockB - b) * rockT;

        const dirtT = smoothstep(Math.min(Math.max((slope - 0.18) / 0.16, 0), 1)) * (1.0 - smoothstep(Math.min(Math.max((slope - 0.35) / 0.15, 0), 1)));
        r += dirtT * 0.035; g += dirtT * 0.007; b += dirtT * 0.014;

        if (h < -2) { r += 0.018; g += 0.011; }
        const hband = smoothstep(Math.abs(h) / 40.0);
        r += hband * 0.032; g += hband * 0.011; b -= hband * 0.021;

        colors[p] = r;
        colors[p + 1] = g;
        colors[p + 2] = b;
        p += 3;
      }
    }

    let k = 0;
    for (let j = 0; j < RES - 1; j++) {
      for (let i = 0; i < RES - 1; i++) {
        const a = j * RES + i;
        const b = j * RES + i + 1;
        const c = (j + 1) * RES + i;
        const d = (j + 1) * RES + i + 1;
        idx[k++] = a; idx[k++] = c; idx[k++] = b;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, mat);
    return mesh;
  }

  function chunkKey(cx: number, cz: number) {
    return cx + ',' + cz;
  }

  function update(camPos: THREE.Vector3) {
    const L = (mat as unknown as ShaderMaterialWithLight).light;
    if (L && L.isDirectionalLight) {
      mat.uniforms.uSunDir.value.copy(L.position).normalize();
      mat.uniforms.uSunColor.value.copy(L.color);
      mat.uniforms.uSunEnergy.value = L.intensity;
    }

    if (heightCenter.x !== heightCenter.x || heightCenter.distanceTo(new THREE.Vector2(camPos.x, camPos.z)) > HM_SPAN / HM_RES) {
      regenHeightField(camPos.x, camPos.z);
    }

    const ccx = Math.floor(camPos.x / CHUNK_SIZE);
    const ccz = Math.floor(camPos.z / CHUNK_SIZE);

    const wanted = new Set<string>();
    for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
      for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
        const k = chunkKey(ccx + dx, ccz + dz);
        wanted.add(k);
        if (!chunks.has(k)) {
          const mesh = buildChunk(ccx + dx, ccz + dz);
          chunks.set(k, mesh);
          group.add(mesh);
        }
      }
    }
    for (const [k, mesh] of chunks) {
      if (!wanted.has(k)) {
        group.remove(mesh);
        mesh.geometry.dispose();
        chunks.delete(k);
      }
    }
  }

  return {
    group,
    heightAt,
    update,
    material: mat as unknown as ShaderMaterialWithLight,
    shadowUniforms,
  };
}
