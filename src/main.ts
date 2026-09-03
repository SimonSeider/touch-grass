import * as THREE from 'three';
import { createSky } from './sky';
import { createTerrain } from './terrain';
import { createGrass } from './grass';
import { createPlayer } from './player';
import { createParticles } from './particles';
import { createAudio } from './audio';
import { createPostprocessing, type PostSetup } from './postprocessing';
import { sunTint, sunEnergy } from './skymath';
import { createSkyProbe, iblUniforms } from './skyprobe';
import { RENDER_PARAMS } from './rendermode';
import { createUi } from './ui';
import type { Settings } from './settings';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 4000);

const SUN_DIST = 500;
const SUN_SPEED = 0.025;
const sun = new THREE.DirectionalLight(0xfff2d0, 3.2);
scene.add(sun);
scene.add(sun.target);

const sunDir = new THREE.Vector3(120, 200, 80).normalize();
const sunColor = new THREE.Color(0xffe9c0);

const sky = createSky();
scene.add(sky.group);

const skyProbe = createSkyProbe(renderer, sky.probeScene);

const terrainLayer = createTerrain();
scene.add(terrainLayer.group);
terrainLayer.material.light = sun;

const grassLayer = createGrass(terrainLayer.heightAt, terrainLayer.shadowUniforms);
scene.add(grassLayer.group);
grassLayer.material.light = sun;

// Composited by its own pass after fog and clouds, so it stays out of the main scene.
const particles = createParticles();

const player = createPlayer(camera, terrainLayer.heightAt);

const audio = createAudio();

const cloudCfg = { sunDir, sunColor: sunColor.clone(), sunEnergy: 1 };
let post: PostSetup | null = null;

function applyRenderParams() {
  const m = RENDER_PARAMS;

  sky.setProbeSunRadiance(m.sunRadiance);

  const t = terrainLayer.material.uniforms;
  t.uSunRadiance.value = m.sunRadiance;
  t.uRim.value = m.rim;

  const g = grassLayer.material.uniforms;
  g.uSunRadiance.value = m.grassSunRadiance;

  particles.setRadiance(m.sunRadiance);

  sky.setHaze(m.haze);
  post?.setParams(m);
}

async function initPost() {
  post = await createPostprocessing(renderer, scene, camera, cloudCfg, terrainLayer.shadowUniforms, particles);

  post.setParams(RENDER_PARAMS);
  post.setSize(window.innerWidth, window.innerHeight);
  applySettings(ui.settings);
}

function renderDirect() {
  renderer.render(scene, camera);
}

applyRenderParams();
initPost();

player.lock();

function startAudioOnce() {
  audio.start(1.6);
  window.removeEventListener('pointerdown', startAudioOnce);
  window.removeEventListener('keydown', startAudioOnce);
}
window.addEventListener('pointerdown', startAudioOnce);
window.addEventListener('keydown', startAudioOnce);

let menuBlur = 0;

let pixelRatio = -1;

function applyResolutionScale(scale: number) {
  const next = Math.min(window.devicePixelRatio, 2) * scale;
  if (Math.abs(next - pixelRatio) < 1e-3) return;
  pixelRatio = next;
  renderer.setPixelRatio(next);
  renderer.setSize(window.innerWidth, window.innerHeight);
  post?.setSize(window.innerWidth, window.innerHeight);
}

function applySettings(s: Settings) {
  const g = s.graphics;
  applyResolutionScale(g.resolutionScale);
  grassLayer.setViewDistance(g.viewDistance);
  grassLayer.setDensity(g.grassDensity);
  grassLayer.setWireframe(s.debug.wireframe);
  terrainLayer.material.wireframe = s.debug.wireframe;
  particles.points.visible = g.particles;

  RENDER_PARAMS.bloom = g.bloom;
  RENDER_PARAMS.fogDensity = g.fogDensity;
  RENDER_PARAMS.haze = g.haze;
  RENDER_PARAMS.cloudCoverageLow = g.cloudCoverage;
  RENDER_PARAMS.cloudCoverageHigh = Math.min(1, g.cloudCoverage + 0.2);
  RENDER_PARAMS.cloudDensity = g.cloudDensity;
  RENDER_PARAMS.saturation = g.saturation;
  RENDER_PARAMS.contrast = g.contrast;
  RENDER_PARAMS.warmth = g.warmth;
  RENDER_PARAMS.vignette = g.vignette;
  RENDER_PARAMS.chroma = g.chroma;
  RENDER_PARAMS.autoExposure = s.camera.autoExposure;
  RENDER_PARAMS.exposureCompensation = s.camera.exposureCompensation;
  applyRenderParams();

  if (camera.fov !== s.camera.fov) {
    camera.fov = s.camera.fov;
    camera.updateProjectionMatrix();
  }

  post?.setSSAO(g.ssao);
  post?.setShutterSpeed(1 / s.camera.shutterDenominator);
  post?.setAperture(s.camera.aperture);
  if (!s.camera.autoExposure) post?.setISO(s.camera.iso);

  player.setTuning(s.gameplay);

  audio.setMasterVolume(s.audio.master / 100);
  audio.setMusicVolume(s.audio.music / 100);
  audio.setSfxVolume(s.audio.sfx / 100);
  audio.setMuted(s.audio.muteUnfocused && !document.hasFocus());
}

const ui = createUi({
  apply: applySettings,
  onOpenChange: (open) => {
    player.setPaused(open);
    if (open) {
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      player.lock();
    }
  },
});
const settings = ui.settings;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    e.preventDefault();
    ui.toggle();
  }
});

function updateFocusMute() {
  audio.setMuted(settings.audio.muteUnfocused && !document.hasFocus());
}
window.addEventListener('blur', updateFocusMute);
window.addEventListener('focus', updateFocusMute);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  pixelRatio = -1;
  applyResolutionScale(settings.graphics.resolutionScale);
});

const clock = new THREE.Clock();
let sunTime = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  player.update(dt);
  audio.update(dt, player.isWalking());
  ui.tick(dt);

  if (!settings.debug.freezeSun) sunTime += dt;
  const az = sunTime * SUN_SPEED;
  const el = settings.debug.freezeSun
    ? settings.debug.sunElevation
    : 0.15 + (0.5 + 0.5 * Math.sin(sunTime * SUN_SPEED * 1.4)) * 0.35;
  sunDir.set(Math.cos(az), Math.sin(el), Math.sin(az) * 0.85).normalize();
  sun.position.copy(sunDir).multiplyScalar(SUN_DIST);
  sun.target.position.set(0, 0, 0);

  sunTint(sunDir.y, sunColor);
  sun.color.copy(sunColor);

  sun.intensity = sunEnergy(sunDir.y);
  cloudCfg.sunColor.copy(sunColor);
  cloudCfg.sunEnergy = sun.intensity;

  sky.update(dt, t, camera.position, sunDir);

  skyProbe.update(dt);
  grassLayer.update(t, camera.position);
  terrainLayer.update(camera.position);
  particles.update(t, camera.position, sunDir, sunColor);

  const blurTarget = ui.isOpen() && settings.debug.pauseBlur ? 1 : 0;
  if (menuBlur !== blurTarget) {

    const k = 1 - Math.exp(-dt / 0.09);
    menuBlur += (blurTarget - menuBlur) * k;
    if (Math.abs(blurTarget - menuBlur) < 0.002) menuBlur = blurTarget;
  }
  if (post) {
    post.setPauseBlur(menuBlur);
    post.render(t, dt);
  } else {
    renderDirect();
  }
}
animate();
