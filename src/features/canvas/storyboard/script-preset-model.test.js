import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import presets from '../../../../public/data/script-presets.json';
import { buildScriptV2PresetPlan, validateScriptV2Presets } from './script-preset-model.js';

const script = (patch = {}) => ({
  id: 'script',
  type: 'script-v2',
  position: { x: 900, y: 400 },
  data: { type: 'script-v2', name: '脚本', params: { model: 'keep-model', prompt: 'old prompt' } },
  ...patch,
});
const obstacle = (patch = {}) => ({
  id: 'obstacle',
  position: { x: 450, y: 400 },
  ...patch,
});
function setup(overrides = {}) {
  let number = 0;
  const target = script(),
    makeId = vi.fn((prefix) => `${prefix}_${++number}`);
  return {
    kind: 'scriptToStoryboard',
    script: target,
    nodes: [target],
    edges: [],
    presets,
    makeId,
    ...overrides,
  };
}
const plan = (overrides = {}) => buildScriptV2PresetPlan(setup(overrides));
const hash = (text) => createHash('sha256').update(text).digest('hex');

describe('module131525 representative preset snapshot', () => {
  it('keeps the entire original text story, including cooked escapes and whitespace', () => {
    expect(presets.textToScript.textPrompt).toHaveLength(544);
    expect(hash(presets.textToScript.textPrompt)).toBe(
      '4031d3e4a7e253a348554da119f43779c1abdd19ea2558b68468f877dfd8ac6a',
    );
    expect(presets.textToScript.textPrompt).toContain('热血 × 盛唐史诗感 × 爽点节奏');
    expect(presets.textToScript.scriptPrompt).toBe('根据我上传的剧本生成一个完整的故事脚本');
  });

  it('keeps the complete character story and both source URLs in order', () => {
    expect(presets.characterToScript.prompt).toHaveLength(207);
    expect(hash(presets.characterToScript.prompt)).toBe(
      'd7b388887cb4a2b9cb178081cf85de2a6a9b1cb148e9d24d400ac31714debfaa',
    );
    expect(presets.characterToScript.characterImages).toEqual([
      'https://liblibai-online.liblib.cloud/web/ea95cb51f3d94addbb92dc003cd33b49/b6989b27-e725-4958-a062-e8dfb3312db3.png',
      'https://liblibai-online.liblib.cloud/web/ea95cb51f3d94addbb92dc003cd33b49/fe840bb1-649e-4664-a23d-30f5ecf8e36c.png',
    ]);
    expect(presets).not.toHaveProperty('videoToScript');
  });
});

describe('preset catalogue validation', () => {
  it('validates each source entry without allocating identifiers', () => {
    expect(validateScriptV2Presets(presets)).toEqual({
      valid: true,
      reason: '',
      actions: {
        scriptToStoryboard: { enabled: true, reason: '' },
        characterToStoryboard: { enabled: true, reason: '' },
      },
    });
  });

  it.each([null, undefined, [], {}, { textToScript: null }])(
    'disables missing/bad catalogue fields: %j',
    (value) => {
      const catalogue = validateScriptV2Presets(value);
      expect(catalogue.valid).toBe(false);
      expect(catalogue.reason).toBe('invalid-presets');
      expect(catalogue.actions.scriptToStoryboard.enabled).toBe(false);
      expect(catalogue.actions.characterToStoryboard.enabled).toBe(false);
      const context = setup({ presets: value });
      expect(buildScriptV2PresetPlan(context).reason).toBe('invalid-presets');
      expect(context.makeId).not.toHaveBeenCalled();
    },
  );

  it('does not disable the independent text entry when the character entry is damaged', () => {
    const textOnly = { textToScript: presets.textToScript };
    expect(validateScriptV2Presets(textOnly).actions).toEqual({
      scriptToStoryboard: { enabled: true, reason: '' },
      characterToStoryboard: { enabled: false, reason: 'invalid-presets' },
    });
    expect(plan({ presets: textOnly }).valid).toBe(true);
    expect(plan({ kind: 'characterToStoryboard', presets: textOnly }).valid).toBe(false);
  });

  it('does not disable the independent character entry when the text entry is absent', () => {
    const characterOnly = { characterToScript: presets.characterToScript };
    expect(validateScriptV2Presets(characterOnly).actions.characterToStoryboard.enabled).toBe(true);
    expect(plan({ kind: 'characterToStoryboard', presets: characterOnly }).valid).toBe(true);
    expect(plan({ presets: characterOnly }).valid).toBe(false);
  });

  it.each([[], ['/one.png'], ['/one.png', ''], ['/one.png', null], new Array(2)])(
    'rejects incomplete or sparse character URLs atomically: %j',
    (characterImages) => {
      const context = setup({
        kind: 'characterToStoryboard',
        presets: { characterToScript: { prompt: 'story', characterImages } },
      });
      expect(buildScriptV2PresetPlan(context)).toMatchObject({
        valid: false,
        reason: 'invalid-presets',
        addedNodes: [],
        addedEdges: [],
        scriptPatch: null,
      });
      expect(context.makeId).not.toHaveBeenCalled();
    },
  );

  it('uses only the first two source URL indices without trimming or interpreting prompt text', () => {
    const context = setup({
      kind: 'characterToStoryboard',
      presets: {
        characterToScript: { prompt: ' \n ', characterImages: [' /one.png ', '/two.png', null] },
      },
    });
    const result = buildScriptV2PresetPlan(context);
    expect(result.valid).toBe(true);
    expect(result.addedNodes.map((node) => node.data.url)).toEqual([[' /one.png '], ['/two.png']]);
    expect(result.scriptPatch.params.prompt).toBe(' \n ');
  });
});

