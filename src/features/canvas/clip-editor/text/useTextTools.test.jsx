import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readClipTextHtml } from '../../../../services/clip-text-source.js';
import { useTextTools } from './useTextTools.js';
vi.mock('../../../../services/clip-text-source.js', () => ({ readClipTextHtml: vi.fn() }));
const controls = () =>
  Object.fromEntries(
    ['installTextTools', 'onTextLoaded', 'onTextLoadStatus'].map((name) => [name, vi.fn()]),
  );
const map = (url) => `/mapped${url}`;
const state = (url, session = {}) => ({ draftSession: session, timeline: { overlayHtmlUrl: url } });
describe('ordinary text source cancellation and retry', () => {
  it('keeps URL reads out of raw documents, cancels old owners and ignores late results', async () => {
    const requests = [];
    vi.mocked(readClipTextHtml).mockImplementation(
      (url, { signal }) => new Promise((resolve) => requests.push({ url, signal, resolve })),
    );
    const first = controls(),
      second = controls(),
      original = state('/a.html');
    const { rerender, unmount } = renderHook(
      ({ value, controller }) => useTextTools(value, controller, map),
      { initialProps: { value: original, controller: first } },
    );
    expect(first.onTextLoadStatus).toHaveBeenCalledWith('url:/a.html');
    expect(requests[0].url).toBe('/mapped/a.html');
    rerender({ value: state('/b.html'), controller: second });
    expect(requests[0].signal.aborted).toBe(true);
    await act(async () => requests[0].resolve('old document'));
    expect(first.onTextLoaded).not.toHaveBeenCalled();
    expect(second.onTextLoaded).not.toHaveBeenCalled();
    await act(async () => requests[1].resolve('new document'));
    expect(second.onTextLoaded).toHaveBeenCalledWith('url:/b.html', 'new document');
    expect(original.timeline).toEqual({ overlayHtmlUrl: '/a.html' });
    unmount();
  });
  it('times out visibly, ignores an aborted reader that resolves later, and retries the same URL', async () => {
    vi.useFakeTimers();
    try {
      const pending = [],
        controller = controls(),
        original = state('/slow.html');
      vi.mocked(readClipTextHtml).mockImplementation(
        (_url, { signal }) => new Promise((resolve) => pending.push({ signal, resolve })),
      );
      const { rerender, unmount } = renderHook(
        ({ value }) => useTextTools(value, controller, map),
        { initialProps: { value: original } },
      );
      await act(async () => vi.advanceTimersByTime(15000));
      expect(pending[0].signal.aborted).toBe(true);
      expect(controller.onTextLoadStatus).toHaveBeenLastCalledWith(
        'url:/slow.html',
        '文字HTML加载超时，请重试',
      );
      await act(async () => pending[0].resolve('late'));
      expect(controller.onTextLoaded).not.toHaveBeenCalled();
      rerender({ value: { ...original, textRetry: 1 } });
      await act(async () => pending[1].resolve('retry document'));
      expect(controller.onTextLoaded).toHaveBeenCalledWith('url:/slow.html', 'retry document');
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
