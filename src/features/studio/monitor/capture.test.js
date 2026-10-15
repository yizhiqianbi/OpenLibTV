// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createMonitorCapture } from './capture.js';
import {
  fitMonitorTopCamera,
  monitorCamera,
  monitorCameras,
  restoreViewport3dView,
} from './cameras.js';
import { MONITOR_ORBIT, MONITOR_TOP, monitorDimensions } from './model.js';
import { monitorFixture } from './__fixtures__/runtime.js';
import { disposeObjectTree } from '../scene-resources.js';

describe('viewport-owned actual scene monitor capture', () => {
  it('applies the main AgX/exposure/display transform before byte readback without double encoding RGB or alpha', () => {
    const { runtime, createCanvas, state } = monitorFixture();
    runtime.renderer.outputColorSpace = THREE.SRGBColorSpace;
    runtime.renderer.toneMapping = THREE.AgXToneMapping;
    runtime.renderer.toneMappingExposure = 1.35;
    const sourceMaterial = [...runtime.content.children][0].children[0].material;
    runtime.renderer.render.mockImplementation((object) => {
      if (object === runtime.scene) {
        expect(state.target.texture.type).toBe(THREE.HalfFloatType);
        return;
      }
      const output = object.material;
      expect(output.isRawShaderMaterial).toBe(true);
      expect(output.defines).toEqual({ AGX_TONE_MAPPING: '', SRGB_TRANSFER: '' });
      expect(output.uniforms.toneMappingExposure.value).toBe(1.35);
      expect(output.uniforms.tDiffuse.value.type).toBe(THREE.HalfFloatType);
      expect(state.target.texture.type).toBe(THREE.UnsignedByteType);
      // The shader already encodes display RGB; the byte target must not encode it again.
      expect(state.target.texture.colorSpace).toBe(THREE.NoColorSpace);
    });
    runtime.renderer.readRenderTargetPixels.mockImplementation(
      (_target, _x, _y, _width, _height, pixels) => {
        for (let offset = 0; offset < pixels.length; offset += 4)
          pixels.set([55, 128, 255, 127], offset);
      },
    );
    const capture = createMonitorCapture(runtime, { createCanvas });
    capture.capture(MONITOR_TOP, 16);
    expect([...state.canvases[0].context.putImageData.mock.calls[0][0].data.slice(0, 4)]).toEqual([
      55, 128, 255, 127,
    ]);
    expect(runtime.renderer.render).toHaveBeenCalledTimes(2);
    expect(runtime.renderer.toneMapping).toBe(THREE.AgXToneMapping);
    expect(runtime.renderer.toneMappingExposure).toBe(1.35);
    expect(runtime.renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect([...runtime.content.children][0].children[0].material).toBe(sourceMaterial);
    capture.dispose();
    disposeObjectTree(runtime.scene);
  });
  it('renders actual authored/world camera copies, flips pixels, respects DPR and restores every main renderer state', () => {
    const { runtime, createCanvas, state, cameras } = monitorFixture({ pixelRatio: 2 });
    const parent = new THREE.Group();
    parent.position.set(4, 0, -3);
    parent.rotation.y = 0.4;
    runtime.content.add(parent);
    parent.add(cameras[0]);
    runtime.content.updateMatrixWorld(true);
    const authoredPosition = cameras[0].position.clone(),
      authoredQuaternion = cameras[0].quaternion.clone(),
      authoredProjection = cameras[0].projectionMatrix.clone();
    const savedViewport = state.viewport.clone(),
      savedScissor = state.scissor.clone(),
      savedColor = state.clearColor.clone();
    const size = monitorDimensions(216, cameras[0].aspect, 2);
    runtime.renderer.render.mockImplementation((scene, camera) => {
      if (scene !== runtime.scene) return;
      expect(scene).toBe(runtime.scene);
      expect(camera).not.toBe(cameras[0]);
      expect(
        camera.position.distanceTo(cameras[0].getWorldPosition(new THREE.Vector3())),
      ).toBeLessThan(1e-6);
      expect(
        camera.quaternion.angleTo(cameras[0].getWorldQuaternion(new THREE.Quaternion())),
      ).toBeLessThan(1e-6);
      expect(state.physicalViewport.toArray()).toEqual([0, 0, size.width, size.height]);
      for (const helper of [
        runtime.helper,
        runtime.cameraHelpers,
        runtime.gridHelper,
        runtime.axes,
      ])
        expect(helper.visible).toBe(false);
      expect(runtime.renderer.xr.enabled).toBe(false);
      expect(runtime.renderer.autoClear).toBe(true);
    });
    const capture = createMonitorCapture(runtime, { createCanvas });
    expect(capture.capture('camera1', 216)).toBe('data:image/jpeg;base64,frame1');
    expect(state.targets.size).toBe(2);
    const target = [...state.targets][1];
    expect(target).toBeInstanceOf(THREE.WebGLRenderTarget);
    const { context, canvas } = state.canvases[0];
    const image = context.putImageData.mock.calls[0][0];
    expect(image.data[0]).toBe(size.height);
    expect(image.data[(size.height - 1) * size.width * 4]).toBe(1);
    expect(canvas.toDataURL).toHaveBeenCalledExactlyOnceWith('image/jpeg', 0.72);
    expect(state.target).toBeNull();
    expect(state.viewport.equals(savedViewport)).toBe(true);
    expect(state.scissor.equals(savedScissor)).toBe(true);
    expect(state.scissorTest).toBe(true);
    expect(state.clearColor.equals(savedColor)).toBe(true);
    expect(state.clearAlpha).toBe(0.4);
    expect(runtime.renderer.autoClear).toBe(false);
    expect(runtime.renderer.xr.enabled).toBe(true);
    expect([
      runtime.helper.visible,
      runtime.cameraHelpers.visible,
      runtime.gridHelper.visible,
      runtime.axes.visible,
    ]).toEqual([true, true, true, false]);
    expect(cameras[0].position.equals(authoredPosition)).toBe(true);
    expect(cameras[0].quaternion.equals(authoredQuaternion)).toBe(true);
    expect(cameras[0].projectionMatrix.equals(authoredProjection)).toBe(true);
    capture.dispose();
    disposeObjectTree(runtime.scene);
  });

  it('reuses HDR/output targets and one readback; failure restores helpers/state and releases only owned resources', () => {
    const { runtime, createCanvas, state, mesh } = monitorFixture();
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
    const capture = createMonitorCapture(runtime, { createCanvas });
    capture.capture(MONITOR_TOP, 216);
    const source = [...state.targets][0],
      sourceDispose = vi.fn(),
      target = [...state.targets][1],
      targetDispose = vi.fn();
    source.addEventListener('dispose', sourceDispose);
    target.addEventListener('dispose', targetDispose);
    const outputMaterial = runtime.renderer.render.mock.calls[1][0].material;
    const outputDispose = vi.spyOn(outputMaterial, 'dispose');
    capture.capture('camera1', 216);
    expect(state.targets.size).toBe(2);
    expect(state.canvases).toHaveLength(1);
    runtime.renderer.render.mockImplementationOnce(() => {
      throw Error('GPU');
    });
    expect(capture.capture('camera2', 216)).toBeNull();
    expect(state.target).toBeNull();
    expect(runtime.helper.visible).toBe(true);
    expect(state.scissorTest).toBe(true);
    expect(runtime.renderer.autoClear).toBe(false);
    capture.release();
    expect(targetDispose).toHaveBeenCalledOnce();
    expect(sourceDispose).toHaveBeenCalledOnce();
    expect(outputDispose).toHaveBeenCalledOnce();
    expect(state.canvases[0].canvas.width).toBe(0);
    expect(state.canvases[0].canvas.height).toBe(0);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(runtime.renderer.dispose).not.toHaveBeenCalled();
    capture.capture('camera1', 216);
    expect(state.targets.size).toBe(4);
    const next = [...state.targets][3],
      nextDispose = vi.fn();
    next.addEventListener('dispose', nextDispose);
    capture.dispose();
    capture.dispose();
    expect(nextDispose).toHaveBeenCalledOnce();
    expect(capture.capture('camera1', 216)).toBeNull();
    disposeObjectTree(runtime.scene);
    expect(geometryDispose).toHaveBeenCalledOnce();
  });

  it('uses fitted top view and previous 3D view without modifying authored transforms; hidden parent cameras are excluded', () => {
    const { runtime, cameras } = monitorFixture();
    runtime.monitor3dView = {
      camera: runtime.camera.clone(false),
      target: runtime.orbit.target.clone(),
    };
    const previous = runtime.camera.position.clone();
    const top = monitorCamera(runtime, MONITOR_TOP);
    expect(top.position.y).toBeGreaterThan(0.5);
    expect(top.up.toArray()).toEqual([0, 0, -1]);
    expect(top.aspect).toBe(16 / 9);
    expect(runtime.camera.position.equals(previous)).toBe(true);
    fitMonitorTopCamera(runtime.camera, runtime.content, 1.25);
    const orbit = monitorCamera(runtime, MONITOR_ORBIT);
    expect(orbit.position.equals(previous)).toBe(true);
    expect(orbit.aspect).toBe(16 / 9);
    restoreViewport3dView(runtime);
    expect(runtime.camera.position.equals(previous)).toBe(true);
    expect(runtime.camera.aspect).toBe(1.25);
    expect(runtime.orbit.target.toArray()).toEqual([0, 1, 0]);
    expect(runtime.monitor3dView).toBeNull();
    const hidden = new THREE.Group();
    hidden.visible = false;
    hidden.add(cameras[1]);
    runtime.content.add(hidden);
    expect(monitorCameras(runtime)).toEqual([{ id: 'camera1', name: 'Actual 1' }]);
    expect(monitorCamera(runtime, 'missing')).toBeNull();
    disposeObjectTree(runtime.scene);
  });
});
