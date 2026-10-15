import React, { useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CoursePlayer from './CoursePlayer.jsx';
import PlayerSettings from './PlayerSettings.jsx';
import LandscapeTutorialDrawer from './LandscapeTutorialDrawer.jsx';
import LandscapeEpisodeDrawer from './LandscapeEpisodeDrawer.jsx';
import LandscapeTopBar from './LandscapeTopBar.jsx';
import { isPlayerMobile } from './usePlayerViewport.js';
import { usePlayerFullscreen } from './usePlayerFullscreen.js';

const item = {
  videoUrl: '/high.mp4',
  durationSec: 120,
  qualities: [
    { url: '/high.mp4', height: 720 },
    { url: '/low.mp4', height: 480 },
  ],
};
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete HTMLElement.prototype.requestFullscreen;
  delete HTMLVideoElement.prototype.webkitEnterFullscreen;
  delete document.fullscreenElement;
});

describe('source mobile and landscape settings', () => {
  it('shows a bottom sheet, retains native focus through preference changes and returns focus on Escape', () => {
    function Settings() {
      const [open, setOpen] = useState(false);
      const [rate, setRate] = useState(1);
      return (
        <>
          <button onClick={() => setOpen(true)}>更多</button>
          {open && (
            <PlayerSettings
              rate={rate}
              quality={{ index: 0 }}
              qualities={[]}
              onRateChange={setRate}
              onClose={() => setOpen(false)}
            />
          )}
        </>
      );
    }
    render(<Settings />);
    const opener = screen.getByRole('button', { name: '更多' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: '视频设置' });
    expect(dialog.classList.contains('is-sheet')).toBe(true);
    const rate = screen.getByRole('button', { name: '1.5x' });
    rate.focus();
    fireEvent.click(rate);
    expect(rate.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(rate);
    expect(screen.queryByRole('group', { name: '清晰度' })).toBeNull();
    fireEvent.keyDown(rate, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
  it('keeps mobile UA after rotation and opens the dedicated fullscreen landscape settings/selection drawers', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 iPhone Mobile');
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(844);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(390);
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
      writable: true,
    });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: function () {
        document.fullscreenElement = this;
        document.dispatchEvent(new Event('fullscreenchange'));
        return Promise.resolve();
      },
    });
    const selected = vi.fn();
    const tutorials = [
      { tutorialUuid: 'current', title: '当前教程', cover: '/cover.webp', durationSec: 65 },
      { tutorialUuid: 'next', title: '下一教程', cover: '/next.webp', durationSec: 80 },
    ];
    const { unmount } = render(
      <CoursePlayer
        item={item}
        asset={(url) => url}
        landscapeChrome={(chrome) =>
          chrome.landscapeMode ? (
            <>
              <LandscapeTopBar
                title="教程"
                onBack={chrome.onExitFullscreen}
                onOpenSettings={chrome.onOpenSettings}
              />
              {chrome.drawer === 'episodes' && (
                <LandscapeTutorialDrawer
                  tutorials={tutorials}
                  currentTutorialId="current"
                  onClose={chrome.closeDrawer}
                  onSelect={(id) => {
                    selected(id);
                    chrome.closeDrawer();
                  }}
                />
              )}
            </>
          ) : null
        }
      />,
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '全屏' })));
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    const settings = screen.getByRole('dialog', { name: '视频设置' });
    expect(settings.classList.contains('is-sheet')).toBe(false);
    const lower = screen.getByRole('button', { name: '480P' });
    lower.focus();
    fireEvent.click(lower);
    expect(lower.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(lower);
    fireEvent.keyDown(lower, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '选集' }));
    expect(screen.getByRole('dialog', { name: '更多教程视频' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /当前教程/ }).getAttribute('aria-current')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: /下一教程/ }));
    expect(selected).toHaveBeenCalledWith('next');
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();
    delete HTMLElement.prototype.requestFullscreen;
    delete document.fullscreenElement;
  });
  it('keeps unavailable episodes disabled and touches practice only through the caller callback', () => {
    const select = vi.fn();
    const practice = vi.fn();
    const detail = {
      units: [
        {
          id: 'unit',
          title: '第一单元',
          groups: [
            {
              id: 'group',
              title: '第一组',
              leaves: [
                {
                  sectionId: 'current',
                  title: '当前课程',
                  available: true,
                  practiceNodes: [{ practiceNodeUuid: 'practice', title: '练习', done: false }],
                },
                { sectionId: 'pending', title: '待更新课程', available: false },
              ],
            },
          ],
        },
      ],
    };
    render(
      <LandscapeEpisodeDrawer
        detail={detail}
        currentSectionId="current"
        onClose={vi.fn()}
        onSelect={select}
        onGoPractice={practice}
      />,
    );
    const locked = screen.getByRole('button', { name: /待更新课程/ });
    expect(locked.disabled).toBe(true);
    fireEvent.click(locked);
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '去跟练' }));
    expect(practice).toHaveBeenCalledWith('practice');
    fireEvent.click(screen.getByRole('button', { name: /当前课程/ }));
    expect(select).toHaveBeenCalledWith('current');
  });
  it('uses source UA priority and does not treat a desktop landscape window as mobile', () => {
    expect(isPlayerMobile(844, 'iPhone Mobile')).toBe(true);
    expect(isPlayerMobile(1200, 'Android Mobile')).toBe(true);
    expect(isPlayerMobile(600, 'iPad Tablet')).toBe(false);
    expect(isPlayerMobile(390, 'Desktop')).toBe(true);
    expect(isPlayerMobile(844, 'Desktop')).toBe(false);
  });
});

describe('fullscreen asynchronous ownership', () => {
  function Fullscreen({ playbackKey = 'first' }) {
    const box = useRef(null);
    const video = useRef(null);
    const { toggleFullscreen } = usePlayerFullscreen(box, video, true, playbackKey);
    return (
      <div ref={box}>
        <video key={playbackKey} ref={video} />
        <button onClick={() => void toggleFullscreen()}>全屏</button>
      </div>
    );
  }
  it('does not lock orientation after a pending fullscreen request resolves following unmount', async () => {
    let resolve;
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    const lock = vi.fn().mockResolvedValue();
    vi.stubGlobal('screen', { orientation: { lock } });
    const { unmount } = render(<Fullscreen />);
    fireEvent.click(screen.getByRole('button', { name: '全屏' }));
    unmount();
    await act(async () => resolve());
    expect(lock).not.toHaveBeenCalled();
    delete HTMLElement.prototype.requestFullscreen;
  });
  it('cancels a Safari metadata wait when its video is replaced or the player unmounts', () => {
    const enter = vi.fn();
    Object.defineProperty(HTMLVideoElement.prototype, 'webkitEnterFullscreen', {
      configurable: true,
      value: enter,
    });
    const { container, rerender, unmount } = render(<Fullscreen />);
    const first = container.querySelector('video');
    fireEvent.click(screen.getByRole('button', { name: '全屏' }));
    rerender(<Fullscreen playbackKey="second" />);
    fireEvent.loadedMetadata(first);
    expect(enter).not.toHaveBeenCalled();
    const second = container.querySelector('video');
    fireEvent.click(screen.getByRole('button', { name: '全屏' }));
    unmount();
    fireEvent.loadedMetadata(second);
    expect(enter).not.toHaveBeenCalled();
    delete HTMLVideoElement.prototype.webkitEnterFullscreen;
  });
});
