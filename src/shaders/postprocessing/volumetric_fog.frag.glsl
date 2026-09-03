precision highp float;
precision highp int;
precision highp sampler2D;

//#include <sky>

in vec2 vUv;
out vec4 outColor;

uniform sampler2D tDiffuse;
uniform sampler2D tDepth;

uniform vec3 cameraPos;
uniform mat4 inverseProjection;
uniform mat4 inverseView;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunEnergy;
uniform float uTime;

uniform float uFogDensity;
uniform float uFogHeightFalloff;
uniform float uFogBaseHeight;
uniform float uFogFloor;
uniform float uFogStart;
uniform float uFogFade;
uniform float uFogScatter;
uniform float uFogAmbient;
uniform float uFogAnisotropy;
uniform float uFogNoise;
uniform float uFogMaxDistance;

uniform sampler2D uHeightMap;
uniform vec2 uHeightMapCenter;
uniform float uHeightMapSpan;
uniform float uHeightMapRes;
uniform float uHeightRangeMin;
uniform float uHeightRangeMax;

#define FOG_STEPS 24
#define FOG_SHADOW_STEPS 5
#define FOG_STEP_GROWTH 1.11

vec3 worldFromDepth(float z) {
  vec4 clip = vec4(vec3(vUv, z) * 2.0 - 1.0, 1.0);
  vec4 view = inverseProjection * clip;
  view = vec4(view.xyz / view.w, 1.0);
  return (inverseView * view).xyz;
}

float fogDither(vec2 coords) {
  return fract(52.9829189 * fract(dot(coords, vec2(0.06711056, 0.00583715))));
}

float fogDensityAt(vec3 p, float dist) {
  float k = max(uFogHeightFalloff, 1e-5);
  float layer = uFogDensity * exp(clamp(-k * (p.y - uFogBaseHeight), -12.0, 2.0));
  float d = (layer + uFogFloor) * smoothstep(uFogStart, uFogStart + max(uFogFade, 1e-3), dist);
  float n = sin(p.x * 0.035 + uTime * 0.07) * sin(p.z * 0.041 - uTime * 0.05) * sin(p.y * 0.09 + uTime * 0.03);
  return max(d * (1.0 + uFogNoise * n), 0.0);
}

float fogSunShadow(vec3 p, vec3 sunN) {
  vec2 dir = sunN.xz;
  float dirlen = length(dir);
  if (dirlen < 1e-4) return 1.0;
  dir /= dirlen;

  float stepDist = uHeightMapSpan / uHeightMapRes * 2.0;
  float risePerDist = sunN.y / dirlen;
  float occl = 0.0;

  for (int i = 1; i <= FOG_SHADOW_STEPS; i++) {
    float d = float(i) * stepDist;
    float rayY = p.y + d * risePerDist;
    if (rayY > uHeightRangeMax) break;

    vec2 sp = p.xz + dir * d;
    vec2 uv = (sp - uHeightMapCenter) / uHeightMapSpan + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;

    float h = mix(uHeightRangeMin, uHeightRangeMax, textureLod(uHeightMap, uv, 0.0).r);
    occl = max(occl, smoothstep(0.0, 2.0 + d * 0.05, h - rayY));
  }
  return 1.0 - occl;
}

void main() {
  vec3 src = texture(tDiffuse, vUv).rgb;
  float z = texture(tDepth, vUv).x;

  if (z >= 0.9999) {
    outColor = vec4(src, 1.0);
    return;
  }

  vec3 worldPos = worldFromDepth(z);
  vec3 delta = worldPos - cameraPos;
  float sceneDist = length(delta);
  if (sceneDist < 1e-3) {
    outColor = vec4(src, 1.0);
    return;
  }
  vec3 rd = delta / sceneDist;
  float maxT = min(sceneDist, uFogMaxDistance);

  vec3 sunN = normalize(uSunDir);
  float phase = skyHG(dot(rd, sunN), uFogAnisotropy);
  vec3 sunL = uSunColor * uSunEnergy * skySunTint(sunN.y) * skySunEnergy(sunN.y);
  vec3 ambient = skyFogColor(rd, uSunDir) * uFogAmbient;

  float jitter = fogDither(gl_FragCoord.xy + fract(uTime) * 71.0);

  float transmittance = 1.0;
  vec3 scattered = vec3(0.0);

  float seg = maxT * (FOG_STEP_GROWTH - 1.0) / (pow(FOG_STEP_GROWTH, float(FOG_STEPS)) - 1.0);
  float t = 0.0;

  for (int i = 0; i < FOG_STEPS; i++) {
    float sampleT = t + seg * jitter;
    vec3 p = cameraPos + rd * sampleT;
    float dens = fogDensityAt(p, sampleT);

    if (dens > 1e-6) {
      float stepT = exp(-dens * seg);
      float shadow = fogSunShadow(p, sunN);
      vec3 L = ambient + sunL * phase * shadow * uFogScatter;
      scattered += transmittance * L * (1.0 - stepT);
      transmittance *= stepT;
      if (transmittance < 0.004) break;
    }

    t += seg;
    seg *= FOG_STEP_GROWTH;
    if (t >= maxT) break;
  }

  outColor = vec4(src * transmittance + scattered, 1.0);
}
