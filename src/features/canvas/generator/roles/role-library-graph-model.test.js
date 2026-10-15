import { describe, expect, it, vi } from 'vitest';
import {
  planCanvasRoleLibrarySelection,
  remapRoleLibraryPrompt,
  roleImageNodeDimensions,
} from './role-library-graph-model.js';

const model = {
  properties: {
    modeType: {
      items: {
        image2video: [1, 9],
        video2video: [1, 9],
        audio2video: [1, 1],
        mixed2video: [1, 12],
      },
      mixed2videoConfig: { videoMax: 9, imageMax: 9, audioMax: 3 },
    },
  },
};
const media = (id, type, extras = {}, position = { x: 1800, y: 1000 }) => ({
  id,
  type,
  position,
  data: { type, name: id, action: type + '_resource', url: ['https://media/' + id], ...extras },
});
const owner = (params = {}, extras = {}) => ({
  id: 'owner',
  type: 'video',
  position: { x: 1000, y: 1000 },
  data: {
    type: 'video',
    action: 'video_generate',
    params: { model: 'video-model', modeType: 'text2video', prompt: 'latest draft', ...params },
    ...extras,
  },
});
const edge = (id, source, target = 'owner', data) => ({
  id,
  source,
  target,
  ...(data ? { data } : {}),
});
const find = (graph, id) => graph.nodes.find((node) => node.id === id);
const params = (graph) => find(graph, 'owner').data.params;
function harness(overrides = {}) {
  let nodeNumber = 0,
    edgeNumber = 0;
  const makeNodeId = vi.fn((kind) => `new-${kind}-${++nodeNumber}`),
    makeEdgeId = vi.fn(() => `new-edge-${++edgeNumber}`);
  const resolveAssetUri = vi.fn((uri) => ({
    url: `https://operator/${uri.slice(8)}`,
    assetId: uri.slice(8),
    complianceCheckedAtMs: 100,
    createdAtMs: 50,
    status: 1,
  }));
  const args = {
    nodes: [owner()],
    edges: [],
    targetNodeId: 'owner',
    selection: { images: [], videos: [], audios: [] },
    schema: model,
    makeNodeId,
    makeEdgeId,
    resolveAssetUri,
    ...overrides,
  };
  return {
    args,
    run: (next = {}) => planCanvasRoleLibrarySelection({ ...args, ...next }),
    makeNodeId,
    makeEdgeId,
    resolveAssetUri,
  };
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

describe('source ag role graph plan', () => {
  it('creates resource nodes, real source edges and mapped media flags in one pure result', () => {
    const h = harness({
      selection: {
        images: ['asset://image-id', 'https://public/raw'],
        videos: ['asset://video-id'],
        audios: ['asset://audio-id'],
      },
      imageDimensionsByUri: { 'asset://image-id': { width: 1200, height: 800 } },
      labels: { image: '源角色图', video: '源角色视频', audio: '源角色音频' },
      createdAtMs: 200,
    });
    freeze(h.args.nodes);
    freeze(h.args.edges);
    freeze(h.args.selection);
    const graph = h.run();
    expect(graph.nodes).toHaveLength(5);
    expect(graph.edges).toHaveLength(4);
    expect(find(graph, 'new-image-1')).toMatchObject({
      type: 'image',
      data: {
        type: 'image',
        name: '源角色图',
        url: ['https://operator/image-id'],
        action: 'image_resource',
        portraitAssetId: 'image-id',
        portraitComplianceCheckedAtMs: 100,
        contentWidth: 525,
        contentHeight: 350,
      },
      width: 525,
      height: 350,
      measured: { width: 525, height: 350 },
      createdAtMs: 200,
    });
    expect(find(graph, 'new-image-2').data).toMatchObject({
      portraitCompliantExempt: true,
      url: ['https://public/raw'],
      contentWidth: 350,
      contentHeight: 350,
    });
    expect(find(graph, 'new-video-3').data).toEqual({
      type: 'video',
      name: '源角色视频',
      url: ['https://operator/video-id'],
      action: 'video_resource',
      assetVideoAssetId: 'video-id',
      assetVideoComplianceCheckedAtMs: 100,
    });
    expect(find(graph, 'new-audio-4').data).toEqual({
      type: 'audio',
      name: '源角色音频',
      url: ['https://operator/audio-id'],
      action: 'audio_resource',
      assetAudioAssetId: 'audio-id',
    });
    expect(graph.edges.map((item) => [item.source, item.target, item.data])).toEqual([
      ['new-image-1', 'owner', undefined],
      ['new-image-2', 'owner', undefined],
      ['new-video-3', 'owner', undefined],
      ['new-audio-4', 'owner', undefined],
    ]);
    expect(
      params(graph).imageList.map((item) => [item.nodeId, item.assetId, item.compliantExempt]),
    ).toEqual([
      ['new-image-1', 'image-id', undefined],
      ['new-image-2', undefined, true],
    ]);
    expect(params(graph).videoList[0]).toMatchObject({
      assetId: 'video-id',
      sourceCreatedAtMs: 200,
      complianceCheckedAtMs: 100,
    });
    expect(params(graph).audioList[0]).toMatchObject({ assetId: 'audio-id' });
    expect(params(graph).audioList[0]).not.toHaveProperty('complianceCheckedAtMs');
    expect(params(graph).modeType).toBe('mixed2video');
    expect(params(graph).prompt).toBe('latest draft');
    expect(JSON.stringify(graph)).not.toContain('simulated-');
    expect(h.resolveAssetUri).toHaveBeenCalledTimes(3);
    expect(h.args.nodes).toHaveLength(1);
    expect(h.args.edges).toEqual([]);
  });
  it('keeps prompt, camera, magic, subjects, settings, metadata and non-target identities from latest projected raw data', () => {
    const target = owner(
      {
        prompt: 'newest input {{Magic real:2}} {{Element 1}}',
        magicList: { real: { suggestions: ['actual'] } },
        subjectList: [{ uuid: 'subject' }],
        cameraPresets: [{ name: 'camera' }],
        settings: { ratio: '16:9' },
        advancedSettings: { seed: 3 },
        custom: { keep: true },
      },
      { extraData: 'keep' },
    );
    const untouched = media('untouched', 'text', { content: ['text'] });
    const h = harness({
      nodes: [target, untouched],
      selection: { images: ['https://real/new'], videos: [], audios: [] },
    });
    const result = h.run();
    expect(find(result, 'untouched')).toBe(untouched);
    expect(find(result, 'owner').data.extraData).toBe('keep');
    for (const key of [
      'prompt',
      'magicList',
      'subjectList',
      'cameraPresets',
      'settings',
      'advancedSettings',
      'custom',
    ])
      expect(params(result)[key]).toBe(target.data.params[key]);
    expect(target.data.params).not.toHaveProperty('imageList');
  });
  it('removes only the first owner edge and keeps role nodes and their other connections', () => {
    const role = media('prior', 'image', { portraitAssetId: 'prior' });
    const edges = [
      edge('first', 'prior'),
      edge('duplicate', 'prior'),
      edge('other-target', 'prior', 'other'),
    ];
    const h = harness({ nodes: [owner(), role], edges });
    const result = h.run();
    expect(find(result, 'prior')).toBe(role);
    expect(result.edges).toEqual([edges[1], edges[2]]);
    expect(h.makeNodeId).not.toHaveBeenCalled();
    expect(params(result).imageList.map((item) => item.nodeId)).toEqual(['prior']);
  });
  it('does not remove ordinary media or video certified in place', () => {
    const nodes = [
      owner(),
      media('ordinary', 'image'),
      media('role', 'image', { portraitAssetId: 'role' }),
      media('exempt', 'image', { portraitCompliantExempt: true }),
      media('in-place', 'video', { assetVideoAssetId: 'cert', assetVideoCertifiedInPlace: true }),
      media('role-video', 'video', { assetVideoAssetId: 'v' }),
      media('role-audio', 'audio', { assetAudioAssetId: 'a' }),
    ];
    const edges = nodes.slice(1).map((node) => edge('e-' + node.id, node.id));
    const result = harness({ nodes, edges }).run();
    expect(result.nodes).toHaveLength(nodes.length);
    expect(result.edges).toEqual([edges[0], edges[3]]);
    expect(params(result).videoList[0]).toMatchObject({ nodeId: 'in-place', assetId: 'cert' });
    expect(params(result).imageList.map((item) => item.nodeId)).toEqual(['ordinary']);
  });
  it('preserves the source IMAGE difference: an existing certified picture asset is managed by rz', () => {
    const target = owner(),
      image = media('cert-image', 'image', {
        portraitAssetId: 'id',
        portraitCertifiedInPlace: true,
      });
    expect(
      harness({ nodes: [target, image], edges: [edge('edge', image.id)] }).run().edges,
    ).toEqual([]);
  });
  it('retains selected connected resources by their asset ID and does not reread/create replacements', () => {
    const image = media('existing', 'image', { portraitAssetId: 'id' });
    const h = harness({
      nodes: [owner(), image],
      edges: [edge('e', image.id)],
      selection: { images: ['asset://id', 'asset://id'], videos: [], audios: [] },
    });
    const result = h.run();
    expect(result.nodes).toHaveLength(2);
    expect(find(result, image.id)).toBe(image);
    expect(result.edges).toBe(h.args.edges);
    expect(h.makeNodeId).not.toHaveBeenCalled();
  });
  it('keeps raw existing exempt images and resolves asset URLs only from an explicit record', () => {
    const image = media('existing', 'image', {
      portraitCompliantExempt: true,
      url: ['https://raw'],
    });
    const h = harness({
      nodes: [owner(), image],
      edges: [edge('e', image.id)],
      selection: { images: ['https://raw', 'asset://missing'], videos: [], audios: [] },
      resolveAssetUri: () => null,
    });
    const result = h.run();
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toBe(h.args.edges);
    expect(params(result).imageList.map((item) => item.url)).toEqual(['https://raw']);
    expect(JSON.stringify(result)).not.toContain('missing');
  });
  it('raw video/audio selection has no source ag creation branch', () => {
    const h = harness({
      selection: { images: [], videos: ['https://raw/video'], audios: ['https://raw/audio'] },
    });
    const result = h.run();
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toEqual([]);
    expect(params(result).videoList).toEqual([]);
    expect(params(result).audioList).toEqual([]);
    expect(h.makeNodeId).not.toHaveBeenCalled();
  });
  it('does not create media from a bare URI, a URI result, or an inconsistent resolved ID', () => {
    for (const resolver of [
      undefined,
      () => 'https://guessed',
      () => ({ url: 'asset://only-id', assetId: 'id' }),
      () => ({ url: 'https://real', assetId: 'different' }),
    ]) {
      const h = harness({
        selection: { images: ['asset://id'], videos: [], audios: [] },
        resolveAssetUri: resolver,
      });
      const result = h.run();
      expect(result.nodes).toHaveLength(1);
      expect(result.edges).toEqual([]);
      expect(params(result).imageList).toEqual([]);
      expect(h.makeNodeId).not.toHaveBeenCalled();
    }
  });
  it('treats a valid unchanged selection as no-op success, retaining graph identities', () => {
    const h = harness({ selection: { images: ['asset://id'], videos: [], audios: [] } });
    const first = h.run();
    const second = h.run({ nodes: first.nodes, edges: first.edges });
    expect(second).toEqual({ nodes: first.nodes, edges: first.edges, unchanged: true });
    expect(second.nodes).toBe(first.nodes);
    expect(second.edges).toBe(first.edges);
    expect(h.makeNodeId).toHaveBeenCalledTimes(1);
  });
  it('preserves legacy persisted asset nodeIds and excludes virtual graph edges from inputs', () => {
    const legacy = { nodeId: 'asset://legacy', url: 'https://legacy', assetId: 'legacy' };
    const target = owner({ imageList: [legacy] });
    const virtual = media('virtual', 'image');
    const graph = harness({
      nodes: [target, virtual],
      edges: [edge('v', virtual.id, 'owner', { portraitVirtual: true })],
    }).run();
    expect(graph.edges).toHaveLength(1);
    expect(params(graph).imageList).toEqual([legacy]);
  });
  it('keeps ordinary source order by edge order even though root nodes are prepended', () => {
    const one = media('one', 'image'),
      two = media('two', 'image');
    const target = owner({
      modeType: 'image2video',
      imageList: [{ nodeId: 'one' }, { nodeId: 'two' }],
      prompt: '{{Image 1}} then {{Image 2}}',
    });
    const graph = harness({
      nodes: [two, target, one],
      edges: [edge('one-edge', 'one'), edge('two-edge', 'two')],
    }).run();
    expect(params(graph).imageList.map((item) => item.nodeId)).toEqual(['one', 'two']);
    expect(params(graph).prompt).toBe('{{Image 1}} then {{Image 2}}');
  });
  it('retains media order keys and reindexes removed references without losing later literal/Element/Magic tokens', () => {
    const old = media('old', 'image', { portraitAssetId: 'old' }),
      kept = media('kept', 'image');
    const target = owner({
      modeType: 'image2video',
      prompt: 'a\n  {{Image 1}}  b {{Image 2}} c {{Element 1}} {{Magic m:1}}',
      imageList: [{ nodeId: 'old' }, { nodeId: 'kept' }],
      imageListOrder: ['old', 'kept'],
    });
    const graph = harness({
      nodes: [target, old, kept],
      edges: [edge('old-edge', 'old'), edge('keep-edge', 'kept')],
    }).run();
    expect(params(graph).prompt).toBe('ab {{Image 1}} c {{Element 1}} {{Magic m:1}}');
    expect(params(graph).imageListOrder).toBe(target.data.params.imageListOrder);
    expect(params(graph).imageList.map((item) => item.nodeId)).toEqual(['kept']);
    expect(find(graph, 'old')).toBe(old);
  });
  it('normalizes typed media tokens to final Mixed indices while preserving latest magic metadata', () => {
    const picture = media('picture', 'image'),
      video = media('clip', 'video');
    const target = owner({
      modeType: 'video2video',
      prompt: '{{Portrait 1}} {{Video 1}} {{Magic m:1}}',
      imageList: [{ nodeId: 'picture' }],
      videoList: [{ nodeId: 'clip' }],
      magicList: { m: { suggestions: ['real'] } },
    });
    const graph = harness({
      nodes: [target, picture, video],
      edges: [edge('i', picture.id), edge('v', video.id)],
    }).run();
    expect(params(graph).modeType).toBe('video2video');
    expect(params(graph).prompt).toBe(target.data.params.prompt);
    const switched = harness({
      nodes: [
        {
          ...target,
          data: { ...target.data, params: { ...target.data.params, modeType: 'text2video' } },
        },
        picture,
        video,
      ],
      edges: [edge('i', picture.id), edge('v', video.id)],
    }).run();
    expect(params(switched).modeType).toBe('mixed2video');
    // Store reconciliation uses the old mode; a later submission normalizer is
    // a separate protocol and cannot be folded into this immediate graph plan.
    expect(params(switched).prompt).toBe(target.data.params.prompt);
    expect(params(switched).magicList).toBe(target.data.params.magicList);
  });
  it('keeps characterRef material and UTF-8 text inputs rather than overwriting them with empty arrays', () => {
    const text = media('text', 'text', { content: '真实正文' }),
      group = {
        id: 'character',
        type: 'group',
        position: { x: 2200, y: 1000 },
        data: {
          type: 'group',
          characterAsset: { states: [{ id: 's', mainReferenceImageUrl: 'https://fallback' }] },
        },
      };
    const graph = harness({
      nodes: [owner(), group, text],
      edges: [
        edge('t', text.id),
        edge('c', group.id, 'owner', {
          characterRef: { roleName: '人物状态', mainReferenceImageUrl: 'https://reference' },
        }),
      ],
    }).run();
    expect(params(graph).textList).toEqual([{ nodeId: 'text', content: ['真实正文'] }]);
    expect(params(graph).imageList).toEqual([
      {
        nodeId: 'character',
        url: 'https://reference',
        label: '人物状态',
        characterRef: { roleName: '人物状态', mainReferenceImageUrl: 'https://reference' },
      },
    ]);
  });
  it('rejects colliding factories or malformed graphs before accepting any partial graph', () => {
    const h = harness({
      selection: { images: ['https://public'], videos: [], audios: [] },
      makeNodeId: () => 'owner',
    });
    expect(h.run()).toBeNull();
    expect(h.args.nodes).toHaveLength(1);
    expect(h.args.edges).toEqual([]);
    expect(harness({ nodes: [owner(), owner()] }).run()).toBeNull();
    expect(harness({ schema: null }).run()).toBeNull();
    expect(harness({ selection: { images: null, videos: [], audios: [] } }).run()).toBeNull();
    expect(harness({ nodes: [{ ...owner(), position: { x: NaN, y: 0 } }] }).run()).toBeNull();
  });
});

describe('source flow placement and natural sizing', () => {
  it('uses natural aspect, source min side350, max side5600 and failure fallback', () => {
    expect(roleImageNodeDimensions({ width: 800, height: 1200 })).toEqual({
      width: 350,
      height: 525,
    });
    expect(roleImageNodeDimensions({ width: 90000, height: 1 })).toEqual({
      width: 5600,
      height: 350,
    });
    expect(roleImageNodeDimensions({ width: Infinity, height: 1 })).toEqual({
      width: 350,
      height: 350,
    });
    expect(roleImageNodeDimensions()).toEqual({ width: 350, height: 350 });
  });
  it('places equal new pictures in the closest free world flow, respecting source tie order', () => {
    const graph = harness({
      selection: { images: ['https://one', 'https://two'], videos: [], audios: [] },
    }).run();
    expect(find(graph, 'new-image-1').position).toEqual({ x: 550, y: 1000 });
    expect(find(graph, 'new-image-2').position).toEqual({ x: 550, y: 600 });
    expect(graph.nodes.slice(0, 2).map((node) => node.id)).toEqual(['new-image-2', 'new-image-1']);
  });
  it('uses world position for nested target image flow and avoids the parent box', () => {
    const parent = {
      id: 'parent',
      type: 'group',
      position: { x: 500, y: 400 },
      width: 300,
      height: 600,
      data: { type: 'group' },
    };
    const target = { ...owner(), parentId: parent.id, position: { x: 100, y: 100 } };
    const graph = harness({
      nodes: [parent, target],
      selection: { images: ['https://one'], videos: [], audios: [] },
    }).run();
    expect(find(graph, 'new-image-1').position).toEqual({ x: 100, y: 500 });
    expect(find(graph, 'new-image-1')).not.toHaveProperty('parentId');
    expect(find(graph, 'owner').position).toEqual({ x: 100, y: 100 });
  });
  it('VIDEO/AUDIO use source raw target coords followed by normal addNode overlap resolution', () => {
    const graph = harness({
      selection: { images: [], videos: ['asset://v'], audios: ['asset://a'] },
    }).run();
    expect(find(graph, 'new-video-1').position).toEqual({ x: 550, y: 1200 });
    expect(find(graph, 'new-audio-2').position).toEqual({ x: 550, y: 1600 });
    expect(find(graph, 'new-video-1')).not.toHaveProperty('width');
    expect(find(graph, 'new-audio-2')).not.toHaveProperty('measured');
  });
});

describe('reference deletion remapping versus isolated token reorder', () => {
  it('deletion removes invalid tokens using source whitespace behavior; magic/subject tokens stay raw', () => {
    const before = {
        imageList: [{ nodeId: 'gone' }, { nodeId: 'keep' }],
        mixedList: [],
        videoList: [],
        audioList: [],
      },
      after = { ...before, imageList: [{ nodeId: 'keep' }] };
    expect(
      remapRoleLibraryPrompt(
        'x\n {{Image 1}}  {{Image 2}} {{Magic m:1}} {{Element 2}}',
        before,
        after,
      ),
    ).toBe('x{{Image 1}} {{Magic m:1}} {{Element 2}}');
  });
  it('preserves byte-for-byte unchanged whitespace when no index is changed', () => {
    const refs = { imageList: [{ nodeId: 'same' }] };
    expect(remapRoleLibraryPrompt('  x\n\t{{Portrait 1}}    y  ', refs, refs)).toBe(
      '  x\n\t{{Portrait 1}}    y  ',
    );
  });
});
