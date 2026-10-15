import { describe, expect, it } from 'vitest';
import { createFilmDocument, createFilmNode } from './document.ts';
import { resolveFilmInheritedBackground } from './presentation.ts';
import type { FilmDocument, FilmKind, FilmMedia, FilmNode } from './types.ts';

const video: FilmMedia = {
  id: 'video',
  name: '真实片段',
  type: 'video',
  mimeType: 'video/mp4',
  bytes: 100,
  duration: 20,
  width: 1920,
  height: 1080,
};
const image: FilmMedia = {
  id: 'image',
  name: '背景图',
  type: 'image',
  mimeType: 'image/png',
  bytes: 50,
  width: 640,
  height: 480,
};
function node(kind: FilmKind, id: string, patch: Partial<FilmNode> = {}): FilmNode {
  return { ...createFilmNode(kind), id, ...patch };
}
function fixture(nodes: FilmNode[], edges: [string, string, string?][]): FilmDocument {
  const doc = createFilmDocument('inherited-background', '继承背景');
  doc.nodes[0].id = 'start';
  doc.nodes.push(...nodes);
  doc.media = [video, image];
  doc.edges = edges.map(([source, target, sourcePort = 'next'], index) => ({
    id: `edge-${index}`,
    source,
    target,
    sourcePort,
  }));
  return doc;
}
const played = (id = 'play', patch: Partial<FilmNode> = {}) =>
  node('play', id, { mediaId: video.id, trimIn: 2, trimOut: 8, ...patch });

