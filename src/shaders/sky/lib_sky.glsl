const float SKY_PI = 3.14159265359;

float skySat(float x) { return clamp(x, 0.0, 1.0); }

float skyRayleighPhase(float c) { return 0.75 * (1.0 + c * c); }

float skyHG(float c, float g) {
  float gg = g * g;
  return (1.0 - gg) / (4.0 * SKY_PI * pow(max(1.0 + gg - 2.0 * g * c, 1e-4), 1.5));
}

vec3 skySunTint(float sunY) {
  float h = skySat(sunY);
  vec3 noon   = vec3(1.00, 0.98, 0.94);
  vec3 gold   = vec3(1.00, 0.76, 0.47);
  vec3 ember  = vec3(1.00, 0.44, 0.22);
  vec3 c = mix(gold, noon, smoothstep(0.10, 0.46, h));
  c = mix(ember, c, smoothstep(0.005, 0.13, h));
  return c;
}

float skySunEnergy(float sunY) {
  return smoothstep(-0.04, 0.20, sunY);
}

vec3 skyAmbientTop(vec3 sunDir) {
  float h = skySat(sunDir.y);
  vec3 day  = vec3(0.30, 0.44, 0.72);
  vec3 dusk = vec3(0.22, 0.22, 0.34);
  return mix(dusk, day, smoothstep(0.02, 0.30, h)) * mix(0.35, 1.0, skySunEnergy(sunDir.y));
}

vec3 skyAmbientGround(vec3 sunDir) {
  vec3 base = vec3(0.16, 0.19, 0.12);
  return base * mix(0.25, 1.0, skySunEnergy(sunDir.y)) * mix(vec3(1.0), skySunTint(sunDir.y), 0.5);
}

vec3 skyRadiance(vec3 dir, vec3 sunDir, float haze) {
  vec3 d = normalize(dir);
  float y = d.y;
  float sunY = sunDir.y;
  float energy = skySunEnergy(sunY);
  vec3 tint = skySunTint(sunY);

  vec3 zenith  = mix(vec3(0.030, 0.055, 0.130), vec3(0.075, 0.175, 0.430), smoothstep(0.0, 0.35, sunY));
  vec3 horizon = mix(vec3(0.100, 0.105, 0.135), vec3(0.560, 0.660, 0.800), smoothstep(0.0, 0.28, sunY));
  horizon = mix(horizon, horizon * 0.55 + tint * 0.55, mix(0.55, 0.15, smoothstep(0.05, 0.45, sunY)));

  float t = pow(skySat(y), 0.42);
  vec3 col = mix(horizon, zenith, t);

  float band = pow(1.0 - skySat(abs(y)), 5.0);
  col = mix(col, horizon * 1.06, band * haze);

  float below = skySat(-y * 6.0);
  col = mix(col, vec3(0.075, 0.085, 0.070) * mix(0.3, 1.0, energy), below);

  float c = dot(d, normalize(sunDir));
  float glow = skyHG(c, 0.76) * 0.5 + skyHG(c, 0.35) * 0.25;
  float halo = pow(skySat(c), 900.0);
  col += tint * glow * energy * 1.15;
  col += tint * halo * energy * 6.0;

  col *= mix(1.0, skyRayleighPhase(c) * 0.55 + 0.72, 0.5);

  return max(col, vec3(0.0));
}

vec3 skyFogColor(vec3 viewDir, vec3 sunDir) {
  vec3 d = normalize(viewDir);
  vec3 flat_ = normalize(vec3(d.x, max(d.y, 0.0) * 0.30 + 0.035, d.z));
  return skyRadiance(flat_, sunDir, 1.0);
}
