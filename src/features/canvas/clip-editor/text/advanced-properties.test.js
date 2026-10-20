import { describe, expect, it } from 'vitest';
import { normalizeTextMotion } from '../domain/text-motion-model.js';
import { textColor, textColorWithOpacity } from '../domain/text-color-model.js';
import { textOutputScale } from '../domain/text-timing-model.js';
import { createTextOverlayHtml, readTextOverlayHtml } from './html-document.js';
import { applyTextOverlayPatches } from './html-patches.js';
import { projectTextDraft, readTextStyle, textStylePatches } from './document-model.js';
import { readTextMotion } from './motion-document.js';
const initial = () =>
  createTextOverlayHtml({
    compositionId: 'text',
    width: 1920,
    height: 1080,
    duration: 10,
    cues: [
      { cueId: 'one', start: 1, duration: 3, text: '第一条', trackIndex: 0 },
      { cueId: 'two', start: 6, duration: 2, text: '第二条', trackIndex: 1 },
    ],
  });
describe('source ordinary text appearance and motion', () => {
  it('matches source color alpha display, hexadecimal shorthand and rgba generation without losing a zero-alpha color', () => {
    expect(textColor('#f008')).toEqual({ color: '#FF0000', opacityPct: 53 });
    expect(textColor('rgba(10, 20, 30, 0)')).toEqual({ color: '#0A141E', opacityPct: 0 });
    expect(textColor('rgb(10 20 30 / 12.5%)')).toEqual({ color: '#0A141E', opacityPct: 13 });
    expect(textColorWithOpacity('#f00', 62.5)).toBe('rgba(255, 0, 0, 0.625)');
    expect(textColorWithOpacity('#f008', 100)).toBe('#FF0000');
    expect(textColorWithOpacity('red', 50)).toBe('red');
  });
  it('converts output-space numeric input to composition pixels and reads source two-decimal values back', () => {
    const html = initial(),
      model = readTextOverlayHtml(html),
      scale = textOutputScale(model, { width: 960, height: 540 });
    expect(scale).toBe(0.5);
    const result = applyTextOverlayPatches(
      html,
      textStylePatches(
        'one',
        {
          fontSizePx: 45.125,
          letterSpacingPx: -3.125,
          cornerRadiusPx: 12.125,
          backgroundBlurPx: 4.125,
          lineHeightPct: 175,
          backgroundColor: '#FF0000',
          backgroundOpacityPct: 62.5,
          paddingTopPx: 5.125,
          paddingRightPx: 7.25,
          paddingBottomPx: 9,
          paddingLeftPx: 11.5,
        },
        {},
        scale,
      ),
    );
    const parsed = readTextOverlayHtml(result.html),
      cue = parsed.cues[0],
      target = cue.element.querySelector('[data-libtv-text]');
    expect(cue.element.style.getPropertyValue('--libtvSubtitleFontSize')).toBe('90.25px');
    expect(target.style.borderRadius).toBe('24.25px');
    expect(target.style.backdropFilter).toBe('blur(8.25px)');
    expect(target.style.paddingTop).toBe('10.25px');
    expect(target.style.paddingRight).toBe('14.5px');
    expect(target.style.paddingBottom).toBe('18px');
    expect(target.style.paddingLeft).toBe('23px');
    expect(readTextStyle(parsed, 'one', { width: 960, height: 540 })).toMatchObject({
      fontSizePx: 45.13,
      letterSpacingPx: -3.12,
      cornerRadiusPx: 12.13,
      backgroundBlurPx: 4.13,
      paddingTopPx: 5.13,
      paddingRightPx: 7.25,
      paddingBottomPx: 9,
      paddingLeftPx: 11.5,
      backgroundColor: 'rgba(255, 0, 0, 0.625)',
      lineHeightPct: 175,
    });
  });
  it('projects unblurred background controls with retained hue at zero opacity and clamps ordinary bounds', () => {
    const timeline = { clips: [], overlayHtmlInline: initial() };
    const projected = projectTextDraft({
      timeline,
      textDraft: {
        cueId: 'one',
        fields: {
          backgroundColor: '#00FF00',
          backgroundOpacityPct: '0',
          cornerRadiusPx: '999',
          backgroundBlurPx: '101',
        },
      },
    });
    const model = readTextOverlayHtml(projected.overlayHtmlInline),
      style = readTextStyle(model, 'one');
    expect(style).toMatchObject({
      backgroundColor: 'rgba(0, 255, 0, 0)',
      cornerRadiusPx: 200,
      backgroundBlurPx: 100,
    });
    const patches = textStylePatches('one', { backgroundOpacityPct: '75' }, style);
    expect(
      readTextStyle(
        readTextOverlayHtml(applyTextOverlayPatches(projected.overlayHtmlInline, patches).html),
        'one',
      ).backgroundColor,
    ).toBe('rgba(0, 255, 0, 0.75)');
    expect(timeline.overlayHtmlInline).toBe(initial());
  });
  it('uses source animation defaults and bounds, injects one style sheet and preserves the cue clock on move/clone', () => {
    expect(normalizeTextMotion({ type: 'spring-up' })).toEqual({
      type: 'spring-up',
      durationMs: 550,
      delayMs: 0,
      iterations: 1,
      amplitudePx: 8,
    });
    expect(
      normalizeTextMotion({
        type: 'wave',
        durationMs: -1,
        delayMs: 10001,
        iterations: 0,
        amplitudePx: 12.345,
      }),
    ).toEqual({ type: 'wave', durationMs: 100, delayMs: 10000, iterations: 1, amplitudePx: 12.35 });
    const result = applyTextOverlayPatches(initial(), [
      { kind: 'animation', cueId: 'one', type: 'wave', delayMs: 200, iterations: 3 },
      { kind: 'timing', cueId: 'one', start: 2 },
      { kind: 'animation', cueId: 'two', type: 'fade' },
    ]);
    expect(result.ok).toBe(true);
    let model = result.model;
    expect(model.document.querySelectorAll('#libtv-timed-text-motion-style')).toHaveLength(1);
    const target = model.cues[0].element.querySelector('[data-libtv-motion-target]');
    expect(target.style.getPropertyValue('--libtv-text-motion-start')).toBe('2s');
    expect(readTextMotion(model.cues[0].element)).toEqual({
      type: 'wave',
      durationMs: 600,
      delayMs: 200,
      iterations: 3,
      amplitudePx: 8,
    });
    const cloned = applyTextOverlayPatches(result.html, [
      {
        kind: 'addCue',
        cue: { cueId: 'copy', start: 8, duration: 1, trackIndex: 1, text: '复制' },
      },
    ]);
    model = cloned.model;
    expect(
      model.cues
        .find((cue) => cue.cueId === 'copy')
        .element.querySelector('[data-libtv-motion-target]')
        .style.getPropertyValue('--libtv-text-motion-start'),
    ).toBe('8s');
    const none = applyTextOverlayPatches(cloned.html, [
      { kind: 'animation', cueId: 'one', type: 'none' },
    ]);
    expect(none.model.cues[0].element.querySelector('[data-libtv-motion-target]')).toBeNull();
  });
  it('preserves foreign script metadata without claiming its delegated animation is implemented', () => {
    const raw = initial()
      .replace('class="hf-text"', 'class="hf-text hf-anim"')
      .replace('</body>', '<script id="custom-motion">window.customMotion=1</script></body>');
    const delegated = applyTextOverlayPatches(raw, [
      { kind: 'animation', cueId: 'one', type: 'spring-up' },
    ]);
    expect(delegated.ok).toBe(true);
    expect(delegated.html).toContain('window.customMotion=1');
    expect(delegated.model.cues[0].element.getAttribute('data-anim')).toBe('spring-up');
    expect(delegated.model.cues[0].element.querySelector('[data-libtv-motion-target]')).toBeNull();
    const compatible = applyTextOverlayPatches(raw, [
      { kind: 'animation', cueId: 'one', type: 'wave' },
    ]);
    expect(
      compatible.model.cues[0].element.querySelector('[data-libtv-text-motion="wave"]'),
    ).toBeTruthy();
    expect(window.customMotion).toBeUndefined();
  });
});
