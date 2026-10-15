import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CoursePage from '../CoursePage.jsx';
import { AcademyAccessError } from './repository.js';

// These are injected local fixtures, never purchased or fetched from an account.
function fixture({ playable = true, report = true } = {}) {
  const leaves = [
    {
      sectionId: 'first',
      title: '夹具第一节',
      available: playable,
      status: 'learning',
      practiceNodes: [{ practiceNodeUuid: 'practice/one', title: '夹具练习', done: false }],
    },
    {
      sectionId: 'locked',
      title: '夹具待更新节',
      available: false,
      status: 'not_started',
      practiceNodes: [],
    },
    {
      sectionId: 'second',
      title: '夹具第二节',
      available: playable,
      status: 'not_started',
      practiceNodes: [],
    },
  ];
  const course = {
    courseId: 'fixture',
    title: '夹具课程',
    creditsGrant: 5,
    practiceEnabled: true,
    entrySectionId: 'first',
    defaultExpandedIds: [],
    units: [
      {
        id: 'unit',
        title: '夹具单元',
        groups: [{ id: 'group', title: '夹具分组', order: 1, implicit: true, leaves }],
      },
    ],
  };
  const repository = {
    course: vi.fn(async () => course),
    lesson: vi.fn(async (id) => ({
      sectionId: id,
      title: id === 'first' ? '夹具第一节' : '夹具第二节',
      videoUrl: `/fixture-${id}.mp4`,
      durationSec: 120,
      resumeSec: id === 'first' ? 17 : 42,
      heartbeatIntervalSec: 15,
      markers: [],
    })),
    ...(report ? { reportLessonProgress: vi.fn().mockResolvedValue({ watchDone: false }) } : {}),
  };
  return { repository, course };
}
function metadata(video) {
  Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
  fireEvent.loadedMetadata(video);
}
function landscape() {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 iPhone Mobile');
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(844);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(390);
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    writable: true,
    value: null,
  });
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
    configurable: true,
    value: function () {
      document.fullscreenElement = this;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    },
  });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: function () {
      document.fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    },
  });
}
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    return Promise.resolve();
  });
});
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else delete navigator.clipboard;
  vi.useRealTimers();
  delete HTMLElement.prototype.requestFullscreen;
  delete document.exitFullscreen;
  delete document.fullscreenElement;
});

async function openEpisodes(user) {
  await user.click(screen.getByRole('button', { name: '全屏' }));
  const opener = screen.getByRole('button', { name: '选集' });
  await user.click(opener);
  return { opener, drawer: screen.getByRole('dialog', { name: '课程选集' }) };
}

