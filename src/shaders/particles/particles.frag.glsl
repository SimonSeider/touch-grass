precision highp float;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunEnergy;
uniform float uTime;
uniform float uRadiance;
uniform sampler2D tSceneDepth;
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;

varying float vFade;
varying float vSeed;
varying vec3 vViewDir;
varying float vViewDepth;

float viewDistance(float depth) {
  float ndc = depth * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
}

void main() {
  vec2 pc = gl_PointCoord - 0.5;
  float d = length(pc) * 2.0;
  if (d > 1.0) discard;

  float sceneDist = viewDistance(texture2D(tSceneDepth, gl_FragCoord.xy / uResolution).x);
  float visible = smoothstep(0.0, 0.4, sceneDist - vViewDepth);
  if (visible <= 0.0) discard;

  float core = smoothstep(1.0, 0.25, d);
  float halo = pow(1.0 - d, 2.5);

  float forward = pow(max(dot(vViewDir, uSunDir), 0.0), 5.0);
  float glint = 0.25 + forward * 1.35;

  float tw = 0.72 + 0.28 * sin(uTime * (1.1 + vSeed * 2.3) + vSeed * 43.0);

  float coverage = (core * 0.5 + halo * 0.5) * vFade * tw * uSunEnergy * visible;
  vec3 emission = mix(uSunColor, vec3(1.0), forward * 0.5) * glint * uRadiance;

  gl_FragColor = vec4(emission * coverage, coverage);
}
