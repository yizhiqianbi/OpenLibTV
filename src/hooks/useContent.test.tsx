import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useContent } from './useContent.ts';
import { invalidateContent } from '../services/content.ts';
import { invalidateAssetMap } from '../services/assets.ts';

const response = (value: unknown) =>
  ({
    ok: true,
    status: 200,
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(value)).buffer,
  }) as Response;
beforeEach(() => {
  invalidateContent();
  invalidateAssetMap();
});

describe('content hook', () => {
  it('returns named states, shares requests, and retries after failure', async () => {
    let failed = true;
    const fetcher = vi.fn((url: string) =>
      Promise.resolve(
        url.includes('asset-map')
          ? response({})
          : failed
            ? { ...response(null), ok: false, status: 503 }
            : response({ items: [1] }),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const first = renderHook(() => useContent('hook-content', { items: [] as number[] }));
    const second = renderHook(() => useContent('hook-content', { items: [] as number[] }));
    expect(first.result.current.loading).toBe(true);
    await waitFor(() => expect(first.result.current.error).not.toBeNull());
    expect(second.result.current.error).toBe(first.result.current.error);
    expect(fetcher.mock.calls.filter(([url]) => !url.includes('asset-map'))).toHaveLength(1);
    failed = false;
    await act(async () => {
      await first.result.current.reload();
    });
    expect(first.result.current.data).toEqual({ items: [1] });
    expect(second.result.current.data).toEqual({ items: [1] });
    expect(first.result.current.error).toBeNull();
    vi.unstubAllGlobals();
  });
  it('reloads an invalidated active resource and resets when its name changes', async () => {
    let value = 1;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => Promise.resolve(response(url.includes('asset-map') ? {} : value))),
    );
    const state = renderHook(({ name }) => useContent(name, 0), {
      initialProps: { name: 'hook-first' },
    });
    await waitFor(() => expect(state.result.current.data).toBe(1));
    value = 2;
    act(() => {
      invalidateContent('hook-first');
    });
    await waitFor(() => expect(state.result.current.data).toBe(2));
    state.rerender({ name: 'hook-second' });
    await waitFor(() => expect(state.result.current.data).toBe(2));
    vi.unstubAllGlobals();
  });
});
