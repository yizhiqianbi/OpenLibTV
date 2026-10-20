import { describe, expect, it } from 'vitest';
import {
  createSubtitleHtml,
  createTextOverlayHtml,
  readSubtitleHtml,
  readTextOverlayHtml,
  serializeTextHtml,
} from './html-document.js';
import { applyTextOverlayPatches, applyTimedTextPatches } from './html-patches.js';
import {
  planNewOverlayCue,
  placeTextCue,
  textFrameTime,
  textNumericValue,
} from '../domain/text-timing-model.js';

const cue = (cueId, start, duration, trackIndex = 0, text = cueId) => ({
  cueId,
  start,
  duration,
  trackIndex,
  text,
});
const documentHtml = (cues = [cue('a', 1, 2), cue('b', 4, 1)]) =>
  createTextOverlayHtml({
    compositionId: 'source-composition',
    width: 1920,
    height: 1080,
    duration: 10,
    cues,
  });
const read = (result) => {
  expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  return readTextOverlayHtml(result.html);
};

describe('source HTML text timing and layout rules', () => {
  it('floors only the entry to 30 fps and searches forward before cutting the final cue to the timeline', () => {
    expect(textFrameTime(1.099)).toBe(32 / 30);
    expect(textFrameTime(Infinity)).toBe(0);
    const existing = [cue('a', 0, 4)];
    expect(planNewOverlayCue({ currentTime: 1.2, totalDuration: 5, existing })).toEqual({
      start: 4,
      duration: 1,
      trackIndex: 0,
      text: '输入文本',
    });
    expect(planNewOverlayCue({ currentTime: 5, totalDuration: 5, existing })).toBeNull();
    expect(planNewOverlayCue({ currentTime: 0, totalDuration: 0.05, existing: [] })).toBeNull();
    expect(planNewOverlayCue({ currentTime: 0, totalDuration: NaN, existing: [] })).toBeNull();
  });
  it('ignores other clips/rows and chooses the nearest legal interval with millisecond precision', () => {
    const existing = [
      cue('a', 2, 2),
      { ...cue('foreign', 0, 10), clipId: 'another' },
      cue('other-row', 0, 10, 1),
    ];
    expect(placeTextCue(existing, { ...cue('new', 2.2, 1) })).toMatchObject({
      start: 1,
      duration: 1,
      snapped: true,
    });
    expect(placeTextCue(existing, { ...cue('new', 2.2, 1) }, 'forward')).toMatchObject({
      start: 4,
      duration: 1,
      snapped: true,
    });
    expect(placeTextCue(existing, { ...cue('a', 2.23456, 1) })).toMatchObject({
      start: 2.23456,
      snapped: false,
    });
  });
  it('keeps text limits separate from VTT and preserves non-step decimal values', () => {
    expect(textNumericValue('fontSizePx', 399.7)).toBe(399.7);
    expect(textNumericValue('fontSizePx', 1000)).toBe(400);
    expect(textNumericValue('letterSpacingPx', -15)).toBe(-15);
    expect(textNumericValue('widthPct', 0)).toBe(8);
    expect(textNumericValue('unknown', 1)).toBeNull();
    expect(textNumericValue('fontSizePx', Infinity)).toBeNull();
  });
});

