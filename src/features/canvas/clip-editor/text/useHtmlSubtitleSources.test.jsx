import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useHtmlSubtitleSources } from './useHtmlSubtitleSources.js';
import { createSubtitleHtml, readSubtitleHtml } from './html-document.js';
import { readClipTextHtml } from '../../../../services/clip-text-source.js';
vi.mock('../../../../services/clip-text-source.js', () => ({ readClipTextHtml: vi.fn() }));
const html = createSubtitleHtml({
  compositionId: 'source',
  width: 1920,
  height: 1080,
  duration: 5,
  cues: [{ cueId: 'one', text: '库字幕', start: 0, duration: 2, trackIndex: 0 }],
});
const mapUrl = (url) => url;
const state = (node = 'video') => ({
  draftSession: {},
  initialized: true,
  timeline: {
    clips: [
      {
        id: 'a',
        sourceNodeId: node,
        type: 'video',
        startTime: 0,
        sourceOffset: 0,
        duration: 5,
        subtitleHtmlUrl: '/same.html',
      },
    ],
  },
});
function setup(initial) {
  let current = initial;
  const controller = {
    getState: () => current,
    onHtmlSubtitleLoaded: vi.fn(),
    onHtmlSubtitleLoadStatus: vi.fn(),
  };
  const hook = renderHook(
    ({ value }) => {
      current = value;
      return useHtmlSubtitleSources(value, controller, mapUrl);
    },
    { initialProps: { value: initial } },
  );
  return { ...hook, controller };
}
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
describe('HTML subtitle async source ownership', () => {
  it('deduplicates shared URLs but materializes separate node/clip ownership', async () => {
    readClipTextHtml.mockResolvedValue(html);
    const initial = state();
    initial.timeline.clips.push({ ...initial.timeline.clips[0], id: 'b', sourceNodeId: 'other' });
    const { controller, unmount } = setup(initial);
    await waitFor(() => expect(controller.onHtmlSubtitleLoaded).toHaveBeenCalledOnce());
    expect(readClipTextHtml).toHaveBeenCalledOnce();
    const layers = controller.onHtmlSubtitleLoaded.mock.calls[0][1];
    expect(layers.map((layer) => readSubtitleHtml(layer.html).cues[0].clipId)).toEqual(['a', 'b']);
    expect(layers.every((layer) => layer.sourceHtml === html)).toBe(true);
    unmount();
  });
  it('aborts old requests and ignores late results after session ownership changes', async () => {
    const pending = [];
    readClipTextHtml.mockImplementation(
      (_url, options) =>
        new Promise((resolve) => pending.push({ resolve, signal: options.signal })),
    );
    const first = state(),
      { controller, rerender, unmount } = setup(first);
    await waitFor(() => expect(pending).toHaveLength(1));
    rerender({ value: state('new') });
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0].signal.aborted).toBe(true);
    await act(async () => {
      pending[0].resolve(html);
      await Promise.resolve();
    });
    expect(controller.onHtmlSubtitleLoaded).not.toHaveBeenCalled();
    await act(async () => {
      pending[1].resolve(html);
    });
    expect(controller.onHtmlSubtitleLoaded.mock.calls[0][1][0].nodeId).toBe('new');
    unmount();
  });
  it('waits for actual media initialization before freezing library clip windows', async () => {
    readClipTextHtml.mockResolvedValue(html);
    const initial = { ...state(), initialized: false },
      { controller, rerender, unmount } = setup(initial);
    await waitFor(() => expect(readClipTextHtml).toHaveBeenCalledOnce());
    await act(async () => {
      await Promise.resolve();
    });
    expect(controller.onHtmlSubtitleLoaded).not.toHaveBeenCalled();
    rerender({ value: { ...initial, initialized: true } });
    await waitFor(() => expect(controller.onHtmlSubtitleLoaded).toHaveBeenCalledOnce());
    expect(readClipTextHtml).toHaveBeenCalledOnce();
    unmount();
  });
  it('reports a bounded timeout and allows the same plan to retry without consuming the archive', async () => {
    vi.useFakeTimers();
    readClipTextHtml.mockImplementation(() => new Promise(() => {}));
    const initial = state(),
      { controller, rerender, unmount } = setup(initial);
    await act(async () => {
      vi.advanceTimersByTime(15001);
    });
    expect(controller.onHtmlSubtitleLoadStatus).toHaveBeenLastCalledWith(
      expect.any(String),
      'HTML字幕加载超时，请重试',
    );
    expect(controller.onHtmlSubtitleLoaded).not.toHaveBeenCalled();
    readClipTextHtml.mockResolvedValue(html);
    await act(async () => {
      rerender({ value: { ...initial, htmlSubtitleRetry: 1 } });
    });
    expect(controller.onHtmlSubtitleLoaded).toHaveBeenCalledOnce();
    unmount();
  });
  it('retains malformed archive errors and never treats them as an empty writable document', () => {
    const initial = state();
    initial.timeline.subtitlesHtml = [];
    const { controller, result, unmount } = setup(initial);
    expect(result.current.error.message).toContain('无法读取');
    expect(controller.onHtmlSubtitleLoadStatus).toHaveBeenCalledWith(
      'invalid',
      expect.stringContaining('无法读取'),
    );
    expect(controller.onHtmlSubtitleLoaded).not.toHaveBeenCalled();
    unmount();
  });
});
