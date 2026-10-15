import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFeatureUpdatesList } from './useFeatureUpdatesList.js';

describe('useFeatureUpdatesList', () => {
  it('starts after the supplied initial page and loads the next page once', async () => {
    const source = {
      initialPage: () => ({ list: [{ id: 'first' }], total: 2 }),
      list: vi.fn(async ({ page }) => ({
        list: [{ id: page === 2 ? 'second' : 'wrong' }],
        total: 2,
      })),
    };
    const view = renderHook(() => useFeatureUpdatesList({ source, pageSize: 1 }));
    expect(view.result.current.items).toEqual([{ id: 'first' }]);
    expect(view.result.current.hasMore).toBe(true);
    await act(async () => view.result.current.loadMore());
    expect(source.list).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 1 }));
    expect(view.result.current.items).toEqual([{ id: 'first' }, { id: 'second' }]);
    expect(view.result.current.hasMore).toBe(false);
  });

  it('retains loaded rows and exposes an error when the next page fails', async () => {
    const source = {
      initialPage: () => ({ list: [{ id: 'first' }], total: 2 }),
      list: vi.fn(async () => {
        throw new Error('offline');
      }),
    };
    const view = renderHook(() => useFeatureUpdatesList({ source, pageSize: 1 }));
    await act(async () => view.result.current.loadMore());
    await waitFor(() => expect(view.result.current.error).toBe(true));
    expect(view.result.current.items).toEqual([{ id: 'first' }]);
    expect(view.result.current.hasMore).toBe(true);
  });

  it('aborts an in-flight page when the source changes', async () => {
    let resolve;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const first = {
      initialPage: () => ({ list: [{ id: 'first' }], total: 2 }),
      list: vi.fn(({ signal }) => {
        signal.addEventListener('abort', () => resolve({ list: [{ id: 'late' }], total: 2 }));
        return pending;
      }),
    };
    const second = {
      initialPage: () => ({ list: [{ id: 'new' }], total: 1 }),
      list: vi.fn(),
    };
    const view = renderHook(({ source }) => useFeatureUpdatesList({ source, pageSize: 1 }), {
      initialProps: { source: first },
    });
    act(() => {
      void view.result.current.loadMore();
    });
    view.rerender({ source: second });
    await waitFor(() => expect(view.result.current.items).toEqual([{ id: 'new' }]));
    expect(first.list).toHaveBeenCalledOnce();
    expect(second.list).not.toHaveBeenCalled();
  });
});
