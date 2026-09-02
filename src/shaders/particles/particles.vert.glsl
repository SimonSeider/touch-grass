attribute float aScale;
attribute float aSeed;

uniform float uTime;
uniform float uPixelRatio;
uniform float uFadeNear;
uniform float uFadeFar;

varying float vFade;
varying float vSeed;
varying vec3 vViewDir;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = -mv.z;

  vSeed = aSeed;
  vViewDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);

  vFade = smoothstep(0.35, 3.5, dist) * (1.0 - smoothstep(uFadeNear, uFadeFar, dist));

  gl_Position = projectionMatrix * mv;

  float px = aScale * uPixelRatio * 26.0 / max(dist, 0.35);
  gl_PointSize = clamp(px, 1.0, 9.0);
}