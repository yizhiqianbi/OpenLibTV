import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { archiveHtmlSubtitle } from './subtitle-archive.js';
import { createSubtitleHtml, readSubtitleHtml } from './html-document.js';
import { materializeHtmlSubtitles } from './subtitle-materialization.js';
import { htmlSubtitleLoadPlan } from '../domain/html-subtitle-sources.js';
import { placeHtmlSubtitleCue, subtitleDocumentId } from '../domain/html-subtitle-model.js';

const clip = (id, sourceOffset, duration, startTime = 0) => ({
  id,
  sourceNodeId: 'video',
  type: 'video',
  startTime,
  sourceOffset,
  duration,
  speed: 1,
});
const html = (
  cues = [{ cueId: 'library', start: 1, duration: 4, trackIndex: 0, text: '跨片段字幕\nEnglish' }],
) => createSubtitleHtml({ compositionId: 'sub', width: 1920, height: 1080, duration: 10, cues });

describe('HTML subtitle canonical archive and source preparation', () => {
  it('writes source archive hashes and UTF-8 bytes exactly without runtime objects', () => {
    const value = html(),
      key = subtitleDocumentId('video', 'clip:a');
    const archive = archiveHtmlSubtitle({ html: value, key, nodeId: 'video', savedAt: 123 });
    expect(archive).toMatchObject({
      contractVersion: 4,
      origin: 'libtv',
      htmlInline: value,
      htmlHash: createHash('sha256').update(value).digest('hex').slice(0, 16),
      htmlBytes: Buffer.byteLength(value),
      timeBase: 'source',
      sourceNodeId: 'video',
      documentId: key,
      trackVisible: true,
      trackCount: 1,
      savedAt: 123,
    });
    expect(JSON.parse(JSON.stringify(archive))).toEqual(archive);
    expect(
      archiveHtmlSubtitle({ html: html([]), key, nodeId: 'video', savedAt: 124 }).userCleared,
    ).toBe(true);
    expect(() =>
      archiveHtmlSubtitle({ html: '中'.repeat(700000), key, nodeId: 'video', savedAt: 124 }),
    ).toThrow('本地可恢复上限');
  });

  it('materializes complete library cues per opening clip, retains the first ID and derives subsequent IDs from target SHA', () => {
    const value = html(),
      opening = [clip('left', 0, 3), clip('right', 3, 4, 3)];
    const output = materializeHtmlSubtitles(
      { html: value, key: 'video', nodeId: 'video' },
      opening,
      opening,
    );
    const model = readSubtitleHtml(output);
    const suffix = createHash('sha256').update('right').digest('hex').slice(0, 6);
    expect(
      model.cues.map(({ cueId, clipId, libraryCueId, start, duration }) => ({
        cueId,
        clipId,
        libraryCueId,
        start,
        duration,
      })),
    ).toEqual([
      { cueId: 'library', clipId: 'left', libraryCueId: 'library', start: 1, duration: 4 },
      {
        cueId: `library~${suffix}`,
        clipId: 'right',
        libraryCueId: 'library',
        start: 1,
        duration: 4,
      },
    ]);
    expect(model.clipMeta).toEqual({
      left: { materialized: [0, 5], subtitlesHidden: false },
      right: { materialized: [1, 7], subtitlesHidden: false },
    });
    expect(
      materializeHtmlSubtitles({ html: output, key: 'video', nodeId: 'video' }, opening, opening),
    ).toBe(output);
  });

  it('uses both opening/live windows and keeps unmatched cues detached for later restoration', () => {
    const value = html([
      { cueId: 'later', start: 4, duration: 1, trackIndex: 0, text: '后句' },
      { cueId: 'outside', start: 8, duration: 1, trackIndex: 0, text: '库中另一句' },
    ]);
    const model = readSubtitleHtml(
      materializeHtmlSubtitles(
        { html: value, key: 'video', nodeId: 'video' },
        [clip('a', 0, 2)],
        [clip('a', 4, 2)],
      ),
    );
    expect(model.cues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cueId: 'later', clipId: 'a', start: 4, duration: 1 }),
        expect.objectContaining({ cueId: 'outside', clipId: '~' }),
      ]),
    );
    expect(model.clipMeta.a.materialized).toEqual([0, 6]);
  });

  it('keeps explicit copied clip bindings in a locally created document and removes only absent owners', () => {
    const value = createSubtitleHtml({
      compositionId: 'sub',
      width: 1920,
      height: 1080,
      duration: 10,
      clipMetas: [
        { clipId: 'original', materialized: [0, 6] },
        { clipId: 'copy', materialized: [0, 6] },
      ],
      cues: [
        {
          cueId: 'first',
          clipId: 'original',
          start: 1,
          duration: 2,
          trackIndex: 0,
          text: '原片段',
        },
        { cueId: 'second', clipId: 'copy', start: 1, duration: 2, trackIndex: 0, text: '复制片段' },
      ],
    });
    const layer = {
      html: value,
      key: subtitleDocumentId('video', 'clip:original'),
      nodeId: 'video',
    };
    const opening = [clip('copy', 0, 6), clip('original', 0, 6, 6), clip('unrelated', 0, 3, 12)];
    const restored = readSubtitleHtml(materializeHtmlSubtitles(layer, opening, opening));
    expect(restored.cues.map((cue) => cue.clipId)).toEqual(['original', 'copy']);
    expect(Object.keys(restored.clipMeta)).toEqual(['original', 'copy']);
    const remaining = opening.filter((item) => item.id !== 'original');
    const cleaned = readSubtitleHtml(materializeHtmlSubtitles(layer, remaining, remaining));
    expect(cleaned.cues.map((cue) => cue.clipId)).toEqual(['copy']);
    expect(Object.keys(cleaned.clipMeta)).toEqual(['copy']);
  });

  it('scopes URL documents to their matching clips and garbage-collects stale clip ownership without reviving empty content', () => {
    const opening = [
      { ...clip('a', 0, 6), subtitleHtmlUrl: '/a.html' },
      { ...clip('b', 0, 6, 6), subtitleHtmlUrl: '/b.html' },
    ];
    const key = subtitleDocumentId('video', '/a.html');
    const prepared = readSubtitleHtml(
      materializeHtmlSubtitles({ html: html(), key, nodeId: 'video' }, opening, opening),
    );
    expect(prepared.cues.every((cue) => cue.clipId === 'a')).toBe(true);
    const orphan = html([
      { cueId: 'old', clipId: 'gone', start: 1, duration: 1, trackIndex: 0, text: '不复活' },
    ]);
    const cleared = readSubtitleHtml(
      materializeHtmlSubtitles(
        { html: orphan, key: 'video', nodeId: 'video' },
        [clip('a', 0, 6)],
        [clip('a', 0, 6)],
      ),
    );
    expect(cleared.cues).toEqual([]);
    expect(cleared.clipMeta.a.materialized).toEqual([0, 6]);
  });

  it('prioritizes restored inline/cleared archives, separates changed URLs and refuses malformed records', () => {
    const key = subtitleDocumentId('video', '/old.html'),
      value = html([]);
    const saved = {
      ...archiveHtmlSubtitle({ html: value, key, nodeId: 'video', savedAt: 1 }),
      bindingClipIds: ['a'],
    };
    const timeline = {
      clips: [{ ...clip('a', 0, 5), subtitleHtmlUrl: '/old.html' }],
      subtitlesHtml: { [key]: saved },
    };
    expect(htmlSubtitleLoadPlan(timeline).layers).toHaveLength(1);
    expect(htmlSubtitleLoadPlan(timeline).layers[0].html).toBe(value);
    const changed = htmlSubtitleLoadPlan({
      ...timeline,
      clips: [{ ...timeline.clips[0], subtitleHtmlUrl: '/new.html' }],
    });
    expect(changed.layers.map((layer) => layer.url)).toEqual(['/new.html']);
    expect(() => htmlSubtitleLoadPlan({ clips: [], subtitlesHtml: [] })).toThrow('无法读取');
    expect(() =>
      htmlSubtitleLoadPlan({
        clips: [clip('a', 0, 5)],
        subtitlesHtml: { video: { userCleared: true } },
      }),
    ).toThrow('可恢复内容');
  });

  it('keeps moved cues within the clip source window and finds only real available gaps', () => {
    const proposed = { cueId: 'move', clipId: 'a', trackIndex: 0, start: 0, duration: 2 };
    const peers = [{ cueId: 'block', clipId: 'a', trackIndex: 0, start: 12, duration: 2 }];
    expect(placeHtmlSubtitleCue(peers, proposed, { start: 10, end: 18 })).toBe(10);
    expect(placeHtmlSubtitleCue(peers, { ...proposed, start: 13 }, { start: 10, end: 18 })).toBe(
      14,
    );
    expect(
      placeHtmlSubtitleCue(peers, { ...proposed, duration: 9 }, { start: 10, end: 18 }),
    ).toBeNull();
    expect(
      placeHtmlSubtitleCue(peers, { ...proposed, duration: 8 }, { start: 10, end: 18 }),
    ).toBeNull();
  });
});
