import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createPracticeIntroMemory, openPracticeWindow, practiceUrl } from './practice-entry.js';
import { usePracticeIntroGate } from './usePracticeIntroGate.js';

describe('source practice introduction boundary', () => {
  it('claims the introduction once per runtime and remembers it per user across reloads', async () => {
    const stored = new Map();
    const options = { read: (key) => stored.get(key), write: (key) => stored.set(key, true) };
    const first = createPracticeIntroMemory(options);
    expect(await first.claim('fixture')).toEqual({ show: true });
    expect(await first.claim('other')).toEqual({ show: false });
    expect(await createPracticeIntroMemory(options).claim('fixture')).toEqual({ show: false });
    expect(await createPracticeIntroMemory(options).claim('other')).toEqual({ show: true });
  });
  it('allows entry on unavailable read history and retains a shown intro after a failed write', async () => {
    const denied = createPracticeIntroMemory({
      read: () => {
        throw new Error('denied');
      },
    });
    expect(await denied.claim('fixture')).toEqual({ show: false });
    const quota = createPracticeIntroMemory({
      read: () => false,
      write: () => {
        throw new Error('quota');
      },
    });
    expect(await quota.claim('fixture')).toMatchObject({ show: true, error: expect.any(String) });
    expect(await quota.claim('fixture')).toEqual({ show: false });
  });
  it('does not open a late introduction for a replaced route or unmounted page', async () => {
    let resolve;
    const open = vi.fn();
    const memory = {
      claim: () =>
        new Promise((done) => {
          resolve = done;
        }),
    };
    const { result, rerender, unmount } = renderHook(
      ({ courseId }) => usePracticeIntroGate({ courseId, memory, open }),
      { initialProps: { courseId: 'old' } },
    );
    let request;
    act(() => {
      request = result.current.requestEnter({ courseId: 'old' });
    });
    rerender({ courseId: 'new' });
    await act(async () => {
      resolve({ show: false });
      await request;
    });
    expect(open).not.toHaveBeenCalled();
    act(() => {
      request = result.current.requestEnter({ courseId: 'new' });
    });
    unmount();
    await act(async () => {
      resolve({ show: false });
      await request;
    });
    expect(open).not.toHaveBeenCalled();
  });
  it('uses an encoded sectionId with a new noopener window rather than navigating the course tab', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    expect(practiceUrl('fixture', 'practice/a?b')).toBe(
      '/academy/practice/fixture?sectionId=practice%2Fa%3Fb',
    );
    openPracticeWindow('fixture', 'practice/a?b');
    expect(open).toHaveBeenCalledWith(
      '/academy/practice/fixture?sectionId=practice%2Fa%3Fb',
      '_blank',
      'noopener',
    );
  });
});
