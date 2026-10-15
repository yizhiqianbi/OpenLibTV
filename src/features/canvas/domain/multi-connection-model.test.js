// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getCanvasGroupConnectionSources,
  getCanvasMultiConnectionSources,
  resolveCanvasMultiConnectedCreation,
  resolveCanvasMultiConnection,
} from './multi-connection-model.js';

const publicModels = JSON.parse(
  readFileSync(new URL('../../../../public/data/models.json', import.meta.url), 'utf8'),
);
const node = (id, type = 'image', data = {}, extra = {}) => ({
  id,
  type,
  data: {
    type,
    action: `${type}_generate`,
    params: { model: publicModels.default[type], prompt: '' },
    ...data,
  },
  ...extra,
});
const edge = (source, target = 'target') => ({ source, target });
const schema = (items, properties = {}, config = {}) => ({
  properties: { modeType: { items }, ...properties },
  config,
});
const catalogue = (type, entries, keys = Object.keys(entries)) => ({
  [type + 'Models']: entries,
  support: { [type]: keys },
});
const resolve = (
  nodes,
  { edges = [], models = publicModels, sourceIds = ['a', 'b'], targetId = 'target' } = {},
) => resolveCanvasMultiConnection({ nodes, edges, models, sourceIds, targetId });
const create = (
  nodes,
  {
    edges = [],
    models = publicModels,
    sourceIds = ['a', 'b'],
    targetId = 'target',
    createdNodeId = 'target',
  } = {},
) =>
  resolveCanvasMultiConnectedCreation({ nodes, edges, models, sourceIds, targetId, createdNodeId });

describe('separate source collection protocols', () => {
  it('filters virtual seeds by graph order without recursively expanding their groups', () => {
    const nodes = [
      node('reference', 'reference'),
      node('group', 'group'),
      node('child', 'image', {}, { parentId: 'group' }),
      node('other'),
    ];
    expect(
      getCanvasMultiConnectionSources(nodes, ['other', 'group', 'reference', 'other']).map(
        (item) => item.id,
      ),
    ).toEqual(['group', 'other']);
  });

  it('collects real-group recursive non-group leaves, including actionless sources, and excludes references', () => {
    const nodes = [
      node('root', 'group'),
      node('nested', 'group', {}, { parentId: 'root' }),
      node('video', 'video', {}, { parentId: 'nested' }),
      node('text', 'text', { action: undefined }, { parentId: 'root' }),
      node('reference', 'reference', {}, { parentId: 'nested' }),
      node('outside'),
    ];
    expect(getCanvasGroupConnectionSources(nodes, 'root').map((item) => item.id)).toEqual([
      'video',
      'text',
    ]);
  });

  it('terminates group ancestry cycles without repeating a leaf', () => {
    const nodes = [
      node('root', 'group', {}, { parentId: 'nested' }),
      node('nested', 'group', {}, { parentId: 'root' }),
      node('leaf', 'text', {}, { parentId: 'nested' }),
    ];
    expect(getCanvasGroupConnectionSources(nodes, 'root').map((item) => item.id)).toEqual(['leaf']);
  });
});

