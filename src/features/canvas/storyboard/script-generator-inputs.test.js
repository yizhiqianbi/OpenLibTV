import { describe, expect, it, vi } from 'vitest';
import {
  collectScriptV2GeneratorInputs,
  expandScriptV2GeneratorSources,
  scriptV2GeneratorInputIdentity,
} from './script-generator-inputs.js';

const node = (id, type, data = {}, extra = {}) => ({ id, type, data: { type, ...data }, ...extra });
const target = (data = {}) => node('script', 'script-v2', data);
const edge = (source, extra = {}) => ({ id: `edge-${source}`, source, target: 'script', ...extra });
const input = (sources, edges = sources.map((source) => edge(source.id)), data = {}) => {
  const script = target(data);
  return collectScriptV2GeneratorInputs({ node: script, nodes: [script, ...sources], edges });
};

describe('417754 source collector and explicit local text adapter', () => {
  it.each([
    ['full text', ['full text']],
    ['', []],
    [
      ['', 'story', 10],
      ['', 'story'],
    ],
    [null, []],
    [5, []],
  ])('normalizes source TEXT content without trimming or joining: %j', (content, expected) => {
    expect(input([node('text', 'text', { content })]).incoming.textList).toEqual([
      { nodeId: 'text', content: expected },
    ]);
  });

  it.each([
    ['fresh text', ['fresh text']],
    ['', []],
  ])(
    'uses explicit local data.text instead of stale content, including a clear: %j',
    (text, expected) => {
      const textNode = node('text', 'text', {
        content: ['old source story'],
        text,
        params: { prompt: 'unrelated old prompt' },
      });
      expect(input([textNode]).incoming.textList[0].content).toEqual(expected);
      const script = target();
      expect(
        collectScriptV2GeneratorInputs({
          node: script,
          nodes: [script, textNode],
          edges: [edge('text')],
          localTextOverrides: false,
        }).incoming.textList[0].content,
      ).toEqual(['old source story']);
    },
  );

  it('uses incoming edge order, retaining duplicate ordinary direct edges', () => {
    const a = node('a', 'image', { url: ['/a'] }),
      b = node('b', 'image', { url: ['/b'] });
    expect(
      input([a, b], [edge('b'), edge('a'), edge('b', { id: 'second-b' })]).incoming.imageList.map(
        (ref) => ref.nodeId,
      ),
    ).toEqual(['b', 'a', 'b']);
  });

  it('ignores REFERENCE and a node lacking data.type rather than manufacturing text input', () => {
    expect(
      input([
        node('ref', 'reference', { url: ['/ref'] }),
        { id: 'raw', type: 'text', data: { content: ['not declared'] } },
      ]).incoming.textList,
    ).toEqual([]);
  });

  it.each(['portraitVirtual', 'assetVirtual'])(
    'excludes virtual root edges but still appends their explicit character reference: %s',
    (flag) => {
      const data = {
        [flag]: true,
        characterRef: { mainReferenceImageUrl: '/character', roleName: '角色' },
      };
      expect(
        input([node('img', 'image', { url: ['/ordinary'] })], [edge('img', { data })]).incoming
          .imageList,
      ).toEqual([
        { nodeId: 'img', url: '/character', label: '角色', characterRef: data.characterRef },
      ]);
    },
  );

  it('appends target refImages then removes focusRegion by node identity without removing another same-URL node', () => {
    const result = input(
      [node('a', 'image', { url: ['/shared'] }), node('b', 'image', { url: ['/shared'] })],
      undefined,
      {
        refImages: ['/local'],
        params: { focusRegion: { nodeId: 'a' }, imageList: [{ nodeId: 'stale', url: '/stale' }] },
      },
    );
    expect(result.incoming.imageList.map((ref) => [ref.nodeId, ref.url])).toEqual([
      ['b', '/shared'],
      ['script:ref-0', '/local'],
    ]);
  });

  it.each([undefined, 'hidden', 'watermark'])(
    'retains protection-aware originalUrl selection and strict index0: %j',
    (protectionType) => {
      const result = input([
        node('image', 'image', {
          url: ['', '/later'],
          originalUrl: ['/original', '/second'],
          protectionType,
          name: 'name',
          label: 'label',
        }),
      ]);
      expect(result.incoming.imageList[0]).toEqual({
        nodeId: 'image',
        url: protectionType ? '' : '/original',
        label: 'name',
      });
    },
  );

  it('takes only first matching-kind resourceMeta item, preserving source zero metadata and portrait proof', () => {
    const image = node(
      'img',
      'image',
      { url: ['/img'], portraitAssetId: 'portrait', portraitComplianceCheckedAtMs: 5 },
      {
        createdAtMs: 10,
        createdAtMsIsLocalPlaceholder: true,
        resourceMeta: {
          items: [
            { kind: 'image', width: 0, height: 600 },
            { kind: 'image', width: 800 },
          ],
        },
      },
    );
    expect(input([image]).incoming.imageList[0]).toEqual({
      nodeId: 'img',
      url: '/img',
      label: undefined,
      width: 0,
      height: 600,
      assetId: 'portrait',
      complianceCheckedAtMs: 5,
      sourceCreatedAtMs: 10,
      sourceCreatedAtMsIsLocalPlaceholder: true,
    });
    image.resourceMeta.items[0].kind = 'video';
    expect(input([image]).incoming.imageList[0]).not.toHaveProperty('width');
  });

  it('retains current video/audio resource metadata, proof, subtitles and first valid transition', () => {
    const video = node(
      'video',
      'video',
      {
        url: ['/video'],
        assetVideoCompliantExempt: true,
        assetVideoComplianceCheckedAtMs: 7,
        subtitleUrl: ' /captions ',
        subtitleHtmlUrl: ' /html ',
        transitions: [
          { type: '', duration: 1 },
          { type: ' fade ', duration: 0.5 },
        ],
      },
      {
        createdAtMs: 12,
        resourceMeta: { items: [{ kind: 'video', durationSec: 4, width: 100, height: 50 }] },
      },
    );
    const audio = node(
      'audio',
      'audio',
      { url: ['/audio'], assetAudioAssetId: 'audio-asset', portraitAssetId: 'other' },
      { resourceMeta: { items: [{ kind: 'audio', durationSec: 8 }] } },
    );
    const result = input([video, audio]).incoming;
    expect(result.videoList[0]).toMatchObject({
      url: '/video',
      durationSec: 4,
      width: 100,
      height: 50,
      compliantExempt: true,
      complianceCheckedAtMs: 7,
      sourceCreatedAtMs: 12,
      subtitleUrl: '/captions',
      subtitleHtmlUrl: '/html',
      transition: { type: 'fade', duration: 0.5 },
    });
    expect(result.audioList[0]).toEqual({
      nodeId: 'audio',
      url: '/audio',
      label: undefined,
      durationSec: 8,
      assetId: 'audio-asset',
    });
  });

  it('does not filter pending, blank, blob or data references or reuse stored params as incoming', () => {
    const refs = [
      node('blank', 'image', { url: [], status: 'pending' }),
      node('blob', 'image', { url: ['blob:local'], uploading: true }),
      node('data', 'audio', { url: ['data:audio'] }),
    ];
    const result = input(refs, undefined, {
      params: { imageList: [{ nodeId: 'stale', url: '/stale' }] },
    });
    expect(result.incoming.imageList.map((ref) => ref.url)).toEqual(['', 'blob:local']);
    expect(result.incoming.audioList[0].url).toBe('data:audio');
  });
});

