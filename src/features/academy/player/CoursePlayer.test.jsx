import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CoursePlayer from './CoursePlayer.jsx';

const item = {
  videoUrl: '/high.mp4',
  durationSec: 120,
  qualities: [
    { url: '/high.mp4', height: 720, label: '720p' },
    { url: '/low.mp4', height: 480, label: '480p' },
  ],
};
function metadata(video) {
  Object.defineProperty(video, 'duration', { value: 120, configurable: true });
  fireEvent.loadedMetadata(video);
}
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { value: true, configurable: true });
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
});
afterEach(() => vi.useRealTimers());

describe('actual media element lifecycle', () => {
  it('preserves both position and paused state when changing quality; changing while playing resumes', () => {
    const { container } = render(<CoursePlayer item={item} asset={(url) => url} />);
    const video = container.querySelector('video');
    metadata(video);
    video.currentTime = 37;
    fireEvent.timeUpdate(video);
    fireEvent.click(screen.getByRole('button', { name: '清晰度' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '480P' }));
    expect(video.getAttribute('src')).toBe('/low.mp4');
    video.currentTime = 0;
    metadata(video);
    expect(video.currentTime).toBe(37);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: '播放' })[0]);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '清晰度' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '720P' }));
    video.currentTime = 0;
    metadata(video);
    expect(video.currentTime).toBe(37);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });
  it('does not intercept space on a native play button and clamps seek on the player surface', () => {
    const { container } = render(<CoursePlayer item={item} asset={(url) => url} />);
    const video = container.querySelector('video');
    metadata(video);
    fireEvent.keyDown(screen.getAllByRole('button', { name: '播放' })[0], { key: ' ' });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    video.currentTime = 118;
    fireEvent.timeUpdate(video);
    fireEvent.keyDown(container.firstChild, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(120);
  });
  it('delays buffering UI, clears it on playing and flushes progress on pause/seeking/end', () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const { container, unmount } = render(
      <CoursePlayer
        item={item}
        asset={(url) => url}
        onProgressFlush={flush}
        showFollowup={false}
      />,
    );
    const video = container.querySelector('video');
    metadata(video);
    fireEvent.waiting(video);
    act(() => vi.advanceTimersByTime(299));
    expect(screen.queryByLabelText('视频缓冲中')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByLabelText('视频缓冲中')).toBeTruthy();
    fireEvent.playing(video);
    expect(screen.queryByLabelText('视频缓冲中')).toBeNull();
    video.currentTime = 8;
    fireEvent.pause(video);
    fireEvent.seeking(video);
    fireEvent.ended(video);
    expect(flush).toHaveBeenCalledTimes(3);
    expect(flush).toHaveBeenLastCalledWith({ final: true, positionSec: 8, playbackRate: 1 });
    unmount();
    expect(video.hasAttribute('src')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps a masterclass login guard and distinguishes offline from a corrupt source', () => {
    const login = vi.fn();
    render(<CoursePlayer item={item} asset={(url) => url} masterclass login={login} />);
    fireEvent.click(screen.getAllByRole('button', { name: '播放' })[0]);
    expect(login).toHaveBeenCalledTimes(1);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event('offline')));
    expect(screen.getByText('网络连接已断开，请检查网络')).toBeTruthy();
    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.queryByText('网络连接已断开，请检查网络')).toBeNull();
  });
  it('uses the source desktop volume popover and closes the completion prompt from its backdrop', () => {
    const { container } = render(
      <CoursePlayer item={item} asset={(url) => url} hasNext showFollowup />,
    );
    const volume = container.querySelector('.academy-player-volume');
    expect(screen.queryByRole('slider', { name: '音量' })).toBeNull();
    fireEvent.mouseEnter(volume);
    const slider = screen.getByRole('slider', { name: '音量' });
    expect(slider.getAttribute('step')).toBe('.01');
    fireEvent.change(slider, { target: { value: '0.35' } });
    expect(slider.value).toBe('0.35');

    const video = container.querySelector('video');
    metadata(video);
    fireEvent.ended(video);
    const overlay = container.querySelector('.academy-player-followup-overlay');
    expect(overlay).toBeTruthy();
    fireEvent.click(screen.getByRole('dialog', { name: '播放完毕' }));
    expect(container.querySelector('.academy-player-followup-overlay')).toBeTruthy();
    fireEvent.click(overlay);
    expect(container.querySelector('.academy-player-followup-overlay')).toBeNull();
  });
  it('preserves the external episode callback without leaving controls hidden by an unrendered drawer', () => {
    const episodes = vi.fn();
    const { container } = render(
      <CoursePlayer item={item} asset={(url) => url} onOpenEpisodes={episodes} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '选集' }));
    expect(episodes).toHaveBeenCalledTimes(1);
    expect(container.firstChild.classList.contains('show-controls')).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
