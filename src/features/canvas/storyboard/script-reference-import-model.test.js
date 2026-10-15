import { describe, expect, it, vi } from 'vitest';
import {
  planScriptV2ReferenceImport,
  resolveScriptV2ImageAsset,
  SCRIPT_V2_REFERENCE_FILE_MAX_BYTES,
  SCRIPT_V2_REFERENCE_IMAGE_ACCEPT,
  scriptV2ReferenceImportReasonLabel,
  validateScriptV2ReferenceFile,
} from './script-reference-import-model.js';
import { resolveScriptV2ResourcePlacement } from './script-preset-model.js';
import { resolveScriptV2Generator } from './script-generator-model.js';

const script = (patch = {}) => ({
  id: 'script',
  type: 'script-v2',
  position: { x: 900, y: 400 },
  data: { type: 'script-v2', name: '脚本', params: { prompt: 'keep' } },
  ...patch,
});
const image = (id, patch = {}) => ({
  id,
  type: 'image',
  position: { x: 3000, y: 3000 },
  data: { type: 'image', name: '图片', url: ['/same'] },
  ...patch,
});
const local = (name = 'local.png', patch = {}) => ({
  kind: 'local',
  file: { name, size: 100, type: 'image/png' },
  url: 'data:image/png;base64,read-content',
  ...patch,
});
const asset = (items, name = '资产') => ({
  kind: 'asset',
  name,
  data: JSON.stringify({ version: 2, items }),
});
function context(patch = {}) {
  let number = 0;
  return {
    nodes: [script()],
    edges: [],
    targetId: 'script',
    items: [local()],
    makeId: vi.fn((prefix) => `${prefix}_${++number}`),
    ...patch,
  };
}
const plan = (patch = {}) => planScriptV2ReferenceImport(context(patch));

describe('source local file boundary and explicit MIME adapter', () => {
  it('exports the exact source input accept and 30MiB size', () => {
    expect(SCRIPT_V2_REFERENCE_IMAGE_ACCEPT).toBe('image/png,image/jpeg,image/webp,image/gif');
    expect(SCRIPT_V2_REFERENCE_FILE_MAX_BYTES).toBe(0x1e00000);
  });

  it.each(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])(
    'accepts current image MIME %s at exactly the source size boundary',
    (type) => {
      expect(
        validateScriptV2ReferenceFile({
          name: 'image',
          type,
          size: SCRIPT_V2_REFERENCE_FILE_MAX_BYTES,
        }),
      ).toEqual({ valid: true, reason: '', skipped: false });
    },
  );

  it('skips only sizes strictly above30MiB before allocating IDs', () => {
    const args = context({
      items: [
        local('large.png', {
          file: {
            name: 'large.png',
            type: 'image/png',
            size: SCRIPT_V2_REFERENCE_FILE_MAX_BYTES + 1,
          },
        }),
      ],
    });
    expect(planScriptV2ReferenceImport(args)).toMatchObject({
      valid: true,
      added: 0,
      failed: 0,
      skipped: 1,
      results: [{ index: 0, status: 'skipped', reason: 'file-too-large' }],
    });
    expect(args.makeId).not.toHaveBeenCalled();
  });

  it.each(['video/mp4', 'audio/mpeg', 'text/plain', 'image/svg+xml', '', 'image/jpg'])(
    'rejects unsupported actual file type as a documented local guard: %j',
    (type) => {
      expect(
        validateScriptV2ReferenceFile({ name: 'looks-like-image.png', type, size: 1 }),
      ).toEqual({ valid: false, reason: 'unsupported-file-type', skipped: false });
    },
  );

  it.each([
    null,
    {},
    { name: 'a', type: 'image/png', size: -1 },
    { name: 'a', type: 'image/png', size: Infinity },
  ])('rejects malformed file metadata without guessing from filenames: %j', (file) => {
    expect(validateScriptV2ReferenceFile(file)).toEqual({
      valid: false,
      reason: 'invalid-file',
      skipped: false,
    });
  });
});

