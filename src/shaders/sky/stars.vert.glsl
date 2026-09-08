attribute float aMag;
varying float vBrightness;

void main(){
  vBrightness = clamp((7.0 - aMag) / 7.0, 0.15, 1.0);

  float size = max(1.0, (7.0 - aMag) * 1.5);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
