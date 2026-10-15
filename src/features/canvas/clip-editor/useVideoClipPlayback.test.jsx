import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearVideoClipPlaybackPool, useVideoClipPlayback } from './useVideoClipPlayback.js';

function nativeMediaMocks() {
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
    this.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
}

function setup(initial = {}, wrapper) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const containerRef = { current: container };
  const props = {
    nodeId: 'clip',
    documentKey: 'doc-a',
    url: '/assets/one.mp4',
    containerRef,
    ...initial,
  };
  const hook = renderHook((options) => useVideoClipPlayback(options), {
    initialProps: props,
    wrapper,
  });
  return { ...hook, props, container, video: () => container.querySelector('video') };
}

function hover(hook, ms = 300) {
  act(() => hook.result.current.onMouseEnter());
  act(() => vi.advanceTimersByTime(ms));
}

function metadata(video, duration) {
  Object.defineProperty(video, 'duration', { configurable: true, value: duration });
  act(() => video.dispatchEvent(new Event('loadedmetadata')));
}

beforeEach(() => {
  vi.useFakeTimers();
  nativeMediaMocks();
});
afterEach(() => {
  cleanup();
  clearVideoClipPlaybackPool();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('actual pooled VideoClip native playback lifecycle', () => {
  it('waits 300ms then acquires native media, with real metadata/time/play/ended transitions', () => {
    const hook = setup();
    hover(hook, 299);
    expect(hook.result.current.active).toBe(false);
    expect(hook.video()).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    const video = hook.video();
    expect(video.getAttribute('src')).toBe('/assets/one.mp4');
    expect(video.controls).toBe(false);
    expect(video.preload).toBe('metadata');
    expect(video.muted).toBe(true);
    expect(video.volume).toBe(0.5);
    expect(hook.result.current.playing).toBe(true);
    metadata(video, 22);
    expect(hook.result.current.ready).toBe(true);
    expect(hook.result.current.duration).toBe(22);
    video.currentTime = 8.5;
    act(() => video.dispatchEvent(new Event('timeupdate')));
    expect(hook.result.current.currentTime).toBe(8.5);
    act(() => hook.result.current.togglePlay());
    expect(hook.result.current.playing).toBe(false);
    act(() => hook.result.current.togglePlay());
    expect(hook.result.current.playing).toBe(true);
    act(() => video.dispatchEvent(new Event('ended')));
    expect(hook.result.current.playing).toBe(false);
    expect(hook.result.current.currentTime).toBe(0);
    expect(video.currentTime).toBe(0);
  });

  it('releases listeners/native URL on leave and reuses the same idle DOM without sharing active leases', () => {
    const hook = setup();
    hover(hook);
    const first = hook.video();
    metadata(first, 11);
    act(() => hook.result.current.onMouseLeave());
    expect(hook.video()).toBeNull();
    expect(first.getAttribute('src')).toBeNull();
    expect(first.paused).toBe(true);
    act(() => first.dispatchEvent(new Event('loadedmetadata')));
    expect(hook.result.current.active).toBe(false);
    hover(hook);
    expect(hook.video()).toBe(first);
    const second = setup();
    hover(second);
    expect(second.video()).not.toBe(first);
    hook.unmount();
    expect(second.video().getAttribute('src')).toBe('/assets/one.mp4');
  });

  it('blocks pending hover and active playback during connection dragging or current-editor preview', () => {
    const hook = setup();
    hover(hook, 150);
    hook.rerender({ ...hook.props, draggingConnection: true });
    act(() => vi.advanceTimersByTime(500));
    expect(hook.video()).toBeNull();
    hook.rerender(hook.props);
    hover(hook);
    const video = hook.video();
    hook.rerender({ ...hook.props, previewDisabled: true });
    expect(hook.result.current.active).toBe(false);
    expect(video.getAttribute('src')).toBeNull();
    act(() => hook.result.current.onMouseEnter());
    act(() => vi.advanceTimersByTime(500));
    expect(hook.video()).toBeNull();
  });

  it('isolates source URL and A→B→A document changes from captured old media listeners', () => {
    const addListener = vi.spyOn(HTMLMediaElement.prototype, 'addEventListener');
    const hook = setup();
    hover(hook);
    const video = hook.video();
    const oldMetadata = addListener.mock.calls.find(([name]) => name === 'loadedmetadata')[1];
    metadata(video, 15);
    hook.rerender({ ...hook.props, documentKey: 'doc-b', url: '/assets/two.mp4' });
    expect(video.getAttribute('src')).toBeNull();
    expect(hook.result.current.duration).toBe(0);
    hook.rerender(hook.props);
    Object.defineProperty(video, 'duration', { configurable: true, value: 999 });
    act(() => oldMetadata());
    expect(hook.result.current.duration).toBe(0);
    expect(hook.result.current.ready).toBe(false);
    hover(hook);
    metadata(hook.video(), 21);
    expect(hook.result.current.duration).toBe(21);
    act(() => oldMetadata());
    expect(hook.result.current.duration).toBe(21);
  });

  it('keeps the latest 200ms volume write, cancels retired document writes and preserves mute semantics', () => {
    const writer = vi.fn();
    const hook = setup({ onPlaybackVolumeChange: writer });
    hover(hook);
    act(() => hook.result.current.changeVolume(0.3));
    act(() => vi.advanceTimersByTime(150));
    act(() => hook.result.current.changeVolume(0.7));
    act(() => vi.advanceTimersByTime(199));
    expect(writer).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(writer.mock.calls).toEqual([[0.7]]);
    expect(hook.video().volume).toBe(0.7);
    act(() => hook.result.current.toggleMute());
    act(() => vi.advanceTimersByTime(200));
    expect(writer.mock.calls).toEqual([[0.7], [0]]);
    expect(hook.video().muted).toBe(true);
    act(() => hook.result.current.toggleMute());
    act(() => vi.advanceTimersByTime(200));
    expect(writer.mock.calls).toEqual([[0.7], [0], [0.7]]);
    act(() => hook.result.current.changeVolume(0));
    act(() => vi.advanceTimersByTime(200));
    act(() => hook.result.current.toggleMute());
    act(() => vi.advanceTimersByTime(200));
    expect(hook.result.current.volume).toBe(0.5);
    expect(writer.mock.calls).toEqual([[0.7], [0], [0.7], [0], [0.5]]);
    act(() => hook.result.current.changeVolume(0.2));
    hook.rerender({ ...hook.props, documentKey: 'doc-b' });
    act(() => vi.advanceTimersByTime(1000));
    expect(writer.mock.calls).toEqual([[0.7], [0], [0.7], [0], [0.5]]);
  });

  it('reads the new document initial volume even when it reuses the same component and node ID', () => {
    const hook = setup({ initialPlaybackVolume: 0.3 });
    hover(hook);
    hook.rerender({ ...hook.props, documentKey: 'doc-b', initialPlaybackVolume: 0.8 });
    hover(hook);
    expect(hook.result.current.volume).toBe(0.8);
    expect(hook.result.current.muted).toBe(false);
    expect(hook.video().volume).toBe(0.8);
  });

  it('does not remount/borrow the initial volume when only the same document URL or stored prop changes', () => {
    const hook = setup({ initialPlaybackVolume: 0.3 });
    hover(hook);
    act(() => hook.result.current.changeVolume(0.6));
    hook.rerender({ ...hook.props, url: '/assets/two.mp4', initialPlaybackVolume: 0.9 });
    hover(hook);
    expect(hook.result.current.volume).toBe(0.6);
    expect(hook.video().volume).toBe(0.6);
  });

  it('rejects captured UI callbacks after document A→B→A rather than applying them to the restored owner', () => {
    const writer = vi.fn();
    const hook = setup({ initialPlaybackVolume: 0.3, onPlaybackVolumeChange: writer });
    hover(hook);
    const oldCallbacks = hook.result.current;
    hook.rerender({ ...hook.props, documentKey: 'doc-b', initialPlaybackVolume: 0.8 });
    hook.rerender(hook.props);
    act(() => {
      oldCallbacks.onMouseEnter();
      oldCallbacks.changeVolume(0.9);
      oldCallbacks.toggleMute();
      oldCallbacks.seek(12);
      oldCallbacks.togglePlay();
    });
    act(() => vi.advanceTimersByTime(1000));
    expect(hook.video()).toBeNull();
    expect(hook.result.current.volume).toBe(0.3);
    expect(hook.result.current.muted).toBe(false);
    expect(writer).not.toHaveBeenCalled();
    hover(hook);
    act(() => hook.result.current.changeVolume(0.6));
    act(() => vi.advanceTimersByTime(200));
    expect(hook.video().volume).toBe(0.6);
    expect(writer.mock.calls).toEqual([[0.6]]);
  });

  it('honors audioTracks before moz flags and decoded bytes; one-shot capture stops all observed tracks', () => {
    const hook = setup();
    hover(hook);
    const video = hook.video();
    Object.defineProperty(video, 'audioTracks', { configurable: true, value: { length: 0 } });
    Object.defineProperty(video, 'mozHasAudio', { configurable: true, value: true });
    act(() => video.dispatchEvent(new Event('timeupdate')));
    expect(hook.result.current.hasAudio).toBe(false);
    act(() => hook.result.current.onMouseLeave());
    Object.defineProperty(video, 'audioTracks', { configurable: true, value: undefined });
    Object.defineProperty(video, 'mozHasAudio', { configurable: true, value: undefined });
    const stopAudio = vi.fn();
    const stopVideo = vi.fn();
    const capture = vi.fn(() => ({
      getAudioTracks: () => [{}],
      getTracks: () => [{ stop: stopAudio }, { stop: stopVideo }],
    }));
    Object.defineProperty(video, 'captureStream', { configurable: true, value: capture });
    hover(hook);
    act(() => video.dispatchEvent(new Event('timeupdate')));
    act(() => video.dispatchEvent(new Event('timeupdate')));
    expect(hook.result.current.hasAudio).toBe(true);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(stopAudio).toHaveBeenCalledTimes(1);
    expect(stopVideo).toHaveBeenCalledTimes(1);
    delete video.captureStream;
  });

  it('keeps unknown audio controls until byte-count detection is eligible at .5s', () => {
    const hook = setup();
    hover(hook);
    const video = hook.video();
    Object.defineProperty(video, 'audioTracks', { configurable: true, value: undefined });
    Object.defineProperty(video, 'mozHasAudio', { configurable: true, value: undefined });
    Object.defineProperty(video, 'webkitAudioDecodedByteCount', { configurable: true, value: 0 });
    video.currentTime = 0.4;
    act(() => video.dispatchEvent(new Event('timeupdate')));
    expect(hook.result.current.hasAudio).toBe(true);
    video.currentTime = 0.5;
    act(() => video.dispatchEvent(new Event('timeupdate')));
    expect(hook.result.current.hasAudio).toBe(false);
    delete video.webkitAudioDecodedByteCount;
  });

  it('distinguishes native errors/autoplay refusal from readiness and permits metadata retry', () => {
    HTMLMediaElement.prototype.play.mockImplementation(() => Promise.reject(new Error('refused')));
    const hook = setup();
    hover(hook);
    const video = hook.video();
    expect(hook.result.current.playing).toBe(false);
    act(() => video.dispatchEvent(new Event('error')));
    expect(hook.result.current.mediaError).toBe(true);
    expect(hook.result.current.ready).toBe(false);
    metadata(video, Infinity);
    expect(hook.result.current.duration).toBe(0);
    expect(hook.result.current.ready).toBe(true);
    expect(hook.result.current.mediaError).toBe(false);
    metadata(video, 14.5);
    expect(hook.result.current.duration).toBe(14.5);
  });

  it('retires all media callbacks and pending hover/volume work through StrictMode unmount', () => {
    const writer = vi.fn();
    const hook = setup({ onPlaybackVolumeChange: writer }, StrictMode);
    hover(hook);
    const video = hook.video();
    act(() => hook.result.current.changeVolume(0.4));
    hook.unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(writer).not.toHaveBeenCalled();
    expect(video.getAttribute('src')).toBeNull();
    expect(video.paused).toBe(true);
    expect(video.parentElement).toBeNull();
    const pending = setup({}, StrictMode);
    hover(pending, 250);
    pending.unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(pending.container.children).toHaveLength(0);
  });
});
