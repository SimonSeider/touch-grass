precision highp float;
precision highp int;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D tDiffuse;
uniform vec2 uSunScreen;
uniform float uSunVisible;
uniform vec3 uFlareColor;

float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

float glowDist(float d, float soft) {
  return exp(-d * d * soft);
}

void main() {
  vec4 scene = texture(tDiffuse, vUv);
  vec3 flare = vec3(0.0);

  if (uSunVisible > 0.5) {
    vec2 p = vUv;
    vec2 sun = uSunScreen;
    vec2 dir = normalize(sun - vec2(0.5));
    float scale = length(sun - vec2(0.5)) * 2.0;

    float d = sdCircle(p - sun, 0.0);
    flare += uFlareColor * glowDist(d, 9000.0) * 1.05;
    flare += uFlareColor * glowDist(d, 1500.0) * 0.42;

    vec2 v = p - sun;
    float along = abs(dot(v, vec2(1.0, 0.0)));
    float perp = abs(dot(v, vec2(0.0, 1.0)));
    float streak = exp(-along * 22.0) * exp(-perp * 420.0);
    flare += uFlareColor * streak * 0.9;

    float ghost[3];
    ghost[0] = 0.18;
    ghost[1] = 0.45;
    ghost[2] = 0.7;
    vec3 ghostColor[3];
    ghostColor[0] = uFlareColor;
    ghostColor[1] = uFlareColor * vec3(0.55, 0.65, 1.0);
    ghostColor[2] = uFlareColor * vec3(0.85, 0.45, 0.25);

    for (int i = 0; i < 3; i++) {
      vec2 pos = mix(sun, vec2(0.5), ghost[i]);
      float fade = (1.0 - scale) * (0.5 - ghost[i] * 0.5);
      float gd = sdCircle(p - pos, 0.0);
      float att = pow(max(fade, 0.0) + 0.05, 1.8);
      flare += ghostColor[i] * glowDist(gd, 1600.0) * 0.6 * att;
    }

    vec2 pos2 = mix(sun, vec2(0.5), -0.6);
    float ring = glowDist(abs(sdCircle(p - pos2, 0.028)), 200.0);
    flare += vec3(0.5, 0.7, 1.0) * ring * 0.6 * (1.0 - scale);
  }

  outColor = scene + vec4(flare, 0.0);
}
