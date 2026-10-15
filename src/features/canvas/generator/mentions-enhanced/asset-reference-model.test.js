// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  evaluatePromptAssetSelection,
  planPromptAssetReferences,
  promptAssetPickerCapacity,
  resolvePromptAssetCandidate,
} from './asset-reference-model.js';

const models = JSON.parse(
  readFileSync(new URL('../../../../../public/data/models.json', import.meta.url), 'utf8'),
);
const target = (type = 'image', data = {}) => ({
  id: 'target',
  type,
  position: { x: 700, y: 200 },
  data: {
    type,
    action: `${type}_generate`,
    params: { model: models.default[type] },
    ...data,
  },
});
const localAsset = (id, type = 'image', url = `https://example.test/${id}`) => ({
  id,
  name: ` Asset ${id} `,
  mediaType: type,
  url,
});
const richAsset = (id, data, other = []) => ({
  id,
  name: ' Rich name ',
  mediaType: data?.type || 'image',
  url: 'https://example.test/row-fallback',
  assetData: JSON.stringify({ version: 2, items: [{ data }, ...other] }),
});
const resource = (id, type, url) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: { type, action: `${type}_resource`, url: [url] },
});
function plan(options = {}) {
  let nodeCount = 0;
  let edgeCount = 0;
  return planPromptAssetReferences({
    nodes: [target()],
    edges: [],
    models,
    targetId: 'target',
    items: [],
    makeNodeId: (type) => `${type}-new-${++nodeCount}`,
    makeEdgeId: () => `edge-new-${++edgeCount}`,
    ...options,
  });
}
const selection = (item, options = {}) =>
  evaluatePromptAssetSelection({
    nodes: [target()],
    edges: [],
    models,
    targetId: 'target',
    item,
    ...options,
  });

describe('node prompt asset source and local adapter', () => {
  it('uses only the first v2 item and its first nonempty URL, preserving its payload', () => {
    const data = {
      type: 'image',
      action: 'image_resource',
      url: ['', ' https://example.test/first ', 'https://example.test/second'],
      custom: { source: true },
    };
    const item = richAsset('rich', data, [
      { data: { type: 'video', action: 'video_resource', url: ['later'] } },
    ]);
    const result = plan({ items: [item] });
    expect(result.success).toBe(1);
    expect(result.nodes[1].data).toEqual({ ...data, name: 'Rich name' });
    expect(resolvePromptAssetCandidate(item).url).toBe('https://example.test/first');
    expect(result.nodeIds).toHaveLength(1);
  });

  it('never promotes a later item or row URL after an invalid, text or corrupt first item', () => {
    const second = { data: { type: 'image', action: 'image_resource', url: ['valid'] } };
    const invalid = richAsset('invalid', null, [second]);
    const text = richAsset('text', { type: 'text', content: ['text'] }, [second]);
    const corrupt = { ...localAsset('corrupt'), assetData: '{' };
    const empty = { ...localAsset('empty'), assetData: '' };
    const result = plan({ items: [invalid, text, corrupt, empty] });
    expect(result).toMatchObject({ success: 0, failed: 4, changed: false });
    expect(result.nodes).toHaveLength(1);
    expect(resolvePromptAssetCandidate({ isFolder: true, uuid: 'folder' })).toBeNull();
    expect(resolvePromptAssetCandidate({ id: 123, data: '{}' })).toBeNull();
  });

  it('adapts legacy local URLs with readiness but preserves and rejects unknown rich actions', () => {
    const item = localAsset('local');
    expect(resolvePromptAssetCandidate(item).item.data).toEqual({
      type: 'image',
      name: 'Asset local',
      url: ['https://example.test/local'],
      localMediaReady: true,
    });
    expect(plan({ items: [item] }).success).toBe(1);
    expect(plan({ items: [item], localResourceActions: false }).success).toBe(0);
    expect(
      plan({ items: [richAsset('unknown', { type: 'image', action: 'unknown', url: ['valid'] })] }),
    ).toMatchObject({ success: 0, failed: 1, nodes: [target()], edges: [] });
  });
});

