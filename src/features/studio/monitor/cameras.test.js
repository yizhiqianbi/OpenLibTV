// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fitMonitorTopCamera, monitorBounds } from './cameras.js';
import { MONITOR_ASPECT } from './model.js';
import { disposeObjectTree } from '../scene-resources.js';

function expectBoxInFrame(camera, bounds) {
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const projected = new THREE.Vector3(x, y, z).project(camera);
        expect(Math.abs(projected.x)).toBeLessThanOrEqual(1 / 1.15 + 1e-6);
        expect(Math.abs(projected.y)).toBeLessThanOrEqual(1 / 1.15 + 1e-6);
        expect(projected.z).toBeGreaterThan(-1);
        expect(projected.z).toBeLessThan(1);
      }
}

describe('corrected perspective top monitor fitting', () => {
  it.each([1, 8, 40])(
    'keeps the closest face of a %sm tall cylinder inside the 16:9 monitor',
    (height) => {
      const content = new THREE.Group();
      const cylinder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, height, 64),
        new THREE.MeshStandardMaterial(),
      );
      cylinder.position.y = height / 2;
      content.add(cylinder);
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      fitMonitorTopCamera(camera, content);
      expect(camera.aspect).toBe(MONITOR_ASPECT);
      expect(camera.position.y).toBeGreaterThan(height);
      expectBoxInFrame(camera, monitorBounds(content));
      disposeObjectTree(content);
    },
  );

  it('fits transformed imported geometry at nondefault zoom without changing its transform', () => {
    const content = new THREE.Group();
    const imported = new THREE.Group();
    imported.position.set(4, -2, 3);
    imported.rotation.set(0.3, -0.4, 0.2);
    imported.scale.set(1.2, 0.8, 1.4);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 3), new THREE.MeshStandardMaterial());
    mesh.position.set(1, 3, -2);
    mesh.rotation.set(0.4, 0.8, -0.5);
    imported.add(mesh);
    content.add(imported);
    content.updateWorldMatrix(true, true);
    const originalTransform = mesh.matrixWorld.clone();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
    camera.zoom = 2;
    fitMonitorTopCamera(camera, content);
    expectBoxInFrame(camera, monitorBounds(content));
    expect(mesh.matrixWorld.equals(originalTransform)).toBe(true);
    expect(camera.zoom).toBe(2);
    disposeObjectTree(content);
  });

  it('retains median-radius filtering and excludes invisible content and scene helpers', () => {
    const scene = new THREE.Scene();
    const content = new THREE.Group();
    scene.add(content);
    for (const x of [-1, 1]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
      mesh.position.set(x, 0.5, 0);
      content.add(mesh);
    }
    const outlier = new THREE.Mesh(new THREE.BoxGeometry(1000, 1000, 1000));
    outlier.position.x = 10000;
    content.add(outlier);
    const hidden = new THREE.Group();
    hidden.visible = false;
    hidden.add(new THREE.Mesh(new THREE.BoxGeometry(500, 500, 500)));
    content.add(hidden);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(100, 100)), new THREE.AxesHelper(500));

    const bounds = monitorBounds(content);
    expect(bounds.min.toArray()).toEqual([-1.5, 0, -0.5]);
    expect(bounds.max.toArray()).toEqual([1.5, 1, 0.5]);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    fitMonitorTopCamera(camera, content);
    expectBoxInFrame(camera, bounds);
    disposeObjectTree(scene);
  });
});
