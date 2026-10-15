import { createRef, StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Modal from '../../../../components/Modal.jsx';
import CanvasMarkSurface from './CanvasMarkSurface.jsx';

// Synthetic responses exercise controlled presentation, not a recognition service.
const suggestions = [
  { label: '人物', bbox: { x: 0.1, y: 0.2, width: 0.4, height: 0.5 } },
  { label: '外套', bbox: { x: 0.2, y: 0.3, width: 0.2, height: 0.3 } },
];
const point = (extra = {}) => ({
  nodeId: 'image',
  index: 1,
  apiResponseId: 'api_1',
  relX: 0.5,
  relY: 0.4,
  suggestions,
  selectedSuggestionIndex: 0,
  ...extra,
});
const props = (extra = {}) => ({ points: [point()], ownerKey: 'mode', ...extra });
let observers, frames, nextFrame, size, labelSize, menuBounds;
const flushFrames = () =>
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback();
  });
beforeEach(() => {
  observers = [];
  frames = new Map();
  nextFrame = 0;
  size = { width: 200, height: 100 };
  labelSize = { width: 80, height: 24 };
  menuBounds = { left: -40, right: 160, top: 200, bottom: 300, width: 200, height: 100 };
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id) => frames.delete(id)),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        observers.push(this);
      }
    },
  );
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function () {
    return this.matches('.cv-mark-surface') ? size.width : 0;
  });
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function () {
    return this.matches('.cv-mark-surface') ? size.height : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () {
    return this.matches('.cv-mark-label') ? labelSize.width : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
    return this.matches('.cv-mark-label') ? labelSize.height : 0;
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return this.matches('.cv-mark-suggestions')
      ? menuBounds
      : { left: 20, right: 120, top: 180, bottom: 210, width: 100, height: 30 };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('controlled source mark surface', () => {
  it('forwards the actual content overlay and delegates only writable, idle surface clicks', () => {
    const ref = createRef(),
      received = vi.fn(),
      board = vi.fn();
    const onPoint = (event) =>
      received({ target: event.currentTarget, x: event.clientX, y: event.clientY });
    const view = render(
      <div onClick={board} onPointerDown={board}>
        <CanvasMarkSurface ref={ref} {...props({ points: [], onPoint })} />
      </div>,
    );
    expect(ref.current).toBe(view.container.querySelector('[data-mark-surface]'));
    fireEvent.pointerDown(ref.current);
    fireEvent.click(ref.current, { clientX: 110, clientY: 200 });
    expect(received).toHaveBeenCalledExactlyOnceWith({ target: ref.current, x: 110, y: 200 });
    expect(board).not.toHaveBeenCalled();
    expect(screen.queryByText('人物')).toBeNull();
    view.rerender(
      <CanvasMarkSurface ref={ref} {...props({ points: [], loading: true, onPoint })} />,
    );
    expect(ref.current.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(ref.current);
    view.rerender(
      <CanvasMarkSurface ref={ref} {...props({ points: [], disabled: true, onPoint })} />,
    );
    fireEvent.click(ref.current);
    expect(received).toHaveBeenCalledTimes(1);
    view.rerender(<CanvasMarkSurface ref={ref} {...props({ active: false })} />);
    expect(ref.current).toBeNull();
  });

  it('shows only the source pending analysis status with centered clamp and inverse zoom', () => {
    const view = render(
      <CanvasMarkSurface
        {...props({
          points: [
            point({ apiResponseId: undefined, suggestions: undefined, relX: 0.1, relY: 0.2 }),
          ],
          loading: true,
          zoom: 0.5,
        })}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('分析中...');
    expect(screen.queryByRole('button')).toBeNull();
    expect(view.container.querySelector('[data-mark-bbox]')).toBeNull();
    expect(view.container.querySelector('.cv-mark-label').style.transform).toBe(
      'translate(-20px, -12px)',
    );
    expect(view.container.querySelector('.cv-mark-label-chrome').style.transform).toBe('scale(2)');
  });

  it('renders the response box and selected label without guessing or mutating the selected index', () => {
    const onSelect = vi.fn(),
      onDelete = vi.fn(),
      onPoint = vi.fn();
    const value = point({ selectedSuggestionIndex: 1 });
    const view = render(
      <CanvasMarkSurface {...props({ points: [value], onSelect, onDelete, onPoint })} />,
    );
    const box = view.container.querySelector('[data-mark-bbox]');
    expect([box.style.left, box.style.top, box.style.width, box.style.height]).toEqual([
      '20%',
      '30%',
      '20%',
      '30%',
    ]);
    fireEvent.click(screen.getByRole('button', { name: '外套', exact: true }));
    const menu = screen.getByRole('menu', { name: '标记候选' });
    expect(
      within(menu).getByRole('menuitemradio', { name: '外套' }).getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: '人物' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('api_1', 0);
    expect(screen.getByRole('button', { name: '外套', exact: true })).not.toBeNull();
    expect(value.selectedSuggestionIndex).toBe(1);
    expect(onPoint).not.toHaveBeenCalled();
    view.rerender(
      <CanvasMarkSurface {...props({ points: [point()], onSelect, onDelete, onPoint })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '删除标记：人物' }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith('api_1');
    expect(onPoint).not.toHaveBeenCalled();
  });

  it('keeps response index fallback, one-suggestion labels and invalid geometry free of invented controls', () => {
    const view = render(
      <CanvasMarkSurface
        {...props({
          points: [point({ suggestions: [suggestions[0]], selectedSuggestionIndex: 99 })],
        })}
      />,
    );
    const label = screen.getByRole('button', { name: '人物', exact: true });
    expect(label.hasAttribute('aria-haspopup')).toBe(false);
    fireEvent.click(label);
    expect(screen.queryByRole('menu')).toBeNull();
    view.rerender(
      <CanvasMarkSurface
        {...props({ points: [point({ suggestions: [] }), point({ index: 2, relX: NaN })] })}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(view.container.querySelector('[data-mark-bbox]')).toBeNull();
    view.rerender(
      <CanvasMarkSurface
        {...props({
          points: [
            point({
              suggestions: [{ label: '服务原文', bbox: { x: NaN, y: 0, width: 1, height: 1 } }],
            }),
          ],
        })}
      />,
    );
    expect(screen.getByRole('button', { name: '服务原文' })).not.toBeNull();
    expect(view.container.querySelector('[data-mark-bbox]')).toBeNull();
  });

  it('places the menu above only when relY is strictly greater than .6', () => {
    const view = render(<CanvasMarkSurface {...props({ points: [point({ relY: 0.6 })] })} />);
    fireEvent.click(screen.getByRole('button', { name: '人物', exact: true }));
    expect(screen.getByRole('menu').classList.contains('is-below')).toBe(true);
    view.rerender(<CanvasMarkSurface {...props({ points: [point({ relY: 0.6001 })] })} />);
    expect(screen.getByRole('menu').classList.contains('is-above')).toBe(true);
  });

  it('clamps labels at content boundaries after observed resize and rejects stale owner/frame callbacks', () => {
    const view = render(
      <CanvasMarkSurface
        {...props({ points: [point({ relX: 0.95, relY: 0.95 })], ownerKey: {} })}
      />,
    );
    const label = view.container.querySelector('.cv-mark-label');
    expect(label.style.transform).toBe('translate(-70px, -32px)');
    const oldObserver = observers[0];
    size = { width: 100, height: 50 };
    act(() => oldObserver.callback());
    flushFrames();
    expect(label.style.transform).toBe('translate(-75px, -32px)');
    oldObserver.callback();
    const staleFrame = [...frames.values()][0];
    view.rerender(
      <CanvasMarkSurface {...props({ points: [point({ relX: 0.5, relY: 0.4 })], ownerKey: {} })} />,
    );
    const current = label.style.transform;
    size = { width: 500, height: 500 };
    act(() => {
      oldObserver.callback();
      staleFrame();
    });
    expect(label.style.transform).toBe(current);
    expect(frames.size).toBe(0);
    expect(oldObserver.disconnect).toHaveBeenCalledTimes(1);
  });

  it('uses the shared dialog child for first Escape, preserving the parent lock and returning to the label', () => {
    const onClose = vi.fn();
    const view = render(
      <Modal title="实际父弹窗" onClose={onClose}>
        <CanvasMarkSurface {...props()} />
      </Modal>,
    );
    const trigger = screen.getByRole('button', { name: '人物', exact: true });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps a standalone menu non-modal, navigates its real options and preserves outside focus', async () => {
    const onSelect = vi.fn(),
      ownerEscape = vi.fn();
    render(
      <div onKeyDown={ownerEscape}>
        <CanvasMarkSurface {...props({ onSelect })} />
        <button>外部控件</button>
      </div>,
    );
    const trigger = screen.getByRole('button', { name: '人物', exact: true });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: '人物' }));
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: '外套' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(ownerEscape).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    const outside = screen.getByRole('button', { name: '外部控件' });
    fireEvent.pointerDown(outside);
    outside.focus();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(outside);
    expect(document.body.style.overflow).toBe('');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it.each([390, 320])(
    'keeps the %dpx menu reachable without replacing the source above/below direction',
    (width) => {
      vi.stubGlobal('innerWidth', width);
      vi.stubGlobal('innerHeight', 700);
      render(<CanvasMarkSurface {...props()} />);
      fireEvent.click(screen.getByRole('button', { name: '人物', exact: true }));
      const menu = screen.getByRole('menu');
      expect(menu.style.marginLeft).toBe('48px');
      expect(menu.classList.contains('is-below')).toBe(true);
      expect(menu.style.maxHeight).toBe('482px');
      menuBounds = { ...menuBounds, left: width - 40, right: width + 160 };
      fireEvent.resize(window);
      flushFrames();
      expect(menu.style.marginLeft).toBe('-168px');
    },
  );

  it('cleans menus, observers, pending frames and StrictMode replay without late ownership writes', () => {
    const view = render(
      <StrictMode>
        <CanvasMarkSurface {...props()} />
      </StrictMode>,
    );
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '人物', exact: true }));
    const menuObserver = observers.at(-1);
    menuObserver.callback();
    const stale = [...frames.values()][0];
    const label = view.container.querySelector('.cv-mark-label');
    const oldTransform = label.style.transform;
    view.unmount();
    expect(menuObserver.disconnect).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    act(() => {
      menuObserver.callback();
      stale();
    });
    expect(frames.size).toBe(0);
    expect(label.style.transform).toBe(oldTransform);
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps existing suggestions actionable during analysis but blocks disabled selection/deletion', () => {
    const onSelect = vi.fn(),
      onDelete = vi.fn();
    const view = render(<CanvasMarkSurface {...props({ loading: true, onSelect, onDelete })} />);
    fireEvent.click(screen.getByRole('button', { name: '人物', exact: true }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '外套' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('api_1', 1);
    view.rerender(<CanvasMarkSurface {...props({ disabled: true, onSelect, onDelete })} />);
    fireEvent.click(screen.getByRole('button', { name: '人物', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '删除标记：人物' }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