describe('inherited film background presentation', () => {
  it('walks logic and inherited interactions back to the last actual visual cut without changing the document', () => {
    const doc = fixture(
      [
        played(),
        node('set', 'set', { mediaId: image.id }),
        node('condition', 'condition'),
        node('choice', 'choice'),
        node('qte', 'qte'),
        node('hotspot', 'target'),
      ],
      [
        ['start', 'play'],
        ['play', 'set'],
        ['set', 'condition'],
        ['condition', 'choice', 'yes'],
        ['condition', 'qte', 'no'],
        ['choice', 'target', 'option'],
        ['qte', 'target', 'success'],
      ],
    );
    doc.nodes.find((value) => value.id === 'choice')!.choices = [{ id: 'option', text: '继续' }];
    const previous = structuredClone(doc);
    expect(resolveFilmInheritedBackground(doc, 'target')).toEqual({ media: video, frameTime: 8 });
    expect(doc).toEqual(previous);
    expect(doc.nodes.find((value) => value.id === 'target')!.mediaId).toBeUndefined();
  });

  it('merges equal image backgrounds independent of display durations and returns no frame time', () => {
    const doc = fixture(
      [
        node('condition', 'branch'),
        played('a', { mediaId: image.id, displaySeconds: 2 }),
        played('b', { mediaId: image.id, displaySeconds: 5 }),
        node('hotspot', 'target'),
      ],
      [
        ['start', 'branch'],
        ['branch', 'a', 'yes'],
        ['branch', 'b', 'no'],
        ['a', 'target'],
        ['b', 'target'],
      ],
    );
    expect(resolveFilmInheritedBackground(doc, 'target')).toEqual({ media: image });
  });

  it.each([
    {
      label: 'equal media and cut',
      patch: { trimIn: 4 },
      expected: { media: video, frameTime: 8 },
    },
    { label: 'different cuts', patch: { trimOut: 9 }, expected: undefined },
    { label: 'different media', patch: { mediaId: image.id }, expected: undefined },
  ])('handles multiple reachable predecessors with $label', ({ patch, expected }) => {
    const doc = fixture(
      [node('condition', 'branch'), played('a'), played('b', patch), node('hotspot', 'target')],
      [
        ['start', 'branch'],
        ['branch', 'a', 'yes'],
        ['branch', 'b', 'no'],
        ['a', 'target'],
        ['b', 'target'],
      ],
    );
    expect(resolveFilmInheritedBackground(doc, 'target')).toEqual(expected);
  });

  it('ignores unreachable foreign backgrounds but rejects a reachable route without any frame', () => {
    const doc = fixture(
      [played(), played('orphan', { mediaId: image.id }), node('hotspot', 'target')],
      [
        ['start', 'play'],
        ['play', 'target'],
        ['orphan', 'target'],
      ],
    );
    expect(resolveFilmInheritedBackground(doc, 'target')).toEqual({ media: video, frameTime: 8 });
    doc.edges.push({ id: 'blank', source: 'start', sourcePort: 'next', target: 'target' });
    expect(resolveFilmInheritedBackground(doc, 'target')).toBeUndefined();
  });

  it.each(['audio', 'missing', 'unknown-duration', 'invalid-trim'])(
    'does not invent a frame for %s',
    (kind) => {
      const doc = fixture(
        [played(), played('bad'), node('hotspot', 'target')],
        [
          ['start', 'play'],
          ['play', 'bad'],
          ['bad', 'target'],
        ],
      );
      if (kind === 'audio') doc.media[0] = { ...video, type: 'audio', mimeType: 'audio/mpeg' };
      if (kind === 'missing') doc.nodes.find((value) => value.id === 'bad')!.mediaId = 'unknown';
      if (kind === 'unknown-duration') doc.media[0] = { ...video, duration: undefined };
      if (kind === 'invalid-trim') doc.nodes.find((value) => value.id === 'bad')!.trimOut = 30;
      expect(resolveFilmInheritedBackground(doc, 'target')).toBeUndefined();
    },
  );

  it('uses real duration when a video play has no explicit end', () => {
    const doc = fixture(
      [played('play', { trimOut: undefined }), node('hotspot', 'target')],
      [
        ['start', 'play'],
        ['play', 'target'],
      ],
    );
    expect(resolveFilmInheritedBackground(doc, 'target')).toEqual({ media: video, frameTime: 20 });
  });

  it('does not invent a choice success frame while users may select during video playback', () => {
    const choice = node('choice', 'choice', {
      mediaId: video.id,
      trimIn: 2,
      trimOut: 10,
      windowStart: 3,
      choices: [{ id: 'pick', text: '选择' }],
    });
    const doc = fixture(
      [choice, node('hotspot', 'target')],
      [
        ['start', 'choice'],
        ['choice', 'target', 'pick'],
      ],
    );
    expect(resolveFilmInheritedBackground(doc, 'target')).toBeUndefined();
    choice.windowEnd = 4;
    expect(resolveFilmInheritedBackground(doc, 'target')).toBeUndefined();
  });

  it.each([
    { label: 'before the clip ends', trimOut: 10, deadline: 3, expected: 5 },
    { label: 'after the clip ends', trimOut: 10, deadline: 12, expected: 10 },
    { label: 'after the actual video duration', trimOut: undefined, deadline: 30, expected: 20 },
  ])('uses the deterministic choice deadline frame $label', ({ trimOut, deadline, expected }) => {
    const choice = node('choice', 'choice', {
      mediaId: video.id,
      trimIn: 2,
      trimOut,
      windowStart: 1,
      windowEnd: deadline,
    });
    const doc = fixture(
      [choice, node('hotspot', 'target')],
      [
        ['start', 'choice'],
        ['choice', 'target', 'timeout'],
      ],
    );
    expect(resolveFilmInheritedBackground(doc, 'target')).toEqual({
      media: video,
      frameTime: expected,
    });
  });

  it.each(['hotspot', 'qte'] as const)(
    'resolves only the deterministic timeout cut for own-video %s',
    (kind) => {
      const interaction = node(kind, 'interaction', {
        mediaId: video.id,
        trimIn: 2,
        trimOut: 10,
        windowStart: 1,
        windowEnd: 4,
      });
      const doc = fixture(
        [interaction, node('hotspot', 'target')],
        [
          ['start', 'interaction'],
          ['interaction', 'target', 'failure'],
        ],
      );
      expect(resolveFilmInheritedBackground(doc, 'target')).toEqual({ media: video, frameTime: 6 });
      doc.edges[1].sourcePort = 'success';
      expect(resolveFilmInheritedBackground(doc, 'target')).toBeUndefined();
    },
  );

  it('rejects inherited cycles but preserves a shared ancestor in a diamond', () => {
    const doc = fixture(
      [played(), node('set', 'a'), node('condition', 'b'), node('hotspot', 'target')],
      [
        ['start', 'play'],
        ['play', 'a'],
        ['a', 'b'],
        ['b', 'a', 'yes'],
        ['b', 'target', 'no'],
      ],
    );
    expect(resolveFilmInheritedBackground(doc, 'target')).toBeUndefined();
    doc.edges = doc.edges.filter((edge) => edge.target !== 'a' || edge.source !== 'b');
    doc.edges.push({ id: 'diamond', source: 'a', sourcePort: 'next', target: 'target' });
    expect(resolveFilmInheritedBackground(doc, 'target')).toEqual({ media: video, frameTime: 8 });
  });

  it('requires a reachable inheriting target and an unambiguous start identity', () => {
    const doc = fixture(
      [played(), node('hotspot', 'target')],
      [
        ['start', 'play'],
        ['play', 'target'],
      ],
    );
    expect(resolveFilmInheritedBackground(doc, 'missing')).toBeUndefined();
    doc.nodes[2].mediaId = image.id;
    expect(resolveFilmInheritedBackground(doc, 'target')).toBeUndefined();
    delete doc.nodes[2].mediaId;
    doc.nodes.push(node('start', 'other-start'));
    expect(resolveFilmInheritedBackground(doc, 'target')).toBeUndefined();
  });
});
