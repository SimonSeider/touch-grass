import musicUrl from './audio/Music/Gallery_Six.mp3';
import ambientUrl from './audio/sounds/ambient.mp3';
import walkingUrl from './audio/sounds/walking.mp3';

export interface AudioLayer {
  start: (transitionSec: number) => void;
  update: (dt: number, walking: boolean) => void;
  setMasterVolume: (v: number) => void;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  setMuted: (muted: boolean) => void;
}

type Ctx = AudioContext;

export function createAudio(): AudioLayer {
  let started = false;
  let walking: HTMLAudioElement | null = null;

  let masterVol = 1;
  let musicVol = 1;
  let sfxVol = 1;
  let muted = false;
  const trackGains = new Map<string, GainNode | HTMLAudioElement>();

  const BASE_VOLUME: Record<string, number> = { music: 0.5, ambient: 0.55, walk: 0.32 };

  function busVolume(name: string): number {
    if (muted) return 0;
    return BASE_VOLUME[name] * masterVol * (name === 'music' ? musicVol : sfxVol);
  }

  function applyGains() {
    for (const name of Object.keys(BASE_VOLUME)) {
      const g = trackGains.get(name);
      if (!g) continue;
      const v = busVolume(name);
      if (g instanceof GainNode) g.gain.value = v;
      else g.volume = Math.max(0, Math.min(1, v));
    }
  }

  function makeImpulse(ctx: Ctx, seconds: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function makeSoundEl(url: string, baseVolume: number, loop: boolean): HTMLAudioElement {
    const el = new Audio(url);
    el.loop = loop;
    el.preload = 'auto';
    el.style.display = 'none';
    document.body.appendChild(el);
    void baseVolume;
    return el;
  }

  function setupWebAudio(transitionSec: number): boolean {
    const AC = (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as
      | typeof AudioContext
      | undefined;
    if (!AC) return false;
    try {
      const ctx = new AC() as Ctx;
      if (ctx.state === 'suspended') void ctx.resume();

      const now = ctx.currentTime;
      const duration = Math.max(0.5, transitionSec);

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(1, now + duration);
      master.connect(ctx.destination);

      const convolver = ctx.createConvolver();
      convolver.buffer = makeImpulse(ctx, 2.4, 3.0);
      convolver.normalize = true;

      const dry = ctx.createGain();
      const wet = ctx.createGain();
      dry.gain.setValueAtTime(0.25, now);
      dry.gain.linearRampToValueAtTime(1, now + duration);
      wet.gain.setValueAtTime(1.0, now);
      wet.gain.linearRampToValueAtTime(0.08, now + duration);
      dry.connect(master);
      wet.connect(master);

      const sounds: Array<{ el: HTMLAudioElement; vol: number; bus: 'music' | 'sfx'; name: string }> = [
        { el: makeSoundEl(musicUrl, 0.5, true), vol: 0.5, bus: 'music', name: 'music' },
        { el: makeSoundEl(ambientUrl, 0.55, true), vol: 0.55, bus: 'sfx', name: 'ambient' },
        { el: makeSoundEl(walkingUrl, 0.32, true), vol: 0.32, bus: 'sfx', name: 'walk' },
      ];

      sounds.forEach(({ el, vol, bus, name }) => {
        el.volume = 1;
        const src = ctx.createMediaElementSource(el);
        const g = ctx.createGain();
        g.gain.value = vol;
        trackGains.set(name, g);
        src.connect(g);
        g.connect(dry);
        g.connect(convolver);
      });
      convolver.connect(wet);

      walking = sounds[2].el;
      applyGains();
      sounds[0].el.play().catch(() => { });
      sounds[1].el.play().catch(() => { });
      return true;
    } catch {
      return false;
    }
  }

  function setupFallback(transitionSec: number) {
    const fadeIn = (el: HTMLAudioElement, name: string) => {
      el.volume = 0;
      el.play().catch(() => { });
      const start = performance.now();
      const step = () => {
        const p = Math.min(1, (performance.now() - start) / (transitionSec * 1000));
        el.volume = Math.max(0, Math.min(1, busVolume(name) * p));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const music = makeSoundEl(musicUrl, 0.5, true);
    const ambient = makeSoundEl(ambientUrl, 0.55, true);
    walking = makeSoundEl(walkingUrl, 0.32, true);
    trackGains.set('music', music);
    trackGains.set('ambient', ambient);
    trackGains.set('walk', walking);
    applyGains();
    fadeIn(music, 'music');
    fadeIn(ambient, 'ambient');
  }

  function start(transitionSec = 1.6) {
    if (started) return;
    started = true;
    if (!setupWebAudio(transitionSec)) setupFallback(transitionSec);
  }

  function update(_dt: number, walkingActive: boolean) {
    if (!started || !walking) return;
    if (walkingActive && walking.paused) {
      walking.play().catch(() => { });
    } else if (!walkingActive && !walking.paused) {
      walking.pause();
    }
  }

  function setMasterVolume(v: number) {
    masterVol = Math.max(0, Math.min(1, v));
    applyGains();
  }

  function setMusicVolume(v: number) {
    musicVol = Math.max(0, Math.min(1, v));
    applyGains();
  }

  function setSfxVolume(v: number) {
    sfxVol = Math.max(0, Math.min(1, v));
    applyGains();
  }

  function setMuted(value: boolean) {
    muted = value;
    applyGains();
  }

  return { start, update, setMasterVolume, setMusicVolume, setSfxVolume, setMuted };
}
