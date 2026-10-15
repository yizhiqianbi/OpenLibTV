import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAcademyResource } from './useAcademyResource.js';

describe('academy resource ownership', () => {
  it('ignores a stale request after the route changes and retries the current route', async () => {
    const pending = {};
    const readers = {
      old: vi.fn(
        () =>
          new Promise((resolve) => {
            pending.old = resolve;
          }),
      ),
      next: vi.fn(
        () =>
          new Promise((resolve) => {
            pending.next = resolve;
          }),
      ),
    };
    const { result, rerender } = renderHook(({ key }) => useAcademyResource(key, readers[key]), {
      initialProps: { key: 'old' },
    });
    await waitFor(() => expect(readers.old).toHaveBeenCalledTimes(1));
    rerender({ key: 'next' });
    await waitFor(() => expect(readers.next).toHaveBeenCalledTimes(1));
    await act(async () => pending.next('current'));
    await act(async () => pending.old('stale'));
    expect(result.current.data).toBe('current');
    act(() => result.current.reload());
    await waitFor(() => expect(readers.next).toHaveBeenLastCalledWith({ force: true }));
  });

  it('keeps same-course content during a progress refresh, but clears it immediately for another route', async () => {
    let resolve;
    const read = vi
      .fn()
      .mockResolvedValueOnce({ id: 'first' })
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValue({ id: 'second' });
    const { result, rerender } = renderHook(
      ({ key }) => useAcademyResource(key, read, { keepPrevious: true }),
      { initialProps: { key: 'first' } },
    );
    await waitFor(() => expect(result.current.data).toEqual({ id: 'first' }));
    act(() => result.current.reload());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(result.current).toMatchObject({ loading: true, data: { id: 'first' } });
    rerender({ key: 'second' });
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data).toEqual({ id: 'second' }));
    await act(async () => resolve({ id: 'stale-refresh' }));
    expect(result.current.data).toEqual({ id: 'second' });
  });

  it('does not request an absent playable selection', async () => {
    const read = vi.fn();
    const { result } = renderHook(() => useAcademyResource('', read));
    await act(async () => {});
    expect(read).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ loading: false, data: null });
  });
});
