import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ActivitiesPage from './ActivitiesPage.jsx';

const resource = vi.hoisted(() => ({ data: { activities: [] } }));
vi.mock('../../data.js', async (original) => ({
  ...(await original()),
  useContent: () => ({ data: resource.data, loading: false, error: null, reload: vi.fn() }),
}));

function activity(id) {
  return { activityId: id, name: `活动 ${id}`, status: 2, coverUrl: `/cover-${id}.jpg` };
}
const props = () => ({
  asset: (url) => url,
  navigate: vi.fn(),
  login: vi.fn(),
  user: { name: '本地' },
});

let observers;
beforeEach(() => {
  resource.data = { activities: [] };
  observers = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.disconnect = vi.fn();
        observers.push(this);
      }
      observe() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('challenge list page', () => {
  it('loads snapshot pages near the sentinel and only shows the terminal state after the last page', async () => {
    resource.data = { activities: Array.from({ length: 21 }, (_, index) => activity(index + 1)) };
    const callbacks = props();
    render(<ActivitiesPage {...callbacks} />);
    expect(screen.queryByRole('heading', { name: '活动 21' })).toBeNull();
    expect(screen.queryByText('没有更多了')).toBeNull();
    expect(observers[0].options).toEqual({ rootMargin: '200px' });
    await act(async () => observers[0].callback([{ isIntersecting: true }]));
    expect(screen.getByRole('heading', { name: '活动 21' })).toBeTruthy();
    expect(screen.getByText('没有更多了')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /活动 21/ }));
    expect(callbacks.navigate).toHaveBeenCalledWith('/activity/21');
  });

  it('renders initial skeleton, error retry, and a distinct empty state from an injected reader', async () => {
    let reject;
    const pending = new Promise((_, failure) => {
      reject = failure;
    });
    const activitySource = {
      list: vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce({ list: [], total: 0 }),
    };
    render(<ActivitiesPage {...props()} activitySource={activitySource} />);
    expect(screen.getByLabelText('活动加载中')).toBeTruthy();
    await act(async () => reject(new Error('offline')));
    expect(screen.getByRole('alert').textContent).toContain('活动加载失败');
    expect(screen.queryByText('暂无活动')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(screen.getByText('暂无活动')).toBeTruthy());
    expect(screen.queryByText('没有更多了')).toBeNull();
    expect(activitySource.list.mock.calls.map(([request]) => request.page)).toEqual([1, 1]);
  });

  it('preserves optional card description and omits an absent reward label', () => {
    resource.data = { activities: [{ ...activity(1), shortDescription: '作品挑战简介' }] };
    render(<ActivitiesPage {...props()} />);
    expect(screen.getByText('作品挑战简介')).toBeTruthy();
    expect(document.querySelector('.activity-reward')).toBeNull();
  });
});
