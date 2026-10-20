import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StudioPage from './StudioLandingPage.jsx';

const useContent = vi.hoisted(() => vi.fn());
const configResource = vi.hoisted(() => ({}));

vi.mock('../../data.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useContent: (...args) => useContent(...args),
}));

beforeEach(() => {
  configResource.data = {};
  configResource.loading = false;
  configResource.error = new Error('offline');
  configResource.reload = vi.fn().mockResolvedValue({});
  useContent.mockReturnValue(configResource);
});

describe('Studio landing loading states', () => {
  it('shows a retry action when the 3D-BOX configuration fails', () => {
    render(<StudioPage navigate={vi.fn()} login={vi.fn()} user={null} toast={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toContain('3D-BOX 配置加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(configResource.reload).toHaveBeenCalledOnce();
  });
});
