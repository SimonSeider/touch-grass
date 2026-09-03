import * as THREE from 'three';
import particlesVert from './shaders/particles/particles.vert.glsl?raw';
import particlesFrag from './shaders/particles/particles.frag.glsl?raw';

export interface ParticleLayer {
  points: THREE.Points;
  scene: THREE.Scene;
  update: (t: number, camPos: THREE.Vector3, sunDir: THREE.Vector3, sunColor: THREE.Color) => void;
  setDepthTexture: (texture: THREE.Texture, near: number, far: number) => void;
  setSize: (width: number, height: number, pixelRatio: number) => void;
  setRadiance: (radiance: number) => void;
  dispose: () => void;
}

const COUNT = 1600;
const SPREAD = 60;
const HEIGHT = 16;

export function createParticles(): ParticleLayer {
  const positions = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT);
  const sizes = new Float32Array(COUNT);
  const fall = new Float32Array(COUNT);

  function place(i: number, camPos: THREE.Vector3, top: boolean) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * SPREAD;
    positions[i * 3] = camPos.x + Math.cos(a) * r;
    positions[i * 3 + 1] = camPos.y + (top ? HEIGHT * 0.5 : (Math.random() - 0.5) * HEIGHT);
    positions[i * 3 + 2] = camPos.z + Math.sin(a) * r;
    seeds[i] = Math.random();

    sizes[i] = 0.35 + Math.pow(Math.random(), 2.5) * 1.5;
    fall[i] = 0.25 + Math.random() * 0.55;
  }

  const origin = new THREE.Vector3();
  for (let i = 0; i < COUNT; i++) place(i, origin, false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aScale', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uFadeNear: { value: parseFloat((SPREAD * 0.55).toFixed(1)) },
      uFadeFar: { value: parseFloat((SPREAD * 0.98).toFixed(1)) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 0.97, 0.92) },
      uSunEnergy: { value: 1 },
      uRadiance: { value: 3.0 },
      tSceneDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.1 },
      uFar: { value: 4000 },
    },
    vertexShader: particlesVert,
    fragmentShader: particlesFrag,
    transparent: true,
    depthWrite: false,
    depthTest: false,

    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  const scene = new THREE.Scene();
  scene.add(points);

  let last = 0;

  return {
    points,
    scene,
    setDepthTexture(texture, near, far) {
      mat.uniforms.tSceneDepth.value = texture;
      mat.uniforms.uNear.value = near;
      mat.uniforms.uFar.value = far;
    },
    setSize(width, height, pixelRatio) {
      mat.uniforms.uResolution.value.set(width, height);
      mat.uniforms.uPixelRatio.value = pixelRatio;
    },
    setRadiance(radiance) {
      mat.uniforms.uRadiance.value = radiance;
    },
    update(t, camPos, sunDir, sunColor) {
      const dt = Math.min(Math.max(t - last, 0), 0.05);
      last = t;

      mat.uniforms.uTime.value = t;
      mat.uniforms.uSunDir.value.copy(sunDir);
      mat.uniforms.uSunColor.value.copy(sunColor);

      mat.uniforms.uSunEnergy.value = THREE.MathUtils.smoothstep(sunDir.y, -0.02, 0.22);

      const p = geo.attributes.position as THREE.BufferAttribute;
      let respawned = false;

      const windX = 0.55 + Math.sin(t * 0.21) * 0.35;
      const windZ = 0.18 + Math.cos(t * 0.17) * 0.30;

      for (let i = 0; i < COUNT; i++) {
        const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
        const dx = px - camPos.x, dz = pz - camPos.z, dy = py - camPos.y;
        if (dx * dx + dz * dz > SPREAD * SPREAD || dy < -HEIGHT * 0.5) {

          place(i, camPos, dy < -HEIGHT * 0.5);
          respawned = true;
          continue;
        }
        const s = seeds[i];

        const swirl = t * (0.6 + s * 0.9) + s * 31.0;
        p.setX(i, px + (windX + Math.cos(swirl) * 0.35) * dt);
        p.setY(i, py + (-fall[i] * 0.45 + Math.sin(swirl * 1.3) * 0.18) * dt);
        p.setZ(i, pz + (windZ + Math.sin(swirl * 0.8) * 0.35) * dt);
      }
      p.needsUpdate = true;
      if (respawned) {
        geo.attributes.aScale.needsUpdate = true;
        geo.attributes.aSeed.needsUpdate = true;
      }
    },
    dispose() {
      mat.dispose();
      geo.dispose();
    },
  };
}
