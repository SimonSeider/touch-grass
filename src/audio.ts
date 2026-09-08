import musicUrl from './audio/Music/Gallery_Six.mp3';
import walkingUrl from './audio/sounds/walking.mp3';
import nightUrl from './audio/sounds/night-crickets.mp3';
import birdsUrl from './audio/sounds/isolated-blackbird.mp3';
import beesUrl from './audio/sounds/single-bee.mp3';
import windUrl from './audio/sounds/clean-wind.mp3';
import { sampleSoundHabitat, soundscapeMix, type SoundEnvironment } from './soundscape';

export interface AudioLayer {
  start: (transitionSec: number) => void;
  update: (dt: number, walking: boolean, environment: SoundEnvironment) => void;
  setMasterVolume: (v: number) => void;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  setMuted: (muted: boolean) => void;
  dispose: () => void;
}

const TRACKS = {
  music: { url: musicUrl, volume: 0.5 },
  walk: { url: walkingUrl, volume: 0.32 },
  night: { url: nightUrl, volume: 0.32 },
  birds: { url: birdsUrl, volume: 0.55 },
  bees: { url: beesUrl, volume: 0.16 },
  wind: { url: windUrl, volume: 0.4 },
};
type TrackName = keyof typeof TRACKS;
type Track = { el: HTMLAudioElement; gain?: GainNode; panner?: StereoPannerNode; pending: boolean; target: number };
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function createAudio(): AudioLayer {
  let started = false, disposed = false, walkingActive = false;
  let masterVol = 1, musicVol = 1, sfxVol = 1, muted = false;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let habitat: ReturnType<typeof sampleSoundHabitat> | null = null;
  let habitatAge = 1, sampledX = Infinity, sampledZ = Infinity;
  let fadeAge = 0, fadeDuration = 1.6;
  let beeCooldown = 8;
  let mix = { ambient: 0, night: 0, birds: 0, bees: 0, wind: 0, beePan: 0 };
  const tracks = new Map<TrackName, Track>();

  function volume(name: TrackName) {
    return muted ? 0 : TRACKS[name].volume * masterVol * (name === 'music' ? musicVol : sfxVol)
      * (name === 'music' || name === 'walk' ? 1 : mix[name]);
  }

  function applyGains() {
    for (const [name, track] of tracks) {
      const target = volume(name);
      if (track.gain && Math.abs(track.target - target) > 0.0005) {
        track.gain.gain.setTargetAtTime(target, track.gain.context.currentTime, 0.65);
      }
      track.target = target;
      if (muted) track.el.volume = track.gain ? 1 : 0;
    }
  }

  function play(track: Track) {
    if (track.pending || !track.el.paused) return;
    track.pending = true;
    void track.el.play().catch(() => {
      // A later user gesture retries playback if the browser blocked it.
    }).finally(() => { track.pending = false; });
  }

  function resumeOnGesture() {
    if (!started || disposed) return;
    if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
    for (const [name, track] of tracks) if (name !== 'bees' && (name !== 'walk' || walkingActive)) play(track);
  }
  window.addEventListener('pointerdown', resumeOnGesture);
  window.addEventListener('keydown', resumeOnGesture);

  function setupWebAudio() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
      const entrance = ctx.createGain(); entrance.gain.value = 0;
      entrance.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeDuration); entrance.connect(master);
      const convolver = ctx.createConvolver();
      const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 2.4), ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
      }
      convolver.buffer = impulse;
      const wet = ctx.createGain(); wet.gain.value = 0.08; convolver.connect(wet); wet.connect(entrance);
      for (const [name, track] of tracks) {
        const source = ctx.createMediaElementSource(track.el);
        track.gain = ctx.createGain(); track.gain.gain.value = volume(name); track.target = volume(name);
        source.connect(track.gain);
        if (name === 'bees' && typeof ctx.createStereoPanner === 'function') {
          track.panner = ctx.createStereoPanner(); track.panner.pan.value = mix.beePan;
          track.gain.connect(track.panner); track.panner.connect(entrance);
        } else { track.gain.connect(entrance); }
        if (name !== 'bees') track.gain.connect(convolver);
      }
      void ctx.resume().catch(() => {});
    } catch {
      if (ctx) void ctx.close().catch(() => {});
      ctx = null; master = null;
      // Media elements attached to a failed context cannot be reused for fallback.
      for (const [name, track] of tracks) {
        track.el.pause(); track.el.removeAttribute('src'); track.el.load();
        track.el = new Audio(TRACKS[name].url); track.el.loop = name !== 'bees'; track.el.preload = 'auto';
        track.gain = undefined; track.panner = undefined;
      }
    }
  }

  function start(transitionSec = 1.6) {
    if (started || disposed) return;
    started = true; fadeDuration = Math.max(0.1, transitionSec);
    for (const name of Object.keys(TRACKS) as TrackName[]) {
      const el = new Audio(TRACKS[name].url); el.loop = name !== 'bees'; el.preload = 'auto';
      tracks.set(name, { el, pending: false, target: volume(name) });
    }
    setupWebAudio();
    for (const [name, track] of tracks) {
      track.el.volume = ctx ? 1 : 0;
      if (name !== 'walk' && name !== 'bees') play(track);
    }
  }

  function update(dt: number, isWalking: boolean, environment: SoundEnvironment) {
    if (disposed) return;
    walkingActive = isWalking;
    habitatAge += dt;
    if (!habitat || habitatAge >= 0.2 || Math.hypot(environment.x - sampledX, environment.z - sampledZ) > 3) {
      habitat = sampleSoundHabitat(environment.x, environment.z);
      sampledX = environment.x; sampledZ = environment.z; habitatAge = 0;
    }
    mix = soundscapeMix(environment, habitat);
    if (!started) return;
    applyGains();
    const beePan = tracks.get('bees')?.panner;
    if (beePan) beePan.pan.setTargetAtTime(mix.beePan, beePan.context.currentTime, 0.3);
    fadeAge += dt;
    if (!ctx) {
      for (const track of tracks.values()) {
        const target = track.target * Math.min(1, fadeAge / fadeDuration);
        track.el.volume = muted ? 0 : clamp(track.el.volume + (target - track.el.volume) * (1 - Math.exp(-dt / 0.65)));
      }
    }
    const bee = tracks.get('bees');
    if (bee) {
      const audible = !muted && masterVol > 0 && sfxVol > 0 && mix.bees > 0.12;
      if (audible) beeCooldown = Math.max(0, beeCooldown - dt);
      if (audible && beeCooldown === 0 && bee.el.paused && !bee.pending) {
        bee.el.currentTime = 0;
        play(bee);
        beeCooldown = 22 + Math.random() * 18;
      }
      // End an encounter after its fade when the player leaves, mutes, or night falls.
      if ((!audible && mix.bees < 0.01) || muted || masterVol === 0 || sfxVol === 0) {
        bee.el.pause();
        beeCooldown = Math.max(beeCooldown, 8);
      }
    }
    const walk = tracks.get('walk');
    if (walk) {
      if (walkingActive) play(walk);
      else if (!walk.el.paused) walk.el.pause();
    }
  }

  return {
    start, update,
    setMasterVolume(v) { masterVol = clamp(v); applyGains(); },
    setMusicVolume(v) { musicVol = clamp(v); applyGains(); },
    setSfxVolume(v) { sfxVol = clamp(v); applyGains(); },
    setMuted(value) {
      muted = value;
      if (master && ctx) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
      }
      applyGains();
    },
    dispose() {
      disposed = true;
      window.removeEventListener('pointerdown', resumeOnGesture); window.removeEventListener('keydown', resumeOnGesture);
      for (const track of tracks.values()) { track.el.pause(); track.el.removeAttribute('src'); track.el.load(); }
      tracks.clear(); if (ctx) void ctx.close().catch(() => {});
    },
  };
}
