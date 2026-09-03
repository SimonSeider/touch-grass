precision highp float;
precision highp int;

uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float uNear;
uniform float uFar;
uniform float uTime;
uniform float uExposure;
uniform float uVignette;
uniform float uContrast;
uniform float uSaturation;
uniform float uWarmth;
uniform float uChroma;
uniform float uAspect;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;

uniform float uReadNoise;
uniform float uShotNoise;

in vec2 vUv;
out vec4 outColor;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec3 hash32(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxz + p3.yzx) * p3.zyx);
}

float getLinearDepth(vec2 uv){
    float z = texture(tDepth, uv).r;
    return (2.0 * uNear * uFar) / (uFar + uNear - (z * 2.0 - 1.0) * (uFar - uNear));
}

vec3 ACESFilm(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 d = vUv - 0.5;

  vec2 dr = vec2(d.x * uAspect, d.y);
  float r = length(dr) / length(vec2(uAspect, 1.0) * 0.5);

  vec3 col;
  if (uChroma > 0.0) {
    vec2 off = d * (r * r) * uChroma;
    col.r = texture(tDiffuse, vUv - off).r;
    col.g = texture(tDiffuse, vUv).g;
    col.b = texture(tDiffuse, vUv + off).b;
  } else {
    col = texture(tDiffuse, vUv).rgb;
  }

  col *= uExposure;
  
  if(uReadNoise > 0.0 || uShotNoise > 0.0){
    vec2 pixelUv = vUv * vec2(1920.0, 1080.0);

    vec2 sensorUv = floor(vUv * vec2(1920.0, 1080.0) * 0.5) * 2.0;
    vec3 rawNoise = hash32(sensorUv + fract(uTime) * 613.0) - 0.5;

    vec3 shot = sqrt(max(col, 0.0)) * uShotNoise;
    vec3 read = vec3(uReadNoise);

    vec3 chromaWeight = vec3(1.4, 0.8, 1.3); 
    col += rawNoise * (shot + read) * chromaWeight;
    col = max(col, 0.0);
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

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
