//#include <sky>

uniform vec3 uSunDir;
uniform float uHaze;
uniform float uTime;

varying vec3 vWorld;

void main() {
  vec3 dir = normalize(vWorld);
  vec3 col = skyRadiance(dir, uSunDir, uHaze);

  float night = skyNight(uSunDir);
  vec3 cell = floor(dir * 650.0);
  float seed = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  vec3 offset = fract(dir * 650.0) - 0.5;
  float star = (1.0 - smoothstep(0.08, 0.40, length(offset))) * step(0.986, seed);
  float twinkle = 0.8 + 0.2 * sin(uTime * (0.6 + seed) + seed * 300.0);
  col += mix(vec3(0.45, 0.65, 1.0), vec3(1.0, 0.85, 0.65), seed)
    * star * twinkle * night * smoothstep(0.02, 0.22, dir.y) * 1.5;

  vec3 moonDir = -uSunDir;
  float moonDot = dot(dir, moonDir);
  float moon = smoothstep(cos(0.014), cos(0.012), moonDot);
  float surface = 0.78 + 0.22 * sin(dir.x * 2100.0) * sin(dir.z * 1800.0);
  col += vec3(0.68, 0.79, 1.0) * moon * surface * night * 1.6;

  float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (d - 0.5) * mix(0.0025, 0.00015, night);

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
