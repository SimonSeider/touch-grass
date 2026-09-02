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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe3d2, 260, 1500);
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

const particles = createParticles();
scene.add(particles.points);

const player = createPlayer(camera, terrainLayer.heightAt);

const audio = createAudio();

const cloudCfg = { sunDir, sunColor: sunColor.clone() };
let post: PostSetup | null = null;

function applyRenderParams() {
  const m = RENDER_PARAMS;

  sky.setProbeSunRadiance(m.sunRadiance);

  const t = terrainLayer.material.uniforms;
  t.uSunRadiance.value = m.sunRadiance;
  t.uRim.value = m.rim;
  t.uFogDensity.value = m.fogDensity;

  const g = grassLayer.material.uniforms;
  g.uSunRadiance.value = m.grassSunRadiance;
  g.uFogDensity.value = m.fogDensity;

  sky.setHaze(m.haze);
  post?.setParams(m);
}

async function initPost() {
  post = await createPostprocessing(renderer, scene, camera, cloudCfg);

  post.setParams(RENDER_PARAMS);
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

const menuEl = document.getElementById('menu') as HTMLDivElement;
const musicSlider = document.getElementById('musicVol') as HTMLInputElement;
const sfxSlider = document.getElementById('sfxVol') as HTMLInputElement;
const musicPct = document.getElementById('musicPct') as HTMLElement;
const sfxPct = document.getElementById('sfxPct') as HTMLElement;

const shutterSpeedSlider = document.getElementById('shutterSpeedVal') as HTMLInputElement;
const apertureSlider = document.getElementById('apertureVal') as HTMLInputElement;
const ISOSlider = document.getElementById('ISOVal') as HTMLInputElement;
const shutterSpeedPct = document.getElementById('shutterSpeed') as HTMLElement;
const aperturePct = document.getElementById('aperture') as HTMLElement;
const ISOPct = document.getElementById('ISO') as HTMLElement;

const autoExposureToggle = document.getElementById('AutoExposureToggle') as HTMLInputElement;

let menuOpen = false;

let menuBlur = 0;

function setMenu(open: boolean) {
  menuOpen = open;
  player.setPaused(open);
  menuEl.classList.toggle('open', open);
  if (open) {
    if (document.pointerLockElement) document.exitPointerLock();
  } else {
    player.lock();
  }
}

function updateSliderFill(el: HTMLInputElement) {
  const min = Number(el.min || 0);
  const max = Number(el.max || 100);
  const pct = max > min ? ((Number(el.value) - min) / (max - min)) * 100 : 0;
  el.style.setProperty('--fill', pct.toFixed(2) + '%');
}

// I'm sorry Simon
/*function bindSlider(el: HTMLInputElement, label: HTMLElement, apply: (v: number) => void) {
  const update = () => {
    const v = Number(el.value) / 100;
    label.textContent = Math.round(v * 100) + '%';
    updateSliderFill(el);
    apply(v);
  };
  el.addEventListener('input', update);
  el.addEventListener('change', update);
  update();
}*/

interface SliderOptions {
  transform?: (raw: number) => number;
  format?: (val: number, raw: number) => string;
}

function bindSlider(el: HTMLInputElement, label: HTMLElement, apply: (v: number) => void, options: SliderOptions = {}){
  const {
    transform = (raw) => raw,
    format = (v) => `${v}`,
  } = options;

  const update = () => {
    const raw = Number(el.value);
    const val = transform(raw);
    label.textContent = format(val, raw);
    updateSliderFill(el);
    apply(val);
  };

  el.addEventListener('input', update);
  update();
}

function bindToggle(el: HTMLInputElement, apply: (v: boolean) => void){
  const update = () => {
    apply(el.checked);
  };

  el.addEventListener('change', update);
  update();
}

bindSlider(musicSlider, musicPct, (v) => audio.setMusicVolume(v), {
  transform: (raw) => raw / 100,
  format: (_, raw) => `${Math.round(raw)}%`,
});

bindSlider(sfxSlider, sfxPct, (v) => audio.setSfxVolume(v), {
  transform: (raw) => raw / 100,
  format: (_, raw) => `${Math.round(raw)}%`,
});

audio.setMusicVolume(0.5);
audio.setSfxVolume(0.5);

bindSlider(shutterSpeedSlider, shutterSpeedPct,
  (s) => {
    if(post !== null)
        post.setShutterSpeed(s);
  },
  {
    transform: (raw) => 1 / raw,
    format: (_, raw) => (raw >= 1 ? `1/${raw}s` : `${(1 / raw).toFixed(1)}s`),
  });

bindSlider(apertureSlider, aperturePct,
  (a) => {
    if(post !== null)
        post.setAperture(a);
  },
  {
    transform: (raw) => raw,
    format: (val) => `f/${val.toFixed(1)}`,
  });

bindSlider(ISOSlider, ISOPct,
  (i) => {
    if(post !== null)
        post.setISO(i);
  },
  {
    transform: (raw) => raw,
    format: (val) => `${val}`,
  });

bindToggle(autoExposureToggle,
  (c) => {
    menuEl.classList.toggle('auto-exposure', c);
    if(post !== null)
        post.setAutoExposure(c);
  })

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    e.preventDefault();
    setMenu(!menuOpen);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (post) post.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  player.update(dt);
  audio.update(dt, player.isWalking());

  const az = t * SUN_SPEED;
  const el = 0.15 + (0.5 + 0.5 * Math.sin(t * SUN_SPEED * 1.4)) * 0.35;
  sunDir.set(Math.cos(az), Math.sin(el), Math.sin(az) * 0.85).normalize();
  sun.position.copy(sunDir).multiplyScalar(SUN_DIST);
  sun.target.position.set(0, 0, 0);

  sunTint(sunDir.y, sunColor);
  sun.color.copy(sunColor);

  sun.intensity = sunEnergy(sunDir.y);
  cloudCfg.sunColor.copy(sunColor);

  sky.update(dt, t, camera.position, sunDir);

  skyProbe.update(dt);
  grassLayer.update(t, camera.position);
  terrainLayer.update(camera.position);
  particles.update(t, camera.position, sunDir, sunColor);

  const blurTarget = menuOpen ? 1 : 0;
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
