import { describe, expect, it, vi } from 'vitest';
import supportSnapshot from '../../../../public/data/script-text-support.json';
import {
  buildScriptV2TaskParams,
  ensureScriptV2MediaListOrder,
  initScriptV2GeneratorParams,
  patchScriptV2GeneratorParams,
  patchScriptV2GeneratorPrompt,
  planScriptV2ReferenceRemoval,
  reorderScriptV2References,
  resolveScriptV2Generator,
} from './script-generator-model.js';

const support = supportSnapshot.items;
const models = {
  default: { text: 'aurora-3-prime' },
  textModels: Object.fromEntries(
    support.map((item) => [
      item.modelKey,
      { modelKey: item.modelKey, rules: [{ require: ['prompt'] }] },
    ]),
  ),
};
const script = (params = {}) => ({
  id: 'script',
  type: 'script-v2',
  data: { type: 'script-v2', params },
});
const resource = (id, type, data = {}, extra = {}) => ({
  id,
  type,
  data: { type, ...data },
  ...extra,
});
const edge = (source, id = `edge-${source}`) => ({ id, source, target: 'script' });
const incoming = (patch = {}) => ({
  textList: [],
  imageList: [],
  videoList: [],
  audioList: [],
  ...patch,
});
function resolve(params = {}, context = {}) {
  const node = script(params);
  return resolveScriptV2Generator({ node, nodes: [node], edges: [], models, support, ...context });
}

describe('450439 initialization and 427044 ScriptV2 task projection', () => {
  it('creates count1 only when params are absent, without reading schema defaults', () => {
    expect(initScriptV2GeneratorParams({ currentModel: 'default' })).toEqual({
      prompt: '',
      model: 'default',
      count: 1,
    });
    const params = { prompt: '', count: 9, modeType: 'historical', settings: { private: true } };
    expect(initScriptV2GeneratorParams({ params, currentModel: 'default' })).toEqual({
      ...params,
      model: 'default',
    });
    expect(params).not.toHaveProperty('model');
  });

  it('preserves existing params by reference when its model is present or no model can be supplied', () => {
    const params = { model: 'stored', count: 0, prompt: '' };
    expect(initScriptV2GeneratorParams({ params, currentModel: 'default' })).toBe(params);
    const empty = {};
    expect(initScriptV2GeneratorParams({ params: empty })).toBe(empty);
  });

  it.each([[], 1, 'params'])(
    'rejects malformed params without converting to generic text defaults: %j',
    (params) => {
      expect(initScriptV2GeneratorParams({ params, currentModel: 'default' })).toBeNull();
    },
  );

  it('orders each media list independently and assigns source_images from final image indices', () => {
    const inputs = incoming({
      textList: [{ nodeId: 'text', content: ['story'] }],
      imageList: [
        { nodeId: 'blank', url: '' },
        { nodeId: 'a', url: '/a', label: ' ' },
        { nodeId: 'b', url: '/b', label: '角色' },
      ],
      videoList: [
        { nodeId: 'v1', url: '/v1' },
        { nodeId: 'v2', url: '/v2' },
      ],
      audioList: [
        { nodeId: 'a1', url: '/a1' },
        { nodeId: 'a2', url: '/a2' },
      ],
    });
    const params = buildScriptV2TaskParams({
      nodeData: {
        params: {
          model: 'stored',
          imageListOrder: ['b', 'blank'],
          videoListOrder: ['v2'],
          audioListOrder: ['a2'],
          scene: 'old',
          scenePayload: { custom: { keep: true }, source_images: ['stale'] },
        },
      },
      currentModel: 'default',
      incomingData: inputs,
    });
    expect(params.model).toBe('stored');
    expect(params.scene).toBe('script-generate-v2');
    expect(params.textList).toBe(inputs.textList);
    expect(params.imageList.map((ref) => ref.nodeId)).toEqual(['b', 'blank', 'a']);
    expect(params.videoList.map((ref) => ref.nodeId)).toEqual(['v2', 'v1']);
    expect(params.audioList.map((ref) => ref.nodeId)).toEqual(['a2', 'a1']);
    expect(params.scenePayload).toEqual({
      custom: { keep: true },
      source_images: [
        { ref_id: 'src_img_1', node_id: 'b', url: '/b', display_name: '角色' },
        { ref_id: 'src_img_3', node_id: 'a', url: '/a', display_name: ' ' },
      ],
    });
    expect(params).not.toHaveProperty('modeType');
  });

  it('keeps duplicate direct refs without order, but source Map order chooses the last duplicate', () => {
    const imageList = [
      { nodeId: 'a', url: '/first' },
      { nodeId: 'a', url: '/last' },
      { nodeId: 'b', url: '/b' },
    ];
    expect(buildScriptV2TaskParams({ incomingData: incoming({ imageList }) }).imageList).toBe(
      imageList,
    );
    expect(
      buildScriptV2TaskParams({
        nodeData: { params: { imageListOrder: ['a', 'a'] } },
        incomingData: incoming({ imageList }),
      }).imageList,
    ).toEqual([
      { nodeId: 'a', url: '/last' },
      { nodeId: 'b', url: '/b' },
    ]);
  });

  it.each([
    [undefined, undefined],
    [{ source_images: ['old'] }, undefined],
    [{ source_images: ['old'], extra: 0 }, { extra: 0 }],
  ])(
    'removes old source_images only, retaining other payload keys: %j',
    (scenePayload, expected) => {
      expect(
        buildScriptV2TaskParams({
          nodeData: { params: { scenePayload } },
          incomingData: incoming(),
        }).scenePayload,
      ).toEqual(expected);
    },
  );

  it('does not revive old text/media lists or copy incoming studio fields into script task params', () => {
    const params = buildScriptV2TaskParams({
      nodeData: {
        params: {
          textList: ['old text'],
          imageList: [{ nodeId: 'stale', url: '/stale' }],
          prompt: 'keep',
          count: 4,
          modeType: 'legacy',
          settings: { keep: true },
        },
      },
      incomingData: incoming({ directorStudio: { studioDimensions: { genre: 'drama' } } }),
    });
    expect(params.textList).toEqual([]);
    expect(params.imageList).toEqual([]);
    expect(params).toMatchObject({
      prompt: 'keep',
      count: 4,
      modeType: 'legacy',
      settings: { keep: true },
    });
    expect(params).not.toHaveProperty('directorStudio');
  });

  it('returns null for missing required input arrays', () => {
    expect(buildScriptV2TaskParams({ incomingData: { imageList: [] } })).toBeNull();
    expect(buildScriptV2TaskParams({ incomingData: incoming({ imageList: [null] }) })).toBeNull();
    expect(
      buildScriptV2TaskParams({
        nodeData: { params: { imageListOrder: { length: 2 } } },
        incomingData: incoming(),
      }),
    ).toBeNull();
  });
});

