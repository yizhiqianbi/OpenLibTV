import { describe, expect, it } from 'vitest';
import { classifySubtitleSources, collectSubtitleSources } from './subtitle-source-mode.js';
const video = (extra = {}) => ({ type: 'video', sourceNodeId: 'video', ...extra });
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

  it('collects source URLs in the source order and keeps clip identity and labels', () => {
    const sources = collectSubtitleSources({
      clips: [
        video({
          id: 'clip-a',
          sourceNodeId: 'node-a',
          subtitleHtmlUrl: ' /a.html ',
          subtitleUrl: '/a.vtt',
        }),
        { type: 'audio', id: 'audio-a', sourceNodeId: 'node-a', subtitleUrl: '/ignored.vtt' },
        video({ id: 'clip-b', sourceNodeId: 'node-b', subtitleUrl: '/b.vtt' }),
      ],
      labelByNodeId: new Map([
        ['node-a', ' 主视频 '],
        ['node-b', '备用视频'],
      ]),
      nodeSubtitleHtmlUrl: '/node.html',
    });
    expect(sources).toEqual([
      { clipId: 'clip-a', nodeId: 'node-a', url: '/a.html', kind: 'html', label: '主视频' },
      { clipId: 'clip-a', nodeId: 'node-a', url: '/a.vtt', kind: 'vtt', label: '主视频' },
      { clipId: 'clip-b', nodeId: 'node-b', url: '/b.vtt', kind: 'vtt', label: '备用视频' },
    ]);
    expect(
      classifySubtitleSources({ clips: [video({ sourceNodeId: 'a', subtitleUrl: '/a.vtt' })] })
        .sources,
    ).toHaveLength(1);
  });

  it('binds the node fallback to the first non-audio source without inventing a clip owner', () => {
    const clips = [
      { type: 'audio', sourceNodeId: 'audio', subtitleHtmlUrl: '/audio.html' },
      video({ id: 'invalid', sourceNodeId: ' ', subtitleHtmlUrl: '/invalid.html' }),
      video({ id: 'one', sourceNodeId: ' first ', subtitleUrl: ' /first.vtt ' }),
      video({ id: 'two', sourceNodeId: 'second', subtitleHtmlUrl: '/second.html' }),
    ];
    const sources = collectSubtitleSources({ clips, nodeSubtitleHtmlUrl: ' /fallback.html ' });
    expect(sources).toEqual([
      { clipId: 'one', nodeId: 'first', url: '/first.vtt', kind: 'vtt' },
      { clipId: 'two', nodeId: 'second', url: '/second.html', kind: 'html' },
      { nodeId: 'first', url: '/fallback.html', kind: 'html' },
    ]);
    expect(
      collectSubtitleSources({ clips, nodeSubtitleHtmlUrl: '/fallback.html', htmlEnabled: false }),
    ).toEqual([sources[0]]);
    expect(
      collectSubtitleSources({ clips: clips.slice(0, 2), nodeSubtitleHtmlUrl: '/fallback.html' }),
    ).toEqual([]);
  });

  it('retains repeated clip references and suppresses a redundant node fallback', () => {
    expect(
      collectSubtitleSources({
        clips: [
          video({ id: 'one', subtitleHtmlUrl: '/shared.html', subtitleUrl: '/shared.vtt' }),
          video({ id: 'copy', subtitleHtmlUrl: '/shared.html', subtitleUrl: '/shared.vtt' }),
        ],
        nodeSubtitleHtmlUrl: '/fallback.html',
        labelByNodeId: new Map([['video', '  ']]),
      }),
    ).toEqual([
      { clipId: 'one', nodeId: 'video', url: '/shared.html', kind: 'html' },
      { clipId: 'one', nodeId: 'video', url: '/shared.vtt', kind: 'vtt' },
      { clipId: 'copy', nodeId: 'video', url: '/shared.html', kind: 'html' },
      { clipId: 'copy', nodeId: 'video', url: '/shared.vtt', kind: 'vtt' },
    ]);
  });
});
