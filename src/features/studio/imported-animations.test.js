// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createImportedAnimations } from './imported-animations.js';
import { createViewportEntityController } from './viewport-entities.js';
import { createViewportCommands } from './viewport-commands.js';
import { parseGlbBuffer, glbBufferToDataUrl } from './glb.js';
import { createAnimatedGlb, encodeGlb } from './fixtures/animated-glb.js';

class Reader {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
  async readAsDataURL(blob) {
    this.result = glbBufferToDataUrl(await blob.arrayBuffer());
    this.onloadend?.();
  }
}
afterEach(() => vi.unstubAllGlobals());

describe('actual imported GLB animation lifecycle', () => {
  it('retains clips and really seeks forward/backward, clamps endpoints, isolates one clip and restores all clips', async () => {
    const scene = await parseGlbBuffer(createAnimatedGlb());
    const runtime = createImportedAnimations(scene);
    const moving = scene.getObjectByName('MovingTriangle');
    const growing = scene.getObjectByName('GrowingTriangle');
    expect(runtime.metadata).toEqual([
      { index: 0, name: 'Slide', duration: 2 },
      { index: 1, name: 'Grow', duration: 4 },
    ]);
    runtime.seek(1);
    expect(moving.position.x).toBeCloseTo(2);
    expect(growing.scale.y).toBeCloseTo(1.5);
    runtime.seek(9);
    expect(moving.position.x).toBe(4);
    expect(growing.scale.y).toBe(3);
    runtime.seek(0.5);
    expect(moving.position.x).toBeCloseTo(1);
    runtime.seek(1, 1);
    expect(moving.position.x).toBe(0);
    expect(growing.scale.y).toBeCloseTo(1.5);
    runtime.seek(1, false);
    expect(growing.scale.y).toBe(1);
    runtime.seek(2);
    expect(moving.position.x).toBe(4);
    expect(growing.scale.y).toBe(2);
    runtime.dispose();
    expect(moving.position.x).toBe(0);
    expect(growing.scale.y).toBe(1);
    runtime.seek(1);
    expect(moving.position.x).toBe(0);
  });

  it('restores and reexports all real tracks, even with duplicate imported node names', async () => {
    vi.stubGlobal('FileReader', Reader);
    const dataUrl = glbBufferToDataUrl(createAnimatedGlb());
    const objects = ['first', 'second'].map((id, index) => ({
      id,
      name: `${id}.glb`,
      type: 'glb',
      dataUrl,
      position: [index * 10, 0, 0],
      visible: true,
    }));
    const content = new THREE.Group(),
      entities = new Map();
    const manager = createViewportEntityController({
      content,
      entities,
      transform: { detach: vi.fn() },
    });
    manager.reconcile(JSON.parse(JSON.stringify(objects)));
    await manager.waitForReady();
    manager.seekAnimations(1, { objectId: 'first', index: 0 });
    expect(entities.get('first').getObjectByName('MovingTriangle').position.x).toBe(2);
    expect(entities.get('second').getObjectByName('MovingTriangle').position.x).toBe(0);
    const buffer = await createViewportCommands({
      current: { content, entities, entityController: manager },
    }).exportGLB();
    const restored = await parseGlbBuffer(buffer);
    expect(restored.animations.map((clip) => [clip.name, clip.duration])).toEqual([
      ['Slide', 2],
      ['Grow', 4],
      ['Slide', 2],
      ['Grow', 4],
    ]);
    const mixer = new THREE.AnimationMixer(restored);
    restored.animations.forEach((clip) => {
      const action = mixer.clipAction(clip).play();
      action.time = 1;
    });
    mixer.update(0);
    const moved = [];
    restored.traverse((object) => {
      if (object.name.startsWith('MovingTriangle')) moved.push(object.position.x);
    });
    expect(moved).toEqual([2, 2]);
    manager.dispose();
    expect(manager.exportAnimations()).toEqual([]);
  });

  it('releases decoder-owned resources on failure and abort, and disposes late decoded geometry', async () => {
    const dispose = vi.fn();
    const failed = () =>
      Promise.resolve({
        loader: {
          parseAsync: async () => {
            throw Error('decode failed');
          },
        },
        dispose,
      });
    await expect(parseGlbBuffer(createAnimatedGlb(), { createLoader: failed })).rejects.toThrow(
      'decode failed',
    );
    expect(dispose).toHaveBeenCalledOnce();
    const abort = new AbortController();
    const scene = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const geometryDispose = vi.spyOn(scene.geometry, 'dispose');
    const decoded = () =>
      Promise.resolve({
        loader: {
          parseAsync: async () => {
            abort.abort();
            return { scene };
          },
        },
        dispose,
      });
    await expect(
      parseGlbBuffer(createAnimatedGlb(), { createLoader: decoded, signal: abort.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(geometryDispose).toHaveBeenCalledOnce();
  });

  it('rejects external dependencies before parsing instead of silently importing missing textures', async () => {
    const createLoader = vi.fn();
    const buffer = encodeGlb(
      { asset: { version: '2.0' }, images: [{ uri: 'texture.png' }] },
      new ArrayBuffer(0),
    );
    await expect(parseGlbBuffer(buffer, { createLoader })).rejects.toThrow('内嵌纹理和缓冲区');
    expect(createLoader).not.toHaveBeenCalled();
  });
  it('aborts a pending decoder immediately and releases a late parsed scene', async () => {
    let finish;
    const dispose = vi.fn();
    const createLoader = async () => ({
      loader: {
        parseAsync: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      },
      dispose,
    });
    const abort = new AbortController();
    const pending = parseGlbBuffer(createAnimatedGlb(), { createLoader, signal: abort.signal });
    await Promise.resolve();
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(dispose).toHaveBeenCalledOnce();
    const scene = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const geometryDispose = vi.spyOn(scene.geometry, 'dispose');
    finish({ scene });
    await Promise.resolve();
    expect(geometryDispose).toHaveBeenCalledOnce();
  });
});
