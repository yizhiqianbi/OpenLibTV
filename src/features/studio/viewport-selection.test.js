// @vitest-environment node
import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createViewportSelectionController } from './viewport-selection.js';
import { applyViewportSelection } from './viewport-controls.js';
import { parseGlbBuffer } from './glb.js';
import { createNestedAnimatedGlb } from './fixtures/animated-glb.js';
import { createImportedAnimations } from './imported-animations.js';
import { createStudioSceneTree } from './outliner/scene-tree.js';
import { disposeObjectTree } from './scene-resources.js';

const setup = () => {
  const scene = new THREE.Scene(),
    content = new THREE.Group(),
    entities = new Map();
  scene.add(content);
  const selection = createViewportSelectionController({ scene, content, entities });
  return { scene, content, entities, selection };
};

it('follows real imported nested animation and transforms without changing source materials or helper geometry', async () => {
  const { scene, content, entities, selection } = setup();
  const imported = await parseGlbBuffer(createNestedAnimatedGlb());
  imported.position.x = 3;
  content.add(imported);
  const tree = createStudioSceneTree(imported, 'model');
  for (const [id, node] of tree.nodes) entities.set(id, node);
  const detail = imported.getObjectByName('Detail');
  const animations = createImportedAnimations(imported);
  const sourceMaterial = detail.material,
    materialBefore = sourceMaterial.toJSON(),
    helperGeometry = selection.helper.geometry,
    helperMaterial = selection.helper.material;
  selection.setSelection(detail.userData.studioNodeId);
  animations.seek(0);
  selection.update();
  const initialMin = selection.helper.box.min.clone();
  expect(selection.helper.visible).toBe(true);
  expect(selection.helper.box.min.x).toBeCloseTo(2.86);
  expect(selection.helper.box.max.x).toBeCloseTo(3.14);
  expect(selection.helper.box.max.y).toBeCloseTo(0.265);
  animations.seek(1);
  selection.update();
  expect(selection.helper.box.min.x - initialMin.x).toBeCloseTo(2);
  imported.position.x = -7;
  for (let frame = 0; frame < 20; frame++) selection.update();
  expect(selection.helper.box.min.x).toBeCloseTo(-5.14);
  expect(selection.helper.geometry).toBe(helperGeometry);
  expect(selection.helper.material).toBe(helperMaterial);
  expect(detail.material).toBe(sourceMaterial);
  expect(sourceMaterial.toJSON()).toEqual(materialBefore);
  expect(selection.helper.parent).toBe(scene);
  const exportedNames = [];
  content.traverse((node) => exportedNames.push(node.name));
  expect(exportedNames).not.toContain(selection.helper.name);
  selection.dispose();
  animations.dispose();
  disposeObjectTree(scene);
});

it('excludes invisible descendants and hides feedback for deleted, detached, hidden or camera-view selections', () => {
  const { scene, content, entities, selection } = setup();
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const hidden = mesh.clone();
  hidden.position.x = 100;
  hidden.visible = false;
  group.add(mesh, hidden);
  content.add(group);
  entities.set('group', group);
  selection.setSelection('group');
  selection.update();
  expect(selection.helper.box.max.x).toBeCloseTo(0.515);
  selection.update({ visible: false });
  expect(selection.helper.visible).toBe(false);
  selection.update();
  expect(selection.helper.visible).toBe(true);
  content.visible = false;
  selection.update();
  expect(selection.helper.visible).toBe(false);
  content.visible = true;
  group.removeFromParent();
  selection.update();
  expect(selection.helper.visible).toBe(false);
  content.add(group);
  entities.delete('group');
  selection.update();
  expect(selection.helper.visible).toBe(false);
  selection.setSelection(null);
  selection.update();
  expect(selection.helper.box.isEmpty()).toBe(true);
  selection.dispose();
  disposeObjectTree(scene);
});

it('updates live skinned bounds when a bone moves and retains the original skin geometry', () => {
  const { scene, content, entities, selection } = setup();
  const geometry = new THREE.BoxGeometry();
  const vertexCount = geometry.attributes.position.count;
  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(new Uint16Array(vertexCount * 4), 4),
  );
  const weights = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index++) weights[index * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  const bone = new THREE.Bone();
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  content.add(mesh);
  entities.set('skin', mesh);
  selection.setSelection('skin');
  selection.update();
  expect(selection.helper.box.max.x).toBeCloseTo(0.515);
  bone.position.x = 3;
  selection.update();
  expect(selection.helper.box.min.x).toBeCloseTo(2.485);
  expect(selection.helper.box.max.x).toBeCloseTo(3.515);
  expect(mesh.geometry).toBe(geometry);
  selection.dispose();
  disposeObjectTree(scene);
});

it('disposes only its own resources once and cannot revive after disposal', () => {
  const { scene, content, entities, selection } = setup();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  content.add(mesh);
  entities.set('box', mesh);
  selection.setSelection('box');
  selection.update();
  const geometryDisposed = vi.fn(),
    materialDisposed = vi.fn(),
    sourceDisposed = vi.fn();
  selection.helper.geometry.addEventListener('dispose', geometryDisposed);
  selection.helper.material.addEventListener('dispose', materialDisposed);
  mesh.geometry.addEventListener('dispose', sourceDisposed);
  selection.dispose();
  selection.dispose();
  selection.setSelection('box');
  selection.update();
  expect(selection.helper.parent).toBeNull();
  expect(selection.helper.visible).toBe(false);
  expect(geometryDisposed).toHaveBeenCalledOnce();
  expect(materialDisposed).toHaveBeenCalledOnce();
  expect(sourceDisposed).not.toHaveBeenCalled();
  disposeObjectTree(scene);
  expect(geometryDisposed).toHaveBeenCalledOnce();
  expect(materialDisposed).toHaveBeenCalledOnce();
  expect(sourceDisposed).toHaveBeenCalledOnce();
});

it('shows select-mode feedback while retaining the animated-property transform guard', () => {
  const { scene, content, entities, selection } = setup();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  mesh.userData.studioAnimatedProperties = ['position'];
  content.add(mesh);
  entities.set('box', mesh);
  const transform = { attach: vi.fn(), detach: vi.fn(), setMode: vi.fn() };
  const runtime = { entities, transform, selectionController: selection };
  applyViewportSelection(runtime, { selected: 'box', mode: 'select' });
  selection.update();
  expect(selection.helper.visible).toBe(true);
  expect(transform.attach).not.toHaveBeenCalled();
  applyViewportSelection(runtime, { selected: 'box', mode: 'translate' });
  selection.update();
  expect(selection.helper.visible).toBe(true);
  expect(transform.attach).not.toHaveBeenCalled();
  applyViewportSelection(runtime, { selected: 'box', mode: 'rotate' });
  expect(transform.attach).toHaveBeenCalledWith(mesh);
  selection.dispose();
  disposeObjectTree(scene);
});
