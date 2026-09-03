import * as THREE from 'three';
import { createCloudPass, createCloudTextures } from './clouds';
import { createVolumetricFog } from './volumetricfog';
import postGradeVert from './shaders/postprocessing/post_grade.vert.glsl?raw';
import postGradeFrag from './shaders/postprocessing/post_grade.frag.glsl?raw';
import lensVert from './shaders/postprocessing/lensflare.vert.glsl?raw';
import lensFrag from './shaders/postprocessing/lensflare.frag.glsl?raw';
import blurFrag from './shaders/postprocessing/post_blur.frag.glsl?raw';
import { LuminanceMeter } from './metering';
import {
  SUNNY_16_EV100,
  NITS_PER_SCENE_UNIT,
  ev100FromLuminance,
  sceneExposureFromEv100,
  adaptEv100,
  ev100FromCamera,
  type ExposureState,
} from './exposure';
import type { RenderParams } from './rendermode';
import type { ShadowFieldUniforms } from './terrain';

export interface PostSetup {
  render: (time: number, dt: number) => void;
  updateClouds: (camera: THREE.PerspectiveCamera, camPos: THREE.Vector3, sunDir: THREE.Vector3, sunCol: THREE.Color) => void;
  setSize: (width: number, height: number) => void;

  setPauseBlur: (amount: number) => void;
  setParams: (m: RenderParams) => void;

  setShutterSpeed: (s: number) => void;
  setAperture: (a: number) => void;
  setISO: (i: number) => void;
  setAutoExposure: (a: boolean) => void;

  exposureInfo: () => { exposure: number; ev100: number; luminance: number };
  dispose: () => void;
}

