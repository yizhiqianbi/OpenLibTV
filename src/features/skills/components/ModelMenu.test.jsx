import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ModelMenu from './ModelMenu.jsx';
import { groupChatModels, resolveModelDisable } from '../domain/model-picker.js';

describe('source-compatible model picker', () => {
  it('renders both model sections and hands off stable IDs rather than a display name', () => {
    const onPick = vi.fn();
    render(<ModelMenu onPick={onPick} />);
    expect(screen.getByRole('button', { name: '添加 Lib Image 2.5 Pro' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '添加 Seedance 2.5' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '添加 Vidu Q4 Preview' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '添加 Seedance 2.5' }));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({
        modelKey: 'star-video2.5',
        label: 'Seedance 2.5',
        modality: 'video',
      }),
    );
  });
  it('preserves allowlist order, removes duplicates, and refuses disabled models with the localized reason', () => {
    const support = {
      image: [
        {
          modelKey: 'disabled',
          modelName: '维护中',
          disable: { zh: '升级维护', en: 'Maintenance' },
        },
        { modelKey: 'hidden', modelName: '隐藏' },
        { modelKey: 'disabled', modelName: '重复' },
      ],
      video: [],
    };
    const onPick = vi.fn();
    render(<ModelMenu onPick={onPick} support={support} allowlist={['disabled']} />);
    const button = screen.getByRole('button', { name: '添加 维护中' });
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('升级维护');
    fireEvent.click(button);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByText('隐藏')).toBeNull();
    expect(groupChatModels(support, ['disabled']).image).toHaveLength(1);
    expect(resolveModelDisable({ en: 'Maintenance' }, 'zh')).toEqual({
      disabled: true,
      reason: 'Maintenance',
    });
    expect(resolveModelDisable({})).toEqual({ disabled: false, reason: '' });
  });
});