describe('55061 first usable image across serialized asset items', () => {
  it('scans beyond nonimage/empty first items and prefers current first nonblank URL before originalUrl', () => {
    const result = resolveScriptV2ImageAsset(
      asset([
        { data: { type: 'video', url: ['/video'] } },
        { data: { type: 'image', url: [] } },
        {
          data: {
            type: 'image',
            name: ' 原名字 ',
            url: ['', ' /current '],
            originalUrl: ['/original'],
            params: { private: true },
          },
        },
      ]),
    );
    expect(result).toEqual({
      valid: true,
      reason: '',
      image: { url: ' /current ', name: ' 原名字 ' },
    });
    expect(result.image).not.toHaveProperty('data');
  });

  it('falls back to originalUrl and original asset name without trimming returned values', () => {
    expect(
      resolveScriptV2ImageAsset(
        asset(
          [{ data: { type: 'image', name: ' ', url: ['', ' '], originalUrl: ' /original ' } }],
          ' 资产名 ',
        ),
      ),
    ).toEqual({ valid: true, reason: '', image: { url: ' /original ', name: ' 资产名 ' } });
  });

  it('uses the first valid image and does not use every URL or copy source dimensions/proof/model', () => {
    const item = {
      data: {
        type: 'image',
        url: ['/first', '/second'],
        originalUrl: ['/old'],
        contentWidth: 900,
        portraitAssetId: 'private',
        params: { model: 'source-model' },
      },
    };
    expect(
      resolveScriptV2ImageAsset(asset([item, { data: { type: 'image', url: ['/later-item'] } }]))
        .image.url,
    ).toBe('/first');
    const result = plan({ items: [asset([item])] });
    expect(result.addedNodes[0].data).toEqual({
      type: 'image',
      name: '资产',
      url: ['/first'],
      alt: '资产',
      action: 'image_resource',
      showGenerator: true,
    });
  });

  it('does not impose a version check absent from the source parser', () => {
    expect(
      resolveScriptV2ImageAsset({
        data: JSON.stringify({ items: [{ data: { type: 'image', url: ['/image'] } }] }),
        name: 'asset',
      }).valid,
    ).toBe(true);
  });

  it.each([
    'broken-json',
    JSON.stringify({ items: {} }),
    JSON.stringify({ items: [null, { data: { type: 'image', url: ['/later'] } }] }),
    null,
    [],
  ])('rejects malformed asset payloads safely: %j', (data) => {
    expect(resolveScriptV2ImageAsset({ data })).toMatchObject({
      valid: false,
      reason: 'invalid-asset',
      image: null,
    });
  });

  it.each(['video', 'audio', 'text', 'group'])(
    'does not convert nonimage asset type %s into an image reference',
    (type) => {
      expect(
        resolveScriptV2ImageAsset(asset([{ data: { type, url: ['/not-image'] } }])),
      ).toMatchObject({ valid: false, reason: 'no-image-asset' });
    },
  );
});

describe('304380/N exact new root and edge fields', () => {
  it('creates only source data, raw left430 position and explicit edge handles, leaving script unchanged', () => {
    const args = context(),
      result = planScriptV2ReferenceImport(args);
    expect(result).toMatchObject({
      valid: true,
      added: 1,
      failed: 0,
      skipped: 0,
      nodeIds: ['image_1'],
      results: [{ index: 0, status: 'added', reason: '', nodeId: 'image_1', edgeId: 'edge_2' }],
      uploaded: false,
      submitted: false,
    });
    expect(result.addedNodes).toEqual([
      {
        id: 'image_1',
        type: 'image',
        position: { x: 470, y: 400 },
        data: {
          type: 'image',
          name: 'local.png',
          url: ['data:image/png;base64,read-content'],
          alt: 'local.png',
          action: 'image_resource',
          showGenerator: true,
        },
      },
    ]);
    expect(result.addedEdges).toEqual([
      {
        id: 'edge_2',
        source: 'image_1',
        sourceHandle: 'source',
        target: 'script',
        targetHandle: 'target',
      },
    ]);
    expect(args.nodes[0].data.params).toEqual({ prompt: 'keep' });
    expect(args.makeId.mock.calls).toEqual([['image'], ['edge']]);
  });

  it('never synthesizes node handles, dimensions, params, task/proof, selection, fit or uploaded flags', () => {
    const result = plan(),
      node = result.addedNodes[0];
    for (const key of [
      'sourcePosition',
      'targetPosition',
      'width',
      'height',
      'measured',
      'style',
      'parentId',
      'selected',
      'createdAtMs',
      'resourceMeta',
    ])
      expect(node).not.toHaveProperty(key);
    for (const key of ['params', 'taskInfo', 'portraitAssetId', 'localMediaReady'])
      expect(node.data).not.toHaveProperty(key);
    expect(result).not.toHaveProperty('scriptPatch');
    expect(result).not.toHaveProperty('selectedIds');
    expect(result).not.toHaveProperty('fitNodeIds');
  });

  it('always creates a fresh node and edge for the same URL, without generic URL-based reuse', () => {
    const old = image('old', {
      position: { x: 0, y: 0 },
      data: { type: 'image', name: 'same', url: ['/same'] },
    });
    const result = plan({
      nodes: [script(), old],
      edges: [{ id: 'old-edge', source: 'old', target: 'script' }],
      items: [
        asset([{ data: { type: 'image', url: ['/same'] } }]),
        asset([{ data: { type: 'image', url: ['/same'] } }]),
      ],
    });
    expect(result.added).toBe(2);
    expect(result.nodeIds).toEqual(['image_1', 'image_3']);
    expect(result.addedEdges.map((edge) => edge.source)).toEqual(['image_1', 'image_3']);
  });

  it('keeps nonempty duplicate names and only fills source missing-name count across all existing image nodes', () => {
    const old = image('old', { hidden: true, parentId: 'missing-group' });
    const result = plan({
      nodes: [script(), old],
      items: [
        asset([{ data: { type: 'image', url: ['/a'], name: '' } }], ''),
        asset([{ data: { type: 'image', url: ['/b'], name: ' same ' } }]),
        asset([{ data: { type: 'image', url: ['/c'], name: ' same ' } }]),
      ],
    });
    expect(result.addedNodes.map((node) => node.data.name)).toEqual([' same ', ' same ', '图片2']);
    expect(result.addedNodes.at(-1).data.alt).toBe('');
  });

  it('uses target raw parent-relative coordinates and creates a root node', () => {
    const target = script({ parentId: 'parent', position: { x: 0, y: 0 } }),
      parent = {
        id: 'parent',
        type: 'group',
        position: { x: 2000, y: 2000 },
        data: { type: 'group' },
      };
    const result = plan({ nodes: [target, parent] });
    expect(result.addedNodes[0].position).toEqual({ x: -430, y: 0 });
    expect(result.addedNodes[0]).not.toHaveProperty('parentId');
  });
});

