//#include <sky>
//#include <light>

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunEnergy;

uniform float uSunRadiance;
uniform float uRim;

uniform vec3 uSH[9];

uniform sampler2D uHeightMap;
uniform vec2 uHeightMapCenter;
uniform float uHeightMapSpan;
uniform float uHeightMapRes;
uniform float uHeightRangeMin;
uniform float uHeightRangeMax;

#define MAX_SHADOW_STEPS 20
#define SHADOW_TAPS 3

varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorldPos;

float sampleTerrainHeight(vec2 wp) {
  vec2 uv = (wp - uHeightMapCenter) / uHeightMapSpan + 0.5;
  float t = textureLod(uHeightMap, uv, 0.0).r;
  return mix(uHeightRangeMin, uHeightRangeMax, t);
}

float terrainShadow(vec3 p, vec3 sunN, float jitter) {

  vec2 dir = sunN.xz;
  float dirlen = length(dir);
  if (dirlen < 1e-4) return 1.0;
  dir /= dirlen;

  float stepDist = uHeightMapSpan / uHeightMapRes;
  float risePerDist = sunN.y / dirlen;
  float occl = 0.0;

  for (int i = 1; i < MAX_SHADOW_STEPS; i++) {
    float d = (float(i) + jitter) * stepDist;
    float rayY = p.y + d * risePerDist;

    if (rayY > uHeightRangeMax) break;

    vec2 sp = p.xz + dir * d;
    vec2 uv = (sp - uHeightMapCenter) / uHeightMapSpan + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;

    float over = sampleTerrainHeight(sp) - rayY;

    float soft = 1.0 + d * 0.06;
    occl = max(occl, smoothstep(0.0, soft, over));
  }
  return 1.0 - occl;
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 toCam = cameraPosition - vWorldPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 1e-4);
  vec3 l = normalize(uSunDir);

  float jitter = fract(sin(dot(vWorldPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
  float shadow = terrainShadow(vWorldPos, l, jitter);

  float ndl = lightWrapped(n, l, 0.32);

  vec3 skyAmb = skyAmbientTop(uSunDir);

  vec3 ambient = lightIrradianceSH(n, uSH);

  float ao = mix(0.62, 1.0, lightSat(n.y * 0.5 + 0.5));
  ambient *= ao;

  vec3 base = max(vColor, 0.0);

  vec3 sunLight = uSunColor * uSunEnergy * uSunRadiance;
  vec3 direct = sunLight * ndl * shadow;

  vec3 bounce = base * sunLight * 0.16 * lightSat(0.35 + 0.65 * shadow) * ao;

  vec3 col = base * (ambient + direct + bounce);

  float spec = lightSpec(n, v, l, 0.72) * shadow * lightSat(dot(n, l));
  col += sunLight * spec * 0.10;

  float fres = lightFresnel(n, v, 0.03);
  col += skyAmb * fres * uRim * ao;

  gl_FragColor = vec4(col, 1.0);
}
