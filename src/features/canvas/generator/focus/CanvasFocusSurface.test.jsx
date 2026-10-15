import { createRef } from 'react';
import { readFileSync } from 'node:fs';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CanvasFocusSurface, { FocusModePlaceholder } from './CanvasFocusSurface.jsx';

const region = { relX: 0.1, relY: 0.2, width: 0.3, height: 0.4 };

describe('controlled source focus surface', () => {
  it('exposes the actual content overlay for client geometry without changing its controlled rectangle', () => {
    const ref = createRef();
    const view = render(<CanvasFocusSurface ref={ref} region={region} zoom={0.5} />);
    expect(ref.current).toBe(view.container.firstElementChild);
    const frame = view.container.querySelector('[data-focus-region]');
    expect(frame.style.left).toBe('10%');
    expect(frame.style.top).toBe('20%');
    expect(frame.style.width).toBe('30%');
    expect(frame.style.height).toBe('40%');
    expect(view.container.querySelector('.cv-focus-reticle').style.transform).toBe('scale(2)');
    expect(view.container.querySelectorAll('[data-focus-handle]')).toHaveLength(8);
    expect(region).toEqual({ relX: 0.1, relY: 0.2, width: 0.3, height: 0.4 });
  });

  it('delegates start exactly once, prevents native drag and isolates the board gesture', () => {
    const onStart = vi.fn(),
      board = vi.fn();
    const view = render(
      <div onPointerDown={board}>
        <CanvasFocusSurface region={region} onStart={onStart} />
      </div>,
    );
    const surface = view.container.querySelector('[data-focus-surface]');
    const event = createEvent.pointerDown(surface, { cancelable: true });
    fireEvent(surface, event);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart.mock.calls[0][0].target).toBe(surface);
    expect(event.defaultPrevented).toBe(true);
    expect(board).not.toHaveBeenCalled();
    fireEvent.pointerMove(window);
    fireEvent.pointerUp(window);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('delegates each resize handle separately without starting a new draw', () => {
    const onStart = vi.fn(),
      onResize = vi.fn(),
      board = vi.fn();
    const view = render(
      <div onPointerDown={board}>
        <CanvasFocusSurface region={region} onStart={onStart} onResize={onResize} />
      </div>,
    );
    for (const handle of view.container.querySelectorAll('[data-focus-handle]')) {
      const event = createEvent.pointerDown(handle, { cancelable: true });
      fireEvent(handle, event);
      expect(onResize).toHaveBeenLastCalledWith(
        handle.getAttribute('data-focus-handle'),
        expect.anything(),
      );
      expect(event.defaultPrevented).toBe(true);
    }
    expect(onResize).toHaveBeenCalledTimes(8);
    expect(onStart).not.toHaveBeenCalled();
    expect(board).not.toHaveBeenCalled();
  });

  it('keeps a live draw as a dashed rectangle without handles, then follows updated controlled state', () => {
    const view = render(<CanvasFocusSurface region={region} drawing />);
    expect(view.container.firstElementChild.classList.contains('is-drawing')).toBe(true);
    expect(view.container.querySelectorAll('[data-focus-handle]')).toHaveLength(0);
    const updated = { ...region, relX: 0.25 };
    view.rerender(<CanvasFocusSurface region={updated} interacting resizeHandle="e" />);
    expect(view.container.querySelector('[data-focus-region]').style.left).toBe('25%');
    expect(view.container.querySelectorAll('[data-focus-handle]')).toHaveLength(8);
    expect(view.container.firstElementChild.classList.contains('is-interacting')).toBe(true);
    expect(view.container.firstElementChild.style.cursor).toBe('e-resize');
  });

  it('does not start edits after disabling or deactivating the surface and leaves saved geometry read-only', () => {
    const onStart = vi.fn(),
      onResize = vi.fn();
    const view = render(
      <CanvasFocusSurface region={region} disabled onStart={onStart} onResize={onResize} />,
    );
    fireEvent.pointerDown(view.container.firstElementChild);
    expect(onStart).not.toHaveBeenCalled();
    expect(view.container.firstElementChild.style.pointerEvents).toBe('none');
    expect(view.container.querySelectorAll('[data-focus-handle]')).toHaveLength(0);
    view.rerender(
      <CanvasFocusSurface region={region} active={false} onStart={onStart} onResize={onResize} />,
    );
    fireEvent.pointerDown(view.container.firstElementChild);
    expect(onStart).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-focus-region]').style.boxShadow).toBe('none');
    expect(view.container.querySelector('.cv-focus-reticle')).toBeNull();
    expect(onResize).not.toHaveBeenCalled();
  });

  it('does not draw unknown or degenerate rectangles and uses stable inverse zoom fallbacks', () => {
    const view = render(<CanvasFocusSurface region={{ ...region, width: 0 }} />);
    expect(view.container.querySelector('[data-focus-region]')).toBeNull();
    view.rerender(<CanvasFocusSurface region={{ ...region, relX: NaN }} />);
    expect(view.container.querySelector('[data-focus-region]')).toBeNull();
    for (const zoom of [0, -1, NaN, Infinity]) {
      view.rerender(<CanvasFocusSurface region={region} zoom={zoom} />);
      expect(view.container.querySelector('.cv-focus-reticle').style.transform).toBe('scale(1)');
    }
  });

  it('shows the three exact source placeholder lines without a clickable fake task', () => {
    render(<FocusModePlaceholder />);
    expect(screen.getByText('聚焦模式')).not.toBeNull();
    expect(screen.getByText('请选择一张图像进行「局部框选」操作')).not.toBeNull();
    expect(screen.getByText('按ESC键可退出当前模式')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps source white frame/black outside shade, eight handles and screen-size glyph styling', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/features/canvas/generator/focus/focus.css', 'utf8');
    document.head.append(style);
    try {
      const view = render(<CanvasFocusSurface region={region} zoom={0.5} />);
      const surface = getComputedStyle(view.container.firstElementChild);
      const frame = getComputedStyle(view.container.querySelector('[data-focus-region]'));
      expect(surface.zIndex).toBe('55');
      expect(surface.cursor).toBe('crosshair');
      expect(surface.overflow).toBe('hidden');
      expect(frame.borderWidth).toBe('1px');
      expect(frame.borderRadius).toBe('4px');
      expect(frame.boxShadow).toContain('9999px');
      expect(frame.boxShadow).toContain('0.5');
      const handle = getComputedStyle(view.container.querySelector('[data-focus-handle="nw"]'));
      expect(handle.width).toBe('8px');
      expect(handle.borderWidth).toBe('1.5px');
      expect(handle.top).toBe('-5px');
      expect(handle.cursor).toBe('nw-resize');
      view.rerender(<CanvasFocusSurface region={region} drawing />);
      expect(
        getComputedStyle(view.container.querySelector('[data-focus-region]')).borderStyle,
      ).toBe('dashed');
    } finally {
      style.remove();
    }
  });
});