describe('source core initialization, params patch and typed reorder', () => {
  it('prunes only unused magic keys by the exact lowercase source token, preserving text and retained metadata', () => {
    const a = { value: 'retained' },
      params = { prompt: 'old', magicList: { a, b: { value: 'removed' } }, count: 7 };
    const prompt = '{{magic:a:001}} {{Magic:b:1}} {{magic:unknown:2}}';
    const result = patchScriptV2GeneratorPrompt({ params, prompt });
    expect(result).toEqual({ prompt, magicList: { a }, count: 7 });
    expect(result.magicList.a).toBe(a);
    expect(params.magicList).toHaveProperty('b');
  });

  it('removes an exhausted magic field through source A undefined filtering', () => {
    expect(
      patchScriptV2GeneratorPrompt({
        params: { magicList: { a: 'metadata' }, model: 'keep' },
        prompt: '',
      }),
    ).toEqual({ model: 'keep', prompt: '' });
  });

  it('compacts camera presets in original array order and remaps repeated 1-based references', () => {
    const a = { id: 'a' },
      b = { id: 'b' },
      c = { id: 'c' },
      params = { cameraPresets: [a, b, c], settings: { keep: true } };
    const result = patchScriptV2GeneratorPrompt({
      params,
      prompt: '{{CameraPreset 3}} {{Image 2}} {{CameraPreset 2}} {{CameraPreset 3}}',
    });
    expect(result.cameraPresets).toEqual([b, c]);
    expect(result.cameraPresets[0]).toBe(b);
    expect(result.prompt).toBe(
      '{{CameraPreset 2}} {{Image 2}} {{CameraPreset 1}} {{CameraPreset 2}}',
    );
    expect(params.cameraPresets).toEqual([a, b, c]);
  });

  it('clears unmapped camera tokens only when a shortened list has a nonempty mapping, preserving whitespace and other tokens', () => {
    const result = patchScriptV2GeneratorPrompt({
      params: { cameraPresets: ['a', 'b'] },
      prompt: ' {{CameraPreset 2}}  {{CameraPreset 99}} {{Video 3}} ',
    });
    expect(result.cameraPresets).toEqual(['b']);
    expect(result.prompt).toBe(' {{CameraPreset 1}}   {{Video 3}} ');
  });

  it('preserves unknown camera tokens when no preset is referenced, while dropping the empty preset field', () => {
    const result = patchScriptV2GeneratorPrompt({
      params: { cameraPresets: ['a', 'b'] },
      prompt: '{{CameraPreset 99}} {{Image 1}}',
    });
    expect(result).not.toHaveProperty('cameraPresets');
    expect(result.prompt).toBe('{{CameraPreset 99}} {{Image 1}}');
  });

  it('does not rewrite camera tokens at all if every original preset remains referenced', () => {
    const params = { cameraPresets: ['a', 'b'] },
      prompt = '{{CameraPreset 01}} {{CameraPreset\n2}} {{CameraPreset 99}}';
    const result = patchScriptV2GeneratorPrompt({ params, prompt });
    expect(result.prompt).toBe(prompt);
    expect(result.cameraPresets).toBe(params.cameraPresets);
  });

  it('keeps already empty metadata containers and retains model/mode/count/advanced values through prompt changes', () => {
    const params = {
      magicList: {},
      cameraPresets: [],
      model: 'stored',
      count: 0,
      modeType: 'legacy',
      advancedSettings: { private: true },
    };
    expect(patchScriptV2GeneratorPrompt({ params, prompt: 'plain' })).toEqual({
      ...params,
      prompt: 'plain',
    });
  });

  it.each([
    { params: null, prompt: '' },
    { params: {}, prompt: null },
    { params: [], prompt: '' },
  ])('rejects invalid prompt edits without generating or changing data: %j', (context) => {
    expect(patchScriptV2GeneratorPrompt(context)).toBeNull();
  });

  it('sets only orders of nonempty actual media IDs and is referentially idempotent', () => {
    const params = {
      prompt: 'same',
      imageList: [{ nodeId: 'b' }, { nodeId: 'a' }],
      imageListOrder: ['a', 'b'],
      videoList: [],
      videoListOrder: ['stale'],
      audioList: [{ url: '/no-id' }],
      mixedList: [{ nodeId: 'm' }],
    };
    const result = ensureScriptV2MediaListOrder(params);
    expect(result).toMatchObject({
      imageListOrder: ['b', 'a'],
      videoListOrder: ['stale'],
      mixedListOrder: ['m'],
    });
    expect(result).not.toHaveProperty('audioListOrder');
    expect(ensureScriptV2MediaListOrder(result)).toBe(result);
    expect(params.imageListOrder).toEqual(['a', 'b']);
  });

  it('model patch retains settings/count/mode/advanced/scene and removes explicit undefined fields', () => {
    const params = {
      model: 'old',
      prompt: '{{Image 1}}',
      count: 9,
      modeType: 'oldmode',
      settings: { ratio: '1:1' },
      advancedSettings: { extra: true },
      scene: 'script-generate-v2',
      magicList: { a: 'keep' },
    };
    expect(
      patchScriptV2GeneratorParams({ params, patch: { model: 'new', magicList: undefined } }),
    ).toEqual({
      model: 'new',
      prompt: '{{Image 1}}',
      count: 9,
      modeType: 'oldmode',
      settings: params.settings,
      advancedSettings: params.advancedSettings,
      scene: 'script-generate-v2',
    });
    expect(params.model).toBe('old');
  });

  it('typed reorder changes only the requested order and keeps token text and other orders intact', () => {
    const params = {
      prompt: '{{Image 1}} {{Video 2}}',
      imageListOrder: ['a', 'b'],
      videoListOrder: ['v2', 'v1'],
      mixedListOrder: ['m'],
      settings: { keep: true },
    };
    const result = reorderScriptV2References({
      params,
      references: {
        imageList: [
          { nodeId: 'a', url: '/same' },
          { nodeId: 'b', url: '/same' },
        ],
      },
      listType: 'image',
      order: ['b', 'a'],
    });
    expect(result).toEqual({ ...params, imageListOrder: ['b', 'a'] });
    expect(params.imageListOrder).toEqual(['a', 'b']);
  });

  it.each([
    ['mixed', ['b', 'a']],
    ['image', ['a', 'b']],
    ['image', ['a', 'a']],
    ['image', ['a']],
    ['imageList', ['b', 'a']],
  ])('returns null for unsupported/invalid/no-op reorder: %s %j', (listType, order) => {
    expect(
      reorderScriptV2References({
        params: { prompt: '' },
        references: { imageList: [{ nodeId: 'a' }, { nodeId: 'b' }] },
        listType,
        order,
      }),
    ).toBeNull();
  });

  it('validates duplicate identity multiplicity instead of rejecting legal source duplicate refs indiscriminately', () => {
    expect(
      reorderScriptV2References({
        params: { imageListOrder: ['a', 'b', 'a'] },
        references: { imageList: [{ nodeId: 'a' }, { nodeId: 'a' }, { nodeId: 'b' }] },
        listType: 'image',
        order: ['a', 'a', 'b'],
      })?.imageListOrder,
    ).toEqual(['a', 'a', 'b']);
  });
});