describe('source ordinary group expansion', () => {
  it('expands actual parent membership in graph order, excludes only descendants, and deduplicates once a group exists', () => {
    const group = node('group', 'group', { childNodeIds: ['wrong-order', 'a'] }),
      a = node('a', 'text', { content: ['a'] }, { parentId: 'group' }),
      b = node('b', 'image', { url: [] }, { parentId: 'group' });
    const result = input([group, b, a], [edge('group'), edge('a'), edge('a', { id: 'again' })], {
      groupRefExcludedNodeIds: ['a'],
    });
    expect(result.incoming.imageList.map((ref) => ref.nodeId)).toEqual(['b']);
    expect(result.incoming.textList).toEqual([]); // excluded visit marks a seen before the later direct edge
    expect(
      input([group, b, a], [edge('a'), edge('group')], { groupRefExcludedNodeIds: ['a'] }).incoming
        .textList[0].nodeId,
    ).toBe('a');
  });

  it.each(['group', 'video_group', 'video-story'])(
    'expands source group kind %s without URL/type filtering',
    (type) => {
      const group = node('group', type),
        child = node('child', 'reference', {}, { parentId: 'group' });
      expect(expandScriptV2GeneratorSources([group], [group, child])).toEqual([child]);
    },
  );

  it('does not turn a characterAsset group into a synthesized image', () => {
    const group = node('group', 'group', {
      characterAsset: { states: [{ id: 'state', mainReferenceImageUrl: '/invented' }] },
    });
    const child = node('child', 'image', { url: ['/real'] }, { parentId: 'group' });
    expect(input([group, child], [edge('group')]).incoming.imageList).toEqual([]);
  });

  it('caps nested group expansion at depth8 and terminates cycles', () => {
    const groups = Array.from({ length: 9 }, (_, index) =>
      node(`g${index}`, 'group', {}, index ? { parentId: `g${index - 1}` } : {}),
    );
    const child = node('child', 'text', { content: ['deep'] }, { parentId: 'g8' });
    expect(input([...groups, child], [edge('g0')]).incoming.textList).toEqual([]);
    groups[0].parentId = 'g8';
    expect(expandScriptV2GeneratorSources([groups[0]], groups)).toEqual([]);
  });

  it('keeps the lowest director-studio ID metadata independently of text/media lists', () => {
    const b = node('b', 'director-studio', {
      studioDimensions: { genre: 'drama' },
      cameraControl: { pan: 1 },
    });
    const a = node('a', 'director-studio', {
      directorStudio: {
        narrative: { genre: 'general', rhythm: 'fast' },
        visualStyle: { colorPalette: 'warm' },
      },
      cameraPresets: [{ prompt: 'camera' }],
    });
    expect(input([b, a]).incoming.directorStudio).toEqual({
      studioDimensions: { rhythm: 'fast', colorStyle: 'warm' },
      cameraPresets: a.data.cameraPresets,
    });
  });
});

describe('pure input safety and identity', () => {
  it.each([
    { nodes: null },
    { edges: null },
    { nodes: [null] },
    { nodes: [target(), target()] },
    { edges: [null] },
    { nodes: [] },
  ])('rejects malformed graph atomically: %j', (context) => {
    const result = collectScriptV2GeneratorInputs({
      node: target(),
      nodes: [target()],
      edges: [],
      ...context,
    });
    expect(result.valid).toBe(false);
    expect(result.incoming).toEqual({ textList: [], imageList: [], videoList: [], audioList: [] });
  });

  it('does not mutate or serialize large media values while deriving input identity', () => {
    const toJSON = vi.fn(() => {
      throw new Error('unexpected serialization');
    });
    const url = 'data:large-reference';
    const sources = Object.freeze([node('a', 'image', { url: Object.freeze([url]), toJSON })]);
    const incoming = input(sources).incoming,
      identity = scriptV2GeneratorInputIdentity(incoming);
    expect(identity[1][1][0].url).toBe(url);
    expect(toJSON).not.toHaveBeenCalled();
    expect(sources[0].data.url).toEqual([url]);
  });
});
