import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import secondary from '../../../../public/data/secondary.json';
import SkillCreatePage from './SkillCreatePage.jsx';

vi.mock('../../../data.js', async (original) => ({
  ...(await original()),
  useContent: () => ({ data: secondary, loading: false, error: null, reload: vi.fn() }),
}));

const props = () => ({
  login: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
  asset: (value) => value,
  user: { name: '本地测试' },
});

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/skill/create');
});

describe('Skill result type select', () => {
  it('opens with Enter, moves by arrows, selects with Enter and closes on Escape', () => {
    render(<SkillCreatePage {...props()} />);
    const trigger = screen.getByRole('button', { name: /图片/ });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('listbox', { name: '结果类型' })).toBeTruthy();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('button', { name: /视频/ }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(trigger.textContent).toContain('视频');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: '结果类型' })).toBeNull();
  });

  it('dismisses from an outside pointer and keeps the current selection', () => {
    render(<SkillCreatePage {...props()} />);
    const trigger = screen.getByRole('button', { name: /图片/ });
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox', { name: '结果类型' })).toBeNull();
    expect(trigger.textContent).toContain('图片');
  });
});
