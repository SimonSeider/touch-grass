float lightSat(float x) { return clamp(x, 0.0, 1.0); }

float lightWrapped(vec3 n, vec3 l, float wrap) {
  return lightSat((dot(n, l) + wrap) / (1.0 + wrap));
}

float lightSpec(vec3 n, vec3 v, vec3 l, float roughness) {
  vec3 h = normalize(v + l);
  float a = max(roughness * roughness, 1e-3);
  float power = 2.0 / (a * a) - 2.0;
  float ndh = lightSat(dot(n, h));
  return pow(ndh, max(power, 1.0)) * (power + 8.0) / (8.0 * SKY_PI);
}

float lightFresnel(vec3 n, vec3 v, float f0) {
  return f0 + (1.0 - f0) * pow(1.0 - lightSat(dot(n, v)), 5.0);
}

float lightTranslucency(vec3 n, vec3 v, vec3 l, float power) {
  vec3 back = normalize(l + n * 0.35);
  return pow(lightSat(dot(v, -back)), power);
}

vec3 lightIrradianceSH(vec3 n, vec3 sh[9]) {
  vec3 e = sh[0] * 0.886227
         + sh[1] * (2.0 * 0.511664) * n.y
         + sh[2] * (2.0 * 0.511664) * n.z
         + sh[3] * (2.0 * 0.511664) * n.x
         + sh[4] * (2.0 * 0.429043) * n.x * n.y
         + sh[5] * (2.0 * 0.429043) * n.y * n.z
         + sh[6] * (0.743125 * n.z * n.z - 0.247708)
         + sh[7] * (2.0 * 0.429043) * n.x * n.z
         + sh[8] * 0.429043 * (n.x * n.x - n.y * n.y);
  return max(e, 0.0) / SKY_PI;
}
