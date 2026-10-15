import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectVideoClipIncomingData, resolveVideoClipIncomingPoster } from './incoming-model.js';
import {
  collectVideoClipIncomingSources,
  resolveVideoClipNodePresentation,
} from './node-presentation-model.js';

// Literal gold follows archived417754 /184656 /dN /244434 expressions. No
// production collector/planner computes expected graph or list contents.
const clip = { id: 'clip', type: 'video-clip', data: { type: 'video-clip' } };
const node = (id, type, data = {}, extra = {}) => ({ id, type, data: { type, ...data }, ...extra });
const edge = (source, data) => ({
  id: `${source}-clip`,
  source,
  target: 'clip',
  ...(data ? { data } : {}),
});
const video = (nodeId, url, label) => ({ nodeId, url, label });
const empty = { textList: [], imageList: [], videoList: [], audioList: [] };

describe('VideoClip incoming source contract and editor projection', () => {
  it('keeps edge order, duplicate ordinary edges, empty first URL, whitespace labels and actual first poster', () => {
    const pending = node('pending', 'video', {
      url: ['', '/second.mp4'],
      name: '  首项  ',
      poster: '/pending.jpg',
    });
    const ready = node('ready', 'video', {
      url: ['/ready.mp4'],
      label: 'Ready',
      poster: '/ready.jpg',
    });
    const ignored = node('ignored', 'video', { url: ['/ignored.mp4'] });
    const input = collectVideoClipIncomingData({
      node: clip,
      nodes: [ready, ignored, clip, pending],
      edges: [
        edge('pending'),
        edge('ready'),
        edge('pending'),
        edge('missing'),
        edge('ignored', { assetVirtual: true }),
      ],
    });
    expect(input).toEqual({
      ...empty,
      videoList: [
        video('pending', '', '  首项  '),
        video('ready', '/ready.mp4', 'Ready'),
        video('pending', '', '  首项  '),
      ],
    });
    expect(resolveVideoClipIncomingPoster({ incomingData: input, nodes: [ready, pending] })).toBe(
      '/pending.jpg',
    );
    expect(collectVideoClipIncomingSources(input)).toEqual({
      videoSourceNodeIds: ['pending', 'ready', 'pending'],
      audioSourceNodeIds: [],
      usableVideoSourceNodeIds: ['ready'],
      usableAudioSourceNodeIds: [],
      videoUrls: ['/ready.mp4'],
      audioUrls: [],
      videoDisplayNames: ['Ready'],
      audioDisplayNames: [],
    });
    expect(
      resolveVideoClipNodePresentation({
        nodeId: 'clip',
        data: clip.data,
        incomingData: input,
        nowMs: 0,
      }),
    ).toMatchObject({
      state: 'empty',
      firstVideoSourceNodeId: 'pending',
      firstVideoUrl: '',
      hasIncomingVideo: false,
      width: 350,
      height: 350,
    });
  });

  it('qualifies by data.type alone and does not turn video-clip/reference results into video inputs', () => {
    const raw = { id: 'raw', type: 'video', data: { url: ['/raw.mp4'] } };
    const mismatch = node('mismatch', 'image', { type: 'audio', url: ['/sound.mp3'] });
    const output = node('output', 'video-clip', { url: ['/compose.mp4'] });
    const reference = node('reference', 'reference', { url: ['/reference.mp4'] });
    expect(
      collectVideoClipIncomingData({
        node: clip,
        nodes: [clip, raw, mismatch, output, reference],
        edges: [edge('raw'), edge('output'), edge('reference'), edge('mismatch')],
      }),
    ).toEqual({
      ...empty,
      audioList: [video('mismatch', '/sound.mp3', undefined)],
    });
  });

  it('preserves four typed lists, text content and only first URL without media readiness filtering', () => {
    const nodes = [
      clip,
      node('text', 'text', { content: ['A', 2, '', null, 'B'] }),
      node('image', 'image', {
        url: ['data:image/png;base64,AAA'],
        originalUrl: ['blob:original'],
      }),
      node('video', 'video', { url: ['blob:video'], name: '视频' }),
      node('audio', 'audio', { url: [null, '/second.mp3'], label: '音频' }),
    ];
    expect(
      collectVideoClipIncomingData({
        node: clip,
        nodes,
        edges: [edge('audio'), edge('image'), edge('text'), edge('video')],
      }),
    ).toEqual({
      textList: [{ nodeId: 'text', content: ['A', '', 'B'] }],
      imageList: [video('image', 'blob:original', undefined)],
      videoList: [video('video', 'blob:video', '视频')],
      audioList: [video('audio', '', '音频')],
    });
  });

  it.each([
    ['plain', undefined, '/original.png'],
    ['watermark', 'watermark', '/display.png'],
    ['hidden', 'hidden', '/display.png'],
    ['unknown protection', 'other', '/original.png'],
  ])('keeps %s image URL preference', (_, protectionType, expected) => {
    const image = node('image', 'image', {
      url: ['/display.png'],
      originalUrl: ['/original.png'],
      protectionType,
    });
    expect(
      collectVideoClipIncomingData({ node: clip, nodes: [clip, image], edges: [edge('image')] }),
    ).toEqual({
      ...empty,
      imageList: [video('image', expected, undefined)],
    });
  });

  it('takes resource metadata only from first top-level item with matching media kind', () => {
    const v = node(
      'v',
      'video',
      {
        url: ['/v.mp4'],
        width: 900,
        height: 700,
        duration: 80,
        resourceMeta: { items: [{ kind: 'video', width: 999 }] },
      },
      {
        width: 566,
        measured: { width: 566, height: 350 },
        resourceMeta: {
          items: [
            { kind: 'video', durationSec: 0, width: 1920, height: null },
            { kind: 'video', height: 1080 },
          ],
        },
      },
    );
    const a = node(
      'a',
      'audio',
      { url: ['/a.mp3'] },
      {
        resourceMeta: {
          items: [
            { kind: 'video', durationSec: 5 },
            { kind: 'audio', durationSec: 9 },
          ],
        },
      },
    );
    const im = node(
      'im',
      'image',
      { url: ['/im.png'] },
      { resourceMeta: { items: [{ kind: 'image', width: 0, height: 42 }] } },
    );
    expect(
      collectVideoClipIncomingData({
        node: clip,
        nodes: [clip, v, a, im],
        edges: [edge('v'), edge('a'), edge('im')],
      }),
    ).toEqual({
      textList: [],
      imageList: [{ ...video('im', '/im.png', undefined), width: 0, height: 42 }],
      videoList: [{ ...video('v', '/v.mp4', undefined), durationSec: 0, width: 1920 }],
      audioList: [video('a', '/a.mp3', undefined)],
    });
  });

  it('retains media asset IDs and source compliance fields without borrowing video fields for audio', () => {
    const im = node(
      'im',
      'image',
      { url: ['/im.png'], portraitCompliantExempt: true, portraitComplianceCheckedAtMs: 10 },
      { createdAtMs: 20, createdAtMsIsLocalPlaceholder: true },
    );
    const v = node(
      'v',
      'video',
      {
        url: ['/v.mp4'],
        assetVideoAssetId: 'video-asset',
        portraitAssetId: 'portrait',
        assetVideoComplianceCheckedAtMs: 30,
      },
      { createdAtMs: 40, createdAtMsIsLocalPlaceholder: false },
    );
    const a = node(
      'a',
      'audio',
      {
        url: ['/a.mp3'],
        assetAudioAssetId: 'audio-asset',
        assetVideoCompliantExempt: true,
        portraitComplianceCheckedAtMs: 50,
      },
      { createdAtMs: 60 },
    );
    expect(
      collectVideoClipIncomingData({
        node: clip,
        nodes: [clip, im, v, a],
        edges: [edge('im'), edge('v'), edge('a')],
      }),
    ).toEqual({
      textList: [],
      imageList: [
        {
          ...video('im', '/im.png', undefined),
          compliantExempt: true,
          complianceCheckedAtMs: 10,
          sourceCreatedAtMs: 20,
          sourceCreatedAtMsIsLocalPlaceholder: true,
        },
      ],
      videoList: [
        {
          ...video('v', '/v.mp4', undefined),
          assetId: 'video-asset',
          complianceCheckedAtMs: 30,
          sourceCreatedAtMs: 40,
          sourceCreatedAtMsIsLocalPlaceholder: false,
        },
      ],
      audioList: [{ ...video('a', '/a.mp3', undefined), assetId: 'audio-asset' }],
    });
  });

  it('uses nullish asset precedence, leaving falsy selected IDs without falling back to portrait', () => {
    const v = node('v', 'video', {
      assetVideoAssetId: '',
      portraitAssetId: 'fallback',
      assetVideoCompliantExempt: true,
    });
    const a = node('a', 'audio', { assetAudioAssetId: 0, portraitAssetId: 'fallback' });
    expect(
      collectVideoClipIncomingData({
        node: clip,
        nodes: [clip, v, a],
        edges: [edge('v'), edge('a')],
      }),
    ).toEqual({
      ...empty,
      videoList: [
        {
          ...video('v', '', undefined),
          compliantExempt: true,
          complianceCheckedAtMs: undefined,
          sourceCreatedAtMs: undefined,
          sourceCreatedAtMsIsLocalPlaceholder: undefined,
        },
      ],
      audioList: [video('a', '', undefined)],
    });
  });

  it('trims video subtitles and accepts only first finite positive typed transition', () => {
    const v = node('v', 'video', {
      url: ['/v.mp4'],
      subtitleUrl: ' /v.vtt ',
      subtitleHtmlUrl: ' /v.html ',
      transitions: [
        null,
        { type: ' ', duration: 1 },
        { type: 'bad', duration: '1' },
        { type: 'bad', duration: Infinity },
        { type: ' dissolve ', duration: 0.5 },
        { type: 'wipe', duration: 2 },
      ],
    });
    expect(
      collectVideoClipIncomingData({ node: clip, nodes: [clip, v], edges: [edge('v')] }),
    ).toEqual({
      ...empty,
      videoList: [
        {
          ...video('v', '/v.mp4', undefined),
          subtitleUrl: '/v.vtt',
          subtitleHtmlUrl: '/v.html',
          transition: { type: 'dissolve', duration: 0.5 },
        },
      ],
    });
  });

  it('does not use transitions fallback when a non-null transition array is empty', () => {
    const v = node('v', 'video', {
      transition: [],
      transitions: [{ type: 'wipe', duration: 1 }],
      subtitleUrl: ' ',
      subtitleHtmlUrl: 7,
    });
    expect(
      collectVideoClipIncomingData({ node: clip, nodes: [clip, v], edges: [edge('v')] }),
    ).toEqual({ ...empty, videoList: [video('v', '', undefined)] });
  });

  it('appends all edge character references then refImages and applies focus filter only to images', () => {
    const target = {
      ...clip,
      data: {
        ...clip.data,
        refImages: ['', '/target.png'],
        params: { focusRegion: { nodeId: 'v' } },
      },
    };
    const reference = { mainReferenceImageUrl: '/character.png', roleName: '角色' };
    const v = node('v', 'video', { url: ['/v.mp4'] });
    const im = node('im', 'image', { url: ['/im.png'] });
    expect(
      collectVideoClipIncomingData({
        node: target,
        nodes: [target, v, im],
        edges: [
          edge('v', { characterRef: reference }),
          edge('im'),
          edge('missing', {
            portraitVirtual: true,
            characterRef: { mainReferenceImageUrl: '/virtual.png' },
          }),
        ],
      }),
    ).toEqual({
      textList: [],
      imageList: [
        video('im', '/im.png', undefined),
        {
          nodeId: 'missing',
          url: '/virtual.png',
          label: undefined,
          characterRef: { mainReferenceImageUrl: '/virtual.png' },
        },
        { nodeId: 'clip:ref-0', url: '' },
        { nodeId: 'clip:ref-1', url: '/target.png' },
      ],
      videoList: [video('v', '/v.mp4', undefined)],
      audioList: [],
    });
  });

  it('ignores unrelated edge references and ordinary source URLs behind virtual edges', () => {
    const v = node('v', 'video', { url: ['/v.mp4'] });
    expect(
      collectVideoClipIncomingData({
        node: clip,
        nodes: [clip, v],
        edges: [
          edge('v', { portraitVirtual: true }),
          edge('v', { assetVirtual: 1 }),
          {
            source: 'v',
            target: 'other',
            data: { characterRef: { mainReferenceImageUrl: '/unrelated.png' } },
          },
        ],
      }),
    ).toEqual(empty);
  });

  it('normalizes text strings and arrays without creating content from params or URL', () => {
    const nodes = [
      clip,
      node('a', 'text', { content: ' 原文 ' }),
      node('b', 'text', { content: '' }),
      node('c', 'text', { url: ['/text.txt'], params: { textList: [{ content: ['cached'] }] } }),
      node('d', 'text', { content: ['', 'x', 0, false] }),
    ];
    expect(
      collectVideoClipIncomingData({
        node: clip,
        nodes,
        edges: [edge('a'), edge('b'), edge('c'), edge('d')],
      }),
    ).toEqual({
      ...empty,
      textList: [
        { nodeId: 'a', content: [' 原文 '] },
        { nodeId: 'b', content: [] },
        { nodeId: 'c', content: [] },
        { nodeId: 'd', content: ['', 'x'] },
      ],
    });
  });

  it('preserves original first-index behavior for a string URL instead of normalizing it to an array', () => {
    const v = node('v', 'video', { url: 'raw-string' });
    expect(
      collectVideoClipIncomingData({ node: clip, nodes: [clip, v], edges: [edge('v')] }),
    ).toEqual({ ...empty, videoList: [video('v', 'r', undefined)] });
  });
});

