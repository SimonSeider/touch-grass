varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  vColor = color;
  vNormal = normalize(normalMatrix * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
