// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { renderViewportFrame } from './viewport-frame.js';
import { cameraPreviewFrame } from './camera/model.js';

function fixture() {
  const scene = new THREE.Scene();
  const content = new THREE.Group();
  const camera = new THREE.PerspectiveCamera();
  const filmCamera = new THREE.PerspectiveCamera();
  const wrapper = new THREE.Group();
  wrapper.userData.entityId = 'model';
  const animated = new THREE.Object3D();
  wrapper.add(animated);
  content.add(wrapper, filmCamera);
  const gridHelper = new THREE.Object3D();
  const axes = new THREE.Object3D();
  const cameraHelpers = new THREE.Group();
  const helper = new THREE.Object3D();
  scene.add(content, gridHelper, axes, cameraHelpers, helper);
  const runtime = {
    scene,
    content,
    camera,
    entities: new Map([['model', wrapper]]),
    gridHelper,
    axes,
    cameraHelpers,
    helper,
    orbit: { enabled: true, update: vi.fn() },
    transform: { enabled: true, dragging: false, object: wrapper },
    entityController: { seekAnimations: vi.fn(), dispose: vi.fn() },
    cameraController: {
      seek: vi.fn(),
      renderCamera: vi.fn((mode) => (mode === 'film' ? filmCamera : camera)),
      dispose: vi.fn(),
    },
    renderer: {
      getSize: (size) => size.set(1000, 800),
      setViewport: vi.fn(),
      setScissor: vi.fn(),
      setScissorTest: vi.fn(),
      setClearColor: vi.fn(),
      clear: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    },
  };
  const spec = {
    id: 'model',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
  const data = {
    objects: [spec],
    frames: [
      { ...spec, objectId: spec.id, time: 0 },
      {
        objectId: spec.id,
        time: 2,
        position: [4, 2, 0],
        rotation: [0, 90, 0],
        scale: [3, 3, 3],
      },
    ],
    selected: spec.id,
    time: 1,
    animationSelection: { objectId: spec.id, index: 0 },
    viewMode: 'orbit',
    grid: true,
    ratio: '16:9',
    cameraTimeline: { duration: 6 },
  };
  return { runtime, data, wrapper, animated, filmCamera };
}

describe('borrowed Studio viewport frame', () => {
  it('seeks real imported animation before wrapper transforms and camera paths without taking resource ownership', () => {
    const { runtime, data, wrapper, animated } = fixture();
    const clip = new THREE.AnimationClip('Imported', 2, [
      new THREE.VectorKeyframeTrack(`${animated.uuid}.position`, [0, 2], [0, 0, 0, 6, 0, 0]),
    ]);
    const mixer = new THREE.AnimationMixer(wrapper);
    const action = mixer.clipAction(clip).play();
    const order = [];
    runtime.entityController.seekAnimations.mockImplementation((time, selection) => {
      order.push('clip');
      expect(selection).toBe(data.animationSelection);
      expect(wrapper.position.toArray()).toEqual([0, 0, 0]);
      action.time = time;
      mixer.update(0);
    });
    runtime.cameraController.seek.mockImplementation((time, selected, dragging) => {
      order.push('camera');
      expect([time, selected, dragging]).toEqual([1, 'model', null]);
      expect(wrapper.position.toArray()).toEqual([2, 1, 0]);
      expect(wrapper.rotation.y).toBeCloseTo(Math.PI / 4);
      expect(wrapper.scale.toArray()).toEqual([2, 2, 2]);
      expect(animated.position.toArray()).toEqual([3, 0, 0]);
    });
    runtime.renderer.render.mockImplementation(() => order.push('render'));

    renderViewportFrame(runtime, data);

    expect(order).toEqual(['clip', 'camera', 'render']);
    expect(runtime.orbit.update).toHaveBeenCalledOnce();
    expect(runtime.renderer.render).toHaveBeenCalledWith(runtime.scene, runtime.camera);
    expect(runtime.renderer.setViewport).toHaveBeenCalledExactlyOnceWith(0, 0, 1000, 800);
    for (const owner of [runtime.entityController, runtime.cameraController, runtime.renderer])
      expect(owner.dispose).not.toHaveBeenCalled();
    mixer.stopAllAction();
    mixer.uncacheRoot(wrapper);
  });

  it('shares the exact source camera frame and aspect while temporarily hiding helper geometry', () => {
    const { runtime, data, filmCamera } = fixture();
    const frame = cameraPreviewFrame(1000, 800, 4 / 3);
    runtime.renderer.render.mockImplementation((scene, camera) => {
      expect(scene).toBe(runtime.scene);
      expect(camera).toBe(filmCamera);
      for (const helper of [
        runtime.cameraHelpers,
        runtime.helper,
        runtime.gridHelper,
        runtime.axes,
      ])
        expect(helper.visible).toBe(false);
    });

    renderViewportFrame(runtime, { ...data, viewMode: 'film', ratio: '4:3' });

    expect(filmCamera.aspect).toBe(4 / 3);
    expect(filmCamera.userData.blockingStudioAspect).toBe(4 / 3);
    expect(runtime.content.userData.libtvProjectAspect).toBe(4 / 3);
    expect(runtime.renderer.setViewport).toHaveBeenLastCalledWith(
      frame.left,
      800 - frame.top - frame.height,
      frame.width,
      frame.height,
    );
    expect(runtime.renderer.setScissor).toHaveBeenCalledWith(
      frame.left,
      800 - frame.top - frame.height,
      frame.width,
      frame.height,
    );
    expect(runtime.renderer.setScissorTest.mock.calls.map(([enabled]) => enabled)).toEqual([
      false,
      true,
      false,
    ]);
    expect(runtime.cameraHelpers.visible).toBe(true);
    expect(runtime.helper.visible).toBe(true);
    expect(runtime.orbit.enabled).toBe(false);
    expect(runtime.transform.enabled).toBe(false);
    expect(runtime.orbit.update).not.toHaveBeenCalled();

    runtime.renderer.render.mockReset();
    renderViewportFrame(runtime, { ...data, grid: true });
    expect(runtime.gridHelper.visible).toBe(true);
    expect(runtime.axes.visible).toBe(true);
    expect(runtime.transform.enabled).toBe(true);
    expect(runtime.renderer.render).toHaveBeenCalledWith(runtime.scene, runtime.camera);
  });

  it('preserves a live transform drag and passes its entity ID to the camera controller', () => {
    const { runtime, data, wrapper } = fixture();
    runtime.transform.dragging = true;
    wrapper.position.set(8, 7, 6);

    renderViewportFrame(runtime, data);

    expect(wrapper.position.toArray()).toEqual([8, 7, 6]);
    expect(runtime.entityController.seekAnimations).toHaveBeenCalledWith(
      1,
      data.animationSelection,
    );
    expect(runtime.cameraController.seek).toHaveBeenCalledWith(1, 'model', 'model');
    expect(runtime.orbit.enabled).toBe(false);
    expect(runtime.orbit.update).not.toHaveBeenCalled();
    expect(runtime.transform.enabled).toBe(true);
  });

  it('restores helper and scissor state after a render failure without swallowing or disposing resources', () => {
    const { runtime, data } = fixture();
    const error = new Error('GPU frame failed');
    runtime.helper.visible = false;
    runtime.renderer.render.mockImplementation(() => {
      throw error;
    });

    expect(() => renderViewportFrame(runtime, { ...data, viewMode: 'film' })).toThrow(error);

    expect(runtime.renderer.setScissorTest).toHaveBeenLastCalledWith(false);
    expect(runtime.cameraHelpers.visible).toBe(true);
    expect(runtime.helper.visible).toBe(false);
    expect(runtime.renderer.dispose).not.toHaveBeenCalled();
  });
});
