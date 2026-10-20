import { describe, expect, it } from 'vitest';
import { describeSubtitleEditing, resolveSubtitleEditing } from './subtitle-ownership-model.js';
import { htmlSubtitleLoadPlan } from './html-subtitle-sources.js';

describe('source HTML subtitle editing ownership', () => {
  it('reserves editing during loading and accepts a partial successful set', () => {
    const knownSourceNodeIds = ['html-a', 'html-b'];
    expect(resolveSubtitleEditing({ knownSourceNodeIds, hasVttCues: true })).toMatchObject({
      ownsHtml: true,
      useHtmlEditor: true,
      readiness: 'loading',
    });
    expect(
      resolveSubtitleEditing({
        knownSourceNodeIds,
        active: true,
        layers: [
          { nodeId: 'html-a', rejected: false },
          { nodeId: 'html-b', rejected: true },
        ],
        hasVttCues: true,
      }),
    ).toMatchObject({ ownsHtml: true, readiness: 'ready' });
  });

  it('releases to VTT only when every known remote HTML layer was rejected', () => {
    const input = {
      knownSourceNodeIds: ['html-a'],
      layers: [{ nodeId: 'html-a', rejected: true }],
      hasVttCues: true,
    };
    expect(resolveSubtitleEditing(input)).toEqual({
      ownsHtml: false,
      useHtmlEditor: false,
      readiness: 'ready',
    });
    expect(resolveSubtitleEditing({ ...input, hasAuthored: true })).toMatchObject({
      ownsHtml: true,
      readiness: 'loading',
    });
    expect(resolveSubtitleEditing({ ...input, loading: true }).ownsHtml).toBe(true);
  });

  it('preserves source switch gates and chooses HTML creation only without an existing VTT source', () => {
    expect(resolveSubtitleEditing().useHtmlEditor).toBe(true);
    expect(resolveSubtitleEditing({ hasVttSource: true }).useHtmlEditor).toBe(false);
    expect(resolveSubtitleEditing({ htmlEnabled: false }).useHtmlEditor).toBe(false);
    expect(resolveSubtitleEditing({ hasHtmlSource: true, previewEnabled: false })).toMatchObject({
      ownsHtml: true,
      readiness: 'disabled',
    });
    expect(resolveSubtitleEditing({ active: true, exportEnabled: false }).readiness).toBe(
      'disabled',
    );
  });

  it('ignores receipts from a previous URL generation and preserves malformed archives', () => {
    const timeline = {
      clips: [{ id: 'clip', type: 'video', sourceNodeId: 'video', subtitleHtmlUrl: '/new.html' }],
      subtitles: { cues: [{ id: 'vtt' }] },
    };
    const plan = htmlSubtitleLoadPlan(timeline);
    const input = {
      timeline,
      htmlSubtitleLoadKey: 'previous',
      htmlSubtitleSourceStates: [{ key: plan.layers[0].key, status: 'rejected' }],
    };
    expect(describeSubtitleEditing(input)).toMatchObject({
      ownsHtml: true,
      readiness: 'loading',
    });
    expect(describeSubtitleEditing({ ...input, htmlSubtitleLoadKey: plan.key })).toMatchObject({
      ownsHtml: false,
      useHtmlEditor: false,
    });
    expect(describeSubtitleEditing({ timeline: { ...timeline, subtitlesHtml: [] } })).toMatchObject(
      { ownsHtml: true, readiness: 'loading', error: expect.any(Error) },
    );
  });
});