describe('VideoClip group expansion order and exclusions', () => {
  it('uses parentId/node order, depth first, rather than childNodeIds/positions/creation times', () => {
    const target = { ...clip, data: { ...clip.data, groupRefExcludedNodeIds: ['excluded', 8] } };
    const group = node('g', 'group', { childNodeIds: ['late', 'first'] });
    const subgroup = node('sub', 'video_group', {}, { parentId: 'g' });
    const late = node(
      'late',
      'video',
      { url: ['/late.mp4'] },
      { parentId: 'g', createdAtMs: 0, position: { x: -999, y: -999 } },
    );
    const inner = node('inner', 'video', { url: ['/inner.mp4'] }, { parentId: 'sub' });
    const first = node(
      'first',
      'video',
      { url: ['/first.mp4'] },
      { parentId: 'g', createdAtMs: 1000 },
    );
    const excluded = node('excluded', 'audio', { url: ['/excluded.mp3'] }, { parentId: 'sub' });
    const direct = node('direct', 'audio', { url: ['/direct.mp3'] });
    expect(
      collectVideoClipIncomingData({
        node: target,
        nodes: [target, group, subgroup, inner, first, excluded, late, direct],
        edges: [edge('g'), edge('direct'), edge('inner')],
      }),
    ).toEqual({
      ...empty,
      videoList: [
        video('inner', '/inner.mp4', undefined),
        video('first', '/first.mp4', undefined),
        video('late', '/late.mp4', undefined),
      ],
      audioList: [video('direct', '/direct.mp3', undefined)],
    });
  });

  it('excludes only descendant visits, and an excluded descendant cannot be reintroduced by a later direct edge', () => {
    const target = { ...clip, data: { ...clip.data, groupRefExcludedNodeIds: ['v'] } };
    const g = node('g', 'video-story');
    const v = node('v', 'video', { url: ['/v.mp4'] }, { parentId: 'g' });
    const nodes = [target, g, v];
    expect(
      collectVideoClipIncomingData({ node: target, nodes, edges: [edge('g'), edge('v')] }),
    ).toEqual(empty);
    expect(
      collectVideoClipIncomingData({ node: target, nodes, edges: [edge('v'), edge('g')] }),
    ).toEqual({ ...empty, videoList: [video('v', '/v.mp4', undefined)] });
    expect(
      collectVideoClipIncomingData({ node: target, nodes, edges: [edge('v'), edge('v')] }),
    ).toEqual({
      ...empty,
      videoList: [video('v', '/v.mp4', undefined), video('v', '/v.mp4', undefined)],
    });
  });

  it('does not expand character-asset groups or missing data.type groups', () => {
    const character = node('character', 'group', { characterAsset: {} });
    const old = { id: 'old', type: 'group', data: {} };
    const a = node('a', 'video', { url: ['/a.mp4'] }, { parentId: 'character' });
    const b = node('b', 'video', { url: ['/b.mp4'] }, { parentId: 'old' });
    expect(
      collectVideoClipIncomingData({
        node: clip,
        nodes: [clip, character, old, a, b],
        edges: [edge('character'), edge('old')],
      }),
    ).toEqual(empty);
  });

  it('includes a leaf at depth8 but stops expanding groups at depth8, and handles parent cycles', () => {
    const groups = Array.from({ length: 9 }, (_, depth) =>
      node(`g${depth}`, 'group', {}, depth ? { parentId: `g${depth - 1}` } : {}),
    );
    const allowed = node('depth8', 'video', { url: ['/depth8.mp4'] }, { parentId: 'g7' });
    const denied = node('depth9', 'video', { url: ['/depth9.mp4'] }, { parentId: 'g8' });
    const cycleA = node('cycle-a', 'group', {}, { parentId: 'cycle-b' });
    const cycleB = node('cycle-b', 'group', {}, { parentId: 'cycle-a' });
    expect(
      collectVideoClipIncomingData({
        node: clip,
        nodes: [clip, ...groups, allowed, denied, cycleA, cycleB],
        edges: [edge('g0'), edge('cycle-a')],
      }),
    ).toEqual({ ...empty, videoList: [video('depth8', '/depth8.mp4', undefined)] });
  });
});

