precision highp float;
precision highp int;

uniform sampler2D tDiffuse;
uniform sampler2D tDepth;

uniform float uNear;
uniform float uFar;

uniform float uTime;

uniform float uFOV;
uniform float uFStop;
uniform float uFocusDistance;
uniform float uExposure;

uniform float uVignette;
uniform float uContrast;
uniform float uSaturation;
uniform float uWarmth;
uniform float uChroma;

uniform float uAspect;
uniform float uWidth;
uniform float uHeight;

uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;

uniform float uReadNoise;
uniform float uShotNoise;

in vec2 vUv;
out vec4 outColor;

const vec2 poissonDisk[16] = vec2[](
    vec2(-0.94201624, -0.39906216),
    vec2( 0.94558609, -0.76890725),
    vec2(-0.09418410, -0.92938870),
    vec2( 0.34495938,  0.29387760),
    vec2(-0.91588581,  0.45771432),
    vec2(-0.81544232, -0.87912464),
    vec2(-0.38277543,  0.27676845),
    vec2( 0.97484398,  0.75648379),
    vec2( 0.44323325, -0.97511554),
    vec2( 0.53742981, -0.47373420),
    vec2(-0.26496911, -0.41893023),
    vec2( 0.79197514,  0.19090188),
    vec2(-0.24188840,  0.99706507),
    vec2(-0.81409955,  0.91437590),
    vec2( 0.19984126,  0.78641367),
    vec2( 0.14383161, -0.14100790)
);

const float blackLevel = 0.002;
const float sensorHeight = 24.0; // mm
const float chromaCocScale = 0.2;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}
 
vec3 hash32(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxz + p3.yzx) * p3.zyx);
}

vec3 gaussian32(vec2 p, float seed){
  vec3 u1 = hash32(p + seed);
  vec3 u2 = hash32(p + seed + 17.17);
  u1 = max(u1, 1e-5);
  return sqrt(-2.0 * log(u1)) * cos(6.2831853 * u2);
}

vec3 ACESFilm(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 linearToSRGB(vec3 c){
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

float getLinearDepth(vec2 uv){
    float z = texture(tDepth, uv).r;
    float z_ndc = z * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z_ndc * (uFar - uNear));
}

void main() {
  vec2 d = vUv - 0.5;
  float depth = getLinearDepth(vUv);
  vec2 pixelSize = 1.0 / vec2(uWidth, uHeight);

  vec2 dr = vec2(d.x * uAspect, d.y);
  float r = length(dr) / length(vec2(uAspect, 1.0) * 0.5);

  vec3 col;
 
  float pixelsPerMeter = uHeight / (sensorHeight * 0.001);

  float focalLength_mm = (sensorHeight * 0.5) / tan(radians(uFOV) * 0.5);
  float focalLength = focalLength_mm * 0.001;
  float apertureDiameter = focalLength / uFStop;

  float invFocus = (uFocusDistance > 0.0 && !isinf(uFocusDistance)) ? (1.0 / uFocusDistance) : 0.0;
  float coc = (apertureDiameter * focalLength * (1.0 - depth * invFocus)) / max(0.0001, depth * (1.0 - focalLength * invFocus));

  float cocPixels = coc * pixelsPerMeter;
  
  vec3 result = vec3(0.0);
  float totalWeight = 0.0;
  for(int i = 0; i < 16; i++){
      vec2 baseOffset = poissonDisk[i] * cocPixels * pixelSize;

      if(uChroma > 0.0){
          vec2 chromaShift = d * (r * r) * uChroma * (1.0 + abs(coc) * chromaCocScale);

          float sr = texture(tDiffuse, vUv + baseOffset - chromaShift).r;
          float sg = texture(tDiffuse, vUv + baseOffset).g;
          float sb = texture(tDiffuse, vUv + baseOffset + chromaShift).b;
          result += vec3(sr, sg, sb);
      } else {
          result += texture(tDiffuse, vUv + baseOffset).rgb;
      }

      totalWeight += 1.0;
  }
  col = result / totalWeight;

  col *= uExposure;
  
  if(uReadNoise > 0.0 || uShotNoise > 0.0){
      vec2 pixelUv = floor(vUv * vec2(uWidth, uHeight));
      vec3 temporalNoise = gaussian32(pixelUv, fract(uTime) * 613.0);
      vec3 shot = sqrt(max(col, 0.0)) * uShotNoise;
      vec3 read = vec3(uReadNoise);
      vec3 chromaWeight = vec3(1.4, 0.8, 1.3);
      col += temporalNoise * (shot + read) * chromaWeight;
      col = max(col + blackLevel, 0.0) - blackLevel;
  }

  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, uSaturation);
  col = (col - 0.18) * uContrast + 0.18;
  col *= 1.0 + uWarmth * vec3(0.12, 0.04, -0.10);
  col = max(col, 0.0);

  float shade = 1.0 - smoothstep(0.0, 0.55, lum);
  float light = smoothstep(0.35, 1.30, lum);
  col *= mix(vec3(1.0), uShadowTint, shade * 0.55);
  col *= mix(vec3(1.0), uHighlightTint, light * 0.45);

  col *= 1.0 - uVignette * smoothstep(0.55, 1.15, r);

  col = ACESFilm(max(col, 0.0));
  col = pow(col, vec3(1.0 / 2.2));

  outColor = vec4(clamp(linearToSRGB(col), 0.0, 1.0), 1.0);
}
