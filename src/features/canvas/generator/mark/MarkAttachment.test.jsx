import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MarkAttachment from './MarkAttachment.jsx';

describe('controlled image/video mark attachment', () => {
  it('exposes only caller-authorized capabilities and reads active state without changing it', () => {
    const onToggle = vi.fn();
    const view = render(<MarkAttachment onToggle={onToggle} />);
    expect(screen.queryByRole('button', { name: '标记' })).toBeNull();
    view.rerender(<MarkAttachment available active onToggle={onToggle} />);
    const button = screen.getByRole('button', { name: '标记' });
    expect(button.classList.contains('mark-mode-toggle')).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledExactlyOnceWith(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    view.rerender(<MarkAttachment available onToggle={onToggle} />);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    view.rerender(<MarkAttachment active onToggle={onToggle} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps native Space activation independent from drag/pan and does not collapse any generator', async () => {
    const onToggle = vi.fn(),
      board = vi.fn();
    render(
      <div onClick={board} onPointerDown={board} onDoubleClick={board} onKeyDown={board}>
        <MarkAttachment available onToggle={onToggle} />
      </div>,
    );
    const button = screen.getByRole('button', { name: '标记' });
    fireEvent.pointerDown(button);
    fireEvent.doubleClick(button);
    button.focus();
    await userEvent.keyboard(' ');
    expect(onToggle).toHaveBeenCalledExactlyOnceWith(button);
    expect(board).not.toHaveBeenCalled();
  });

  it('blocks disabled or missing controllers rather than presenting a fake action', () => {
    const onToggle = vi.fn();
    const view = render(<MarkAttachment available disabled onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: '标记' }));
    expect(onToggle).not.toHaveBeenCalled();
    view.rerender(<MarkAttachment available />);
    expect(screen.getByRole('button', { name: '标记' }).disabled).toBe(true);
  });

  it('uses the archived mark glyph, source chip dimensions and scoped video-owner toggle exception', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/features/canvas/generator/mark/mark.css', 'utf8');
    document.head.append(style);
    try {
      const view = render(
        <div className="cv-mark-mode-active">
          <article className="cv-node cv-node-video">
            <MarkAttachment available onToggle={() => {}} />
          </article>
        </div>,
      );
      const button = getComputedStyle(screen.getByRole('button', { name: '标记' }));
      expect(button.padding).toBe('4px 8px');
      expect(button.fontSize).toBe('12px');
      expect(button.gap).toBe('2px');
      expect(button.position).toBe('relative');
      expect(button.zIndex).toBe('51');
      expect(button.pointerEvents).toBe('auto');
      const icon = getComputedStyle(view.container.querySelector('.cv-mark-attachment-icon'));
      expect(icon.width).toBe('12px');
      expect(icon.mask).toContain('/assets/icons/mark.svg');
    } finally {
      style.remove();
    }
  });

  it('uses source neutral-700 and black-alpha-5 for an inactive light-canvas chip', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/features/canvas/generator/mark/mark.css', 'utf8');
    document.head.append(style);
    try {
      render(
        <div className="canvas-light">
          <MarkAttachment available onToggle={() => {}} />
        </div>,
      );
      const button = getComputedStyle(screen.getByRole('button', { name: '标记' }));
      expect(button.color).toBe('rgb(64, 64, 64)');
      expect(button.backgroundColor).toBe('rgba(0, 0, 0, 0.05)');
    } finally {
      style.remove();
    }
  });
});
