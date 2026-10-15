import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CoursePlayer from './CoursePlayer.jsx';
import { captureVideoFrame, waitForRestoredFrame } from './frame-transition.js';

const item = {
  videoUrl: '/high.mp4',
  cover: '/poster.webp',
  durationSec: 120,
  qualities: [
    { url: '/high.mp4', height: 720 },
    { url: '/low.mp4', height: 480 },
  ],
};
let draw;
let frames;
let cancelFrame;
let nextFrame;
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  draw = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: draw });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  frames = new Map();
  nextFrame = 0;
  cancelFrame = vi.fn((id) => frames.delete(id));
});
afterEach(() => vi.useRealTimers());
function nativeMedia(video, { ready = 2, width = 640, height = 360 } = {}) {
  Object.defineProperties(video, {
    duration: { value: 120, configurable: true },
    readyState: { value: ready, configurable: true },
    videoWidth: { value: width, configurable: true },
    videoHeight: { value: height, configurable: true },
  });
  video.requestVideoFrameCallback = vi.fn((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  video.cancelVideoFrameCallback = cancelFrame;
  fireEvent.loadedMetadata(video);
}
function chooseQuality(label) {
  fireEvent.click(screen.getByRole('button', { name: '清晰度' }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: label }));
}
function decodeFrame() {
  const [id, callback] = frames.entries().next().value;
  frames.delete(id);
  act(() => callback());
}

describe('native video and Canvas quality transition lifecycle', () => {
  it('freezes the existing decoded frame and settles only after the new source restores the position', () => {
    const { container, unmount } = render(
      <CoursePlayer item={item} asset={(url) => url} playbackKey="lesson" />,
    );
    const video = container.querySelector('video');
    const canvas = container.querySelector('canvas');
    nativeMedia(video);
    video.currentTime = 37;
    chooseQuality('480P');
    expect(container.querySelector('video')).toBe(video);
    expect(draw).toHaveBeenCalledWith(video, 0, 0);
    expect([canvas.width, canvas.height, canvas.style.opacity]).toEqual([640, 360, '1']);
    expect(video.hasAttribute('poster')).toBe(false);
    video.currentTime = 0;
    Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(37);
    decodeFrame();
    expect(canvas.style.opacity).toBe('1');
    Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
    video.currentTime = 38;
    decodeFrame();
    expect(canvas.style.opacity).toBe('1');
    video.currentTime = 37.4;
    decodeFrame();
    expect([canvas.width, canvas.height, canvas.style.opacity]).toEqual([0, 0, '0']);
    expect(video.getAttribute('poster')).toBe('/poster.webp');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    unmount();
    // Drain jsdom native zero-delay media events; owned timers must already be cancelled.
    act(() => vi.advanceTimersByTime(0));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('continues a quality swap when drawing is unavailable and releases a stalled transition in five seconds', () => {
    draw.mockImplementation(() => {
      throw new DOMException('cross-origin', 'SecurityError');
    });
    const { container, unmount } = render(<CoursePlayer item={item} asset={(url) => url} />);
    const video = container.querySelector('video');
    const canvas = container.querySelector('canvas');
    nativeMedia(video);
    video.currentTime = 18;
    chooseQuality('480P');
    expect(video.getAttribute('src')).toBe('/low.mp4');
    expect([canvas.width, canvas.height, canvas.style.opacity]).toEqual([0, 0, '0']);
    act(() => vi.advanceTimersByTime(5000));
    expect(video.getAttribute('poster')).toBe('/poster.webp');
    expect(screen.queryByText('视频加载失败')).toBeNull();
    unmount();
    // Drain jsdom native zero-delay media events; owned timers must already be cancelled.
    act(() => vi.advanceTimersByTime(0));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('invalidates an earlier decoded-frame callback after another quality choice and frees the retained Canvas on unmount', () => {
    const { container, unmount } = render(<CoursePlayer item={item} asset={(url) => url} />);
    const video = container.querySelector('video');
    const canvas = container.querySelector('canvas');
    nativeMedia(video);
    video.currentTime = 25;
    chooseQuality('480P');
    fireEvent.loadedMetadata(video);
    const obsolete = frames.entries().next().value;
    chooseQuality('720P');
    expect(cancelFrame).toHaveBeenCalledWith(obsolete[0]);
    act(() => obsolete[1]());
    expect(canvas.style.opacity).toBe('1');
    fireEvent.loadedMetadata(video);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    expect(video.hasAttribute('src')).toBe(false);
    // Drain jsdom native zero-delay media events; owned timers must already be cancelled.
    act(() => vi.advanceTimersByTime(0));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels decoding and clears the old frame on a playback route change', () => {
    const { container, rerender, unmount } = render(
      <CoursePlayer item={item} asset={(url) => url} playbackKey="first" />,
    );
    const video = container.querySelector('video');
    const canvas = container.querySelector('canvas');
    nativeMedia(video);
    video.currentTime = 9;
    chooseQuality('480P');
    fireEvent.loadedMetadata(video);
    const obsolete = frames.values().next().value;
    rerender(
      <CoursePlayer
        item={{ ...item, videoUrl: '/next.mp4', qualities: [] }}
        asset={(url) => url}
        playbackKey="next"
      />,
    );
    expect(frames.size).toBe(0);
    act(() => obsolete());
    expect(canvas.width).toBe(0);
    expect(container.querySelector('video')).not.toBe(video);
    expect(video.hasAttribute('src')).toBe(false);
    unmount();
    // Drain jsdom native zero-delay media events; owned timers must already be cancelled.
    act(() => vi.advanceTimersByTime(0));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('decoded-frame fallback', () => {
  it('uses requestAnimationFrame when native decoding callbacks are absent and cancels it without settling', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
    const callbacks = new Map();
    let next = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.set(++next, callback);
      return next;
    });
    const cancelled = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation((id) => callbacks.delete(id));
    const settled = vi.fn();
    const cancel = waitForRestoredFrame(video, 4, settled);
    const callback = callbacks.get(1);
    callbacks.delete(1);
    callback();
    expect(callbacks.size).toBe(1);
    cancel();
    expect(cancelled).toHaveBeenLastCalledWith(2);
    callbacks.get(2)?.();
    act(() => vi.advanceTimersByTime(5000));
    expect(settled).not.toHaveBeenCalled();
    // Drain jsdom native zero-delay media events; owned timers must already be cancelled.
    act(() => vi.advanceTimersByTime(0));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not allocate or draw a frame for metadata-only or zero-size media', () => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    nativeMedia(video, { ready: 1 });
    expect(captureVideoFrame(video, canvas)).toBe(false);
    nativeMedia(video, { width: 0 });
    expect(captureVideoFrame(video, canvas)).toBe(false);
    expect(draw).not.toHaveBeenCalled();
  });
});