describe('source sequential addNode placement and prepend order', () => {
  it('reuses store e5 and returns reverse final root prepend order while edges/results preserve input order', () => {
    const result = plan({ items: [local('a.png'), local('b.png'), local('c.png')] });
    expect(result.addedNodes.map((node) => [node.id, node.data.name, node.position.y])).toEqual([
      ['image_5', 'c.png', 1200],
      ['image_3', 'b.png', 800],
      ['image_1', 'a.png', 400],
    ]);
    expect(result.nodeIds).toEqual(['image_1', 'image_3', 'image_5']);
    expect(result.addedEdges.map((edge) => edge.id)).toEqual(['edge_2', 'edge_4', 'edge_6']);
    expect(result.results.map((result) => result.index)).toEqual([0, 1, 2]);
  });

  it('uses measured-first geometry, includes hidden/children and ignores content-size hints', () => {
    const old = image('old', {
      position: { x: 470, y: 400 },
      width: 500,
      height: 900,
      measured: { width: 100, height: 20 },
      hidden: true,
      parentId: 'other',
      data: { type: 'image', contentHeight: 10 },
    });
    expect(plan({ nodes: [script(), old] }).addedNodes[0].position).toEqual({ x: 470, y: 470 });
    expect(old.position).toEqual({ x: 470, y: 400 });
  });

  it('covers the shared wrapper without altering old preset callers', () => {
    expect(
      resolveScriptV2ResourcePlacement({
        position: { x: 0, y: 0 },
        nodes: [{ position: { x: 0, y: 0 }, measured: { width: 350, height: 0 } }],
      }),
    ).toEqual({ valid: true, reason: '', position: { x: 0, y: 50 } });
    expect(resolveScriptV2ResourcePlacement({ position: { x: NaN, y: 0 }, nodes: [] })).toEqual({
      valid: false,
      reason: 'invalid-geometry',
      position: null,
    });
  });

  it('does not impose a schema reference cap or a batch20 quota absent from source S/M', () => {
    expect(
      plan({ items: Array.from({ length: 21 }, (_, index) => local(`${index}.png`)) }).added,
    ).toBe(21);
  });
});