describe('ScriptV2 catalogue and rule projection', () => {
  it('uses exactly source3 scriptText catalogue metadata instead of generic schema names or ref capacities', () => {
    const result = resolve({ prompt: 'story', imageList: ['stale'], count: 3 });
    expect(result.valid).toBe(true);
    expect(result.modelKeys).toEqual(['aurora-3-prime', 'cvlm-5.5', 'aurora-3-lite']);
    expect(result.modelList.map((item) => item.modelName)).toEqual([
      'GVLM 3.1',
      'CVLM 5.5',
      'GVLM 3.1 Flash',
    ]);
    expect(result.modelList[0].estimatedTime).toBe('20s');
    expect(result.params).toMatchObject({
      count: 3,
      prompt: 'story',
      model: 'aurora-3-prime',
      scene: 'script-generate-v2',
      imageList: [],
    });
    expect(result.params).not.toHaveProperty('modeType');
    expect(result.canGenerate).toBe(true);
  });

  it('keeps an unsupported stored model rather than silently choosing first support model', () => {
    const custom = {
      ...models,
      textModels: { ...models.textModels, custom: { modelKey: 'custom', rules: [] } },
    };
    expect(resolve({ model: 'custom' }, { models: custom }).model).toBe('custom');
  });

  it('sorts disabled source metadata last and preserves i18n disable reasons without guessing zh fallback', () => {
    const result = resolve(
      { prompt: 'story' },
      {
        language: 'fr',
        support: [
          { ...support[0], disable: { zh: '中文', en: 'English' } },
          support[1],
          support[2],
        ],
      },
    );
    expect(result.modelKeys).toEqual(['cvlm-5.5', 'aurora-3-lite', 'aurora-3-prime']);
    expect(result.modelList[2]).toMatchObject({ disabled: true, disabledReason: 'English' });
    expect(result.model).toBe('aurora-3-prime'); // selector side effect belongs to controller, not silent projection
  });

  it.each([undefined, [{ require: ['prompt'] }]])(
    'uses default require prompt when schema.rules is absent or explicit: %j',
    (rules) => {
      const schema = { modelKey: 'aurora-3-prime', ...(rules === undefined ? {} : { rules }) };
      expect(
        resolve(
          { prompt: '' },
          { models: { ...models, textModels: { 'aurora-3-prime': schema } } },
        ),
      ).toMatchObject({
        valid: true,
        canGenerate: false,
        error: '请输入提示词',
        reasons: ['请输入提示词'],
      });
    },
  );

  it.each([[], null, {}, [{ require: ['not-a-source-token'] }]])(
    'does not replace explicit empty/invalid source rules with defaults: %j',
    (rules) => {
      expect(
        resolve(
          {},
          {
            models: {
              ...models,
              textModels: { 'aurora-3-prime': { modelKey: 'aurora-3-prime', rules } },
            },
          },
        ).canGenerate,
      ).toBe(true);
    },
  );

  it.each([[['story']], [['']], [[' ']]])(
    'upstream TEXT array content satisfies prompt readiness without adding it to params.prompt: %j',
    (content) => {
      const target = script({ prompt: '' }),
        text = resource('text', 'text', { content });
      const result = resolveScriptV2Generator({
        node: target,
        nodes: [target, text],
        edges: [edge('text')],
        models,
        support,
      });
      expect(result.canGenerate).toBe(true);
      expect(result.params.prompt).toBe('');
      expect(result.references.textList[0].content).toEqual(content);
    },
  );

  it('does not satisfy default prompt from images alone, but honors any/custom/whenHas rules', () => {
    const images = incoming({ imageList: [{ nodeId: 'i', url: '' }] });
    expect(resolve({}, { incomingData: images }).canGenerate).toBe(false);
    const schema = (rules) => ({
      ...models,
      textModels: { 'aurora-3-prime': { modelKey: 'aurora-3-prime', rules } },
    });
    expect(
      resolve(
        {},
        { incomingData: images, models: schema([{ require: ['prompt', 'image'], mode: 'any' }]) },
      ).canGenerate,
    ).toBe(true);
    expect(
      resolve({}, { models: schema([{ require: ['prompt'], whenHas: ['image'] }]) }).canGenerate,
    ).toBe(true);
    expect(
      resolve(
        {},
        { incomingData: images, models: schema([{ require: ['prompt'], whenHas: ['image'] }]) },
      ).error,
    ).toBe('添加参考图片时，需同时输入提示词');
  });

  it('does not infer mode from stored params for a caller that omits useCanGenerate modeType', () => {
    const custom = {
      ...models,
      textModels: {
        'aurora-3-prime': {
          modelKey: 'aurora-3-prime',
          rules: [{ require: ['prompt'], forModeTypes: ['text2video'] }],
        },
      },
    };
    expect(resolve({ modeType: 'image2text' }, { models: custom }).error).toBe(
      '文生视频模式下，请输入提示词',
    );
  });

  it.each([
    ['{{Panorama720}}', false],
    ['{{SlashPreset:foo}}', false],
    [' {{Panorama720}} {{SlashPreset:foo}} ', false],
    ['{{CameraPreset 1}}', true],
    ['{{Image 1}}', true],
  ])(
    'retains source prompt marker cleanup without rewriting saved prompt: %s',
    (prompt, canGenerate) => {
      const result = resolve({ prompt });
      expect(result.canGenerate).toBe(canGenerate);
      expect(result.params.prompt).toBe(prompt);
    },
  );

  it('uses valid i18n translation then original message then source fallback', () => {
    const custom = {
      ...models,
      textModels: {
        'aurora-3-prime': {
          rules: [{ require: ['prompt'], message: '原文', messageI18nKey: 'custom:key' }],
        },
      },
    };
    expect(resolve({}, { models: custom, translate: () => '译文' }).error).toBe('译文');
    expect(resolve({}, { models: custom, translate: (key) => key }).error).toBe('原文');
  });

  it('projects ordered typed and mixed references as a record, keeping text labels out of task params', () => {
    const target = script({ imageListOrder: ['b', 'a'] }),
      text = resource('text', 'text', { name: '故事', content: ['story'] });
    const result = resolveScriptV2Generator({
      node: target,
      nodes: [
        target,
        text,
        resource('a', 'image', { url: ['/a'] }),
        resource('b', 'image', { url: ['/b'] }),
      ],
      edges: [edge('text'), edge('a'), edge('b')],
      models,
      support,
    });
    expect(result.references).toBe(result.inputMedia);
    expect(result.references.imageList.map((ref) => ref.nodeId)).toEqual(['b', 'a']);
    expect(result.references.mixedList.map((ref) => ref.mediaType)).toEqual(['image', 'image']);
    expect(result.references.textList[0].label).toBe('故事');
    expect(result.params.textList[0]).not.toHaveProperty('label');
    expect(result.initializationParams.imageListOrder).toEqual(['b', 'a']);
  });

  it.each([
    [{ support: null }, 'missing-support'],
    [{ support: {} }, 'invalid-support'],
    [{ support: [support[0], support[0]] }, 'duplicate-support-key'],
    [{ models: { ...models, textModels: {} } }, 'missing-schema'],
    [{ incomingData: { imageList: [] } }, 'invalid-inputs'],
    [{ nodes: null }, 'invalid-graph'],
  ])(
    'returns explicit local invalid state instead of inventing schema or successful generation: %j',
    (context, reason) => {
      const result = resolve({ prompt: 'story' }, context);
      expect(result).toMatchObject({ valid: false, reason, canGenerate: false });
      expect(result.error).not.toBe(reason);
      expect(result).not.toHaveProperty('submitted');
      expect(result.params?.prompt).toBe('story');
    },
  );
});

