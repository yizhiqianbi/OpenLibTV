// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MARK_MAX_OCCURRENCES,
  deleteCanvasMarkPoint,
  deleteFirstMarkToken,
  insertMarkToken,
  makeMarkStableId,
  markTokenOccurrences,
  normalizeMarkPoint,
  planCanvasMarkResult,
  replaceAllMarkTokens,
  replaceFirstMarkToken,
  selectCanvasMarkSuggestion,
} from './mark-model.js';

const suggestions = [
  { label: '服务元素一', bbox: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 }, score: 0.9 },
  { label: '服务元素二', bbox: { x: 0.3, y: 0.4, width: 0.2, height: 0.1 } },
];
const response = { id: 'recognition', suggestions };
const metadata = { suggestions, imageUrl: 'https://example.test/first.png' };
const graph = (params = {}, type = 'image') => ({
  nodes: [
    {
      id: 'source',
      type: 'image',
      position: { x: 0, y: 0 },
      data: { type: 'image', action: 'image_resource', url: [metadata.imageUrl, '/second.png'] },
    },
    {
      id: 'target',
      type,
      position: { x: 450, y: 80 },
      parentId: 'group',
      width: 348,
      data: {
        type,
        action: `${type}_generate`,
        unrelated: 'keep',
        params: {
          model: 'source-model',
          prompt: '最新输入',
          modeType: 'existing-mode',
          count: 3,
          settings: { ratio: '3:2', quality: '2K' },
          advancedSettings: { seed: 13 },
          focusRegion: { nodeId: 'another-image' },
          originImage: '/already-focused.png',
          scene: 'camera_focus',
          ...params,
        },
      },
    },
    { id: 'group', type: 'group', data: {}, position: { x: 20, y: 30 } },
  ],
  edges: [
    { id: 'reference-edge', source: 'source', target: 'target', extra: 'unchanged' },
    { id: 'other-edge', source: 'group', target: 'source' },
  ],
});
const resultPlan = (value, extra = {}) =>
  planCanvasMarkResult({
    ...value,
    targetNodeId: 'target',
    sourceNodeId: 'source',
    pointIndex: 1,
    response,
    ...extra,
  });
const targetParams = (value) => value.nodes.find((node) => node.id === 'target').data.params;
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
};