describe('partial queues and local atomic safety', () => {
  it('retains successful item order with oversized skips and failed asset/file items between successes', () => {
    const args = context({
      items: [
        local('a.png'),
        asset([{ data: { type: 'video', url: ['/bad'] } }]),
        local('large.png', {
          file: {
            name: 'large.png',
            type: 'image/png',
            size: SCRIPT_V2_REFERENCE_FILE_MAX_BYTES + 1,
          },
        }),
        local('wrong.mp4', { file: { name: 'wrong.mp4', type: 'video/mp4', size: 100 } }),
        local('b.png'),
      ],
    });
    const result = planScriptV2ReferenceImport(args);
    expect(result).toMatchObject({ valid: true, added: 2, failed: 2, skipped: 1 });
    expect(result.results.map((result) => [result.index, result.status])).toEqual([
      [0, 'added'],
      [1, 'failed'],
      [2, 'skipped'],
      [3, 'failed'],
      [4, 'added'],
    ]);
    expect(result.addedNodes.map((node) => node.data.name)).toEqual(['b.png', 'a.png']);
    expect(args.makeId).toHaveBeenCalledTimes(4);
  });

  it('does not expose orphan nodes on duplicate edge/node ID and keeps later successful entries', () => {
    const ids = ['same', 'same', 'image-next', 'edge-next'];
    const result = plan({
      items: [local('bad.png'), local('good.png')],
      makeId: () => ids.shift(),
    });
    expect(result.addedNodes.map((node) => node.id)).toEqual(['image-next']);
    expect(result.addedEdges.map((edge) => edge.id)).toEqual(['edge-next']);
    expect(result.results[0]).toMatchObject({ status: 'failed', reason: 'invalid-id' });
  });

  it.each(['script', 'old-edge', '', undefined])(
    'rejects identifiers colliding with the graph or missing identifiers: %j',
    (value) => {
      const result = plan({
        edges: [{ id: 'old-edge', source: 'existing', target: 'script' }],
        makeId: () => value,
      });
      expect(result).toMatchObject({
        valid: true,
        added: 0,
        failed: 1,
        addedNodes: [],
        addedEdges: [],
      });
    },
  );

  it.each([
    [{ nodes: null }, 'invalid-input'],
    [{ edges: null }, 'invalid-input'],
    [{ items: null }, 'invalid-input'],
    [{ nodes: [script(), script()] }, 'invalid-graph'],
    [{ targetId: 'missing' }, 'no-script'],
    [{ nodes: [script({ type: 'text' })] }, 'not-v2-script'],
    [{ nodes: [script({ position: { x: Infinity, y: 0 } })] }, 'invalid-geometry'],
    [{ makeId: null }, 'invalid-id-factory'],
  ])('rejects whole invalid owner graph before allocating anything: %j', (patch, reason) => {
    const args = context(patch),
      result = planScriptV2ReferenceImport(args);
    expect(result).toMatchObject({
      valid: false,
      reason,
      addedNodes: [],
      addedEdges: [],
      results: [],
      uploaded: false,
      submitted: false,
    });
    if (typeof args.makeId === 'function') expect(args.makeId).not.toHaveBeenCalled();
  });

  it('does not mutate, serialize or copy unrelated old graph and does not report successful reading as server upload', () => {
    const toJSON = vi.fn(() => {
        throw new Error('unexpected serialization');
      }),
      target = script();
    Object.freeze(target.position);
    Object.freeze(target.data.params);
    Object.freeze(target.data);
    Object.freeze(target);
    const old = image('old', { data: { type: 'image', url: ['large-data-reference'], toJSON } });
    const args = context({ nodes: Object.freeze([target, old]), edges: Object.freeze([]) }),
      result = planScriptV2ReferenceImport(args);
    expect(result.added).toBe(1);
    expect(result.uploaded).toBe(false);
    expect(toJSON).not.toHaveBeenCalled();
    expect(args.nodes[0]).toBe(target);
    expect(args.nodes[1]).toBe(old);
  });

  it('becomes exact legal ScriptV2 source input after the caller merges roots and edges without task generation', () => {
    const args = context({ items: [local('a.png'), local('b.png')] }),
      result = planScriptV2ReferenceImport(args),
      nodes = [...result.addedNodes, ...args.nodes],
      edges = [...args.edges, ...result.addedEdges];
    const resolved = resolveScriptV2Generator({
      node: args.nodes[0],
      nodes,
      edges,
      models: {
        default: { text: 'model' },
        textModels: { model: { modelKey: 'model', rules: [{ require: ['prompt'] }] } },
      },
      support: [{ modelKey: 'model', modelName: 'model' }],
    });
    expect(resolved.params.imageList.map((ref) => ref.nodeId)).toEqual(['image_1', 'image_3']);
    expect(
      resolved.params.scenePayload.source_images.map((ref) => [
        ref.ref_id,
        ref.node_id,
        ref.display_name,
      ]),
    ).toEqual([
      ['src_img_1', 'image_1', 'a.png'],
      ['src_img_2', 'image_3', 'b.png'],
    ]);
    expect(resolved.params.prompt).toBe('keep');
    expect(nodes.every((node) => !node.data.taskInfo)).toBe(true);
  });

  it('maps internal import failure codes to readable local/source labels', () => {
    expect(scriptV2ReferenceImportReasonLabel('invalid-asset')).toBe('导入资产失败，请重试');
    expect(scriptV2ReferenceImportReasonLabel('unsupported-file-type')).toContain('PNG');
  });
});
