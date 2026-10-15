// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveCanvasConnection, resolveCanvasConnectedCreation } from './connection-model.js';

const publicModels = JSON.parse(
  readFileSync(new URL('../../../../public/data/models.json', import.meta.url), 'utf8'),
);
const node = (id, type, data = {}) => ({
  id,
  type,
  data: {
    type,
    action: `${type}_generate`,
    params: { model: publicModels.default[type] },
    ...data,
  },
});
const edge = (source, target) => ({ source, target });
const resolve = (nodes, edges = [], models = publicModels, ids = {}) =>
  resolveCanvasConnection({ nodes, edges, models, sourceId: 'source', targetId: 'target', ...ids });
const schema = (items, settings = [], properties = {}) => ({
  properties: { modeType: { items }, ...properties },
  config: { settings },
});
const fixtureModels = (type, current, next, support = ['new']) => ({
  [type + 'Models']: { old: current, new: next },
  support: { [type]: support },
});

describe('ordinary Canvas connection plan', () => {
  it.each(['source', 'target'])('rejects a missing %s without a graph mutation', (id) => {
    const nodes = [node('source', 'text'), node('target', 'text')].filter((item) => item.id !== id);
    expect(resolve(nodes)).toMatchObject({ valid: false, reason: 'missingNode' });
  });

  it('rejects self, same-direction duplicate and reverse duplicate', () => {
    const nodes = [node('source', 'text'), node('target', 'text')];
    expect(resolve(nodes, [], publicModels, { targetId: 'source' }).reason).toBe('self');
    for (const edges of [[edge('source', 'target')], [edge('target', 'source')]])
      expect(resolve(nodes, edges).reason).toBe('duplicate');
  });

  it('rejects a reachable indirect cycle while reference-source edges do not form dependencies', () => {
    const nodes = [node('source', 'text'), node('target', 'text'), node('middle', 'text')];
    const edges = [edge('target', 'middle'), edge('middle', 'source')];
    expect(resolve(nodes, edges).reason).toBe('cycle');
    nodes[2].data.type = 'reference';
    expect(resolve(nodes, edges)).toMatchObject({
      valid: true,
      sourceId: 'source',
      targetId: 'target',
    });
  });

  it('does not reject an unrelated pre-existing cycle', () => {
    const nodes = [node('source', 'text'), node('target', 'text'), node('other', 'text')];
    expect(resolve(nodes, [edge('other', 'other')]).valid).toBe(true);
  });

  it.each(['image', 'video'])('blocks both SCRIPT_V2 ↔ storyboard %s group directions', (kind) => {
    const script = node('source', 'script-v2', { action: 'script_generate' });
    const group = node('target', 'group', { storyboardGroupType: kind });
    expect(resolve([script, group]).reason).toBe('scriptStoryboardGroup');
    expect(
      resolve([script, group], [], publicModels, { sourceId: 'target', targetId: 'source' }).reason,
    ).toBe('scriptStoryboardGroup');
  });

  it.each(['video', 'video-clip'])('rejects %s to ScriptV2 but keeps text/image inputs', (type) => {
    const target = node('target', 'script-v2', { action: 'script_generate' });
    expect(resolve([node('source', type), target]).reason).toBe('scriptVideo');
    expect(resolve([node('source', 'image'), target]).valid).toBe(true);
    expect(resolve([node('source', 'text'), target]).valid).toBe(true);
  });

  it('keeps source action compatibility, including resource targets', () => {
    expect(resolve([node('source', 'video'), node('target', 'image')]).reason).toBe('action');
    expect(resolve([node('source', 'audio'), node('target', 'text')]).reason).toBe('action');
    expect(
      resolve([node('source', 'text'), node('target', 'image', { action: 'image_resource' })])
        .reason,
    ).toBe('action');
    expect(
      resolve([node('source', 'image'), node('target', 'text', { action: 'text_resource' })]).valid,
    ).toBe(false);
  });

  it('REFERENCE target only accepts REFERENCE; reference inputs bypass media model capacity', () => {
    expect(resolve([node('source', 'image'), node('target', 'reference')]).reason).toBe(
      'referenceTarget',
    );
    expect(resolve([node('source', 'reference'), node('target', 'reference')]).valid).toBe(true);
    expect(
      resolve(
        [
          node('source', 'reference'),
          node('target', 'video', { params: { model: 'unavailable' } }),
        ],
        [],
        null,
      ).valid,
    ).toBe(true);
  });

  it.each(['image', 'video', 'audio', 'text'])(
    'accepts known public image → %s capability without switching the current model',
    (type) => {
      expect(resolve([node('source', 'image'), node('target', type)])).toMatchObject({
        valid: true,
        reason: null,
      });
      expect(resolve([node('source', 'image'), node('target', type)]).targetPatch).toBeUndefined();
    },
  );

  it('counts empty-URL graph inputs and embedded refImages while ignoring stale params lists', () => {
    const model = schema({ image2image: [0, 2] });
    const models = fixtureModels('image', model, model, []);
    const target = node('target', 'image', {
      params: { model: 'old', imageList: Array(50).fill({ url: 'stale' }) },
      refImages: ['embedded'],
    });
    expect(resolve([node('source', 'image', { url: [] }), target], [], models).valid).toBe(true);
    const input = node('input', 'image', { url: [] });
    expect(
      resolve([node('source', 'image'), target, input], [edge('input', 'target')], models).reason,
    ).toBe('modelUnsupported');
  });

  it('text image and video capacity use direct endpoints, including character groups', () => {
    const target = node('target', 'text');
    const imageInputs = Array.from({ length: 7 }, (_, i) => node('i' + i, 'image'));
    expect(
      resolve(
        [node('source', 'image'), target, ...imageInputs],
        imageInputs.map((item) => edge(item.id, 'target')),
      ).reason,
    ).toBe('limit');
    const character = node('character', 'group', {
      characterAsset: { states: [{ mainReferenceImageUrl: 'image' }] },
    });
    const textModels = {
      default: { text: 'x' },
      textModels: { x: schema({ image2text: [0, 1], video2text: [0, 1] }) },
    };
    target.data.params.model = 'x';
    expect(
      resolve(
        [node('source', 'image'), target, character],
        [edge('character', 'target')],
        textModels,
      ).reason,
    ).toBe('limit');
    expect(
      resolve(
        [node('source', 'video'), target, node('video', 'video')],
        [edge('video', 'target')],
        textModels,
      ).reason,
    ).toBe('limit');
  });

  it('uses source 1/0 text capacity fallbacks instead of inventing unsupported video capacity', () => {
    const target = node('target', 'text', { params: { model: 'missing' } });
    expect(resolve([node('source', 'image'), target], [], {}).valid).toBe(true);
    expect(resolve([node('source', 'video'), target], [], {}).reason).toBe('limit');
  });

  it('expands ordinary group sources to children and accepts the first allowed child plan', () => {
    const group = node('source', 'group');
    const source = { ...node('image', 'image'), parentId: 'source' };
    expect(resolve([group, source, node('target', 'image')]).valid).toBe(true);
    expect(resolve([group, node('target', 'image')]).reason).toBe('emptyGroup');
    const nested = { ...node('nested', 'group'), parentId: 'source' };
    source.parentId = 'nested';
    expect(resolve([group, nested, source, node('target', 'image')]).valid).toBe(true);
  });

  it('treats character groups as image sources even without a declared action', () => {
    const character = node('source', 'group', {
      action: undefined,
      characterAsset: { states: [{ mainReferenceImageUrl: 'image' }] },
    });
    expect(resolve([character, node('target', 'image')]).valid).toBe(true);
  });

  it.each(['video', 'audio'])('blocks blob %s into video timeline until upload', (type) => {
    expect(
      resolve([
        node('source', type, { url: ['blob:pending'] }),
        node('target', 'video-clip', { action: 'video_clip_resource' }),
      ]).reason,
    ).toBe('uploadRequired');
  });

  it('uses the verified thirty-video-clip cap while excluding audio clips and allowing the already-used source', () => {
    const target = node('target', 'video-clip', {
      action: 'video_clip_resource',
      clipTimelineData: {
        clips: Array.from({ length: 30 }, (_, i) => ({ sourceNodeId: 'v' + i })),
      },
    });
    const source = node('source', 'video', { url: ['https://example.test/video.mp4'] });
    expect(resolve([source, target]).reason).toBe('clipLimit');
    target.data.clipTimelineData.clips[0].sourceNodeId = 'source';
    expect(resolve([source, target]).valid).toBe(true);
    target.data.clipTimelineData.clips[0] = { type: 'audio' };
    expect(resolve([source, target]).valid).toBe(true);
  });

  it.each(['image', 'video'])(
    'enhance %s requires matching type and one incoming connection',
    (type) => {
      const target = node('target', type, { generatorType: 'enhance' });
      expect(resolve([node('source', type), target]).valid).toBe(true);
      expect(resolve([node('source', 'text'), target]).valid).toBe(false);
      expect(
        resolve([node('source', type), target, node('first', type)], [edge('first', 'target')])
          .reason,
      ).toBe('singleInput');
    },
  );

  it('picture-edit and shot-breakdown enforce a single video input', () => {
    for (const target of [
      node('target', 'video', { generatorType: 'picture-edit', action: 'video_edit' }),
      node('target', 'shot-breakdown', { action: 'shot_breakdown_resource' }),
    ]) {
      expect(resolve([node('source', 'video'), target]).valid).toBe(true);
      expect(resolve([node('source', 'image'), target]).valid).toBe(false);
      expect(
        resolve(
          [node('source', 'video'), target, node('first', 'video')],
          [edge('first', 'target')],
        ).valid,
      ).toBe(false);
    }
  });

  it('does not mutate documents or models while resolving a plan', () => {
    const nodes = [node('source', 'image'), node('target', 'image')],
      edges = [];
    const before = JSON.stringify({ nodes, edges, publicModels });
    resolve(nodes, edges);
    expect(JSON.stringify({ nodes, edges, publicModels })).toBe(before);
  });
});