describe('source mark point and token protocol', () => {
  it('normalizes actual client content coordinates without zoom/natural-image compensation or clamp', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    expect(normalizeMarkPoint({ x: 150, y: 75 }, rect)).toEqual({ relX: 0.25, relY: 0.25 });
    expect(normalizeMarkPoint({ x: 50, y: 175 }, rect)).toEqual({ relX: -0.25, relY: 1.25 });
    for (const invalid of [
      { ...rect, width: 0 },
      { ...rect, height: -1 },
      { ...rect, left: Infinity },
      { ...rect, width: Number.MIN_VALUE },
    ])
      expect(normalizeMarkPoint({ x: 150, y: 75 }, invalid)).toBeNull();
    expect(normalizeMarkPoint({ x: NaN, y: 0 }, rect)).toBeNull();
  });

  it('counts exact lowercase regex occurrences, including duplicate IDs and absent metadata', () => {
    const prompt = 'A{{magic:s:0}}/{{magic:s:2}} {{Magic:s:0}} {{magic:s:x}} {{magic:s:1:2}}';
    expect(markTokenOccurrences(prompt)).toEqual([
      { id: 's', selectedIndex: 0, from: 1, to: 14, token: '{{magic:s:0}}' },
      { id: 's', selectedIndex: 2, from: 15, to: 28, token: '{{magic:s:2}}' },
    ]);
    expect(markTokenOccurrences('{{magic:id with spaces:0002}}')[0]).toMatchObject({
      id: 'id with spaces',
      selectedIndex: 2,
    });
    expect(markTokenOccurrences(null)).toEqual([]);
  });

  it('uses response ID plus monotonically allocated point index, including numeric response IDs', () => {
    expect(makeMarkStableId('api-response', 1)).toBe('api-response_1');
    expect(makeMarkStableId(27, 2)).toBe('27_2');
    expect(makeMarkStableId(-3, 4)).toBe('-3_4');
    for (const [id, index] of [
      ['', 1],
      [0, 1],
      [Infinity, 1],
      ['colon:id', 1],
      ['brace}id', 1],
      ['ok', 0],
      ['ok', 1.5],
      ['ok', Infinity],
    ])
      expect(makeMarkStableId(id, index)).toBeNull();
  });

  it.each([
    ['', 0, '{{magic:s:0}}'],
    ['AB', 0, '{{magic:s:0}} AB'],
    ['AB', 1, 'A {{magic:s:0}} B'],
    ['AB', 2, 'AB {{magic:s:0}}'],
    ['A B', 1, 'A {{magic:s:0}} B'],
    ['A B', 2, 'A {{magic:s:0}} B'],
    ['A\nB', 1, 'A {{magic:s:0}}\nB'],
    ['A\nB', 2, 'A\n{{magic:s:0}} B'],
    ['A\tB', 2, 'A\t {{magic:s:0}} B'],
    ['A  ', null, 'A   {{magic:s:0}}'],
    ['A\n', undefined, 'A\n {{magic:s:0}}'],
    ['AB', -1, 'AB {{magic:s:0}}'],
    ['AB', 3, 'AB {{magic:s:0}}'],
  ])('inserts at cursor %s/%s with source space/newline rules', (prompt, cursor, expected) => {
    expect(insertMarkToken(prompt, 's', 0, cursor)).toBe(expected);
  });

  it('limits twenty occurrences rather than unique IDs or known metadata', () => {
    expect(MARK_MAX_OCCURRENCES).toBe(20);
    const nineteen = '{{magic:same:0}}'.repeat(19);
    expect(insertMarkToken(nineteen, 'new')).toBe(`${nineteen} {{magic:new:0}}`);
    expect(insertMarkToken('{{magic:same:0}}'.repeat(20), 'new')).toBeNull();
    expect(insertMarkToken('{{Magic:same:0}}'.repeat(20), 'new')).not.toBeNull();
  });

  it('keeps first surface-prefix replacement distinct from all valid prompt-badge replacements', () => {
    const prompt = '{{magic:s:broken}}/{{magic:s:0}}/{{magic:s:2}}/{{magic:other:0}}';
    expect(replaceFirstMarkToken(prompt, 's', 1)).toBe(
      '{{magic:s:1}}/{{magic:s:0}}/{{magic:s:2}}/{{magic:other:0}}',
    );
    expect(replaceAllMarkTokens(prompt, 's', 1)).toBe(
      '{{magic:s:broken}}/{{magic:s:1}}/{{magic:s:1}}/{{magic:other:0}}',
    );
    expect(replaceFirstMarkToken('keep {{magic:s:unterminated', 's', 1)).toBe(
      'keep {{magic:s:unterminated',
    );
    expect(replaceAllMarkTokens('{{Magic:s:0}} {{magic:suffix:0}}', 's', 2)).toBe(
      '{{Magic:s:0}} {{magic:suffix:0}}',
    );
  });

  it.each([
    [' A  {{magic:s:0}}   B ', 'A B'],
    ['A\n{{magic:s:0}}\nB', 'A\n \nB'],
    ['\t{{magic:s:0}}\n', ''],
    ['A\t {{magic:s:bad}}  \tB', 'A\t \tB'],
    ['{{magic:s:0}} {{magic:s:1}}', '{{magic:s:1}}'],
    ['  absent token\n', '  absent token\n'],
  ])(
    'deletes only the first same-ID prefix and exact adjacent ASCII spaces: %s',
    (prompt, expected) => {
      expect(deleteFirstMarkToken(prompt, 's')).toBe(expected);
    },
  );

  it('rejects malformed helper arguments without constructing corrupt tokens', () => {
    expect(insertMarkToken(5, 's')).toBeNull();
    expect(insertMarkToken('', 'bad:id')).toBeNull();
    expect(insertMarkToken('', 's', -1)).toBeNull();
    expect(replaceFirstMarkToken('', 's', 0.5)).toBeNull();
    expect(replaceAllMarkTokens('', 's', NaN)).toBeNull();
    expect(deleteFirstMarkToken('', 'bad}id')).toBeNull();
  });
});

