import * as THREE from 'three';
import { resolveIncludes } from './shaderlib';
import skyDomeVert from './shaders/sky/sky_dome.vert.glsl?raw';
import skyDomeFrag from './shaders/sky/sky_dome.frag.glsl?raw';
import sunVert from './shaders/sky/sun.vert.glsl?raw';
import sunFrag from './shaders/sky/sun.frag.glsl?raw';
import probeGroundVert from './shaders/sky/probe_ground.vert.glsl?raw';
import probeGroundFrag from './shaders/sky/probe_ground.frag.glsl?raw';

export interface SkyLayer {
  group: THREE.Group;

  probeScene: THREE.Scene;
  update: (dt: number, t: number, camPos: THREE.Vector3, sunDir: THREE.Vector3) => void;
  setHaze: (haze: number) => void;
  setProbeSunRadiance: (v: number) => void;
}

const RADIUS = 3000;

export function createSky(): SkyLayer {
  const group = new THREE.Group();

  const domeGeo = new THREE.SphereGeometry(RADIUS, 64, 32);
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(120, 200, 80).normalize() },
      uHaze: { value: 0.65 },
    },
    vertexShader: skyDomeVert,
    fragmentShader: resolveIncludes(skyDomeFrag),
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.frustumCulled = false;
  group.add(dome);

  const sunGeo = new THREE.CircleGeometry(46, 64);
  const sunMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(120, 200, 80).normalize() },
    },
    vertexShader: sunVert,
    fragmentShader: resolveIncludes(sunFrag),
  });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  sunMesh.frustumCulled = false;
  group.add(sunMesh);

  const probeScene = new THREE.Scene();
  const probeDome = new THREE.Mesh(domeGeo, domeMat);
  probeDome.frustumCulled = false;
  probeScene.add(probeDome);

  const probeGroundMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(120, 200, 80).normalize() },

      uAlbedo: { value: new THREE.Vector3(0.105, 0.215, 0.058) },
      uSunRadiance: { value: 3.0 },
    },
    vertexShader: probeGroundVert,
    fragmentShader: resolveIncludes(probeGroundFrag),
  });

  const probeGround = new THREE.Mesh(new THREE.CircleGeometry(2800, 32), probeGroundMat);
  probeGround.rotation.x = -Math.PI / 2;
  probeGround.position.y = -1;
  probeGround.frustumCulled = false;
  probeGround.renderOrder = 1;
  probeScene.add(probeGround);

  const tmpDir = new THREE.Vector3();
  return {
    group,
    probeScene,
    setProbeSunRadiance(v: number) {
      probeGroundMat.uniforms.uSunRadiance.value = v;
    },
    setHaze(haze: number) {
      domeMat.uniforms.uHaze.value = haze;
    },
    update(_dt: number, _t: number, camPos: THREE.Vector3, sunDir: THREE.Vector3) {
      group.position.copy(camPos);
      domeMat.uniforms.uSunDir.value.copy(sunDir);
      probeGroundMat.uniforms.uSunDir.value.copy(sunDir);
      sunMat.uniforms.uSunDir.value.copy(sunDir);
      tmpDir.copy(sunDir);
      sunMesh.position.copy(tmpDir).multiplyScalar(RADIUS * 0.96);
      sunMesh.lookAt(camPos);
    },
  };
}
