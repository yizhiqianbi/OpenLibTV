import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WatchScrollStage from './WatchScrollStage.jsx';
import { scrollStageBox } from './watch-stage-model.js';

let intersections;
let resized;
let height;
beforeEach(() => {
  intersections = [];
  resized = [];
  height = 80;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        intersections.push(this);
      }
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        resized.push(this);
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => height);
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(720);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const player = (
  <div tabIndex={0}>
    <video src="/clip.mp4" />
  </div>
);

describe('source WatchScrollStage', () => {
  it('keeps the same video when floating, pauses on close, and re-enables floating only after the anchor returns', () => {
    const paused = vi.fn();
    const { container, unmount } = render(
      <WatchScrollStage player={player} meta={<p>description</p>} onFloatingClose={paused} />,
    );
    const video = container.querySelector('video');
    const observer = intersections[0];
    expect(observer.options).toEqual({ threshold: 0 });
    act(() => observer.callback([{ isIntersecting: false }]));
    const floating = container.querySelector('.is-floating');
    expect(floating.querySelector('video')).toBe(video);
    const close = screen.getByRole('button', { name: '关闭浮动播放器' });
    close.focus();
    fireEvent.click(close);
    expect(paused).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.is-floating')).toBeNull();
    expect(document.activeElement).toBe(video.parentElement);
    act(() => observer.callback([{ isIntersecting: false }]));
    expect(container.querySelector('.is-floating')).toBeNull();
    act(() => observer.callback([{ isIntersecting: true }]));
    act(() => observer.callback([{ isIntersecting: false }]));
    expect(container.querySelector('.is-floating video')).toBe(video);
    unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(resized[0].disconnect).toHaveBeenCalledTimes(1);
  });
  it('sizes from viewport and metadata, observes expansion, and disables floating on narrow screens', () => {
    vi.useFakeTimers();
    const { container, unmount } = render(
      <WatchScrollStage player={player} meta={<p>description</p>} />,
    );
    const anchor = container.querySelector('.academy-watch-player-anchor');
    expect(anchor.style.width).toBe('892px');
    expect(anchor.style.height).toBe('501.75px');
    height = 320;
    act(() => resized[0].callback());
    expect(anchor.style.height).toBe('288px');
    expect(Number.parseFloat(anchor.style.width)).toBeCloseTo(512);
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    act(() => {
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(100);
    });
    expect(anchor.style.width).toBe('100%');
    expect(intersections[0].disconnect).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.is-floating')).toBeNull();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('uses the latest close callback without recreating IntersectionObserver', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <WatchScrollStage player={player} meta={<p>description</p>} onFloatingClose={first} />,
    );
    act(() => intersections[0].callback([{ isIntersecting: false }]));
    rerender(<WatchScrollStage player={player} meta={<p>updated</p>} onFloatingClose={second} />);
    fireEvent.click(screen.getByRole('button', { name: '关闭浮动播放器' }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(intersections).toHaveLength(1);
  });
});

describe('source stage bounds', () => {
  it('respects original reserves, width range and metadata height without invalid dimensions', () => {
    expect(scrollStageBox(2000, 1000, 100)).toEqual({ width: 1212, height: 681.75 });
    expect(scrollStageBox(700, 1000, 100)).toEqual({ width: 412, height: 231.75 });
    expect(scrollStageBox(1280, 720, 800)).toBeNull();
  });
});