describe('tL/t_ source graph construction', () => {
  it('adds only the text resource and its source→target edge, leaving script data untouched', () => {
    const context = setup(),
      result = buildScriptV2PresetPlan(context);
    expect(result).toEqual({
      valid: true,
      reason: '',
      addedNodes: [
        {
          id: 'text_1',
          type: 'text',
          data: {
            type: 'text',
            name: '文本',
            content: [presets.textToScript.textPrompt],
            action: 'text_resource',
          },
          position: { x: 450, y: 400 },
          sourcePosition: 'right',
          targetPosition: 'left',
        },
      ],
      addedEdges: [
        {
          id: 'edge_2',
          source: 'text_1',
          sourceHandle: 'source',
          target: 'script',
          targetHandle: 'target',
        },
      ],
      scriptPatch: null,
      submitted: false,
    });
    expect(context.makeId.mock.calls).toEqual([['text'], ['edge']]);
    expect(context.script.data.params).toEqual({ model: 'keep-model', prompt: 'old prompt' });
    expect(result.addedNodes[0].data.content[0]).not.toBe(presets.textToScript.scriptPrompt);
  });

  it('adds character1 then character2 and replaces only source params/action in the script patch', () => {
    const context = setup({ kind: 'characterToStoryboard' }),
      result = buildScriptV2PresetPlan(context);
    expect(result.valid).toBe(true);
    expect(result.addedNodes).toEqual(
      [0, 1].map((index) => ({
        id: `image_${index + 1}`,
        type: 'image',
        data: {
          type: 'image',
          name: `角色 ${index + 1}`,
          url: [presets.characterToScript.characterImages[index]],
          alt: `角色参考图 ${index + 1}`,
          action: 'image_resource',
        },
        position: { x: 450, y: index === 0 ? 292 : 692 },
        sourcePosition: 'right',
        targetPosition: 'left',
      })),
    );
    expect(result.addedEdges).toEqual(
      [0, 1].map((index) => ({
        id: `edge_${index + 3}`,
        source: `image_${index + 1}`,
        sourceHandle: 'source',
        target: 'script',
        targetHandle: 'target',
      })),
    );
    expect(result.scriptPatch).toEqual({
      params: { prompt: presets.characterToScript.prompt },
      action: 'script_generate',
    });
    expect(context.makeId.mock.calls).toEqual([['image'], ['image'], ['edge'], ['edge']]);
    expect(result.submitted).toBe(false);
    expect(result.scriptPatch.params).not.toHaveProperty('model');
  });

  it('reads the latest raw script position by ID and does not convert a nested script to world coordinates', () => {
    const stale = script(),
      latest = script({ parentId: 'parent', position: { x: 20, y: 30 } });
    const result = plan({
      script: stale,
      nodes: [latest, obstacle({ id: 'parent', position: { x: 2000, y: 2000 } })],
    });
    expect(result.addedNodes[0].position).toEqual({ x: -430, y: 30 });
    expect(result.addedNodes[0]).not.toHaveProperty('parentId');
  });

  it('does not synthesize dimensions, params, timestamps, selection, focus or task state', () => {
    for (const kind of ['scriptToStoryboard', 'characterToStoryboard']) {
      const result = plan({ kind });
      for (const node of result.addedNodes) {
        for (const key of [
          'width',
          'height',
          'measured',
          'style',
          'parentId',
          'selected',
          'createdAtMs',
        ])
          expect(node).not.toHaveProperty(key);
        for (const key of ['params', 'taskInfo', 'resourceMeta'])
          expect(node.data).not.toHaveProperty(key);
      }
      expect(result).not.toHaveProperty('selectedIds');
      expect(result).not.toHaveProperty('fitNodeIds');
    }
  });

  it('expresses source root unshift order and edge append order for an atomic caller merge', () => {
    const context = setup({
      kind: 'characterToStoryboard',
      edges: [{ id: 'old-edge', source: 'script', target: 'external' }],
    });
    const result = buildScriptV2PresetPlan(context);
    const mergedNodes = [
      ...result.addedNodes,
      ...context.nodes.map((node) =>
        node.id === context.script.id
          ? { ...node, data: { ...node.data, ...result.scriptPatch } }
          : node,
      ),
    ];
    expect(mergedNodes.map((node) => node.id)).toEqual(['image_1', 'image_2', 'script']);
    expect([...context.edges, ...result.addedEdges].map((edge) => edge.id)).toEqual([
      'old-edge',
      'edge_3',
      'edge_4',
    ]);
    expect(mergedNodes[2].data.params).toEqual({ prompt: presets.characterToScript.prompt });
  });
});

