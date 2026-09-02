//#include <sky>

uniform vec3 uSunDir;

varying vec2 vUv;

void main() {
  vec2 p = vUv - 0.5;
  float d = length(p) * 2.0;

  vec3 tint = skySunTint(uSunDir.y);
  float energy = skySunEnergy(uSunDir.y);
  float core = 0.32;
  float disc = smoothstep(core, core * 0.75, d);
  float limb = smoothstep(core * 0.19, core * 0.94, d);
  vec3 body = mix(mix(vec3(1.0), tint, 0.30), tint, limb);

  float glareTight = pow(max(1.0 - d * 2.6, 0.0), 2.0);
  float glareWide = pow(max(1.0 - d, 0.0), 3.2);

  float a = clamp(disc + glareTight * 0.35 + glareWide * 0.16, 0.0, 1.0) * mix(0.12, 1.0, energy);
  vec3 col = body * mix(1.1, 4.2, energy);

  gl_FragColor = vec4(col, a);
}
