import { describe, expect, it } from 'vitest';
import { classifySubtitleSources } from './subtitle-source-mode.js';
const video = (extra = {}) => ({ type: 'video', ...extra });
describe('HTML/VTT subtitle source coexistence', () => {
  it('keeps HTML-only and VTT-only branches distinct', () => {
    expect(
      classifySubtitleSources({ clips: [video({ subtitleHtmlUrl: '/caption.html' })] }).mode,
    ).toBe('html');
    expect(classifySubtitleSources({ clips: [video({ subtitleUrl: '/caption.vtt' })] }).mode).toBe(
      'vtt',
    );
  });
  it('preserves both source families when a clip exposes both URLs', () => {
    expect(
      classifySubtitleSources({
        clips: [video({ subtitleUrl: '/caption.vtt', subtitleHtmlUrl: '/caption.html' })],
      }),
    ).toMatchObject({ hasHtml: true, hasVtt: true, mixed: true, mode: 'mixed' });
  });
  it('uses loaded or inline documents after URLs have been materialized', () => {
    expect(
      classifySubtitleSources({ htmlLayers: [{}], timelineSubtitles: { cues: [{ id: 'vtt' }] } }),
    ).toMatchObject({ mixed: true, mode: 'mixed' });
  });
});