describe('inert source HTML contract', () => {
  it('builds the original timeline metadata and literal text without executing markup', () => {
    const html = documentHtml([cue('unsafe', 1, 2, 0, '<script>bad()</script>\n& second')]);
    const model = readTextOverlayHtml(html);
    expect(model).toMatchObject({
      ok: true,
      width: 1920,
      height: 1080,
      duration: 10,
      compositionId: 'source-composition',
      trackIndexes: [0],
      hasScript: false,
    });
    expect(model.cues[0]).toMatchObject({
      cueId: 'unsafe',
      text: '<script>bad()</script>\n& second',
      role: 'text',
      textMode: 'plain',
      hidden: false,
    });
    expect(model.document.querySelector('script')).toBeNull();
    expect(html).toContain('font-size:var(--libtvSubtitleFontSize,56px)');
  });
  it.each([
    [
      'missing composition',
      (html) => html.replace('data-composition-id=', 'data-missing='),
      'composition-root-count',
    ],
    [
      'duplicate composition',
      (html) => html.replace('</body>', '<div data-composition-id="second"></div></body>'),
      'composition-root-count',
    ],
    [
      'source clock',
      (html) => html.replace('data-time-base="timeline"', 'data-time-base="source"'),
      'time-base-invalid',
    ],
    [
      'unsupported version',
      (html) => html.replace('libtv-subtitle/4', 'libtv-subtitle/5'),
      'contract-version',
    ],
    [
      'noncanonical row',
      (html) => html.replace('data-track-index="0"', 'data-track-index="00"'),
      'cue-track-index-invalid',
    ],
    [
      'duplicate cue',
      (html) => html.replace('data-libtv-cue-id="b"', 'data-libtv-cue-id="a"'),
      'duplicate-cue-id',
    ],
    [
      'overlapping cue',
      (html) => html.replace('data-start="4"', 'data-start="2"'),
      'track-overlap',
    ],
    [
      'unmapped wrapper',
      (html) => html.replace('</div></body>', '<span data-track-index="9"></span></div></body>'),
      'indexed-element-track-index-unmapped',
    ],
  ])('rejects %s without a writable empty fallback', (_name, change, code) => {
    const result = readTextOverlayHtml(change(documentHtml()));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === code)).toBe(true);
  });
  it('limits unique source rows to eight and accepts an intentionally emptied composition', () => {
    expect(
      readTextOverlayHtml(
        documentHtml(Array.from({ length: 9 }, (_, index) => cue(`row${index}`, 0, 1, index))),
      ).issues,
    ).toContainEqual(expect.objectContaining({ code: 'overlay-track-limit-exceeded' }));
    expect(readTextOverlayHtml(documentHtml([]))).toMatchObject({
      ok: true,
      cues: [],
      trackIndexes: [],
    });
  });
  it('reads only outer cues and preserves explicit plain text when nested timing is present', () => {
    const html = documentHtml([cue('parent', 1, 2)]).replace(
      '>parent</span>',
      '><span data-start="1" data-duration="1">nested</span></span>',
    );
    const model = readTextOverlayHtml(html);
    expect(model.ok).toBe(true);
    expect(model.cues).toHaveLength(1);
    expect(model.cues[0].text).toBe('nested');
  });
});

