import * as THREE from 'three';

function sat(x: number): number {
  return Math.min(Math.max(x, 0), 1);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = sat((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const NOON = new THREE.Color(1.0, 0.98, 0.94);
const GOLD = new THREE.Color(1.0, 0.76, 0.47);
const EMBER = new THREE.Color(1.0, 0.44, 0.22);

export function sunTint(sunY: number, out = new THREE.Color()): THREE.Color {
  const h = sat(sunY);
  out.copy(GOLD).lerp(NOON, smoothstep(0.10, 0.46, h));
  out.lerp(EMBER, 1 - smoothstep(0.005, 0.13, h));
  return out;
}

export function sunEnergy(sunY: number): number {
  return smoothstep(-0.04, 0.20, sunY);
}
