const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = (position + 1.0) * 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

// The source's dissolve is a luminance burn, rather than a random pixel fade.
const DISSOLVE_SHADER = `
precision mediump float;
varying vec2 uv;
uniform sampler2D fromFrame;
uniform sampler2D toFrame;
uniform float progress;
void main() {
  vec4 fromColor = texture2D(fromFrame, uv);
  vec4 toColor = texture2D(toFrame, uv);
  float burn = 0.5 + 0.5 * dot(fromColor.rgb, vec3(0.299, 0.587, 0.114));
  float show = burn - progress;
  if (show < 0.001) {
    gl_FragColor = toColor;
  } else {
    float factor = 1.0 - smoothstep(0.0, 0.1, show);
    vec3 burnColor = pow(mix(vec3(1.0, 0.0, 0.0), vec3(0.9, 0.9, 0.2), factor), vec3(5.0));
    vec3 rgb = mix(fromColor.rgb, burnColor, factor * step(0.0001, progress));
    gl_FragColor = vec4(rgb * fromColor.a, fromColor.a);
  }
}`;

function shader(gl, type, source) {
  const result = gl.createShader(type);
  if (!result) throw new Error('无法创建转场着色器');
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    gl.deleteShader(result);
    throw new Error('转场着色器编译失败');
  }
  return result;
}

function createDissolveRenderer(canvas) {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error('当前浏览器无法预览溶解转场');
  const shaders = [],
    textures = [];
  let program, buffer;
  const dispose = () => {
    for (const texture of textures) gl.deleteTexture(texture);
    for (const item of shaders) gl.deleteShader(item);
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  try {
    shaders.push(shader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    shaders.push(shader(gl, gl.FRAGMENT_SHADER, DISSOLVE_SHADER));
    program = gl.createProgram();
    if (!program) throw new Error('无法创建转场程序');
    for (const item of shaders) gl.attachShader(program, item);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('转场程序链接失败');
    gl.useProgram(program);
    buffer = gl.createBuffer();
    if (!buffer) throw new Error('无法创建转场缓冲');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, 'position');
    const from = gl.getUniformLocation(program, 'fromFrame');
    const to = gl.getUniformLocation(program, 'toFrame');
    const progress = gl.getUniformLocation(program, 'progress');
    if (position < 0 || from === null || to === null || progress === null)
      throw new Error('转场程序缺少输入');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    [from, to].forEach((uniform, index) => {
      const texture = gl.createTexture();
      if (!texture) throw new Error('无法创建转场纹理');
      textures.push(texture);
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.uniform1i(uniform, index);
    });
    return {
      render(fromMedia, toMedia, at) {
        if (gl.isContextLost()) return false;
        [fromMedia, toMedia].forEach((media, index) => {
          gl.activeTexture(gl.TEXTURE0 + index);
          gl.bindTexture(gl.TEXTURE_2D, textures[index]);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, media);
        });
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform1f(progress, at);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        return gl.getError() === gl.NO_ERROR;
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** Source gn: compose into a backing surface, then present only a complete frame. */
export function createClipTransitionRenderer(output, type) {
  const context = output.getContext('2d');
  if (!context) throw new Error('当前浏览器无法绘制转场');
  const backing = document.createElement('canvas');
  backing.width = output.width;
  backing.height = output.height;
  const dissolve = type === 'dissolve' ? createDissolveRenderer(backing) : null;
  const paint = dissolve ? null : backing.getContext('2d');
  if (!dissolve && !paint) throw new Error('当前浏览器无法绘制转场');
  let live = true;
  const cover = (media) => {
    const ratio = Math.max(backing.width / media.videoWidth, backing.height / media.videoHeight);
    const width = media.videoWidth * ratio,
      height = media.videoHeight * ratio;
    paint.drawImage(
      media,
      (backing.width - width) / 2,
      (backing.height - height) / 2,
      width,
      height,
    );
  };
  return {
    render(from, to, progress) {
      if (
        !live ||
        !from.videoWidth ||
        !to.videoWidth ||
        from.seeking ||
        to.seeking ||
        from.readyState < 2 ||
        to.readyState < 2
      )
        return false;
      const at = Math.min(1, Math.max(0, progress));
      try {
        if (dissolve) {
          if (!dissolve.render(from, to, at)) return false;
        } else {
          paint.globalAlpha = 1;
          paint.fillStyle = '#000000';
          paint.fillRect(0, 0, backing.width, backing.height);
          if (type === 'fade') {
            cover(from);
            paint.globalAlpha = at;
            cover(to);
          } else {
            cover(at < 0.5 ? from : to);
            paint.globalAlpha = at < 0.5 ? 2 * at : 2 * (1 - at);
            paint.fillStyle = type === 'fadeblack' ? '#000000' : '#ffffff';
            paint.fillRect(0, 0, backing.width, backing.height);
          }
          paint.globalAlpha = 1;
        }
        context.clearRect(0, 0, output.width, output.height);
        context.drawImage(backing, 0, 0);
        return true;
      } catch {
        return false;
      }
    },
    dispose() {
      if (!live) return;
      live = false;
      dissolve?.dispose();
      backing.width = backing.height = 0;
      output.width = output.height = 0;
    },
  };
}