describe('VideoClip collector ownership and archived evidence', () => {
  it('uses target data from the graph and leaves all node/edge fields unchanged', () => {
    const target = { ...clip, data: { ...clip.data, refImages: ['/current.png'] } };
    const oldTarget = { ...target, data: { ...target.data, refImages: ['/old.png'] } };
    const v = node(
      'v',
      'video',
      { url: ['/v.mp4'], poster: '/v.jpg' },
      { resourceMeta: { items: [{ kind: 'video', durationSec: 3 }] } },
    );
    const nodes = [target, v],
      edges = [edge('v')];
    const before = structuredClone({ nodes, edges });
    expect(collectVideoClipIncomingData({ node: oldTarget, nodes, edges })).toEqual({
      ...empty,
      imageList: [{ nodeId: 'clip:ref-0', url: '/current.png' }],
      videoList: [{ ...video('v', '/v.mp4', undefined), durationSec: 3 }],
    });
    expect({ nodes, edges }).toEqual(before);
    expect(collectVideoClipIncomingData({ node: { id: 'clip' }, nodes: [v], edges })).toEqual({
      ...empty,
      videoList: [{ ...video('v', '/v.mp4', undefined), durationSec: 3 }],
    });
  });

  it('returns undefined for an absent first source poster rather than scanning a later source', () => {
    const first = node('first', 'video');
    const second = node('second', 'video', { poster: '/second.jpg' });
    expect(
      resolveVideoClipIncomingPoster({
        incomingData: {
          videoList: [video('first', '', undefined), video('second', '/second.mp4', undefined)],
        },
        nodes: [first, second],
      }),
    ).toBeUndefined();
    expect(
      resolveVideoClipIncomingPoster({ incomingData: { videoList: [] }, nodes: [second] }),
    ).toBeUndefined();
  });

  it('retains lexicographically first linked director studio and its typed auxiliary data', () => {
    const z = node('z', 'director-studio', {
      studioDimensions: { genre: 'thriller' },
      cameraControl: { move: 'pan' },
    });
    const a = node('a', 'director-studio', {
      directorStudio: {
        narrative: { genre: 'general', rhythm: 'fast' },
        visualStyle: { colorPalette: 'blue', styling: 'modern', lighting: 'soft' },
        cinematography: { cameraControl: { move: 'orbit' } },
      },
      cameraPresets: [{ prompt: '推近' }],
    });
    expect(
      collectVideoClipIncomingData({
        node: clip,
        nodes: [clip, z, a],
        edges: [edge('z'), edge('a')],
      }),
    ).toEqual({
      ...empty,
      directorStudio: {
        studioDimensions: {
          rhythm: 'fast',
          colorStyle: 'blue',
          costumeEra: 'modern',
          lighting: 'soft',
        },
        cameraControl: { move: 'orbit' },
        cameraPresets: [{ prompt: '推近' }],
      },
    });
  });

  it('keeps direct studioDimensions and nullish camera override without rewriting graph metadata', () => {
    const studio = node('studio', 'director-studio', {
      studioDimensions: { genre: 'general', colorStyle: 'red' },
      cameraControl: false,
      directorStudio: { cinematography: { cameraControl: { move: 'orbit' } } },
    });
    expect(
      collectVideoClipIncomingData({ node: clip, nodes: [clip, studio], edges: [edge('studio')] }),
    ).toEqual({
      ...empty,
      directorStudio: { studioDimensions: { genre: 'general', colorStyle: 'red' } },
    });
  });

  it('reads the representative public chat graph rather than cached params or saved timeline arrays', () => {
    const snapshot = JSON.parse(readFileSync('public/data/chat-shares.json', 'utf8')).HHcwG6xmqD
      .snapshot;
    const target = snapshot.nodes.find((entry) => entry.id === 'v-9kwv7gcek6u8');
    expect(target).toBeDefined();
    const before = JSON.stringify(snapshot);
    expect(
      collectVideoClipIncomingData({ node: target, nodes: snapshot.nodes, edges: snapshot.edges }),
    ).toEqual({
      textList: [],
      imageList: [],
      videoList: [
        {
          nodeId: 'v-jyp9gn9mqfjf',
          url: '/assets/5d038d9959cc9a1a.mp4',
          label: '视频3-字幕',
          subtitleUrl:
            'https://libtv-res.liblib.art/agent-subtitle/69efac5c-1a16-47d5-b3ba-f18207127dba.vtt',
        },
      ],
      audioList: [
        {
          nodeId: 'a-duvh3e5m9b92',
          url: 'https://libtv-res.liblib.art/sd-gen-save-img/genius_playground/audio/beda8103d1a8414aa15aa0eb1db95a07/eb0ef56cbf5565f76cc9fd62a8049a3bb299eadfacb896342a135d8293fb9d73.mp3',
          label: 'BGM · The Right Compartment（韦氏风格）',
        },
      ],
    });
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
