import * as THREE from 'three';
import { resolveIncludes } from './shaderlib';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import genCommonVert from './shaders/clouds/cloudgen_common.vert.glsl?raw';
import genBaseCloudFrag from './shaders/clouds/cloudgen_basecloud.frag.glsl?raw';
import genWorleyFrag from './shaders/clouds/cloudgen_worley.frag.glsl?raw';
import cloudsPassVert from './shaders/clouds/clouds_pass.vert.glsl?raw';
import cloudsPassFrag from './shaders/clouds/clouds_pass.frag.glsl?raw';

export interface CloudTextures {
  cloud: THREE.Texture;
  worley: THREE.Texture;
}

function bake3D(renderer: THREE.WebGLRenderer, frag: string, side: number): THREE.Texture {
  const camera = new THREE.Camera();
  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: genCommonVert,
    fragmentShader: frag,
    uniforms: {
      uZCoord: { value: 0 },
      size: { value: side },
    },
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);

  const target = new THREE.WebGL3DRenderTarget(side, side, side);
  target.depthBuffer = false;
  target.texture.format = THREE.RGBAFormat;
  target.texture.minFilter = THREE.LinearFilter;
  target.texture.magFilter = THREE.LinearFilter;
  target.texture.type = THREE.UnsignedByteType;
  target.texture.needsUpdate = true;

  for (let i = 0; i < side; i++) {
    material.uniforms.uZCoord.value = i;
    renderer.setRenderTarget(target, i);
    renderer.render(mesh, camera);
  }
  renderer.setRenderTarget(null);

  material.dispose();
  mesh.geometry.dispose();
  return target.texture;
}

export function createCloudTextures(renderer: THREE.WebGLRenderer): CloudTextures {
  const cloud = bake3D(renderer, genBaseCloudFrag, 128);
  const worley = bake3D(renderer, genWorleyFrag, 64);
  return { cloud, worley };
}

export interface CloudPassLayer {
  pass: ShaderPass;
  update: (camera: THREE.PerspectiveCamera, camPos: THREE.Vector3, sunDir: THREE.Vector3, sunCol: THREE.Color, depthTex: THREE.Texture) => void;
  setTime: (t: number) => void;
  dispose: () => void;
}

export function createCloudPass(textures: CloudTextures, near: number, far: number): CloudPassLayer {
  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: cloudsPassVert,
    fragmentShader: resolveIncludes(cloudsPassFrag),
    uniforms: {
      uTime: { value: 0 },
      tDiffuse: { value: null },
      tDepth: { value: null },
      cloud: { value: textures.cloud },
      worley: { value: textures.worley },
      cameraPos: { value: new THREE.Vector3() },
      inverseProjection: { value: new THREE.Matrix4() },
      inverseView: { value: new THREE.Matrix4() },
      sunDir: { value: new THREE.Vector3(120, 200, 80).normalize() },
      sunColor: { value: new THREE.Color(0xffe9c0) },
      near: { value: near },
      far: { value: far },
      uCoverageLow: { value: 0.58 },
      uCoverageHigh: { value: 0.90 },
      uDensityGain: { value: 1.9 },
      uErosion: { value: 0.42 },
      uLightAbsorb: { value: 0.004 },
    },
    depthTest: false,
    depthWrite: false,
  });

  const pass = new ShaderPass(material);

  return {
    pass,
    update(camera, camPos, sunDir, sunCol, depthTex) {
      material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      material.uniforms.inverseView.value.copy(camera.matrixWorld);
      material.uniforms.cameraPos.value.copy(camPos);
      material.uniforms.sunDir.value.copy(sunDir);
      material.uniforms.sunColor.value.copy(sunCol);
      material.uniforms.tDepth.value = depthTex;
    },
    setTime(t) {
      material.uniforms.uTime.value = t;
    },
    dispose() {
      material.dispose();
    },
  };
}
