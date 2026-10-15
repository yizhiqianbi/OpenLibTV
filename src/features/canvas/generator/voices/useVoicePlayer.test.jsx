import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useVoicePlayer } from './useVoicePlayer.ts';
const first = { voiceId: 'first', name: 'First', voiceUrl: '/first.mp3' };
const second = { voiceId: 'second', name: 'Second', voiceUrl: '/second.mp3' };
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const audio = (play = vi.fn().mockResolvedValue()) => ({
  play,
  pause: vi.fn(),
  src: '',
  currentTime: 99,
  onended: null,
  onerror: null,
});
describe('one voice audition lifecycle', () => {
  it('pauses the current voice, resets time, rejects a stale play resolution and cleans up', async () => {
    const pending = deferred();
    const player = audio(vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue());
    const create = vi.fn(() => player);
    const { result, unmount } = renderHook(() => useVoicePlayer(create));
    act(() => {
      void result.current.toggle(first);
    });
    expect(result.current.loadingId).toBe('first');
    await act(async () => result.current.toggle(second));
    expect(player.src).toBe('/second.mp3');
    expect(player.currentTime).toBe(0);
    expect(result.current.playingId).toBe('second');
    await act(async () => pending.resolve());
    expect(result.current.playingId).toBe('second');
    expect(create).toHaveBeenCalledTimes(1);
    act(() => result.current.stop());
    expect(result.current.playingId).toBe(null);
    unmount();
    expect(player.pause).toHaveBeenCalled();
    expect(player.onended).toBe(null);
  });
  it('handles failed play and media errors and can retry the same voice', async () => {
    const player = audio(
      vi.fn().mockRejectedValueOnce(new Error('audio blocked')).mockResolvedValue(),
    );
    const { result } = renderHook(() => useVoicePlayer(() => player));
    await act(async () => result.current.toggle(first));
    expect(result.current.error.message).toBe('audio blocked');
    expect(result.current.playingId).toBe(null);
    await act(async () => result.current.toggle(first));
    expect(result.current.error).toBe(null);
    expect(result.current.playingId).toBe('first');
    act(() => player.onerror());
    expect(result.current.playingId).toBe(null);
    expect(result.current.error.message).toMatch(/加载失败/);
    await act(async () => result.current.toggle(first));
    act(() => player.onended());
    expect(result.current.playingId).toBe(null);
  });
  it('unmount pauses reading media and late play completion cannot set a current voice', async () => {
    const pending = deferred();
    const player = audio(vi.fn(() => pending.promise));
    const { result, unmount } = renderHook(() => useVoicePlayer(() => player));
    act(() => {
      void result.current.toggle(first);
    });
    unmount();
    await act(async () => pending.resolve());
    expect(player.pause).toHaveBeenCalled();
  });
});
