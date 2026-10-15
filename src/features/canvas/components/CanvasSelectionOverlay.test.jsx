import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CanvasSelectionOverlay, { CanvasSelectionAddIndicator } from './CanvasSelectionOverlay.jsx';

const bounds = { x: 100, y: 200, width: 600, height: 300 };
const props = { bounds, view: { x: 10, y: 20, z: 0.25 }, sourceNodes: [{ id: 'a' }, { id: 'b' }] };
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('source multi-selection visual surface', () => {
  it('paints a fixed screen-space frame without adding fake graph nodes or editable content', () => {
    const before = structuredClone(props);
    const view = render(<CanvasSelectionOverlay {...props} />);
    const frame = view.container.querySelector('[data-canvas-selection-overlay]');
    expect(frame.style.left).toBe('30px');
    expect(frame.style.top).toBe('65px');
    expect(frame.style.width).toBe('160px');
    expect(frame.style.height).toBe('85px');
    expect(frame.querySelector('.cv-selection-overlay-fill').style.borderWidth).toBe('0.75px');
    expect(frame.querySelectorAll('.cv-selection-overlay-hit')).toHaveLength(5);
    expect(
      view.container.querySelector('[data-node-id],input,textarea,[contenteditable]'),
    ).toBeNull();
    expect(props).toEqual(before);
  });

  it('delegates each selection and add action to its own caller without owning pointer capture', () => {
    const onPointerDown = vi.fn(),
      onClick = vi.fn(),
      onAddPointerDown = vi.fn(),
      onAddClick = vi.fn();
    const view = render(
      <CanvasSelectionOverlay
        {...props}
        {...{ onPointerDown, onClick, onAddPointerDown, onAddClick }}
      />,
    );
    const fill = view.container.querySelector('.cv-selection-overlay-fill');
    fireEvent.pointerDown(fill, { pointerId: 7, clientX: 50, clientY: 80 });
    fireEvent.click(fill);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
    const add = screen.getByRole('button', { name: '拖拽连线或点击选择节点类型' });
    fireEvent.pointerDown(add, { pointerId: 8 });
    fireEvent.click(add);
    expect(onAddPointerDown).toHaveBeenCalledTimes(1);
    expect(onAddClick).toHaveBeenCalledTimes(1);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  it('renders the same add button across viewport changes so the caller can keep gesture identity', () => {
    const view = render(<CanvasSelectionOverlay {...props} />);
    const button = screen.getByRole('button');
    expect(button.style.left).toBe('185px');
    expect(button.style.top).toBe('107.5px');
    view.rerender(
      <CanvasSelectionOverlay {...props} view={{ x: -100, y: 50, z: 2 }} dragging addDragging />,
    );
    expect(screen.getByRole('button')).toBe(button);
    expect(button.style.left).toBe('1300px');
    expect(button.style.top).toBe('750px');
    expect(button.style.cursor).toBe('grabbing');
    expect(view.container.querySelector('.cv-selection-overlay-fill').style.cursor).toBe(
      'grabbing',
    );
    expect(view.container.querySelector('.cv-selection-overlay').style.willChange).toBe(
      'transform',
    );
    view.rerender(<CanvasSelectionOverlay {...props} altCopy />);
    expect(view.container.querySelector('.cv-selection-overlay-fill').style.cursor).toBe('copy');
  });

  it.each([{ ready: false }, { readonly: true }, { bounds: null }])(
    'removes the entire interactive surface for disabled owner %j',
    (patch) => {
      const view = render(<CanvasSelectionOverlay {...props} {...patch} />);
      expect(view.container.children).toHaveLength(0);
    },
  );

  it('keeps an existing frame when source eligibility hides the independent add entry', () => {
    const view = render(<CanvasSelectionOverlay {...props} sourceNodes={[]} />);
    expect(view.container.querySelector('.cv-selection-overlay')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    view.rerender(<CanvasSelectionOverlay {...props} addVisible={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    view.rerender(<CanvasSelectionOverlay {...props} addInteractive={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(
      view.container.querySelector('.cv-selection-add-static').getAttribute('aria-hidden'),
    ).toBe('true');
  });
});

describe('screen magnetic add indicator lifecycle', () => {
  it('moves within ±28 with source timing and restores the initial outward position on leave', () => {
    vi.useFakeTimers();
    render(<CanvasSelectionAddIndicator point={{ x: 100, y: 200 }} />);
    const button = screen.getByRole('button');
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 200,
      width: 80,
      height: 80,
    });
    const glyph = button.querySelector('span');
    expect(glyph.style.transform).toBe('translate(-23px, 0px) scale(1)');
    fireEvent.mouseMove(button, { clientX: 160, clientY: 240 });
    expect(glyph.style.transform).toBe('translate(20px, 0px) scale(1.1)');
    expect(glyph.style.transition).toBe('transform 80ms ease-out');
    fireEvent.mouseMove(button, { clientX: 800, clientY: -100 });
    expect(glyph.style.transform).toBe('translate(28px, -28px) scale(1.1)');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(80);
    expect(glyph.style.transition).toBe('');
    fireEvent.mouseLeave(button);
    expect(glyph.style.transition).toBe('transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)');
    expect(glyph.style.transform).toBe('translate(-23px, 0px) scale(1)');
    vi.advanceTimersByTime(400);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans hover-only transitions when hidden or unmounted without emitting graph actions', () => {
    vi.useFakeTimers();
    const onPointerDown = vi.fn(),
      onClick = vi.fn();
    const view = render(
      <CanvasSelectionAddIndicator point={{ x: 100, y: 200 }} {...{ onPointerDown, onClick }} />,
    );
    fireEvent.mouseMove(screen.getByRole('button'), { clientX: 1, clientY: 2 });
    expect(vi.getTimerCount()).toBe(1);
    view.rerender(<CanvasSelectionAddIndicator point={{ x: 100, y: 200 }} visible={false} />);
    expect(vi.getTimerCount()).toBe(0);
    view.rerender(<CanvasSelectionAddIndicator point={{ x: 100, y: 200 }} />);
    fireEvent.mouseLeave(screen.getByRole('button'));
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps a passive add glyph nonfocusable and removes the interactive hover transform', () => {
    const view = render(
      <CanvasSelectionAddIndicator point={{ x: 100, y: 200 }} interactive={false} />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    const root = view.container.firstElementChild;
    expect(root.className).toBe('cv-selection-add-static');
    expect(root.querySelector('span').style.transform).toBe('');
    expect(root.hasAttribute('tabindex')).toBe(false);
  });

  it('leaves lost capture cancellation to the gesture owner', () => {
    const cancel = vi.fn();
    render(<CanvasSelectionAddIndicator point={{ x: 0, y: 0 }} onLostPointerCapture={cancel} />);
    fireEvent.lostPointerCapture(screen.getByRole('button'), { pointerId: 7 });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('selection CSS source geometry', () => {
  it('preserves screen 80px hit, 24px glyph, 12px drag strips and independent right-center opening', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(
      'src/features/canvas/components/canvas-selection-overlay.css',
      'utf8',
    );
    document.head.append(style);
    const view = render(<CanvasSelectionOverlay {...props} />);
    expect(getComputedStyle(screen.getByRole('button')).width).toBe('80px');
    expect(getComputedStyle(screen.getByRole('button')).height).toBe('80px');
    expect(
      getComputedStyle(view.container.querySelector('.cv-selection-add-indicator')).width,
    ).toBe('24px');
    expect(
      getComputedStyle(view.container.querySelector('.cv-selection-overlay-hit.is-top')).height,
    ).toBe('12px');
    expect(
      getComputedStyle(view.container.querySelector('.cv-selection-overlay-hit.is-right-top'))
        .height,
    ).toBe('calc(50% - 32px)');
    expect(
      getComputedStyle(view.container.querySelector('.cv-selection-overlay-fill')).borderStyle,
    ).toBe('dashed');
    expect(
      getComputedStyle(view.container.querySelector('.cv-selection-overlay')).pointerEvents,
    ).toBe('none');
    expect(style.textContent).toContain('(prefers-reduced-motion: reduce)');
    style.remove();
  });
});
