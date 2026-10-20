import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SkillShareMedia from './SkillShareMedia.jsx';

const items = [{ productionCaseUrl: '/one.png' }, { productionCaseUrl: '/two.png' }];

afterEach(() => vi.restoreAllMocks());

describe('Skill share case media', () => {
  it('uses the 360ms switching state and preserves pager bounds', () => {
    vi.useFakeTimers();
    render(<SkillShareMedia items={items} asset={(url) => url} />);
    const next = screen.getByRole('button', { name: '下一个案例' });
    fireEvent.click(next);
    expect(document.querySelector('.secondary-skill-media-stage').className).toContain(
      'is-switching',
    );
    expect(screen.getByRole('button', { name: '下一个案例' }).disabled).toBe(true);
    act(() => vi.advanceTimersByTime(360));
    expect(document.querySelector('.secondary-skill-media-stage').className).not.toContain(
      'is-switching',
    );
    vi.useRealTimers();
  });

  it('keeps document errors visible and retries the same case', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, text: async () => '# 恢复后的案例' });
    render(<SkillShareMedia items={[{ productionCaseUrl: '/case.md' }]} asset={(url) => url} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('内容加载失败'));
    fireEvent.click(screen.getByRole('button', { name: '重试读取案例' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '恢复后的案例' })).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows a retryable error layer for image and video media failures', () => {
    const view = render(
      <SkillShareMedia items={[{ productionCaseUrl: '/case.png' }]} asset={(url) => url} />,
    );
    fireEvent.error(screen.getByAltText('Skill 案例'));
    expect(screen.getByRole('alert').textContent).toContain('媒体加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(screen.queryByRole('alert')).toBeNull();
    view.unmount();

    render(<SkillShareMedia items={[{ productionCaseUrl: '/case.mp4' }]} asset={(url) => url} />);
    fireEvent.error(document.querySelector('video'));
    expect(screen.getByRole('alert').textContent).toContain('媒体加载失败');
  });
});