describe('aggregate existing-target connection plan', () => {
  it.each(['a', 'b', 'target'])('rejects a missing %s without a partial edge plan', (missing) => {
    expect(
      resolve([node('a'), node('b'), node('target')].filter((item) => item.id !== missing)),
    ).toMatchObject({ valid: false, reason: 'missingNode', edgeSourceIds: [] });
  });

  it('rejects empty sources, all actionless sources, and source-target identity', () => {
    const nodes = [node('a', 'text', { action: undefined }), node('target', 'text')];
    expect(resolve(nodes, { sourceIds: [] }).reason).toBe('emptySources');
    expect(resolve(nodes, { sourceIds: ['a'] }).reason).toBe('actionUnavailable');
    expect(resolve(nodes, { sourceIds: ['a', 'target'] }).reason).toBe('self');
  });

  it('deduplicates request IDs and adds only missing incoming edges', () => {
    const nodes = [node('a', 'text'), node('b', 'text'), node('target', 'text')];
    expect(resolve(nodes, { sourceIds: ['a', 'b', 'b'], edges: [edge('a')] })).toMatchObject({
      valid: true,
      sourceIds: ['a', 'b'],
      edgeSourceIds: ['b'],
    });
    expect(resolve(nodes, { edges: [edge('a'), edge('b')] })).toMatchObject({
      valid: false,
      reason: 'duplicate',
      edgeSourceIds: [],
    });
  });

  it('ignores reference nodes and actionless sources in eligibility, but retains actionless requested edges', () => {
    const nodes = [
      node('a', 'text'),
      node('b', 'video', { action: undefined }),
      node('reference', 'reference'),
      node('target', 'text'),
    ];
    expect(resolve(nodes, { sourceIds: ['a', 'b', 'reference'] })).toMatchObject({
      valid: true,
      sourceIds: ['a', 'b'],
      qualifiedSourceIds: ['a'],
      edgeSourceIds: ['a', 'b'],
    });
    // The original qualified set being entirely existing also prevents an actionless-only append.
    expect(resolve(nodes, { edges: [edge('a')] })).toMatchObject({
      valid: false,
      reason: 'duplicate',
    });
  });

  it('rejects the whole request when one declared source action is incompatible', () => {
    const result = resolve([node('a'), node('b', 'video'), node('target')]);
    expect(result).toMatchObject({ valid: false, reason: 'action', edgeSourceIds: [] });
  });

  it.each(['image', 'video', 'audio', 'text'])('rejects resource %s targets', (type) => {
    expect(
      resolve([node('a'), node('b'), node('target', type, { action: `${type}_resource` })]).valid,
    ).toBe(false);
  });

  it('checks aggregate graph media once rather than two independently fitting single connections', () => {
    const models = catalogue('image', { one: schema({ image2image: [0, 1] }) });
    const nodes = [node('a'), node('b'), node('target', 'image', { params: { model: 'one' } })];
    expect(resolve(nodes, { models, sourceIds: ['a'] }).valid).toBe(true);
    expect(resolve(nodes, { models, sourceIds: ['b'] }).valid).toBe(true);
    expect(resolve(nodes, { models })).toMatchObject({
      valid: false,
      reason: 'modelUnsupported',
      edgeSourceIds: [],
    });
  });

  it('deduplicates existing and selected inputs, includes refImages and empty URLs, and ignores stale params lists', () => {
    const models = catalogue('image', { two: schema({ image2image: [0, 2] }) });
    const nodes = [
      node('a', 'image', { url: [] }),
      node('b'),
      node('target', 'image', {
        refImages: ['embedded'],
        params: { model: 'two', imageList: Array(30).fill({ url: 'stale' }) },
      }),
    ];
    expect(resolve(nodes, { models, edges: [edge('a')], sourceIds: ['a', 'b'] }).reason).toBe(
      'modelUnsupported',
    );
    nodes.at(-1).data.refImages = [];
    expect(resolve(nodes, { models, edges: [edge('a')], sourceIds: ['a', 'b'] }).valid).toBe(true);
  });

  it('counts direct character groups and does not expand ordinary incoming groups', () => {
    const models = {
      default: { text: 'one' },
      textModels: { one: schema({ image2text: [0, 1] }) },
    };
    const group = node('group', 'group', { action: undefined });
    const nodes = [
      node('a'),
      node('b', 'text'),
      node('target', 'text'),
      group,
      node('child', 'image', {}, { parentId: 'group' }),
    ];
    expect(resolve(nodes, { models, edges: [edge('group')] }).valid).toBe(true);
    group.data.characterAsset = {
      defaultStateId: 'happy',
      states: [
        { id: 'sad', mainReferenceImageUrl: '/sad' },
        { id: 'happy', mainReferenceImageUrl: '/happy' },
      ],
    };
    expect(resolve(nodes, { models, edges: [edge('group')] }).reason).toBe('limit');
  });

  it('uses support order even if the current model already fits, and computes the source normal-default patch', () => {
    const models = catalogue('image', {
      first: schema(
        { image2image: [0, 3] },
        { quality: { default: 'new' } },
        { settings: ['quality'] },
      ),
      current: schema(
        { image2image: [0, 3] },
        { obsolete: { default: 5 } },
        { settings: ['obsolete'] },
      ),
    });
    const target = node('target', 'image', {
      params: {
        model: 'current',
        modeType: 'image2image',
        obsolete: 42,
        prompt: '',
        count: 3,
        advancedSettings: { seed: 7 },
        settings: { obsolete: 42 },
      },
    });
    const result = resolve([node('a'), node('b'), target], { models });
    expect(result).toMatchObject({
      valid: true,
      modelKey: 'first',
      targetPatch: {
        params: {
          model: 'first',
          quality: 'new',
          obsolete: undefined,
          prompt: '',
          count: 3,
          advancedSettings: { seed: 7 },
          settings: { quality: 'new', obsolete: undefined },
        },
      },
    });
  });

  it('does not patch when the first enabled support model is already selected', () => {
    const models = catalogue('image', { same: schema({ image2image: [0, 2] }) });
    expect(
      resolve([node('a'), node('b'), node('target', 'image', { params: { model: 'same' } })], {
        models,
      }).targetPatch,
    ).toBeUndefined();
  });

  it.each([null, {}, { imageModels: {}, support: { image: ['unknown'] } }])(
    'blocks unavailable media configuration %j',
    (models) => {
      expect(resolve([node('a'), node('b'), node('target')], { models }).reason).toBe(
        'modelsUnavailable',
      );
    },
  );

  it('rejects malformed support order and continues from an unknown model to a verified capable model', () => {
    const nodes = [node('a'), node('b'), node('target')];
    expect(resolve(nodes, { models: { imageModels: {}, support: { image: {} } } }).reason).toBe(
      'modelCatalogueUnavailable',
    );
    expect(
      resolve(nodes, {
        models: catalogue('image', { known: schema({ image2image: [0, 2] }) }, [
          'unknown',
          { modelKey: 'known' },
        ]),
      }),
    ).toMatchObject({ valid: true, modelKey: 'known' });
  });

  it('locks a video model only for explicit stored asset IDs in the multi protocol', () => {
    const models = catalogue('video', {
      first: schema({ frames2video: [0, 2] }),
      current: schema({ frames2video: [0, 1] }),
    });
    const target = node('target', 'video', {
      params: { model: 'current', imageList: [{ assetId: 'asset' }] },
    });
    expect(resolve([node('a'), node('b'), target], { models }).reason).toBe(
      'lockedModelUnsupported',
    );
    target.data.params.imageList = [];
    target.data.params.segmentRemakeLock = true;
    target.data.extraConfig = { models: [{ modelKey: 'current' }], schema: {} };
    expect(resolve([node('a'), node('b'), target], { models })).toMatchObject({
      valid: true,
      targetPatch: { params: { model: 'first', segmentRemakeLock: true } },
    });
  });

  it('retains a compatible locked model instead of switching to the first support model', () => {
    const models = catalogue('video', {
      first: schema({ frames2video: [0, 2] }),
      current: schema({ frames2video: [0, 2] }),
    });
    const target = node('target', 'video', {
      params: { model: 'current', videoList: [{ assetId: 'asset' }] },
    });
    expect(resolve([node('a'), node('b'), target], { models })).toMatchObject({ valid: true });
    expect(resolve([node('a'), node('b'), target], { models }).targetPatch).toBeUndefined();
  });

  it('checks aggregate subject shared limits against the target mode', () => {
    const subjects = { items: { mixed2video: { maxCount: 2, sharedWith: 'imageList' } } };
    const models = catalogue('video', { only: schema({ mixed2video: [0, 4] }, { subjects }) });
    const target = node('target', 'video', {
      params: { model: 'only', modeType: 'mixed2video', subjectList: [{ id: 'subject' }] },
    });
    expect(resolve([node('a'), node('b'), target], { models }).reason).toBe('modelUnsupported');
    expect(resolve([node('a'), node('b'), target], { models, sourceIds: ['a'] }).valid).toBe(true);
  });

  it('uses aggregate image/audio combinations instead of selecting a model for one of them', () => {
    const models = catalogue('audio', {
      only: schema({ image2audio: [0, 2], audio2audio: [0, 2] }),
    });
    expect(
      resolve([node('a'), node('b', 'audio'), node('target', 'audio')], { models }).reason,
    ).toBe('modelUnsupported');
  });

  it('uses source text fallback limits and excludes embedded refImages from that count', () => {
    const nodes = [
      node('a'),
      node('b'),
      node('target', 'text', { refImages: ['a', 'b'], params: { model: 'missing' } }),
    ];
    expect(resolve(nodes, { models: {} }).reason).toBe('limit');
    expect(resolve(nodes, { models: {}, sourceIds: ['a'] }).valid).toBe(true);
    expect(
      resolve([node('a', 'video'), node('b', 'text'), nodes.at(-1)], { models: {} }).reason,
    ).toBe('limit');
  });

  it('keeps script-v2 video rejection and does not use ordinary clip upload, cycle or timeline limits', () => {
    const nodes = [
      node('a', 'video', { url: ['blob:video'] }),
      node('b', 'audio'),
      node('target', 'video-clip', {
        action: 'video_clip_resource',
        clipTimelineData: { clips: Array(30).fill({ sourceNodeId: 'old' }) },
      }),
    ];
    expect(resolve(nodes, { edges: [edge('target', 'a')] }).valid).toBe(true);
    nodes[nodes.length - 1] = node('target', 'script-v2', { action: 'script_generate' });
    expect(resolve(nodes).reason).toBe('scriptVideo');
  });

  it('retains the source action fallback for an actionless existing video-clip target', () => {
    expect(
      resolve([
        node('a', 'video'),
        node('b', 'audio'),
        node('target', 'video-clip', { action: undefined }),
      ]),
    ).toMatchObject({ valid: true, edgeSourceIds: ['a', 'b'] });
  });

  it('leaves all documents and the model catalogue unchanged', () => {
    const nodes = [node('a'), node('b'), node('target')],
      edges = [];
    const before = JSON.stringify({ nodes, edges, publicModels });
    resolve(nodes, { edges });
    expect(JSON.stringify({ nodes, edges, publicModels })).toBe(before);
  });
});

