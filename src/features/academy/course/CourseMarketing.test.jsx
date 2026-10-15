import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CoursePage from '../CoursePage.jsx';
import configs from '../../../../public/data/remote-configs.json';
import snapshots from '../../../../public/data/academy-courses.json';
import { createMarketingFrequency } from './marketing-frequency.js';
import { createPracticeIntroMemory } from './practice-entry.js';
import { COURSE_MEMBER_REFRESH_EVENT } from './marketing-model.js';

const userFixture = { uuid: 'fixture-marketing-user', id: 'fixture-intro-user' };
// Read configuration and UI packages are real public snapshots; course/video/access below are fixtures.
function fixture({ clipTotal = 3, complete = false, member = false } = {}) {
  let completed = false;
  const course = {
    courseId: 'fixture',
    title: '仅测试课程',
    creditsGrant: 20,
    practiceEnabled: true,
    lastPracticeNodeUuid: 'practice/last',
    entrySectionId: 'first',
    defaultExpandedIds: [],
    clipTotal,
    clipDone: 0,
    units: [
      {
        id: 'u',
        implicit: true,
        groups: [
          {
            id: 'g',
            implicit: true,
            leaves: ['first', 'second', 'third'].map((id, index) => ({
              sectionId: id,
              title: `仅测试第${index + 1}节`,
              available: true,
              status: 'learning',
              practiceNodes: index
                ? []
                : [{ practiceNodeUuid: 'practice/first', title: '仅测试练习', done: false }],
            })),
          },
        ],
      },
    ],
  };
  const config = {
    ...configs['292'],
    clipMinute: { ...configs['292'].clipMinute, courses: [], defaultMinute: 0.1 },
  };
  const repository = {
    course: vi.fn(async (id) =>
      structuredClone({ ...course, courseId: id, clipDone: completed ? 1 : 0 }),
    ),
    lesson: vi.fn(async (id) => ({
      sectionId: id,
      title: `仅测试第${['first', 'second', 'third'].indexOf(id) + 1}节`,
      videoUrl: `/test-${id}.mp4`,
      durationSec: 120,
      resumeSec: 1,
      markers: [],
    })),
    marketingConfig: vi.fn(async () => config),
    courseMemberPower: vi.fn(async () => ({
      code: 0,
      data: { member: member ? { displayName: '仅测试已开通会员' } : null },
    })),
    reportLessonProgress: vi.fn(async () => {
      completed ||= complete;
      return { watchDone: complete };
    }),
    memberPackages: vi.fn(async () => snapshots.courseMember),
    checkout: vi.fn().mockRejectedValue(new Error('测试适配器未连接支付服务')),
  };
  const frequency = createMarketingFrequency();
  vi.spyOn(frequency, 'markShown');
  const memory = createPracticeIntroMemory();
  return { repository, course, config, frequency, memory };
}
function metadata(video) {
  Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
  fireEvent.loadedMetadata(video);
}
async function ready(options, props = {}) {
  const rendered = render(
    <CoursePage
      courseId="fixture"
      repository={options.repository}
      marketingFrequency={options.frequency}
      introMemory={options.memory}
      user={userFixture}
      navigate={vi.fn()}
      {...props}
    />,
  );
  await screen.findByRole('heading', { name: '仅测试第1节' });
  const video = rendered.container.querySelector('video');
  metadata(video);
  return { ...rendered, video };
}
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(720);
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Desktop fixture');
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});
afterEach(() => {
  vi.useRealTimers();
  delete document.fullscreenElement;
});

