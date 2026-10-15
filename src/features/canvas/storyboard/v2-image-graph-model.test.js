import { describe, expect, it, vi } from 'vitest';
import {
  describeScriptV2ImageReferences,
  planCanvasScriptV2ImageGraph,
} from './v2-image-graph-model.js';

function fixture(count = 2) {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    hiddenUuid: `uuid-${index}`,
    shotNumber: index * 7 + 3,
    imageGenerationPrompt: 'Alice 在海岸拿着道具',
    videoMotionPrompt: '不应使用的视频提示词',
    characters: [{ characterAssetId: 'character' }],
    sceneAssetIds: ['scene'],
    finalImagePromptEntityRefs: [
      { text: 'Alice', assetId: 'character' },
      { text: '海岸', assetId: 'scene' },
    ],
  }));
  let sequence = 0;
  return {
    nodes: [
      {
        id: 'script',
        type: 'script-v2',
        width: 350,
        position: { x: 100, y: 200 },
        data: {
          title: '海岸脚本',
          rows,
          linkedImageGroupId: 'old-images',
          linkedVideoGroupId: 'old-videos',
          imageGenConfig: { model: 'old-image-model' },
          assets: {
            characters: [{ id: 'character', name: 'Alice', linkedNodeId: 'character-image' }],
            scenes: [{ id: 'scene', name: '海岸', linkedNodeId: 'scene-image' }],
            props: [{ id: 'prop', name: '道具', linkedNodeId: 'prop-image' }],
          },
        },
      },
      {
        id: 'character-image',
        type: 'image',
        position: { x: 0, y: 0 },
        data: { url: ['https://assets.test/alice.png?watermark=keep'] },
      },
      {
        id: 'scene-image',
        type: 'image',
        position: { x: 0, y: 0 },
        data: { url: ['https://assets.test/scene.png'] },
      },
      {
        id: 'prop-image',
        type: 'image',
        position: { x: 0, y: 0 },
        data: { url: ['https://assets.test/prop.png'] },
      },
    ],
    edges: [],
    scriptId: 'script',
    selectedIndices: new Set(rows.map((_row, index) => index)),
    config: {
      model: 'image-model',
      modeType: 'text2image',
      settings: { ratio: '16:9', count: 1, nested: { keep: true } },
    },
    modelSchema: { properties: { modeType: { items: { image2image: [1, 6] } } } },
    makeId: vi.fn((kind) => `new-${kind}-${++sequence}`),
  };
}
const source = (input) => input.nodes.find((node) => node.id === input.scriptId);
const asset = (input, id) => input.nodes.find((node) => node.id === id);
const images = (plan) => plan.addedNodes.filter((node) => node.type === 'image');
const params = (plan, index = 0) => images(plan)[index].data.params;
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
function atomicFailure(plan, reason) {
  expect(plan.ok).toBe(false);
  expect(plan.reason).toBe(reason);
  expect(plan.message).toMatch(/[\u4e00-\u9fff]/);
  expect(plan.addedNodes).toEqual([]);
  expect(plan.addedEdges).toEqual([]);
  expect(plan.nodePatches).toEqual([]);
  expect(plan.submitted).toBe(false);
}
function noReferences(input) {
  source(input).data.assets = {};
  for (const row of source(input).data.rows) {
    row.characters = [];
    row.sceneAssetIds = [];
    row.finalImagePromptEntityRefs = [];
  }
}

