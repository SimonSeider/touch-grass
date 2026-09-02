import * as THREE from 'three';
import postGradeVert from './shaders/postprocessing/post_grade.vert.glsl?raw';
import lumDownFrag from './shaders/postprocessing/post_lumdown.frag.glsl?raw';
import lumReduceFrag from './shaders/postprocessing/post_lumreduce.frag.glsl?raw';

const GRID = 16;

export class LuminanceMeter {

  luminance = 0.5;

  private downTarget: THREE.WebGLRenderTarget;
  private oneTarget: THREE.WebGLRenderTarget;
  private downMat: THREE.RawShaderMaterial;
  private reduceMat: THREE.RawShaderMaterial;
  private buffer = new Float32Array(4);
  private reading = false;
  private disposed = false;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private quad: { material: THREE.Material; render: (r: THREE.WebGLRenderer) => void },
  ) {
    const opts = {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    };
    this.downTarget = new THREE.WebGLRenderTarget(GRID, GRID, opts);
    this.oneTarget = new THREE.WebGLRenderTarget(1, 1, opts);

    const common = {
      glslVersion: THREE.GLSL3 as THREE.GLSLVersion,
      vertexShader: postGradeVert,
      depthTest: false,
      depthWrite: false,
    };
    this.downMat = new THREE.RawShaderMaterial({
      ...common,
      fragmentShader: lumDownFrag,
      uniforms: { tDiffuse: { value: null } },
    });
    this.reduceMat = new THREE.RawShaderMaterial({
      ...common,
      fragmentShader: lumReduceFrag,
      uniforms: { tDiffuse: { value: null } },
    });
  }

  measure(source: THREE.Texture) {
    if (this.disposed) return;
    const prev = this.renderer.getRenderTarget();

    this.downMat.uniforms.tDiffuse.value = source;
    this.quad.material = this.downMat;
    this.renderer.setRenderTarget(this.downTarget);
    this.quad.render(this.renderer);

    this.reduceMat.uniforms.tDiffuse.value = this.downTarget.texture;
    this.quad.material = this.reduceMat;
    this.renderer.setRenderTarget(this.oneTarget);
    this.quad.render(this.renderer);

    this.renderer.setRenderTarget(prev);

    if (this.reading) return;
    this.reading = true;
    this.renderer
      .readRenderTargetPixelsAsync(this.oneTarget, 0, 0, 1, 1, this.buffer)
      .then(() => {
        const v = this.buffer[0];
        if (Number.isFinite(v) && v > 0) this.luminance = v;
      })
      .catch(() => { })
      .finally(() => { this.reading = false; });
  }

  dispose() {
    this.disposed = true;
    this.downTarget.dispose();
    this.oneTarget.dispose();
    this.downMat.dispose();
    this.reduceMat.dispose();
  }
}
