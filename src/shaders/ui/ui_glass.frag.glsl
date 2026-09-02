precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  float t = uTime;
  vec2 uv = vUv;
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  vec2 q = p * 2.6;
  float b1 = fbm(q + vec2(0.0, t * 0.035));
  float b2 = fbm(q * 1.7 + vec2(t * 0.024, -t * 0.016) + 5.0);

  vec3 col = vec3(0.93, 0.965, 0.945);
  col += vec3(0.10, 0.06, 0.02) * (b1 - 0.5) * 0.55;
  col += vec3(0.00, 0.05, 0.09) * (b2 - 0.5) * 0.55;

  float axis = (uv.x * 0.75 + (1.0 - uv.y) * 0.55);
  float sweep = fract(axis - t * 0.06);
  float sheen = pow(1.0 - abs(sweep - 0.5) * 2.0, 5.0);
  col += vec3(1.0) * sheen * 0.10;
  col += vec3(1.0) * pow(1.0 - abs(sweep - 0.5) * 2.0, 28.0) * 0.16;

  float vert = smoothstep(1.0, -0.15, uv.y);
  col += vec3(0.055) * vert;
  col -= vec3(0.030) * smoothstep(0.55, 1.0, uv.y);

  float grain = hash(uv * uRes + fract(t) * 17.3);
  col += (grain - 0.5) * 0.035;
  col += (noise(uv * uRes * 0.12) - 0.5) * 0.025;

  vec2 e = min(uv, 1.0 - uv);
  float rim = 1.0 - smoothstep(0.0, 0.06, min(e.x, e.y));
  col += vec3(1.0) * rim * 0.22;

  float alpha = 0.46 + rim * 0.16 + vert * 0.05;

  col = clamp(col, 0.0, 1.0);
  alpha = clamp(alpha, 0.0, 1.0);

  gl_FragColor = vec4(col * alpha, alpha);
}