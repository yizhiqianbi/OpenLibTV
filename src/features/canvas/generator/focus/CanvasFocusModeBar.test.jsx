import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CanvasFocusModeBar from './CanvasFocusModeBar.jsx';

const withStyles = (callback) => {
  const style = document.createElement('style');
  style.textContent = readFileSync('src/features/canvas/generator/focus/focus.css', 'utf8');
  document.head.append(style);
  try {
    callback(style);
  } finally {
    style.remove();
  }
};

describe('source focus mode hint', () => {
  it('shows exact title/subtitle and source return/exit actions', () => {
    const view = render(<CanvasFocusModeBar top={36} />);
    expect(screen.getByText('聚焦编辑模式')).not.toBeNull();
    expect(screen.getByText('请在图片上框选聚焦区域')).not.toBeNull();
    expect(screen.getByRole('button', { name: '返回节点' })).not.toBeNull();
    expect(screen.getByRole('button', { name: '退出聚焦模式' })).not.toBeNull();
    expect(view.container.firstElementChild.style.top).toBe('36px');
    expect(view.container.querySelectorAll('svg').item(0).getAttribute('width')).toBe('16');
    expect(view.container.querySelectorAll('svg').item(1).getAttribute('width')).toBe('12');
  });

  it('delegates return/exit independently without adding a second Escape listener', () => {
    const onReturnToTarget = vi.fn(),
      onExit = vi.fn();
    render(<CanvasFocusModeBar onReturnToTarget={onReturnToTarget} onExit={onExit} />);
    fireEvent.click(screen.getByRole('button', { name: '返回节点' }));
    expect(onReturnToTarget).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '退出聚焦模式' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('preserves native keyboard activation while excluding pan/drag/double-click handlers', async () => {
    const onExit = vi.fn(),
      board = vi.fn();
    render(
      <div onPointerDown={board} onClick={board} onDoubleClick={board} onKeyDown={board}>
        <CanvasFocusModeBar onExit={onExit} />
      </div>,
    );
    const button = screen.getByRole('button', { name: '退出聚焦模式' });
    fireEvent.pointerDown(button);
    fireEvent.doubleClick(button);
    button.focus();
    await userEvent.keyboard(' ');
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(board).not.toHaveBeenCalled();
  });

  it('blocks disabled actions and disappears after mode exit', () => {
    const action = vi.fn();
    const view = render(<CanvasFocusModeBar disabled onReturnToTarget={action} onExit={action} />);
    for (const button of screen.getAllByRole('button')) fireEvent.click(button);
    expect(action).not.toHaveBeenCalled();
    view.rerender(<CanvasFocusModeBar active={false} />);
    expect(view.container.children).toHaveLength(0);
  });

  it('retains the source desktop anchor, dimensions, copy and action layout', () => {
    withStyles((style) => {
      const view = render(<CanvasFocusModeBar />);
      const bar = screen.getByRole('region', { name: '聚焦编辑模式' });
      const chrome = getComputedStyle(bar);
      expect(chrome.position).toBe('absolute');
      expect(chrome.left).toBe('50%');
      expect(chrome.transform).toBe('translateX(-50%)');
      expect(chrome.gap).toBe('16px');
      expect(chrome.padding).toBe('12px');
      expect(chrome.borderRadius).toBe('16px');
      const base = [...style.sheet.cssRules].find(
        (rule) => rule.selectorText === '.cv-focus-mode-bar',
      );
      expect(base.style.width).toBe('');
      expect(base.style.maxWidth).toBe('');
      const heading = bar.querySelector('.cv-focus-mode-heading');
      const copy = heading.querySelector('.cv-focus-mode-copy');
      const actions = bar.querySelector('.cv-focus-mode-actions');
      expect(copy.contains(screen.getByText('聚焦编辑模式'))).toBe(true);
      expect(copy.contains(screen.getByText('请在图片上框选聚焦区域'))).toBe(true);
      expect(getComputedStyle(heading.querySelector('.cv-focus-mode-icon')).width).toBe('32px');
      expect(getComputedStyle(screen.getByText('聚焦编辑模式')).whiteSpace).toBe('nowrap');
      expect(getComputedStyle(screen.getByText('请在图片上框选聚焦区域')).whiteSpace).toBe(
        'nowrap',
      );
      for (const button of view.container.querySelectorAll('button')) {
        expect(actions.contains(button)).toBe(true);
        expect(getComputedStyle(button).height).toBe('32px');
        expect(getComputedStyle(button).flexShrink).toBe('0');
      }
    });
  });

  it.each([390, 320])(
    'keeps the %dpx mode hint intrinsic width with flexible copy and reserved actions',
    (width) => {
      withStyles((style) => {
        const mobile = [...style.sheet.cssRules].find(
          (rule) => rule.media?.mediaText === '(max-width: 600px)',
        );
        // jsdom cannot lay out media queries. Apply their exact declarations to
        // the actual view structure; native browser QA verifies resulting bounds.
        const mobileStyle = document.createElement('style');
        mobileStyle.textContent = [...mobile.cssRules].map((rule) => rule.cssText).join('\n');
        document.head.append(mobileStyle);
        try {
          const view = render(
            <div style={{ position: 'relative', width }}>
              <CanvasFocusModeBar />
            </div>,
          );
          const bar = screen.getByRole('region', { name: '聚焦编辑模式' });
          const chrome = getComputedStyle(bar);
          expect(chrome.width).toBe('max-content');
          expect(chrome.maxWidth).toBe('calc(100% - 24px)');
          expect(chrome.left).toBe('50%');
          expect(chrome.gap).toBe('8px');
          const heading = getComputedStyle(bar.querySelector('.cv-focus-mode-heading'));
          expect(heading.minWidth).toBe('0px');
          expect(heading.flexGrow).toBe('1');
          expect(heading.flexShrink).toBe('1');
          expect(getComputedStyle(bar.querySelector('.cv-focus-mode-copy')).minWidth).toBe('0px');
          const actions = bar.querySelector('.cv-focus-mode-actions');
          expect(getComputedStyle(actions).flexShrink).toBe('0');
          for (const button of view.container.querySelectorAll('button'))
            expect(actions.contains(button)).toBe(true);
          expect(getComputedStyle(screen.getByText('聚焦编辑模式')).whiteSpace).toBe('nowrap');
          const subtitle = getComputedStyle(screen.getByText('请在图片上框选聚焦区域'));
          expect(subtitle.whiteSpace).toBe('normal');
          expect(subtitle.lineHeight).toBe('18px');
        } finally {
          mobileStyle.remove();
        }
      });
    },
  );
});