describe('one-batch graph asset references', () => {
  it('prefers a connected URL across media types, then the first matching node in graph order', () => {
    const first = resource('first', 'image', 'same');
    const connected = resource('connected', 'video', 'same');
    const unrelated = resource('unrelated', 'audio', 'different');
    const nodes = [target('video'), first, unrelated, connected];
    const edges = [{ id: 'old', source: 'connected', target: 'target' }];
    const makeNodeId = vi.fn();
    const reuse = plan({ nodes, edges, items: [localAsset('one', 'image', 'same')], makeNodeId });
    expect(reuse.nodeIds).toEqual(['connected']);
    expect(reuse.nodes).toBe(nodes);
    expect(reuse.edges).toBe(edges);
    expect(reuse.changed).toBe(false);
    expect(makeNodeId).not.toHaveBeenCalled();
    const existing = plan({ nodes, items: [localAsset('one', 'image', 'same')], makeNodeId });
    expect(existing.nodeIds).toEqual(['first']);
    expect(existing.nodes).toBe(nodes);
    expect(existing.edges[0].source).toBe('first');
  });

  it('keeps duplicate successful asset occurrences while adding one node and one edge', () => {
    const result = plan({
      items: [localAsset('one', 'image', 'same'), localAsset('two', 'image', 'same')],
    });
    expect(result).toMatchObject({ success: 2, failed: 0, changed: true });
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.nodeIds).toEqual(['image-new-1', 'image-new-1']);
    expect(result.results.map((item) => item.allowed)).toEqual([true, true]);
  });

  it('validates against the accumulating graph without leaving failed resource nodes', () => {
    const limitedModels = {
      imageModels: { limited: { properties: { modeType: { items: { image2image: [1, 1] } } } } },
    };
    const result = plan({
      nodes: [target('image', { params: { model: 'limited' } })],
      models: limitedModels,
      items: [localAsset('one'), localAsset('two'), localAsset('three', 'video')],
    });
    expect(result).toMatchObject({ success: 1, failed: 2 });
    expect(result.nodes.map((node) => node.id)).toEqual(['target', 'image-new-1']);
    expect(result.edges).toHaveLength(1);
    expect(result.results.map((item) => item.reason)).toEqual([null, 'modelUnsupported', 'action']);
  });

  it('fails unknown models and invalid IDs without changing or mutating the input graph', () => {
    const nodes = [target('image', { params: { model: 'missing' } })];
    const edges = [];
    const snapshot = structuredClone(nodes);
    const result = plan({ nodes, edges, items: [localAsset('one')] });
    expect(result).toMatchObject({ changed: false, failed: 1 });
    expect(result.nodes).toBe(nodes);
    expect(result.edges).toBe(edges);
    expect(nodes).toEqual(snapshot);
    expect(plan({ items: [localAsset('one')], makeNodeId: () => 'target' }).results[0].reason).toBe(
      'invalidNodeId',
    );
    const edgeCollision = plan({
      edges: [{ id: 'collision', source: 'unrelated', target: 'elsewhere' }],
      items: [localAsset('one')],
      makeEdgeId: () => 'collision',
    });
    expect(edgeCollision.nodes).toHaveLength(1);
    expect(edgeCollision.changed).toBe(false);
  });

  it('uses source dimensions and a 100px left gap from the target world position', () => {
    const group = { id: 'group', type: 'group', position: { x: 1000, y: 500 } };
    const nested = { ...target(), parentId: 'group', width: 450, measured: { width: 600 } };
    const data = {
      type: 'image',
      action: 'image_resource',
      url: ['media'],
      contentWidth: 800,
      contentHeight: 400,
      _explicitContentDims: true,
      mediaDisplaySize: { sourceUrl: 'media', width: 900, height: 600 },
    };
    const result = plan({ nodes: [group, nested], items: [richAsset('one', data)] });
    expect(result.nodes[2]).toMatchObject({
      position: { x: 1000, y: 700 },
      width: 800,
      height: 400,
      measured: { width: 800, height: 400 },
    });
    expect(result.nodes[2].parentId).toBeUndefined();
    const display = plan({ items: [richAsset('two', { ...data, _explicitContentDims: false })] });
    expect(display.nodes[1]).toMatchObject({ width: 900, height: 600 });
    const mismatch = plan({
      items: [richAsset('three', { ...data, _explicitContentDims: false, url: ['other'] })],
    });
    expect(mismatch.nodes[1]).toMatchObject({ width: 800, height: 400 });
  });

  it('uses source ratio precedence, clamps only the long side, and falls back to 350 square', () => {
    const ratio = (params) =>
      plan({
        items: [
          richAsset('ratio', { type: 'image', action: 'image_resource', url: ['media'], params }),
        ],
      }).nodes[1];
    expect(
      ratio({
        settings: { ratio: 'auto', ratioCustom: '1:9', aspectRatio: '4:1' },
        aspectRatio: '2:1',
      }),
    ).toMatchObject({ width: 350, height: 1050 });
    expect(ratio({ settings: { ratio: '16:9', ratioCustom: '1:9' } })).toMatchObject({
      width: 622,
      height: 350,
    });
    expect(ratio({ settings: { ratio: 'invalid' }, aspectRatio: '2:1' })).toMatchObject({
      width: 350,
      height: 350,
    });
  });
});

