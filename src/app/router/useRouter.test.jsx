import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from './useRouter';

describe('browser navigation', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('updates a mounted route subscriber and preserves the query', () => {
    const { result } = renderHook(() => useRouter());
    act(() => result.current.navigate('/skill?tab=mine'));
    expect(result.current.locationKey).toBe('/skill?tab=mine');
    expect(result.current.pathname).toBe('/skill');
    expect(result.current.search).toBe('?tab=mine');
    act(() => {
      window.history.replaceState({}, '', '/show');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.pathname).toBe('/show');
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it('keeps external destinations outside the local router', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { result } = renderHook(() => useRouter());
    act(() => result.current.navigate('https://example.test/docs'));
    expect(open).toHaveBeenCalledWith('https://example.test/docs', '_blank', 'noopener,noreferrer');
    expect(result.current.pathname).toBe('/');
  });

  it('observes native anchor changes without changing the pathname', () => {
    const { result } = renderHook(() => useRouter());
    act(() => {
      window.history.replaceState({}, '', '/#chapter');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.locationKey).toBe('/#chapter');
    expect(result.current.pathname).toBe('/');
  });
});
