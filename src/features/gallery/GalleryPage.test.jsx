import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Gallery, { GalleryCard } from '../../components/Gallery.jsx';

const resources = vi.hoisted(() => ({}));
const useContent = vi.hoisted(() => vi.fn());
vi.mock('../../data.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useContent: (...args) => useContent(...args),
}));
const work = {
  id: 'work',
  name: '作品甲',
  nickname: '作者甲',
  ownerUuid: 'author',
  coverUrl: '/assets/a.webp',
  snapshotId: 'canvas',
};

beforeEach(() => {
  for (const name of Object.keys(resources)) delete resources[name];
  useContent.mockImplementation((name) => resources[name]);
  resources.gallery = { data: { items: [work] }, loading: false, error: null, reload: vi.fn() };
  resources['gallery-all'] = {
    data: { items: [work], allItems: [work] },
    loading: false,
    error: null,
    reload: vi.fn(),
  };
  resources['gallery-categories'] = { data: [], loading: false, error: null, reload: vi.fn() };
});

describe('Gallery compatibility and states', () => {
  it('shows loading instead of an empty result and retries failed content reads', async () => {
    const props = { navigate: vi.fn(), login: vi.fn() };
    Object.values(resources).forEach((resource) => {
      resource.data = null;
      resource.loading = true;
    });
    const view = render(<Gallery {...props} />);
    expect(screen.getByRole('status').textContent).toContain('加载作品');
    expect(screen.queryByText('暂无作品')).toBeNull();
    Object.values(resources).forEach((resource) => {
      resource.loading = false;
      resource.error = new Error('offline');
      resource.reload.mockRejectedValue(new Error('offline'));
    });
    view.rerender(<Gallery {...props} />);
    expect(screen.getByRole('alert').textContent).toContain('作品加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(resources.gallery.reload).toHaveBeenCalledOnce());
    expect(resources['gallery-all'].reload).toHaveBeenCalledOnce();
    expect(resources['gallery-categories'].reload).toHaveBeenCalledOnce();
  });
  it('keeps override galleries independent of content requests and navigates the compatibility card', () => {
    const navigate = vi.fn();
    render(<Gallery items={[work]} navigate={navigate} />);
    expect(useContent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '作品甲' }));
    expect(navigate).toHaveBeenCalledWith('/detail/work');
  });
  it('preserves creation-preview routing and does not trigger the cover route as well', () => {
    const navigate = vi.fn();
    render(<GalleryCard item={work} navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: /查看创作过程/ }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/detail/work?preview=1');
  });
});