describe('source store e5/e8 placement', () => {
  it.each([
    [{ height: 80, width: 200 }, 530],
    [{ height: 600, width: 200, measured: { width: 200, height: 10 } }, 460],
    [{ height: 80, width: 200, measured: { width: 200, height: null } }, 530],
    [{ height: 80, width: 200, measured: { width: 200, height: 0 } }, 450],
  ])('uses measured→stored→350 nullish geometry, retaining measured zero: %j', (patch, y) => {
    const target = script();
    expect(plan({ nodes: [target, obstacle(patch)] }).addedNodes[0].position).toEqual({
      x: 450,
      y,
    });
  });

  it('defaults geometry to 350×350 and ignores data ratio or content dimensions for store placement', () => {
    const target = script();
    const result = plan({
      nodes: [
        target,
        obstacle({ data: { contentHeight: 5, params: { settings: { ratio: '21:9' } } } }),
      ],
    });
    expect(result.addedNodes[0].position).toEqual({ x: 450, y: 800 });
  });

  it.each([{ hidden: true }, { parentId: 'script' }, { type: 'temp' }])(
    'does not exclude hidden, child or temporary obstacles: %j',
    (flags) => {
      const target = script();
      expect(
        plan({ nodes: [target, obstacle({ ...flags, width: 200, height: 80 })] }).addedNodes[0]
          .position.y,
      ).toBe(530);
    },
  );

  it('does not move an obstacle or existing script, and preserves a precise 50px gap', () => {
    const target = script(),
      other = obstacle({ position: { x: 450, y: 800 } });
    const context = setup({ nodes: [target, other] });
    expect(buildScriptV2PresetPlan(context).addedNodes[0].position).toEqual({ x: 450, y: 400 });
    expect(other.position).toEqual({ x: 450, y: 800 });
    expect(target.position).toEqual({ x: 900, y: 400 });
  });

  it('uses measured width for collision checks rather than stored width or board dimensions', () => {
    const target = script();
    const result = plan({
      nodes: [
        target,
        obstacle({ position: { x: 0, y: 400 }, width: 600, measured: { width: 10, height: 100 } }),
      ],
    });
    expect(result.addedNodes[0].position).toEqual({ x: 450, y: 400 });
  });

  it('places the second character against the final first placement and existing nodes in source order', () => {
    const target = script(),
      other = obstacle({ position: { x: 450, y: 292 }, width: 100, height: 100 });
    const result = plan({ kind: 'characterToStoryboard', nodes: [target, other] });
    expect(result.addedNodes.map((node) => node.position)).toEqual([
      { x: 450, y: 442 },
      { x: 450, y: 842 },
    ]);
  });

  it('retains the source 30-pass limit instead of running an unbounded collision loop', () => {
    const target = script({ position: { x: 450, y: 0 } });
    const result = plan({
      nodes: [target, obstacle({ position: { x: 0, y: 349 }, height: 1e20 })],
    });
    expect(result.valid).toBe(true);
    expect(result.addedNodes[0].position).toEqual({ x: 0, y: 51 * (2 ** 30 - 1) });
  });
});