describe('actual CoursePage marketing and practice source gates', () => {
  it('waits for the configured threshold and nonmember confirmation, then sends the exact bar scene into the dedicated paywall', async () => {
    const options = fixture(),
      user = userEvent.setup();
    const { video } = await ready(options);
    video.currentTime = 5;
    fireEvent.timeUpdate(video);
    expect(options.repository.courseMemberPower).not.toHaveBeenCalled();
    video.currentTime = 6;
    fireEvent.timeUpdate(video);
    const bar = await screen.findByRole('button', { name: configs['292'].clipMinute.text });
    expect(options.repository.courseMemberPower).toHaveBeenCalledTimes(1);
    await user.click(bar);
    const modal = await screen.findByRole('dialog', { name: '课程专属会员' });
    const buy = await within(modal).findAllByRole('button', { name: '立即抢订' });
    await user.click(buy[0]);
    expect(options.repository.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId: 'fixture',
        kind: 'course-member',
        touchpointScene: 'lesson_watch_n_minutes',
      }),
    );
    expect((await within(modal).findByRole('alert')).textContent).toContain('未连接支付服务');
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(bar);
    expect(video.currentTime).toBe(6);
  });

  it('does not infer nonmembership, retries an actual power failure, and invalidates cached power after the source refresh event', async () => {
    const options = fixture();
    options.repository.courseMemberPower.mockRejectedValueOnce(new Error('unavailable'));
    const { video } = await ready(options);
    video.currentTime = 7;
    fireEvent.timeUpdate(video);
    const error = await screen.findByRole('alert');
    expect(error.textContent).toContain('会员权益验证失败');
    expect(screen.queryByRole('button', { name: configs['292'].clipMinute.text })).toBeNull();
    fireEvent.click(within(error).getByRole('button', { name: '重试' }));
    await screen.findByRole('button', { name: configs['292'].clipMinute.text });
    options.repository.courseMemberPower.mockResolvedValue({
      code: 0,
      data: { member: { displayName: '仅测试会员' } },
    });
    act(() => window.dispatchEvent(new Event(COURSE_MEMBER_REFRESH_EVENT)));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: configs['292'].clipMinute.text })).toBeNull(),
    );
    expect(options.repository.courseMemberPower).toHaveBeenCalledTimes(3);
  });

  it('prioritizes half-progress, suppresses first-clip, and resets takeover and the minute bar across A-B-A chapter navigation', async () => {
    const options = fixture({ clipTotal: 2, complete: true }),
      user = userEvent.setup();
    const { container, video } = await ready(options);
    video.currentTime = 119;
    fireEvent.timeUpdate(video);
    const popup = await screen.findByRole('dialog', {
      name: configs['292'].progressHalf.popup.title,
    });
    expect(options.repository.course).toHaveBeenLastCalledWith('fixture', { force: true });
    expect(options.frequency.markShown).toHaveBeenCalledWith(
      expect.objectContaining({ touch: 'progressHalf' }),
      { suppress: ['firstClipDone'] },
    );
    expect(popup.querySelector('img').getAttribute('src')).toBe(
      configs['292'].progressHalf.popup.imgUrl,
    );
    fireEvent.ended(video);
    await user.click(within(popup).getByRole('button', { name: '继续看课' }));
    expect(screen.getByRole('button', { name: configs['292'].clipMinute.text })).toBeTruthy();
    vi.useFakeTimers();
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.queryByRole('dialog', { name: '播放完毕' })).toBeNull();
    expect(options.repository.lesson).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '下一节' }));
    await act(async () => {});
    const second = container.querySelector('video');
    metadata(second);
    options.repository.reportLessonProgress.mockResolvedValue({ watchDone: false });
    fireEvent.ended(second);
    expect(screen.getByRole('dialog', { name: '播放完毕' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭播放完毕提示' }));
    fireEvent.click(screen.getByRole('button', { name: '仅测试第1节' }));
    await act(async () => {});
    const returned = container.querySelector('video');
    metadata(returned);
    expect(returned.currentTime).toBe(1);
    expect(screen.queryByRole('button', { name: configs['292'].clipMinute.text })).toBeNull();
    fireEvent.ended(returned);
    expect(screen.getByRole('dialog', { name: '播放完毕' })).toBeTruthy();
  });

  it('shows the first-clip source popup, follows fullscreen portal changes, and forwards its scene on purchase without changing access', async () => {
    const options = fixture({ complete: true }),
      user = userEvent.setup();
    const { container, video } = await ready(options);
    video.currentTime = 119;
    fireEvent.timeUpdate(video);
    let popup = await screen.findByRole('dialog', {
      name: configs['292'].firstClipDone.popup.title,
    });
    const player = container.querySelector('.academy-player');
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: player });
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    popup = screen.getByRole('dialog', { name: configs['292'].firstClipDone.popup.title });
    expect(player.contains(popup)).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    await user.click(within(popup).getByRole('button', { name: '立即抢订' }));
    const modal = await screen.findByRole('dialog', { name: '课程专属会员' });
    expect(player.contains(modal)).toBe(true);
    const buy = await within(modal).findAllByRole('button', { name: '立即抢订' });
    await user.click(buy[0]);
    expect(options.repository.checkout).toHaveBeenCalledWith(
      expect.objectContaining({ touchpointScene: 'first_video_complete' }),
    );
    expect(options.repository.lesson).toHaveBeenCalledTimes(1);
  });

  it('keeps member and anonymous preview branches free of marketing prompts, and retries read config loading errors', async () => {
    const options = fixture({ member: true, complete: true });
    const { video, unmount } = await ready(options);
    video.currentTime = 10;
    fireEvent.timeUpdate(video);
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: configs['292'].clipMinute.text })).toBeNull();
    unmount();
    const anonymous = fixture();
    const next = await ready(anonymous, { user: null });
    next.video.currentTime = 119;
    fireEvent.timeUpdate(next.video);
    await act(async () => {});
    expect(anonymous.repository.courseMemberPower).not.toHaveBeenCalled();
    expect(anonymous.repository.reportLessonProgress).not.toHaveBeenCalled();
    next.unmount();
    const error = fixture();
    error.repository.marketingConfig.mockRejectedValueOnce(new Error('configuration unavailable'));
    await ready(error);
    const message = await screen.findByRole('alert');
    expect(message.textContent).toContain('课程优惠配置加载失败');
    fireEvent.click(within(message).getByRole('button', { name: '重试' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(error.repository.marketingConfig).toHaveBeenLastCalledWith({ force: true });
  });

  it('shows the desktop general intro only once, preserves lastPracticeNodeUuid, pauses media, and uses a new window even for anonymous entry', async () => {
    const options = fixture(),
      user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null),
      navigate = vi.fn();
    await ready(options, { user: null, navigate });
    const entry = screen.getAllByRole('button', { name: /获得 20 积分/ })[0];
    await user.click(entry);
    const intro = await screen.findByRole('dialog', { name: '练习画布' });
    expect(within(intro).getByText('20 练习积分')).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(entry);
    await user.click(entry);
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        '/academy/practice/fixture?sectionId=practice%2Flast',
        '_blank',
        'noopener',
      ),
    );
    expect(navigate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '去跟练' }));
    expect(open).toHaveBeenLastCalledWith(
      '/academy/practice/fixture?sectionId=practice%2Ffirst',
      '_blank',
      'noopener',
    );
  });

  it('starts practice from the intro using its original saved node and retains the intro on a failed history write', async () => {
    const options = fixture(),
      user = userEvent.setup(),
      open = vi.fn();
    options.memory = createPracticeIntroMemory({
      read: () => false,
      write: () => {
        throw new Error('quota');
      },
    });
    await ready(options, { openPractice: open });
    await user.click(screen.getAllByRole('button', { name: /获得 20 积分/ })[0]);
    const intro = await screen.findByRole('dialog', { name: '练习画布' });
    expect(within(intro).getByRole('alert').textContent).toContain('介绍记录未能保存');
    await user.click(within(intro).getByRole('button', { name: '开始跟练' }));
    expect(open).toHaveBeenCalledWith('fixture', 'practice/last');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('applies a late configured threshold to the actual paused position without requiring another media event', async () => {
    const options = fixture();
    let resolve;
    options.repository.marketingConfig.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { video } = await ready(options);
    video.currentTime = 10;
    fireEvent.timeUpdate(video);
    expect(options.repository.courseMemberPower).not.toHaveBeenCalled();
    await act(async () => resolve(options.config));
    await screen.findByRole('button', { name: configs['292'].clipMinute.text });
    expect(options.repository.courseMemberPower).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(10);
  });

  it('ignores a previous course member-power result after route replacement', async () => {
    const options = fixture({ complete: true });
    let resolve;
    options.repository.courseMemberPower.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { video, container, rerender } = await ready(options);
    video.currentTime = 119;
    fireEvent.timeUpdate(video);
    await waitFor(() => expect(options.repository.courseMemberPower).toHaveBeenCalledTimes(1));
    rerender(
      <CoursePage
        courseId="other-fixture"
        repository={options.repository}
        marketingFrequency={options.frequency}
        introMemory={options.memory}
        user={userFixture}
        navigate={vi.fn()}
      />,
    );
    await waitFor(() => expect(container.querySelector('video')).not.toBe(video));
    await act(async () => resolve({ code: 0, data: { member: null } }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(options.frequency.markShown).not.toHaveBeenCalled();
  });

  it('clears a failed completion power check on confirmed member retry without showing a sale', async () => {
    const options = fixture({ complete: true });
    options.config.clipMinute.enabled = false;
    options.repository.courseMemberPower.mockRejectedValueOnce(new Error('unavailable'));
    const { video } = await ready(options);
    video.currentTime = 5;
    fireEvent.timeUpdate(video);
    const alert = await screen.findByRole('alert');
    options.repository.courseMemberPower.mockResolvedValue({
      code: 0,
      data: { member: { displayName: '仅测试会员' } },
    });
    fireEvent.click(within(alert).getByRole('button', { name: '重试' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not resurrect a prior course popup when the new course power check fails', async () => {
    const options = fixture({ complete: true });
    const { video, container, rerender } = await ready(options);
    video.currentTime = 119;
    fireEvent.timeUpdate(video);
    await screen.findByRole('dialog', { name: configs['292'].firstClipDone.popup.title });
    options.repository.courseMemberPower.mockRejectedValue(new Error('unavailable'));
    rerender(
      <CoursePage
        courseId="other-fixture"
        repository={options.repository}
        marketingFrequency={options.frequency}
        introMemory={options.memory}
        user={userFixture}
        navigate={vi.fn()}
      />,
    );
    const next = await waitFor(() => {
      const element = container.querySelector('video');
      expect(element).toBeTruthy();
      expect(element).not.toBe(video);
      return element;
    });
    metadata(next);
    next.currentTime = 6;
    fireEvent.timeUpdate(next);
    await screen.findByRole('alert');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
