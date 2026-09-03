precision highp float;
precision highp int;

in vec2 uv;
out vec2 vUv;
out float vSunOpen;

uniform sampler2D tDepth;
uniform vec2 uSunScreen;
uniform float uAspect;

float sunOpenness() {
  vec2 r = vec2(0.013 / uAspect, 0.013);
  float open = step(0.9995, textureLod(tDepth, clamp(uSunScreen, 0.0, 1.0), 0.0).x);
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.0471976;
    vec2 d = vec2(cos(a), sin(a));
    open += step(0.9995, textureLod(tDepth, clamp(uSunScreen + d * r * 0.5, 0.0, 1.0), 0.0).x);
    open += step(0.9995, textureLod(tDepth, clamp(uSunScreen + d * r, 0.0, 1.0), 0.0).x);
  }
  return open / 13.0;
}

void main() {
  vUv = uv;
  vSunOpen = sunOpenness();
  gl_Position = vec4((uv - 0.5) * 2.0, 0.0, 1.0);
}
