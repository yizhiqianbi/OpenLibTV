import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useActivityList } from './useActivityList.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

describe('activity list requests', () => {
  it('starts at page two after an initial page and deduplicates the next response', async () => {
    const source = {
      list: vi.fn().mockResolvedValue({ list: [{ activityId: 1 }, { activityId: 3 }], total: 3 }),
    };
    const initialPage = { list: [{ activityId: 1 }, { activityId: 2 }], total: 3 };
    const { result } = renderHook(() => useActivityList({ source, initialPage, pageSize: 2 }));
    expect(source.list).not.toHaveBeenCalled();

    await act(async () => result.current.loadMore());
    expect(source.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 2,
      signal: expect.any(AbortSignal),
    });
    expect(result.current.items.map((item) => item.activityId)).toEqual([1, 2, 3]);
    expect(result.current.hasMore).toBe(false);
    await act(async () => result.current.loadMore());
    expect(source.list).toHaveBeenCalledOnce();
  });

  it('keeps loaded cards and retries the failed page rather than advancing', async () => {
    const source = {
      list: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ list: [{ activityId: 2 }], total: 2 }),
    };
    const initialPage = { list: [{ activityId: 1 }], total: 2 };
    const { result } = renderHook(() => useActivityList({ source, initialPage, pageSize: 1 }));
    await act(async () => result.current.loadMore());
    expect(result.current.error).toBe(true);
    expect(result.current.items).toEqual([{ activityId: 1 }]);
    await act(async () => result.current.loadMore());
    expect(source.list.mock.calls.map(([request]) => request.page)).toEqual([2, 2]);
    expect(result.current.error).toBe(false);
    expect(result.current.items).toEqual([{ activityId: 1 }, { activityId: 2 }]);
  });

  it('coalesces concurrent calls and ignores an aborted source after replacement', async () => {
    const old = deferred();
    const source = { list: vi.fn().mockReturnValue(old.promise) };
    const replacement = {
      list: vi.fn().mockResolvedValue({ list: [{ activityId: 9 }], total: 1 }),
    };
    const { result, rerender } = renderHook(({ current }) => useActivityList({ source: current }), {
      initialProps: { current: source },
    });
    const oldSignal = source.list.mock.calls[0][0].signal;
    act(() => {
      void result.current.loadMore();
      void result.current.loadMore();
    });
    expect(source.list).toHaveBeenCalledOnce();
    rerender({ current: replacement });
    await waitFor(() => expect(result.current.items).toEqual([{ activityId: 9 }]));
    expect(oldSignal.aborted).toBe(true);
    await act(async () => old.resolve({ list: [{ activityId: 1 }], total: 1 }));
    expect(result.current.items).toEqual([{ activityId: 9 }]);
  });

  it('aborts on unmount and exposes invalid payloads as retryable errors', async () => {
    const source = { list: vi.fn().mockResolvedValue({ list: null, total: 0 }) };
    const { result, unmount } = renderHook(() => useActivityList({ source }));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.items).toEqual([]);
    const pending = deferred();
    source.list.mockReturnValueOnce(pending.promise);
    act(() => void result.current.loadMore());
    const signal = source.list.mock.calls[1][0].signal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ list: [{ activityId: 4 }], total: 1 }));
  });
});
