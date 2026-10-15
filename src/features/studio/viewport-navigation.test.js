// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createViewportCommands } from './viewport-commands.js';
import {
  createViewportNavigation,
  fitViewportBounds,
  viewportNavigationBounds,
} from './viewport-navigation.js';

function runtimeFixture(options = {}) {
  const content = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.01, 1000);
  camera.position.set(5, 4, 6);
  camera.lookAt(0, 0, 0);
  const orbit = { target: new THREE.Vector3(), enableDamping: true, update: vi.fn() };
  const runtime = { content, camera, orbit, entities: new Map() };
  runtime.navigation = createViewportNavigation(runtime, {
    now: () => 100,
    prefersReducedMotion: () => false,
    ...options,
  });
  return runtime;
}

function expectBoundsInFrame(camera, box) {
  camera.updateMatrixWorld(true);
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const projected = new THREE.Vector3(x, y, z).project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(1);
        expect(Math.abs(projected.y)).toBeLessThan(1);
        expect(projected.z).toBeGreaterThan(-1);
        expect(projected.z).toBeLessThan(1);
      }
}

describe('viewport geometry framing', () => {
  it('frames transformed imported descendants instead of their wrapper origins in portrait and wide frusta', () => {
    const wrapper = new THREE.Group();
    wrapper.position.set(80, 10, -20);
    wrapper.rotation.y = 0.7;
    wrapper.scale.set(2, 1.5, 4);
    const nested = new THREE.Group();
    nested.position.set(15, 2, -8);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 3));
    mesh.rotation.x = 0.5;
    nested.add(mesh);
    wrapper.add(nested);
    const bounds = viewportNavigationBounds(wrapper);
    expect(bounds.getCenter(new THREE.Vector3()).distanceTo(wrapper.position)).toBeGreaterThan(20);
    for (const aspect of [0.4, 16 / 9]) {
      const camera = new THREE.PerspectiveCamera(45, aspect, 0.01, 1000);
      camera.zoom = 1.8;
      const fit = fitViewportBounds(camera, bounds, new THREE.Vector3(2, 3, 5));
      camera.position.copy(fit.position);
      camera.near = fit.near;
      camera.far = fit.far;
      camera.lookAt(fit.target);
      camera.updateProjectionMatrix();
      expectBoundsInFrame(camera, bounds);
    }
    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it('excludes hidden descendants and authored camera path helpers without dropping visible outliers', () => {
    const content = new THREE.Group();
    const visible = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    visible.position.x = 200;
    const hidden = visible.clone();
    hidden.position.x = -500;
    const parent = new THREE.Group();
    parent.visible = false;
    parent.add(hidden);
    const helper = new THREE.Group();
    helper.userData.blockingStudioPathFor = 'camera';
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(1000, 0, 0),
        new THREE.Vector3(2000, 0, 0),
      ]),
    );
    helper.add(line);
    content.add(visible, parent, helper);
    const bounds = viewportNavigationBounds(content);
    expect(bounds.min.toArray()).toEqual([199, -1, -1]);
    expect(bounds.max.toArray()).toEqual([201, 1, 1]);
    visible.geometry.dispose();
    visible.material.dispose();
    line.geometry.dispose();
    line.material.dispose();
  });

  it('uses current instanced matrices and skinned bone poses in framing bounds', () => {
    const content = new THREE.Group();
    const instances = new THREE.InstancedMesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshBasicMaterial(),
      2,
    );
    instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(5, 0, 0));
    instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(10, 0, 0));
    content.add(instances);
    expect(viewportNavigationBounds(content).max.x).toBe(11);
    instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(20, 0, 0));
    expect(viewportNavigationBounds(content).max.x).toBe(21);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(12).fill(0), 4));
    geometry.setAttribute(
      'skinWeight',
      new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
    );
    const skin = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    const bone = new THREE.Bone();
    skin.add(bone);
    skin.bind(new THREE.Skeleton([bone]));
    bone.position.set(-30, 0, 0);
    content.add(skin);
    const bounds = viewportNavigationBounds(content);
    expect(bounds.min.x).toBe(-30);
    expect(bounds.max.x).toBe(21);
    instances.geometry.dispose();
    instances.material.dispose();
    skin.geometry.dispose();
    skin.material.dispose();
  });
});