describe('shared-target multi creation eligibility', () => {
  it('requires the newly created endpoint to be the target', () => {
    expect(create([node('a'), node('b'), node('target')], { createdNodeId: 'a' }).reason).toBe(
      'creationEndpoint',
    );
  });

  it('creates one shared image target with aggregate model and mode, preserving the empty prompt', () => {
    const models = catalogue('image', {
      first: schema({ image2image: [0, 1] }),
      two: schema({ image2image: [0, 2] }),
    });
    expect(
      create(
        [node('a'), node('b'), node('target', 'image', { params: { model: 'first', prompt: '' } })],
        { models },
      ),
    ).toMatchObject({
      valid: true,
      edgeSourceIds: ['a', 'b'],
      modelKey: 'two',
      modeType: 'image2image',
      targetPatch: { params: { model: 'two', modeType: 'image2image', prompt: '' } },
    });
  });

  it('preserves source creation image fallback while the same existing-target set is invalid', () => {
    const models = catalogue('image', { one: schema({ image2image: [0, 1] }) });
    const nodes = [node('a'), node('b'), node('target', 'image', { params: { model: 'one' } })];
    expect(resolve(nodes, { models }).valid).toBe(false);
    expect(create(nodes, { models })).toMatchObject({
      valid: true,
      modeType: 'image2image',
      targetPatch: { params: { model: 'one' } },
    });
  });

  it('does not use an unverified catalogue as the source no-enabled-model fallback', () => {
    expect(create([node('a'), node('b'), node('target')], { models: {} }).reason).toBe(
      'modelsUnavailable',
    );
  });

  it('infers video mixed mode from the complete image/video source set', () => {
    const models = catalogue('video', { mixed: schema({ mixed2video: [0, 3] }) });
    expect(
      create([node('a'), node('b', 'video'), node('target', 'video')], { models }),
    ).toMatchObject({ valid: true, modelKey: 'mixed', modeType: 'mixed2video' });
  });

  it('uses the global default text capacity rather than the new node model and never inserts a default prompt', () => {
    const models = {
      default: { text: 'one' },
      textModels: { one: schema({ image2text: [0, 1] }), many: schema({ image2text: [0, 10] }) },
    };
    const target = node('target', 'text', { params: { model: 'many', prompt: '' } }),
      nodes = [node('a'), node('b'), target];
    expect(create(nodes, { models }).reason).toBe('limit');
    const plan = create(nodes, { models, sourceIds: ['a'] });
    expect(plan).toMatchObject({ valid: true, edgeSourceIds: ['a'] });
    expect(plan.targetPatch).toBeUndefined();
    expect(target.data.params.prompt).toBe('');
  });

  it('requires at least one actual video source for the clip menu entry', () => {
    const target = node('target', 'video-clip', { action: 'video_clip_resource', params: {} });
    expect(create([node('a', 'text'), node('b'), target]).reason).toBe('videoRequired');
    expect(create([node('a', 'video'), node('b', 'audio'), target])).toMatchObject({
      valid: true,
      edgeSourceIds: ['a', 'b'],
    });
    expect(create([node('a', 'video'), node('b', 'audio'), target]).targetPatch).toBeUndefined();
  });

  it('supports only the six verified multi creation menu types', () => {
    for (const type of ['reference', 'script', 'group', 'shot-breakdown', 'director-studio'])
      expect(create([node('a'), node('b'), node('target', type)]).reason).toBe(
        'unverifiedCreationType',
      );
    expect(
      create([
        node('a'),
        node('b', 'text'),
        node('target', 'script-v2', { action: 'script_generate' }),
      ]).valid,
    ).toBe(true);
  });

  it('rejects all new edges together when one source cannot create the selected type', () => {
    expect(create([node('a'), node('b', 'video'), node('target')])).toMatchObject({
      valid: false,
      reason: 'action',
      edgeSourceIds: [],
    });
  });

  it('keeps text-only image/audio creation free of model-selection patches', () => {
    for (const type of ['image', 'audio']) {
      const plan = create([node('a', 'text'), node('b', 'text'), node('target', type)], {
        models: {},
      });
      expect(plan.valid).toBe(true);
      expect(plan.targetPatch).toBeUndefined();
    }
  });
});
