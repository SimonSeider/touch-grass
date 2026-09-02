precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D tDiffuse;
uniform vec2 uDirection;
uniform float uRadius;
uniform float uDim;
uniform float uTime;

#define TAPS 6

void main() {
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = -TAPS; i <= TAPS; i++) {
    float fi = float(i);

    float w = exp(-fi * fi / 18.0);
    sum += texture(tDiffuse, vUv + uDirection * uRadius * (fi / float(TAPS))).rgb * w;
    total += w;
  }
  vec3 col = sum / total;

  if (uDim > 0.0) {
    vec2 d = vUv - 0.5;
    vec3 dark = col * (0.46 - dot(d, d) * 0.22);

    float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    dark += (g - 0.5) * 0.006;

    col = mix(col, dark, uDim);
  }

  outColor = vec4(col, 1.0);
}
