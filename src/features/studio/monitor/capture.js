import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { monitorCamera } from './cameras.js';
import { monitorDimensions } from './model.js';

/** Viewport-owned HDR/output targets and readback; borrows the existing renderer and scene. */
export function createMonitorCapture(
  runtime,
  { createCanvas = () => document.createElement('canvas') } = {},
) {
  let target = null,
    sceneTarget = null,
    outputPass = null,
    canvas = null,
    context = null,
    pixels = null,
    image = null;
  let active = true;
  const release = () => {
    target?.dispose();
    sceneTarget?.dispose();
    outputPass?.dispose();
    target = sceneTarget = outputPass = null;
    if (canvas) canvas.width = canvas.height = 0;
    canvas = context = pixels = image = null;
  };
  return {
    capture(key, width) {
      if (!active) return null;
      const camera = monitorCamera(runtime, key);
      if (!camera) return null;
      const { renderer, scene } = runtime;
      const size = monitorDimensions(
        width,
        camera.aspect,
        renderer.getPixelRatio(),
        renderer.capabilities?.maxTextureSize,
      );
      const saved = {
        target: renderer.getRenderTarget(),
        viewport: renderer.getViewport(new THREE.Vector4()),
        scissor: renderer.getScissor(new THREE.Vector4()),
        scissorTest: renderer.getScissorTest(),
        clearColor: renderer.getClearColor(new THREE.Color()),
        clearAlpha: renderer.getClearAlpha(),
        autoClear: renderer.autoClear,
        xrEnabled: renderer.xr?.enabled,
      };
      const helpers = [
        runtime.helper,
        runtime.cameraHelpers,
        runtime.gridHelper,
        runtime.axes,
        runtime.selectionController?.helper,
      ].filter(Boolean);
      const visibility = helpers.map((helper) => helper.visible);
      try {
        if (!target) {
          // Preserve highlights until the same output transform used by the main viewport.
          sceneTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
            type: THREE.HalfFloatType,
          });
          target = new THREE.WebGLRenderTarget(size.width, size.height, {
            depthBuffer: false,
          });
          outputPass = new OutputPass();
        } else if (target.width !== size.width || target.height !== size.height) {
          sceneTarget.setSize(size.width, size.height);
          target.setSize(size.width, size.height);
        }
        if (!canvas) {
          canvas = createCanvas();
          context = canvas.getContext('2d');
        }
        if (!context) return null;
        if (canvas.width !== size.width || canvas.height !== size.height || !pixels) {
          canvas.width = size.width;
          canvas.height = size.height;
          pixels = new Uint8Array(size.width * size.height * 4);
          image = context.createImageData(size.width, size.height);
        }
        for (const helper of helpers) helper.visible = false;
        if (renderer.xr) renderer.xr.enabled = false;
        renderer.autoClear = true;
        renderer.setRenderTarget(sceneTarget);
        // setViewport always applies renderer DPR, including while a target is bound.
        const pixelRatio = renderer.getPixelRatio();
        renderer.setViewport(0, 0, size.width / pixelRatio, size.height / pixelRatio);
        renderer.setScissorTest(false);
        renderer.render(scene, camera);
        // Ordinary targets bypass renderer tone mapping and display encoding in Three.
        // OutputPass uses the renderer's exact AgX/exposure/color settings on the GPU.
        outputPass.render(renderer, target, sceneTarget);
        renderer.readRenderTargetPixels(target, 0, 0, size.width, size.height, pixels);
        const stride = size.width * 4;
        for (let row = 0; row < size.height; row++)
          image.data.set(
            pixels.subarray((size.height - row - 1) * stride, (size.height - row) * stride),
            row * stride,
          );
        context.putImageData(image, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.72);
      } catch {
        // A failed thumbnail retains its previous frame; it must never interrupt the main viewport.
        return null;
      } finally {
        helpers.forEach((helper, index) => {
          helper.visible = visibility[index];
        });
        renderer.setRenderTarget(saved.target);
        renderer.setViewport(saved.viewport);
        renderer.setScissor(saved.scissor);
        renderer.setScissorTest(saved.scissorTest);
        renderer.setClearColor(saved.clearColor, saved.clearAlpha);
        renderer.autoClear = saved.autoClear;
        if (renderer.xr) renderer.xr.enabled = saved.xrEnabled;
      }
    },
    release,
    dispose() {
      active = false;
      release();
    },
  };
}
