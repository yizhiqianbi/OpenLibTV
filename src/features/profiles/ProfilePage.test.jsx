import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ProfilePage from './ProfilePage.jsx';

const resources = vi.hoisted(() => ({}));
const useContent = vi.hoisted(() => vi.fn());

vi.mock('../../data.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useContent: (...args) => useContent(...args),
}));

beforeEach(() => {
  for (const name of Object.keys(resources)) delete resources[name];
  useContent.mockImplementation((name) => resources[name]);
  resources['gallery-all'] = {
    data: null,
    loading: false,
    error: new Error('offline'),
    reload: vi.fn(),
  };
  resources.gallery = {
    data: { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  };
  resources.profiles = {
    data: {},
    loading: false,
    error: null,
    reload: vi.fn(),
  };
  resources['shell-config'] = {
    data: {},
    loading: false,
    error: null,
    reload: vi.fn(),
  };
});

describe('ProfilePage loading states', () => {
  it('shows a retry action when profile content fails before a profile is available', () => {
    render(<ProfilePage navigate={vi.fn()} login={vi.fn()} user={null} toast={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toContain('用户主页加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(resources['gallery-all'].reload).toHaveBeenCalledOnce();
  });
});
