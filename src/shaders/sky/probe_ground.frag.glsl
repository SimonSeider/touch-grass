//#include <sky>

uniform vec3 uSunDir;
uniform vec3 uAlbedo;
uniform float uSunRadiance;

void main() {
  float sunY = uSunDir.y;
  vec3 sun = skySunTint(sunY) * skySunEnergy(sunY) * max(sunY, 0.0) * uSunRadiance;
  vec3 irradiance = sun + skyAmbientTop(uSunDir);
  gl_FragColor = vec4(uAlbedo * irradiance, 1.0);
}
