precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D tDiffuse;
uniform vec2 uDirection;
uniform float uRadius;
uniform float uMilk;
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

  if (uMilk > 0.0) {

    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    vec3 milk = mix(col, vec3(lum), 0.42);
    milk = mix(milk, vec3(0.86, 0.90, 0.88), 0.26);

    float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    milk += (g - 0.5) * 0.012;

    vec2 d = vUv - 0.5;
    milk *= 1.0 - dot(d, d) * 0.35;

    col = mix(col, milk, uMilk);
  }

  outColor = vec4(col, 1.0);
}