describe('814059 exact ScriptV2 graph reference removal', () => {
  function graph(extra = []) {
    const target = script({
      prompt: '{{Image 1}}',
      imageList: [
        { nodeId: 'a', url: '/same' },
        { nodeId: 'b', url: '/same' },
      ],
      imageListOrder: ['a', 'b'],
      textList: [{ nodeId: 'text', content: ['old'] }],
    });
    return {
      nodes: [
        target,
        resource('a', 'image', { url: ['/same'] }),
        resource('b', 'image', { url: [] }),
        ...extra,
      ],
      edges: [edge('a'), edge('b')],
      targetId: 'script',
      sourceId: 'a',
    };
  }

  it('removes only the first direct source edge, keeps graph nodes, same-URL siblings and token prompt', () => {
    const context = graph();
    context.edges.push(edge('a', 'a-duplicate'));
    const result = planScriptV2ReferenceRemoval(context);
    expect(result.nodes.map((node) => node.id)).toEqual(context.nodes.map((node) => node.id));
    expect(result.edges.map((edge) => edge.id)).toEqual(['edge-b', 'a-duplicate']);
    expect(result.nodes[0].data.params).toMatchObject({
      prompt: '{{Image 1}}',
      imageList: [{ nodeId: 'b', url: '/same' }],
      imageListOrder: ['b'],
    });
    expect(context.nodes[0].data.params.imageList).toHaveLength(2);
  });

  it.each(['reference', 'custom', 'image'])(
    'counts every expanded sibling, including noninput/blank kind %s, so keeps the group edge',
    (type) => {
      const group = resource('group', 'group'),
        a = resource('a', 'image', { url: ['/a'] }, { parentId: 'group' }),
        sibling = resource('sibling', type, { url: [] }, { parentId: 'group' });
      const context = {
          nodes: [script(), group, a, sibling],
          edges: [edge('group')],
          targetId: 'script',
          sourceId: 'a',
        },
        result = planScriptV2ReferenceRemoval(context);
      expect(result.edges).toBe(context.edges);
      expect(result.nodes[0].data.groupRefExcludedNodeIds).toEqual(['a']);
      expect(result.nodes.slice(1)).toEqual(context.nodes.slice(1));
    },
  );

  it('deletes the group edge only when the source expander leaves at most one node after exclusions', () => {
    const group = resource('group', 'group'),
      a = resource('a', 'image', { url: ['/a'] }, { parentId: 'group' }),
      b = resource('b', 'reference', {}, { parentId: 'group' });
    const result = planScriptV2ReferenceRemoval({
      nodes: [script(), group, a, b],
      edges: [edge('group')],
      targetId: 'script',
      sourceId: 'a',
    });
    expect(result.edges).toHaveLength(1);
    const target = script();
    target.data.groupRefExcludedNodeIds = ['b'];
    expect(
      planScriptV2ReferenceRemoval({
        nodes: [target, group, a, b],
        edges: [edge('group')],
        targetId: 'script',
        sourceId: 'a',
      }).edges,
    ).toEqual([]);
  });

  it('preserves supplied draft verbatim and does not remove an unconnected stored-only ref as a source action', () => {
    const context = graph();
    expect(
      planScriptV2ReferenceRemoval({ ...context, prompt: '' }).nodes[0].data.params.prompt,
    ).toBe('');
    expect(planScriptV2ReferenceRemoval({ ...context, sourceId: 'text' })).toBeNull();
  });

  it.each([
    { nodes: null },
    { edges: null },
    { targetId: 'missing' },
    { sourceId: 'missing' },
    { nodes: [null] },
    { edges: [{ source: 'a', target: 'script' }] },
    { edges: [edge('a'), edge('a')] },
    { nodes: [script([])] },
  ])('returns null for invalid or unmatched removal: %j', (patch) => {
    expect(planScriptV2ReferenceRemoval({ ...graph(), ...patch })).toBeNull();
  });

  it('does not serialize unrelated large media while merging local graph changes', () => {
    const toJSON = vi.fn(() => {
      throw new Error('unexpected');
    });
    const context = graph([resource('unrelated', 'image', { toJSON, url: ['data:large'] })]);
    const result = planScriptV2ReferenceRemoval(context);
    expect(result.nodes.at(-1)).toBe(context.nodes.at(-1));
    expect(toJSON).not.toHaveBeenCalled();
  });
});