describe('ordinary model switching follows source support order and px settings patch', () => {
  it.each(['image', 'audio', 'video'])(
    'switches %s when the current model rejects the simulated incoming media',
    (type) => {
      const key =
        type === 'image' ? 'image2image' : type === 'audio' ? 'image2audio' : 'image2video';
      const models = fixtureModels(type, schema({ [key]: [0, 0] }), schema({ [key]: [0, 3] }));
      const target = node('target', type, {
        params: { model: 'old', prompt: 'keep prompt', advancedSettings: { keep: 4 } },
      });
      expect(resolve([node('source', 'image'), target], [], models)).toMatchObject({
        valid: true,
        targetPatch: {
          params: { model: 'new', prompt: 'keep prompt', advancedSettings: { keep: 4 } },
        },
      });
    },
  );

  it('prefers the current compatible model even if a support candidate appears first', () => {
    const compatible = schema({ image2image: [0, 2] });
    expect(
      resolve(
        [node('source', 'image'), node('target', 'image', { params: { model: 'old' } })],
        [],
        fixtureModels('image', compatible, compatible),
      ).targetPatch,
    ).toBeUndefined();
  });

  it('chooses support order, not schema object insertion order, and respects explicitly empty support', () => {
    const compatible = schema({ image2image: [0, 2] });
    const models = {
      imageModels: {
        firstInObject: compatible,
        old: schema({ image2image: [0, 0] }),
        chosen: compatible,
      },
      support: { image: [{ modelKey: 'chosen' }, { modelKey: 'firstInObject' }] },
    };
    const nodes = [node('source', 'image'), node('target', 'image', { params: { model: 'old' } })];
    expect(resolve(nodes, [], models).targetPatch.params.model).toBe('chosen');
    models.support.image = [];
    expect(resolve(nodes, [], models).reason).toBe('modelUnsupported');
  });

  it('uses the public source config-182 order for the default local adapter', () => {
    const nodes = [node('source', 'image'), node('target', 'image', { params: { model: 'qwen' } })];
    const input = node('input1', 'image'),
      input2 = node('input2', 'image');
    expect(
      resolve([...nodes, input, input2], [edge('input1', 'target'), edge('input2', 'target')])
        .targetPatch.params.model,
    ).toBe('lib-image-2.5-s');
  });

  it('resets even common settings to target defaults, uses originalField and clears obsolete keys', () => {
    const old = schema({ image2image: [0, 0] }, ['common', 'obsolete'], {
      common: { default: 1, originalField: 'commonApi' },
      obsolete: { default: 9, originalField: 'oldApi' },
    });
    const next = schema({ image2image: [0, 2] }, ['common', 'added'], {
      common: { default: 2, originalField: 'commonApi' },
      added: { enum: [{ value: 'first', displayName: 'One' }, 'second'], originalField: 'newApi' },
    });
    const target = node('target', 'image', {
      params: {
        model: 'old',
        prompt: '{{Image 1}} text',
        commonApi: 99,
        oldApi: 33,
        modeType: 'image2image',
        settings: { commonApi: 99, oldApi: 33, untouched: 7 },
        advancedSettings: { oldAdvanced: 8 },
        arbitrary: { preserve: true },
      },
    });
    const plan = resolve([node('source', 'image'), target], [], fixtureModels('image', old, next));
    expect(plan.targetPatch.params).toEqual({
      ...target.data.params,
      model: 'new',
      commonApi: 2,
      oldApi: undefined,
      newApi: 'first',
      settings: { commonApi: 2, oldApi: undefined, newApi: 'first', untouched: 7 },
    });
    expect(target.data.params.commonApi).toBe(99);
  });

  it('uses mode-specific settings with text2video fallback exactly when that mode has no own list', () => {
    const old = schema({ image2video: [0, 0] }, { image2video: ['old'] }, { old: { default: 1 } });
    const next = schema(
      { image2video: [0, 2] },
      { text2video: ['duration'], image2video: ['ratio'] },
      { duration: { default: 5 }, ratio: { default: '16:9' } },
    );
    const target = node('target', 'video', {
      params: { model: 'old', modeType: 'image2video', old: 7 },
    });
    expect(
      resolve([node('source', 'image'), target], [], fixtureModels('video', old, next)).targetPatch
        .params,
    ).toMatchObject({ ratio: '16:9', old: undefined });
  });

  it('restricts alternate video models to a valid template list and merges its schema', () => {
    const old = schema({ image2video: [0, 0] }),
      newModel = schema({ image2video: [0, 0] });
    const models = fixtureModels('video', old, newModel, ['outside', 'new']);
    models.videoModels.outside = schema({ image2video: [0, 9] });
    const target = node('target', 'video', {
      params: { model: 'old' },
      extraConfig: {
        scene: 'template',
        models: [{ modelKey: 'new' }],
        schema: { properties: { modeType: { items: { image2video: [0, 2] } } } },
      },
    });
    expect(resolve([node('source', 'image'), target], [], models).targetPatch.params.model).toBe(
      'new',
    );
    target.data.extraConfig.models = [{ modelKey: 'missing' }];
    expect(resolve([node('source', 'image'), target], [], models).valid).toBe(false);
  });

  it.each([
    { segmentRemakeLock: true },
    { imageList: [{ assetId: 'portrait' }] },
    { subjectList: [{ id: 'subject' }] },
  ])('does not switch video when a source lock fixes its current model: %j', (lock) => {
    const models = fixtureModels(
      'video',
      schema({ image2video: [0, 0] }),
      schema({ image2video: [0, 2] }),
    );
    expect(
      resolve(
        [node('source', 'image'), node('target', 'video', { params: { model: 'old', ...lock } })],
        [],
        models,
      ).reason,
    ).toBe('lockedModelUnsupported');
  });

  it('enforces video subjects shared limit in the current mode before accepting either model', () => {
    const value = schema({ image2video: [0, 3] });
    value.properties.subjects = {
      items: { image2video: { maxCount: 2, sharedWith: 'imageList' } },
    };
    const models = fixtureModels('video', value, value);
    const target = node('target', 'video', {
      params: { model: 'old', modeType: 'image2video', subjectList: [{ id: 1 }, { id: 2 }] },
    });
    expect(resolve([node('source', 'image'), target], [], models).reason).toBe(
      'lockedModelUnsupported',
    );
  });

  it('blocks mixing images and audio for audio generation across all candidate models', () => {
    const value = schema({ image2audio: [0, 3], audio2audio: [0, 3] });
    const nodes = [
      node('source', 'audio'),
      node('target', 'audio', { params: { model: 'old' } }),
      node('image', 'image'),
    ];
    expect(
      resolve(nodes, [edge('image', 'target')], fixtureModels('audio', value, value)).reason,
    ).toBe('modelUnsupported');
  });

  it('can switch a text-only video target whose current model excludes text2video', () => {
    const old = schema({}),
      next = schema({});
    old.config.excludeModeTypes = ['text2video'];
    const plan = resolve(
      [node('source', 'text'), node('target', 'video', { params: { model: 'old' } })],
      [],
      fixtureModels('video', old, next),
    );
    expect(plan).toMatchObject({ valid: true, targetPatch: { params: { model: 'new' } } });
  });

  it('returns explicit blocked reasons for missing catalogue or unverified specialized endpoints', () => {
    expect(resolve([node('source', 'image'), node('target', 'image')], [], null).reason).toBe(
      'modelsUnavailable',
    );
    expect(resolve([node('source', 'image'), node('target', 'custom')]).reason).toBe(
      'unverifiedTarget',
    );
    expect(resolve([node('source', 'material-style'), node('target', 'image')]).reason).toBe(
      'unverifiedSource',
    );
    expect(
      resolve([node('source', 'image'), node('target', 'image', { generatorType: 'unknown' })])
        .reason,
    ).toBe('unverifiedGenerator');
    const models = fixtureModels(
      'image',
      schema({ image2image: [0, 0] }),
      schema({ image2image: [0, 2] }),
      ['missing'],
    );
    expect(
      resolve(
        [node('source', 'image'), node('target', 'image', { params: { model: 'old' } })],
        [],
        models,
      ).reason,
    ).toBe('modelsUnavailable');
  });
});

