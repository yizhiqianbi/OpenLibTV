// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { removeGeneratorReference } from './reference-actions-model.js';
import {
  collectReconciledGeneratorInputs,
  expandGeneratorReferenceSources,
  normalizeStoredGeneratorMedia,
} from './reference-incoming-model.js';

const media = (id, kind = 'image', data = {}) => ({
  id,
  type: kind,
  data: { type: kind, url: [`/${id}`], ...data },
});
const group = (id, parentId) => ({ id, type: 'group', parentId, data: { type: 'group' } });
const ref = (nodeId, extra = {}) => ({ nodeId, url: `/${nodeId}`, ...extra });
const edge = (id, source, data) => ({ id, source, target: 'target', data });
const target = (params = {}, data = {}) => media('target', 'video', { params, ...data });
const ids = (list) => list.map((item) => item.nodeId);

describe('source store incoming collection and all-leaf deletion', () => {
  it('collects in edge order, preserves empty resources, and excludes virtual/reference edges before character refs', () => {
    const owner = target({}, { refImages: ['/local'], params: { focusRegion: { nodeId: 'b' } } });
    const nodes = [
      media('b'),
      media('empty', 'audio', { url: [] }),
      media('a'),
      media('ignored', 'reference'),
      owner,
    ];
    const edges = [
      edge('a-edge', 'a'),
      edge('b-edge', 'b'),
      edge('empty-edge', 'empty'),
      edge('virtual', 'a', {
        assetVirtual: true,
        characterRef: { mainReferenceImageUrl: '/virtual' },
      }),
      edge('ignored-edge', 'ignored', { characterRef: { mainReferenceImageUrl: '/ignored' } }),
    ];
    const incoming = collectReconciledGeneratorInputs({ nodes, edges, target: owner });
    expect(ids(incoming.imageList)).toEqual(['a', 'b']);
    expect(incoming.audioList).toEqual([{ nodeId: 'empty', url: '', label: undefined }]);
    expect(incoming.textList).toEqual([]);
  });

  it('preserves only normalized case-sensitive asset node IDs and applies typed order after graph collection', () => {
    const asset = ref('asset://valid');
    const owner = target({
      imageList: [
        asset,
        ref('ASSET://upper'),
        ref('not-connected'),
        { nodeId: 'asset://', url: ' ' },
        '/legacy',
        { nodeId: 'asset://array', url: ['/first', '/second'] },
      ],
      imageListOrder: ['asset://valid', 'graph', 'asset://array'],
    });
    const incoming = collectReconciledGeneratorInputs({
      nodes: [owner, media('graph')],
      edges: [edge('e', 'graph')],
      target: owner,
    });
    expect(ids(incoming.imageList)).toEqual([
      'asset://valid',
      'graph',
      'asset://array',
      'asset://',
    ]);
    expect(incoming.imageList[0]).toBe(asset);
    expect(incoming.imageList[2].url).toBe('/first');
    expect(incoming.imageList[3].url).toBe(' ');
    expect(owner.data.params.imageList).toHaveLength(6);
  });

  it('normalizes stored array records without inventing IDs for string-URL objects or skipping an empty first URL', () => {
    const object = { url: '/object' };
    expect(normalizeStoredGeneratorMedia('asset://outer')).toEqual([]);
    expect(
      normalizeStoredGeneratorMedia([
        '/string',
        object,
        { url: ['', '/second'] },
        { url: ['/first'] },
        { url: ' ' },
        { url: '' },
        null,
      ]),
    ).toEqual([
      { url: '/string', nodeId: 'legacy-0' },
      object,
      { url: '/first', nodeId: 'legacy-3' },
      { url: ' ' },
    ]);
  });

  it('keeps real metadata, certificate fields, character refs, and normalized text in their source-specific forms', () => {
    const picture = {
      ...media('picture', 'image', {
        originalUrl: ['/original'],
        portraitCompliantExempt: true,
        portraitComplianceCheckedAtMs: 4,
      }),
      createdAtMs: 2,
      resourceMeta: { items: [{ kind: 'image', width: 800, height: 600 }] },
    };
    const character = group('character');
    character.data.characterAsset = { states: [{ mainReferenceImageUrl: '/unused' }] };
    const text = media('text', 'text', { content: ['one', 3, 'two'] });
    const owner = target();
    const characterRef = { mainReferenceImageUrl: '/character', roleName: '角色' };
    const incoming = collectReconciledGeneratorInputs({
      nodes: [owner, picture, character, text],
      edges: [edge('i', 'picture'), edge('c', 'character', { characterRef }), edge('t', 'text')],
      target: owner,
    });
    expect(incoming.imageList).toEqual([
      {
        nodeId: 'picture',
        url: '/original',
        label: undefined,
        compliantExempt: true,
        complianceCheckedAtMs: 4,
        sourceCreatedAtMs: 2,
        width: 800,
        height: 600,
      },
      { nodeId: 'character', url: '/character', label: '角色', characterRef },
    ]);
    expect(incoming.textList).toEqual([{ nodeId: 'text', content: ['one', 'two'] }]);
  });

  it('uses parentId and complete leaves, ignoring misleading childNodeIds and empty URL usability', () => {
    const root = group('g');
    root.data.childNodeIds = ['wrong'];
    const image = { ...media('image', 'image', { url: [] }), parentId: 'g' };
    const ignored = { ...media('ignored', 'reference'), parentId: 'g' };
    const nested = group('nested', 'g');
    const text = { ...media('text', 'text'), parentId: 'nested' };
    expect(expandGeneratorReferenceSources([root], [root, nested, image, ignored, text])).toEqual([
      text,
      image,
      ignored,
    ]);
  });

  it('honors source traversal order when an excluded group child is also a direct source', () => {
    const root = group('g'),
      child = { ...media('child'), parentId: 'g' };
    expect(
      expandGeneratorReferenceSources([root, child], [root, child], new Set(['child'])),
    ).toEqual([]);
    expect(
      expandGeneratorReferenceSources([child, root], [root, child], new Set(['child'])),
    ).toEqual([child]);
  });

  it('stops group recursion at depth eight and treats a character group as one leaf', () => {
    const nodes = Array.from({ length: 9 }, (_, index) =>
      group(`g${index}`, index ? `g${index - 1}` : undefined),
    );
    nodes.push({ ...media('too-deep'), parentId: 'g8' });
    expect(expandGeneratorReferenceSources([nodes[0]], nodes)).toEqual([]);
    const character = group('character');
    character.data.characterAsset = {};
    expect(
      expandGeneratorReferenceSources(
        [character],
        [character, { ...media('child'), parentId: character.id }],
      ),
    ).toEqual([character]);
  });

  it('excludes one image while preserving the group edge when an ignored reference leaf remains', () => {
    const owner = target({ prompt: '{{Image 1}}', imageList: [ref('picture')] });
    const root = group('g'),
      image = { ...media('picture'), parentId: 'g' },
      ignored = { ...media('ignored', 'reference'), parentId: 'g' };
    const nodes = [root, image, ignored, owner],
      edges = [edge('g-edge', 'g')];
    const plan = removeGeneratorReference({
      nodes,
      edges,
      targetId: 'target',
      sourceId: 'picture',
    });
    expect(plan.edges).toBe(edges);
    expect(plan.nodes.at(-1).data.groupRefExcludedNodeIds).toEqual(['picture']);
    expect(plan.nodes.at(-1).data.params.prompt).toBe('');
    expect(plan.nodes.slice(0, -1)).toEqual(nodes.slice(0, -1));
  });

  it('detaches the last leaf group and clears only that group’s exclusions', () => {
    const owner = target(
      { prompt: '{{Image 1}}', imageList: [ref('last')], imageListOrder: ['removed', 'last'] },
      { groupRefExcludedNodeIds: ['removed', 'unrelated'] },
    );
    const root = group('g'),
      one = { ...media('removed'), parentId: 'g' },
      two = { ...media('last'), parentId: 'g' };
    const nodes = [root, one, two, owner],
      edges = [edge('g-edge', 'g')];
    const plan = removeGeneratorReference({ nodes, edges, targetId: 'target', sourceId: 'last' });
    expect(plan.edges).toEqual([]);
    expect(plan.nodes.at(-1).data.groupRefExcludedNodeIds).toEqual(['unrelated']);
    expect(plan.nodes.at(-1).data.params.imageListOrder).toBe(owner.data.params.imageListOrder);
    expect(plan.nodes.at(-1).data.params.prompt).toBe('');
  });

  it('direct-edge deletion takes precedence and removes only the first duplicate edge', () => {
    const owner = target({ prompt: '{{Image 1}}', imageList: [ref('picture')] });
    const picture = media('picture');
    const edges = [edge('first-edge', picture.id), edge('second-edge', picture.id)];
    const plan = removeGeneratorReference({
      nodes: [picture, owner],
      edges,
      targetId: 'target',
      sourceId: picture.id,
    });
    expect(plan.edges).toEqual([edges[1]]);
    expect(plan.nodes[1].data.params.prompt).toBe('{{Image 1}}');
    expect(plan.nodes[0]).toBe(picture);
  });

  it('rejects edge-free assets and missing/excluded sources without mutating stored lists or prompt', () => {
    const owner = target({ prompt: '{{Image 1}}', imageList: [ref('asset://kept')] });
    for (const sourceId of ['asset://kept', 'missing'])
      expect(
        removeGeneratorReference({ nodes: [owner], edges: [], targetId: 'target', sourceId }),
      ).toBeNull();
    expect(owner.data.params).toEqual({ prompt: '{{Image 1}}', imageList: [ref('asset://kept')] });
  });

  it('uses raw stored arrays even when empty, filling only absent old arrays from a local visible mapping', () => {
    const image = media('picture'),
      other = media('other');
    const edges = [edge('i', image.id), edge('o', other.id)];
    const fallbackReferences = { imageList: [ref('picture'), ref('other')] };
    const absent = target({ prompt: '{{Image 2}}' });
    const explicitEmpty = target({ prompt: '{{Image 2}}', imageList: [] });
    const remove = (owner) =>
      removeGeneratorReference({
        nodes: [image, other, owner],
        edges,
        targetId: 'target',
        sourceId: image.id,
        fallbackReferences,
      }).nodes[2].data.params.prompt;
    expect(remove(absent)).toBe('{{Image 1}}');
    expect(remove(explicitEmpty)).toBe('');
  });
});
