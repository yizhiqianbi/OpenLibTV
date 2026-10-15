import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocalState, useStoredState } from './useLocalState.ts';
import { writeStoredValue } from '../services/storage.ts';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('stored state hooks', () => {
  it('synchronizes two mounted consumers and applies functional updates to latest state', () => {
    const first = renderHook(() => useLocalState('hook-counter', 0));
    const second = renderHook(() => useLocalState('hook-counter', 0));
    act(() => {
      first.result.current[1]((value) => value + 1);
      second.result.current[1]((value) => value + 1);
    });
    expect(first.result.current[0]).toBe(2);
    expect(second.result.current[0]).toBe(2);
    expect(JSON.parse(window.localStorage.getItem('hook-counter')!)).toBe(2);
  });
  it('observes imperative helper writes and changes keys without copying the old value', () => {
    const state = renderHook(({ key }) => useLocalState(key, [] as number[]), {
      initialProps: { key: 'hook-a' },
    });
    act(() => {
      writeStoredValue('hook-a', [1]);
    });
    expect(state.result.current[0]).toEqual([1]);
    state.rerender({ key: 'hook-b' });
    expect(state.result.current[0]).toEqual([]);
    expect(window.localStorage.getItem('hook-b')).toBeNull();
  });
  it('exposes quota errors while keeping the last good value', () => {
    writeStoredValue('hook-quota', ['old']);
    const state = renderHook(() => useStoredState('hook-quota', [] as string[]));
    const spy = vi
      .spyOn(Object.getPrototypeOf(window.localStorage), 'setItem')
      .mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });
    let success: boolean | undefined;
    act(() => {
      success = state.result.current.setValue(['new']);
    });
    expect(success).toBe(false);
    expect(state.result.current.value).toEqual(['old']);
    expect(state.result.current.error?.code).toBe('WRITE_FAILED');
    spy.mockRestore();
    act(() => {
      state.result.current.setValue(['new']);
    });
    expect(state.result.current.error).toBeNull();
    expect(state.result.current.value).toEqual(['new']);
  });
  it('supports session scope and resets consumers after removal', () => {
    const state = renderHook(() => useStoredState('hook-session', false, { scope: 'session' }));
    act(() => {
      state.result.current.setValue(true);
    });
    expect(window.localStorage.getItem('hook-session')).toBeNull();
    expect(window.sessionStorage.getItem('hook-session')).toBe('true');
    act(() => {
      state.result.current.remove();
    });
    expect(state.result.current.value).toBe(false);
  });
  it('observes browser storage events from another tab', () => {
    const state = renderHook(() => useLocalState('hook-external', 0));
    act(() => {
      window.localStorage.setItem('hook-external', '3');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'hook-external',
          newValue: '3',
          storageArea: window.localStorage,
        }),
      );
    });
    expect(state.result.current[0]).toBe(3);
  });
});
