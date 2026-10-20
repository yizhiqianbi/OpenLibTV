import { describe, expect, it, vi } from 'vitest';
import { createSubtitleHtml, readSubtitleHtml } from './html-document.js';
import {
  convertSubtitleToEditable,
  retrofitSubtitleStyles,
  subtitleStyleCompatibility,
  subtitleFieldAllowed,
  subtitlePatchesAllowed,
} from './subtitle-style-compatibility.js';
import { readHtmlSubtitleStyle } from './subtitle-style-document.js';
import { createHtmlSubtitleTools } from './html-subtitle-tools.js';
import { htmlSubtitleLoadPlan } from '../domain/html-subtitle-sources.js';
import { describeSubtitleEditing } from '../domain/subtitle-ownership-model.js';

const sample = (css) =>
  createSubtitleHtml({
    compositionId: 'sub',
    width: 1920,
    height: 1080,
    duration: 6,
    cues: [{ cueId: 'one', text: '保留的字幕', start: 0, duration: 2, trackIndex: 0 }],
  }).replace(/<style>[\s\S]*?<\/style>/, `<style>${css}</style>`);
const readonlyCss =
  '@keyframes original { to { font-family: A; font-size: 40px; font-weight: 600; line-height: 1.4; color: red; letter-spacing: 2px; text-shadow: none; -webkit-text-stroke: 1px black; } }';