describe('atomic local validation and immutable data', () => {
  it.each([
    [{ kind: 'writeStoryboard' }, 'invalid-kind'],
    [{ nodes: null }, 'invalid-graph'],
    [{ edges: null }, 'invalid-graph'],
    [{ nodes: [] }, 'no-script'],
    [{ script: null }, 'invalid-script'],
    [{ makeId: null }, 'invalid-id-factory'],
    [{ nodes: [script({ type: 'script' })] }, 'not-v2-script'],
    [{ nodes: [script({ data: null })] }, 'invalid-script'],
    [{ nodes: [script({ position: { x: NaN, y: 0 } })] }, 'invalid-geometry'],
    [{ nodes: [script(), script()] }, 'invalid-graph'],
    [{ edges: [{ id: 'script', source: 'script', target: 'other' }] }, 'invalid-graph'],
    [{ edges: [{ id: 'edge', target: 'script' }] }, 'invalid-graph'],
  ])('rejects bad caller data before returning any partial graph: %j', (overrides, reason) => {
    const context = setup(overrides),
      result = buildScriptV2PresetPlan(context);
    expect(result).toMatchObject({
      valid: false,
      reason,
      addedNodes: [],
      addedEdges: [],
      scriptPatch: null,
      submitted: false,
    });
    if (typeof context.makeId === 'function') expect(context.makeId).not.toHaveBeenCalled();
  });

  it.each([undefined, '', ' ', 'script', 'existing-edge'])(
    'rejects ID failures or graph collisions atomically: %j',
    (value) => {
      const result = plan({
        makeId: () => value,
        edges: [{ id: 'existing-edge', source: 'script', target: 'external' }],
      });
      expect(result).toMatchObject({
        valid: false,
        reason: 'invalid-id',
        addedNodes: [],
        addedEdges: [],
        scriptPatch: null,
      });
    },
  );

  it('rejects a duplicate later ID or throwing ID factory without exposing the first node', () => {
    expect(plan({ kind: 'characterToStoryboard', makeId: () => 'same-id' }).addedNodes).toEqual([]);
    expect(
      plan({
        makeId: () => {
          throw new Error('factory failed');
        },
      }).reason,
    ).toBe('invalid-id');
  });

  it('does not mutate or serialize unrelated graph, supplied presets or generated plan references', () => {
    const toJSON = vi.fn(() => {
      throw new Error('unexpected serialization');
    });
    const target = script(),
      unrelated = obstacle({
        position: { x: 2000, y: 2000 },
        data: { toJSON, url: ['large-data-reference'] },
      });
    Object.freeze(target.position);
    Object.freeze(target.data.params);
    Object.freeze(target.data);
    Object.freeze(target);
    const context = setup({ nodes: Object.freeze([target, unrelated]), edges: Object.freeze([]) });
    const result = buildScriptV2PresetPlan(context);
    expect(result.valid).toBe(true);
    expect(toJSON).not.toHaveBeenCalled();
    result.addedNodes[0].data.content.push('new content');
    expect(presets.textToScript.textPrompt).toHaveLength(544);
    expect(context.nodes).toEqual([target, unrelated]);
  });
});
