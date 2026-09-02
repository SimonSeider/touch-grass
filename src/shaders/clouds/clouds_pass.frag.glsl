precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;

//#include <sky>

in vec2 vUv;
out vec4 outColor;

uniform sampler3D cloud;
uniform sampler3D worley;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;

uniform vec3 cameraPos;
uniform mat4 inverseProjection;
uniform mat4 inverseView;
uniform vec3 sunDir;
uniform vec3 sunColor;

uniform float uCoverageLow;
uniform float uCoverageHigh;
uniform float uDensityGain;
uniform float uErosion;
uniform float uLightAbsorb;
uniform float near;
uniform float far;
uniform float uTime;

#define PLANET_RADIUS 260000.0
#define CLOUDS_BOTTOM_HEIGHT 340.0
#define CLOUDS_TOP_HEIGHT 653.0

#define INNER_RADIUS (PLANET_RADIUS + CLOUDS_BOTTOM_HEIGHT)
#define OUTER_RADIUS (PLANET_RADIUS + CLOUDS_TOP_HEIGHT)

#define MAX_RAY_LENGTH 46000.0

#define WORLD_SCALE 0.00027

#define STRATUS_GRADIENT vec4(0.0, 0.1, 0.2, 0.3)
#define STRATOCUMULUS_GRADIENT vec4(0.02, 0.2, 0.48, 0.625)
#define CUMULUS_GRADIENT vec4(0.00, 0.1625, 0.88, 0.98)

const vec3 PLANET_CENTER = vec3(0.0, -PLANET_RADIUS, 0.0);

vec3 noiseKernel[6] = vec3[](
  vec3(0.38051305, 0.92453449, -0.02111345),
  vec3(-0.50625799, -0.03590792, -0.86163418),
  vec3(-0.32509218, -0.94557439, 0.01428793),
  vec3(0.09026238, -0.27376545, 0.95755165),
  vec3(0.28128598, 0.42443639, -0.86065785),
  vec3(-0.16852403, 0.14748697, 0.97460106)
);

vec3 computeWorldPosition() {
  float z = texture(tDepth, vUv).x;
  vec4 posCLIP = vec4(vec3(vUv, z) * 2.0 - 1.0, 1.0);
  vec4 posVS = inverseProjection * posCLIP;
  posVS = vec4(posVS.xyz / posVS.w, 1.0);
  vec4 posWS = inverseView * posVS;
  return posWS.xyz;
}

float dithering(vec2 coords) {
  return fract(52.9829189 * fract(dot(coords, vec2(0.06711056, 0.00583715))));
}

float raySphereFar(vec3 orig, vec3 dir, float radius) {
  vec3 oc = orig - PLANET_CENTER;
  float b = dot(oc, dir);
  float c = dot(oc, oc) - radius * radius;
  float disc = b * b - c;
  if (disc < 0.0) return -1.0;
  return -b + sqrt(disc);
}

float raySphereNear(vec3 orig, vec3 dir, float radius) {
  vec3 oc = orig - PLANET_CENTER;
  float b = dot(oc, dir);
  float c = dot(oc, oc) - radius * radius;
  float disc = b * b - c;
  if (disc < 0.0) return -1.0;
  return -b - sqrt(disc);
}

bool cloudShellRange(vec3 orig, vec3 dir, out float t0, out float t1) {
  float r = length(orig - PLANET_CENTER);
  if (r < INNER_RADIUS) {

    t0 = raySphereFar(orig, dir, INNER_RADIUS);
    t1 = raySphereFar(orig, dir, OUTER_RADIUS);
  } else if (r < OUTER_RADIUS) {

    t0 = 0.0;
    float inner = raySphereNear(orig, dir, INNER_RADIUS);
    t1 = inner > 0.0 ? inner : raySphereFar(orig, dir, OUTER_RADIUS);
  } else {

    t0 = raySphereNear(orig, dir, OUTER_RADIUS);
    float inner = raySphereNear(orig, dir, INNER_RADIUS);
    t1 = inner > 0.0 ? inner : raySphereFar(orig, dir, OUTER_RADIUS);
  }
  if (t1 <= 0.0 || t1 <= t0) return false;
  t0 = max(t0, 0.0);
  t1 = min(t1, t0 + MAX_RAY_LENGTH);
  return t1 > t0;
}

