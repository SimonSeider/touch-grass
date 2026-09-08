import { meadowAt } from './meadow';
import { heightAt, noise2 } from './terrain';
import { nightAmount } from './daynight';

export interface SoundEnvironment {
  x: number;
  z: number;
  sunY: number;
  sunX: number;
  time: number;
  rightX: number;
  rightZ: number;
}

const smooth = (lo: number, hi: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

// Fixed world-space emitters mean turning or returning to a patch sounds consistent.
export function sampleSoundHabitat(x: number, z: number) {
  let beeStrength = 0, beeX = x, beeZ = z;
  const cellX = Math.floor(x / 6), cellZ = Math.floor(z / 6);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const px = (cellX + dx + 0.5) * 6, pz = (cellZ + dz + 0.5) * 6;
    const patch = meadowAt(px, pz);
    if (patch.clover > 0.65 || patch.flowers < 0.61) continue;
    const h = heightAt(px, pz);
    if (Math.hypot(heightAt(px + 0.5, pz) - h, heightAt(px, pz + 0.5) - h) > 0.36) continue;
    const strength = (1 - smooth(1, 11, Math.hypot(px - x, pz - z))) * smooth(0.61, 0.76, patch.flowers);
    if (strength > beeStrength) { beeStrength = strength; beeX = px; beeZ = pz; }
  }
  const ground = heightAt(x, z);
  const surroundings = (heightAt(x + 14, z) + heightAt(x - 14, z) + heightAt(x, z + 14) + heightAt(x, z - 14)) / 4;
  const exposure = smooth(-0.7, 0.7, ground - surroundings);
  const clover = meadowAt(x, z).clover;
  const birdHabitat = noise2(x * 0.025 + 181, z * 0.025 - 53);
  return { beeStrength, beeX, beeZ, exposure, clover, birdHabitat };
}

export function soundscapeMix(environment: SoundEnvironment, habitat: ReturnType<typeof sampleSoundHabitat>) {
  const { sunY, sunX, time, x, z, rightX, rightZ } = environment;
  const night = nightAmount(sunY);
  const daylight = smooth(-0.03, 0.18, sunY);
  const dawn = (1 - smooth(0.12, 0.6, sunY)) * daylight * smooth(-0.1, 0.3, sunX);
  const dusk = (1 - smooth(0.12, 0.5, sunY)) * daylight * (1 - smooth(-0.3, 0.1, sunX));
  const gust = 0.65 + Math.sin(time * 0.21) * 0.2 + Math.cos(time * 0.17) * 0.15;
  const dx = habitat.beeX - x, dz = habitat.beeZ - z;
  const beePan = Math.max(-0.85, Math.min(0.85, (dx * rightX + dz * rightZ) / Math.max(2, Math.hypot(dx, dz))));
  return {
    ambient: daylight * 0.65,
    night: night * (0.45 + habitat.clover * 0.3 + (1 - habitat.exposure) * 0.25),
    birds: daylight * (0.18 + dawn * 0.75 + dusk * 0.25) * (0.45 + habitat.birdHabitat * 0.55)
      * (0.72 + Math.sin(time * 0.095 + habitat.birdHabitat * 9) * 0.28),
    bees: habitat.beeStrength * smooth(0.08, 0.45, sunY),
    wind: (0.25 + habitat.exposure * 0.65) * gust * (1 - night * 0.2),
    beePan,
  };
}