describe('borrowed viewport navigation lifecycle', () => {
  it('stays stable at the poles with real OrbitControls and clears residual damping', () => {
    const runtime = runtimeFixture();
    runtime.orbit = new OrbitControls(runtime.camera);
    runtime.orbit.enableDamping = true;
    runtime.navigation = createViewportNavigation(runtime, {
      now: () => 100,
      prefersReducedMotion: () => false,
    });
    runtime.orbit.rotateLeft(0.5);
    runtime.navigation.axis('top');
    runtime.navigation.tick(340);
    const top = runtime.camera.position.clone();
    expect(
      top
        .clone()
        .normalize()
        .distanceTo(new THREE.Vector3(0, 1, 0)),
    ).toBeLessThan(0.0001);
    for (let frame = 0; frame < 20; frame++) runtime.orbit.update();
    expect(runtime.camera.position.distanceTo(top)).toBeLessThan(0.000001);
    runtime.navigation.axis('front');
    runtime.navigation.tick(340);
    expect(
      runtime.camera.position
        .clone()
        .normalize()
        .distanceTo(new THREE.Vector3(0, 0, 1)),
    ).toBeLessThan(0.000001);
    expect(runtime.camera.up.toArray()).toEqual([0, 1, 0]);
    runtime.navigation.dispose();

    runtime.navigation = createViewportNavigation(runtime, { duration: 0 });
    runtime.orbit.rotateLeft(0.5);
    runtime.navigation.axis('right');
    expect(
      runtime.camera.position
        .clone()
        .normalize()
        .distanceTo(new THREE.Vector3(1, 0, 0)),
    ).toBeLessThan(0.000001);
    runtime.navigation.dispose();
  });

  it('eases around the target, keeps the existing camera and respects user cancellation', () => {
    const runtime = runtimeFixture();
    const camera = runtime.camera;
    const start = camera.position.clone();
    expect(runtime.navigation.axis('right')).toBe(true);
    expect(camera.position.toArray()).toEqual(start.toArray());
    runtime.navigation.tick(220);
    expect(camera.position.distanceTo(start)).toBeGreaterThan(1);
    expect(camera.position.length()).toBeCloseTo(start.length());
    runtime.navigation.cancel();
    const interrupted = camera.position.clone();
    expect(runtime.navigation.tick(340)).toBe(false);
    expect(camera.position.toArray()).toEqual(interrupted.toArray());
    expect(runtime.navigation.state()).toEqual({
      axis: null,
      label: '用户透视',
      projection: 'perspective',
      animating: false,
    });
    expect(runtime.camera).toBe(camera);
    expect(runtime.orbit.enableDamping).toBe(true);
  });

  it('provides correctly oriented axis views and immediately applies reduced motion', () => {
    const runtime = runtimeFixture({ prefersReducedMotion: () => true });
    const distance = runtime.camera.position.length();
    const expected = {
      front: [0, 0, 1],
      back: [0, 0, -1],
      right: [1, 0, 0],
      left: [-1, 0, 0],
      top: [0, 1, 0],
      bottom: [0, -1, 0],
    };
    for (const [axis, direction] of Object.entries(expected)) {
      runtime.navigation.axis(axis);
      expect(runtime.navigation.state().axis).toBe(axis);
      expect(runtime.navigation.state().animating).toBe(false);
      expect(runtime.camera.position.length()).toBeCloseTo(distance);
      expect(
        runtime.camera.position
          .clone()
          .normalize()
          .distanceTo(new THREE.Vector3(...direction)),
      ).toBeLessThan(0.0001);
      expect(runtime.camera.up.toArray()).toEqual([0, 1, 0]);
    }
    const position = runtime.camera.position.clone();
    expect(runtime.navigation.axis('invalid')).toBe(false);
    expect(runtime.camera.position.toArray()).toEqual(position.toArray());
    runtime.navigation.axis('x');
    expect(runtime.navigation.state().axis).toBe('right');
    runtime.navigation.dispose();
    expect(runtime.navigation.axis('front')).toBe(false);
    expect(runtime.navigation.reset()).toBe(false);
    expect(runtime.navigation.frame()).toBe(false);
  });

  it('frames selected descendants and all visible content, restores monitor view, and never edits authored cameras', () => {
    const runtime = runtimeFixture({ duration: 0 });
    const wrapper = new THREE.Group();
    const selected = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 4));
    selected.position.set(20, 3, -4);
    wrapper.position.set(5, 0, 0);
    wrapper.add(selected);
    const authored = new THREE.PerspectiveCamera(70, 1.5, 0.1, 200);
    authored.position.set(3, 10, 30);
    runtime.content.add(wrapper, authored);
    runtime.entities.set('selected:node:0', selected);
    authored.updateMatrixWorld(true);
    const authoredSnapshot = authored.toJSON();
    const previousCamera = runtime.camera.clone();
    const previousTarget = runtime.orbit.target.clone();
    runtime.monitor3dView = { camera: previousCamera, target: previousTarget };
    runtime.camera.position.set(0, 100, 0);
    runtime.orbit.target.set(1, 1, 1);
    const commands = createViewportCommands({ current: runtime });
    expect(commands.focus('selected:node:0')).toBe(true);
    const bounds = viewportNavigationBounds(selected);
    expect(runtime.orbit.target.toArray()).toEqual(bounds.getCenter(new THREE.Vector3()).toArray());
    expect(runtime.monitor3dView).toBeNull();
    expectBoundsInFrame(runtime.camera, bounds);
    expect(commands.frameAll()).toBe(true);
    expect(commands.resetView()).toBe(true);
    expect(commands.viewState().label).toBe('用户透视');
    expect(authored.toJSON()).toEqual(authoredSnapshot);
    expect(commands.focus('deleted')).toBe(false);
    selected.visible = false;
    expect(commands.focus('selected:node:0')).toBe(false);
    selected.geometry.dispose();
    selected.material.dispose();
  });
});
