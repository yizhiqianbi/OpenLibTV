// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canTargetAcceptCanvasReference,
  canvasConnectionCreatesCycle,
  canvasConnectionSubjectLimit,
  getCanvasReferenceCapacity,
  validateCanvasMentionConnection,
} from './connection-validator.js';
import { canvasConnectionAction, collectCanvasConnectionInputs } from './connection-inputs.js';

const models = JSON.parse(
  readFileSync(new URL('../../../../../public/data/models.json', import.meta.url), 'utf8'),
);
const node = (id, type, data = {}) => ({
  id,
  type,
  data: {
    type,
    action: type + '_generate',
    params: { model: models.default[type], modeType: type === 'video' ? 'mixed2video' : undefined },
    ...data,
  },
});
const edge = (source, target) => ({ source, target });
const validate = (nodes, edges = [], options = {}) =>
  validateCanvasMentionConnection({
    nodes,
    edges,
    models,
    sourceId: 'source',
    targetId: 'target',
    ...options,
  });

describe('verified ordinary Canvas mention connections', () => {
  it('uses the real default image/video/audio/text model limits and the original action matrix', () => {
    for (const type of ['image', 'video', 'audio', 'text'])
      expect(validate([node('source', 'image'), node('target', type)]).allowed).toBe(true);
    expect(validate([node('source', 'video'), node('target', 'image')]).reason).toBe('action');
    expect(validate([node('source', 'audio'), node('target', 'text')]).reason).toBe('action');
    expect(validate([node('source', 'text'), node('target', 'audio')]).allowed).toBe(true);
    const images = Array.from({ length: 14 }, (_, index) => node(`i${index}`, 'image'));
    expect(
      validate(
        [node('source', 'image'), node('target', 'image'), ...images],
        images.map((item) => edge(item.id, 'target')),
      ).reason,
    ).toBe('modelUnsupported');
  });

  it('counts current graph references rather than stale params, including empty URL and distinct nodes with equal URL', () => {
    const target = node('target', 'video', {
      params: { model: 'star-video2', imageList: Array(50).fill({ url: 'stale' }) },
      refImages: ['embedded'],
    });
    const nodes = [
      target,
      node('one', 'image', { url: [] }),
      node('two', 'image', { url: ['same'] }),
      node('three', 'image', { url: ['same'] }),
    ];
    const result = collectCanvasConnectionInputs({
      nodes,
      edges: nodes.slice(1).map((item) => edge(item.id, 'target')),
      targetId: 'target',
      pendingCounts: { audio: 2 },
    });
    expect(result.imageList.map((item) => item.nodeId)).toEqual([
      'one',
      'two',
      'three',
      'target:ref-0',
    ]);
    expect(result.audioList).toHaveLength(2);
    expect(result.imageList[0].url).toBe('');
  });

  it('expands groups with exclusions and adds original character-group default-state references', () => {
    const target = node('target', 'video', { groupRefExcludedNodeIds: ['excluded'] });
    const group = node('group', 'group');
    const child = { ...node('child', 'image'), parentId: 'group' };
    const excluded = { ...node('excluded', 'audio'), parentId: 'group' };
    const character = node('character', 'group', {
      characterAsset: {
        defaultStateId: 'chosen',
        states: [
          { id: 'first', mainReferenceImageUrl: 'first' },
          { id: 'chosen', mainReferenceImageUrl: 'chosen' },
        ],
      },
    });
    const result = collectCanvasConnectionInputs({
      nodes: [target, group, child, excluded, character],
      edges: [edge('group', 'target'), edge('character', 'target')],
      targetId: 'target',
    });
    expect(result.imageList).toEqual([
      { nodeId: 'child', url: '' },
      { nodeId: 'character', url: 'chosen' },
    ]);
    expect(result.audioList).toEqual([]);
  });

  it('fails closed for unknown model/schema/action/special target and never switches to an available alternate model', () => {
    const source = node('source', 'image');
    const unknown = node('target', 'image', { params: { model: 'unknown' } });
    expect(validate([source, unknown])).toMatchObject({
      allowed: false,
      verified: false,
      reason: 'unverifiedModel',
    });
    expect(validate([source, node('target', 'script-v2')]).reason).toBe('unverifiedTarget');
    expect(validate([source, node('target', 'video', { action: undefined })]).reason).toBe(
      'unverifiedTargetAction',
    );
    expect(validate([source, node('target', 'image', { generatorType: 'enhance' })]).reason).toBe(
      'unverifiedGenerator',
    );
    const model = {
      ...models,
      imageModels: {
        ...models.imageModels,
        tiny: { properties: { modeType: { items: { image2image: [0, 0] } } } },
      },
    };
    const result = validate([source, node('target', 'image', { params: { model: 'tiny' } })], [], {
      models: model,
    });
    expect(result).toMatchObject({ allowed: false, verified: true, reason: 'modelUnsupported' });
    expect(result).not.toHaveProperty('switchToModel');
  });

  it('requires explicit completed local media adaptation and keeps original video/text fallbacks separate', () => {
    const upload = node('source', 'image', {
      action: undefined,
      localMediaReady: true,
      url: ['data:image/png;base64,AAAA'],
    });
    expect(validate([upload, node('target', 'image')]).verified).toBe(false);
    expect(
      validate([upload, node('target', 'image')], [], { localResourceActions: true }).allowed,
    ).toBe(true);
    for (const data of [
      { localMediaReady: false },
      { pending: true },
      { uploading: true },
      { status: 'failed' },
      { url: ['blob:pending'] },
      { url: [] },
    ])
      expect(
        canvasConnectionAction(
          { ...upload, data: { ...upload.data, ...data } },
          { localResourceActions: true },
        ),
      ).toBeNull();
    expect(canvasConnectionAction(node('v', 'video', { action: undefined, url: [] }))).toBe(
      'video_generate',
    );
    expect(canvasConnectionAction(node('t', 'text', { action: undefined }))).toBe('text_generate');
  });

  it('blocks self, forward/reverse duplicates and reachable cycles, but ignores original reference-source edges', () => {
    const nodes = [node('source', 'image'), node('middle', 'image'), node('target', 'image')];
    expect(validate(nodes, [], { sourceId: 'target' }).reason).toBe('self');
    expect(validate(nodes, [edge('source', 'target')]).reason).toBe('duplicate');
    expect(validate(nodes, [edge('target', 'source')]).reason).toBe('duplicate');
    expect(validate(nodes, [edge('target', 'middle'), edge('middle', 'source')]).reason).toBe(
      'cycle',
    );
    const references = [...nodes, node('ref', 'reference')];
    expect(
      canvasConnectionCreatesCycle(
        references,
        [edge('target', 'ref'), edge('ref', 'source')],
        'source',
        'target',
      ),
    ).toBe(false);
  });

  it('checks original current-model capacity, refImages, pending uploads and image/audio mutual exclusion', () => {
    const target = node('target', 'image', { refImages: Array(13).fill('same') });
    const graph = { nodes: [target], edges: [], targetId: 'target', kind: 'image', models };
    expect(canTargetAcceptCanvasReference(graph)).toBe(true);
    expect(getCanvasReferenceCapacity({ ...graph, pendingCounts: { image: 1 } }).reason).toBe(
      'limit',
    );
    const audioTarget = node('target', 'audio');
    expect(
      validate(
        [node('source', 'image'), audioTarget, node('existing', 'audio')],
        [edge('existing', 'target')],
      ).allowed,
    ).toBe(false);
    expect(
      getCanvasReferenceCapacity({
        ...graph,
        nodes: [node('target', 'image', { params: { model: 'unknown' } })],
      }),
    ).toMatchObject({ allowed: false, verified: false });
  });

  it('preserves subject shared mode limits, explicit template allowed models and excludes unavailable text2video', () => {
    const schema = {
      properties: {
        subjects: {
          items: { mixed2video: { sharedWith: 'imageList', maxCount: 2, maxCountWithVideo: 1 } },
        },
      },
    };
    const inputs = { modeType: 'mixed2video', subjectList: [{}], imageList: [{}], videoList: [] };
    expect(canvasConnectionSubjectLimit(schema, inputs).allowed).toBe(true);
    expect(canvasConnectionSubjectLimit(schema, { ...inputs, videoList: [{}] }).allowed).toBe(
      false,
    );
    expect(canvasConnectionSubjectLimit(schema, { ...inputs, modeType: 'unknown' }).allowed).toBe(
      true,
    );
    expect(
      canvasConnectionSubjectLimit(
        { properties: { subjects: { items: { mixed2video: { sharedWith: 'imageList' } } } } },
        inputs,
      ).verified,
    ).toBe(false);
    const target = node('target', 'video', {
      extraConfig: { scene: 'test', models: [{ modelKey: 'other' }], schema: { config: false } },
    });
    expect(validate([node('source', 'image'), target]).reason).toBe('templateModel');
    const restrictedModels = {
      ...models,
      videoModels: {
        ...models.videoModels,
        blocked: {
          properties: { modeType: { items: {} } },
          config: { excludeModeTypes: ['text2video'] },
        },
      },
    };
    expect(
      validate(
        [node('source', 'text'), node('target', 'video', { params: { model: 'blocked' } })],
        [],
        { models: restrictedModels },
      ).allowed,
    ).toBe(false);
  });

  it('uses source text endpoint limits including existing character groups and requires known policies', () => {
    const target = node('target', 'text');
    const images = Array.from({ length: 6 }, (_, index) => node(`i${index}`, 'image'));
    const character = node('character', 'group', { characterAsset: {} });
    expect(
      validate(
        [node('source', 'image'), target, ...images, character],
        [...images, character].map((item) => edge(item.id, 'target')),
      ).reason,
    ).toBe('limit');
    expect(validate([node('source', 'text'), target], [], { policyRequired: true })).toMatchObject({
      verified: false,
      reason: 'unverifiedPolicy',
    });
    expect(
      validate([node('source', 'text'), target], [], {
        policyRequired: true,
        policy: () => undefined,
      }).verified,
    ).toBe(false);
    expect(
      validate([node('source', 'text'), target], [], { policyRequired: true, policy: () => false })
        .reason,
    ).toBe('policy');
    expect(
      validate([node('source', 'text'), target], [], { policyRequired: true, policy: () => true })
        .allowed,
    ).toBe(true);
  });
});