describe('ScriptV2 image reference descriptor', () => {
  it('keeps every raw row index, including rows without a UUID, and reads the image source field', () => {
    const input = fixture(3);
    delete source(input).data.rows[1].hiddenUuid;
    const row = source(input).data.rows[2];
    row.characters = [];
    row.sceneAssetIds = [];
    row.finalImagePromptEntityRefs = [{ text: '道具', assetId: 'prop' }];
    row.finalVideoPromptEntityRefs = [{ text: 'Alice', assetId: 'character' }];
    row.imageGenerationPrompt = '道具';
    const result = describeScriptV2ImageReferences(input);
    expect(result.valid).toBe(true);
    expect(result.rows).toBe(source(input).data.rows);
    expect([...result.refCounts]).toEqual([
      [0, 2],
      [1, 2],
      [2, 1],
    ]);
    expect(result.refsByRow.get(2).references.map((ref) => ref.nodeId)).toEqual(['prop-image']);
    expect(result.requiredRefs).toBe(2);
    expect(result.maxRequiredRefs).toBe(2);
    expect(result.prompts.get(2)).toBe('资产图锚定：\n道具 道具 的参考图是 图片1\n\n道具');
  });

  it('collects character, image entity refs, scenes and props by role, deduplicating actual linked nodes', () => {
    const input = fixture(1),
      row = source(input).data.rows[0];
    row.propAssetIds = ['prop'];
    row.finalImagePromptEntityRefs.unshift({ text: '道具', assetId: 'prop' });
    source(input).data.assets.props.push({
      id: 'shared',
      name: '同图资产',
      linkedNodeId: 'character-image',
    });
    row.propAssetIds.push('shared');
    const result = describeScriptV2ImageReferences(input);
    expect(result.refsByRow.get(0).references).toEqual([
      { nodeId: 'character-image', url: 'https://assets.test/alice.png?watermark=keep' },
      { nodeId: 'scene-image', url: 'https://assets.test/scene.png' },
      { nodeId: 'prop-image', url: 'https://assets.test/prop.png' },
    ]);
  });

  it('adds name/id mentions only from the image prompt and falls back to plot description', () => {
    const input = fixture(2);
    noReferences(input);
    source(input).data.assets = {
      characters: [{ id: 'character', name: 'Alice', linkedNodeId: 'character-image' }],
      props: [{ id: 'prop', name: '道具', linkedNodeId: 'prop-image' }],
    };
    source(input).data.rows[0].imageGenerationPrompt = '＠Alice 使用 @prop';
    source(input).data.rows[1].imageGenerationPrompt = '';
    source(input).data.rows[1].plotDescription = '@道具';
    const result = describeScriptV2ImageReferences(input);
    expect(result.refsByRow.get(0).references.map((ref) => ref.nodeId)).toEqual([
      'character-image',
      'prop-image',
    ]);
    expect(result.refCounts.get(1)).toBe(1);
    expect(result.refsByRow.get(1).prompt).toContain('道具 道具 的参考图是 {{Image 1}}');
  });

  it('does not turn thumbnails, later outputs or missing linked nodes into real references', () => {
    const input = fixture(1);
    asset(input, 'character-image').data.url = ['', 'https://assets.test/second.png'];
    source(input).data.assets.characters[0].thumbnailUrl = 'https://assets.test/thumbnail.png';
    source(input).data.assets.scenes[0].linkedNodeId = 'missing-image';
    const result = describeScriptV2ImageReferences(input);
    expect(result.valid).toBe(true);
    expect(result.refCounts.get(0)).toBe(0);
    expect(result.refsByRow.get(0).references).toEqual([]);
    expect(result.assetsReady).toBe(false);
    expect(result.assetReadiness.pendingAssetIds).toContain('scene');
  });

  it('keeps image spoken text references instead of applying the video-only sanitizer', () => {
    const input = fixture(1),
      row = source(input).data.rows[0];
    row.sceneAssetIds = [];
    row.finalImagePromptEntityRefs = [];
    row.imageGenerationPrompt = '对白：“@Alice 看镜头”';
    const result = describeScriptV2ImageReferences(input);
    expect(result.refsByRow.get(0).prompt).toBe(
      '资产图锚定：\n角色 Alice 的参考图是 {{Image 1}}\n\n对白：“Alice 看镜头”',
    );
  });

  it('uses image and dialogue entity refs for inline replacement without reading final video refs', () => {
    const input = fixture(1),
      row = source(input).data.rows[0];
    row.characters = [];
    row.sceneAssetIds = [];
    row.propAssetIds = ['prop'];
    row.finalImagePromptEntityRefs = [];
    row.finalVideoPromptEntityRefs = [{ text: '角色', assetId: 'character' }];
    row.dialogueLines = [{ text: '道具', entityRefs: [{ text: '道具', assetId: 'prop' }] }];
    row.imageGenerationPrompt = '角色拿道具';
    const result = describeScriptV2ImageReferences(input);
    expect(result.refCounts.get(0)).toBe(1);
    expect(result.refsByRow.get(0).prompt).toContain('道具 道具 的参考图是 {{Image 1}}');
    expect(result.refsByRow.get(0).prompt).not.toContain('角色 Alice');
  });

  it('preserves already tagged tokens and creates only one anchor for each actual reference', () => {
    const input = fixture(1),
      row = source(input).data.rows[0];
    row.imageGenerationPrompt = '@Alice({{Image 1}}) 看着 @Alice';
    row.sceneAssetIds = [];
    row.finalImagePromptEntityRefs = [];
    const result = describeScriptV2ImageReferences(input);
    expect(result.refsByRow.get(0).prompt).toBe(
      '资产图锚定：\n角色 Alice 的参考图是 {{Image 1}}\n\nAlice 看着 Alice',
    );
  });

  it('does not reject an image row because unused video fields are malformed', () => {
    const input = fixture(1);
    source(input).data.rows[0].videoMotionPrompt = 42;
    source(input).data.rows[0].finalVideoPromptEntityRefs = 'not the image source field';
    expect(describeScriptV2ImageReferences(input).valid).toBe(true);
  });

  it.each([
    ['invalid-graph', (input) => (input.nodes = null)],
    ['invalid-graph', (input) => input.nodes.push({ ...input.nodes[0] })],
    ['no-script', (input) => (input.scriptId = 'gone')],
    ['not-v2-script', (input) => (source(input).type = 'script')],
    ['invalid-script', (input) => (source(input).data.rows = null)],
    ['invalid-script', (input) => (source(input).data.rows[0] = null)],
    ['invalid-script', (input) => (source(input).data.rows[0].imageGenerationPrompt = {})],
    ['invalid-script', (input) => (source(input).data.rows[0].finalImagePromptEntityRefs = {})],
    ['invalid-script', (input) => (source(input).data.rows[0].plotDescription = 42)],
    ['invalid-script', (input) => (source(input).data.rows[0].dialogueLines = [null])],
    ['invalid-script', (input) => (source(input).data.rows[0].hiddenUuid = {})],
    ['invalid-script', (input) => (source(input).data.rows[0].shotNumber = Infinity)],
    ['invalid-script', (input) => (source(input).data.assets.characters = 'bad')],
    ['invalid-script', (input) => (asset(input, 'character-image').data.url = [42])],
    ['invalid-script', (input) => (asset(input, 'character-image').data.url = 'bad URL list')],
  ])('returns safe complete empty maps for %s', (reason, change) => {
    const input = fixture();
    change(input);
    const result = describeScriptV2ImageReferences(input);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe(reason);
    expect(result.rows).toEqual([]);
    expect(result.refCounts.size).toBe(0);
    expect(result.refsByRow.size).toBe(0);
    expect(result.prompts.size).toBe(0);
  });
});

