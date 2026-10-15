// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createViewportEntityController } from './viewport-entities.js';
import { disposeObjectTree } from './scene-resources.js';

const spec = {
  id: 'imported',
  type: 'imported',
  name: '模型',
  dataUrl: 'first',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};
function scene() {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.2, 3, 5),
    new THREE.MeshStandardMaterial({ color: '#f05a12' }),
  );
  const group = new THREE.Group();
  group.add(mesh);
  return {
    group,
    mesh,
    disposed: vi.spyOn(mesh.geometry, 'dispose'),
    color: mesh.material.color.getHexString(),
  };
}
function controller(parseImported) {
  const content = new THREE.Group(),
    entities = new Map(),
    transform = { detach: vi.fn() },
    onError = vi.fn();
  return {
    content,
    entities,
    transform,
    onError,
    manager: createViewportEntityController({
      content,
      entities,
      transform,
      parseImported,
      onError,
    }),
  };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('viewport imported model lifecycle', () => {
  it('disposes a late parse after deletion without recreating the removed object', async () => {
    const parse = deferred(),
      model = scene(),
      { manager, entities } = controller(() => parse.promise);
    manager.reconcile([spec]);
    manager.reconcile([]);
    parse.resolve(model.group);
    await flush();
    expect(entities.size).toBe(0);
    expect(model.disposed).toHaveBeenCalledOnce();
    manager.dispose();
  });

  it('keeps the latest undo/redo request when older parsing finishes later', async () => {
    const first = deferred(),
      second = deferred(),
      oldModel = scene(),
      currentModel = scene();
    const parse = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { manager, entities } = controller(parse);
    manager.reconcile([spec]);
    await flush();
    manager.reconcile([]);
    manager.reconcile([{ ...spec, position: [8, 2, 0], visible: false }]);
    await flush();
    first.resolve(oldModel.group);
    await flush();
    second.resolve(currentModel.group);
    await manager.waitForReady();
    expect(oldModel.disposed).toHaveBeenCalledOnce();
    expect(entities.get(spec.id).children[0]).toBe(currentModel.group);
    expect(entities.get(spec.id).position.toArray()).toEqual([8, 2, 0]);
    expect(entities.get(spec.id).visible).toBe(false);
    manager.dispose();
  });

  it('cancels source replacement and uses the latest metadata without duplicate parsing', async () => {
    const old = deferred(),
      next = deferred(),
      oldModel = scene(),
      currentModel = scene();
    const parse = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const { manager, entities } = controller(parse);
    manager.reconcile([spec]);
    await flush();
    manager.reconcile([{ ...spec, dataUrl: 'next' }]);
    await flush();
    manager.reconcile([{ ...spec, dataUrl: 'next', name: '最新名称', scale: [3, 3, 3] }]);
    old.resolve(oldModel.group);
    next.resolve(currentModel.group);
    await manager.waitForReady();
    expect(parse).toHaveBeenCalledTimes(2);
    expect(oldModel.disposed).toHaveBeenCalledOnce();
    expect(entities.get(spec.id).name).toBe('最新名称');
    expect(entities.get(spec.id).scale.toArray()).toEqual([3, 3, 3]);
    manager.dispose();
  });

  it('does not attach late resources to a disposed route', async () => {
    const parse = deferred(),
      model = scene(),
      { manager, entities } = controller(() => parse.promise);
    manager.reconcile([spec]);
    await flush();
    manager.dispose();
    parse.resolve(model.group);
    await flush();
    expect(model.disposed).toHaveBeenCalledOnce();
    expect(entities.size).toBe(0);
    await expect(manager.waitForReady()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('restores original materials after undoing a color override and detaches removed selections', () => {
    const model = scene(),
      { manager, entities, transform } = controller();
    manager.stage(spec, model.group);
    manager.reconcile([spec]);
    expect(model.mesh.material.color.getHexString()).toBe(model.color);
    manager.reconcile([{ ...spec, color: '#22cc55' }]);
    expect(model.mesh.material.color.getHexString()).toBe('22cc55');
    manager.reconcile([spec]);
    expect(model.mesh.material.color.getHexString()).toBe(model.color);
    transform.object = entities.get(spec.id);
    manager.reconcile([]);
    expect(transform.detach).toHaveBeenCalledOnce();
    expect(model.disposed).toHaveBeenCalledOnce();
    manager.dispose();
  });

  it('reports an invalid imported file without substituting a cube', async () => {
    const { manager, entities, onError } = controller(async () => {
      throw new Error('文件缺失');
    });
    manager.reconcile([spec]);
    await expect(manager.waitForReady()).rejects.toThrow('重新导入');
    expect(entities.size).toBe(0);
    expect(onError).toHaveBeenCalledWith('模型“模型”加载失败：文件缺失');
    manager.dispose();
  });
});

it('disposes shared geometry, material arrays and embedded textures exactly once', () => {
  const root = new THREE.Group(),
    geometry = new THREE.BoxGeometry(),
    texture = new THREE.Texture({ close: vi.fn() });
  const first = new THREE.MeshStandardMaterial({ map: texture }),
    second = new THREE.MeshStandardMaterial({ map: texture });
  root.add(new THREE.Mesh(geometry, [first, second]), new THREE.Mesh(geometry, first));
  const disposedGeometry = vi.spyOn(geometry, 'dispose'),
    disposedFirst = vi.spyOn(first, 'dispose'),
    disposedSecond = vi.spyOn(second, 'dispose'),
    disposedTexture = vi.spyOn(texture, 'dispose');
  disposeObjectTree(root);
  for (const disposed of [
    disposedGeometry,
    disposedFirst,
    disposedSecond,
    disposedTexture,
    texture.image.close,
  ])
    expect(disposed).toHaveBeenCalledOnce();
});
