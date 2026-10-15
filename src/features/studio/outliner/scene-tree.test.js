// @vitest-environment node
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViewportEntityController } from '../viewport-entities.js';
import { createViewportCommands } from '../viewport-commands.js';
import { applyViewportSelection } from '../viewport-controls.js';
import { glbBufferToDataUrl, parseGlbBuffer } from '../glb.js';
import { createAnimatedGlb, createNestedAnimatedGlb } from '../fixtures/animated-glb.js';
import { patchStudioRow, studioOutlinerRows } from './model.js';
import { viewportEntityId } from '../scene-resources.js';

class TestFileReader {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
}
afterEach(() => vi.unstubAllGlobals());
const imported = {
  id: 'model',
  name: 'Scene',
  type: 'glb',
  dataUrl: glbBufferToDataUrl(createNestedAnimatedGlb()),
  position: [3, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};
const createController = (onHierarchy = () => {}) => {
  const content = new THREE.Group(),
    entities = new Map(),
    transform = { attach: vi.fn(), detach: vi.fn(), setMode: vi.fn() };
  const entityController = createViewportEntityController({
    content,
    entities,
    transform,
    onHierarchy,
  });
  const runtime = {
    current: {
      content,
      entities,
      transform,
      entityController,
      orbit: { target: new THREE.Vector3(), update: vi.fn() },
      camera: new THREE.PerspectiveCamera(),
    },
  };
  return {
    content,
    entities,
    transform,
    entityController,
    runtime,
    commands: createViewportCommands(runtime),
  };
};
describe('real GLB subtree ownership and edits', () => {
  it('applies a persisted material color to one imported mesh and restores the source color', async () => {
    vi.stubGlobal('FileReader', TestFileReader);
    const hierarchy = vi.fn(),
      rt = createController(hierarchy);
    rt.entityController.reconcile([imported]);
    await rt.entityController.waitForReady();
    const subtree = hierarchy.mock.calls[0][1],
      base = { ...imported, subtree },
      growing = studioOutlinerRows([base]).find((row) => row.name === 'GrowingTriangle');
    expect(growing).toMatchObject({ type: 'mesh' });
    const sourceColor = growing.color;
    const edited = patchStudioRow([base], growing.id, { color: '#22cc55' });
    rt.entityController.reconcile(edited);
    expect(rt.entities.get(growing.id).material.color.getHexString()).toBe('22cc55');
    rt.entityController.reconcile([base]);
    expect(rt.entities.get(growing.id).material.color.getHexString()).toBe(sourceColor.slice(1));
    rt.entityController.dispose();
  });

  it('keeps the source material payload including alpha and depth-write through undo and GLB export', async () => {
    vi.stubGlobal('FileReader', TestFileReader);
    const hierarchy = vi.fn(),
      rt = createController(hierarchy);
    rt.entityController.reconcile([imported]);
    await rt.entityController.waitForReady();
    const subtree = hierarchy.mock.calls[0][1],
      base = { ...imported, subtree },
      growing = studioOutlinerRows([base]).find((row) => row.name === 'GrowingTriangle'),
      material = rt.entities.get(growing.id).material;
    expect(growing).toMatchObject({ opacity: 1, transparent: false, depthWrite: true });
    const edited = patchStudioRow([base], growing.id, {
      opacity: 0.4,
      metallic: 0.8,
      roughness: 0.2,
      depthWrite: false,
    });
    rt.entityController.reconcile(edited);
    expect(material.opacity).toBeCloseTo(0.4);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.metalness).toBeCloseTo(0.8);
    expect(material.roughness).toBeCloseTo(0.2);
    rt.entityController.reconcile([base]);
    expect(material.opacity).toBeCloseTo(1);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(material.metalness).toBeCloseTo(0);
    rt.entityController.dispose();
  });

  it('removes a source subtree from the live scene and restores the exact hierarchy on undo', async () => {
    vi.stubGlobal('FileReader', TestFileReader);
    const hierarchy = vi.fn(),
      rt = createController(hierarchy);
    rt.entityController.reconcile([imported]);
    await rt.entityController.waitForReady();
    const subtree = hierarchy.mock.calls[0][1],
      base = { ...imported, subtree },
      branch = studioOutlinerRows([base]).find((row) => row.name === 'MovingTriangle'),
      leaf = studioOutlinerRows([base]).find((row) => row.name === 'Detail');
    const branchObject = rt.entities.get(branch.id);
    rt.transform.object = branchObject;
    const deleted = patchStudioRow([base], branch.id, { deleted: true });
    rt.entityController.reconcile(deleted);
    expect(branchObject.parent).toBeNull();
    expect(rt.transform.detach).toHaveBeenCalledOnce();
    const afterDelete = await parseGlbBuffer(await rt.commands.exportGLB());
    expect(afterDelete.getObjectByName('MovingTriangle')).toBeUndefined();
    expect(afterDelete.getObjectByName('Detail')).toBeUndefined();
    expect(afterDelete.getObjectByName('GrowingTriangle')).toBeTruthy();
    expect(
      afterDelete.animations
        .flatMap((clip) => clip.tracks)
        .some((track) => track.name.includes('MovingTriangle')),
    ).toBe(false);

    rt.entityController.reconcile([base]);
    expect(branchObject.parent?.name).toBe('Assembly');
    expect(branchObject.getObjectByName('Detail')).toBe(rt.entities.get(leaf.id));
    const restored = await parseGlbBuffer(await rt.commands.exportGLB());
    expect(restored.getObjectByName('Assembly')).toBeTruthy();
    expect(restored.getObjectByName('Detail')).toBeTruthy();
    expect(
      restored.animations
        .flatMap((clip) => clip.tracks)
        .some((track) => track.name.includes('MovingTriangle')),
    ).toBe(true);
    rt.entityController.dispose();
  });

  it('binds live nodes, persists edits independently of source bytes, restores undo and exports renamed animation targets', async () => {
    vi.stubGlobal('FileReader', TestFileReader);
    const hierarchy = vi.fn(),
      rt = createController(hierarchy);
    rt.entityController.reconcile([imported]);
    await rt.entityController.waitForReady();
    const subtree = hierarchy.mock.calls[0][1],
      spec = { ...imported, subtree };
    const rows = studioOutlinerRows([spec]);
    const assembly = rows.find((row) => row.name === 'Assembly');
    const sliding = rows.find((row) => row.animatedProperties?.includes('position'));
    const growing = rows.find((row) => row.animatedProperties?.includes('scale'));
    const detail = rows.find((row) => row.name === 'Detail');
    expect(assembly.childCount).toBe(2);
    expect(detail.parentId).toBe(sliding.id);
    expect(sliding.path).toEqual([0, 0]);
    expect(detail.path).toEqual([0, 0, 0]);
    expect(rt.entities.get(sliding.id)).toBeTruthy();
    expect(viewportEntityId(rt.entities.get(sliding.id), rt.content)).toBe(sliding.id);
    let edited = patchStudioRow([spec], sliding.id, {
      name: 'RenamedSlide',
      visible: false,
      position: [99, 0, 0],
    });
    edited = patchStudioRow(edited, growing.id, { position: [5, 2, 0], rotation: [0, 45, 0] });
    const stored = JSON.parse(JSON.stringify(edited));
    rt.entityController.reconcile(stored);
    rt.entityController.seekAnimations(1);
    expect(rt.entities.get(sliding.id).name).toBe('RenamedSlide');
    expect(rt.entities.get(sliding.id).visible).toBe(false);
    expect(rt.entities.get(sliding.id).position.x).toBeCloseTo(2);
    expect(rt.entities.get(growing.id).position.toArray()).toEqual([5, 2, 0]);
    rt.commands.focus(growing.id);
    expect(rt.runtime.current.orbit.target.toArray()).toEqual([8, 2.75, 0]);
    applyViewportSelection(
      { entities: rt.entities, transform: rt.transform },
      { selected: sliding.id, mode: 'translate' },
    );
    expect(rt.transform.detach).toHaveBeenCalled();
    applyViewportSelection(
      { entities: rt.entities, transform: rt.transform },
      { selected: growing.id, mode: 'translate' },
    );
    expect(rt.transform.attach).toHaveBeenCalledWith(rt.entities.get(growing.id));
    const restored = await parseGlbBuffer(await rt.commands.exportGLB());
    const mesh = restored.getObjectByName('RenamedSlide');
    expect(mesh).toBeTruthy();
    const mixer = new THREE.AnimationMixer(restored);
    mixer.clipAction(restored.animations.find((clip) => clip.name === 'Slide')).play();
    mixer.setTime(1);
    expect(mesh.position.x).toBeCloseTo(2);
    expect(restored.getObjectByName('GrowingTriangle').position.toArray()).toEqual([5, 2, 0]);
    // Source onlyVisible:false exports hidden geometry; standard GLB does not store visible.
    expect(mesh.visible).toBe(true);
    expect(restored.animations.map((clip) => clip.name)).toEqual(['Slide', 'Grow']);
    rt.entityController.reconcile([spec]);
    expect(rt.entities.get(sliding.id).name).toBe(
      subtree.find((node) => node.path.join('.') === sliding.path.join('.')).name,
    );
    expect(rt.entities.get(growing.id).position.toArray()).toEqual(growing.position);
    rt.entityController.dispose();
    expect(rt.entities.size).toBe(0);
    const fresh = createController();
    fresh.entityController.reconcile(stored);
    await fresh.entityController.waitForReady();
    expect(fresh.entities.get(growing.id).position.toArray()).toEqual([5, 2, 0]);
    expect(fresh.entities.get(sliding.id).visible).toBe(false);
    fresh.entityController.dispose();
    mixer.stopAllAction();
    mixer.uncacheRoot(restored);
  });
  it('does not publish or leave child IDs from a parse that finishes after deletion', async () => {
    let resolve;
    const parse = new Promise((done) => {
      resolve = done;
    });
    const content = new THREE.Group(),
      entities = new Map(),
      hierarchy = vi.fn();
    const controller = createViewportEntityController({
      content,
      entities,
      transform: { detach: vi.fn() },
      parseImported: () => parse,
      onHierarchy: hierarchy,
    });
    controller.reconcile([imported]);
    await Promise.resolve();
    controller.reconcile([]);
    resolve(await parseGlbBuffer(createAnimatedGlb()));
    await parse;
    await Promise.resolve();
    expect(hierarchy).not.toHaveBeenCalled();
    expect(entities.size).toBe(0);
    controller.dispose();
  });
});
