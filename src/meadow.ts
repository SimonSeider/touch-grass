import { noise2 } from './terrain';

// World-space fields keep patches continuous across chunk boundaries and reloads.
export function meadowAt(x: number, z: number) {
  return {
    flowers: noise2(x * 0.085 + 41, z * 0.085 - 17),
    clover: noise2(x * 0.13 - 73, z * 0.13 + 29),
    seeds: noise2(x * 0.055 + 13, z * 0.055 + 87),
  };
}

export function meadowGrassScale(x: number, z: number): number {
  const clover = noise2(x * 0.13 - 73, z * 0.13 + 29);
  const t = Math.min(1, Math.max(0, (clover - 0.58) / 0.18));
  return 1 - t * t * (3 - 2 * t) * 0.4;
}