vec3 scaledPos(vec3 pos, float scale) {
  float frac = 1.0 / scale;
  return vec3(
    frac - abs(mod(scale * pos.x, frac * 2.0) - frac),
    frac - abs(mod(scale * pos.y, frac * 2.0) - frac),
    frac - abs(mod(scale * pos.z, frac * 2.0) - frac)
  );
}

float saturate(float x) {
  return max(0.0, min(1.0, x));
}

float powder(float d) {
  return 1.0 - exp(-2.0 * d);
}

float getHeightFraction(vec3 pos) {
  float r = length(pos - PLANET_CENTER);
  return (r - INNER_RADIUS) / (OUTER_RADIUS - INNER_RADIUS);
}

vec3 sampleWeather(vec3 pos) {
  vec3 weatherMap = texture(worley, vec3(pos.x, 0.0, pos.z)).rgb;
  return weatherMap;
}

float remap(float v, float originalMin, float originalMax, float newMin, float newMax) {
  return newMin + ((v - originalMin) / (originalMax - originalMin)) * (newMax - newMin);
}

float getDensityForCloud(float heightFraction, float cloudType) {
  float stratusFactor = 1.0 - clamp(cloudType * 2.0, 0.0, 1.0);
  float stratoCumulusFactor = 1.0 - abs(cloudType - 0.5) * 2.0;
  float cumulusFactor = clamp(cloudType - 0.5, 0.0, 1.0) * 2.0;
  vec4 baseGradient = stratusFactor * STRATUS_GRADIENT + stratoCumulusFactor * STRATOCUMULUS_GRADIENT + cumulusFactor * CUMULUS_GRADIENT;
  return smoothstep(baseGradient.x, baseGradient.y, heightFraction) - smoothstep(baseGradient.z, baseGradient.w, heightFraction);
}

float sampleDensity(vec3 pos) {
  float heightFraction = getHeightFraction(pos);
  if (heightFraction < 0.0 || heightFraction > 1.0) return 0.0;

  vec3 windDir = normalize(vec3(1.0, 0.0, 0.32));
  vec3 samplePos = pos - windDir * (uTime * 9.0 + heightFraction * 260.0);

  vec3 newpos = samplePos * vec3(WORLD_SCALE, WORLD_SCALE * 0.3, WORLD_SCALE);
  newpos += vec3(0.5);

  vec3 wpos = scaledPos(newpos, 1.0);
  vec3 weatherMap = sampleWeather(wpos);

  float systems = smoothstep(uCoverageLow, uCoverageHigh, weatherMap.r);
  if (systems < 0.01) return 0.0;

  float cells = smoothstep(0.52, 0.90, weatherMap.g);
  float coverage = systems * mix(0.55, 1.0, cells);

  float t2 = weatherMap.b;

  float cloudType = clamp(systems * 1.4 - 0.25 + (t2 - 0.5) * 0.6, 0.0, 1.0);

  float streak = smoothstep(0.70, 0.95, t2);

  vec3 lowpos = scaledPos(newpos, 3.0);
  vec4 lowFreqNoise = textureLod(cloud, lowpos, 0.0);
  float lowFreqFBM = dot(lowFreqNoise.gba, vec3(0.625, 0.25, 0.125));
  float base_cloud = remap(lowFreqNoise.r, -(1.0 - lowFreqFBM), 1.0, 0.0, 1.0);

  base_cloud *= getDensityForCloud(heightFraction, cloudType);

  base_cloud *= 1.0 - streak * 0.55;

  float cloudShape = clamp(remap(base_cloud, 1.0 - coverage, 1.0, 0.0, 1.0), 0.0, 1.0);

  vec3 highpos = scaledPos(samplePos, 5.0);
  vec3 highFreqNoise = textureLod(worley, highpos * max(heightFraction, 0.05), 0.0).rgb;
  float highFreqFBM = dot(highFreqNoise, vec3(0.625, 0.25, 0.125));
  float erosion = mix(highFreqFBM, 1.0 - highFreqFBM, clamp(heightFraction * 8.0, 0.0, 1.0));
  cloudShape = clamp(remap(cloudShape, erosion * uErosion, 1.0, 0.0, 1.0), 0.0, 1.0);

  cloudShape *= uDensityGain;

  float slabEdge = smoothstep(0.0, 0.10, heightFraction) * smoothstep(1.0, 0.82, heightFraction);
  cloudShape *= slabEdge;

  return clamp(cloudShape, 0.0, 1.0);
}