describe('latest target-only source mark graph plans', () => {
  it('saves genuine response metadata and the first source URL without changing source, edges or unrelated params', () => {
    const oldEntry = { suggestions, imageUrl: '/older.png', custom: 'keep' },
      value = freeze(graph({ prompt: '末次输入', magicList: { previous: oldEntry } })),
      plan = resultPlan(value, { cursorOffset: 0 });
    expect(plan).not.toBeNull();
    expect(plan.edges).toBe(value.edges);
    expect(plan.nodes[0]).toBe(value.nodes[0]);
    expect(plan.nodes[2]).toBe(value.nodes[2]);
    expect(plan.nodes[1].position).toBe(value.nodes[1].position);
    expect(targetParams(plan)).toEqual({
      ...targetParams(value),
      prompt: '{{magic:recognition_1:0}} 末次输入',
      magicList: {
        previous: oldEntry,
        recognition_1: { suggestions, imageUrl: metadata.imageUrl },
      },
    });
    expect(targetParams(plan).magicList.previous).toBe(oldEntry);
    expect(plan.nodes[1].data.unrelated).toBe('keep');
    expect(value.nodes[0].data.url).toEqual([metadata.imageUrl, '/second.png']);
  });

  it('allows the separately evidenced VIDEO owner but always uses an IMAGE content source', () => {
    const value = graph({ prompt: '' }, 'video');
    expect(targetParams(resultPlan(value)).prompt).toBe('{{magic:recognition_1:0}}');
    const videoSource = {
      ...value,
      nodes: value.nodes.map((node) => (node.id === 'source' ? { ...node, type: 'video' } : node)),
    };
    expect(resultPlan(videoSource)).toBeNull();
  });

  it('allows an IMAGE owner to mark its own actual image without importing the focus self ban or creating an edge', () => {
    const value = graph();
    value.nodes[1].data.url = ['/target-existing-image.png'];
    const plan = resultPlan(value, { sourceNodeId: 'target' });
    expect(targetParams(plan).magicList.recognition_1.imageUrl).toBe('/target-existing-image.png');
    expect(plan.edges).toBe(value.edges);
    expect(plan.nodes[0]).toBe(value.nodes[0]);
  });

  it('checks the latest projected prompt count again and cannot append a twenty-first occurrence', () => {
    const value = graph({ prompt: '{{magic:repeated:0}}'.repeat(20) });
    expect(resultPlan(value)).toBeNull();
    value.nodes[1].data.params.prompt = '{{magic:repeated:0}}'.repeat(19);
    const plan = resultPlan(value);
    expect(markTokenOccurrences(targetParams(plan).prompt)).toHaveLength(20);
    expect(targetParams(plan).magicList.recognition_1).toEqual(metadata);
  });

  it.each([{ prompt: 7 }, { magicList: [] }, { magicList: null }])(
    'does not overwrite damaged existing params: %j',
    (params) => {
      const value = graph(params);
      expect(resultPlan(value)).toBeNull();
      expect(targetParams(value)).toMatchObject(params);
    },
  );

  it('rejects invalid response, point index, graph owner or absent image without modifying the input', () => {
    const value = freeze(graph());
    for (const extra of [
      { response: { id: 'bad', suggestions: [] } },
      { response: { id: 'bad', suggestions: [{ label: 'missing-bbox' }] } },
      { pointIndex: 0 },
      { pointIndex: Infinity },
      { sourceNodeId: 'missing' },
      { targetNodeId: 'missing' },
      { nodes: [...value.nodes, value.nodes[0]] },
      { edges: null },
    ])
      expect(resultPlan(value, extra)).toBeNull();
    expect(targetParams(value).prompt).toBe('最新输入');
  });

  it('replaces only the first surface token and preserves metadata and every other parameter', () => {
    const value = freeze(
      graph({
        prompt: '{{magic:s:0}} and {{magic:s:0}}',
        magicList: { s: metadata },
      }),
    );
    const plan = selectCanvasMarkSuggestion({
      ...value,
      targetNodeId: 'target',
      stableId: 's',
      selectedIndex: 1,
    });
    expect(targetParams(plan)).toEqual({
      ...targetParams(value),
      prompt: '{{magic:s:1}} and {{magic:s:0}}',
    });
    expect(targetParams(plan).magicList).toBe(targetParams(value).magicList);
    expect(plan.edges).toBe(value.edges);
    expect(plan.nodes[0]).toBe(value.nodes[0]);
    expect(
      selectCanvasMarkSuggestion({
        ...plan,
        targetNodeId: 'target',
        stableId: 's',
        selectedIndex: 1,
      }),
    ).toBeNull();
  });

  it('deletes first token and only its metadata entry, preserving a duplicate token and all source connections', () => {
    const other = { ...metadata, imageUrl: '/other.png' },
      value = freeze(
        graph({ prompt: 'A  {{magic:s:0}}   B {{magic:s:1}}', magicList: { s: metadata, other } }),
      ),
      plan = deleteCanvasMarkPoint({ ...value, targetNodeId: 'target', stableId: 's' });
    expect(targetParams(plan)).toEqual({
      ...targetParams(value),
      prompt: 'A B {{magic:s:1}}',
      magicList: { other },
    });
    expect(targetParams(plan).magicList.other).toBe(other);
    expect(plan.edges).toBe(value.edges);
    expect(plan.nodes[0]).toBe(value.nodes[0]);
  });

  it('clears an empty metadata table to undefined even when its token was already removed from the latest prompt', () => {
    const value = graph({ prompt: 'token已被输入删除', magicList: { s: metadata } }),
      plan = deleteCanvasMarkPoint({ ...value, targetNodeId: 'target', stableId: 's' });
    expect(targetParams(plan).prompt).toBe('token已被输入删除');
    expect(targetParams(plan)).toHaveProperty('magicList', undefined);
    expect(targetParams(plan).settings).toBe(targetParams(value).settings);
  });

  it.each([
    { s: { suggestions: [], imageUrl: '/image.png' } },
    { s: { suggestions, imageUrl: '' } },
    { s: { suggestions: [{ label: 'missing-bbox' }], imageUrl: '/image.png' } },
  ])('cannot select/delete without legitimate saved response metadata: %j', (magicList) => {
    const value = graph({ prompt: '{{magic:s:0}}', magicList });
    expect(
      selectCanvasMarkSuggestion({
        ...value,
        targetNodeId: 'target',
        stableId: 's',
        selectedIndex: 0,
      }),
    ).toBeNull();
    expect(deleteCanvasMarkPoint({ ...value, targetNodeId: 'target', stableId: 's' })).toBeNull();
  });

  it('allows a real known point after Core pruned its missing metadata, replacing/deleting only the first token without recreating metadata', () => {
    const other = { ...metadata, imageUrl: '/other.png' },
      value = freeze(graph({ prompt: '{{magic:s:0}} + {{magic:s:0}}', magicList: { other } })),
      selected = selectCanvasMarkSuggestion({
        ...value,
        targetNodeId: 'target',
        stableId: 's',
        selectedIndex: 1,
        knownSuggestions: suggestions,
      });
    expect(targetParams(selected)).toEqual({
      ...targetParams(value),
      prompt: '{{magic:s:1}} + {{magic:s:0}}',
    });
    expect(targetParams(selected).magicList).toBe(targetParams(value).magicList);
    expect(selected.edges).toBe(value.edges);
    const deleted = deleteCanvasMarkPoint({ ...selected, targetNodeId: 'target', stableId: 's' });
    expect(targetParams(deleted).prompt).toBe('+ {{magic:s:0}}');
    expect(targetParams(deleted).magicList).toBe(targetParams(value).magicList);
    expect(deleted.nodes[0]).toBe(value.nodes[0]);
    expect(deleted.edges).toBe(value.edges);
  });

  it('clears first token with empty/absent metadata, but no-token/no-entry produces no graph plan', () => {
    for (const magicList of [undefined, {}]) {
      const value = graph({ prompt: '{{magic:s:0}}', magicList }),
        deleted = deleteCanvasMarkPoint({ ...value, targetNodeId: 'target', stableId: 's' });
      expect(targetParams(deleted).prompt).toBe('');
      expect(targetParams(deleted)).toHaveProperty('magicList', undefined);
      expect(
        selectCanvasMarkSuggestion({
          ...value,
          targetNodeId: 'target',
          stableId: 's',
          selectedIndex: 1,
          knownSuggestions: suggestions,
        }),
      ).not.toBeNull();
      value.nodes[1].data.params.prompt = '用户已删除token';
      expect(deleteCanvasMarkPoint({ ...value, targetNodeId: 'target', stableId: 's' })).toBeNull();
      expect(
        selectCanvasMarkSuggestion({
          ...value,
          targetNodeId: 'target',
          stableId: 's',
          selectedIndex: 1,
          knownSuggestions: suggestions,
        }),
      ).toBeNull();
    }
  });

  it('requires genuine known suggestions when metadata is absent, preserving damaged-input and bounds defenses', () => {
    const value = graph({ prompt: '{{magic:s:0}}' });
    for (const knownSuggestions of [undefined, [], [{ label: 'missing-bbox' }]])
      expect(
        selectCanvasMarkSuggestion({
          ...value,
          targetNodeId: 'target',
          stableId: 's',
          selectedIndex: 1,
          knownSuggestions,
        }),
      ).toBeNull();
    expect(
      selectCanvasMarkSuggestion({
        ...value,
        targetNodeId: 'target',
        stableId: 's',
        selectedIndex: 2,
        knownSuggestions: suggestions,
      }),
    ).toBeNull();
  });

  it.each([-1, 2, 0.5, Infinity])(
    'rejects selected index outside the saved suggestions: %s',
    (selectedIndex) => {
      const value = graph({ prompt: '{{magic:s:0}}', magicList: { s: metadata } });
      expect(
        selectCanvasMarkSuggestion({
          ...value,
          targetNodeId: 'target',
          stableId: 's',
          selectedIndex,
        }),
      ).toBeNull();
    },
  );
});
