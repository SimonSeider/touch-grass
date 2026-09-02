//#include <sky>
//#include <light>

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunEnergy;

uniform float uSunRadiance;
uniform float uFogDensity;
uniform float uTranslucentGain;
uniform float uGrassMaskThreshold;

uniform vec3 uSH[9];

uniform sampler2D uHeightMap;
uniform vec2 uHeightMapCenter;
uniform float uHeightMapSpan;
uniform float uHeightMapRes;
uniform float uHeightRangeMin;
uniform float uHeightRangeMax;

#define MAX_SHADOW_STEPS 12

varying float vHeight;
varying float vMask;
varying vec3 vGroundColor;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vSeed;

float sampleTerrainHeight(vec2 wp) {
  vec2 uv = (wp - uHeightMapCenter) / uHeightMapSpan + 0.5;
  float t = textureLod(uHeightMap, uv, 0.0).r;
  return mix(uHeightRangeMin, uHeightRangeMax, t);
}

float terrainShadow(vec3 p, vec3 sunN) {
  vec2 dir = sunN.xz;
  float dirlen = length(dir);
  if (dirlen < 1e-4) return 1.0;
  dir /= dirlen;

  float stepDist = uHeightMapSpan / uHeightMapRes;
  float risePerDist = sunN.y / dirlen;
  float occl = 0.0;
  for (int i = 1; i < MAX_SHADOW_STEPS; i++) {
    float d = float(i) * stepDist;
    float rayY = p.y + d * risePerDist;
    if (rayY > uHeightRangeMax) break;
    vec2 sp = p.xz + dir * d;
    vec2 uv = (sp - uHeightMapCenter) / uHeightMapSpan + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float over = sampleTerrainHeight(sp) - rayY;
    occl = max(occl, smoothstep(0.0, 1.0 + d * 0.06, over));
  }
  return 1.0 - occl;
}

void main() {
  if (vMask < uGrassMaskThreshold) discard;

  vec3 n = normalize(vNormal);
  vec3 toCam = cameraPosition - vWorldPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 1e-4);

  if (dot(n, v) < 0.0) n = -n;

  vec3 l = normalize(uSunDir);
  float shadow = terrainShadow(vWorldPos, l);

  float canopyAO = mix(0.18, 1.0, smoothstep(0.0, 0.75, vHeight));

  float ndl = lightWrapped(n, l, 0.45);

  vec3 ambient = lightIrradianceSH(n, uSH) * canopyAO;

  vec3 sunLight = uSunColor * uSunEnergy * uSunRadiance;
  vec3 direct = sunLight * ndl * shadow * mix(0.45, 1.0, canopyAO);

  float trans = lightTranslucency(n, v, l, 3.0);
  vec3 sssTint = vec3(0.72, 1.00, 0.34);
  vec3 sss = sunLight * sssTint * trans * shadow * uTranslucentGain * smoothstep(0.0, 0.5, vHeight);

  vec3 albedo = max(vGroundColor, 0.0);

  albedo *= mix(vec3(0.55, 0.62, 0.52), vec3(1.06, 1.04, 0.86), vHeight);

  albedo *= 0.86 + 0.28 * fract(vSeed * 91.7);

  vec3 col = albedo * (ambient + direct) + sss;

  float spec = lightSpec(n, v, l, 0.36) * shadow * lightSat(dot(n, l) + 0.15);
  col += sunLight * spec * 0.055 * smoothstep(0.2, 1.0, vHeight);

  col = skyApplyAerial(col, -v, uSunDir, dist, uFogDensity);

  gl_FragColor = vec4(col, 1.0);
}
