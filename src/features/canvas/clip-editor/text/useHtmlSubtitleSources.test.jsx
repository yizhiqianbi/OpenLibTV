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
  it('defers legacy transport validation and retries an empty rejected document instead of caching it as valid', async () => {
    readClipTextHtml.mockResolvedValue(
      '<html><body data-width="320" data-height="180"></body></html>',
    );
    const initial = state(),
      { controller, rerender, unmount } = setup(initial);
    await waitFor(() => expect(controller.onHtmlSubtitleLoaded).toHaveBeenCalledOnce());
    expect(readClipTextHtml.mock.calls[0][1]).toMatchObject({ requireComposition: false });
    expect(controller.onHtmlSubtitleLoaded.mock.calls[0][1]).toEqual([]);
    expect(controller.onHtmlSubtitleLoaded.mock.calls[0][2][0].error).toContain('没有可读取的字幕');
    readClipTextHtml.mockResolvedValue(html);
    rerender({ value: { ...initial, htmlSubtitleRetry: 1 } });
    await waitFor(() => expect(controller.onHtmlSubtitleLoaded).toHaveBeenCalledTimes(2));
    expect(readClipTextHtml).toHaveBeenCalledTimes(2);
    expect(controller.onHtmlSubtitleLoaded.mock.calls[1][1]).toHaveLength(1);
    unmount();
  });
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
  it('does not turn media initialization into an implicit retry of rejected remote HTML', async () => {
    readClipTextHtml.mockRejectedValue(new Error('remote failed'));
    const initial = { ...state(), initialized: false };
    const { controller, rerender, unmount } = setup(initial);
    await waitFor(() => expect(controller.onHtmlSubtitleLoaded).toHaveBeenCalledOnce());
    rerender({ value: { ...initial, initialized: true } });
    await act(async () => {
      await Promise.resolve();
    });
    expect(controller.onHtmlSubtitleLoaded).toHaveBeenCalledOnce();
    expect(readClipTextHtml).toHaveBeenCalledOnce();
    expect(controller.onHtmlSubtitleLoaded.mock.calls[0][1]).toEqual([]);
    expect(controller.onHtmlSubtitleLoaded.mock.calls[0][2][0].error).toBe('remote failed');
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
    expect(controller.onHtmlSubtitleLoaded).toHaveBeenLastCalledWith(
      expect.any(String),
      [],
      [expect.objectContaining({ error: 'HTML字幕加载超时，请重试' })],
    );
    controller.onHtmlSubtitleLoaded.mockClear();
    readClipTextHtml.mockResolvedValue(html);
    await act(async () => {
      rerender({ value: { ...initial, htmlSubtitleRetry: 1 } });
    });
    expect(controller.onHtmlSubtitleLoaded).toHaveBeenCalledOnce();
    unmount();
  });
  it('retains valid layers after parse/network rejection and retries failed sources without re-reading valid URLs', async () => {
    let retry = false;
    readClipTextHtml.mockImplementation(async (url) => {
      if (url === '/parse.html' && !retry) return '<p>missing composition</p>';
      if (url === '/network.html' && !retry) throw new Error('网络暂时不可用');
      return html;
    });
    const initial = state();
    initial.timeline.clips.push(
      {
        ...initial.timeline.clips[0],
        id: 'b',
        sourceNodeId: 'parse',
        subtitleHtmlUrl: '/parse.html',
      },
      {
        ...initial.timeline.clips[0],
        id: 'c',
        sourceNodeId: 'network',
        subtitleHtmlUrl: '/network.html',
      },
    );
    const { controller, rerender, unmount } = setup(initial);
    await waitFor(() => expect(controller.onHtmlSubtitleLoaded).toHaveBeenCalledOnce());
    const [, layers, failures] = controller.onHtmlSubtitleLoaded.mock.calls[0];
    expect(layers.map((layer) => layer.nodeId)).toEqual(['video']);
    expect(readSubtitleHtml(layers[0].html).cues[0].clipId).toBe('a');
    expect(failures.map((failure) => failure.nodeId)).toEqual(['parse', 'network']);
    expect(failures.find((failure) => failure.nodeId === 'network').error).toBe('网络暂时不可用');
    retry = true;
    rerender({ value: { ...initial, htmlSubtitleRetry: 1 } });
    await waitFor(() => expect(controller.onHtmlSubtitleLoaded).toHaveBeenCalledTimes(2));
    expect(controller.onHtmlSubtitleLoaded.mock.calls[1][1]).toHaveLength(3);
    expect(controller.onHtmlSubtitleLoaded.mock.calls[1][2]).toEqual([]);
    expect(readClipTextHtml.mock.calls.filter(([url]) => url === '/same.html')).toHaveLength(1);
    expect(readClipTextHtml.mock.calls.filter(([url]) => url === '/parse.html')).toHaveLength(2);
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
