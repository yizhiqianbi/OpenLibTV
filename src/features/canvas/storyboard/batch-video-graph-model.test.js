import { describe, expect, it, vi } from 'vitest';
import {
  collectStoryboardVideoRowReferences,
  createStoryboardVideoReferenceContext,
  planCanvasBatchVideoGraph,
  projectStoryboardVideoPrompt,
} from './batch-video-graph-model.js';

const NOW = 1_800_000_000_000;
const MAX_AGE = 5_184_000_000;
function fixture(count = 1) {
  const rows = Array.from({ length: count }, (_, index) => ({
    hiddenUuid: `row-${index + 1}`,
    shotNumber: index + 1,
    videoMotionPrompt: `镜头 ${index + 1}`,
    durationSeconds: 19,
  }));
  const script = {
    id: 'script',
    type: 'screenplay',
    position: { x: 100, y: 200 },
    width: 600,
    data: {
      rows,
      linkedImageGroupId: 'images',
      linkedVideoGroupId: 'old-videos',
      assets: { characters: [], scenes: [], props: [] },
    },
  };
  const group = {
    id: 'images',
    type: 'group',
    position: { x: 900, y: 200 },
    width: 700,
    data: {
      name: '海岸',
      sourceScriptNodeId: 'script',
      sourceScriptVersion: 'v1',
      storyboardGroupType: 'image',
      childNodeIds: ['old-metadata'],
      videoGenConfig: { model: 'previous' },
    },
  };
  const images = rows.map((row, index) => ({
    id: `image-${index + 1}`,
    type: 'image',
    parentId: group.id,
    position: { x: 40, y: 70 + index * 200 },
    createdAtMs: NOW - 1000,
    data: {
      name: `分镜 #${index + 1}`,
      scriptRowHiddenUuid: row.hiddenUuid,
      url: [`https://images.test/${index + 1}.png`],
      params: { prompt: '图片提示词', settings: { ratio: '4:3' } },
    },
  }));
  let next = 0;
  return {
    nodes: [script, group, ...images],
    edges: [],
    imageGroupId: group.id,
    config: {
      model: 'model-a',
      modeType: 'singleImage2video',
      modelSchema: {
        properties: {
          modeType: {
            items: { singleImage2video: [1, 1], image2video: [1, 4], text2video: [0, 0] },
          },
        },
      },
      settings: { ratio: '16:9', duration: 6, resolution: '1080p', nested: { preserve: true } },
      advancedSettings: { ignored: 5 },
    },
    nowMs: NOW,
    makeId: vi.fn((kind) => `new-${kind}-${++next}`),
  };
}
const script = (input) => input.nodes.find((node) => node.id === 'script');
const image = (input, index = 1) => input.nodes.find((node) => node.id === `image-${index}`);
const videos = (result) => result.addedNodes.filter((node) => node.type === 'video');
const params = (result, index = 0) => videos(result)[index].data.params;
function addAsset(input, role, id, name, nodeId = `asset-node-${id}`) {
  const key = { character: 'characters', scene: 'scenes', prop: 'props' }[role];
  script(input).data.assets[key].push({ id, name, linkedNodeId: nodeId });
  if (!input.nodes.some((node) => node.id === nodeId))
    input.nodes.push({
      id: nodeId,
      type: 'image',
      position: { x: 0, y: 0 },
      data: {
        url: [`https://assets.test/${id}.png`],
        portraitAssetId: 'not-the-service-certificate',
      },
    });
  return nodeId;
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
function expectAtomicFailure(result) {
  expect(result.ok).toBe(false);
  expect(result.addedNodes).toEqual([]);
  expect(result.addedEdges).toEqual([]);
  expect(result.nodePatches).toEqual([]);
  expect(result.submitted).toBe(false);
  expect(result.message).toMatch(/[\u4e00-\u9fff]/);
}
function portrait(input) {
  input.config.modelSchema.properties.portrait = true;
  return input;
}

describe('v1 batch video source graph', () => {
  it('creates only empty generators, keeps input graph untouched, and links image group rather than script', () => {
    const input = fixture(3);
    const before = structuredClone({
      nodes: input.nodes,
      edges: input.edges,
      config: input.config,
    });
    freeze(input.nodes);
    freeze(input.edges);
    freeze(input.config);
    const result = planCanvasBatchVideoGraph(input);
    expect(result.ok).toBe(true);
    expect(result.submitted).toBe(false);
    expect(result.addedNodes).toHaveLength(4);
    expect(result.addedNodes[0]).toMatchObject({
      type: 'group',
      position: { x: 1800, y: 200 },
      zIndex: -1001,
      width: 1364,
      height: 850,
      measured: { width: 1364, height: 850 },
      data: {
        type: 'group',
        name: '视频组 · 海岸',
        groupColor: null,
        sourceScriptNodeId: 'script',
        sourceImageGroupId: 'images',
        storyboardTitle: '视频组 · 海岸',
        storyboardGroupType: 'video',
        sourceScriptVersion: 'v1',
      },
    });
    expect(videos(result).map((node) => node.position)).toEqual([
      { x: 40, y: 70 },
      { x: 702, y: 70 },
      { x: 40, y: 460 },
    ]);
    expect(videos(result).map((node) => node.data.name)).toEqual([
      '分镜视频-#1',
      '分镜视频-#2',
      '分镜视频-#3',
    ]);
    expect(videos(result)[0]).toMatchObject({
      width: 622,
      height: 350,
      parentId: result.groupId,
      measured: { width: 622, height: 350 },
      data: {
        type: 'video',
        action: 'video_generate',
        url: [],
        poster: 'https://images.test/1.png',
        _explicitContentDims: true,
        contentWidth: 622,
        contentHeight: 350,
      },
    });
    expect(params(result)).toEqual({
      prompt: '镜头 1',
      model: 'model-a',
      modeType: 'image2video',
      settings: input.config.settings,
      image: 'https://images.test/1.png',
      imageList: [{ nodeId: 'image-1', url: 'https://images.test/1.png' }],
      imageListOrder: ['image-1'],
      imageLabelList: ['图片 1'],
      scene: 'group-generate',
    });
    expect(
      result.addedEdges.map(({ source, target, sourceHandle, targetHandle }) => ({
        source,
        target,
        sourceHandle,
        targetHandle,
      })),
    ).toEqual([
      ...videos(result).map((node, index) => ({
        source: `image-${index + 1}`,
        target: node.id,
        sourceHandle: 'source',
        targetHandle: 'target',
      })),
      { source: 'images', target: result.groupId, sourceHandle: 'source', targetHandle: 'target' },
    ]);
    expect(result.nodePatches).toEqual([
      { nodeId: 'script', data: { linkedVideoGroupId: result.groupId } },
    ]);
    expect({ nodes: input.nodes, edges: input.edges, config: input.config }).toEqual(before);
    expect(params(result).settings).not.toBe(input.config.settings);
    expect(params(result).settings.nested).not.toBe(input.config.settings.nested);
    for (const field of [
      'advancedSettings',
      'scriptRowHiddenUuid',
      'modelSchema',
      'taskInfo',
      'outURL',
      'count',
    ]) {
      expect(videos(result)[0].data).not.toHaveProperty(field);
      expect(params(result)).not.toHaveProperty(field);
    }
    expect(result.addedNodes[0].data).not.toHaveProperty('childNodeIds');
    expect(result.addedNodes[0].data).not.toHaveProperty('videoGenConfig');
  });

  it('keeps script row order despite reversed numeric child names, missing and unfinished rows', () => {
    const input = fixture(4);
    image(input, 1).data.name = '分镜 #20';
    image(input, 4).data.name = '分镜 #2';
    image(input, 2).data.url = [];
    script(input).data.rows[2].hiddenUuid = undefined;
    input.nodes.reverse();
    const result = planCanvasBatchVideoGraph(input);
    expect(result.ok).toBe(true);
    expect(videos(result).map((node) => node.data.name)).toEqual(['分镜视频-#1', '分镜视频-#4']);
    expect(videos(result).map((node) => node.data.poster)).toEqual([
      'https://images.test/1.png',
      'https://images.test/4.png',
    ]);
  });

  it('uses nullish shotNumber fallback and never applies per-shot source durations in this caller', () => {
    const input = fixture(2);
    script(input).data.rows[0].shotNumber = 0;
    delete script(input).data.rows[1].shotNumber;
    const result = planCanvasBatchVideoGraph(input);
    expect(videos(result).map((node) => node.data.name)).toEqual(['分镜视频-#0', '分镜视频-#2']);
    expect(videos(result).map((node) => node.data.params.settings.duration)).toEqual([6, 6]);
  });

  it('retains ready-some qualification but builds with strict URL[0] even when a later URL is ready', () => {
    const input = fixture();
    image(input).data.url = ['', 'https://images.test/later.png'];
    const result = planCanvasBatchVideoGraph(input);
    expect(result.ok).toBe(true);
    expect(videos(result)[0].data.poster).toBe('');
    expect(params(result)).toMatchObject({ modeType: 'text2video', image: '', imageList: [] });
    expect(params(result).imageListOrder).toBeUndefined();
    expect(params(result).imageLabelList).toBeUndefined();
    expect(result.addedEdges).toHaveLength(1);
  });

  it.each([
    ['auto', 350, 350],
    ['3:2', 525, 350],
    ['1:9', 350, 1050],
    ['9:1', 1050, 350],
    ['bad', 350, 350],
  ])('computes source ratio %s with short-side 350 and max 1050', (ratio, width, height) => {
    const input = fixture();
    input.config.settings.ratio = ratio;
    expect(videos(planCanvasBatchVideoGraph(input))[0]).toMatchObject({ width, height });
  });

  it('uses related-group measured width and rightmost flow position, excluding left and unrelated groups', () => {
    const input = fixture();
    script(input).measured = { width: 300 };
    input.nodes.push(
      {
        id: 'existing-video',
        type: 'video_group',
        position: { x: 2000, y: 0 },
        width: 10,
        measured: { width: 400 },
        data: { sourceScriptNodeId: 'script' },
      },
      {
        id: 'left',
        type: 'group',
        position: { x: 200, y: 0 },
        width: 10000,
        data: { sourceScriptNodeId: 'script' },
      },
      {
        id: 'foreign',
        type: 'group',
        position: { x: 3000, y: 0 },
        width: 10000,
        data: { sourceScriptNodeId: 'another' },
      },
    );
    expect(planCanvasBatchVideoGraph(input).addedNodes[0].position).toEqual({ x: 2600, y: 200 });
  });

  it('falls back to script width 600 without right-side related group and accepts explicit adapter position zero', () => {
    const input = fixture();
    delete script(input).width;
    input.nodes.find((node) => node.id === 'images').position.x = 200;
    expect(planCanvasBatchVideoGraph(input).addedNodes[0].position).toEqual({ x: 900, y: 200 });
    expect(
      planCanvasBatchVideoGraph({ ...input, groupPosition: { x: 0, y: -10 } }).addedNodes[0]
        .position,
    ).toEqual({ x: 0, y: -10 });
  });
});

describe('source asset references and inline prompt projection', () => {
  it('shared reference glue preserves V1 URL-only projection and supports V2 metadata without leaking timestamp fields', () => {
    const input = fixture();
    const id = addAsset(input, 'character', 'char', 'Alice');
    const row = script(input).data.rows[0];
    row.characters = [{ characterAssetId: 'char' }];
    row.videoMotionPrompt = '@Alice';
    const context = createStoryboardVideoReferenceContext({
      nodes: input.nodes,
      assets: script(input).data.assets,
      getNodeUrl: () => ({
        url: 'https://real.test/image',
        assetId: 'real-cert',
        complianceCheckedAtMs: NOW,
        sourceCreatedAtMs: NOW - 1,
        sourceCreatedAtMsIsLocalPlaceholder: true,
      }),
    });
    const references = collectStoryboardVideoRowReferences({ row, context });
    expect(references).toEqual([
      {
        nodeId: id,
        url: 'https://real.test/image',
        assetId: 'real-cert',
        complianceCheckedAtMs: NOW,
        sourceCreatedAtMs: NOW - 1,
        sourceCreatedAtMsIsLocalPlaceholder: true,
      },
    ]);
    expect(projectStoryboardVideoPrompt({ row, references, context }).prompt).toBe(
      '资产图锚定：\n角色 Alice 的参考图是 {{Image 1}}\n\nAlice',
    );
    expect(params(planCanvasBatchVideoGraph(input)).imageList[1]).toEqual({
      nodeId: id,
      url: 'https://assets.test/char.png',
    });
  });
  it('orders references main then character/scene/prop, deduplicates linked nodes, and excludes unknown or unlinked assets', () => {
    const input = fixture();
    addAsset(input, 'character', 'char', 'Alice');
    addAsset(input, 'scene', 'scene', '海岸');
    addAsset(input, 'prop', 'prop', '望远镜');
    addAsset(input, 'prop', 'alias', '别名', 'asset-node-char');
    script(input).data.assets.characters.push({
      id: 'missing',
      name: '幽灵',
      linkedNodeId: 'gone',
    });
    script(input).data.rows[0] = {
      ...script(input).data.rows[0],
      characters: [{ characterAssetId: 'char' }, { characterAssetId: 'missing' }],
      sceneAssetIds: ['scene'],
      propAssetIds: ['alias', 'prop'],
      finalVideoPromptEntityRefs: [{ assetId: 'prop', text: '望远镜' }],
      videoMotionPrompt: 'Alice 在海岸举起望远镜',
      plotDescriptionEntityRefs: [
        { assetId: 'char', text: 'Alice' },
        { assetId: 'scene', text: '海岸' },
      ],
    };
    const result = planCanvasBatchVideoGraph(input);
    expect(params(result).imageList).toEqual([
      { nodeId: 'image-1', url: 'https://images.test/1.png' },
      { nodeId: 'asset-node-char', url: 'https://assets.test/char.png' },
      { nodeId: 'asset-node-scene', url: 'https://assets.test/scene.png' },
      { nodeId: 'asset-node-prop', url: 'https://assets.test/prop.png' },
    ]);
    expect(params(result).imageListOrder).toEqual([
      'image-1',
      'asset-node-char',
      'asset-node-scene',
      'asset-node-prop',
    ]);
    expect(params(result).imageLabelList).toEqual(['图片 1', '图片 2', '图片 3', '图片 4']);
    expect(params(result).prompt).toBe(
      '资产图锚定：\n角色 Alice 的参考图是 {{Image 2}}\n场景 海岸 的参考图是 {{Image 3}}\n道具 望远镜 的参考图是 {{Image 4}}\n\nAlice 在海岸举起望远镜',
    );
  });

  it('does not treat plain asset words as references without structured refs or @ mentions', () => {
    const input = fixture();
    addAsset(input, 'character', 'char', 'Alice');
    script(input).data.rows[0].videoMotionPrompt = 'Alice walks';
    const result = planCanvasBatchVideoGraph(input);
    expect(params(result).imageList).toHaveLength(1);
    expect(params(result).prompt).toBe('Alice walks');
  });

  it('projects @asset ID, fullwidth name and existing token without duplicating the marker', () => {
    const input = fixture();
    addAsset(input, 'character', 'char', 'Alice');
    script(input).data.rows[0].videoMotionPrompt =
      '@char, ＠Alice, @Alice({{Image 2}}), email@AliceX';
    const result = planCanvasBatchVideoGraph(input);
    expect(params(result).prompt).toBe(
      '资产图锚定：\n角色 Alice 的参考图是 {{Image 2}}\n\nAlice, Alice, Alice, email@AliceX',
    );
    expect(params(result).imageList).toHaveLength(2);
  });

  it('uses canonical raw names and source eligible reference length/boundary matching', () => {
    const input = fixture();
    addAsset(input, 'character', 'char', 'Alice  Smith');
    const row = script(input).data.rows[0];
    row.characters = [{ characterAssetId: 'char' }];
    row.videoMotionPrompt = 'AS AliceSmith Alice walks';
    row.finalVideoPromptEntityRefs = [
      { text: 'AS', assetId: 'char' },
      { text: 'Alice', assetId: 'char' },
    ];
    expect(params(planCanvasBatchVideoGraph(input)).prompt).toBe(
      '资产图锚定：\n角色 Alice  Smith 的参考图是 {{Image 2}}\n\nAS AliceSmith Alice  Smith walks',
    );
  });

  it('replaces unlinked entity/name/ID references with canonical bare names, without fake image anchors', () => {
    const input = fixture();
    script(input).data.assets.characters.push({ id: 'char', name: 'Alice' });
    const row = script(input).data.rows[0];
    row.videoMotionPrompt = '少女与 @char 和 @Alice';
    row.finalVideoPromptEntityRefs = [{ text: '少女', assetId: 'char' }];
    expect(params(planCanvasBatchVideoGraph(input)).prompt).toBe('Alice与 Alice 和 Alice');
  });

  it('strips asset markers inside spoken dialogue only and preserves ordinary quoted references', () => {
    const input = fixture();
    addAsset(input, 'character', 'char', 'Alice');
    script(input).data.rows[0].videoMotionPrompt =
      '对白：“@Alice 看海”。描述：“@Alice({{Image 2}})”。';
    expect(params(planCanvasBatchVideoGraph(input)).prompt).toBe(
      '资产图锚定：\n角色 Alice 的参考图是 {{Image 2}}\n\n对白：“Alice 看海”。描述：“Alice”。',
    );
  });

  it('sanitizes spoken reference names containing regex punctuation and falls back to plotDescription', () => {
    const input = fixture();
    addAsset(input, 'character', 'char', 'A.B');
    const row = script(input).data.rows[0];
    row.videoMotionPrompt = '';
    row.plotDescription = 'voiceover: "@A.B({{Image 2}})"';
    expect(params(planCanvasBatchVideoGraph(input)).prompt).toBe('voiceover: "A.B"');
  });

  it('retains source external URL query and object-provided media certificate, never script asset ID as certificate', () => {
    const input = fixture();
    const nodeId = addAsset(input, 'prop', 'script-asset', '望远镜');
    input.nodes.find((node) => node.id === nodeId).data.url = [
      {
        url: 'https://assets.test/img.png?watermark=keep&width=200',
        assetId: 'real-media-certificate',
        compliantExempt: true,
      },
    ];
    script(input).data.rows[0].propAssetIds = ['script-asset'];
    const result = planCanvasBatchVideoGraph(input);
    expect(params(result).imageList[1]).toEqual({
      nodeId,
      url: 'https://assets.test/img.png?watermark=keep&width=200',
      assetId: 'real-media-certificate',
      compliantExempt: true,
    });
    expect(params(result).imageList[1].assetId).not.toBe('script-asset');
  });
});

describe('source per-shot reference modes and capacity', () => {
  function withRefs() {
    const input = fixture();
    for (let index = 1; index <= 3; index += 1)
      addAsset(input, 'prop', `prop-${index}`, `道具${index}`);
    script(input).data.rows[0].propAssetIds = ['prop-1', 'prop-2', 'prop-3'];
    script(input).data.rows[0].videoMotionPrompt = '@道具1 @道具2 @道具3';
    return input;
  }
  it('prefers image2video when direct schema capacity covers main plus assets', () => {
    const result = planCanvasBatchVideoGraph(withRefs());
    expect(params(result).modeType).toBe('image2video');
    expect(params(result).imageList).toHaveLength(4);
    expect(result.warnings).toEqual([]);
  });
  it('truncates fallback single-image mode and updates prompt anchors after capacity truncation', () => {
    const input = withRefs();
    delete input.config.modelSchema.properties.modeType.items.image2video;
    const result = planCanvasBatchVideoGraph(input);
    expect(params(result)).toMatchObject({
      modeType: 'singleImage2video',
      imageListOrder: ['image-1'],
      prompt: '道具1 道具2 道具3',
    });
    expect(result.warnings).toEqual([
      { key: 'canvas:videoRefTruncateModeCapacity', values: { shotCount: 1, refCount: 3 } },
    ]);
  });
  it('preserves the source fallback image2video over-capacity quirk instead of silently fabricating a valid configuration', () => {
    const input = withRefs();
    input.config.modeType = 'image2video';
    input.config.modelSchema.properties.modeType.items.image2video = [1, 2];
    const result = planCanvasBatchVideoGraph(input);
    expect(params(result).modeType).toBe('image2video');
    expect(params(result).imageList).toHaveLength(4);
    expect(result.warnings).toEqual([]);
  });
  it('uses source fallback text mode, keeps poster, and removes all references and anchors', () => {
    const input = withRefs();
    input.config.modeType = 'text2video';
    input.config.modelSchema.properties.modeType.items = { text2video: [0, 0] };
    const result = planCanvasBatchVideoGraph(input);
    expect(params(result)).toMatchObject({
      modeType: 'text2video',
      image: '',
      imageList: [],
      prompt: '道具1 道具2 道具3',
    });
    expect(videos(result)[0].data.poster).toBe('https://images.test/1.png');
    expect(result.warnings).toEqual([
      { key: 'canvas:videoRefTruncateModeCapacity', values: { shotCount: 1, refCount: 4 } },
    ]);
  });
  it('uses mixed references without main URL and clamps by mixed imageMax rather than total media max', () => {
    const input = withRefs();
    image(input).data.url = ['', 'https://images.test/later.png'];
    input.config.modelSchema.properties.modeType = {
      items: { mixed2video: [1, 9] },
      mixed2videoConfig: { imageMax: 2 },
    };
    const result = planCanvasBatchVideoGraph(input);
    expect(params(result).modeType).toBe('mixed2video');
    expect(params(result).imageListOrder).toEqual(['asset-node-prop-1', 'asset-node-prop-2']);
    expect(params(result).prompt).toBe(
      '资产图锚定：\n道具 道具1 的参考图是 {{Image 1}}\n道具 道具2 的参考图是 {{Image 2}}\n\n道具1 道具2 道具3',
    );
    expect(result.warnings).toEqual([
      { key: 'canvas:videoRefTruncateDirectCapacity', values: { shotCount: 1, refCount: 1 } },
    ]);
  });
  it.each([
    [4, 9, undefined],
    [0, 0, undefined],
    [0, 9, 0],
    [0, 9, -1],
  ])('drops unsupported mixed refs for min=%s max=%s imageMax=%s', (min, max, imageMax) => {
    const input = withRefs();
    image(input).data.url = ['', 'later'];
    input.config.modelSchema.properties.modeType = {
      items: { mixed2video: [min, max] },
      mixed2videoConfig: { imageMax },
    };
    const result = planCanvasBatchVideoGraph(input);
    expect(params(result)).toMatchObject({
      modeType: 'text2video',
      imageList: [],
      prompt: '道具1 道具2 道具3',
    });
    expect(result.warnings).toEqual([
      { key: 'canvas:storyboardVideoRefUnsupportedByModel', values: { shotCount: 1, refCount: 3 } },
    ]);
  });
});

describe('portrait proof and atomic boundary', () => {
  it('blocks before IDs are allocated and describes only missing exact primary URL checks', () => {
    const input = portrait(fixture(3));
    image(input, 1).data.portraitAssetId = 'valid';
    image(input, 1).data.portraitComplianceCheckedAtMs = NOW - 1;
    image(input, 3).data.url = ['', 'later'];
    const result = planCanvasBatchVideoGraph(input);
    expectAtomicFailure(result);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('portrait-unverified');
    expect(result.portraitRequired).toEqual([
      { childId: 'image-2', url: 'https://images.test/2.png' },
    ]);
    expect(input.makeId).not.toHaveBeenCalled();
  });
  it('does not require portrait certificate or clock for an empty primary URL', () => {
    const input = portrait(fixture());
    delete input.nowMs;
    image(input).data.url = ['', 'later'];
    const result = planCanvasBatchVideoGraph(input);
    expect(result.ok).toBe(true);
    expect(params(result).modeType).toBe('text2video');
  });
  it('retains eZ expired-existing-proof gate even for an empty first URL when automatic checks are disabled', () => {
    const input = portrait(fixture());
    image(input).data.url = ['', 'later'];
    image(input).data.portraitAssetId = 'expired';
    image(input).data.portraitComplianceCheckedAtMs = NOW - MAX_AGE;
    const result = planCanvasBatchVideoGraph(input);
    expectAtomicFailure(result);
    expect(result.reason).toBe('compliance-failed');
    expect(result.portraitRequired).toEqual([]);
    expect(input.makeId).not.toHaveBeenCalled();
  });
  it.each([
    [{ enable: true, default: 1 }, undefined],
    [{ enable: true, default: false }, true],
    [{ enable: true, default: false }, 1],
  ])(
    'allows source empty-first-URL expiry skip only when automatic checks are enabled (%j/%j)',
    (property, setting) => {
      const input = portrait(fixture());
      input.config.modelSchema.properties.autoCompliance = property;
      input.config.advancedSettings.autoCompliance = setting;
      image(input).data.url = ['', 'later'];
      image(input).data.portraitCompliantExempt = true;
      image(input).data.portraitComplianceCheckedAtMs = NOW - MAX_AGE;
      const result = planCanvasBatchVideoGraph(input);
      expect(result.ok).toBe(true);
      expect(params(result).modeType).toBe('text2video');
    },
  );
  it.each([
    [{ enable: true, default: true }, 0],
    [{ enable: true, default: true }, false],
    [{ enable: true, default: true }, '1'],
    [{ enable: 1, default: true }, true],
    [{ enable: false, default: true }, 1],
  ])('cannot bypass expiry with non-source automatic-check flag (%j/%j)', (property, setting) => {
    const input = portrait(fixture());
    input.config.modelSchema.properties.autoCompliance = property;
    input.config.advancedSettings.autoCompliance = setting;
    image(input).data.portraitAssetId = 'expired';
    image(input).data.portraitComplianceCheckedAtMs = NOW - MAX_AGE;
    input.portraitResults = [
      {
        childId: 'image-1',
        url: 'https://images.test/1.png',
        status: 'approved',
        checkedAtMs: NOW,
        assetId: 'new-certificate',
      },
    ];
    const result = planCanvasBatchVideoGraph(input);
    expectAtomicFailure(result);
    expect(result.reason).toBe('compliance-failed');
    expect(result.portraitRequired).toEqual([]);
  });
  it.each([
    ['absent certificate', {}, {}, NOW],
    [
      'expiry boundary',
      { portraitAssetId: 'cert', portraitComplianceCheckedAtMs: NOW - MAX_AGE },
      {},
      NOW,
    ],
    [
      'future checked',
      { portraitAssetId: 'cert', portraitComplianceCheckedAtMs: NOW + 1 },
      {},
      NOW,
    ],
    [
      'placeholder creation',
      { portraitAssetId: 'cert' },
      { createdAtMsIsLocalPlaceholder: true },
      NOW,
    ],
    ['no clock', { portraitAssetId: 'cert' }, {}, undefined],
    ['string exempt', { portraitCompliantExempt: 'yes' }, {}, NOW],
  ])('blocks %s without mutating source graph', (_name, data, node, nowMs) => {
    const input = portrait(fixture());
    Object.assign(image(input).data, data);
    Object.assign(image(input), node);
    input.nowMs = nowMs;
    const before = structuredClone(input.nodes);
    expectAtomicFailure(planCanvasBatchVideoGraph(input));
    expect(input.nodes).toEqual(before);
    expect(input.makeId).not.toHaveBeenCalled();
  });
  it('uses fresh checked certificate and truncates extra asset refs to the main image', () => {
    const input = portrait(fixture());
    addAsset(input, 'character', 'char', 'Alice');
    script(input).data.rows[0].characters = [{ characterAssetId: 'char' }];
    image(input).data.portraitAssetId = 'portrait-certificate';
    image(input).data.portraitComplianceCheckedAtMs = NOW - MAX_AGE + 1;
    const result = planCanvasBatchVideoGraph(input);
    expect(result.ok).toBe(true);
    expect(params(result).imageList).toEqual([
      { nodeId: 'image-1', url: 'https://images.test/1.png', assetId: 'portrait-certificate' },
    ]);
    expect(result.warnings).toEqual([
      { key: 'canvas:videoRefTruncatePortraitSingleFrame', values: { shotCount: 1, refCount: 1 } },
    ]);
    expect(result.nodePatches).toHaveLength(1);
  });
  it('reuses source createdAt fallback, but fresh exemption does not invent main-ref exempt metadata', () => {
    const input = portrait(fixture());
    image(input).data.portraitCompliantExempt = true;
    const result = planCanvasBatchVideoGraph(input);
    expect(result.ok).toBe(true);
    expect(params(result).imageList).toEqual([
      { nodeId: 'image-1', url: 'https://images.test/1.png' },
    ]);
  });
  it('binds approved real adapter proof to current child+URL and returns explicit certificate patches', () => {
    const input = portrait(fixture(2));
    image(input, 2).data.portraitAssetId = 'expired';
    input.portraitResults = [
      {
        childId: 'image-1',
        url: 'https://images.test/1.png',
        status: 'approved',
        checkedAtMs: NOW,
        assetId: 'real-cert',
      },
      {
        childId: 'image-2',
        url: 'https://images.test/2.png',
        status: 'approved',
        checkedAtMs: NOW,
        exempt: true,
      },
    ];
    const result = planCanvasBatchVideoGraph(input);
    expect(result.ok).toBe(true);
    expect(result.nodePatches.slice(0, 2)).toEqual([
      {
        nodeId: 'image-1',
        data: {
          portraitAssetId: 'real-cert',
          portraitCompliantExempt: undefined,
          portraitComplianceCheckedAtMs: NOW,
        },
      },
      {
        nodeId: 'image-2',
        data: {
          portraitAssetId: undefined,
          portraitCompliantExempt: true,
          portraitComplianceCheckedAtMs: NOW,
        },
      },
    ]);
    expect(params(result).imageList[0].assetId).toBe('real-cert');
    expect(params(result, 1).imageList[0]).not.toHaveProperty('assetId');
    expect(image(input, 2).data.portraitAssetId).toBe('expired');
  });
  it.each([
    { childId: 'gone' },
    { url: 'changed' },
    { status: 'rejected' },
    { checkedAtMs: NOW + 1 },
    { checkedAtMs: NOW - MAX_AGE },
    { assetId: undefined },
  ])('rejects mismatched, unapproved, expired or incomplete proof %j', (patch) => {
    const input = portrait(fixture());
    input.portraitResults = [
      {
        childId: 'image-1',
        url: 'https://images.test/1.png',
        status: 'approved',
        checkedAtMs: NOW,
        assetId: 'real-cert',
        ...patch,
      },
    ];
    expectAtomicFailure(planCanvasBatchVideoGraph(input));
    expect(input.makeId).not.toHaveBeenCalled();
  });
  it('rejects duplicate proof and never treats a numeric assetId as an issued certificate', () => {
    const input = portrait(fixture());
    const result = {
      childId: 'image-1',
      url: 'https://images.test/1.png',
      status: 'approved',
      checkedAtMs: NOW,
      assetId: 123,
      exempt: true,
    };
    input.portraitResults = [result];
    expect(params(planCanvasBatchVideoGraph(input)).imageList[0]).not.toHaveProperty('assetId');
    input.portraitResults = [result, result];
    expectAtomicFailure(planCanvasBatchVideoGraph(input));
  });
});

describe('malformed and stale graph inputs never produce partial additions', () => {
  it.each([
    (input) => {
      input.nodes.push({ ...image(input) });
    },
    (input) => {
      image(input).position.x = Infinity;
    },
    (input) => {
      input.edges.push({ id: 'edge', source: 'script' });
    },
    (input) => {
      input.nodes.find((node) => node.id === 'images').data.name = 7;
    },
    (input) => {
      script(input).data.linkedImageGroupId = 'replacement';
    },
    (input) => {
      script(input).data.rows.push({ ...script(input).data.rows[0] });
    },
    (input) => {
      image(input, 2).data.scriptRowHiddenUuid = 'row-1';
    },
    (input) => {
      image(input).data.url = [7, 'ready'];
    },
    (input) => {
      script(input).data.assets.props = [null];
    },
    (input) => {
      script(input).data.rows[0].finalVideoPromptEntityRefs = [{ text: 1 }];
    },
    (input) => {
      input.config.settings.nested.self = input.config.settings;
    },
    (input) => {
      input.groupPosition = { x: NaN, y: 0 };
    },
  ])('rejects invalid input atomically before new IDs', (mutate) => {
    const input = fixture(2);
    mutate(input);
    expectAtomicFailure(planCanvasBatchVideoGraph(input));
    expect(input.makeId).not.toHaveBeenCalled();
  });
  it.each(['images', '', null])('rejects colliding or invalid new ID %s', (id) => {
    const input = fixture();
    input.makeId = () => id;
    expectAtomicFailure(planCanvasBatchVideoGraph(input));
  });
  it('returns no partial node, edge, or certificate patch when a later new-ID call fails', () => {
    const input = portrait(fixture());
    input.portraitResults = [
      {
        childId: 'image-1',
        url: 'https://images.test/1.png',
        status: 'approved',
        checkedAtMs: NOW,
        assetId: 'real',
      },
    ];
    input.makeId = vi
      .fn()
      .mockReturnValueOnce('new-group')
      .mockReturnValueOnce('new-video')
      .mockReturnValueOnce('images');
    expectAtomicFailure(planCanvasBatchVideoGraph(input));
  });
  it('does not require compliance on nonportrait models and fails missing schema in Chinese', () => {
    const input = fixture();
    input.portraitResults = [{ status: 'fake' }];
    expect(planCanvasBatchVideoGraph(input).ok).toBe(true);
    input.config.modelSchema = null;
    const result = planCanvasBatchVideoGraph(input);
    expectAtomicFailure(result);
    expect(result.blocked).toBe(true);
  });
});
