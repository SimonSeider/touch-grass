attribute float aSide;
attribute float aHeight;
attribute float aCross;
attribute float aSeed;

uniform float uTime;
uniform float uWindStrength;
uniform vec2 uWindFrequency;
uniform vec4 uWindDistMapST;

uniform float uBladeHeight;
uniform float uBladeHeightRandom;
uniform float uBladeWidth;
uniform float uBladeWidthRandom;
uniform float uBladeForward;
uniform float uBladeCurve;
uniform float uBendRotationRandom;
uniform float uGrassMaskThreshold;
uniform float uDensityFloor;
uniform float uWidthDistanceGain;

uniform sampler2D uWindDistortionMap;
uniform sampler2D uGroundTexture;
uniform vec2 uGroundScale;

varying float vHeight;
varying float vMask;
varying vec3 vGroundColor;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vSeed;

float rand(float n) {
  return fract(sin(n + 1.0) * 43758.5453123);
}

mat3 rotateAxis(vec3 axis, float angle) {
  axis = normalize(axis);
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1.0 - c;
  return mat3(
    c + oc * axis.x * axis.x,        oc * axis.x * axis.y - s * axis.z,  oc * axis.x * axis.z + s * axis.y,
    oc * axis.x * axis.y + s * axis.z, c + oc * axis.y * axis.y,         oc * axis.y * axis.z - s * axis.x,
    oc * axis.x * axis.z - s * axis.y, oc * axis.y * axis.z + s * axis.x,  c + oc * axis.z * axis.z
  );
}

void main() {

  vec3 basePos = instanceMatrix[3].xyz;
  float seed = aSeed;

  float facing = rand(seed) * 6.2831853;
  float bend = (rand(seed + 1.0) * 2.0 - 1.0) * uBendRotationRandom * 3.14159265 * 0.5;
  float hRand = rand(seed + 2.0) * 2.0 - 1.0;
  float wRand = rand(seed + 3.0) * 2.0 - 1.0;
  float forward = rand(seed + 4.0) * uBladeForward;

  vec4 ground = texture2D(uGroundTexture, basePos.xz * uGroundScale);

  float density = mix(uDensityFloor, 1.0, ground.a);
  float alive = step(rand(seed + 5.0), density);

  float lush = mix(0.78, 1.0, ground.a);
  float heightFull = (uBladeHeight + hRand * uBladeHeightRandom) * lush;

  float camDist = distance(basePos, cameraPosition);
  float widthLod = 1.0 + smoothstep(10.0, 85.0, camDist) * uWidthDistanceGain;
  float widthFull = (uBladeWidth + wRand * uBladeWidthRandom) * widthLod;

  float height = heightFull * alive;
  float width = widthFull * alive;

  float t = aHeight;
  vec3 p = vec3(aSide * (1.0 - t) * width, t * height, pow(t, uBladeCurve) * forward);

  float fslope = uBladeCurve * pow(max(t, 1e-3), uBladeCurve - 1.0) * forward;
  vec3 n = vec3(0.0, -fslope, heightFull);

  if (aCross > 0.5) {
    p = vec3(p.z, p.y, -p.x);
    n = vec3(n.z, n.y, -n.x);
  }

  vec2 windUv = basePos.xz * uWindDistMapST.xy + uWindDistMapST.zw + uWindFrequency * uTime;
  vec2 windSample = (texture2D(uWindDistortionMap, windUv).xy * 2.0 - 1.0) * uWindStrength;
  vec3 windAxis = normalize(vec3(windSample.x, windSample.y, 1e-4));
  mat3 windRot = rotateAxis(windAxis, windSample.x * 3.14159265);

  mat3 facingRot = rotateAxis(vec3(0.0, 1.0, 0.0), facing);
  mat3 bendRot = rotateAxis(vec3(1.0, 0.0, 0.0), bend);

  mat3 m = windRot * facingRot * bendRot;

  vec3 worldP = basePos + m * p;

  vHeight = t;
  vMask = alive;
  vSeed = seed;
  vGroundColor = ground.rgb;

  vNormal = m * normalize(n);
  vWorldPos = worldP;

  gl_Position = projectionMatrix * viewMatrix * vec4(worldP, 1.0);
}