describe('HTML text mutation transactions', () => {
  it('keeps unchanged source bytes and unknown styles/attributes/scripts through an edit', () => {
    const html = documentHtml()
      .replace(
        '<head>',
        '<head><script type="application/json" data-preserve="yes">{"opaque":true}</script>',
      )
      .replace('class="clip hf-cue"', 'data-future="retain" class="clip hf-cue"');
    expect(applyTextOverlayPatches(html, [])).toMatchObject({ ok: true, changed: false, html });
    expect(applyTextOverlayPatches(html, [{ kind: 'text', cueId: 'a', text: 'a' }])).toMatchObject({
      ok: true,
      changed: false,
      html,
    });
    const result = applyTextOverlayPatches(html, [
      { kind: 'text', cueId: 'a', text: '<b>literal</b>' },
    ]);
    const model = read(result);
    expect(model.cues[0].text).toBe('<b>literal</b>');
    expect(model.cues[0].element.querySelector('b')).toBeNull();
    expect(model.cues[0].element.getAttribute('data-future')).toBe('retain');
    expect(model.document.querySelector('script').textContent).toBe('{"opaque":true}');
    expect(model.document.querySelector('style').textContent).toContain('.hf-text');
  });
  it('rejects the entire patch batch on overlap and keeps the original string', () => {
    const html = documentHtml();
    const result = applyTextOverlayPatches(html, [
      { kind: 'text', cueId: 'a', text: 'must roll back' },
      { kind: 'timing', cueId: 'b', start: 2 },
    ]);
    expect(result).toMatchObject({ ok: false, html });
    expect(readTextOverlayHtml(html).cues[0].text).toBe('a');
    expect(applyTextOverlayPatches(html, [{ kind: 'unknown' }])).toMatchObject({ ok: false, html });
  });
  it('clones source styling, inserts and removes independent cues, and retains an empty root', () => {
    const html = documentHtml().replace(
      'class="clip hf-cue"',
      'style="--libtvSubtitleColor: #ff0000" class="clip hf-cue"',
    );
    const added = read(
      applyTextOverlayPatches(html, [{ kind: 'addCue', cue: { ...cue('new', 6, 1), z: 37 } }]),
    );
    expect(added.cues[2]).toMatchObject({ cueId: 'new', z: 37, text: 'new', role: 'text' });
    expect(added.cues[2].element.style.getPropertyValue('--libtvSubtitleColor')).toBe('#ff0000');
    const removed = read(
      applyTextOverlayPatches(
        serializeTextHtml(added.document),
        added.cues.map((cue) => ({ kind: 'removeCue', cueId: cue.cueId })),
      ),
    );
    expect(removed.cues).toEqual([]);
    expect(removed.compositionId).toBe('source-composition');
  });
  it('updates visibility and selected/global layout without overwriting unrelated data', () => {
    const result = read(
      applyTextOverlayPatches(documentHtml(), [
        { kind: 'trackVisible', trackIndex: 0, visible: false },
        { kind: 'cueHidden', cueId: 'a', hidden: true },
        { kind: 'layout', cueId: 'a', xPct: 20.125, yPct: -10, widthPct: 2, scale: 5 },
        {
          kind: 'styleVar',
          scope: { type: 'cue', cueId: 'a' },
          vars: { '--libtvSubtitleColor': '#FFDC00' },
        },
        {
          kind: 'styleVar',
          scope: { type: 'global' },
          vars: { '--libtvSubtitleFontWeight': '700' },
        },
      ]),
    );
    expect(result.cues.every((cue) => cue.trackHidden)).toBe(true);
    expect(result.cues[0].hidden).toBe(true);
    const style = result.cues[0].element.style;
    expect(style.getPropertyValue('--libtvSubtitleX')).toBe('20.125%');
    expect(style.getPropertyValue('--libtvSubtitleY')).toBe('0%');
    expect(style.getPropertyValue('--libtvSubtitleWidth')).toBe('8%');
    expect(style.getPropertyValue('--libtvSubtitleScale')).toBe('4');
    expect(result.cues[1].element.style.getPropertyValue('--libtvSubtitleColor')).toBe('');
    expect(result.root.style.getPropertyValue('--libtvSubtitleFontWeight')).toBe('700');
  });
  it('reorders all source rows atomically, remaps z order and preserves hidden state and anchor', () => {
    const html = documentHtml([cue('a', 1, 1, 0), cue('b', 2, 1, 1), cue('c', 3, 1, 2)])
      .replace(
        'data-composition-id="source-composition"',
        'data-composition-id="source-composition" data-libtv-overlay-group-anchor="0"',
      )
      .replace('data-track-index="1"', 'data-track-index="1" data-libtv-track-hidden="true"');
    const result = read(
      applyTextOverlayPatches(html, [{ kind: 'reorderTracks', order: [2, 0, 1] }]),
    );
    expect(result.trackIndexes).toEqual([0, 1, 2]);
    expect(result.cues.map((entry) => [entry.cueId, entry.trackIndex, entry.z])).toEqual([
      ['a', 1, 99],
      ['b', 2, 98],
      ['c', 0, 100],
    ]);
    expect(result.cues[1].trackHidden).toBe(true);
    expect(result.root.getAttribute('data-libtv-overlay-group-anchor')).toBe('1');
    expect(applyTextOverlayPatches(html, [{ kind: 'reorderTracks', order: [0, 2] }])).toMatchObject(
      { ok: false, html },
    );
  });
  it('reorders source subtitle rows without changing clip ownership or cue timing', () => {
    const html = createSubtitleHtml({
      compositionId: 'sub',
      width: 1920,
      height: 1080,
      duration: 10,
      cues: [
        { ...cue('a', 1, 2, 0), clipId: 'left' },
        { ...cue('b', 4, 1, 1), clipId: 'left' },
      ],
    });
    const result = applyTimedTextPatches(html, [{ kind: 'reorderTracks', order: [1, 0] }], {
      subtitle: true,
    });
    expect(result.ok).toBe(true);
    const model = readSubtitleHtml(result.html);
    expect(model.cues.map((entry) => [entry.cueId, entry.trackIndex, entry.clipId])).toEqual([
      ['a', 1, 'left'],
      ['b', 0, 'left'],
    ]);
  });
  it('rescales source word timing with cue bounds and regenerates weighted words after editing', () => {
    const html = documentHtml([cue('words', 1, 2)])
      .replace('data-text-mode="plain"', 'data-text-mode="words"')
      .replace(
        '>words</span>',
        '><span data-word-start="1" data-word-duration="1">你</span><span data-word-start="2" data-word-duration="1">好</span></span>',
      );
    const moved = read(
      applyTextOverlayPatches(html, [{ kind: 'timing', cueId: 'words', start: 2, duration: 4 }]),
    );
    expect(moved.cues[0].words).toEqual([
      { start: 2, duration: 2, text: '你' },
      { start: 4, duration: 2, text: '好' },
    ]);
    const edited = read(
      applyTextOverlayPatches(serializeTextHtml(moved.document), [
        { kind: 'text', cueId: 'words', text: '你好 test!' },
      ]),
    );
    expect(edited.cues[0].text).toBe('你好 test!');
    expect(edited.cues[0].words.map((word) => word.text)).toEqual(['你', '好 ', 'test!']);
    expect(edited.cues[0].words.at(-1).start + edited.cues[0].words.at(-1).duration).toBeCloseTo(
      6,
      3,
    );
  });
  it('keeps language occurrences and unrelated unindexed wrappers when editing/removing a cue', () => {
    const html = documentHtml([cue('multi', 1, 2)])
      .replace(
        '>multi</span>',
        '><span data-lang="zh">你好</span>\n<span data-lang="en">hello</span></span>',
      )
      .replace(
        '<div class="clip hf-cue"',
        '<section data-decoration="keep"><div class="clip hf-cue"',
      )
      .replace('</div></div></body>', '</div></section></div></body>');
    const edited = read(
      applyTextOverlayPatches(html, [
        { kind: 'text', cueId: 'multi', text: '中文\nEnglish\nthird' },
      ]),
    );
    expect(
      [...edited.cues[0].element.querySelectorAll('[data-lang]')].map((node) => [
        node.getAttribute('data-lang'),
        node.textContent,
      ]),
    ).toEqual([
      ['zh', '中文'],
      ['en', 'English'],
    ]);
    expect(edited.cues[0].text).toBe('中文\nEnglish\nthird');
    const languageStyle = read(
      applyTextOverlayPatches(serializeTextHtml(edited.document), [
        {
          kind: 'styleVar',
          scope: { type: 'cueLang', cueId: 'multi', lang: 'en' },
          vars: { '--libtvSubtitleColor': '#00FF00' },
        },
      ]),
    );
    expect(
      languageStyle.cues[0].element
        .querySelector('[data-lang=en]')
        .style.getPropertyValue('--libtvSubtitleColor'),
    ).toBe('#00FF00');
    expect(
      languageStyle.cues[0].element
        .querySelector('[data-lang=zh]')
        .style.getPropertyValue('--libtvSubtitleColor'),
    ).toBe('');
    expect(languageStyle.cues[0].element.style.getPropertyValue('--libtvSubtitleColor')).toBe('');
    expect(
      applyTextOverlayPatches(serializeTextHtml(edited.document), [
        {
          kind: 'styleVar',
          scope: { type: 'unknown', cueId: 'multi' },
          vars: { '--libtvSubtitleColor': 'red' },
        },
      ]).ok,
    ).toBe(false);
    const removed = read(
      applyTextOverlayPatches(serializeTextHtml(edited.document), [
        { kind: 'removeCue', cueId: 'multi' },
      ]),
    );
    expect(removed.document.querySelector('[data-decoration=keep]')).toBeTruthy();
  });
});
