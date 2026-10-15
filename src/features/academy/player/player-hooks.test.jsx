import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readStoredValue, writeStoredValue } from '../../../services/storage.ts';
import { PLAYER_PREFERENCE_KEY } from './player-model.js';
import { usePlayerPreferences } from './usePlayerPreferences.js';
import { usePracticeMarkers } from './usePracticeMarkers.js';
import { usePlayerFollowup } from './usePlayerFollowup.js';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('player timers and preferences', () => {
  it('restores valid global rate and quality preferences and keeps controls usable after quota failure', () => {
    writeStoredValue(PLAYER_PREFERENCE_KEY, { rate: 1.5, qualityHeight: 480 });
    const { result } = renderHook(usePlayerPreferences);
    expect(result.current.rate).toBe(1.5);
    act(() => result.current.setRate(2));
    expect(readStoredValue(PLAYER_PREFERENCE_KEY, null)).toEqual({ rate: 2, qualityHeight: 480 });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    act(() => result.current.setQualityHeight(720));
    expect(result.current.qualityHeight).toBe(720);
    expect(result.current.storageError).toBeTruthy();
  });
  it('opens a practice marker once, expires it in five seconds and cancels old-route timers', () => {
    const marks = [{ timeSec: 2, title: '技法' }];
    const { result, rerender, unmount } = renderHook(
      ({ key }) => usePracticeMarkers(marks, key, true),
      { initialProps: { key: 'first' } },
    );
    act(() => result.current.frame(1));
    act(() => result.current.frame(2));
    expect(result.current.popup).toBe(0);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.popup).toBeNull();
    act(() => {
      result.current.notifySeeking();
      result.current.frame(0);
      result.current.frame(1);
      result.current.frame(2);
    });
    expect(result.current.popup).toBeNull();
    act(() => result.current.hover(0));
    rerender({ key: 'next' });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.popup).toBeNull();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('holds the end screen for marketing, pauses countdown while hovered/hidden and uses the latest callback', () => {
    const original = vi.fn(),
      latest = vi.fn();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const { result, rerender, unmount } = renderHook(
      ({ gate, onNext }) =>
        usePlayerFollowup({
          playbackKey: 'lesson',
          hasNext: true,
          training: false,
          enabled: true,
          gate,
          onNext,
        }),
      { initialProps: { gate: 'hold', onNext: original } },
    );
    act(() => result.current.ended());
    expect(result.current.open).toBe(false);
    rerender({ gate: 'allow', onNext: latest });
    expect(result.current.open).toBe(true);
    act(() => result.current.hover(true));
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.remaining).toBe(5);
    act(() => result.current.hover(false));
    hidden.mockReturnValue(true);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.remaining).toBe(5);
    hidden.mockReturnValue(false);
    act(() => vi.advanceTimersByTime(5000));
    expect(latest).toHaveBeenCalledTimes(1);
    expect(original).not.toHaveBeenCalled();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('denies end-of-lesson progression until an explicit later playback ends', () => {
    const next = vi.fn();
    const { result, rerender } = renderHook(
      ({ gate }) =>
        usePlayerFollowup({
          playbackKey: 'lesson',
          hasNext: true,
          enabled: true,
          gate,
          onNext: next,
        }),
      { initialProps: { gate: 'deny' } },
    );
    act(() => result.current.ended());
    rerender({ gate: 'allow' });
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.open).toBe(false);
    expect(next).not.toHaveBeenCalled();
  });
});
