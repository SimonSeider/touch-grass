precision highp float;
precision highp int;

uniform sampler2D tDiffuse;

in vec2 vUv;
out vec4 outColor;

void main() {
  const int GRID = 16;

  float sumLog = 0.0;
  float sumWeight = 0.0;
  for (int y = 0; y < GRID; y++) {
    for (int x = 0; x < GRID; x++) {
      vec2 uv = (vec2(float(x), float(y)) + 0.5) / float(GRID);
      vec2 t = texture(tDiffuse, uv).rg;
      sumLog += t.r;
      sumWeight += t.g;
    }
  }

  outColor = vec4(exp(sumLog / max(sumWeight, 1e-4)), 0.0, 0.0, 1.0);
}
