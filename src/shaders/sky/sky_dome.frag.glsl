//#include <sky>

uniform vec3 uSunDir;
uniform float uHaze;

varying vec3 vWorld;

void main() {
  vec3 dir = normalize(vWorld);
  vec3 col = skyRadiance(dir, uSunDir, uHaze);

  float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (d - 0.5) * 0.0025;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
