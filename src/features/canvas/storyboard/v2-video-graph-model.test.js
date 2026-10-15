import { describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import {
  describeScriptV2VideoReferences,
  planCanvasScriptV2VideoGraph,
} from './v2-video-graph-model.js';

const NOW = 1_800_000_000_000;
function fixture(count = 2) {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `row-id-${index + 1}`,
    hiddenUuid: `row-${index + 1}`,
    shotNumber: index + 1,
    plotDescription: '海边',
    imageGenerationPrompt: '人物海边',
    videoMotionPrompt: 'Alice 看向海岸',
    durationSeconds: 13,
    characters: [{ characterAssetId: 'char' }],
    sceneAssetIds: ['scene'],
    finalVideoPromptEntityRefs: [
      { text: 'Alice', assetId: 'char' },
      { text: '海岸', assetId: 'scene' },
    ],
  }));
  const script = {
    id: 'script',
    type: 'script-v2',
    position: { x: 100, y: 200 },
    width: 350,
    data: {
      title: '海边脚本',
      name: '旧名字',
      rows,
      linkedVideoGroupId: 'old-videos',
      linkedImageGroupId: 'images',
      videoGenConfig: { model: 'old' },
      assets: {
        characters: [{ id: 'char', name: 'Alice', linkedNodeId: 'character-image' }],
        scenes: [{ id: 'scene', name: '海岸', linkedNodeId: 'scene-image' }],
        props: [],
      },
    },
  };
  const asset = (id, url) => ({
    id,
    type: 'image',
    position: { x: 0, y: 0 },
    createdAtMs: NOW - 1000,
    data: { url: [url] },
  });
  let next = 0;
  return {
    nodes: [
      script,
      asset('character-image', 'https://assets.test/char.png?watermark=keep'),
      asset('scene-image', 'https://assets.test/scene.png'),
    ],
    edges: [],
    scriptId: script.id,
    selectedHiddenUuids: new Set(rows.map((row) => row.hiddenUuid)),
    perShotDurations: new Map([
      ['row-1', 6],
      ['row-2', 10],
    ]),
    nowMs: NOW,
    config: {
      model: 'v2-model',
      modeType: 'mixed2video',
      settings: { ratio: '16:9', duration: 8, resolution: '720p', nested: { keep: true } },
      advancedSettings: { autoCompliance: 0, ignored: 'field' },
      modelSchema: {
        properties: {
          modeType: { items: { mixed2video: [1, 6] }, mixed2videoConfig: { imageMax: 4 } },
          duration: { enum: [4, 6, 10] },
        },
      },
    },
    makeId: vi.fn((kind) => `new-${kind}-${++next}`),
  };
}
const source = (input) => input.nodes.find((node) => node.id === 'script');
const asset = (input, id = 'character-image') => input.nodes.find((node) => node.id === id);
const videos = (result) => result.addedNodes.filter((node) => node.type === 'video');
const params = (result, index = 0) => videos(result)[index].data.params;
function expectAtomicFailure(result, reason) {
  expect(result.ok).toBe(false);
  if (reason) expect(result.reason).toBe(reason);
  expect(result.message).toMatch(/[\u4e00-\u9fff]/);
  expect(result.addedNodes).toEqual([]);
  expect(result.addedEdges).toEqual([]);
  expect(result.nodePatches).toEqual([]);
  expect(result.submitted).toBe(false);
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}
function addProp(input) {
  source(input).data.assets.props.push({ id: 'prop', name: '望远镜', linkedNodeId: 'prop-image' });
  input.nodes.push({
    id: 'prop-image',
    type: 'image',
    position: { x: 0, y: 0 },
    createdAtMs: NOW - 1000,
    data: { url: ['https://assets.test/prop.png'] },
  });
}

