import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readSubtitleHtml, readTextOverlayHtml } from './html-document.js';
import { materializeHtmlSubtitles } from './subtitle-materialization.js';
import { archiveHtmlSubtitle } from './subtitle-archive.js';
import { applySubtitleHtmlPatches, addHtmlSubtitleCue } from './subtitle-html.js';
import { prepareSubtitlePreviewHtml, seekSubtitlePreview } from './subtitle-preview-document.js';
import { subtitleCueInstances } from '../domain/html-subtitle-model.js';

const cue = (attributes = '', text = '旧字幕') =>
  `<p class="caption" data-start="11" data-duration="2" ${attributes}><span data-libtv-text>${text}</span></p>`;
const source = ({ version, root = 'div id="root"', attrs = '', content = cue() } = {}) =>
  `<!DOCTYPE html><html><head><style>.caption{color:red;position:absolute;bottom:10px}</style></head><body><${root} data-width="320" data-height="180" ${version == null ? '' : `data-libtv-contract="libtv-subtitle/${version}"`} ${attrs}>${content}</${root.split(' ')[0]}></body></html>`;
const clips = [
  {
    id: 'clip',
    sourceNodeId: 'video',
    type: 'video',
    startTime: 5,
    sourceOffset: 10,
    duration: 3,
    speed: 2,
    width: 320,
    height: 180,
  },
];

