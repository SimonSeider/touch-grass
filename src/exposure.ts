export function ev100FromCamera(fStop: number, shutterSpeed: number, iso: number): number {
  return Math.log2(((fStop * fStop) / shutterSpeed) * (100 / iso));
}

export function exposureFromEv100(ev100: number): number {
  return 1 / (1.2 * Math.pow(2, ev100));
}

export function ev100FromLuminance(lum: number): number {
  return Math.log2(Math.max(lum, 1e-5) * (100 / 12.5));
}

export const SUNNY_16_EV100 = ev100FromCamera(16, 1 / 125, 100);

export const NITS_PER_SCENE_UNIT = 10000;

export function sceneExposureFromEv100(ev100: number): number {
  return exposureFromEv100(ev100) * NITS_PER_SCENE_UNIT;
}

export interface ExposureState {

  ev100: number;
}

export function adaptEv100(state: ExposureState, targetEv100: number, dt: number): number {
  const speed = targetEv100 > state.ev100 ? 2.2 : 0.9;
  const k = 1 - Math.exp(-dt * speed);
  state.ev100 += (targetEv100 - state.ev100) * k;
  return state.ev100;
}