float raymarchToLight(vec3 startPos, float stepSize) {
  vec3 pos = startPos;
  float coneStep = 1.0 / 6.0;
  float coneRadius = 1.0;
  float sigma = uLightAbsorb;
  float totalDensity = 0.0;
  vec3 sunN = normalize(sunDir);
  for (int i = 0; i < 6; i++) {
    pos = startPos + coneRadius * noiseKernel[i] * float(i);
    float density = sampleDensity(pos);
    if (density > 0.0) {
      totalDensity += density * stepSize;
    }
    startPos += stepSize * sunN;
    coneRadius += coneStep;
  }
  return exp(-totalDensity * sigma);
}

float cloudPhase(float c) {
  float p = mix(skyHG(c, -0.28), skyHG(c, 0.72), 0.55) * 4.0 * SKY_PI;
  return clamp(p, 0.42, 2.6);
}

vec4 traceClouds(vec3 rayDir, vec3 startPos, float rayLength, int nSteps, out float meanDist) {
  float stepSize = rayLength / float(nSteps);
  vec4 col = vec4(0.0);
  float lightDotEye = dot(normalize(sunDir), rayDir);
  float phase = cloudPhase(lightDotEye);
  float T = 1.0;
  float sigma = 0.03;

  vec3 sunTint = skySunTint(sunDir.y);
  float sunE = skySunEnergy(sunDir.y);
  vec3 sunRadiance = sunColor * sunTint * mix(0.06, 1.15, sunE);

  vec3 ambTop = skyAmbientTop(sunDir) * 0.75;
  vec3 ambBottom = mix(skyAmbientGround(sunDir), ambTop, 0.35) * 0.75;

  vec2 coord = gl_FragCoord.xy;
  vec3 pos = startPos + rayDir * stepSize * dithering(coord);
  float weightedDist = 0.0;
  float weightSum = 0.0;

  for (int i = 0; i < nSteps; ++i) {
    float density = sampleDensity(pos);

    if (density > 0.0) {
      float heightFraction = clamp(getHeightFraction(pos), 0.0, 1.0);
      float light_density = raymarchToLight(pos, stepSize);
      float powderTerm = powder(density * 3.0);

      vec3 scatter = vec3(0.0);
      float a = 1.0, b = 1.0, cc = 1.0;
      for (int o = 0; o < 3; o++) {
        scatter += a * b * mix(0.55, 1.0, powderTerm) * pow(light_density, cc) * mix(phase, 0.5, 1.0 - b);
        a *= 0.52; b *= 0.62; cc *= 0.55;
      }

      vec3 ambientLight = mix(ambBottom, ambTop, heightFraction);
      vec3 S = (sunRadiance * scatter + ambientLight) * density;

      float dTrans = exp(-density * stepSize * sigma);
      vec3 Sint = (S - S * dTrans) / density;

      col.rgb += T * Sint;
      float w = T * (1.0 - dTrans);
      weightedDist += w * distance(pos, startPos);
      weightSum += w;
      T *= dTrans;
    }

    if (T <= 0.008) break;
    pos += rayDir * stepSize;
  }

  col.a = 1.0 - T;

  meanDist = weightSum > 0.0 ? weightedDist / weightSum : rayLength;
  return col;
}

void main() {
  vec3 diffuse = texture(tDiffuse, vUv).rgb;
  vec3 posWS = computeWorldPosition();
  vec3 rayDir = normalize(posWS - cameraPos);

  float t0, t1;
  if (!cloudShellRange(cameraPos, rayDir, t0, t1)) {
    outColor = vec4(diffuse, 1.0);
    return;
  }

  float worldDistance = length(posWS - cameraPos);
  if (t0 >= worldDistance) {
    outColor = vec4(diffuse, 1.0);
    return;
  }
  t1 = min(t1, worldDistance);
  if (t1 <= t0) {
    outColor = vec4(diffuse, 1.0);
    return;
  }

  vec3 start = cameraPos + rayDir * t0;
  float rayLength = t1 - t0;

  int nSteps = int(clamp(rayLength / 90.0, 48.0, 160.0));

  float meanDist;
  vec4 trace = traceClouds(rayDir, start, rayLength, nSteps, meanDist);

  vec3 fogCol = skyFogColor(rayDir, sunDir);

  float haze = 1.0 - exp(-meanDist * 0.00007);
  trace.rgb = mix(trace.rgb, fogCol * trace.a, haze * 0.78);
  trace.a *= mix(1.0, 0.55, haze);

  outColor = vec4(diffuse * (1.0 - trace.a) + trace.rgb, 1.0);
}