describe('source subtitle style retrofit and editability', () => {
  it('makes fixed stylesheet and inline values editable without replacing the source layout or text', () => {
    const original = sample(
      '.hf-text { font-size: 42px !important; color: rgb(2, 3, 4); text-shadow: 0 2px 4px rgba(0,0,0,.6); } .box { transform: translate(5px,6px); }',
    ).replace('class="hf-text"', 'class="hf-text" style="font-weight: 700; letter-spacing: 3px"');
    const result = retrofitSubtitleStyles(original);
    expect(result.compatibility.level).toBe('L0');
    expect(result.html).toContain('color-scheme: dark !important');
    expect(result.html).toContain('[data-libtv-hidden="true"]');
    expect(result.html).toContain('font-size: var(--libtvSubtitleFontSize, 42px) !important');
    expect(result.html).toContain('transform: translate(5px,6px)');
    const model = readSubtitleHtml(result.html);
    expect(model.cues[0].text).toBe('保留的字幕');
    expect(readHtmlSubtitleStyle(model, 'one', { width: 1920, height: 1080 })).toMatchObject({
      fontSizePx: 42,
      fontWeight: 700,
      letterSpacingPx: 3,
      color: 'rgb(2, 3, 4)',
    });
    expect(retrofitSubtitleStyles(result.html).html).toBe(result.html);
  });
  it('keeps comments, strings, data URLs, nested functions and custom properties intact', () => {
    const css =
      '.hf-text { --literal: "font: blocked; color: red"; content:"};color:red;{"; background: url("data:image/svg+xml;utf8,a:b"); /* untouched */ color: rgb(1, 2, 3); }';
    const result = retrofitSubtitleStyles(sample(css));
    expect(result.compatibility.level).toBe('L0');
    for (const literal of [
      '--literal: "font: blocked; color: red"',
      'content:"};color:red;{"',
      'url("data:image/svg+xml;utf8,a:b")',
    ])
      expect(result.html).toContain(literal);
    expect(result.html).toContain('var(--libtvSubtitleColor, rgb(1, 2, 3))');
  });
  it('ignores font-face and rewrites nested media/support rules while keyframes block only their properties', () => {
    const css =
      '@font-face {font-family: Original; src:url("https://example.com/font.woff2")} @media (min-width:1px) { @supports(display:flex) { .hf-text {font-size:40px;color:blue;} } } @keyframes pulse { from {color:red;} to {color:blue;} }';
    const result = retrofitSubtitleStyles(sample(css));
    expect(result.html).toContain('@font-face {font-family: Original;');
    expect(result.html).toContain('font-size:var(--libtvSubtitleFontSize, 40px)');
    expect(result.html).toContain('from {color:red;}');
    expect(result.compatibility).toMatchObject({ level: 'L1', disabledStyleProperties: ['color'] });
    expect(subtitleFieldAllowed(result.compatibility, 'fontSizePx')).toBe(true);
    expect(subtitleFieldAllowed(result.compatibility, 'color')).toBe(false);
  });
  it('reserves all four font controls for font shorthand and retains blocked declarations', () => {
    const result = retrofitSubtitleStyles(
      sample('.hf-text { font: italic 36px/1.2 "Original"; color: red; }'),
    );
    expect(result.compatibility.level).toBe('L1');
    for (const key of ['fontFamily', 'fontSizePx', 'fontWeight', 'lineHeightPct'])
      expect(subtitleFieldAllowed(result.compatibility, key)).toBe(false);
    expect(subtitleFieldAllowed(result.compatibility, 'color')).toBe(true);
    expect(result.html).toContain('font: italic 36px/1.2 "Original"');
    expect(
      subtitlePatchesAllowed(result.compatibility, [
        { kind: 'styleVar', vars: { '--libtvSubtitleFontSize': '10px' } },
      ]),
    ).toBe(false);
    expect(
      subtitlePatchesAllowed(result.compatibility, [
        { kind: 'text', cueId: 'one', text: '仍可编辑' },
      ]),
    ).toBe(true);
  });
  it.each(['1px rgb(1, 2, 3)', 'red 2px', '0'])(
    'retrofitting stroke %s preserves fallback and both browser spellings',
    (stroke) => {
      const result = retrofitSubtitleStyles(sample(`.hf-text{-webkit-text-stroke:${stroke};}`));
      expect(result.compatibility.level).toBe('L0');
      expect(result.html).toContain('text-stroke:var(--libtvSubtitleStrokeWidth,');
      expect(retrofitSubtitleStyles(result.html).html).toBe(result.html);
    },
  );
  it('does not guess an unsupported stroke expression and gives the strongest restriction precedence', () => {
    const result = retrofitSubtitleStyles(
      sample(
        '.hf-text{color:var(--libtvSubtitleColor,red);-webkit-text-stroke:calc(1px + 2px) blue;} @keyframes c{to{color:red}}',
      ),
    );
    expect(result.compatibility.properties.color).toBe('blocked');
    expect(result.compatibility.properties['-webkit-text-stroke']).toBe('blocked');
    expect(subtitleFieldAllowed(result.compatibility, 'strokeWidthPx')).toBe(false);
    expect(result.html).toContain('calc(1px + 2px) blue');
  });
  it('keeps all-blocked source content as L2 and refuses every edit including layout and cue deletion', () => {
    const original = sample(readonlyCss);
    const result = retrofitSubtitleStyles(original);
    expect(result.compatibility).toMatchObject({ level: 'L2', readOnly: true });
    expect(result.html).toContain('@keyframes original');
    for (const property of [
      'font-family: A',
      'font-size: 40px',
      'color: red',
      'text-shadow: none',
      '-webkit-text-stroke: 1px black',
    ])
      expect(result.html).toContain(property);
    expect(result.html).not.toContain('var(--libtvSubtitle');
    expect(readSubtitleHtml(result.html).cues[0].text).toBe('保留的字幕');
    expect(subtitleFieldAllowed(result.compatibility, 'xPct')).toBe(false);
    expect(
      subtitlePatchesAllowed(result.compatibility, [{ kind: 'removeCue', cueId: 'one' }]),
    ).toBe(false);
  });
  it('converts L2 only through an explicit operation, removes animation entry points and preserves cue content/layout', () => {
    const original = sample(
      `${readonlyCss} .hf-text { animation: original 2s linear infinite; position:absolute; }`,
    );
    const before = readSubtitleHtml(original);
    const result = convertSubtitleToEditable(original);
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.compatibility).toMatchObject({
      convertedFrom: 'L2',
      lostAnimation: true,
      level: 'L0',
    });
    expect(result.html).not.toMatch(/@keyframes|animation\s*:/i);
    const after = readSubtitleHtml(result.html);
    expect(after.cues[0].text).toBe(before.cues[0].text);
    expect(after.cues[0].start).toBe(before.cues[0].start);
    expect(after.cues[0].duration).toBe(before.cues[0].duration);
    expect(convertSubtitleToEditable(result.html).html).toBe(result.html);
  });
  it('keeps source ownership/readiness for readonly layers and guards actual controller actions', () => {
    const html = sample(readonlyCss);
    let session = {
      draftSession: {},
      ready: true,
      htmlSubtitleStatus: 'ready',
      timeline: {
        clips: [
          {
            id: 'clip',
            sourceNodeId: 'video',
            type: 'video',
            duration: 6,
            startTime: 0,
            sourceOffset: 0,
          },
        ],
        currentTime: 0,
        totalDuration: 6,
        subtitlesHtml: { video: { htmlInline: html } },
      },
    };
    const acceptEdit = vi.fn(),
      notify = vi.fn();
    const tools = createHtmlSubtitleTools({
      getSession: () => session,
      current: () => true,
      publish: (next) => {
        session = next;
      },
      acceptEdit,
      notify,
      pause: vi.fn(),
      seek: vi.fn(),
    });
    const plan = htmlSubtitleLoadPlan(session.timeline);
    tools.controls.onHtmlSubtitleLoaded(plan.key, [{ key: 'video', nodeId: 'video', html }]);
    expect(session.htmlSubtitleSourceStates[0].status).toBe('readonly');
    expect(describeSubtitleEditing(session)).toMatchObject({
      ownsHtml: true,
      active: true,
      readiness: 'ready',
    });
    expect(tools.controls.onSelectHtmlSubtitle({ key: 'video', cueId: 'one' })).toBe(true);
    const before = session.timeline;
    expect(tools.controls.onHtmlSubtitleTextChange('不能写入')).toBe(false);
    expect(tools.controls.onDeleteHtmlSubtitle()).toBe(false);
    expect(tools.controls.onEditHtmlSubtitle({ fields: { xPct: 20 } })).toBe(false);
    expect(tools.controls.onBeginHtmlSubtitleStyle({ field: 'color' })).toBeNull();
    expect(tools.controls.onAddHtmlSubtitle({ key: 'video', force: true })).toBe(false);
    expect(session.timeline).toBe(before);
    expect(acceptEdit).not.toHaveBeenCalled();
  });
  it('converts the selected L2 layer through the real HTML tool transaction and leaves the source selection intact', () => {
    const html = sample(`${readonlyCss} .hf-text { animation: original 2s linear infinite; }`);
    let session = {
      draftSession: {},
      ready: true,
      htmlSubtitleStatus: 'ready',
      timeline: {
        clips: [
          {
            id: 'clip',
            sourceNodeId: 'video',
            type: 'video',
            duration: 6,
            startTime: 0,
            sourceOffset: 0,
          },
        ],
        currentTime: 0,
        totalDuration: 6,
        subtitlesHtml: { video: { htmlInline: html } },
      },
    };
    const acceptEdit = vi.fn(({ timeline }) => {
      session = { ...session, timeline };
      return true;
    });
    const tools = createHtmlSubtitleTools({
      getSession: () => session,
      current: () => true,
      publish: (next) => {
        session = next;
      },
      acceptEdit,
      notify: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
    });
    const plan = htmlSubtitleLoadPlan(session.timeline);
    tools.controls.onHtmlSubtitleLoaded(plan.key, [{ key: 'video', nodeId: 'video', html }]);
    expect(tools.controls.onSelectHtmlSubtitle({ key: 'video', cueId: 'one' })).toBe(true);
    expect(tools.controls.onConvertHtmlSubtitle()).toBe(true);
    const converted = session.timeline.subtitlesHtml.video.htmlInline;
    expect(converted).not.toMatch(/@keyframes|animation\s*:/i);
    expect(readSubtitleHtml(converted).cues[0].text).toBe('保留的字幕');
    expect(session.selectedHtmlSubtitle).toMatchObject({ key: 'video', cueId: 'one' });
    expect(acceptEdit).toHaveBeenCalledTimes(1);
  });
  it('classifies an inert document without mutating it and rejects unknown contracts before rewriting', () => {
    const original = sample('.hf-text{font:30px sans-serif;color:red;}');
    const model = readSubtitleHtml(original),
      before = model.document.documentElement.outerHTML;
    expect(subtitleStyleCompatibility(model.document).level).toBe('L1');
    expect(model.document.documentElement.outerHTML).toBe(before);
    expect(() =>
      retrofitSubtitleStyles(original.replace('libtv-subtitle/4', 'libtv-subtitle/9')),
    ).toThrow('契约版本');
  });
  it('guards direct L1 callbacks and skips blocked fields in a preset without discarding its valid edits', () => {
    const html = sample('.hf-text {font:32px sans-serif; color:red;}');
    let session = {
      draftSession: {},
      ready: true,
      htmlSubtitleStatus: 'ready',
      timeline: {
        clips: [
          {
            id: 'clip',
            sourceNodeId: 'video',
            type: 'video',
            duration: 6,
            startTime: 0,
            sourceOffset: 0,
          },
        ],
        currentTime: 0,
        totalDuration: 6,
        subtitlesHtml: { video: { htmlInline: html } },
      },
    };
    const notify = vi.fn();
    const acceptEdit = vi.fn(({ timeline }) => {
      session = { ...session, timeline };
      return true;
    });
    const tools = createHtmlSubtitleTools({
      getSession: () => session,
      current: () => true,
      publish: (next) => {
        session = next;
      },
      acceptEdit,
      notify,
      pause: vi.fn(),
      seek: vi.fn(),
    });
    expect(tools.controls.onSelectHtmlSubtitle({ key: 'video', cueId: 'one' })).toBe(true);
    expect(tools.controls.onEditHtmlSubtitle({ fields: { fontSizePx: 80 } })).toBe(false);
    expect(tools.controls.onBeginHtmlSubtitleStyle({ field: 'fontWeight' })).toBeNull();
    expect(acceptEdit).not.toHaveBeenCalled();
    expect(
      tools.controls.onEditHtmlSubtitle({
        preset: { id: 'mixed', fields: { fontSizePx: 80, color: '#123456' } },
      }),
    ).toBe(true);
    const saved = session.timeline.subtitlesHtml.video.htmlInline;
    expect(saved).toContain('font:32px sans-serif');
    expect(saved).not.toContain('--libtvSubtitleFontSize:');
    expect(readHtmlSubtitleStyle(readSubtitleHtml(saved), 'one').color).toBe('#123456');
    expect(tools.controls.onHtmlSubtitleTextChange('仍可修改正文')).toBe(true);
    expect(tools.controls.onCommitHtmlSubtitle()).toBe(true);
    expect(readSubtitleHtml(session.timeline.subtitlesHtml.video.htmlInline).cues[0].text).toBe(
      '仍可修改正文',
    );
  });
});
