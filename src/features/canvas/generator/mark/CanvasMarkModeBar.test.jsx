import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CanvasMarkModeBar from './CanvasMarkModeBar.jsx';

describe('source element selection hint', () => {
  it('shows exact source copy, icon sizes and independently controlled return/exit', () => {
    const onReturnToTarget = vi.fn(),
      onExit = vi.fn();
    const view = render(
      <CanvasMarkModeBar top={42} onReturnToTarget={onReturnToTarget} onExit={onExit} />,
    );
    expect(screen.getByRole('region', { name: '元素选择模式' }).style.top).toBe('42px');
    expect(screen.getByText('点击图片选择局部元素')).not.toBeNull();
    expect(view.container.querySelectorAll('svg')[0].getAttribute('width')).toBe('16');
    expect(view.container.querySelectorAll('svg')[1].getAttribute('width')).toBe('12');
    fireEvent.click(screen.getByRole('button', { name: '返回节点' }));
    expect(onReturnToTarget).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '退出元素选择模式' }));
    expect(onExit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('preserves native keyboard activation without starting board gestures or installing another Escape owner', async () => {
    const board = vi.fn(),
      onExit = vi.fn();
    render(
      <div onPointerDown={board} onClick={board} onDoubleClick={board} onKeyDown={board}>
        <CanvasMarkModeBar onExit={onExit} />
      </div>,
    );
    const button = screen.getByRole('button', { name: '退出元素选择模式' });
    fireEvent.pointerDown(button);
    fireEvent.doubleClick(button);
    button.focus();
    await userEvent.keyboard(' ');
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(board).not.toHaveBeenCalled();
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(board).toHaveBeenCalledTimes(1);
  });

  it('leaves disabled actions inert and removes the view on exit', () => {
    const action = vi.fn();
    const view = render(<CanvasMarkModeBar disabled onReturnToTarget={action} onExit={action} />);
    for (const button of screen.getAllByRole('button')) fireEvent.click(button);
    expect(action).not.toHaveBeenCalled();
    view.rerender(<CanvasMarkModeBar active={false} />);
    expect(view.container.children).toHaveLength(0);
  });

  it('preserves source desktop dimensions and scopes readable narrow-screen flex rules to mark only', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/features/canvas/generator/mark/mark.css', 'utf8');
    document.head.append(style);
    try {
      const view = render(<CanvasMarkModeBar />);
      const bar = getComputedStyle(screen.getByRole('region', { name: '元素选择模式' }));
      expect(bar.position).toBe('absolute');
      expect(bar.left).toBe('50%');
      expect(bar.gap).toBe('16px');
      expect(bar.padding).toBe('12px');
      expect(bar.borderRadius).toBe('16px');
      expect(bar.backgroundColor).toBe('rgb(31, 109, 255)');
      expect(getComputedStyle(view.container.querySelector('.cv-mark-mode-title')).whiteSpace).toBe(
        'nowrap',
      );
      const mobile = [...style.sheet.cssRules].find(
        (rule) => rule.media?.mediaText === '(max-width: 600px)',
      );
      const rule = (selector) =>
        [...mobile.cssRules].find((item) => item.selectorText === selector).style;
      expect(rule('.cv-mark-mode-bar').width).toBe('max-content');
      expect(rule('.cv-mark-mode-bar').maxWidth).toBe('calc(100% - 24px)');
      expect(rule('.cv-mark-mode-actions').flexShrink).toBe('0');
      expect(rule('.cv-mark-mode-copy').minWidth).toBe('0px');
      expect(rule('.cv-mark-mode-subtitle').whiteSpace).toBe('normal');
    } finally {
      style.remove();
    }
  });
});
