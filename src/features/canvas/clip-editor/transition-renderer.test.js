import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClipTransitionRenderer } from './transition-renderer.js';

const media = (patch = {}) => ({
  videoWidth: 200,
  videoHeight: 100,
  readyState: 2,
  seeking: false,
  ...patch,
});
const surfaces = [];
afterEach(() => {
  for (const surface of surfaces.splice(0)) surface.dispose();
});

function setup(type, webgl = null) {
  const calls = [];
  const output = document.createElement('canvas');
  output.width = output.height = 100;
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    globalAlpha: 1,
  };
  const backing = {
    globalAlpha: 1,
    fillStyle: '',
    fillRect(...args) {
      calls.push(['fill', this.globalAlpha, this.fillStyle, ...args]);
    },
    drawImage(...args) {
      calls.push(['draw', this.globalAlpha, ...args]);
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (kind) {
    return this === output ? context : kind === 'webgl' ? webgl : backing;
  });
  const surface = createClipTransitionRenderer(output, type);
  surfaces.push(surface);
  return { surface, output, context, calls };
}

describe('complete-frame transition rendering', () => {
  it('composites fade on an opaque cover-fitted backing surface before presenting it', () => {
    const c = setup('fade');
    const from = media(),
      to = media({ videoWidth: 100, videoHeight: 200 });
    expect(c.surface.render(from, to, 0.25)).toBe(true);
    expect(c.calls).toEqual([
      ['fill', 1, '#000000', 0, 0, 100, 100],
      ['draw', 1, from, -50, 0, 200, 100],
      ['draw', 0.25, to, 0, -50, 100, 200],
    ]);
    expect(c.context.drawImage).toHaveBeenCalledOnce();
  });

  it.each([
    ['fadeblack', '#000000'],
    ['fadewhite', '#ffffff'],
  ])('uses the source midpoint color for %s', (type, color) => {
    const c = setup(type),
      from = media(),
      to = media();
    c.surface.render(from, to, 0.5);
    expect(c.calls[1][2]).toBe(to);
    expect(c.calls[2]).toEqual(['fill', 1, color, 0, 0, 100, 100]);
  });

  it('refuses incomplete, seeking or failed draw frames without presenting a replacement', () => {
    const c = setup('fade');
    expect(c.surface.render(media({ readyState: 1 }), media(), 0.5)).toBe(false);
    expect(c.surface.render(media(), media({ seeking: true }), 0.5)).toBe(false);
    expect(c.context.drawImage).not.toHaveBeenCalled();
    c.context.drawImage.mockImplementation(() => {
      throw new Error('tainted');
    });
    expect(c.surface.render(media(), media(), 0.5)).toBe(false);
    c.surface.dispose();
    expect(c.output.width).toBe(0);
    expect(c.surface.render(media(), media(), 0.5)).toBe(false);
  });

  it('reports an unavailable dissolve GPU instead of substituting a fade', () => {
    expect(() => setup('dissolve')).toThrow('当前浏览器无法预览溶解转场');
  });

  it('releases both shader/texture inputs and the GPU context, including partial initialization failure', () => {
    const loseContext = vi.fn();
    let id = 0;
    const gl = Object.fromEntries(
      [
        'shaderSource',
        'compileShader',
        'deleteShader',
        'attachShader',
        'linkProgram',
        'useProgram',
        'deleteTexture',
        'deleteBuffer',
        'deleteProgram',
        'bindBuffer',
        'bufferData',
        'enableVertexAttribArray',
        'vertexAttribPointer',
        'pixelStorei',
        'activeTexture',
        'bindTexture',
        'texParameteri',
        'uniform1i',
        'texImage2D',
        'viewport',
        'uniform1f',
        'drawArrays',
      ].map((name) => [name, vi.fn()]),
    );
    Object.assign(gl, {
      TEXTURE0: 10,
      NO_ERROR: 0,
      createShader: vi.fn(() => ({ id: ++id })),
      createProgram: vi.fn(() => ({ id: ++id })),
      createBuffer: vi.fn(() => ({ id: ++id })),
      createTexture: vi.fn(() => ({ id: ++id })),
      getShaderParameter: () => true,
      getProgramParameter: () => true,
      getAttribLocation: () => 0,
      getUniformLocation: () => ({ id: ++id }),
      isContextLost: vi.fn(() => false),
      getError: () => 0,
      getExtension: () => ({ loseContext }),
    });
    const c = setup('dissolve', gl);
    expect(c.surface.render(media(), media(), 0.6)).toBe(true);
    expect(gl.texImage2D).toHaveBeenCalledTimes(2);
    gl.isContextLost.mockReturnValue(true);
    expect(c.surface.render(media(), media(), 0.6)).toBe(false);
    c.surface.dispose();
    c.surface.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.deleteBuffer).toHaveBeenCalledOnce();
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
    expect(loseContext).toHaveBeenCalledOnce();
    gl.getUniformLocation = () => null;
    expect(() => setup('dissolve', gl)).toThrow('转场程序缺少输入');
    expect(gl.deleteShader).toHaveBeenCalledTimes(4);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
    expect(loseContext).toHaveBeenCalledTimes(2);
  });
});
