import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Membership from './MembershipModal.jsx';

const useContent = vi.hoisted(() => vi.fn());
const memberResource = vi.hoisted(() => ({}));

vi.mock('../../data.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useContent: (...args) => useContent(...args),
}));

beforeEach(() => {
  memberResource.data = {};
  memberResource.loading = false;
  memberResource.error = new Error('offline');
  memberResource.reload = vi.fn().mockResolvedValue({});
  useContent.mockReturnValue(memberResource);
});

describe('Membership content states', () => {
  it('shows a retry action when membership content fails', () => {
    render(<Membership onClose={vi.fn()} login={vi.fn()} user={null} toast={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toContain('会员信息加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(memberResource.reload).toHaveBeenCalledOnce();
  });
});
