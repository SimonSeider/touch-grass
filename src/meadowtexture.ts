import * as THREE from 'three';
import meadowPlantsUrl from './textures/meadow-plants.png?url';

export function loadMeadowTexture() {
  const texture = new THREE.TextureLoader().load(meadowPlantsUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
