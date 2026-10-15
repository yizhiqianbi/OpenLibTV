import { beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { deleteStudioDocument, persistStudioDocument, readStudioDocument } from './persistence.js';
import { glbBufferToDataUrl, parseGlbDataUrl } from './glb.js';
import { createViewportEntityController } from './viewport-entities.js';
import { Group } from 'three';

beforeEach(() => localStorage.clear());

describe('studio persistence boundary', () => {
  it('keeps legacy project data readable and updates only its index entry', () => {
    const document = {
      id: 'studio',
      title: '场景',
      objects: [{ id: 'cube' }],
      frames: [],
      duration: 10,
      ratio: '16:9',
    };
    localStorage.setItem(
      'libtv-studio-projects',
      JSON.stringify([{ id: 'other', name: 'other', date: 1 }]),
    );
    persistStudioDocument(document, 123);
    expect(readStudioDocument('studio')).toEqual({ ...document, date: 123 });
    expect(JSON.parse(localStorage.getItem('libtv-studio-projects'))).toEqual([
      { id: 'studio', name: '场景', date: 123 },
      { id: 'other', name: 'other', date: 1 },
    ]);
    expect(localStorage.getItem('libtv.studio.studio')).toBe(
      JSON.stringify({ ...document, date: 123 }),
    );
  });

  it('deletes its document and leaves other saved projects intact', () => {
    persistStudioDocument({ id: 'studio', title: '场景', objects: [], frames: [] });
    persistStudioDocument({ id: 'other', title: '其他', objects: [], frames: [] });
    deleteStudioDocument('studio');
    expect(readStudioDocument('studio')).toBeNull();
    expect(readStudioDocument('other').title).toBe('其他');
    expect(
      JSON.parse(localStorage.getItem('libtv-studio-projects')).map((project) => project.id),
    ).toEqual(['other']);
  });

  it('restores real imported geometry from the unchanged saved data URL schema', async () => {
    const bytes = await readFile('artifacts/studio-import-fixture.glb');
    const dataUrl = glbBufferToDataUrl(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const imported = {
      id: 'import',
      type: 'glb',
      name: 'fixture.glb',
      dataUrl,
      position: [2, 1, 0],
      rotation: [0, 30, 0],
      scale: [2, 2, 2],
      visible: true,
    };
    persistStudioDocument({
      id: 'glb-project',
      title: 'GLB',
      objects: [imported],
      frames: [],
      duration: 10,
      ratio: '16:9',
    });
    const restored = readStudioDocument('glb-project');
    expect(restored.objects[0]).toEqual(imported);
    const entities = new Map();
    const controller = createViewportEntityController({
      content: new Group(),
      entities,
      transform: { detach() {} },
      parseImported: parseGlbDataUrl,
    });
    controller.reconcile(restored.objects);
    await controller.waitForReady();
    const names = [];
    entities.get(imported.id).traverse((object) => {
      if (object.isMesh) names.push(object.name);
    });
    expect(names).toEqual(['OrangeTorusLoop', 'BlueConePeak']);
    expect(entities.get(imported.id).position.toArray()).toEqual([2, 1, 0]);
    controller.dispose();
  });
});
