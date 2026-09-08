varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = position;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
