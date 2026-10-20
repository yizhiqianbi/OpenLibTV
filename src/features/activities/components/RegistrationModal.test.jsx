import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Registration from './RegistrationModal.jsx';

function fillForm() {
  fireEvent.change(screen.getByPlaceholderText('请输入手机号或微信号'), {
    target: { value: '13800000000' },
  });
  fireEvent.change(screen.getByPlaceholderText('填写您的社媒主页链接，如，小红书、B站、抖音等'), {
    target: { value: 'https://example.test/profile' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
}

const baseProps = () => ({
  item: { activityId: 12, name: '测试挑战赛', tagId: 3 },
  user: { name: '本地用户' },
  onClose: vi.fn(),
  onSuccess: vi.fn(),
});

describe('RegistrationModal submission boundary', () => {
  it('keeps the draft and exposes a retryable server error', async () => {
    let reject;
    const onSubmit = vi.fn(
      () =>
        new Promise((_, failure) => {
          reject = failure;
        }),
    );
    render(<Registration {...baseProps()} onSubmit={onSubmit} />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: '提交报名' }));

    expect(screen.getByRole('button', { name: '提交中…' }).disabled).toBe(true);
    await act(async () => reject(new Error('报名服务暂时不可用')));
    expect(screen.getByRole('alert').textContent).toContain('报名服务暂时不可用');
    expect(screen.getByDisplayValue('13800000000')).toBeTruthy();
    expect(screen.getByDisplayValue('https://example.test/profile')).toBeTruthy();
    expect(screen.getByRole('button', { name: '提交报名' }).disabled).toBe(false);
  });

  it('waits for an injected source and forwards the source payload before closing', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true });
    const onSuccess = vi.fn();
    render(<Registration {...baseProps()} onSubmit={onSubmit} onSuccess={onSuccess} />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: '提交报名' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        activityId: 12,
        tagId: 3,
        contactInfo: 'phone:13800000000',
        personalHomepageUrl: 'https://example.test/profile',
      }),
    );
  });
});