describe('new-node creation uses the source menu eligibility contract', () => {
  const create = (nodes, createdNodeId, edges = []) =>
    resolveCanvasConnectedCreation({
      nodes,
      edges,
      sourceId: 'source',
      targetId: 'target',
      createdNodeId,
    });

  it.each(['text', 'image', 'video', 'audio', 'script-v2', 'script', 'reference'])(
    'REFERENCE source anchor can create downstream %s',
    (type) => {
      expect(create([node('source', 'reference'), node('target', type)], 'target').valid).toBe(
        true,
      );
    },
  );

  it.each(['text', 'image', 'video', 'audio', 'script-v2'])(
    'ordinary %s source anchor has a disabled new REFERENCE row',
    (type) => {
      expect(create([node('source', type), node('target', 'reference')], 'target').reason).toBe(
        'action',
      );
    },
  );

  it('REFERENCE target anchor can only create upstream REFERENCE', () => {
    expect(create([node('source', 'reference'), node('target', 'reference')], 'source').valid).toBe(
      true,
    );
    expect(create([node('source', 'image'), node('target', 'reference')], 'source').reason).toBe(
      'referenceTarget',
    );
  });

  it.each(['image', 'audio', 'video', 'script-v2'])(
    'TEXT source anchor can create downstream %s with default model initialization owned by that node',
    (type) => {
      const source = node('source', 'text'),
        target = node('target', type, {
          action: type === 'script-v2' ? 'script_generate' : `${type}_generate`,
        });
      const plan = create([source, target], 'target');
      expect(plan.valid).toBe(true);
      expect(plan.targetPatch).toBeUndefined();
    },
  );

  it('does not apply ordinary generator capacity before creating a connected generator', () => {
    const source = node('source', 'image');
    const target = node('target', 'image', { params: { model: 'missing' } });
    expect(resolve([source, target], [], null).reason).toBe('modelsUnavailable');
    expect(create([source, target], 'target').valid).toBe(true);
  });

  it('upstream menu uses the anchor target action and never offers hidden legacy script', () => {
    expect(create([node('source', 'image'), node('target', 'video')], 'source').valid).toBe(true);
    expect(create([node('source', 'video'), node('target', 'image')], 'source').reason).toBe(
      'action',
    );
    expect(
      create(
        [node('source', 'script', { action: 'script_generate' }), node('target', 'video')],
        'source',
      ).reason,
    ).toBe('creationTypeHidden');
  });

  it('preserves the special VIDEO/CLIP to SCRIPT_V2 prohibition in both creation directions', () => {
    const source = node('source', 'video'),
      target = node('target', 'script-v2', { action: 'script_generate' });
    expect(create([source, target], 'target').reason).toBe('scriptVideo');
    expect(create([source, target], 'source').reason).toBe('scriptVideo');
    const legacy = node('target', 'script', { action: 'script_generate' });
    expect(create([source, legacy], 'target').valid).toBe(true);
  });

  it('requires an explicitly identified new endpoint and retains topology checks', () => {
    const nodes = [node('source', 'text'), node('target', 'image')];
    expect(create(nodes, 'missing').reason).toBe('creationEndpoint');
    expect(create(nodes, 'target', [edge('source', 'target')]).reason).toBe('duplicate');
    expect(create(nodes, 'target', [edge('target', 'other'), edge('other', 'source')]).reason).toBe(
      'cycle',
    );
    expect(create([node('source', 'reference'), node('target', 'custom')], 'target').reason).toBe(
      'unverifiedCreationType',
    );
  });
});
