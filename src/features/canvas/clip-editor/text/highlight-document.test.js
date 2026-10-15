import { describe, expect, it } from 'vitest';
import { createSubtitleHtml, createTextOverlayHtml, readSubtitleHtml } from './html-document.js';
import { patchHtmlSubtitle } from './subtitle-archive.js';
import { applyTextOverlayPatches } from './html-patches.js';
import { htmlSubtitleStylePatches, readHtmlSubtitleStyle } from './subtitle-style-document.js';
const base = (text = '你好，world!') =>
  createSubtitleHtml({
    compositionId: 'sub',
    width: 1920,
    height: 1080,
    duration: 10,
    cues: [{ cueId: 'one', clipId: 'a', start: 2, duration: 3, trackIndex: 0, text }],
  });
const enable = { kind: 'wordHighlight', cueId: 'one', enabled: true };
const words = (result) =>
  [...result.model.cues[0].element.querySelectorAll('[data-word-start]')].map((word) => [
    word.textContent,
    Number(word.getAttribute('data-word-start')),
    Number(word.getAttribute('data-word-duration')),
  ]);
describe('source lM/lP word highlight document', () => {
  it('uses equal token durations, keeps punctuation and inserts the exact two source CSS clocks once', () => {
    const result = patchHtmlSubtitle(base(), [enable]);
    expect(result.ok).toBe(true);
    expect(words(result)).toEqual([
      ['你', 2, 1],
      ['好，', 3, 1],
      ['world!', 4, 1],
    ]);
    expect(result.model.cues[0].element.getAttribute('data-text-mode')).toBe('words');
    const style = result.model.document.getElementById('libtv-subtitle-karaoke-highlight-style');
    expect(style.textContent).toContain('animation-duration: 1ms, var(--libtv-karaoke-duration)');
    expect(style.textContent).toContain('animation-fill-mode: forwards, none');
    const repeated = patchHtmlSubtitle(result.html, [enable]);
    expect(repeated.changed).toBe(false);
    expect(
      repeated.model.document.querySelectorAll('#libtv-subtitle-karaoke-highlight-style'),
    ).toHaveLength(1);
  });
  it('preserves valid irregular source word timing and makes zero-duration highlights last one millisecond', () => {
    const raw = base().replace(
      '你好，world!',
      '<span data-word-start="2.125" data-word-duration="0">原</span><em><span data-word-start="3" data-word-duration="1.5">始词</span></em>',
    );
    const result = patchHtmlSubtitle(raw, [enable]);
    expect(words(result)).toEqual([
      ['原', 2.125, 0],
      ['始词', 3, 1.5],
    ]);
    expect(
      result.model.cues[0].element
        .querySelector('[data-word-start]')
        .style.getPropertyValue('--libtv-karaoke-duration'),
    ).toBe('0.001s');
    expect(result.model.cues[0].element.querySelector('em').textContent).toBe('始词');
  });
  it('rebuilds incomplete words within each language over the whole cue while preserving markup and loose text', () => {
    const raw = base().replace(
      '你好，world!',
      '<span data-lang="zh"><b data-word-duration="1">你好</b></span>\n<span data-lang="en">Hello world!</span><i> 旁白</i>',
    );
    const result = patchHtmlSubtitle(raw, [enable]);
    expect(words(result)).toEqual([
      ['你', 2, 1.5],
      ['好', 3.5, 1.5],
      ['Hello ', 2, 1.5],
      ['world!', 3.5, 1.5],
      [' 旁', 2, 1.5],
      ['白', 3.5, 1.5],
    ]);
    expect(result.model.cues[0].element.querySelector('b').hasAttribute('data-word-start')).toBe(
      false,
    );
    expect(result.model.cues[0].element.querySelector('b').textContent).toBe('你好');
    expect(result.model.cues[0].text).toBe('你好\nHello world! 旁白');
  });
  it('disables only karaoke ownership, retains word timing, colors and literal text, and cannot enable blank text', () => {
    const on = patchHtmlSubtitle(base(), [{ ...enable, textColor: 'rgba(255, 0, 0, 0.37)' }]);
    const off = patchHtmlSubtitle(on.html, [{ ...enable, enabled: false }]);
    expect(words(off)).toEqual(words(on));
    expect(off.model.cues[0].element.hasAttribute('data-libtv-word-highlight')).toBe(false);
    expect(off.model.cues[0].element.querySelectorAll('[data-libtv-karaoke-unit]')).toHaveLength(0);
    expect(readHtmlSubtitleStyle(off.model, 'one').highlightTextColor).toBe(
      'rgba(255, 0, 0, 0.37)',
    );
    expect(
      patchHtmlSubtitle(base('  '), [enable]).model.cues[0].element.hasAttribute(
        'data-libtv-word-highlight',
      ),
    ).toBe(false);
  });
  it('retimes newly edited highlighted words and their clocks without reverting to length-weighted timing', () => {
    const on = patchHtmlSubtitle(base(), [enable]);
    const edited = patchHtmlSubtitle(on.html, [
      { kind: 'text', cueId: 'one', text: 'A longer-word' },
      { kind: 'timing', cueId: 'one', start: 4, duration: 4 },
    ]);
    expect(words(edited)).toEqual([
      ['A ', 4, 2],
      ['longer-word', 6, 2],
    ]);
    expect(
      [...edited.model.cues[0].element.querySelectorAll('[data-libtv-karaoke-unit]')].map((word) =>
        word.style.getPropertyValue('--libtv-karaoke-start'),
      ),
    ).toEqual(['4s', '6s']);
  });
  it('keeps a preset on a pure enable toggle, clears it on color changes and rejects ordinary-text use atomically', () => {
    const preset = patchHtmlSubtitle(base(), [
      { kind: 'textPresetId', cueId: 'one', presetId: 'gold' },
    ]);
    const on = patchHtmlSubtitle(
      preset.html,
      htmlSubtitleStylePatches('one', { wordHighlightEnabled: true }, {}, 1),
    );
    expect(on.model.cues[0].element.getAttribute('data-libtv-text-preset-id')).toBe('gold');
    const colored = patchHtmlSubtitle(
      on.html,
      htmlSubtitleStylePatches('one', { highlightBackgroundColor: 'rgba(0, 0, 255, 0)' }, {}, 1),
    );
    expect(readHtmlSubtitleStyle(colored.model, 'one')).toMatchObject({
      wordHighlightEnabled: true,
      highlightBackgroundColor: 'rgba(0, 0, 255, 0)',
    });
    expect(colored.model.cues[0].element.hasAttribute('data-libtv-text-preset-id')).toBe(false);
    const ordinaryHtml = createTextOverlayHtml({
      compositionId: 'text',
      width: 1920,
      height: 1080,
      duration: 10,
      cues: [{ cueId: 'one', start: 2, duration: 3, trackIndex: 0, text: '普通文字' }],
    });
    const ordinary = applyTextOverlayPatches(ordinaryHtml, [enable]);
    expect(ordinary.ok).toBe(false);
    expect(ordinary.html).toBe(ordinaryHtml);
    expect(ordinary.issues[0].code).toBe('subtitle-only');
    expect(readSubtitleHtml(colored.html).ok).toBe(true);
  });
});
