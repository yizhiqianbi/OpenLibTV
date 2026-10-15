import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCourseProgress } from './useCourseProgress.js';

const settle = async () => act(async () => {});
const options = (repository, extra = {}) => ({
  courseId: 'test-course',
  sectionId: 'first',
  enabled: true,
  repository,
  ...extra,
});
afterEach(() => vi.useRealTimers());

describe('source course progress adapter lifecycle', () => {
  it('reports floored current positions at the source heartbeat interval and finalizes only once per position', async () => {
    let now = 50000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const repository = { reportLessonProgress: vi.fn().mockResolvedValue({ watchDone: false }) };
    const { result, unmount } = renderHook(() => useCourseProgress(options(repository)));
    act(() => result.current.tick({ positionSec: 11.8, playbackRate: 1.5 }));
    await settle();
    expect(repository.reportLessonProgress).toHaveBeenLastCalledWith({
      sectionId: 'first',
      positionSec: 11,
      playbackRate: 1.5,
      final: false,
    });
    now += 10000;
    act(() => result.current.tick({ positionSec: 21.2, playbackRate: 1.5 }));
    expect(repository.reportLessonProgress).toHaveBeenCalledTimes(1);
    now += 5000;
    act(() => result.current.tick({ positionSec: 26.9, playbackRate: 1.5 }));
    await settle();
    expect(repository.reportLessonProgress).toHaveBeenLastCalledWith({
      sectionId: 'first',
      positionSec: 26,
      playbackRate: 1.5,
      final: false,
    });
    act(() => result.current.flush({ final: true }));
    await settle();
    unmount();
    await settle();
    expect(repository.reportLessonProgress).toHaveBeenCalledTimes(3);
    expect(repository.reportLessonProgress.mock.lastCall[0].final).toBe(true);
  });

  it('requires both caller authorization and an explicit writer, with no phantom initial flush', async () => {
    const repository = {
      reportLessonProgress: vi.fn().mockResolvedValue({ watchDone: true }),
      reportLessonProgressBeacon: vi.fn(),
    };
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useCourseProgress(options(repository, { enabled })),
      { initialProps: { enabled: false } },
    );
    act(() => result.current.tick({ positionSec: 100 }));
    act(() => result.current.flush({ final: true }));
    window.dispatchEvent(new Event('pagehide'));
    await settle();
    expect(repository.reportLessonProgress).not.toHaveBeenCalled();
    rerender({ enabled: true });
    window.dispatchEvent(new Event('pagehide'));
    unmount();
    await settle();
    expect(repository.reportLessonProgress).not.toHaveBeenCalled();
    expect(repository.reportLessonProgressBeacon).not.toHaveBeenCalled();
    const view = renderHook(() => useCourseProgress(options({})));
    act(() => view.result.current.tick({ positionSec: 10 }));
    expect(view.result.current.followupGate).toBe('allow');
  });

  it('holds automatic followup only after a confirmed new completion and ignores a late prior-section acknowledgement', async () => {
    let resolve;
    const repository = {
      reportLessonProgress: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((done) => {
              resolve = done;
            }),
        )
        .mockResolvedValue({ watchDone: true }),
    };
    const done = vi.fn();
    const { result, rerender } = renderHook(
      ({ sectionId }) => useCourseProgress(options(repository, { sectionId, onWatchDone: done })),
      { initialProps: { sectionId: 'first' } },
    );
    act(() => result.current.tick({ positionSec: 100 }));
    await settle();
    rerender({ sectionId: 'second' });
    await act(async () => resolve({ watchDone: true }));
    expect(done).not.toHaveBeenCalled();
    expect(result.current.followupGate).toBe('allow');
    vi.useFakeTimers();
    act(() => result.current.tick({ positionSec: 50 }));
    await settle();
    expect(done).toHaveBeenCalledWith('second');
    expect(result.current.followupGate).toBe('hold');
    act(() => vi.advanceTimersByTime(1999));
    expect(result.current.followupGate).toBe('hold');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.followupGate).toBe('allow');
  });

  it('flushes a beacon on pagehide, deduplicates it and removes lifecycle listeners on unmount', async () => {
    const repository = {
      reportLessonProgress: vi.fn().mockResolvedValue({}),
      reportLessonProgressBeacon: vi.fn(),
    };
    const { result, unmount } = renderHook(() => useCourseProgress(options(repository)));
    act(() => {
      result.current.updatePosition(22.8);
      result.current.updateRate(2);
    });
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pagehide'));
    expect(repository.reportLessonProgressBeacon).toHaveBeenCalledExactlyOnceWith({
      sectionId: 'first',
      positionSec: 22,
      playbackRate: 2,
      final: true,
    });
    unmount();
    await settle();
    window.dispatchEvent(new Event('pagehide'));
    expect(repository.reportLessonProgressBeacon).toHaveBeenCalledTimes(1);
  });

  it('uses completion status on entry, allowing refreshes but never treating an already completed chapter as newly done', async () => {
    let resolve;
    const repository = {
      reportLessonProgress: vi.fn(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    };
    const refresh = vi.fn(),
      newlyDone = vi.fn();
    const view = renderHook(
      ({ alreadyDone }) =>
        useCourseProgress(
          options(repository, { alreadyDone, onWatchDone: refresh, onNewWatchDone: newlyDone }),
        ),
      { initialProps: { alreadyDone: false } },
    );
    act(() => view.result.current.tick({ positionSec: 50 }));
    await settle();
    view.rerender({ alreadyDone: true });
    await act(async () => resolve({ watchDone: true }));
    expect(newlyDone).toHaveBeenCalledExactlyOnceWith('first');
    expect(view.result.current.followupGate).toBe('hold');
    view.unmount();
    refresh.mockClear();
    newlyDone.mockClear();
    const doneView = renderHook(() =>
      useCourseProgress(
        options(repository, { alreadyDone: true, onWatchDone: refresh, onNewWatchDone: newlyDone }),
      ),
    );
    act(() => doneView.result.current.tick({ positionSec: 10 }));
    await settle();
    await act(async () => resolve({ watchDone: true }));
    expect(refresh).toHaveBeenCalledExactlyOnceWith('first');
    expect(newlyDone).not.toHaveBeenCalled();
    expect(doneView.result.current.followupGate).toBe('allow');
  });

  it('keeps a rejected final payload retryable, and never interprets a missing acknowledgement as completion', async () => {
    const done = vi.fn();
    const repository = {
      reportLessonProgress: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(undefined)
        .mockResolvedValue({ watchDone: false }),
    };
    const { result } = renderHook(() =>
      useCourseProgress(options(repository, { onWatchDone: done })),
    );
    act(() => result.current.flush({ positionSec: 31.5, playbackRate: 1.5, final: true }));
    await settle();
    expect(result.current.error).toContain('同步失败');
    act(() => result.current.flush({ final: true }));
    await settle();
    expect(repository.reportLessonProgress).toHaveBeenCalledTimes(2);
    expect(result.current.error).toContain('同步失败');
    act(() => result.current.retry());
    await settle();
    expect(repository.reportLessonProgress.mock.lastCall[0]).toMatchObject({
      positionSec: 31,
      playbackRate: 1.5,
    });
    expect(result.current.error).toBe('');
    expect(done).not.toHaveBeenCalled();
  });
});
