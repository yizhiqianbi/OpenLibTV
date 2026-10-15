import { renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useViewportScene } from './useViewportScene.js';
import { createViewportCommands } from '../viewport-commands.js';

const state = vi.hoisted(() => ({ renderers: [], observers: [] }));
vi.mock('../viewport-lighting.js', async (importOriginal) => {
  const lighting = await importOriginal();
  return {
    ...lighting,
    createViewportLighting: (args) =>
      lighting.createViewportLighting({ ...args, createEnvironment: () => null }),
  };
});

vi.mock('three', async (importOriginal) => {
  const three = await importOriginal();
  return {
    ...three,
    WebGLRenderer: class {
      constructor() {
        this.shadowMap = {};
        this.domElement = document.createElement('canvas');
        this.domElement.toDataURL = vi.fn(() => 'data:image/png;base64,frame');
        this.size = new three.Vector2();
        this.setSize = vi.fn((width, height) => this.size.set(width, height));
        this.getSize = (size) => size.copy(this.size);
        this.setPixelRatio = vi.fn();
        this.setScissorTest = vi.fn();
        this.setViewport = vi.fn();
        this.setScissor = vi.fn();
        this.setClearColor = vi.fn();
        this.clear = vi.fn();
        this.render = vi.fn();
        this.dispose = vi.fn();
        state.renderers.push(this);
      }
    },
  };
});
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const { Vector3 } = await import('three');
  return {
    OrbitControls: class {
      constructor() {
        this.target = new Vector3();
        this.update = vi.fn();
        this.dispose = vi.fn();
      }
    },
  };
});
vi.mock('three/addons/controls/TransformControls.js', async () => {
  const { EventDispatcher, Group } = await import('three');
  return {
    TransformControls: class extends EventDispatcher {
      constructor() {
        super();
        this.helper = new Group();
        this.dragging = false;
        this.setSize = vi.fn();
        this.dispose = vi.fn();
      }
      getHelper() {
        return this.helper;
      }
      detach() {
        this.object = null;
      }
    },
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  state.renderers.length = 0;
  state.observers.length = 0;
});

it('keeps frame/capture borrowing one current runtime while StrictMode and unmount own all resources', () => {
  let id = 0;
  const pending = new Map();
  const schedule = vi.fn((callback) => {
    pending.set(++id, callback);
    return id;
  });
  const cancel = vi.fn((key) => pending.delete(key));
  vi.stubGlobal('requestAnimationFrame', schedule);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor() {
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        state.observers.push(this);
      }
    },
  );
  const root = document.createElement('div');
  root.getBoundingClientRect = () => ({ width: 1000, height: 800 });
  const host = { current: root };
  const runtime = { current: null };
  const latest = {
    current: {
      objects: [],
      frames: [],
      cameraPaths: [],
      cameraTimeline: null,
      mode: 'select',
      time: 0,
      selected: null,
      viewMode: 'orbit',
      grid: true,
      ratio: '16:9',
    },
  };
  const { unmount } = renderHook(() => useViewportScene({ host, latest, runtime }), {
    reactStrictMode: true,
  });
  expect(state.renderers).toHaveLength(2);
  expect(state.renderers[0].dispose).toHaveBeenCalledOnce();
  expect(state.observers[0].disconnect).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledWith(1);
  expect(root.querySelectorAll('canvas')).toHaveLength(1);

  const rt = runtime.current;
  const spec = {
    id: 'current-camera',
    name: 'Current Camera',
    type: 'camera',
    position: [2, 3, 4],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
  latest.current = {
    ...latest.current,
    objects: [spec],
    ratio: '9:16',
    viewMode: spec.id,
    time: 3,
  };
  rt.entityController.reconcile([spec]);
  const disposeCamera = vi.spyOn(rt.cameraController, 'dispose');
  const disposeEntities = vi.spyOn(rt.entityController, 'dispose');
  const disposeSelection = vi.spyOn(rt.selectionController, 'dispose');
  const disposeNavigation = vi.spyOn(rt.navigation, 'dispose');
  const removeListener = vi.spyOn(rt.renderer.domElement, 'removeEventListener');
  const helpersGeometry = rt.gridHelper.geometry;
  const disposeGeometry = vi.spyOn(helpersGeometry, 'dispose');

  const capture = createViewportCommands(runtime).capture();
  expect(capture).toBe('data:image/png;base64,frame');
  expect(rt.renderer.render).toHaveBeenLastCalledWith(rt.scene, rt.entities.get(spec.id));
  expect(rt.entities.get(spec.id).aspect).toBe(9 / 16);
  expect(rt.content.userData.libtvProjectAspect).toBe(9 / 16);
  expect(schedule).toHaveBeenCalledTimes(2);
  expect(disposeCamera).not.toHaveBeenCalled();
  expect(disposeEntities).not.toHaveBeenCalled();

  // TransformControls can clear dragging before our pointerup handler runs.
  // Remember the gesture so dropping a gizmo never selects through it.
  const onSelect = vi.fn();
  latest.current.onSelect = onSelect;
  rt.transform.dragging = true;
  rt.renderer.domElement.dispatchEvent(
    new MouseEvent('pointerdown', { button: 0, clientX: 50, clientY: 50 }),
  );
  rt.transform.dragging = false;
  rt.renderer.domElement.dispatchEvent(
    new MouseEvent('pointerup', { button: 0, clientX: 50, clientY: 50 }),
  );
  rt.renderer.domElement.dispatchEvent(
    new MouseEvent('pointerdown', { button: 1, clientX: 50, clientY: 50 }),
  );
  rt.renderer.domElement.dispatchEvent(
    new MouseEvent('pointerup', { button: 1, clientX: 50, clientY: 50 }),
  );
  expect(onSelect).not.toHaveBeenCalled();

  pending.get(2)();
  expect(schedule).toHaveBeenCalledTimes(3);
  expect(rt.renderer.render).toHaveBeenLastCalledWith(rt.scene, rt.entities.get(spec.id));
  unmount();

  expect(runtime.current).toBeNull();
  expect(disposeCamera).toHaveBeenCalledOnce();
  expect(disposeEntities).toHaveBeenCalledOnce();
  expect(disposeSelection).toHaveBeenCalledOnce();
  expect(disposeNavigation).toHaveBeenCalledOnce();
  expect(rt.orbit.dispose).toHaveBeenCalledOnce();
  expect(rt.transform.dispose).toHaveBeenCalledOnce();
  expect(rt.helper.parent).toBeNull();
  expect(disposeGeometry).toHaveBeenCalledOnce();
  expect(state.observers[1].disconnect).toHaveBeenCalledOnce();
  expect(rt.renderer.dispose).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenLastCalledWith(3);
  expect(removeListener.mock.calls.map(([type]) => type)).toEqual(
    expect.arrayContaining(['pointerdown', 'pointerup', 'pointercancel']),
  );
  expect(root.querySelectorAll('canvas')).toHaveLength(0);
});
