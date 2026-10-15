// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createViewportCommands } from './viewport-commands.js';
import { createViewportEntityController } from './viewport-entities.js';
import {
  glbBufferToDataUrl,
  glbDataUrlToBuffer,
  parseGlbBuffer,
  validateGlbBuffer,
} from './glb.js';

const fixtureUrl = new URL('../../../artifacts/studio-import-fixture.glb', import.meta.url);
async function fixtureBuffer() {
  const bytes = await readFile(fixtureUrl);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
const meshes = (scene) => {
  const result = [];
  scene.traverse((object) => {
    if (object.isMesh) result.push(object);
  });
  return result;
};
class TestFileReader {
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

describe('real GLB import and export', () => {
  it('parses the saved binary data URL with its named geometry and original materials', async () => {
    const buffer = await fixtureBuffer();
    const source = glbBufferToDataUrl(buffer);
    expect(new Uint8Array(glbDataUrlToBuffer(source))).toEqual(new Uint8Array(buffer));
    const scene = await parseGlbBuffer(glbDataUrlToBuffer(source));
    expect(
      meshes(scene).map((mesh) => [
        mesh.name,
        mesh.geometry.attributes.position.count,
        mesh.material.name,
      ]),
    ).toEqual([
      ['OrangeTorusLoop', 225, 'OrangeEnamel'],
      ['BlueConePeak', 43, 'BlueCeramic'],
    ]);
    expect(meshes(scene)[0].material.color.getHexString()).not.toBe(
      meshes(scene)[1].material.color.getHexString(),
    );
  });

  it('stages an import, restores its transform and exports the real meshes after readiness', async () => {
    vi.stubGlobal('FileReader', TestFileReader);
    const buffer = await fixtureBuffer();
    const content = new THREE.Group(),
      entities = new Map(),
      transform = { detach: vi.fn() };
    const entityController = createViewportEntityController({ content, entities, transform });
    const runtime = { current: { content, entities, entityController } };
    const commands = createViewportCommands(runtime);
    const imported = await commands.importGLB({
      name: 'fixture.glb',
      size: buffer.byteLength,
      arrayBuffer: async () => buffer,
    });
    expect(entities.size).toBe(0);
    const saved = JSON.parse(
      JSON.stringify({ ...imported, position: [3, 2, 1], rotation: [0, 45, 0], scale: [2, 2, 2] }),
    );
    entityController.reconcile([saved]);
    expect(entities.get(saved.id).position.toArray()).toEqual([3, 2, 1]);
    const exported = await commands.exportGLB();
    const roundtrip = await parseGlbBuffer(exported);
    expect(meshes(roundtrip).map((mesh) => mesh.name)).toEqual(['OrangeTorusLoop', 'BlueConePeak']);
    expect(meshes(roundtrip).map((mesh) => mesh.geometry.attributes.position.count)).toEqual([
      225, 43,
    ]);
    expect(meshes(roundtrip).map((mesh) => mesh.material.name)).toEqual([
      'OrangeEnamel',
      'BlueCeramic',
    ]);
    expect(meshes(roundtrip).map((mesh) => mesh.material.color.getHexString())).toEqual(
      meshes(content).map((mesh) => mesh.material.color.getHexString()),
    );
    let restoredWrapper;
    roundtrip.traverse((object) => {
      if (object.userData.entityId === saved.id) restoredWrapper = object;
    });
    expect(restoredWrapper.position.toArray()).toEqual([3, 2, 1]);
    entityController.reconcile([{ ...saved, visible: false }]);
    const hiddenExport = await parseGlbBuffer(await commands.exportGLB());
    // Source exports the whole editable scene, including hidden models and their tracks.
    expect(meshes(hiddenExport).map((mesh) => mesh.name)).toEqual([
      'OrangeTorusLoop',
      'BlueConePeak',
    ]);
    entityController.dispose();
  });

  it('does not insert a model after the viewport is replaced while its file is being read', async () => {
    const buffer = await fixtureBuffer();
    let finish;
    const file = {
      name: 'fixture.glb',
      size: buffer.byteLength,
      arrayBuffer: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    };
    const stage = vi.fn();
    const runtime = { current: { entityController: { active: true, stage } } };
    const pending = createViewportCommands(runtime).importGLB(file);
    runtime.current = null;
    finish(buffer);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(stage).not.toHaveBeenCalled();
  });

  it('rejects truncated binary files before invoking the parser', async () => {
    const buffer = await fixtureBuffer();
    expect(() => validateGlbBuffer(buffer.slice(0, -4))).toThrow('GLB 2');
    await expect(parseGlbBuffer(new ArrayBuffer(12))).rejects.toThrow('GLB 2');
  });
  it('rejects a finished export when its viewport was replaced before the binary reader completed', async () => {
    let finish,
      held = false;
    class PendingReader extends TestFileReader {
      async readAsArrayBuffer(blob) {
        if (held) return super.readAsArrayBuffer(blob);
        held = true;
        this.result = await blob.arrayBuffer();
        finish = () => this.onloadend?.();
      }
    }
    vi.stubGlobal('FileReader', PendingReader);
    const content = new THREE.Group(),
      entities = new Map();
    const entityController = createViewportEntityController({
      content,
      entities,
      transform: { detach: vi.fn() },
    });
    entityController.reconcile([{ id: 'cube', name: 'cube', type: 'cube', position: [0, 0, 0] }]);
    const runtime = { current: { content, entities, entityController } };
    const pending = createViewportCommands(runtime).exportGLB();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    runtime.current = null;
    finish();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    entityController.dispose();
  });
});
