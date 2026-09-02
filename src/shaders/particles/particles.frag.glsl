precision highp float;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunEnergy;
uniform float uTime;

varying float vFade;
varying float vSeed;
varying vec3 vViewDir;

void main() {
  vec2 pc = gl_PointCoord - 0.5;
  float d = length(pc) * 2.0;
  if (d > 1.0) discard;

  float core = smoothstep(1.0, 0.25, d);
  float halo = pow(1.0 - d, 2.5);

  float forward = pow(max(dot(vViewDir, uSunDir), 0.0), 5.0);
  float glint = 0.18 + forward * 1.35;

  float tw = 0.72 + 0.28 * sin(uTime * (1.1 + vSeed * 2.3) + vSeed * 43.0);

  vec3 col = mix(uSunColor, vec3(1.0), forward * 0.5);
  float a = (core * 0.5 + halo * 0.5) * vFade * glint * tw * uSunEnergy;

  gl_FragColor = vec4(col * a, a);
}