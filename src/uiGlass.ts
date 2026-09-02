import uiGlassVert from './shaders/ui/ui_glass.vert.glsl?raw';
import uiGlassFrag from './shaders/ui/ui_glass.frag.glsl?raw';

export interface UiGlass {
  render: (time: number) => void;
  setSize: () => void;
  setVisible: (visible: boolean) => void;
}

export function initUiGlass(canvas: HTMLCanvasElement): UiGlass {
  const gl =
    canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false }) ||
    (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

  if (!gl) {

    canvas.style.background = 'rgba(255,255,255,0.28)';
    return { render: () => { }, setSize: () => { }, setVisible: () => { } };
  }
  const webgl = gl as WebGLRenderingContext;

  function compile(type: number, src: string): WebGLShader {
    const sh = webgl.createShader(type)!;
    webgl.shaderSource(sh, src);
    webgl.compileShader(sh);
    if (!webgl.getShaderParameter(sh, webgl.COMPILE_STATUS)) {

      console.error('uiGlass shader error:', webgl.getShaderInfoLog(sh));
    }
    return sh;
  }

  const prog = webgl.createProgram()!;
  const vs = compile(webgl.VERTEX_SHADER, uiGlassVert);
  const fs = compile(webgl.FRAGMENT_SHADER, uiGlassFrag);
  webgl.attachShader(prog, vs);
  webgl.attachShader(prog, fs);
  webgl.linkProgram(prog);
  webgl.useProgram(prog);

  const buf = webgl.createBuffer();
  webgl.bindBuffer(webgl.ARRAY_BUFFER, buf);
  webgl.bufferData(webgl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), webgl.STATIC_DRAW);
  const aPos = webgl.getAttribLocation(prog, 'aPos');
  webgl.enableVertexAttribArray(aPos);
  webgl.vertexAttribPointer(aPos, 2, webgl.FLOAT, false, 0, 0);

  const uRes = webgl.getUniformLocation(prog, 'uRes');
  const uTime = webgl.getUniformLocation(prog, 'uTime');

  let visible = true;

  function setSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  }

  function render(time: number) {
    if (!visible) return;
    const w = canvas.width;
    const h = canvas.height;
    if (w < 1 || h < 1) return;
    webgl.viewport(0, 0, w, h);
    webgl.uniform2f(uRes, w, h);
    webgl.uniform1f(uTime, time);
    webgl.enable(webgl.BLEND);

    webgl.blendFunc(webgl.ONE, webgl.ONE_MINUS_SRC_ALPHA);

    webgl.clearColor(0, 0, 0, 0);
    webgl.clear(webgl.COLOR_BUFFER_BIT);
    webgl.drawArrays(webgl.TRIANGLES, 0, 3);
  }

  return { render, setSize, setVisible: (v) => (visible = v) };
}
