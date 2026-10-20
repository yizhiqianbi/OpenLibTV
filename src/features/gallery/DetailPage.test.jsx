import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DetailPage from './DetailPage.jsx';

const resources = vi.hoisted(() => ({}));
const useContent = vi.hoisted(() => vi.fn());

vi.mock('../../data.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useContent: (...args) => useContent(...args),
}));

beforeEach(() => {
  for (const name of Object.keys(resources)) delete resources[name];
  useContent.mockImplementation((name) => resources[name]);
  resources.gallery = {
    data: { items: [] },
    error: null,
    reload: vi.fn(),
  };
  resources['gallery-all'] = {
    data: null,
    error: null,
    reload: vi.fn(),
  };
  resources['gallery-details/missing'] = {
    data: null,
    error: new Error('offline'),
    reload: vi.fn(),
  };
  resources.profiles = {
    data: {},
    error: null,
    reload: vi.fn(),
  };
});

describe('DetailPage loading states', () => {
  it('shows a retry action when the detail request fails', () => {
    const navigate = vi.fn();
    render(
      <DetailPage
        path="/detail/missing"
        navigate={navigate}
        login={vi.fn()}
        user={null}
        toast={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('作品加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(resources['gallery-details/missing'].reload).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });
});
