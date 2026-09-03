import * as THREE from 'three';
import type { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { resolveIncludes } from './shaderlib';
import fogVert from './shaders/clouds/clouds_pass.vert.glsl?raw';
import fogFrag from './shaders/postprocessing/volumetric_fog.frag.glsl?raw';
import type { ShadowFieldUniforms } from './terrain';
import type { RenderParams } from './rendermode';

export interface VolumetricFogLayer {
  pass: ShaderPass;
  update: (
    camera: THREE.PerspectiveCamera,
    camPos: THREE.Vector3,
    sunDir: THREE.Vector3,
    sunCol: THREE.Color,
    sunEnergy: number,
    depthTex: THREE.Texture,
  ) => void;
  setTime: (t: number) => void;
  setParams: (m: RenderParams) => void;
  dispose: () => void;
}

export function createVolumetricFog(
  ShaderPassCtor: typeof ShaderPass,
  shadowUniforms: ShadowFieldUniforms,
): VolumetricFogLayer {
  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: fogVert,
    fragmentShader: resolveIncludes(fogFrag),
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: null },
      cameraPos: { value: new THREE.Vector3() },
      inverseProjection: { value: new THREE.Matrix4() },
      inverseView: { value: new THREE.Matrix4() },
      uSunDir: { value: new THREE.Vector3(120, 200, 80).normalize() },
      uSunColor: { value: new THREE.Color(0xffe9c0) },
      uSunEnergy: { value: 1 },
      uTime: { value: 0 },

      uFogDensity: { value: 0.030 },
      uFogHeightFalloff: { value: 0.045 },
      uFogBaseHeight: { value: -6.0 },
      uFogFloor: { value: 0.006 },
      uFogStart: { value: 20.0 },
      uFogFade: { value: 40.0 },
      uFogScatter: { value: 2.2 },
      uFogAmbient: { value: 1.0 },
      uFogAnisotropy: { value: 0.6 },
      uFogNoise: { value: 0.35 },
      uFogMaxDistance: { value: 600.0 },

      ...shadowUniforms,
    },
    depthTest: false,
    depthWrite: false,
  });

  const pass = new ShaderPassCtor(material);

  return {
    pass,
    update(camera, camPos, sunDir, sunCol, sunEnergy, depthTex) {
      const u = material.uniforms;
      u.inverseProjection.value.copy(camera.projectionMatrixInverse);
      u.inverseView.value.copy(camera.matrixWorld);
      u.cameraPos.value.copy(camPos);
      u.uSunDir.value.copy(sunDir);
      u.uSunColor.value.copy(sunCol);
      u.uSunEnergy.value = sunEnergy;
      u.tDepth.value = depthTex;
    },
    setTime(t) {
      material.uniforms.uTime.value = t;
    },
    setParams(m) {
      const u = material.uniforms;
      u.uFogDensity.value = m.fogDensity;
      u.uFogHeightFalloff.value = m.fogHeightFalloff;
      u.uFogBaseHeight.value = m.fogBaseHeight;
      u.uFogFloor.value = m.fogFloor;
      u.uFogStart.value = m.fogStart;
      u.uFogFade.value = m.fogFade;
      u.uFogScatter.value = m.fogScatter;
      u.uFogAmbient.value = m.fogAmbient;
      u.uFogAnisotropy.value = m.fogAnisotropy;
      u.uFogNoise.value = m.fogNoise;
      u.uFogMaxDistance.value = m.fogMaxDistance;
    },
    dispose() {
      material.dispose();
    },
  };
}
