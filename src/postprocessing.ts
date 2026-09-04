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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** A scene composited on top of the fog and cloud passes, depth-tested against the prepass. */
export interface OverlayLayer {
  scene: THREE.Scene;
  setDepthTexture: (texture: THREE.Texture, near: number, far: number) => void;
  setSize: (width: number, height: number, pixelRatio: number) => void;
}

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
  setAutoISO: (a: boolean) => void;
  setAutoFocus: (a: boolean) => void;
  setFocusDistance: (f: number) => void;
  setFOV: (f: number) => void;
  setSSAO: (enabled: boolean) => void;

  exposureInfo: () => { exposure: number; ev100: number; luminance: number; iso: number };
  dispose: () => void;
}

export async function createPostprocessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  cloudCfg: { sunDir: THREE.Vector3; sunColor: THREE.Color; sunEnergy: number },
  shadowUniforms: ShadowFieldUniforms,
  overlay?: OverlayLayer,
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

  if (overlay) {
    overlay.setDepthTexture(depthTexture, camera.near, camera.far);
    overlay.setSize(size.width, size.height, renderer.getPixelRatio());
    const overlayPass = new Pass();
    overlayPass.needsSwap = false;
    overlayPass.render = (r, _writeBuffer, readBuffer) => {
      const autoClear = r.autoClear;
      r.autoClear = false;
      r.setRenderTarget(readBuffer);
      r.render(overlay.scene, camera);
      r.autoClear = autoClear;
    };
    composer.addPass(overlayPass);
  }

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
      tDepth: { value: depthTexture },
      uSunScreen: { value: sunScreen },
      uSunVisible: { value: 0 },
      uAspect: { value: size.width / size.height },
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

  const focusReadTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.FloatType,
      depthBuffer: false,
      stencilBuffer: false,
  });

  const focusReadMat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { tDepth: { value: depthTexture } },
    vertexShader: /* glsl */ `
      in vec3 position;
      void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tDepth;
      out vec4 outColor;
      void main() {
          float d = texture(tDepth, vec2(0.5)).r; // sample dead center
          outColor = vec4(d, d, d, 1.0);
      }
    `,
  });
  const focusReadQuad = new FullScreenQuad(focusReadMat);

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
      uFOV: { value: 72 },
      uFStop: { value: 16 },
      uFocusDistance: { value: 50 },
      uExposure: { value: 0.26 },
      uVignette: { value: 0.30 },
      uContrast: { value: 1.06 },
      uSaturation: { value: 1.06 },
      uWarmth: { value: 0.10 },
      uChroma: { value: 0.0035 },
      uAspect: { value: size.width / size.height },
      uWidth: { value: size.width },
      uHeight: { value: size.height },

      uReadNoise: { value: 0.002 * (100.0 / 100.0) },
      uShotNoise: { value: 0.01 * Math.sqrt((100.0 / 100.0) / Math.max((0.008 / (16.0 * 16.0)), 0.0001))},

      uShadowTint: { value: new THREE.Color(0.88, 0.95, 1.06) },
      uHighlightTint: { value: new THREE.Color(1.05, 1.00, 0.92) }, 
    },
    vertexShader: postGradeVert,
    fragmentShader: postGradeFrag,
  }));

  composer.addPass(gradePass);
  
  const FOCUS_READ_INTERVAL = 0.1;
  const FOCUS_PULL_SPEED = 3.0;
  const focusPixelBuffer = new Float32Array(4);

  const APERTURE_PULL_SPEED = 2.0;
  const SHUTTER_PULL_SPEED  = 2.0;
  
  const ISO_BRIGHTEN_SPEED  = 1.5;
  const ISO_DARKEN_SPEED    = 3.0;

  let focusReadTimer = 0;
  let currentFocusDistance = 50;
  let targetFocusDistance = 50;

  let currentAperture = 16;
  let targetAperture = 16;

  let currentShutterSpeed = 0.008;
  let targetShutterSpeed = 0.008;

  let currentISO = 100;
  let targetISO = 100;
  
  let focusDistance = 50;

  let autoExposure = true;
  let autoISO = true;
  let autoFocus = true;
  let manualExposure = 0.26;
  let compensation = 0;

  let shutterSpeed = 0.008;
  let aperture = 16;
  let ISO = 100;
  let FOV = 72;

  const exposureState: ExposureState = { ev100: SUNNY_16_EV100 };

  function linearizeDepth(d: number, near: number, far: number): number {
      const zNdc = d * 2.0 - 1.0;
      return (2.0 * near * far) / (far + near - zNdc * (far - near));
  }
  
  function sampleDepthAtCenter(): number {
      renderer.setRenderTarget(focusReadTarget);
      focusReadQuad.render(renderer);
      renderer.setRenderTarget(null);
      renderer.readRenderTargetPixels(focusReadTarget, 0, 0, 1, 1, focusPixelBuffer);
      return focusPixelBuffer[0];
  }

  function adaptValue(current: number, target: number, dt: number, brightenSpeed: number, darkenSpeed: number): number {
    const speed = target > current ? brightenSpeed : darkenSpeed;

    const alpha = 1.0 - Math.exp(-speed * dt);

    return current + (target - current) * alpha;
  } 

  const render = (time: number, dt: number) => {
    cloudLayer.setTime(time);
    fogLayer.setTime(time);
    gradePass.uniforms.uTime.value = time;
    
    if (autoExposure) {
      const targetEv = ev100FromLuminance(meter.luminance * NITS_PER_SCENE_UNIT) - compensation;
      const ev = adaptEv100(exposureState, targetEv, Math.min(dt, 0.1)); // this already smooths EV, keep it

      const evRatio = Math.pow(2, ev);

      targetAperture = Math.max(1.4, Math.min(16.0, Math.sqrt(Math.pow(2, ev * 0.5))));

      let targetShutter = (targetAperture * targetAperture) / evRatio;
      const minShutter = 1 / 8000;
      const maxShutter = 30.0;
      targetShutter = Math.max(minShutter, Math.min(maxShutter, targetShutter));
      targetShutterSpeed = targetShutter;

      const physicalEv100 = ev100FromCamera(targetAperture, targetShutter, 100);
      targetISO = physicalEv100 < ev ? Math.max(100.0, 100.0 * Math.pow(2, physicalEv100 - ev)) : 50.0;

      const clampedDt = Math.min(0.1, dt);
      currentAperture = adaptValue(currentAperture, targetAperture, clampedDt, APERTURE_PULL_SPEED, APERTURE_PULL_SPEED);
      currentShutterSpeed = adaptValue(currentShutterSpeed, targetShutterSpeed, clampedDt, SHUTTER_PULL_SPEED, SHUTTER_PULL_SPEED);
      currentISO = adaptValue(currentISO, targetISO, clampedDt, ISO_BRIGHTEN_SPEED, ISO_DARKEN_SPEED);

      aperture = currentAperture;
      shutterSpeed = currentShutterSpeed;
      ISO = currentISO;

      gradePass.uniforms.uExposure.value = sceneExposureFromEv100(ev100FromCamera(aperture, shutterSpeed, ISO) - compensation);
    }
    else if (autoISO) {
      const targetEv = ev100FromLuminance(meter.luminance * NITS_PER_SCENE_UNIT) - compensation;
      const ev = adaptEv100(exposureState, targetEv, Math.min(dt, 0.1));

      targetISO = Math.max(50.0, Math.min(12800.0, 100.0 * Math.pow(2, ev100FromCamera(aperture, shutterSpeed, 100) - ev) ));

      currentISO = adaptValue(currentISO, targetISO, Math.min(0.1, dt), ISO_BRIGHTEN_SPEED, ISO_DARKEN_SPEED);
      ISO = currentISO;

      gradePass.uniforms.uExposure.value = sceneExposureFromEv100(ev100FromCamera(aperture, shutterSpeed, ISO) - compensation);
    }
    else {
      gradePass.uniforms.uExposure.value = sceneExposureFromEv100(ev100FromCamera(aperture, shutterSpeed, ISO) - compensation);
    }

    const sensorLight = (shutterSpeed / (aperture * aperture));
    const ISOGain = ISO / 100.0;

    gradePass.uniforms.uReadNoise.value = 0.00007 * ISOGain; 
    gradePass.uniforms.uShotNoise.value = 0.00003 * Math.sqrt(ISOGain / Math.max(sensorLight, 0.001));

    gradePass.uniforms.uFOV.value = FOV;
    gradePass.uniforms.uFStop.value = aperture;
    
    focusReadTimer += dt;
    if(autoFocus){
      focusReadTimer += dt;
      if(focusReadTimer >= FOCUS_READ_INTERVAL){
        focusReadTimer = 0;
        const rawDepth = sampleDepthAtCenter();
        targetFocusDistance = linearizeDepth(rawDepth, camera.near, camera.far);
      }
      currentFocusDistance = adaptValue(currentFocusDistance, targetFocusDistance, Math.min(0.1, dt), FOCUS_PULL_SPEED, FOCUS_PULL_SPEED);
      gradePass.uniforms.uFocusDistance.value = currentFocusDistance;
    } else {
      gradePass.uniforms.uFocusDistance.value = focusDistance;
    }

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
    const edge = Math.max(Math.abs(clip.x), Math.abs(clip.y));
    lensMat.uniforms.uSunScreen.value = sunScreen;
    lensMat.uniforms.uSunVisible.value = inFront ? 1 - smoothstep(1.0, 1.6, edge) : 0;

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
      gradePass.uniforms.uWidth.value = width;
      gradePass.uniforms.uHeight.value = height;
      lensMat.uniforms.uAspect.value = width / height;
      overlay?.setSize(width * dpr, height * dpr, dpr);
    },
    exposureInfo() {
      return {
        exposure: gradePass.uniforms.uExposure.value as number,
        ev100: exposureState.ev100,
        luminance: meter.luminance,
        iso: ISO,
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
    setAutoISO(a: boolean){
      autoISO = a;
    },
    setAutoFocus(a: boolean){
      autoFocus = a;
    },
    setFocusDistance(f: number){
      focusDistance = f;
    },
    setFOV(f: number){
      FOV = f;
    },
    setSSAO(enabled: boolean){
      ssaoPass.enabled = enabled;
    },
    setParams(m) {
      fogLayer.setParams(m);
      bloomPass.strength = m.bloom;
      autoExposure = m.autoExposure;
      autoISO = m.autoISO;
      manualExposure = m.exposure;
      compensation = m.exposureCompensation;
      const g = gradePass.uniforms;
      g.uSaturation.value = m.saturation;
      g.uContrast.value = m.contrast;
      g.uWarmth.value = m.warmth;
      g.uVignette.value = m.vignette;
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
