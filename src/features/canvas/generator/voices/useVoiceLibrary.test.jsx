import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useVoiceLibrary } from './useVoiceLibrary.ts';
const voice = { voiceId: 'v1', name: '真实音色' };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
describe('voice read lifecycle', () => {
  it('unmount aborts a still pending public read and ignores its late resolution', async () => {
    const pending = deferred();
    const source = { list: vi.fn(() => pending.promise) };
    const { result, unmount } = renderHook(() => useVoiceLibrary(source));
    await waitFor(() => expect(source.list).toHaveBeenCalledTimes(1));
    const signal = source.list.mock.calls[0][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ list: [voice], total: 1 }));
    expect(result.current.list).toEqual([]);
  });
  it('cancels a tab request and ignores late data without mixing My/library pages', async () => {
    const first = deferred();
    const calls = [];
    const source = {
      list: vi.fn((request, options) => {
        calls.push({ request, ...options });
        return calls.length === 1
          ? first.promise
          : Promise.resolve({ list: [{ voiceId: 'mine', name: '我的记录' }], total: 1 });
      }),
    };
    const { result, unmount } = renderHook(() => useVoiceLibrary(source));
    await waitFor(() => expect(calls).toHaveLength(1));
    act(() => result.current.changeTab('my'));
    await waitFor(() => expect(result.current.list[0]?.voiceId).toBe('mine'));
    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[1].request).toMatchObject({ tab: 'my', isSystem: false });
    await act(async () => first.resolve({ list: [voice], total: 1 }));
    expect(result.current.list[0].voiceId).toBe('mine');
    unmount();
    expect(calls[1].signal.aborted).toBe(true);
  });
  it('retains a loaded page on failure then retries without changing the external selected ID', async () => {
    const source = {
      list: vi
        .fn()
        .mockResolvedValueOnce({ list: [voice], total: 21 })
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({ list: [{ ...voice, voiceId: 'v21' }], total: 21 }),
    };
    const { result } = renderHook(() => useVoiceLibrary(source));
    await waitFor(() => expect(result.current.list).toEqual([voice]));
    act(() => result.current.changePage(2));
    await waitFor(() => expect(result.current.error?.message).toBe('network'));
    expect(result.current.list).toEqual([voice]);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.list[0]?.voiceId).toBe('v21'));
    expect(source.list.mock.calls.at(-1)[0]).toMatchObject({ page: 2, pageSize: 20 });
  });
  it('keeps independent tab search and IME does not issue partial searches', async () => {
    const source = { list: vi.fn().mockResolvedValue({ list: [], total: 0 }) };
    const { result } = renderHook(() => useVoiceLibrary(source));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.setComposing(true);
      result.current.changeQuery('少女');
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });
    expect(source.list).toHaveBeenCalledTimes(1);
    act(() => result.current.setComposing(false));
    await waitFor(() => expect(source.list.mock.calls.at(-1)[0].query).toBe('少女'));
    act(() => result.current.changeTab('favorite'));
    expect(result.current.query).toBe('');
    await waitFor(() => expect(source.list.mock.calls.at(-1)[0].tab).toBe('favorite'));
    act(() => result.current.changeTab('library'));
    expect(result.current.query).toBe('少女');
  });
  it('failed favorites keep existing flags and aborted source mutations cannot revive old records', async () => {
    const pending = deferred();
    const source = {
      list: vi.fn().mockResolvedValue({ list: [{ ...voice, isFavorited: false }], total: 1 }),
      setFavorite: vi
        .fn()
        .mockRejectedValueOnce(new Error('denied'))
        .mockImplementationOnce(() => pending.promise),
    };
    const newer = {
      list: vi.fn().mockResolvedValue({ list: [{ voiceId: 'v2', name: '新库' }], total: 1 }),
    };
    const { result, rerender } = renderHook(({ source }) => useVoiceLibrary(source), {
      initialProps: { source },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.toggleFavorite('v1', true));
    expect(result.current.favoriteError.message).toBe('denied');
    expect(result.current.list[0].isFavorited).toBe(false);
    act(() => {
      void result.current.toggleFavorite('v1', true);
    });
    rerender({ source: newer });
    await waitFor(() => expect(result.current.list[0]?.voiceId).toBe('v2'));
    await act(async () => pending.resolve());
    expect(result.current.list[0].voiceId).toBe('v2');
    expect(result.current.favoritePending).toBe(null);
  });
});
