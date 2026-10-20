import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import sample from '../../../public/data/academy-courses.json';
import CoursePage from './CoursePage.jsx';
import PracticePage from './PracticePage.jsx';
import ProductPage from './ProductPage.jsx';
import { AcademyAccessError, createAcademyRepository } from './course/repository.js';

const courseId = '01a04720890e7d7498763b99b845e1a2';
const publicRepository = () => createAcademyRepository({ load: async () => sample });
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  localStorage.clear();
});

describe('independent anonymous academy routes', () => {
  it('matches the observed course skeleton and opens only its dedicated member modal', async () => {
    const repository = publicRepository();
    const lesson = vi.spyOn(repository, 'lesson');
    const login = vi.fn();
    const { container } = render(
      <CoursePage courseId={courseId} repository={repository} navigate={vi.fn()} login={login} />,
    );
    await screen.findByText('LibTV x 罗永浩·AI视频课');
    expect(container.querySelector('.academy-course-video-skeleton')).toBeTruthy();
    expect(container.querySelector('video')).toBeNull();
    expect(lesson).not.toHaveBeenCalled();
    expect(screen.queryByText(sample.courses[courseId].clips[0].title)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /购买课程会员/ }));
    const modal = await screen.findByRole('dialog', { name: '课程专属会员' });
    await within(modal).findByText('99');
    expect(within(modal).getByText('罗永浩学员专属 比普通会员购买更优惠')).toBeTruthy();
    expect(within(modal).getAllByRole('button', { name: '立即抢订' })).toHaveLength(4);
    fireEvent.click(within(modal).getAllByRole('button', { name: '立即抢订' })[0]);
    expect(login).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('keeps an unauthorized practice error retryable without calling login or cloning canvas', async () => {
    const repository = publicRepository();
    const section = vi.spyOn(repository, 'practiceSection');
    const login = vi.fn();
    const renderCanvas = vi.fn();
    render(
      <PracticePage
        courseId={courseId}
        repository={repository}
        navigate={vi.fn()}
        login={login}
        renderPracticeCanvas={renderCanvas}
      />,
    );
    await screen.findByText('跟练配置加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(section).toHaveBeenCalledTimes(2));
    expect(login).not.toHaveBeenCalled();
    expect(renderCanvas).not.toHaveBeenCalled();
  });
  it('distinguishes source locked prerequisite state and team-account block', async () => {
    const repository = publicRepository();
    repository.practiceSection = vi.fn().mockRejectedValue(new AcademyAccessError(60011, 'locked'));
    const navigate = vi.fn();
    const { rerender } = render(
      <PracticePage courseId={courseId} repository={repository} navigate={navigate} />,
    );
    await screen.findByText('完成上一小节学习后解锁本次跟练');
    fireEvent.click(screen.getAllByRole('button', { name: '前往视频课' })[1]);
    expect(navigate).toHaveBeenCalledWith(`/academy/course/${courseId}`);
    rerender(
      <PracticePage
        courseId={courseId}
        repository={repository}
        navigate={navigate}
        user={{ accountType: 'team' }}
      />,
    );
    expect(screen.getByText('课程暂不支持团队账号操作')).toBeTruthy();
  });
  it('keeps source previous and next section navigation in the practice sidebar', async () => {
    const repository = {
      practiceCourse: vi.fn(async () => ({
        courseId: 'practice-fixture',
        courseTitle: '跟练夹具课程',
        sections: [
          { sectionId: 'practice-one', order: 1, title: '第一节', simulatedDone: true },
          { sectionId: 'practice-two', order: 2, title: '第二节', simulatedDone: false },
          { sectionId: 'practice-three', order: 3, title: '第三节', simulatedDone: false },
        ],
        lastSectionId: 'practice-two',
      })),
      practiceSection: vi.fn(async (id) => ({ sectionId: id, status: 'ready' })),
    };
    render(
      <PracticePage
        courseId="practice-fixture"
        repository={repository}
        navigate={vi.fn()}
        renderPracticeCanvas={({ section }) => <div>{section.sectionId}</div>}
      />,
    );
    await screen.findByText('practice-two');
    const previous = screen.getByRole('button', { name: '上一节' });
    const next = screen.getByRole('button', { name: '下一节' });
    expect(previous.disabled).toBe(false);
    expect(next.disabled).toBe(false);

    fireEvent.click(next);
    await waitFor(() =>
      expect(repository.practiceSection).toHaveBeenLastCalledWith('practice-three', {
        force: false,
      }),
    );
    expect(screen.getByRole('button', { name: '上一节' }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: '下一节' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '上一节' }));
    await waitFor(() =>
      expect(repository.practiceSection).toHaveBeenLastCalledWith('practice-two', { force: false }),
    );
  });
  it('renders the unknown product info and content errors as separate source branches', async () => {
    render(
      <ProductPage skuCode="unknown-course" repository={publicRepository()} navigate={vi.fn()} />,
    );
    await screen.findByText('课程信息加载失败，请刷新重试');
    expect(screen.getByText('内容加载失败，请刷新重试')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '立即购买' })).toBeNull();
  });

  it('retries product information without creating a checkout or owned state', async () => {
    const product = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary product failure'))
      .mockResolvedValueOnce({
        courseId: 'fixture',
        title: '重试商品',
        owned: false,
        priceCurrent: 100,
        priceOriginal: 100,
        clipTotal: 1,
        creditsGrant: 1,
        validDays: 0,
      });
    const repository = {
      product,
      intro: vi.fn().mockResolvedValue({
        title: '重试商品',
        cover: '/fixture.png',
        tags: [],
        intro: '简介',
        outline: [],
      }),
      checkout: vi.fn(),
    };
    render(<ProductPage skuCode="retry-product" repository={repository} navigate={vi.fn()} />);
    await screen.findByText('课程信息加载失败，请刷新重试');
    fireEvent.click(screen.getAllByRole('button', { name: '重试' })[0]);
    await screen.findByText('重试商品');
    expect(product).toHaveBeenCalledTimes(2);
    expect(repository.checkout).not.toHaveBeenCalled();
  });
});