describe('archived iR/iO/ll legacy subtitle reading and working-document upgrade', () => {
  it.each([undefined, 1, 2, 3, 4])(
    'reads contract %s with source defaults without broadening strict text overlays',
    (version) => {
      const html = source({ version }),
        model = readSubtitleHtml(html);
      const id = `c-${createHash('sha256').update('|旧字幕|11000|2000').digest('hex').slice(0, 6)}`;
      expect(model).toMatchObject({
        ok: true,
        contractVersion: version || 0,
        compositionId: '',
        timeBase: 'source',
        duration: 0,
        width: 320,
        height: 180,
      });
      expect(model.cues[0]).toMatchObject({
        cueId: id,
        trackIndex: 0,
        z: 100,
        start: 11,
        duration: 2,
        text: '旧字幕',
      });
      expect(model.cues[0].element.getAttribute('data-track-index')).toBe('0');
      expect(html).not.toContain(id);
      expect(readTextOverlayHtml(html).ok).toBe(false);
    },
  );
  it('uses the first explicit composition, then root, then body, retaining unknown DOM and inert scripts', () => {
    const html =
      '<!DOCTYPE html><html><head><script>globalThis.subtitleLegacyExecuted=true</script></head><body data-width="640" data-height="360"><section data-custom="preserved">' +
      cue() +
      '</section></body></html>';
    const model = readSubtitleHtml(html);
    expect(model).toMatchObject({ ok: true, width: 640, height: 360, hasScript: true });
    expect(model.root.tagName).toBe('BODY');
    expect(globalThis.subtitleLegacyExecuted).toBeUndefined();
    expect(model.document.querySelector('[data-custom]').getAttribute('data-custom')).toBe(
      'preserved',
    );
    const first = readSubtitleHtml(
      source({
        root: 'main data-composition-id="first"',
        content:
          cue() + '<aside data-composition-id="second" data-width="1" data-height="1"></aside>',
      }),
    );
    expect(first).toMatchObject({ ok: true, compositionId: 'first', width: 320 });
  });
  it('normalizes track/time-base/text-mode defaults while reserving authored IDs before generating new IDs', () => {
    const base = `c-${createHash('sha256').update('|旧字幕|11000|2000').digest('hex').slice(0, 6)}`;
    const html = source({
      attrs: 'data-time-base=" TIMELINE "',
      content:
        cue('data-track-index="1.6" data-text-mode=" PLAIN "') +
        cue(`data-libtv-cue-id="${base}" data-track-index="-1"`) +
        cue(),
    });
    const model = readSubtitleHtml(html);
    expect(model.timeBase).toBe('timeline');
    expect(model.cues.map((item) => item.cueId)).toEqual([`${base}-2`, base, `${base}-3`]);
    expect(model.cues.map((item) => item.trackIndex)).toEqual([2, 0, 0]);
    expect(model.cues[0].textMode).toBe('plain');
    expect(readSubtitleHtml(html).cues.map((item) => item.cueId)).toEqual(
      model.cues.map((item) => item.cueId),
    );
  });
  it('reads only outer timed cues and keeps words, clip/library ownership, hidden flags and direct metadata', () => {
    const html = source({
      version: 3,
      attrs: 'data-source-asset-key=" movie "',
      content:
        '<template data-libtv-clip-meta="old" data-libtv-materialized="10,16" data-libtv-subtitles-hidden="true"></template>' +
        cue(
          'data-libtv-cue-id="one" data-libtv-clip=" old " data-libtv-library-cue=" original " data-libtv-hidden="true" data-libtv-track-hidden="true" data-role=" caption "',
          '<span data-word-start="11" data-word-duration="1">旧</span><span data-start="11" data-duration="1" data-word-start="12" data-word-duration="1">字幕</span>',
        ),
    });
    const model = readSubtitleHtml(html);
    expect(model.cues).toHaveLength(1);
    expect(model).toMatchObject({
      ok: true,
      sourceAssetKey: 'movie',
      clipMeta: { old: { materialized: [10, 16], subtitlesHidden: true } },
    });
    expect(model.cues[0]).toMatchObject({
      clipId: 'old',
      libraryCueId: 'original',
      hidden: true,
      trackHidden: true,
      role: 'caption',
      textMode: 'words',
      text: '旧字幕',
      words: [
        { start: 11, duration: 1, text: '旧' },
        { start: 12, duration: 1, text: '字幕' },
      ],
    });
  });
  it('reports source warnings without rejecting or silently repairing original cue content', () => {
    const model = readSubtitleHtml(
      source({
        version: 2,
        attrs: 'data-duration="12"',
        content:
          cue(
            'data-libtv-cue-id="duplicate"',
            '<span data-word-start="2" data-word-duration="1">旧字幕</span>',
          ) + cue('data-libtv-cue-id="duplicate"'),
      }),
    );
    expect(model.ok).toBe(true);
    expect(model.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'duration-overflow',
        'duplicate-cue-id',
        'word-time-out-of-range',
        'track-overlap',
      ]),
    );
    expect(model.cues.map((item) => item.cueId)).toEqual(['duplicate', 'duplicate']);
    expect(model.cues[0].words[0].start).toBe(2);
  });
  it('rejects future contracts, missing dimensions, five tracks and oversized HTML', () => {
    expect(readSubtitleHtml(source({ version: 5 }))).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'contract-version' })],
    });
    expect(readSubtitleHtml('<p data-start="0" data-duration="1">bad</p>').ok).toBe(false);
    expect(
      readSubtitleHtml(
        source({
          content: Array.from({ length: 5 }, (_, i) => cue(`data-track-index="${i}"`)).join(''),
        }),
      ).ok,
    ).toBe(false);
    expect(
      readSubtitleHtml(source({ content: cue() + '<!--' + 'x'.repeat(2097152) + '-->' })).issues,
    ).toContainEqual(expect.objectContaining({ code: 'oversize' }));
  });
  it('upgrades unbound legacy content only in the prepared working document and preserves source clocks', () => {
    const html = source({ version: 2 }),
      original = html;
    const layer = { key: 'video', nodeId: 'video', html };
    const prepared = materializeHtmlSubtitles(layer, clips, clips),
      model = readSubtitleHtml(prepared);
    expect(layer.html).toBe(original);
    expect(model.contractVersion).toBe(4);
    expect(model.clipMeta.clip.materialized).toEqual([10, 16]);
    expect(model.cues[0]).toMatchObject({
      clipId: 'clip',
      start: 11,
      duration: 2,
      libraryCueId: model.cues[0].cueId,
    });
    expect(subtitleCueInstances(model.cues[0], clips, 'video')).toMatchObject([
      { startTime: 5.5, endTime: 6.5, clipId: 'clip' },
    ]);
    const archived = archiveHtmlSubtitle({ ...layer, html: prepared });
    expect(archived).toMatchObject({
      contractVersion: 4,
      bindingClipIds: ['clip'],
      compositionDuration: 0,
      compositionWidth: 320,
    });
    expect(readSubtitleHtml(archived.htmlInline).cues[0]).toMatchObject({
      start: 11,
      duration: 2,
      clipId: 'clip',
    });
  });
  it('preserves an already-bound old document version until its actual fields change', async () => {
    const html = source({
      version: 3,
      content: cue('data-libtv-clip="clip" data-libtv-cue-id="one" data-track-index="0"'),
    });
    expect(materializeHtmlSubtitles({ key: 'video', nodeId: 'video', html }, clips, clips)).toBe(
      html,
    );
    expect((await applySubtitleHtmlPatches(html, [])).html).toBe(html);
    expect(archiveHtmlSubtitle({ html, nodeId: 'video', key: 'video' }).htmlInline).toBe(html);
    const edited = await applySubtitleHtmlPatches(html, [
      { kind: 'text', cueId: 'one', text: '新正文' },
    ]);
    expect(edited.ok).toBe(true);
    expect(edited.model).toMatchObject({ contractVersion: 3 });
    expect(edited.model.cues[0].text).toBe('新正文');
  });
  it('can add a source cue when an old document omitted duration and keeps atomic failure protection', async () => {
    const prepared = materializeHtmlSubtitles(
      { key: 'video', nodeId: 'video', html: source({ version: 1 }) },
      clips,
      clips,
    );
    const added = await addHtmlSubtitleCue(prepared, {
      clipId: 'clip',
      tSource: 14,
      maxEnd: 16,
      text: '新增',
      namespace: 'video',
    });
    expect(added.ok).toBe(true);
    expect(added.model.cues.at(-1)).toMatchObject({ text: '新增', start: 14, duration: 2 });
    const existing = source({
      version: 1,
      content: cue('data-libtv-cue-id="one"') + cue('data-libtv-cue-id="two"'),
    });
    const bodyOnly = await applySubtitleHtmlPatches(existing, [
      { kind: 'text', cueId: 'one', text: '保留旧重叠' },
    ]);
    expect(bodyOnly.ok).toBe(true);
    expect(bodyOnly.model.issues.some((issue) => issue.code === 'track-overlap')).toBe(true);
  });
  it('prepares and seeks a body-root legacy preview with the same scriptless policy', () => {
    const html =
      '<html><body data-width="320" data-height="180" data-start="0" data-duration="6">' +
      cue() +
      '</body></html>';
    const preview = prepareSubtitlePreviewHtml(html),
      model = preview.model;
    seekSubtitlePreview(model.document, 11.5);
    expect(model.cues[0].element.style.visibility).toBe('visible');
    expect(model.root.style.visibility).toBe('');
    seekSubtitlePreview(model.document, 13.5);
    expect(model.cues[0].element.style.visibility).toBe('hidden');
    expect(preview.html).toContain("script-src 'none'");
  });
});