describe('ScriptV2 sC empty image graph plan', () => {
  it('builds source v2 image nodes, ordinary shell, references and one script link', () => {
    const input = fixture();
    const plan = planCanvasScriptV2ImageGraph(input);
    expect(plan.ok).toBe(true);
    expect(plan.submitted).toBe(false);
    const group = plan.addedNodes[0];
    expect(group).toMatchObject({
      id: plan.groupId,
      type: 'group',
      position: { x: 650, y: 200 },
      width: 702,
      height: 840,
      measured: { width: 702, height: 840 },
      zIndex: -1001,
      style: {
        background: 'var(--canvas-group-bg)',
        border: '1px solid var(--canvas-group-border)',
      },
      data: {
        type: 'group',
        name: '分镜图 · 海岸脚本',
        storyboardTitle: '分镜图 · 海岸脚本',
        storyboardGroupType: 'image',
        sourceScriptNodeId: 'script',
        sourceScriptVersion: 'v2',
        autoResizeToChildren: true,
        autoResizePadding: 40,
        groupLayoutMode: 'vertical',
        nodeWidth: 702,
        nodeHeight: 840,
      },
    });
    expect(group.data.childNodeIds).toEqual(images(plan).map((node) => node.id));
    expect(group.data).not.toHaveProperty('standaloneStoryboardImageGrid');
    expect(group.data).not.toHaveProperty('storyboardSourceRowHiddenUuids');
    expect(group.data).not.toHaveProperty('layoutMode');
    expect(group.data).not.toHaveProperty('groupColor');
    expect(images(plan).map((node) => node.data.name)).toEqual(['镜头 3', '镜头 10']);
    for (const [index, image] of images(plan).entries()) {
      expect(image).toMatchObject({
        type: 'image',
        parentId: group.id,
        width: 622,
        height: 350,
        measured: { width: 622, height: 350 },
        position: { x: 36, y: 66 + index * 386 },
        data: {
          type: 'image',
          url: [],
          action: 'image_generate',
          contentWidth: 622,
          contentHeight: 350,
          _explicitContentDims: true,
          scriptRowHiddenUuid: `uuid-${index}`,
          showGenerator: true,
        },
      });
      expect(image.data).not.toHaveProperty('poster');
      expect(image.data).not.toHaveProperty('taskInfo');
    }
    expect(params(plan)).toMatchObject({ model: 'image-model', modeType: 'image2image' });
    expect(params(plan).prompt).toBe(
      '资产图锚定：\n角色 Alice 的参考图是 {{Image 1}}\n场景 海岸 的参考图是 {{Image 2}}\n\nAlice 在海岸拿着道具',
    );
    expect(params(plan).imageLabelList).toEqual(['图片 1', '图片 2']);
    expect(params(plan).imageListOrder).toEqual(['character-image', 'scene-image']);
    expect(params(plan).imageList).toEqual([
      { nodeId: 'character-image', url: 'https://assets.test/alice.png?watermark=keep' },
      { nodeId: 'scene-image', url: 'https://assets.test/scene.png' },
    ]);
    expect(params(plan)).not.toHaveProperty('scene');
    expect(params(plan)).not.toHaveProperty('modelSchema');
    expect(plan.addedEdges.filter((edge) => edge.target === images(plan)[0].id)).toMatchObject([
      { source: 'character-image', sourceHandle: 'source', targetHandle: 'target' },
      { source: 'scene-image', sourceHandle: 'source', targetHandle: 'target' },
    ]);
    expect(plan.addedEdges.at(-1)).toMatchObject({ source: 'script', target: group.id });
    expect(plan.nodePatches).toEqual([
      { nodeId: 'script', data: { linkedImageGroupId: group.id } },
    ]);
    expect(source(input).data.imageGenConfig).toEqual({ model: 'old-image-model' });
    expect(source(input).data.linkedVideoGroupId).toBe('old-videos');
  });

  it('applies the source normal visual reflow atomically while preserving grow-only initial bounds', () => {
    const input = fixture(1);
    input.config.settings.ratio = '1:1';
    const plan = planCanvasScriptV2ImageGraph(input);
    expect(plan.initialBounds).toEqual({ x: 650, y: 200, width: 430, height: 450 });
    expect(plan.bounds).toEqual({ x: 650, y: 200, width: 430, height: 452 });
    expect(images(plan)[0].position).toEqual({ x: 36, y: 66 });
    expect(plan.addedNodes[0].data.nodeHeight).toBe(452);
  });

  it('uses raw index ascending order after deselect/reselect and retains real raw shot numbers', () => {
    const input = fixture(4);
    input.selectedIndices = new Set([3, 1]);
    const plan = planCanvasScriptV2ImageGraph(input);
    expect(images(plan).map((node) => node.data.name)).toEqual(['镜头 10', '镜头 24']);
    expect(images(plan).map((node) => node.data.scriptRowHiddenUuid)).toEqual(['uuid-1', 'uuid-3']);
    expect(plan.addedNodes[0].data.storyboardSourceRowHiddenUuids).toEqual(['uuid-1', 'uuid-3']);
  });

  it('does not filter rows by UUID and omits the subset field when all actual UUIDs are covered', () => {
    const input = fixture(3);
    delete source(input).data.rows[0].hiddenUuid;
    source(input).data.rows[2].hiddenUuid = 'uuid-1';
    input.selectedIndices = new Set([0, 1]);
    const plan = planCanvasScriptV2ImageGraph(input);
    expect(images(plan)).toHaveLength(2);
    expect(images(plan)[0].data.scriptRowHiddenUuid).toBeUndefined();
    expect(plan.addedNodes[0].data).not.toHaveProperty('storyboardSourceRowHiddenUuids');
  });

  it('keeps all config fields while overwriting stale prompt/media fields with current image inputs', () => {
    const input = fixture(1);
    input.config = {
      ...input.config,
      prompt: '旧提示词',
      imageList: [{ nodeId: 'stale' }],
      imageListOrder: ['stale'],
      imageLabelList: ['旧引用'],
      extraConfig: { locked: true },
      advancedSettings: { amount: 0.25 },
    };
    const plan = planCanvasScriptV2ImageGraph(input);
    expect(params(plan).extraConfig).toEqual({ locked: true });
    expect(params(plan).advancedSettings).toEqual({ amount: 0.25 });
    expect(params(plan).settings).toEqual(input.config.settings);
    expect(params(plan).prompt).not.toBe(input.config.prompt);
    expect(params(plan).imageListOrder).toEqual(['character-image', 'scene-image']);
  });

  it.each([undefined, 'text2image', 'preserved-mode'])(
    'keeps zero-reference mode %s and removes stale refs',
    (mode) => {
      const input = fixture(1);
      noReferences(input);
      input.config.modeType = mode;
      input.config.imageList = [{ nodeId: 'old' }];
      input.config.imageListOrder = ['old'];
      input.config.imageLabelList = ['old'];
      const plan = planCanvasScriptV2ImageGraph(input);
      expect(plan.ok).toBe(true);
      expect(params(plan).modeType).toBe(mode || 'text2image');
      expect(params(plan).imageList).toBeUndefined();
      expect(params(plan).imageListOrder).toBeUndefined();
      expect(params(plan).imageLabelList).toBeUndefined();
      expect(plan.addedEdges).toHaveLength(1);
    },
  );

  it('has no video capacity, portrait, empty-prompt or global asset-ready gate inside sC', () => {
    const input = fixture(1);
    input.modelSchema = { properties: { portrait: true, modeType: { items: {} } } };
    source(input).data.rows[0].imageGenerationPrompt = '';
    source(input).data.rows[0].plotDescription = '';
    asset(input, 'prop-image').data.url = [];
    const plan = planCanvasScriptV2ImageGraph(input);
    expect(plan.ok).toBe(true);
    expect(params(plan).modeType).toBe('image2image');
    expect(params(plan).prompt).toBe('');
    expect(plan.submitted).toBe(false);
  });

  it('clones config per image and leaves the frozen raw graph and existing edge untouched', () => {
    const input = fixture();
    input.edges.push({ id: 'old-link', source: 'script', target: 'old-images' });
    freeze(input.nodes);
    freeze(input.edges);
    freeze(input.config);
    const plan = planCanvasScriptV2ImageGraph(input);
    expect(plan.ok).toBe(true);
    expect(plan.addedNodes).not.toContain(input.nodes[0]);
    params(plan).settings.nested.keep = false;
    expect(params(plan, 1).settings.nested.keep).toBe(true);
    expect(input.config.settings.nested.keep).toBe(true);
    expect(input.edges).toEqual([{ id: 'old-link', source: 'script', target: 'old-images' }]);
    expect(source(input).data.linkedImageGroupId).toBe('old-images');
  });

  it('uses measured-first source group placement and skips unrelated or left-side linked groups', () => {
    const input = fixture(1);
    source(input).measured = { width: 600 };
    input.nodes.push(
      {
        id: 'related',
        type: 'group',
        position: { x: 1000, y: 800 },
        width: 200,
        measured: { width: 700 },
        data: { sourceScriptNodeId: 'script' },
      },
      {
        id: 'left',
        type: 'group',
        position: { x: -100, y: 0 },
        width: 8000,
        data: { sourceScriptNodeId: 'script' },
      },
      {
        id: 'other',
        type: 'group',
        position: { x: 5000, y: 0 },
        width: 500,
        data: { sourceScriptNodeId: 'other-script' },
      },
    );
    expect(planCanvasScriptV2ImageGraph(input).bounds.x).toBe(1900);
    input.groupPosition = { x: 0, y: -10 };
    expect(planCanvasScriptV2ImageGraph(input).bounds).toMatchObject({ x: 0, y: -10 });
  });

  it('moves a default group only downwards using source collision margin and initial mount size', () => {
    const input = fixture(1);
    input.nodes.push({
      id: 'blocker',
      type: 'image',
      position: { x: 650, y: 200 },
      width: 100,
      height: 100,
    });
    const plan = planCanvasScriptV2ImageGraph(input);
    expect(plan.initialBounds).toEqual({ x: 650, y: 350, width: 702, height: 450 });
    expect(plan.bounds).toEqual({ x: 650, y: 350, width: 702, height: 452 });
    // Explicit local placement is an intentional override, not another store addNode.
    input.groupPosition = { x: 650, y: 200 };
    expect(planCanvasScriptV2ImageGraph(input).bounds).toMatchObject({ x: 650, y: 200 });
  });

  it('uses the largest minimum vertical penetration from all simultaneous blockers', () => {
    const input = fixture(1);
    input.nodes.push(
      { id: 'short', type: 'image', position: { x: 650, y: 200 }, width: 100, height: 100 },
      { id: 'farther', type: 'image', position: { x: 800, y: 300 }, width: 100, height: 50 },
    );
    expect(planCanvasScriptV2ImageGraph(input).bounds).toMatchObject({ x: 650, y: 400 });
  });

  it.each([
    ['horizontal margin touch', { x: 500, y: 200 }, 100, 100],
    ['vertical margin touch', { x: 650, y: 50 }, 100, 100],
    ['diagonal margin touch', { x: 500, y: 50 }, 100, 100],
  ])('does not move at the strict %s boundary', (_label, position, width, height) => {
    const input = fixture(1);
    input.nodes.push({ id: 'touching', type: 'image', position, width, height });
    expect(planCanvasScriptV2ImageGraph(input).bounds).toMatchObject({ x: 650, y: 200 });
  });

  it.each([
    ['measured', { width: 100, height: 10, measured: { width: 100, height: 200 } }, 450],
    ['stored', { width: 100, height: 120 }, 370],
    ['350 default', { data: { contentWidth: 9000, contentHeight: 9000 } }, 600],
    ['partial measured', { width: 100, height: 120, measured: { width: 100 } }, 370],
  ])('uses %s box dimensions for store overlap placement', (_label, dimensions, y) => {
    const input = fixture(1);
    input.nodes.push({
      id: 'blocker',
      type: 'image',
      position: { x: 650, y: 200 },
      ...dimensions,
    });
    expect(planCanvasScriptV2ImageGraph(input).bounds).toMatchObject({ x: 650, y });
  });

  it('keeps measured width ahead of stored width when testing horizontal intersection', () => {
    const input = fixture(1);
    const blocker = {
      id: 'blocker',
      type: 'image',
      position: { x: 500, y: 200 },
      width: 1000,
      height: 100,
      measured: { width: 100 },
    };
    input.nodes.push(blocker);
    expect(planCanvasScriptV2ImageGraph(input).bounds.y).toBe(200);
    delete blocker.measured;
    expect(planCanvasScriptV2ImageGraph(input).bounds.y).toBe(350);
  });

  it('caps source minimum-penetration movement at 30 iterations instead of looping until clear', () => {
    const input = fixture(1);
    input.nodes.push({
      id: 'tall-blocker',
      type: 'image',
      position: { x: 650, y: 699 },
      width: 100,
      height: 2 ** 40,
    });
    // Initial overlap is 1px along the nearer (upper) edge. Source moves down by
    // min penetration anyway, doubling 1,2,4,... for exactly thirty iterations.
    expect(planCanvasScriptV2ImageGraph(input).bounds.y).toBe(199 + 2 ** 30);
  });

  it.each([NaN, Infinity, -1, '100'])(
    'atomically rejects malformed default placement dimensions %s',
    (width) => {
      const input = fixture(1);
      input.nodes.push({
        id: 'bad-size',
        type: 'image',
        position: { x: 650, y: 200 },
        measured: { width, height: 100 },
      });
      atomicFailure(planCanvasScriptV2ImageGraph(input), 'invalid-build-input');
      expect(input.makeId).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['settings ratio', { settings: { ratio: '9:16' } }, { width: 350, height: 622 }],
    ['parseInt ratio/cap', { settings: { ratio: '100:1' } }, { width: 1050, height: 350 }],
    ['unknown ratio', { settings: { ratio: 'bad' } }, { width: 350, height: 350 }],
    ['default ratio', {}, { width: 350, height: 350 }],
  ])('uses source dimension math for %s', (_label, config, size) => {
    const input = fixture(1);
    input.config = { model: 'image-model', ...config };
    expect(images(planCanvasScriptV2ImageGraph(input))[0]).toMatchObject(size);
  });

  it.each(['name', 'label', undefined])('resolves the source group title fallback %s', (field) => {
    const input = fixture(1);
    delete source(input).data.title;
    if (field) source(input).data[field] = '回退名';
    expect(planCanvasScriptV2ImageGraph(input).addedNodes[0].data.name).toBe(
      `分镜图 · ${field ? '回退名' : '脚本'}`,
    );
  });

  it.each([
    ['invalid-selection', (input) => (input.selectedIndices = undefined)],
    ['invalid-selection', (input) => (input.selectedIndices = new Set([-1]))],
    ['invalid-selection', (input) => (input.selectedIndices = new Set([1.5]))],
    ['invalid-selection', (input) => (input.selectedIndices = new Set(['0']))],
    ['invalid-selection', (input) => (input.selectedIndices = new Set([2]))],
    ['no-children', (input) => (input.selectedIndices = new Set())],
    ['invalid-config', (input) => (input.config = null)],
    ['invalid-config', (input) => (input.config.model = '')],
    ['invalid-config', (input) => (input.config.settings = [])],
    ['invalid-config', (input) => (input.modelSchema = 'bad')],
    ['invalid-config', (input) => (input.makeId = undefined)],
    ['invalid-graph', (input) => (input.nodes[1].position.x = NaN)],
    ['invalid-graph', (input) => (input.edges = null)],
    ['invalid-graph', (input) => (input.edges = [{ id: 'script', source: 'a', target: 'b' }])],
    ['invalid-graph', (input) => (input.edges = [{ id: 'edge', source: null, target: 'b' }])],
    ['invalid-position', (input) => (input.groupPosition = { x: Infinity, y: 0 })],
    ['invalid-script', (input) => (source(input).data.title = {})],
  ])('returns a complete atomic failure for %s before allocating IDs', (reason, change) => {
    const input = fixture();
    const makeId = input.makeId;
    change(input);
    atomicFailure(planCanvasScriptV2ImageGraph(input), reason);
    expect(makeId).not.toHaveBeenCalled();
  });

  it.each(['script', 'occupied-edge', '', undefined])(
    'rejects invalid or colliding generated ID %s atomically',
    (id) => {
      const input = fixture();
      input.edges = [{ id: 'occupied-edge', source: 'script', target: 'character-image' }];
      input.makeId = () => id;
      atomicFailure(planCanvasScriptV2ImageGraph(input), 'invalid-build-input');
    },
  );

  it('rejects a late duplicate ID and nonserializable config without returning a partial graph', () => {
    const input = fixture();
    const ids = ['new-group', 'new-image', 'new-edge', 'new-edge'];
    input.makeId = () => ids.shift();
    atomicFailure(planCanvasScriptV2ImageGraph(input), 'invalid-build-input');
    const invalid = fixture();
    invalid.config.settings.nested.self = invalid.config;
    atomicFailure(planCanvasScriptV2ImageGraph(invalid), 'invalid-build-input');
    expect(invalid.makeId).not.toHaveBeenCalled();
  });
});
