precision highp float;
precision highp int;

uniform float uZCoord;
uniform float size;
layout(location = 0) out highp vec4 outColor;

float hash(int n) {
  return fract(sin(float(n) + 1.951) * 43758.5453123);
}

float noise(vec3 x) {
  vec3 p = floor(x);
  vec3 f = fract(x);
  f = f * f * (vec3(3.0) - vec3(2.0) * f);
  float n = p.x + p.y * 57.0 + 113.0 * p.z;
  return mix(
    mix(mix(hash(int(n + 0.0)), hash(int(n + 1.0)), f.x),
        mix(hash(int(n + 57.0)), hash(int(n + 58.0)), f.x), f.y),
    mix(mix(hash(int(n + 113.0)), hash(int(n + 114.0)), f.x),
        mix(hash(int(n + 170.0)), hash(int(n + 171.0)), f.x), f.y),
    f.z);
}

float cells(vec3 p, float cellCount) {
  vec3 pCell = p * cellCount;
  float d = 1.0e10;
  for (int xo = -1; xo <= 1; xo++) {
    for (int yo = -1; yo <= 1; yo++) {
      for (int zo = -1; zo <= 1; zo++) {
        vec3 tp = floor(pCell) + vec3(xo, yo, zo);
        tp = pCell - tp - noise(mod(tp, cellCount / 1.0));
        d = min(d, dot(tp, tp));
      }
    }
  }
  d = min(d, 1.0);
  d = max(d, 0.0);
  return d;
}

float worleyNoise3D(vec3 p, float cellCount) {
  return cells(p, cellCount);
}

vec4 stackable3DNoise(vec3 coord) {
  float cellCount = 2.0;
  float worleyNoise0 = 1.0 - worleyNoise3D(coord, cellCount * 1.0);
  float worleyNoise1 = 1.0 - worleyNoise3D(coord, cellCount * 2.0);
  float worleyNoise2 = 1.0 - worleyNoise3D(coord, cellCount * 4.0);
  float worleyNoise3 = 1.0 - worleyNoise3D(coord, cellCount * 8.0);
  float worleyFBM0 = worleyNoise0 * 0.625 + worleyNoise1 * 0.25 + worleyNoise2 * 0.125;
  float worleyFBM1 = worleyNoise1 * 0.625 + worleyNoise2 * 0.25 + worleyNoise3 * 0.125;
  float worleyFBM2 = worleyNoise2 * 0.75 + worleyNoise3 * 0.25;
  return vec4(worleyFBM0, worleyFBM1, worleyFBM2, 1.0);
}

void main() {
  vec3 pixel = vec3(gl_FragCoord.x / size, gl_FragCoord.y / size, uZCoord / size);
  outColor = stackable3DNoise(pixel);
}