describe('ScriptV2 all-row reference descriptor', () => {
  it('returns full row Maps while required maximum follows explicit selected IDs', () => {
    const input = fixture();
    addProp(input);
    source(input).data.rows[1].propAssetIds = ['prop'];
    const result = describeScriptV2VideoReferences({
      ...input,
      selectedHiddenUuids: new Set(['row-1']),
    });
    expect(result.valid).toBe(true);
    expect(result.rows).toBe(source(input).data.rows);
    expect([...result.refCounts]).toEqual([
      ['row-1', 2],
      ['row-2', 3],
    ]);
    expect(result.requiredRefs).toBe(2);
    expect(result.maxRequiredRefs).toBe(2);
    expect(result.refsByRow.get('row-2').references).toHaveLength(3);
    expect(result.assetsReady).toBe(true);
    expect(result.assetReadiness).toEqual({
      total: 3,
      readyCount: 3,
      pendingCount: 0,
      pendingAssetIds: [],
      ready: true,
    });
    expect(
      describeScriptV2VideoReferences({ ...input, selectedHiddenUuids: new Set() }).requiredRefs,
    ).toBe(0);
    expect(
      describeScriptV2VideoReferences({ ...input, selectedHiddenUuids: undefined }).requiredRefs,
    ).toBe(3);
  });
  it('produces source read-only preview with reserved poster offset, without adding any placeholder to the graph', () => {
    const input = fixture(1),
      before = structuredClone(input.nodes);
    const result = describeScriptV2VideoReferences(input);
    expect(result.prompts.get('row-1')).toBe(
      '资产图锚定：\n角色 Alice 的参考图是 图片2\n场景 海岸 的参考图是 图片3\n\nAlice 看向海岸',
    );
    expect(result.refsByRow.get('row-1').previewPrompt).toBe(result.prompts.get('row-1'));
    expect(input.nodes).toEqual(before);
    expect(result.refsByRow.get('row-1').references.map((ref) => ref.nodeId)).toEqual([
      'character-image',
      'scene-image',
    ]);
  });
  it('distinguishes thumbnail readiness from linked-node actual references and checks all assets', () => {
    const input = fixture();
    source(input).data.assets.props.push({ id: 'unselected', name: '尚未准备' });
    const pending = describeScriptV2VideoReferences(input);
    expect(pending.assetReadiness).toMatchObject({
      pendingCount: 1,
      pendingAssetIds: ['unselected'],
      ready: false,
    });
    source(input).data.assets.props[0].thumbnailUrl = 'https://thumb.test/prop.png';
    expect(describeScriptV2VideoReferences(input).assetReadiness.ready).toBe(true);
    source(input).data.rows[0].characters = [];
    source(input).data.rows[0].sceneAssetIds = [];
    source(input).data.rows[0].finalVideoPromptEntityRefs = [];
    source(input).data.rows[0].propAssetIds = ['unselected'];
    expect(describeScriptV2VideoReferences(input).refCounts.get('row-1')).toBe(0);
  });
  it('deduplicates alias assets by real node identity and reads only current URL[0]', () => {
    const input = fixture(1);
    source(input).data.assets.props.push({
      id: 'alias',
      name: '同角色',
      linkedNodeId: 'character-image',
    });
    source(input).data.rows[0].propAssetIds = ['alias'];
    asset(input).data.url = ['', 'https://assets.test/later.png'];
    source(input).data.assets.characters[0].thumbnailUrl = 'https://thumb.test/char.png';
    const result = describeScriptV2VideoReferences(input);
    expect(result.assetsReady).toBe(false); // alias also needs its own thumbnail or linked primary URL
    expect(result.refCounts.get('row-1')).toBe(1);
    expect(result.refsByRow.get('row-1').references[0].nodeId).toBe('scene-image');
  });
  it.each([
    (input) => {
      input.nodes.push({ ...asset(input) });
    },
    (input) => {
      source(input).type = 'script';
    },
    (input) => {
      source(input).data.rows[1].hiddenUuid = 'row-1';
    },
    (input) => {
      source(input).data.rows[0].hiddenUuid = 7;
    },
    (input) => {
      source(input).data.rows[0].finalVideoPromptEntityRefs = [{ text: 3 }];
    },
    (input) => {
      asset(input).data.url = [7, 'https://later.test'];
    },
    (input) => {
      input.selectedHiddenUuids = ['row-1'];
    },
  ])('returns no partial maps for malformed input', (mutate) => {
    const input = fixture();
    mutate(input);
    const result = describeScriptV2VideoReferences(input);
    expect(result.valid).toBe(false);
    expect(result.rows).toEqual([]);
    expect(result.refCounts.size).toBe(0);
    expect(result.refsByRow.size).toBe(0);
    expect(result.prompts.size).toBe(0);
  });
});

