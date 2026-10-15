// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { generatorReferenceLists } from './reference-lists.js';
import { collectGeneratorMediaInputs } from './media-input-model.js';
import { removeGeneratorReference, reorderGeneratorReferences } from './reference-actions-model.js';

const media = (id, type = 'image', extra = {}) => ({
  id,
  type,
  data: { type, url: [`/${id}.png`], ...extra },
});
const reference = (nodeId, mediaType = 'image') => ({ nodeId, mediaType, url: `/${nodeId}.png` });
const lists = {
  imageList: [reference('a'), reference('b')],
  videoList: [reference('v', 'video')],
  audioList: [reference('s', 'audio')],
};
const references = {
  ...lists,
  mixedList: [...lists.imageList, ...lists.videoList, ...lists.audioList],
};

describe('source reference graph actions', () => {
  it('video keeps image, video and audio token binding when mixed order changes, and commits typed order keys together', () => {
    const node = {
      id: 'target',
      type: 'video',
      data: { params: { model: 'keep', settings: { duration: 5 } } },
    };
    const next = reorderGeneratorReferences({
      node,
      references,
      listType: 'mixed',
      order: ['s', 'b', 'v', 'a'],
      mixed: true,
      prompt: '  {{Image 1}}  {{Video 1}} {{Audio 1}} {{Mixed 2}} ',
    });
    expect(next.data.params).toMatchObject({
      prompt: '{{Mixed 4}} {{Mixed 3}} {{Mixed 1}} {{Mixed 2}}',
      imageListOrder: ['b', 'a'],
      videoListOrder: ['v'],
      audioListOrder: ['s'],
      mixedListOrder: ['s', 'b', 'v', 'a'],
      model: 'keep',
      settings: { duration: 5 },
    });
    expect(node.data.params.prompt).toBeUndefined();
  });
  it('video preserves nonmixed whitespace, remaps Portrait by image identity, and rejects duplicate/partial order', () => {
    const node = { type: 'video', data: { params: {} } };
    expect(
      reorderGeneratorReferences({
        node,
        references,
        listType: 'imageList',
        order: ['b', 'a'],
        mixed: false,
        prompt: '\n {{Image 1}} {{Portrait 2}} {{Image 9}}  ',
      }).data.params.prompt,
    ).toBe('\n {{Image 2}} {{Portrait 1}} {{Image 9}}  ');
    for (const order of [['a'], ['a', 'a'], ['a', 'c']])
      expect(
        reorderGeneratorReferences({ node, references, listType: 'imageList', order }),
      ).toBeNull();
  });
  it('image changes only the current typed order and preserves the latest literal prompt and other typed/mixed orders', () => {
    const params = {
      model: 'keep',
      prompt: '{{Image 1}}',
      imageListOrder: ['a', 'b'],
      videoListOrder: ['v'],
      audioListOrder: ['s'],
      mixedListOrder: ['s', 'a', 'v', 'b'],
      settings: { ratio: '3:2' },
      magicList: { real: { suggestions: [{ label: '元数据' }] } },
    };
    const node = { id: 'target', type: 'image', data: { params } };
    const prompt = '\n {{Image 2}} {{Portrait 1}} {{Mixed 2}} {{magic:real:0}} {{Image 9}}  ';
    const next = reorderGeneratorReferences({
      node,
      references,
      listType: 'imageList',
      order: ['b', 'a'],
      prompt,
      mixed: true,
    });
    expect(next.data.params).toEqual({ ...params, prompt, imageListOrder: ['b', 'a'] });
    expect(next.data.params.videoListOrder).toBe(params.videoListOrder);
    expect(next.data.params.audioListOrder).toBe(params.audioListOrder);
    expect(next.data.params.mixedListOrder).toBe(params.mixedListOrder);
    expect(next.data.params.settings).toBe(params.settings);
    expect(next.data.params.magicList).toBe(params.magicList);
    expect(node.data.params).toBe(params);
    expect(node.data.params.imageListOrder).toEqual(['a', 'b']);
    expect(node.data.params.prompt).toBe('{{Image 1}}');
  });
  it.each([undefined, ''])(
    'image preserves an absent override or an explicitly empty latest prompt (%j)',
    (prompt) => {
      const node = { type: 'image', data: { params: { prompt: 'saved {{Image 2}}' } } };
      const next = reorderGeneratorReferences({
        node,
        references,
        listType: 'image',
        order: ['b', 'a'],
        prompt,
      });
      expect(next.data.params).toEqual({
        prompt: prompt === undefined ? node.data.params.prompt : '',
        imageListOrder: ['b', 'a'],
      });
      expect(next.data.params).not.toHaveProperty('mixedListOrder');
    },
  );
  it('image rejects duplicate, partial, unknown and unchanged orders without altering its literal prompt', () => {
    const node = { type: 'image', data: { params: { prompt: '{{Image 2}}' } } };
    for (const order of [['a'], ['a', 'a'], ['a', 'c'], ['a', 'b']])
      expect(
        reorderGeneratorReferences({ node, references, listType: 'imageList', order }),
      ).toBeNull();
    expect(node.data.params).toEqual({ prompt: '{{Image 2}}' });
  });
  it('removes a direct edge and its prompt occurrences, preserving the media and source order keys', () => {
    const target = {
      id: 'target',
      type: 'video',
      data: {
        params: { prompt: '{{Image 1}}', imageList: [reference('a')], imageListOrder: ['a'] },
      },
    };
    const nodes = [media('a'), target],
      edges = [{ id: 'e', source: 'a', target: 'target' }];
    const plan = removeGeneratorReference({ nodes, edges, targetId: 'target', sourceId: 'a' });
    expect(plan.nodes[0]).toBe(nodes[0]);
    expect(plan.edges).toEqual([]);
    expect(plan.nodes[1].data.params.prompt).toBe('');
    expect(plan.nodes[1].data.params.imageListOrder).toBe(target.data.params.imageListOrder);
    expect(
      generatorReferenceLists(
        plan.nodes[1],
        collectGeneratorMediaInputs({
          target: plan.nodes[1],
          nodes: plan.nodes,
          edges: plan.edges,
        }),
      ).imageList,
    ).toEqual([]);
  });
  it('excludes a nested child but removes the incoming group edge for the last remaining reference', () => {
    const nodes = [
      { id: 'g', type: 'group', data: {} },
      { id: 'nested', type: 'group', parentId: 'g', data: {} },
      { ...media('a'), parentId: 'nested' },
      { ...media('b'), parentId: 'g' },
      { id: 'target', type: 'video', data: {} },
    ];
    const edges = [{ id: 'e', source: 'g', target: 'target' }];
    const first = removeGeneratorReference({ nodes, edges, targetId: 'target', sourceId: 'a' });
    expect(first.edges).toBe(edges);
    expect(first.nodes[4].data.groupRefExcludedNodeIds).toEqual(['a']);
    const last = removeGeneratorReference({ ...first, targetId: 'target', sourceId: 'b' });
    expect(last.edges).toEqual([]);
    expect(last.nodes).toHaveLength(5);
  });
});
