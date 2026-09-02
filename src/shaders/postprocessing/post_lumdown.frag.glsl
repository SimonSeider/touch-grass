precision highp float;
precision highp int;

uniform sampler2D tDiffuse;

in vec2 vUv;
out vec4 outColor;

void main() {
  const float GRID = 16.0;
  const int TAPS = 4;

  vec2 cell = vec2(1.0 / GRID);
  vec2 base = floor(vUv * GRID) * cell;
  vec2 step = cell / float(TAPS);

  float sumLog = 0.0;
  float sumWeight = 0.0;

  for (int y = 0; y < TAPS; y++) {
    for (int x = 0; x < TAPS; x++) {
      vec2 uv = base + (vec2(float(x), float(y)) + 0.5) * step;
      vec3 c = texture(tDiffuse, uv).rgb;
      float lum = dot(max(c, 0.0), vec3(0.2126, 0.7152, 0.0722));

      vec2 d = uv - 0.5;
      float w = exp(-dot(d, d) * 3.0);

      sumLog += w * log(max(lum, 1e-4));
      sumWeight += w;
    }
  }

  outColor = vec4(sumLog, sumWeight, 0.0, 1.0);
}
