varying float vBrightness;

void main(){
  float dist = length(gl_PointCoord - vec2(0.5));
  if(dist > 0.5)
      discard;
    
  float alpha = smoothstep(0.5, 0.0, dist) * vBrightness;
  vec3 starColor = mix(vec3(0.7, 0.85, 1.0), vec3(1.0, 0.9, 0.7), vBrightness);

  gl_FragColor = vec4(starColor, alpha);
}
