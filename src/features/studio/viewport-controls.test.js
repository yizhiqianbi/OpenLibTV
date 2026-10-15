// @vitest-environment node
import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { disposeViewportTransformControls } from './viewport-controls.js';
import { disposeObjectTree } from './scene-resources.js';

it('leaves real TransformControls helper resources to their owner while the scene releases its own tree', () => {
  const element = { style: {}, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const controls = new TransformControls(new THREE.PerspectiveCamera(), element);
  const helper = controls.getHelper();
  const scene = new THREE.Scene();
  scene.add(helper);

  const geometries = new Set();
  const materialUses = new Map();
  helper.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material])
      if (material) materialUses.set(material, (materialUses.get(material) || 0) + 1);
  });
  const disposeCounts = new Map();
  for (const resource of [...geometries, ...materialUses.keys()]) {
    disposeCounts.set(resource, 0);
    resource.addEventListener('dispose', () => {
      disposeCounts.set(resource, disposeCounts.get(resource) + 1);
    });
  }
  expect(geometries.size).toBeGreaterThan(0);
  expect([...materialUses.values()]).toContain(1);
  expect([...materialUses.values()].some((uses) => uses > 1)).toBe(true);

  const geometry = new THREE.BoxGeometry();
  const bitmap = { close: vi.fn() };
  const texture = new THREE.Texture(bitmap);
  const material = new THREE.MeshStandardMaterial({ map: texture });
  scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  const ownGeometryDisposed = vi.fn();
  const ownMaterialDisposed = vi.fn();
  const ownTextureDisposed = vi.fn();
  geometry.addEventListener('dispose', ownGeometryDisposed);
  material.addEventListener('dispose', ownMaterialDisposed);
  texture.addEventListener('dispose', ownTextureDisposed);

  element.removeEventListener.mockClear();
  disposeViewportTransformControls(controls, helper);
  expect(helper.parent).toBeNull();
  expect(scene.children).not.toContain(helper);
  for (const resource of geometries) expect(disposeCounts.get(resource)).toBe(1);
  // Three itself disposes shared materials once per helper node. Preserve that
  // native strategy; our scene sweep must not add another disposal afterward.
  for (const [resource, uses] of materialUses) expect(disposeCounts.get(resource)).toBe(uses);
  const countsAfterOwner = new Map(disposeCounts);
  expect(ownGeometryDisposed).not.toHaveBeenCalled();
  expect(ownMaterialDisposed).not.toHaveBeenCalled();
  expect(ownTextureDisposed).not.toHaveBeenCalled();

  disposeObjectTree(scene);

  expect(disposeCounts).toEqual(countsAfterOwner);
  expect(ownGeometryDisposed).toHaveBeenCalledOnce();
  expect(ownMaterialDisposed).toHaveBeenCalledOnce();
  expect(ownTextureDisposed).toHaveBeenCalledOnce();
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(element.removeEventListener.mock.calls.map(([type]) => type)).toEqual([
    'pointerdown',
    'pointermove',
    'pointermove',
    'pointerup',
  ]);
  expect(element.style.touchAction).toBe('');
});
