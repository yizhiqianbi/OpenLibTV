// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createStudioMonitorController } from './runtime.js';
import { MONITOR_TOP } from './model.js';
import { monitorFixture } from './__fixtures__/runtime.js';
import { disposeObjectTree } from '../scene-resources.js';

function coordinatorFixture() {
  const fixture = monitorFixture({ cameraCount: 3 });
  let request = {
    sceneKey: 'one',
    topView: true,
    cameraIds: ['camera1', 'camera2', 'camera3'],
    thumbnailWidth: 216,
  };
  const emit = vi.fn();
  const data = {
    monitor: { request: () => request, emit },
    time: 0,
    viewMode: 'orbit',
    playing: false,
  };
  const controller = createStudioMonitorController(fixture.runtime, {
    createCanvas: fixture.createCanvas,
  });
  return {
    ...fixture,
    controller,
    data,
    emit,
    request: (value) => {
      request = value;
    },
  };
}

const sceneRenderCount = (runtime) =>
  runtime.renderer.render.mock.calls.filter(([scene]) => scene === runtime.scene).length;

describe('source monitor refresh coordination', () => {
  it('captures only requested actual scene cameras, at most two/frame; signatures update transforms/materials and camera names', () => {
    const { runtime, controller, data, emit, cameras, mesh } = coordinatorFixture();
    controller.tick(data, 0);
    expect(sceneRenderCount(runtime)).toBe(2);
    expect(Object.keys(emit.mock.lastCall[0].frames)).toEqual([MONITOR_TOP, 'camera1']);
    controller.tick(data, 16);
    expect(sceneRenderCount(runtime)).toBe(4);
    controller.tick(data, 32);
    expect(sceneRenderCount(runtime)).toBe(4);
    mesh.position.x = 3;
    mesh.material.color.set('#0f6');
    cameras[0].name = 'Renamed live';
    controller.tick(data, 499);
    expect(sceneRenderCount(runtime)).toBe(4);
    controller.tick(data, 500);
    expect(sceneRenderCount(runtime)).toBe(6);
    expect(emit.mock.lastCall[0].cameras[0].name).toBe('Renamed live');
    expect(emit.mock.lastCall[0].frames.camera1).toBe('data:image/jpeg;base64,frame6');
    controller.tick(data, 516);
    expect(sceneRenderCount(runtime)).toBe(8);
    controller.dispose();
    disposeObjectTree(runtime.scene);
  });

  it('updates the active shot at 24fps without an extra RAF and preserves successful frames after failures', () => {
    const { runtime, controller, data, emit } = coordinatorFixture();
    data.cameraTimeline = {
      duration: 6,
      shots: [
        { cameraId: 'camera1', start: 0, end: 3 },
        { cameraId: 'camera2', start: 3, end: 6 },
      ],
    };
    data.playing = true;
    controller.tick(data, 0);
    controller.tick(data, 16);
    expect(sceneRenderCount(runtime)).toBe(4);
    controller.tick(data, 40);
    expect(sceneRenderCount(runtime)).toBe(4);
    controller.tick(data, 42);
    expect(sceneRenderCount(runtime)).toBe(5);
    const frame = emit.mock.lastCall[0].frames.camera1;
    runtime.renderer.render.mockImplementationOnce(() => {
      throw Error('readback failed');
    });
    controller.tick(data, 84);
    expect(emit.mock.lastCall[0].frames.camera1).toBe(frame);
    data.time = 3.1;
    controller.tick(data, 100);
    expect(emit.mock.lastCall[0].playbackCameraId).toBe('camera2');
    expect(sceneRenderCount(runtime)).toBeLessThanOrEqual(8);
    controller.dispose();
    disposeObjectTree(runtime.scene);
  });

  it('prunes invisible/deleted cameras, releases resources on disable, isolates project frames, and ignores ticks after disposal', () => {
    const { runtime, controller, data, emit, cameras, state, request } = coordinatorFixture();
    controller.tick(data, 0);
    controller.tick(data, 16);
    cameras[0].visible = false;
    controller.tick(data, 500);
    expect(emit.mock.lastCall[0].cameras.map((camera) => camera.id)).toEqual([
      'camera2',
      'camera3',
    ]);
    expect(emit.mock.lastCall[0].frames.camera1).toBeUndefined();
    const first = [...state.targets][0],
      released = vi.fn();
    first.addEventListener('dispose', released);
    request(null);
    controller.tick(data, 520);
    expect(released).toHaveBeenCalledOnce();
    expect(emit.mock.lastCall[0].frames).toEqual({});
    request({ sceneKey: 'two', topView: true, cameraIds: [], thumbnailWidth: 216 });
    controller.tick(data, 540);
    expect(emit.mock.lastCall[0].sceneKey).toBe('two');
    expect(Object.keys(emit.mock.lastCall[0].frames)).toEqual([MONITOR_TOP]);
    const renders = runtime.renderer.render.mock.calls.length;
    const emissions = emit.mock.calls.length;
    controller.dispose();
    controller.tick(data, 600);
    expect(runtime.renderer.render).toHaveBeenCalledTimes(renders);
    expect(emit).toHaveBeenCalledTimes(emissions);
    disposeObjectTree(runtime.scene);
  });
});
