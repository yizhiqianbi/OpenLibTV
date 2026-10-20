import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createSubtitleHtml,
  createTextOverlayHtml,
  readSubtitleHtml,
  readTextOverlayHtml,
} from './html-document.js';
import {
  addHtmlSubtitleCue,
  applySubtitleHtmlPatches,
  applySubtitleLineageDocuments,
} from './subtitle-html.js';
import {
  planNewHtmlSubtitleCue,
  planSubtitleClipLineage,
  staleSubtitleDocument,
  subtitleCueInstances,
  subtitleDocumentId,
  subtitleDocumentSource,
} from '../domain/html-subtitle-model.js';
import { prepareSubtitlePreviewHtml, seekSubtitlePreview } from './subtitle-preview-document.js';
import { archiveHtmlSubtitle } from './subtitle-archive.js';
import { createHtmlSubtitleTools } from './html-subtitle-tools.js';

const clip = (id, startTime = 0, sourceOffset = 10, duration = 4) => ({
  id,
  type: 'video',
  sourceNodeId: 'video',
  startTime,
  sourceOffset,
  duration,
  speed: 2,
});
const cue = (cueId, clipId, start = 11, duration = 3, trackIndex = 0) => ({
  cueId,
  clipId,
  start,
  duration,
  trackIndex,
  text: '原句\n字幕',
});
const html = (cues = [cue('crossing', 'old')]) =>
  createSubtitleHtml({
    compositionId: 'sub-video',
    width: 1920,
    height: 1080,
    duration: 20,
    sourceAssetKey: 'asset-a',
    clipMetas: [{ clipId: 'old', materialized: [10, 18] }],
    cues,
  });
const split = [clip('left', 0, 10, 1), clip('right', 1, 12, 3)];
const suffix = (id) => createHash('sha256').update(id).digest('hex').slice(0, 6);

