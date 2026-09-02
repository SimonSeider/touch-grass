import * as THREE from 'three';
import { LightProbeGenerator } from 'three/examples/jsm/lights/LightProbeGenerator.js';

const REFRESH_INTERVAL = 1.0;

const CUBE_SIZE = 32;

export const iblUniforms = {
  uSH: { value: Array.from({ length: 9 }, () => new THREE.Vector3()) },
};

export interface SkyProbe {
  update: (dt: number) => void;
  dispose: () => void;
}

export function createSkyProbe(
  renderer: THREE.WebGLRenderer,
  probeScene: THREE.Scene,
): SkyProbe {
  const cubeTarget = new THREE.WebGLCubeRenderTarget(CUBE_SIZE, {

    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  cubeTarget.texture.colorSpace = THREE.NoColorSpace;

  const cubeCam = new THREE.CubeCamera(1, 6000, cubeTarget);

  const target = Array.from({ length: 9 }, () => new THREE.Vector3());
  const live = iblUniforms.uSH.value;

  let timer = REFRESH_INTERVAL;
  let inFlight = false;
  let primed = false;
  let disposed = false;

  async function shoot() {
    inFlight = true;
    try {
      cubeCam.update(renderer, probeScene);
      const probe = await LightProbeGenerator.fromCubeRenderTarget(renderer, cubeTarget);
      if (disposed) return;
      for (let i = 0; i < 9; i++) target[i].copy(probe.sh.coefficients[i]);
      if (!primed) {

        for (let i = 0; i < 9; i++) live[i].copy(target[i]);
        primed = true;
      }
    } finally {
      inFlight = false;
    }
  }

  return {
    update(dt: number) {
      timer += dt;
      if (timer >= REFRESH_INTERVAL && !inFlight) {
        timer = 0;
        void shoot();
      }

      const k = 1 - Math.exp(-dt * 3.0);
      for (let i = 0; i < 9; i++) live[i].lerp(target[i], k);
    },

    dispose() {
      disposed = true;
      cubeTarget.dispose();
    },
  };
}
