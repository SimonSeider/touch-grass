import * as THREE from 'three';
import { resolveIncludes } from './shaderlib';
import skyDomeVert from './shaders/sky/sky_dome.vert.glsl?raw';
import skyDomeFrag from './shaders/sky/sky_dome.frag.glsl?raw';
import starsVert from './shaders/sky/stars.vert.glsl?raw';
import starsFrag from './shaders/sky/stars.frag.glsl?raw';
import sunVert from './shaders/sky/sun.vert.glsl?raw';
import sunFrag from './shaders/sky/sun.frag.glsl?raw';
import probeGroundVert from './shaders/sky/probe_ground.vert.glsl?raw';
import probeGroundFrag from './shaders/sky/probe_ground.frag.glsl?raw';
import moonUrl from './textures/moon.png?url';

// NOTE: the data in ./data/stars.dat is made by https://simbad.u-strasbg.fr/simbad/sim-fid from Hipparcos data for J2025 epoch and the data in it is not owned by Laminar Research, yes, I know it's from X-Plane.
// I'm sorry Austin Meyer for using "Resources/default data/earth_astro.dat"
import starsDat from './data/stars.dat?raw';

export interface SkyLayer {
  group: THREE.Group;

  probeScene: THREE.Scene;
  update: (dt: number, t: number, camPos: THREE.Vector3, sunDir: THREE.Vector3) => void;
  setHaze: (haze: number) => void;
  setProbeSunRadiance: (v: number) => void;
}

const RADIUS = 3000;

function parseStarCatalog(datText: string, sphereRadius: number){
  // NOTE: This can only parse X-Plane earth_astro.dat files (only tested with X-Plane 12 files)
  const lines = datText.split('\n');
  const positions = [];
  const magnitudes = [];

  for(let line of lines){
    line = line.trim();
    if(!line || line.startsWith('#') || line.startsWith('740'))
        continue;

    const parts = line.split(/\s+/);
    if(parts.length < 3)
        continue;

    const raHours = parseFloat(parts[0]);
    const decDeg = parseFloat(parts[1]);
    const mag = parseFloat(parts[2]);

    const raRad = raHours * (Math.PI / 12);
    const decRad = decDeg * (Math.PI / 180);

    const x = sphereRadius * Math.cos(decRad) * Math.cos(raRad);
    const y = sphereRadius * Math.sin(decRad);
    const z = sphereRadius * Math.cos(decRad) * Math.sin(raRad);

    positions.push(x, y, z);
    magnitudes.push(mag);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aMag', new THREE.Float32BufferAttribute(magnitudes, 1));

  return geometry;
}

export function createSky(): SkyLayer {
  const group = new THREE.Group();

  const textureLoader = new THREE.TextureLoader();

  const moonTexture = textureLoader.load(moonUrl);

  const starGeo = parseStarCatalog(starsDat, 1000);
  const starMaterial = new THREE.ShaderMaterial({
      vertexShader: starsVert,
      fragmentShader: starsFrag,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
  });
  const starPoints = new THREE.Points(starGeo, starMaterial);
  group.add(starPoints);

  const domeGeo = new THREE.SphereGeometry(RADIUS, 64, 32);
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(120, 200, 80).normalize() },
      uHaze: { value: 0.65 },
      uTime: { value: 0 },
      uMoon: { value: moonTexture },
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
      const sunAngle = Math.atan2(sunDir.y, sunDir.x);
      const lstRadians = sunAngle + Math.PI;
      const latitudeDeg = 90.0;
      starPoints.rotation.order = 'ZYX';
      starPoints.rotation.y = THREE.MathUtils.degToRad(latitudeDeg);
      starPoints.rotation.x = -lstRadians;
      //starPoints.visible = sunDir.y < 0.1;
      starPoints.updateMatrix();
      starPoints.updateMatrixWorld(true);
      domeMat.uniforms.uTime.value = _t;
      domeMat.uniforms.uSunDir.value.copy(sunDir);
      probeGroundMat.uniforms.uSunDir.value.copy(sunDir);
      sunMat.uniforms.uSunDir.value.copy(sunDir);
      tmpDir.copy(sunDir);
      sunMesh.position.copy(tmpDir).multiplyScalar(RADIUS * 0.96);
      sunMesh.lookAt(camPos);
      sunMesh.visible = sunDir.y > -0.04;
    },
  };
}