describe('HTML subtitle source contract and clip lineage', () => {
  it('keeps source time, role, language occurrences, source asset and direct template metadata separate from ordinary text', () => {
    const value = createSubtitleHtml({
      compositionId: 's',
      width: 1920,
      height: 1080,
      duration: 20,
      clipMetas: [{ clipId: 'a', materialized: [2.125, 9.5] }],
      sourceAssetKey: 'movie',
      cues: [
        {
          ...cue('a', 'a'),
          textParts: [
            { text: '<主语>', className: 'cn' },
            { text: 'English', className: 'en' },
          ],
        },
      ],
    });
    const model = readSubtitleHtml(value);
    expect(model).toMatchObject({
      ok: true,
      timeBase: 'source',
      sourceAssetKey: 'movie',
      clipMeta: { a: { materialized: [2.125, 9.5], subtitlesHidden: false } },
    });
    expect(model.cues[0]).toMatchObject({
      clipId: 'a',
      libraryCueId: 'a',
      start: 11,
      duration: 3,
      role: 'caption',
      text: '<主语>\nEnglish',
    });
    expect(
      [...model.cues[0].element.querySelectorAll('[data-lang]')].map((node) =>
        node.getAttribute('data-lang'),
      ),
    ).toEqual(['cn', 'en']);
    expect(model.document.querySelector('主语')).toBeNull();
    expect(readTextOverlayHtml(value).ok).toBe(false);
    const spaced = value
      .replace('data-source-asset-key="movie"', 'data-source-asset-key=" movie "')
      .replace('data-libtv-clip="a"', 'data-libtv-clip=" a "')
      .replace('data-libtv-library-cue="a"', 'data-libtv-library-cue=" a "')
      .replace('data-role="caption"', 'data-role=" caption "');
    expect(readSubtitleHtml(spaced)).toMatchObject({
      sourceAssetKey: 'movie',
      cues: [expect.objectContaining({ clipId: 'a', libraryCueId: 'a', role: 'caption' })],
    });
    expect(
      readSubtitleHtml(
        createTextOverlayHtml({ compositionId: 'overlay', width: 100, height: 100, duration: 5 }),
      ).timeBase,
    ).toBe('timeline');
  });

  it('permits independently bound clips, reports existing same-clip overlap, and retains the ordinary overlay guard', () => {
    expect(readSubtitleHtml(html([cue('a', 'one'), cue('b', 'two')])).ok).toBe(true);
    expect(readSubtitleHtml(html([cue('a', 'one'), cue('b', 'one')])).issues).toContainEqual(
      expect.objectContaining({ code: 'track-overlap' }),
    );
    const overlay = html([cue('a', 'one'), cue('b', 'two')]).replace(
      'data-time-base="source"',
      'data-time-base="timeline"',
    );
    expect(readTextOverlayHtml(overlay).ok).toBe(false);
  });

  it('rejects five subtitle tracks, reports overflow and normalizes source time base without broadening overlay limits', () => {
    const cues = Array.from({ length: 5 }, (_, index) => cue(`row${index}`, 'a', 1, 1, index));
    expect(readSubtitleHtml(html(cues)).issues).toContainEqual(
      expect.objectContaining({ code: 'track-limit-exceeded' }),
    );
    expect(
      readTextOverlayHtml(
        html(cues).replace('data-time-base="source"', 'data-time-base="timeline"'),
      ).ok,
    ).toBe(true);
    expect(
      readSubtitleHtml(html().replace('data-duration="20"', 'data-duration="12"')).issues,
    ).toContainEqual(expect.objectContaining({ code: 'duration-overflow' }));
    expect(
      readSubtitleHtml(html().replace('data-time-base="source"', 'data-time-base="SOURCE"'))
        .timeBase,
    ).toBe('source');
  });

  it('reads malformed materialization as unknown and ignores nested/decorative templates as the source reader does', () => {
    const value = html()
      .replace('10.000,18.000', 'broken')
      .replace(
        '</div></body>',
        '<div><template data-libtv-clip-meta="nested" data-libtv-materialized="0,3"></template></div></div></body>',
      );
    expect(readSubtitleHtml(value).clipMeta).toEqual({
      old: { materialized: null, subtitlesHidden: false },
    });
  });

  it('projects each source window and speed without changing cue timestamps or leaking a bound cue into a sibling clip', () => {
    const original = cue('c', 'left');
    expect(subtitleCueInstances(original, split, 'video')).toEqual([
      { startTime: 0.5, endTime: 1, clipId: 'left', sourceStartTime: 11, sourceEndTime: 12 },
    ]);
    expect(subtitleCueInstances({ ...original, clipId: null }, split, 'video')).toEqual([
      { startTime: 0.5, endTime: 1, clipId: 'left', sourceStartTime: 11, sourceEndTime: 12 },
      { startTime: 1, endTime: 2, clipId: 'right', sourceStartTime: 12, sourceEndTime: 14 },
    ]);
    expect(original).toEqual(cue('c', 'left'));
    expect(subtitleCueInstances({ ...original, clipId: '~' }, split, 'video')).toEqual([]);
    expect(subtitleCueInstances({ ...original, duration: 0.1 }, split, 'video')).toEqual([]);
    expect(
      subtitleCueInstances(
        { ...original, clipId: null },
        [
          ...split,
          { ...split[0], id: 'audio', type: 'audio' },
          { ...split[0], id: 'other', sourceNodeId: 'other' },
        ],
        'video',
      ),
    ).toHaveLength(2);
  });

  it('uses 30fps forward placement within the same clip and truncates at source maxEnd, with the subtitle 0.2s remaining rule', () => {
    const existing = [cue('a', 'one', 1, 2), cue('b', 'two', 3, 2)];
    expect(planNewHtmlSubtitleCue({ existing, clipId: 'one', tSource: 1.099, maxEnd: 4 })).toEqual({
      clipId: 'one',
      start: 3,
      duration: 1,
      trackIndex: 0,
      text: '默认文本',
    });
    expect(
      planNewHtmlSubtitleCue({ existing, clipId: 'three', tSource: 1.099, maxEnd: 4 })?.start,
    ).toBe(32 / 30);
    expect(
      planNewHtmlSubtitleCue({ existing, clipId: 'two', tSource: 1.099, maxEnd: 4 }),
    ).toBeNull();
    expect(planNewHtmlSubtitleCue({ existing: [], tSource: 3.9, maxEnd: 4 })).toBeNull();
    expect(planNewHtmlSubtitleCue({ existing: [], tSource: NaN })).toBeNull();
  });

  it('creates stable namespaced cue anchors after the final truncated source interval is known', async () => {
    const result = await addHtmlSubtitleCue(html(), {
      clipId: 'old',
      tSource: 17.9,
      maxEnd: 18.4,
      namespace: 'video|old',
    });
    expect(result.ok).toBe(true);
    const added = result.model.cues.find((item) => item.cueId === result.cueId);
    expect(added).toMatchObject({
      start: 17.9,
      duration: 0.5,
      clipId: 'old',
      libraryCueId: result.cueId,
      role: 'caption',
      text: '默认文本',
    });
    const digest = createHash('sha256')
      .update('video|old|默认文本|17900|500')
      .digest('hex')
      .slice(0, 6);
    expect(result.cueId).toBe(`c-${digest}`);
  });

  it('creates a new HTML subtitle track only at the next valid track index', () => {
    const value = html([cue('existing', 'old', 10, 1, 0)]),
      key = subtitleDocumentId('video', 'clip:old');
    let session = {
      ready: true,
      conflicted: false,
      htmlSubtitleStatus: 'ready',
      timeline: {
        currentTime: 0,
        totalDuration: 4,
        clips: [
          {
            id: 'old',
            type: 'video',
            sourceNodeId: 'video',
            startTime: 0,
            sourceOffset: 10,
            sourceDuration: 20,
            duration: 4,
            speed: 1,
            width: 1920,
            height: 1080,
          },
        ],
        subtitlesHtml: {
          [key]: archiveHtmlSubtitle({ html: value, nodeId: 'video', key, savedAt: 1 }),
        },
      },
    };
    const acceptEdit = vi.fn(({ timeline }) => {
        session = { ...session, timeline };
        return true;
      }),
      tools = createHtmlSubtitleTools({
        getSession: () => session,
        current: (value) => value === session,
        publish: (value) => {
          session = value;
        },
        acceptEdit,
        beginStyle: vi.fn(),
        previewStyle: vi.fn(),
        endStyle: vi.fn(),
        cancelStyle: vi.fn(),
        pause: vi.fn(),
        seek: vi.fn(),
        notify: vi.fn(),
      });
    expect(
      tools.controls.onAddHtmlSubtitle({ key, trackIndex: 1, createTrack: true, force: true }),
    ).toBe(true);
    expect(acceptEdit).toHaveBeenCalledTimes(1);
    const archived = session.timeline.subtitlesHtml[key],
      model = readSubtitleHtml(archived.htmlInline);
    expect(model.trackIndexes).toEqual([0, 1]);
    expect(model.cues.find((item) => item.trackIndex === 1)?.text).toBe('默认文本');
    expect(
      tools.controls.onAddHtmlSubtitle({ key, trackIndex: 3, createTrack: true, force: true }),
    ).toBe(false);
    expect(acceptEdit).toHaveBeenCalledTimes(1);
  });

  it('clones full cue and scale wrapper with collision suffix, library identity, words and inert scripts intact; repeating is idempotent', async () => {
    const model = readSubtitleHtml(html());
    const source = model.cues[0].element;
    const wrapper = model.document.createElement('div');
    wrapper.setAttribute('data-libtv-editor-scale-wrapper', '');
    wrapper.style.transform = 'scale(1.25)';
    source.replaceWith(wrapper);
    wrapper.append(source);
    source.querySelector('[data-libtv-text]').innerHTML =
      '<span data-word-start="11" data-word-duration="3">原句</span>';
    source.setAttribute('data-text-mode', 'words');
    const collision = source.cloneNode(true);
    collision.setAttribute('data-libtv-cue-id', `crossing~${suffix('copy')}`);
    collision.setAttribute('data-libtv-clip', 'collision');
    model.root.append(collision);
    model.document.head.insertAdjacentHTML(
      'beforeend',
      '<script>window.subtitleExecuted=true</script><style>.unknown{--source:keep}</style>',
    );
    const value = model.document.documentElement.outerHTML;
    const patches = [{ kind: 'cloneCuesToClip', fromClipId: 'old', toClipId: 'copy' }];
    const result = await applySubtitleHtmlPatches(value, patches);
    expect(result.ok).toBe(true);
    const copied = result.model.cues.find((item) => item.clipId === 'copy');
    expect(copied).toMatchObject({
      cueId: `crossing~${suffix('copy')}-2`,
      libraryCueId: 'crossing',
      start: 11,
      duration: 3,
      words: [{ start: 11, duration: 3, text: '原句' }],
    });
    expect(copied.element.parentElement.style.transform).toBe('scale(1.25)');
    expect(result.html).toContain('window.subtitleExecuted=true');
    expect(window.subtitleExecuted).toBeUndefined();
    expect(await applySubtitleHtmlPatches(result.html, patches)).toMatchObject({
      ok: true,
      changed: false,
      html: result.html,
    });
  });

  it('retags only requested cues and leaves library identity and source timing intact', async () => {
    const result = await applySubtitleHtmlPatches(
      html([cue('one', 'old', 10, 1), cue('two', 'old', 12, 1)]),
      [{ kind: 'retagCues', cueIds: ['one'], toClipId: 'new' }],
    );
    expect(
      result.model.cues.map(({ cueId, clipId, libraryCueId, start }) => ({
        cueId,
        clipId,
        libraryCueId,
        start,
      })),
    ).toEqual([
      { cueId: 'one', clipId: 'new', libraryCueId: 'one', start: 10 },
      { cueId: 'two', clipId: 'old', libraryCueId: 'two', start: 12 },
    ]);
  });

  it('updates or removes direct clip metadata atomically and preserves unrelated authored attributes', async () => {
    const value = html().replace(
      'data-libtv-clip-meta="old"',
      'data-libtv-clip-meta="old" data-source-extra="retained"',
    );
    const result = await applySubtitleHtmlPatches(value, [
      {
        kind: 'setClipMeta',
        clipId: 'old',
        subtitlesHidden: true,
        materialized: [10.12345, 18.98765],
      },
      { kind: 'setClipMeta', clipId: 'copy', materialized: null },
    ]);
    expect(result.model.clipMeta).toEqual({
      old: { subtitlesHidden: true, materialized: [10.123, 18.988] },
      copy: { subtitlesHidden: false, materialized: null },
    });
    expect(result.html).toContain('data-source-extra="retained"');
    const shown = await applySubtitleHtmlPatches(result.html, [
      { kind: 'setClipMeta', clipId: 'old', subtitlesHidden: false },
    ]);
    expect(shown.model.clipMeta.old.subtitlesHidden).toBe(false);
    const removed = await applySubtitleHtmlPatches(shown.html, [
      { kind: 'setClipMeta', clipId: 'old', remove: true },
    ]);
    expect(removed.model.clipMeta).not.toHaveProperty('old');
  });

  it('deletes only the bound clip cues, cleans scale/track shells and keeps metadata unless requested', async () => {
    const value = html([cue('a', 'old'), cue('b', 'other')]);
    const model = readSubtitleHtml(value);
    const element = model.cues[0].element;
    const track = model.document.createElement('section');
    track.setAttribute('data-track-index', '0');
    const wrapper = model.document.createElement('div');
    wrapper.setAttribute('data-libtv-editor-scale-wrapper', '');
    element.replaceWith(track);
    track.append(wrapper);
    wrapper.append(element);
    const result = await applySubtitleHtmlPatches(model.document.documentElement.outerHTML, [
      { kind: 'removeClipCues', clipId: 'old' },
    ]);
    expect(result.model.cues.map((item) => item.cueId)).toEqual(['b']);
    expect(result.model.clipMeta).toHaveProperty('old');
    expect(result.model.document.querySelector('section')).toBeNull();
    const empty = await applySubtitleHtmlPatches(html(), [
      { kind: 'removeClipCues', clipId: 'old' },
    ]);
    expect(empty).toMatchObject({ ok: true, changed: true });
    expect(empty.model.cues).toEqual([]);
    expect(empty.model.clipMeta).toHaveProperty('old');
    const removedMeta = await applySubtitleHtmlPatches(html(), [
      { kind: 'removeClipCues', clipId: 'old', removeMeta: true },
    ]);
    expect(removedMeta.model.clipMeta).toEqual({});
  });

  it('rejects whole batches when a later patch creates overlap or invalid materialization, preserving the original bytes', async () => {
    const value = html([cue('a', 'one'), cue('b', 'two')]);
    const result = await applySubtitleHtmlPatches(value, [
      { kind: 'text', cueId: 'a', text: '不应部分保存' },
      { kind: 'retagCues', cueIds: ['b'], toClipId: 'one' },
    ]);
    expect(result).toMatchObject({ ok: false, html: value });
    expect(
      await applySubtitleHtmlPatches(value, [
        { kind: 'text', cueId: 'a', text: '不应部分保存' },
        { kind: 'setClipMeta', clipId: 'one', materialized: [10, 2] },
      ]),
    ).toMatchObject({ ok: false, html: value });
  });

  it('splits crossing captions by clone plus binding, leaves timestamps/words intact, and propagates hidden/materialized metadata', async () => {
    const source = await applySubtitleHtmlPatches(
      html([
        cue('before', 'old', 10, 1),
        cue('crossing', 'old', 11, 3),
        cue('after', 'old', 15, 1),
      ]),
      [{ kind: 'setClipMeta', clipId: 'old', subtitlesHidden: true }],
    );
    const result = await applySubtitleLineageDocuments(
      { layer: { nodeId: 'video', html: source.html } },
      { kind: 'split', before: [clip('old')], after: split },
    );
    expect(result).toMatchObject({ ok: true, changed: true });
    const model = readSubtitleHtml(result.documents.layer.html);
    expect(model.cues.filter((item) => item.clipId === 'left').map((item) => item.cueId)).toEqual([
      'before',
      'crossing',
    ]);
    const crossing = model.cues.find((item) => item.cueId.startsWith('crossing~'));
    expect(crossing).toMatchObject({
      clipId: 'right',
      start: 11,
      duration: 3,
      libraryCueId: 'crossing',
    });
    expect(subtitleCueInstances(crossing, split, 'video')).toEqual([
      { startTime: 1, endTime: 2, clipId: 'right', sourceStartTime: 12, sourceEndTime: 14 },
    ]);
    expect(model.clipMeta).toEqual({
      left: { materialized: [10, 18], subtitlesHidden: true },
      right: { materialized: [10, 18], subtitlesHidden: true },
    });
  });

  it('duplicates same source ranges, ignores unrelated layers and refuses mixed/unbound lineage or a second document failure without partial results', async () => {
    const original = {
      first: { nodeId: 'video', html: html() },
      other: { nodeId: 'other', html: 'untouched' },
      sibling: {
        nodeId: 'video',
        html: createSubtitleHtml({
          compositionId: 'sibling',
          width: 100,
          height: 100,
          duration: 20,
          cues: [cue('sibling', 'sibling')],
        }),
      },
    };
    const operation = {
      kind: 'duplicate',
      sourceClipId: 'old',
      before: [clip('old')],
      after: [clip('old'), clip('copy', 8)],
    };
    const result = await applySubtitleLineageDocuments(original, operation);
    expect(result.ok).toBe(true);
    expect(result.documents.other).toBe(original.other);
    expect(result.documents.sibling).toBe(original.sibling);
    expect(readSubtitleHtml(result.documents.first.html).cues).toHaveLength(2);
    const invalid = { ...original, broken: { nodeId: 'video', html: 'broken' } };
    expect(await applySubtitleLineageDocuments(invalid, operation)).toMatchObject({
      ok: false,
      documents: invalid,
    });
    const unbound = { only: { nodeId: 'video', html: html([cue('unbound', null)]) } };
    expect(await applySubtitleLineageDocuments(unbound, operation)).toMatchObject({
      ok: true,
      changed: false,
      documents: unbound,
    });
    expect(
      planSubtitleClipLineage(
        'split',
        [clip('old')],
        [clip('left', 0, 10, 1), clip('wrong', 1, 13, 2)],
      ),
    ).toBeNull();
  });

  it('separates URL-scoped documents, preserves historical keys and flags an override stale only when every bound URL was replaced', () => {
    const id = subtitleDocumentId('node"1', ' https://cdn.test/a.html ');
    expect(subtitleDocumentSource(id)).toEqual({
      nodeId: 'node"1',
      url: 'https://cdn.test/a.html',
    });
    expect(subtitleDocumentSource('subtitle:broken')).toEqual({
      nodeId: 'subtitle:broken',
      url: null,
    });
    expect(
      staleSubtitleDocument(
        id,
        ['one'],
        [{ id: 'one', sourceNodeId: 'node"1', subtitleHtmlUrl: 'https://cdn.test/b.html' }],
      ),
    ).toBe(true);
    expect(staleSubtitleDocument(id, ['one'], [{ id: 'one', sourceNodeId: 'node"1' }])).toBe(false);
    expect(staleSubtitleDocument(id, ['missing'], [])).toBe(false);
    expect(
      staleSubtitleDocument(
        subtitleDocumentId('node', 'clip:one'),
        ['one'],
        [{ id: 'one', sourceNodeId: 'node', subtitleHtmlUrl: '/new' }],
      ),
    ).toBe(false);
  });

  it('seeks source time with clip identity, hidden metadata and track/cue gates under the shared closed preview policy', async () => {
    const value = html([
      cue('one', 'one'),
      cue('two', 'two'),
      cue('unbound', null, 15, 1),
      cue('detached', '~'),
    ]).replace('</head>', '<script>window.executed=true</script></head>');
    const prepared = prepareSubtitlePreviewHtml(value);
    expect(prepared.scriptUnsupported).toBe(true);
    expect(prepared.html).not.toContain('<script');
    expect(prepared.model.document.querySelector('meta[http-equiv]').content).toContain(
      "script-src 'none'",
    );
    const document = prepared.model.document;
    const element = (id) => document.querySelector(`[data-libtv-cue-id="${id}"]`);
    seekSubtitlePreview(document, 12, 'two');
    expect(element('one').style.visibility).toBe('hidden');
    expect(element('two').style.visibility).toBe('visible');
    expect(element('detached').style.visibility).toBe('hidden');
    element('two').setAttribute('data-libtv-hidden', 'true');
    seekSubtitlePreview(document, 12, 'two');
    expect(element('two').style.visibility).toBe('hidden');
    element('two').removeAttribute('data-libtv-hidden');
    element('two').setAttribute('data-libtv-track-hidden', 'true');
    seekSubtitlePreview(document, 12, 'two');
    expect(element('two').style.visibility).toBe('hidden');
    element('two').removeAttribute('data-libtv-track-hidden');
    seekSubtitlePreview(document, 14, 'two');
    expect(element('two').style.visibility).toBe('hidden');
    seekSubtitlePreview(document, 15, 'one');
    expect(element('unbound').style.visibility).toBe('visible');
    const result = await applySubtitleHtmlPatches(value, [
      { kind: 'setClipMeta', clipId: 'two', subtitlesHidden: true },
    ]);
    const hidden = prepareSubtitlePreviewHtml(result.html).model.document;
    seekSubtitlePreview(hidden, 12, 'two');
    expect(hidden.querySelector('[data-libtv-cue-id="two"]').style.visibility).toBe('hidden');
  });

  it('retimes source words linearly and preserves language occurrences and unrelated source attributes', async () => {
    const model = readSubtitleHtml(html());
    const element = model.cues[0].element;
    element.setAttribute('data-text-mode', 'words');
    element.setAttribute('data-source-note', 'keep');
    element.querySelector('[data-libtv-text]').innerHTML =
      '<span data-lang="zh"><span data-word-start="11" data-word-duration="1.5">第一词</span><span data-word-start="12.5" data-word-duration="1.5">第二词</span></span>';
    const result = await applySubtitleHtmlPatches(model.document.documentElement.outerHTML, [
      { kind: 'timing', cueId: 'crossing', start: 10, duration: 6 },
    ]);
    expect(result.ok).toBe(true);
    expect(result.model.cues[0].words).toEqual([
      { start: 10, duration: 3, text: '第一词' },
      { start: 13, duration: 3, text: '第二词' },
    ]);
    expect(
      result.model.cues[0].element.querySelector('[data-lang]').getAttribute('data-lang'),
    ).toBe('zh');
    expect(result.model.cues[0].element.getAttribute('data-source-note')).toBe('keep');
  });
});
