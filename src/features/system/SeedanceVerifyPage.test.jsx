import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SeedanceVerifyPage from './SeedanceVerifyPage.jsx';

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, '', '/');
});

it('keeps task verification retryable after the service boundary fails', () => {
  vi.useFakeTimers();
  window.history.replaceState({}, '', '/seedance-verify?taskId=20260608123456');
  const toast = vi.fn();
  render(<SeedanceVerifyPage user={{ id: 'local-user' }} login={vi.fn()} toast={toast} />);
  fireEvent.click(screen.getByRole('button', { name: '开始核验' }));
  act(() => vi.advanceTimersByTime(800));
  expect(screen.getByRole('alert').textContent).toContain('查询失败，请稍后重试');
  expect(screen.getByRole('button', { name: '重试' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(screen.getByText(/正在向 火山方舟/)).toBeTruthy();
  expect(toast).toHaveBeenCalledWith('核验服务尚未连接，当前为前端演示');
});
