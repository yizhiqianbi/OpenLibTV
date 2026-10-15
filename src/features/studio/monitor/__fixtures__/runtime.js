import * as THREE from 'three';
import { vi } from 'vitest';

export function monitorFixture({ pixelRatio = 1, cameraCount = 2 } = {}) {
  const scene = new THREE.Scene(),
    content = new THREE.Group();
  scene.add(content);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ color: '#f60' }),
  );
  const model = new THREE.Group();
  model.add(mesh);
  content.add(model);
  const camera = new THREE.PerspectiveCamera(45, 1.25, 0.01, 1000);
  camera.position.set(5, 4, 6);
  camera.lookAt(0, 1, 0);
  const entities = new Map([['model', model]]);
  const cameras = [];
  for (let index = 0; index < cameraCount; index++) {
    const authored = new THREE.PerspectiveCamera(50 + index, 16 / 9, 0.01, 1000);
    authored.name = `Actual ${index + 1}`;
    authored.position.set(index * 3, 2, 7);
    authored.lookAt(0, 0, 0);
    content.add(authored);
    entities.set(`camera${index + 1}`, authored);
    cameras.push(authored);
  }
  const helper = new THREE.Object3D(),
    cameraHelpers = new THREE.Group(),
    gridHelper = new THREE.Object3D(),
    axes = new THREE.Object3D();
  scene.add(helper, cameraHelpers, gridHelper, axes);
  axes.visible = false;
  const state = {
    target: null,
    viewport: new THREE.Vector4(10, 20, 400, 300),
    physicalViewport: new THREE.Vector4(10, 20, 400, 300).multiplyScalar(pixelRatio),
    scissor: new THREE.Vector4(11, 21, 398, 298),
    scissorTest: true,
    clearColor: new THREE.Color('#aabbcc'),
    clearAlpha: 0.4,
    targets: new Set(),
    canvases: [],
    reads: [],
  };
  const renderer = {
    autoClear: false,
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: THREE.LinearSRGBColorSpace,
    xr: { enabled: true },
    shadowMap: { enabled: true },
    capabilities: { maxTextureSize: 4096 },
    getPixelRatio: () => pixelRatio,
    getRenderTarget: () => state.target,
    getViewport: (value) => value.copy(state.viewport),
    getScissor: (value) => value.copy(state.scissor),
    getScissorTest: () => state.scissorTest,
    getClearColor: (value) => value.copy(state.clearColor),
    getClearAlpha: () => state.clearAlpha,
    setRenderTarget: vi.fn((value) => {
      state.target = value;
      if (value) state.targets.add(value);
    }),
    setViewport: vi.fn((x, y, z, w) => {
      state.viewport.copy(x?.isVector4 ? x : new THREE.Vector4(x, y, z, w));
      state.physicalViewport.copy(state.viewport).multiplyScalar(pixelRatio).round();
    }),
    setScissor: vi.fn((value) => state.scissor.copy(value)),
    setScissorTest: vi.fn((value) => {
      state.scissorTest = value;
    }),
    setClearColor: vi.fn((color, alpha) => {
      state.clearColor.copy(color);
      state.clearAlpha = alpha;
    }),
    render: vi.fn(),
    readRenderTargetPixels: vi.fn((target, x, y, width, height, pixels) => {
      for (let row = 0; row < height; row++)
        pixels.fill(row + 1, row * width * 4, (row + 1) * width * 4);
      state.reads.push({ target, width, height });
    }),
    dispose: vi.fn(),
  };
  let sequence = 0;
  const createCanvas = () => {
    const canvas = {
      width: 0,
      height: 0,
      toDataURL: vi.fn(() => `data:image/jpeg;base64,frame${++sequence}`),
    };
    const context = {
      canvas,
      createImageData: (width, height) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: vi.fn(),
    };
    canvas.getContext = vi.fn(() => context);
    state.canvases.push({ canvas, context });
    return canvas;
  };
  return {
    runtime: {
      scene,
      content,
      camera,
      entities,
      helper,
      cameraHelpers,
      gridHelper,
      axes,
      renderer,
      orbit: { target: new THREE.Vector3(0, 1, 0), update: vi.fn() },
    },
    createCanvas,
    state,
    mesh,
    model,
    cameras,
  };
}