describe('injected local adapter states, without real enrollment or payment', () => {
  it('renders source positive course catalog only when the adapter returns an available lesson', async () => {
    const repository = {
      course: async () => ({
        courseId: 'fixture',
        title: '本地测试课程',
        creditsGrant: 2,
        practiceEnabled: true,
        entrySectionId: 'first',
        defaultExpandedIds: [],
        units: [
          {
            id: 'u',
            implicit: true,
            groups: [
              {
                id: 'g',
                implicit: true,
                leaves: [
                  { sectionId: 'first', title: '本地第一节', available: true, practiceNodes: [] },
                  { sectionId: 'second', title: '本地第二节', available: true, practiceNodes: [] },
                ],
              },
            ],
          },
        ],
      }),
      lesson: vi.fn(async (id) => ({
        title: id === 'first' ? '本地第一节' : '本地第二节',
        videoUrl: '/test-only.mp4',
        durationSec: 8,
      })),
    };
    render(<CoursePage courseId="fixture" repository={repository} navigate={vi.fn()} />);
    await screen.findByRole('heading', { name: '本地第一节' });
    fireEvent.click(screen.getByRole('button', { name: '下一节' }));
    await screen.findByRole('heading', { name: '本地第二节' });
    expect(repository.lesson).toHaveBeenLastCalledWith('second', { force: false });
  });
  it('sends an owned product to learning and never treats unavailable checkout as purchased', async () => {
    const repository = {
      product: async () => ({
        courseId: 'fixture',
        title: '仅测试商品',
        owned: true,
        priceCurrent: 100,
        priceOriginal: 200,
        clipTotal: 1,
        creditsGrant: 2,
        validDays: 0,
      }),
      intro: async () => ({
        title: '仅测试商品',
        cover: '/fixture.png',
        tags: [],
        intro: '简介',
        outline: [],
      }),
      checkout: vi.fn(),
    };
    const navigate = vi.fn();
    render(
      <ProductPage
        skuCode="fixture"
        repository={repository}
        navigate={navigate}
        user={{ id: 'local-fixture' }}
      />,
    );
    const buttons = await screen.findAllByRole('button', { name: '立即学习' });
    fireEvent.click(buttons[0]);
    expect(navigate).toHaveBeenCalledWith('/academy/course/fixture');
    expect(repository.checkout).not.toHaveBeenCalled();
  });
});
