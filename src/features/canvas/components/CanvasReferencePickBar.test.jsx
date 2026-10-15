import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CanvasReferencePickBar from './CanvasReferencePickBar.jsx';

describe('source reference pick bar', () => {
  it('renders the actual source title and return action, with an explicit close label', () => {
    const view = render(<CanvasReferencePickBar top={44} />);
    expect(screen.getByText('从画布或资产管理选择参考')).not.toBeNull();
    expect(screen.getByRole('button', { name: '返回节点' })).not.toBeNull();
    expect(screen.getByRole('button', { name: '退出参考选择' })).not.toBeNull();
    expect(view.container.firstElementChild.style.top).toBe('44px');
    expect(view.container.querySelectorAll('svg').item(0).getAttribute('width')).toBe('16');
    expect(view.container.querySelectorAll('svg').item(1).getAttribute('width')).toBe('12');
  });

  it('does not turn return into exit or implement a second Escape listener', () => {
    const onReturnToTarget = vi.fn(),
      onExit = vi.fn();
    render(<CanvasReferencePickBar onReturnToTarget={onReturnToTarget} onExit={onExit} />);
    fireEvent.click(screen.getByRole('button', { name: '返回节点' }));
    expect(onReturnToTarget).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '退出参考选择' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('keeps mouse and keyboard actions out of the board gesture handlers', async () => {
    const gesture = vi.fn(),
      onReturnToTarget = vi.fn(),
      onExit = vi.fn();
    render(
      <div onPointerDown={gesture} onClick={gesture} onDoubleClick={gesture} onKeyDown={gesture}>
        <CanvasReferencePickBar onReturnToTarget={onReturnToTarget} onExit={onExit} />
      </div>,
    );
    const button = screen.getByRole('button', { name: '返回节点' });
    fireEvent.pointerDown(button);
    fireEvent.doubleClick(button);
    button.focus();
    await userEvent.keyboard(' ');
    expect(onReturnToTarget).toHaveBeenCalledTimes(1);
    expect(gesture).not.toHaveBeenCalled();
    screen.getByRole('button', { name: '退出参考选择' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(gesture).not.toHaveBeenCalled();
  });

  it('blocks disabled actions and removes the entire bar after exit', () => {
    const action = vi.fn();
    const view = render(
      <CanvasReferencePickBar disabled onReturnToTarget={action} onExit={action} />,
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(action).not.toHaveBeenCalled();
    view.rerender(<CanvasReferencePickBar active={false} />);
    expect(view.container.children).toHaveLength(0);
  });

  it('uses source spacing and screen-space placement without a scroll lock or modal', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(
      'src/features/canvas/components/CanvasReferencePickBar.css',
      'utf8',
    );
    document.head.append(style);
    try {
      const view = render(<CanvasReferencePickBar />);
      const bar = getComputedStyle(view.container.firstElementChild);
      expect(bar.position).toBe('absolute');
      expect(bar.left).toBe('50%');
      expect(bar.top).toBe('12px');
      expect(bar.padding).toBe('12px');
      expect(bar.gap).toBe('16px');
      expect(bar.borderRadius).toBe('16px');
      expect(bar.backgroundColor).toBe('rgb(31, 109, 255)');
      const button = getComputedStyle(screen.getByRole('button', { name: '返回节点' }));
      expect(button.height).toBe('32px');
      expect(button.padding).toBe('0px 12px');
      expect(button.fontSize).toBe('13px');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.body.style.overflow).toBe('');
    } finally {
      style.remove();
    }
  });

  it('fades and disables edge hit testing only within active reference mode', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(
      'src/features/canvas/components/CanvasReferencePickBar.css',
      'utf8',
    );
    document.head.append(style);
    try {
      const view = render(
        <div>
          <svg className="cv-edges" aria-hidden="true" />
        </div>,
      );
      const edgeStyle = () => getComputedStyle(view.container.querySelector('.cv-edges'));
      expect(edgeStyle().opacity).not.toBe('0.15');
      view.rerender(
        <div className="cv-reference-pick-active">
          <svg className="cv-edges" aria-hidden="true" />
        </div>,
      );
      expect(edgeStyle().opacity).toBe('0.15');
      expect(edgeStyle().pointerEvents).toBe('none');
      view.rerender(
        <div>
          <svg className="cv-edges" aria-hidden="true" />
        </div>,
      );
      expect(edgeStyle().opacity).not.toBe('0.15');
    } finally {
      style.remove();
    }
  });
});