export async function createPostprocessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  cloudCfg: { sunDir: THREE.Vector3; sunColor: THREE.Color; sunEnergy: number },
  shadowUniforms: ShadowFieldUniforms,
): Promise<PostSetup> {
  const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
  const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js');
  const { SSAOPass } = await import('three/addons/postprocessing/SSAOPass.js');
  const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');
  const { Pass, FullScreenQuad } = await import('three/addons/postprocessing/Pass.js');
  const { ShaderPass } = await import('three/addons/postprocessing/ShaderPass.js');

  const cloudTextures = createCloudTextures(renderer);

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const depthTexture = new THREE.DepthTexture(size.width, size.height);
  depthTexture.type = THREE.FloatType;
  depthTexture.minFilter = THREE.NearestFilter;
  depthTexture.magFilter = THREE.NearestFilter;
  const depthTarget = new THREE.WebGLRenderTarget(size.width, size.height, {

    type: THREE.HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
    depthTexture,
  });

  const composer = new EffectComposer(renderer);
  composer.renderToScreen = true;

  composer.addPass(new RenderPass(scene, camera));

  const ssaoPass = new SSAOPass(scene, camera, size.width, size.height);
  ssaoPass.kernelRadius = 8;
  ssaoPass.minDistance = 0.002;
  ssaoPass.maxDistance = 0.03;
  composer.addPass(ssaoPass);

  const fogLayer = createVolumetricFog(ShaderPass, shadowUniforms);
  composer.addPass(fogLayer.pass);

  const cloudLayer = createCloudPass(cloudTextures, camera.near, camera.far);
  composer.addPass(cloudLayer.pass);

  const meterQuad = new FullScreenQuad();
  const meter = new LuminanceMeter(renderer, meterQuad);
  const meterPass = new Pass();
  meterPass.needsSwap = false;
  meterPass.render = (_renderer, _writeBuffer, readBuffer) => {
    if (autoExposure) meter.measure(readBuffer.texture);
  };
  composer.addPass(meterPass);

  const sunScreen = new THREE.Vector2(0.5, 0.7);
  const lensMat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: lensVert,
    fragmentShader: lensFrag,
    uniforms: {
      tDiffuse: { value: null },
      uSunScreen: { value: sunScreen },
      uSunVisible: { value: 0 },
      uFlareColor: { value: new THREE.Color(1.0, 0.82, 0.55) },
    },
    depthTest: false,
    depthWrite: false,
  });
  const lensPass = new ShaderPass(lensMat);
  composer.addPass(lensPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.24,
    0.75,
    0.9,
  );
  composer.addPass(bloomPass);

  const texel = new THREE.Vector2(1 / size.width, 1 / size.height);
  function makeBlurPass(direction: THREE.Vector2) {
    return new ShaderPass(new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: direction },
        uRadius: { value: 0 },
        uDim: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: postGradeVert,
      fragmentShader: blurFrag,
      depthTest: false,
      depthWrite: false,
    }));
  }
  const blurH = makeBlurPass(new THREE.Vector2(texel.x, 0));
  const blurV = makeBlurPass(new THREE.Vector2(0, texel.y));
  blurH.enabled = false;
  blurV.enabled = false;
  composer.addPass(blurH);
  composer.addPass(blurV);

  let pauseBlur = 0;
  const MAX_BLUR_TEXELS = 34;

  const gradePass = new ShaderPass(new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: depthTexture },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uTime: { value: 0 },
      uExposure: { value: 0.26 },
      uVignette: { value: 0.30 },
      uContrast: { value: 1.06 },
      uSaturation: { value: 1.06 },
      uWarmth: { value: 0.10 },
      uChroma: { value: 0.0035 },
      uAspect: { value: size.width / size.height },

      uReadNoise: { value: 0.002 * (100.0 / 100.0) },
      uShotNoise: { value: 0.01 * Math.sqrt((100.0 / 100.0) / Math.max((0.008 / (16.0 * 16.0)), 0.0001))},

      uShadowTint: { value: new THREE.Color(0.88, 0.95, 1.06) },
      uHighlightTint: { value: new THREE.Color(1.05, 1.00, 0.92) }, 
    },
    vertexShader: postGradeVert,
    fragmentShader: postGradeFrag,
  }));

  composer.addPass(gradePass);

  let autoExposure = true;
  let manualExposure = 0.26;
  let compensation = 0;

  let shutterSpeed = 0.008;
  let aperture = 16;
  let ISO = 100;
  
  const exposureState: ExposureState = { ev100: SUNNY_16_EV100 };

  const render = (time: number, dt: number) => {
    cloudLayer.setTime(time);
    fogLayer.setTime(time);
    gradePass.uniforms.uTime.value = time;

    if (autoExposure) {
      const targetEv = ev100FromLuminance(meter.luminance * NITS_PER_SCENE_UNIT) - compensation;
      const ev = adaptEv100(exposureState, targetEv, Math.min(dt, 0.1));
      gradePass.uniforms.uExposure.value = sceneExposureFromEv100(ev);

      const physicalEv100AtIso100 = ev100FromCamera(aperture, shutterSpeed, 100);
      ISO = Math.max(100.0, 100.0 * Math.pow(2, physicalEv100AtIso100 - ev));
    } else {
      gradePass.uniforms.uExposure.value = sceneExposureFromEv100(ev100FromCamera(aperture, shutterSpeed, ISO) * Math.pow(2, compensation));
    }

    const sensorLight = (shutterSpeed / (aperture * aperture));
    const ISOGain = ISO / 100.0;

    gradePass.uniforms.uReadNoise.value = 0.00005 * ISOGain; 
    gradePass.uniforms.uShotNoise.value = 0.0005 * Math.sqrt(ISOGain / Math.max(sensorLight, 0.001));

    renderer.setRenderTarget(depthTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    cloudLayer.update(camera, camera.position, cloudCfg.sunDir, cloudCfg.sunColor, depthTexture);
    fogLayer.update(camera, camera.position, cloudCfg.sunDir, cloudCfg.sunColor, cloudCfg.sunEnergy, depthTexture);

    const sunWorld = camera.position.clone().addScaledVector(cloudCfg.sunDir, 3000);
    camera.updateMatrixWorld();
    const clip = sunWorld.clone().project(camera);
    const inFront = clip.z < 1.0 && clip.z > -1.0;
    sunScreen.set(clip.x * 0.5 + 0.5, clip.y * 0.5 + 0.5);
    lensMat.uniforms.uSunScreen.value = sunScreen;
    lensMat.uniforms.uSunVisible.value = inFront ? 1 : 0;

    composer.render();
  };

  return {
    render,
    updateClouds(camera, camPos, sunDir, sunCol) {
      cloudLayer.update(camera, camPos, sunDir, sunCol, depthTexture);
    },
    setSize(width, height) {
      depthTarget.setSize(width, height);
      composer.setSize(width, height);
      ssaoPass.setSize(width, height);
      bloomPass.setSize(width, height);
      const dpr = renderer.getPixelRatio();
      blurH.uniforms.uDirection.value.set(1 / (width * dpr), 0);
      blurV.uniforms.uDirection.value.set(0, 1 / (height * dpr));
      gradePass.uniforms.uAspect.value = width / height;
    },
    exposureInfo() {
      return {
        exposure: gradePass.uniforms.uExposure.value as number,
        ev100: exposureState.ev100,
        luminance: meter.luminance,
      };
    },
    setShutterSpeed(s: number){
      shutterSpeed = Number(s);
    },
    setAperture(a: number){
      aperture = Number(a);
    },
    setISO(i: number){
      ISO = Number(i);
    },
    setAutoExposure(a: boolean){
      autoExposure = a;
    },
    setParams(m) {
      fogLayer.setParams(m);
      bloomPass.strength = m.bloom;
      autoExposure = m.autoExposure;
      manualExposure = m.exposure;
      compensation = m.exposureCompensation;
      const g = gradePass.uniforms;
      g.uSaturation.value = m.saturation;
      g.uContrast.value = m.contrast;
      g.uWarmth.value = m.warmth;
      g.uVignette.value = m.vignette;
      //g.uGrain.value = m.grain;
      g.uChroma.value = m.chroma;
      const c = cloudLayer.pass.material.uniforms;
      c.uCoverageLow.value = m.cloudCoverageLow;
      c.uCoverageHigh.value = m.cloudCoverageHigh;
      c.uDensityGain.value = m.cloudDensity;
      c.uErosion.value = m.cloudErosion;
      c.uLightAbsorb.value = m.cloudLightAbsorb;
    },
    setPauseBlur(amount) {
      pauseBlur = THREE.MathUtils.clamp(amount, 0, 1);

      const on = pauseBlur > 0.001;
      blurH.enabled = on;
      blurV.enabled = on;
      if (!on) return;

      const radius = MAX_BLUR_TEXELS * Math.pow(pauseBlur, 0.6);
      blurH.uniforms.uRadius.value = radius;
      blurV.uniforms.uRadius.value = radius;
      blurH.uniforms.uDim.value = 0;
      blurV.uniforms.uDim.value = pauseBlur;
    },
    dispose() {
      composer.dispose();
      depthTarget.dispose();
      cloudLayer.dispose();
      fogLayer.dispose();
      meter.dispose();
      meterQuad.dispose();
    },
  };
}
