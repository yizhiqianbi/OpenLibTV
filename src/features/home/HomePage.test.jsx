import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import HomePage from './HomePage.jsx';

const useContent = vi.hoisted(() => vi.fn());
const homeResource = vi.hoisted(() => ({}));

vi.mock('../../data.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useContent: (...args) => useContent(...args),
}));
vi.mock('../../components/Gallery.jsx', () => ({ default: () => null }));

beforeEach(() => {
  homeResource.data = {};
  homeResource.loading = false;
  homeResource.error = new Error('offline');
  homeResource.reload = vi.fn().mockResolvedValue({});
  useContent.mockReturnValue(homeResource);
});

describe('HomePage loading states', () => {
  it('shows a retry action when home content fails before loading', () => {
    render(<HomePage navigate={vi.fn()} login={vi.fn()} user={null} />);

    expect(screen.getByRole('alert').textContent).toContain('首页内容加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(homeResource.reload).toHaveBeenCalledOnce();
  });
});