describe('source picker selection qualification and footer capacity', () => {
  const limitedModels = {
    imageModels: { limited: { properties: { modeType: { items: { image2image: [1, 2] } } } } },
  };
  const limitedTarget = target('image', { params: { model: 'limited' } });

  it('counts selected assets before validating and rejects text and unsupported media actions', () => {
    const options = { nodes: [limitedTarget], models: limitedModels };
    expect(selection(localAsset('one'), options).allowed).toBe(true);
    expect(
      selection(localAsset('three'), {
        ...options,
        selected: [localAsset('one'), localAsset('two')],
      }),
    ).toMatchObject({ allowed: false, reason: 'limit' });
    expect(selection(richAsset('text', { type: 'text', url: ['media'] }))).toMatchObject({
      allowed: false,
      reason: 'unsupported',
    });
    expect(selection(richAsset('clip', { type: 'video-clip', url: ['media'] }))).toMatchObject({
      allowed: false,
      reason: 'unsupported',
    });
    expect(selection(localAsset('video', 'video'))).toMatchObject({
      allowed: false,
      reason: 'video',
    });
    expect(
      selection(richAsset('bad', { type: 'image', action: 'unknown', url: ['media'] })),
    ).toMatchObject({ allowed: false, reason: 'unsupported' });
  });

  it('checks capacity even for connected URLs, while final import reuses the connected node', () => {
    const image = resource('connected', 'image', 'same');
    const nodes = [target('image', { params: { model: 'limited' } }), image];
    const edges = [{ id: 'old', source: 'connected', target: 'target' }];
    const options = {
      nodes,
      edges,
      models: {
        imageModels: { limited: { properties: { modeType: { items: { image2image: [1, 1] } } } } },
      },
    };
    expect(selection(localAsset('one', 'image', 'same'), options).reason).toBe('limit');
    expect(plan({ ...options, items: [localAsset('one', 'image', 'same')] }).nodeIds).toEqual([
      'connected',
    ]);
  });

  it('reports original per-kind selected/max segments and omits zero or unbounded capacity', () => {
    const options = {
      nodes: [limitedTarget],
      edges: [],
      models: limitedModels,
      targetId: 'target',
    };
    expect(promptAssetPickerCapacity(options)).toEqual([{ kind: 'image', selected: 0, max: 2 }]);
    expect(
      promptAssetPickerCapacity({ ...options, selected: new Map([['one', localAsset('one')]]) }),
    ).toEqual([{ kind: 'image', selected: 1, max: 2 }]);
    const unlimitedModels = {
      imageModels: { limited: { properties: { modeType: { items: { image2image: [1, 100] } } } } },
    };
    expect(promptAssetPickerCapacity({ ...options, models: unlimitedModels })).toEqual([]);
    expect(promptAssetPickerCapacity({ ...options, targetId: 'missing' })).toEqual([]);
  });
});
