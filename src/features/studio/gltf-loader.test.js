// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { Worker as NodeWorker } from 'node:worker_threads';
import { afterEach, expect, it, vi } from 'vitest';
import { createStudioGltfLoader } from './gltf-loader.js';
import { parseGlbBuffer } from './glb.js';
import { encodeGlb } from './fixtures/animated-glb.js';

afterEach(() => vi.unstubAllGlobals());

it('actually decodes EXT_meshopt_compression through the installed Three loader', async () => {
  // MIT fixture: zeux/meshoptimizer js/meshopt_decoder.test.js decodeIndexBuffer16.
  const encoded = new Uint8Array([
    0xe0, 0xf0, 0x10, 0xfe, 0xff, 0xf0, 0x0c, 0xff, 0x02, 0x02, 0x02, 0x00, 0x76, 0x87, 0x56, 0x67,
    0x78, 0xa9, 0x86, 0x65, 0x89, 0x68, 0x98, 0x01, 0x69, 0x00, 0x00,
  ]);
  const positions = new Float32Array(Array.from({ length: 30 }, (_, index) => index / 10));
  const bytes = new Uint8Array(positions.byteLength + encoded.length);
  bytes.set(new Uint8Array(positions.buffer));
  bytes.set(encoded, positions.byteLength);
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [
      { byteLength: bytes.length },
      { byteLength: 24, extensions: { EXT_meshopt_compression: { fallback: true } } },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      {
        buffer: 1,
        byteLength: 24,
        extensions: {
          EXT_meshopt_compression: {
            buffer: 0,
            byteOffset: positions.byteLength,
            byteLength: encoded.length,
            byteStride: 2,
            count: 12,
            mode: 'TRIANGLES',
          },
        },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 10,
        type: 'VEC3',
        min: [0, 0.1, 0.2],
        max: [2.7, 2.8, 2.9],
      },
      { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' },
    ],
    extensionsUsed: ['EXT_meshopt_compression'],
    extensionsRequired: ['EXT_meshopt_compression'],
  };
  const scene = await parseGlbBuffer(encodeGlb(json, bytes.buffer));
  expect([...scene.children[0].geometry.index.array]).toEqual([0, 1, 2, 2, 1, 3, 4, 6, 5, 7, 8, 9]);
  expect(scene.children[0].geometry.attributes.position.count).toBe(10);
});

it('actually decodes a small Draco GLB and terminates its real decoder worker', async () => {
  // Browser Web Worker bridge only; the actual official decoder runs in a Node worker.
  const workers = [];
  class WorkerBridge {
    constructor(url) {
      this.ready = fetch(url)
        .then((response) => response.text())
        .then((source) => {
          const worker = new NodeWorker(
            `
          const { parentPort } = require('node:worker_threads');
          globalThis.self = globalThis;
          globalThis.onmessage = undefined;
          globalThis.postMessage = (data) => parentPort.postMessage(data);
          require('node:vm').runInThisContext(${JSON.stringify(source)});
          parentPort.on('message', data => globalThis.onmessage({ data }));
        `,
            { eval: true },
          );
          this.worker = worker;
          worker.on('message', (data) => this.onmessage?.({ data }));
          return worker;
        });
      this.terminate = vi.fn(() => this.ready.then((worker) => worker.terminate()));
      workers.push(this);
    }
    postMessage(message) {
      this.ready.then((worker) => worker.postMessage(message));
    }
  }
  vi.stubGlobal('Worker', WorkerBridge);
  vi.stubGlobal(
    'ProgressEvent',
    class ProgressEvent {
      constructor(type, init) {
        Object.assign(this, { type }, init);
      }
    },
  );
  const decoder = await readFile(
    'node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js',
  );
  const source = `data:text/javascript;base64,${decoder.toString('base64')}`;
  const fixture = await readFile(new URL('./fixtures/draco-box.glb', import.meta.url));
  const buffer = fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength);
  const scene = await parseGlbBuffer(buffer, {
    createLoader: async (json) => {
      const runtime = await createStudioGltfLoader(json);
      runtime.loader.dracoLoader.setDecoderConfig({ type: 'js' });
      runtime.loader.manager.setURLModifier(() => source);
      return runtime;
    },
  });
  let mesh;
  scene.traverse((object) => {
    if (object.isMesh) mesh = object;
  });
  expect(mesh.geometry.attributes.position.count).toBe(24);
  expect(mesh.geometry.index.count).toBe(36);
  expect(workers).toHaveLength(1);
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  await workers[0].ready;
  await workers[0].terminate.mock.results[0].value;
});