describe('CoursePage source landscape wiring with a local operating adapter', () => {
  it('loads the actual course drawer, enforces availability, flushes the selected chapter time and restores player focus', async () => {
    landscape();
    const user = userEvent.setup(),
      { repository } = fixture();
    const { container } = render(
      <CoursePage
        courseId="fixture"
        repository={repository}
        user={{ id: 'fixture-only' }}
        navigate={vi.fn()}
      />,
    );
    await screen.findByRole('heading', { name: '夹具第一节' });
    const first = container.querySelector('video');
    metadata(first);
    expect(first.currentTime).toBe(17);
    fireEvent.change(screen.getByRole('slider', { name: '视频播放进度' }), {
      target: { value: 23.7 },
    });
    const { opener, drawer } = await openEpisodes(user);
    expect(container.querySelector('.academy-player-landscape-top').textContent).toContain(
      '课程播放',
    );
    expect(
      within(drawer).getByRole('button', { name: '夹具第一节' }).getAttribute('aria-current'),
    ).toBe('true');
    const locked = within(drawer).getByRole('button', { name: /夹具待更新节/ });
    expect(locked.disabled).toBe(true);
    await user.click(locked);
    await user.click(within(drawer).getByRole('button', { name: '夹具第一节' }));
    expect(repository.lesson).toHaveBeenCalledTimes(1);
    expect(repository.reportLessonProgress).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    await user.click(opener);
    await user.click(
      within(screen.getByRole('dialog', { name: '课程选集' })).getByRole('button', {
        name: '夹具第二节',
      }),
    );
    await screen.findByRole('heading', { name: '夹具第二节' });
    expect(repository.reportLessonProgress).toHaveBeenCalledWith({
      sectionId: 'first',
      positionSec: 23,
      playbackRate: 1,
      final: true,
    });
    expect(repository.lesson).not.toHaveBeenCalledWith('locked', expect.anything());
    expect(document.activeElement).toBe(container.querySelector('.academy-player'));
    const second = container.querySelector('video');
    metadata(second);
    expect(second.currentTime).toBe(42);
    expect(second.getAttribute('src')).toBe('/fixture-second.mp4');
  });

  it('opens the mobile practice hint, copies the source sectionId and restores the stable chapter opener', async () => {
    landscape();
    const user = userEvent.setup(),
      { repository } = fixture();
    const navigate = vi.fn(),
      clipboard = { writeText: vi.fn().mockResolvedValue() };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    render(
      <CoursePage
        courseId="fixture"
        repository={repository}
        navigate={navigate}
        user={{ id: 'fixture-only' }}
        toast={vi.fn()}
      />,
    );
    await screen.findByRole('heading', { name: '夹具第一节' });
    const { opener, drawer } = await openEpisodes(user);
    await user.click(within(drawer).getByRole('button', { name: '去跟练' }));
    const modal = screen.getByRole('dialog', { name: 'AI 跟练室' });
    expect(screen.queryByRole('dialog', { name: '课程选集' })).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    await user.click(within(modal).getByRole('button', { name: '复制链接' }));
    expect(clipboard.writeText).toHaveBeenCalledWith(
      `${location.origin}/academy/practice/fixture?sectionId=practice%2Fone`,
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('waits for an adapter-confirmed new completion before releasing the source followup hold', async () => {
    const { repository } = fixture();
    repository.reportLessonProgress.mockResolvedValue({ watchDone: true });
    const { container } = render(
      <CoursePage
        courseId="fixture"
        repository={repository}
        user={{ id: 'fixture-only' }}
        navigate={vi.fn()}
      />,
    );
    await screen.findByRole('heading', { name: '夹具第一节' });
    const video = container.querySelector('video');
    metadata(video);
    vi.useFakeTimers();
    video.currentTime = 119;
    fireEvent.timeUpdate(video);
    await act(async () => {});
    expect(repository.course).toHaveBeenLastCalledWith('fixture', { force: true });
    expect(container.querySelector('video')).toBe(video);
    fireEvent.ended(video);
    expect(screen.queryByRole('dialog', { name: '播放完毕' })).toBeNull();
    act(() => vi.advanceTimersByTime(1999));
    expect(screen.queryByRole('dialog', { name: '播放完毕' })).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('dialog', { name: '播放完毕' })).toBeTruthy();
    expect(repository.lesson).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(5000));
    await act(async () => {});
    expect(repository.lesson).toHaveBeenLastCalledWith('second', { force: false });
  });

  it('keeps media and current time intact after a progress error and retries the exact current payload', async () => {
    const { repository } = fixture();
    repository.reportLessonProgress.mockRejectedValueOnce(new Error('offline'));
    const { container } = render(
      <CoursePage
        courseId="fixture"
        repository={repository}
        user={{ id: 'fixture-only' }}
        navigate={vi.fn()}
      />,
    );
    await screen.findByRole('heading', { name: '夹具第一节' });
    const video = container.querySelector('video');
    metadata(video);
    video.currentTime = 31.5;
    fireEvent.timeUpdate(video);
    await screen.findByRole('alert');
    expect(container.querySelector('video')).toBe(video);
    expect(video.currentTime).toBe(31.5);
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: '重试' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(repository.reportLessonProgress.mock.lastCall[0]).toEqual({
      sectionId: 'first',
      positionSec: 31,
      playbackRate: 1,
      final: false,
    });
    expect(repository.lesson).toHaveBeenCalledTimes(1);
  });

  it('keeps the active video during a failed completion refresh and exposes the source catalog retry', async () => {
    const { repository, course } = fixture();
    repository.course
      .mockResolvedValueOnce(course)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(course);
    repository.reportLessonProgress.mockResolvedValue({ watchDone: true });
    const { container } = render(
      <CoursePage
        courseId="fixture"
        repository={repository}
        user={{ id: 'fixture-only' }}
        navigate={vi.fn()}
      />,
    );
    await screen.findByRole('heading', { name: '夹具第一节' });
    const video = container.querySelector('video');
    metadata(video);
    video.currentTime = 100;
    fireEvent.timeUpdate(video);
    const retry = await screen.findByRole('button', { name: '目录加载失败，点击重试' });
    expect(container.querySelector('video')).toBe(video);
    fireEvent.click(retry);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '目录加载失败，点击重试' })).toBeNull(),
    );
    expect(repository.course).toHaveBeenCalledTimes(3);
    expect(repository.lesson).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(100);
  });

  it('keeps the anonymous locked course as a skeleton and never invokes playback or progress adapters', async () => {
    const { repository } = fixture({ playable: false });
    const { container } = render(
      <CoursePage courseId="fixture" repository={repository} navigate={vi.fn()} />,
    );
    await screen.findByText('夹具课程');
    expect(container.querySelector('video')).toBeNull();
    expect(screen.queryByRole('button', { name: '选集' })).toBeNull();
    expect(screen.queryByText('夹具第一节')).toBeNull();
    expect(repository.lesson).not.toHaveBeenCalled();
    expect(repository.reportLessonProgress).not.toHaveBeenCalled();
  });

  it('does not record an anonymous preview, and leaves a denied lesson retryable without pretending to authorize it', async () => {
    const { repository } = fixture();
    const props = { courseId: 'fixture', repository, navigate: vi.fn() };
    const view = render(<CoursePage {...props} />);
    await screen.findByRole('heading', { name: '夹具第一节' });
    const video = view.container.querySelector('video');
    metadata(video);
    video.currentTime = 30;
    fireEvent.timeUpdate(video);
    fireEvent.pause(video);
    fireEvent.ended(video);
    await act(async () => {});
    expect(repository.reportLessonProgress).not.toHaveBeenCalled();
    view.unmount();
    const denied = fixture().repository;
    denied.lesson.mockRejectedValue(new AcademyAccessError(60003, 'not enrolled'));
    render(<CoursePage {...props} repository={denied} />);
    await screen.findByText('课程信息加载失败，请刷新重试');
    expect(screen.queryByRole('button', { name: '播放' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(denied.lesson).toHaveBeenCalledTimes(2));
    expect(denied.reportLessonProgress).not.toHaveBeenCalled();
  });
});