describe('ScriptV2 rw empty-video graph', () => {
  it('creates asset-only mixed generators and script link, retaining current graph and all source settings', () => {
    const input = fixture(),
      before = structuredClone({ nodes: input.nodes, edges: input.edges, config: input.config });
    freeze(input.nodes);
    freeze(input.edges);
    freeze(input.config);
    const result = planCanvasScriptV2VideoGraph(input);
    expect(result.ok).toBe(true);
    expect(result.submitted).toBe(false);
    expect(result.addedNodes[0]).toMatchObject({
      type: 'group',
      position: { x: 650, y: 200 },
      zIndex: -1001,
      width: 1364,
      height: 460,
      data: {
        name: '视频组 · 海边脚本',
        sourceScriptNodeId: 'script',
        storyboardGroupType: 'video',
        sourceScriptVersion: 'v2',
        groupColor: null,
      },
    });
    expect(videos(result).map((node) => node.position)).toEqual([
      { x: 40, y: 70 },
      { x: 702, y: 70 },
    ]);
    expect(videos(result)[0]).toMatchObject({
      width: 622,
      height: 350,
      measured: { width: 622, height: 350 },
      data: {
        url: [],
        poster: '',
        _explicitContentDims: true,
        contentWidth: 622,
        contentHeight: 350,
      },
    });
    expect(params(result)).toEqual({
      prompt:
        '资产图锚定：\n角色 Alice 的参考图是 {{Image 1}}\n场景 海岸 的参考图是 {{Image 2}}\n\nAlice 看向海岸',
      model: 'v2-model',
      modeType: 'mixed2video',
      settings: { ...input.config.settings, duration: 6 },
      image: '',
      imageList: [
        { nodeId: 'character-image', url: 'https://assets.test/char.png?watermark=keep' },
        { nodeId: 'scene-image', url: 'https://assets.test/scene.png' },
      ],
      imageListOrder: ['character-image', 'scene-image'],
      imageLabelList: ['图片 1', '图片 2'],
      scene: 'group-generate',
    });
    expect(params(result, 1).settings.duration).toBe(10);
    expect(result.addedEdges.map((edge) => edge.source)).toEqual([
      'character-image',
      'scene-image',
      'character-image',
      'scene-image',
      'script',
    ]);
    expect(result.nodePatches).toEqual([
      { nodeId: 'script', data: { linkedVideoGroupId: result.groupId } },
    ]);
    expect({ nodes: input.nodes, edges: input.edges, config: input.config }).toEqual(before);
    expect(params(result).settings.nested).not.toBe(input.config.settings.nested);
    for (const field of ['sourceImageGroupId', 'childNodeIds', 'videoGenConfig'])
      expect(result.addedNodes[0].data).not.toHaveProperty(field);
    for (const field of [
      'advancedSettings',
      'scriptRowHiddenUuid',
      'taskInfo',
      'output',
      'count',
    ]) {
      expect(videos(result)[0].data).not.toHaveProperty(field);
      expect(params(result)).not.toHaveProperty(field);
    }
    expect(result.addedNodes.some((node) => node.id.startsWith('virtual-row'))).toBe(false);
  });
  it('ignores linkedImageGroupId and existing ready storyboard image URLs entirely', () => {
    const input = fixture(1);
    input.nodes.push(
      { id: 'images', type: 'group', position: { x: 1000, y: 0 }, data: {} },
      {
        id: 'storyboard-image',
        type: 'image',
        parentId: 'images',
        position: { x: 40, y: 70 },
        data: { url: ['https://storyboard.test/main.png'], scriptRowHiddenUuid: 'row-1' },
      },
    );
    const result = planCanvasScriptV2VideoGraph(input);
    expect(result.ok).toBe(true);
    expect(params(result).imageList.map((ref) => ref.nodeId)).toEqual([
      'character-image',
      'scene-image',
    ]);
    expect(videos(result)[0].data.poster).toBe('');
    expect(result.addedEdges.at(-1)).toMatchObject({ source: 'script', target: result.groupId });
  });
  it('keeps original script-array order and explicit empty selection is not all', () => {
    const input = fixture(3);
    input.selectedHiddenUuids = new Set(['row-3', 'row-1']);
    const result = planCanvasScriptV2VideoGraph(input);
    expect(videos(result).map((node) => node.data.name)).toEqual(['分镜视频-#1', '分镜视频-#3']);
    expectAtomicFailure(
      planCanvasScriptV2VideoGraph({ ...input, selectedHiddenUuids: new Set() }),
      'no-children',
    );
    expectAtomicFailure(
      planCanvasScriptV2VideoGraph({ ...input, selectedHiddenUuids: undefined }),
      'invalid-selection',
    );
  });
  it('supports source nullish shotNumber fallback and explicit group world-position adapter', () => {
    const input = fixture(2);
    source(input).data.rows[0].shotNumber = 0;
    delete source(input).data.rows[1].shotNumber;
    const result = planCanvasScriptV2VideoGraph({ ...input, groupPosition: { x: 0, y: -20 } });
    expect(result.addedNodes[0].position).toEqual({ x: 0, y: -20 });
    expect(videos(result).map((node) => node.data.name)).toEqual(['分镜视频-#0', '分镜视频-#2']);
  });
  it('blocks unready assets even if those assets are absent from selected row refs', () => {
    const input = fixture();
    source(input).data.assets.props.push({ id: 'pending', name: '尚未准备' });
    expectAtomicFailure(planCanvasScriptV2VideoGraph(input), 'assets-not-ready');
    expect(input.makeId).not.toHaveBeenCalled();
  });
  it('blocks thumbnail-only selected references and overcapacity rows instead of silently clearing or truncating refs', () => {
    const input = fixture(1);
    source(input).data.assets.characters[0].thumbnailUrl = 'https://thumb.test/char';
    source(input).data.assets.scenes[0].thumbnailUrl = 'https://thumb.test/scene';
    asset(input).data.url = [];
    asset(input, 'scene-image').data.url = [];
    expectAtomicFailure(planCanvasScriptV2VideoGraph(input), 'missing-refs');
    expect(input.makeId).not.toHaveBeenCalled();
    const over = fixture();
    over.config.modelSchema.properties.modeType.mixed2videoConfig.imageMax = 1;
    expectAtomicFailure(planCanvasScriptV2VideoGraph(over), 'over-ref-limit');
    expect(over.makeId).not.toHaveBeenCalled();
  });
  it.each([
    { mixed2video: [3, 6] },
    { image2video: [1, 6] },
    { mixed2video: [0, 0] },
    { mixed2video: [NaN, 6] },
  ])('blocks unsupported mixed schema %j', (items) => {
    const input = fixture();
    input.config.modelSchema.properties.modeType.items = items;
    expectAtomicFailure(planCanvasScriptV2VideoGraph(input), 'unsupported-mode');
    expect(input.makeId).not.toHaveBeenCalled();
  });
  it('uses the real Kling mixed minimum per row while the selected maximum remains usable', () => {
    const input = fixture();
    input.config.model = 'kling-v3-motion-control';
    input.config.modelSchema = models.videoModels['kling-v3-motion-control'];
    const row = source(input).data.rows[0];
    row.sceneAssetIds = [];
    row.finalVideoPromptEntityRefs = [{ text: 'Alice', assetId: 'char' }];
    row.videoMotionPrompt = '@Alice 转身';
    const original = structuredClone(input.nodes);
    const result = planCanvasScriptV2VideoGraph(input);
    expect(result.ok).toBe(true);
    expect(params(result, 0)).toMatchObject({
      modeType: 'text2video',
      image: '',
      imageList: [],
      imageListOrder: undefined,
      imageLabelList: undefined,
    });
    expect(params(result, 0).prompt).toContain('Alice');
    expect(params(result, 0).prompt).not.toMatch(/\{\{Image|资产图锚定/);
    expect(params(result, 1).modeType).toBe('mixed2video');
    expect(params(result, 1).imageList.map((ref) => ref.nodeId)).toEqual([
      'character-image',
      'scene-image',
    ]);
    const children = videos(result);
    expect(result.addedEdges.map((edge) => [edge.source, edge.target])).toEqual([
      ['character-image', children[1].id],
      ['scene-image', children[1].id],
      ['script', result.groupId],
    ]);
    expect(result.warnings).toEqual([
      {
        key: 'canvas:storyboardVideoRefUnsupportedByModel',
        values: { shotCount: 1, refCount: 1 },
      },
    ]);
    expect(input.nodes).toEqual(original);
    expect(result.submitted).toBe(false);
  });
  it('aggregates source unsupported-reference warnings without dropping any selected generator', () => {
    const input = fixture(3);
    input.config.modelSchema.properties.modeType.items.mixed2video = [2, 2];
    for (const index of [0, 2]) {
      const row = source(input).data.rows[index];
      row.sceneAssetIds = [];
      row.finalVideoPromptEntityRefs = [];
      row.videoMotionPrompt = 'Alice 转身';
    }
    const result = planCanvasScriptV2VideoGraph(input);
    expect(result.ok).toBe(true);
    expect(videos(result).map((node) => node.data.params.modeType)).toEqual([
      'text2video',
      'mixed2video',
      'text2video',
    ]);
    expect(result.warnings).toEqual([
      {
        key: 'canvas:storyboardVideoRefUnsupportedByModel',
        values: { shotCount: 2, refCount: 2 },
      },
    ]);
  });
  it('blocks selected empty prompt before IDs and preserves unselected empty prompt', () => {
    const input = fixture();
    source(input).data.rows[1].videoMotionPrompt = '';
    source(input).data.rows[1].plotDescription = '';
    expectAtomicFailure(planCanvasScriptV2VideoGraph(input), 'empty-prompt');
    input.selectedHiddenUuids = new Set(['row-1']);
    expect(planCanvasScriptV2VideoGraph(input).ok).toBe(true);
  });
});

describe('source eq per-shot duration normalization', () => {
  it.each([
    [5, 6],
    [8, 10],
    [-2, 4],
    [100, 10],
    [4, 4],
  ])('normalizes numeric enum %s to %s with ties upward', (duration, expected) => {
    const input = fixture(1);
    input.perShotDurations.set('row-1', duration);
    expect(params(planCanvasScriptV2VideoGraph(input)).settings.duration).toBe(expected);
    expect(source(input).data.rows[0].durationSeconds).toBe(13);
  });
  it('uses source min-based slider steps, clamps and retains config value when no per-shot value exists', () => {
    const input = fixture(3);
    input.config.modelSchema.properties.duration = { min: 3, max: 12, step: 2 };
    input.perShotDurations = new Map([
      ['row-1', 6],
      ['row-2', 20],
    ]);
    const result = planCanvasScriptV2VideoGraph(input);
    expect(videos(result).map((node) => node.data.params.settings.duration)).toEqual([7, 12, 8]);
    expect(source(input).data.rows.map((row) => row.durationSeconds)).toEqual([13, 13, 13]);
  });
  it('keeps finite free duration when schema has no duration constraint', () => {
    const input = fixture(1);
    delete input.config.modelSchema.properties.duration;
    input.perShotDurations.set('row-1', 6.25);
    expect(params(planCanvasScriptV2VideoGraph(input)).settings.duration).toBe(6.25);
  });
  it('fails malformed duration map/value atomically, never fabricating row duration', () => {
    const input = fixture(1);
    input.perShotDurations.set('row-1', Infinity);
    expectAtomicFailure(planCanvasScriptV2VideoGraph(input));
    expect(input.makeId).not.toHaveBeenCalled();
    expectAtomicFailure(
      planCanvasScriptV2VideoGraph({ ...input, perShotDurations: {} }),
      'invalid-duration',
    );
  });
});

describe('v2 real asset portrait approval boundary', () => {
  it.each([{ properties: true }, { vendor: 'star-video2' }, { vendor: 'star-video2-fast-v2' }])(
    'requires real proof for schema %j even with autoCompliance off',
    (kind) => {
      const input = fixture(1);
      if (kind.properties) input.config.modelSchema.properties.portrait = true;
      if (kind.vendor) input.config.modelSchema.modelVendor = kind.vendor;
      asset(input).data.originalUrl = ['https://original.test/char.png'];
      const result = planCanvasScriptV2VideoGraph(input);
      expectAtomicFailure(result, 'portrait-unverified');
      expect(result.blocked).toBe(true);
      expect(result.portraitRequired).toEqual([
        {
          nodeId: 'character-image',
          linkedNodeId: 'character-image',
          url: 'https://assets.test/char.png?watermark=keep',
          assetIds: ['char'],
          originalUrl: ['https://original.test/char.png'],
          sourceCreatedAtMs: NOW - 1000,
        },
        {
          nodeId: 'scene-image',
          linkedNodeId: 'scene-image',
          url: 'https://assets.test/scene.png',
          assetIds: ['scene'],
          originalUrl: [],
          sourceCreatedAtMs: NOW - 1000,
        },
      ]);
      expect(input.makeId).not.toHaveBeenCalled();
    },
  );
  it('deduplicates portraitRequired across rows and script aliases, and omits valid certificates', () => {
    const input = fixture(2);
    input.config.modelSchema.properties.portrait = true;
    source(input).data.assets.props.push({
      id: 'alias',
      name: '同一角色',
      linkedNodeId: 'character-image',
    });
    source(input).data.rows[0].propAssetIds = ['alias'];
    asset(input, 'scene-image').data.portraitCompliantExempt = true;
    const result = planCanvasScriptV2VideoGraph(input);
    expect(result.portraitRequired).toHaveLength(1);
    expect(result.portraitRequired[0].assetIds).toEqual(['char', 'alias']);
  });
  it('reuses fresh checked or source-created certificates and keeps reference media metadata exactly', () => {
    const input = fixture(1);
    input.config.modelSchema.properties.portrait = true;
    Object.assign(asset(input).data, {
      portraitAssetId: 'real-certificate',
      portraitComplianceCheckedAtMs: NOW - 5_184_000_000 + 1,
    });
    asset(input, 'scene-image').data.portraitCompliantExempt = true;
    const result = planCanvasScriptV2VideoGraph(input);
    expect(result.ok).toBe(true);
    expect(params(result).imageList).toEqual([
      {
        nodeId: 'character-image',
        url: 'https://assets.test/char.png?watermark=keep',
        assetId: 'real-certificate',
      },
      { nodeId: 'scene-image', url: 'https://assets.test/scene.png', compliantExempt: true },
    ]);
    expect(params(result).imageList[0]).not.toHaveProperty('sourceCreatedAtMs');
    expect(result.nodePatches).toHaveLength(1);
  });
  it.each([
    [
      'expiry boundary',
      { portraitAssetId: 'cert', portraitComplianceCheckedAtMs: NOW - 5_184_000_000 },
      {},
    ],
    ['future certificate', { portraitAssetId: 'cert', portraitComplianceCheckedAtMs: NOW + 1 }, {}],
    ['local placeholder', { portraitAssetId: 'cert' }, { createdAtMsIsLocalPlaceholder: true }],
    ['string exempt is not proof', { portraitCompliantExempt: 'yes' }, {}],
  ])('requires fresh real approval for %s', (_name, data, node) => {
    const input = fixture(1);
    input.config.modelSchema.properties.portrait = true;
    Object.assign(asset(input).data, data);
    Object.assign(asset(input), node);
    asset(input, 'scene-image').data.portraitCompliantExempt = true;
    expectAtomicFailure(planCanvasScriptV2VideoGraph(input), 'portrait-unverified');
    expect(input.makeId).not.toHaveBeenCalled();
  });
  it('projects approved results into real assets and output refs with one script link, without mutating originals', () => {
    const input = fixture(1);
    input.config.modelSchema.modelVendor = 'star-video2';
    asset(input).data.portraitCompliantExempt = true;
    input.portraitResults = [
      {
        nodeId: 'character-image',
        url: 'https://assets.test/char.png?watermark=keep',
        status: 'approved',
        checkedAtMs: NOW,
        assetId: 'new-real-cert',
      },
      {
        nodeId: 'scene-image',
        url: 'https://assets.test/scene.png',
        status: 'approved',
        checkedAtMs: NOW,
        exempt: true,
      },
    ];
    const before = structuredClone(input.nodes),
      result = planCanvasScriptV2VideoGraph(input);
    expect(result.ok).toBe(true);
    expect(result.nodePatches.slice(0, 2)).toEqual([
      {
        nodeId: 'character-image',
        data: {
          portraitAssetId: 'new-real-cert',
          portraitCompliantExempt: undefined,
          portraitComplianceCheckedAtMs: NOW,
        },
      },
      {
        nodeId: 'scene-image',
        data: {
          portraitAssetId: undefined,
          portraitCompliantExempt: true,
          portraitComplianceCheckedAtMs: NOW,
        },
      },
    ]);
    expect(params(result).imageList[0].assetId).toBe('new-real-cert');
    expect(params(result).imageList[1].compliantExempt).toBe(true);
    expect(input.nodes).toEqual(before);
  });
  it.each([
    { nodeId: 'gone' },
    { url: 'changed' },
    { status: 'rejected' },
    { checkedAtMs: NOW + 1 },
    { assetId: undefined },
  ])(
    'rejects mismatched or unapproved service proof %j without partial certificate patches',
    (patch) => {
      const input = fixture(1);
      input.config.modelSchema.properties.portrait = true;
      input.portraitResults = [
        {
          nodeId: 'character-image',
          url: 'https://assets.test/char.png?watermark=keep',
          status: 'approved',
          checkedAtMs: NOW,
          assetId: 'real-cert',
          ...patch,
        },
      ];
      expectAtomicFailure(planCanvasScriptV2VideoGraph(input));
      expect(input.makeId).not.toHaveBeenCalled();
    },
  );
  it('rejects duplicate approval results, missing clock and late ID failure with no partial graph or patches', () => {
    const input = fixture(1);
    input.config.modelSchema.properties.portrait = true;
    const approved = {
      nodeId: 'character-image',
      url: 'https://assets.test/char.png?watermark=keep',
      status: 'approved',
      checkedAtMs: NOW,
      assetId: 'real-cert',
    };
    input.portraitResults = [approved, approved];
    expectAtomicFailure(planCanvasScriptV2VideoGraph(input), 'portrait-owner-changed');
    input.portraitResults = [];
    delete input.nowMs;
    expectAtomicFailure(planCanvasScriptV2VideoGraph(input), 'portrait-unverified');
    input.nowMs = NOW;
    asset(input, 'scene-image').data.portraitCompliantExempt = true;
    input.portraitResults = [approved];
    input.makeId = vi
      .fn()
      .mockReturnValueOnce('new-group')
      .mockReturnValueOnce('new-child')
      .mockReturnValueOnce('script');
    expectAtomicFailure(planCanvasScriptV2VideoGraph(input));
  });
  it('does not infer portrait requirement from unrelated vendor or invented asset names', () => {
    const input = fixture(1);
    input.config.modelSchema.modelVendor = 'kling-star-video2';
    expect(planCanvasScriptV2VideoGraph(input).ok).toBe(true);
  });
  it('does not propagate a malformed numeric certificate even when a real exempt boolean is reusable', () => {
    const input = fixture(1);
    input.config.modelSchema.properties.portrait = true;
    Object.assign(asset(input).data, { portraitAssetId: 123, portraitCompliantExempt: true });
    asset(input, 'scene-image').data.portraitCompliantExempt = true;
    const result = planCanvasScriptV2VideoGraph(input);
    expect(result.ok).toBe(true);
    expect(params(result).imageList[0]).toMatchObject({ compliantExempt: true });
    expect(params(result).imageList[0]).not.toHaveProperty('assetId');
  });
});

describe('atomic v2 graph validation', () => {
  it.each([
    (input) => {
      input.edges = [{ id: 'edge', source: 'script' }];
    },
    (input) => {
      asset(input).position.x = Infinity;
    },
    (input) => {
      input.config.modelSchema = undefined;
    },
    (input) => {
      input.config.settings.nested.self = input.config.settings;
    },
    (input) => {
      input.groupPosition = { x: NaN, y: 0 };
    },
    (input) => {
      input.makeId = () => 'script';
    },
  ])('never returns partial additions or modifies source input', (mutate) => {
    const input = fixture(1);
    mutate(input);
    const before = structuredClone(input.nodes);
    expectAtomicFailure(planCanvasScriptV2VideoGraph(input));
    expect(input.nodes).toEqual(before);
  });
});
