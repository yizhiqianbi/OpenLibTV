import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCanvasWheel } from './useCanvasWheel.js';

const surfaces = [];
afterEach(() => surfaces.splice(0).forEach((element) => element.remove()));
function setup() {
  const board = document.createElement('main');
  document.body.append(board);
  surfaces.push(board);
  let view = { x: 100, y: 200, z: 1 };
  const setView = vi.fn((update) => {
    view = typeof update === 'function' ? update(view) : update;
  });
  const options = { board: { current: board }, setView, zoom: vi.fn() };
  const hook = renderHook(() => useCanvasWheel(options));
  const wheel = (target = board, patch = {}) => {
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaX: 10,
      deltaY: 20,
      clientX: 180,
      clientY: 240,
      ...patch,
    });
    act(() => target.dispatchEvent(event));
    return event;
  };
  return { board, options, hook, wheel, view: () => view };
}

describe('canvas wheel ownership', () => {
  it('consumes only canvas pan and keeps native page scrolling from also running', () => {
    const page = setup();
    expect(page.wheel().defaultPrevented).toBe(true);
    expect(page.view()).toEqual({ x: 90, y: 180, z: 1 });
    expect(page.options.zoom).not.toHaveBeenCalled();
  });
  it.each(['ctrlKey', 'metaKey'])('zooms around the actual pointer for %s', (modifier) => {
    const page = setup();
    expect(page.wheel(page.board, { [modifier]: true }).defaultPrevented).toBe(true);
    expect(page.options.zoom).toHaveBeenCalledExactlyOnceWith(Math.exp(-20 * 0.006), 180, 240);
    expect(page.options.setView).not.toHaveBeenCalled();
  });
  it.each([
    ['textarea', ''],
    ['input', ''],
    ['select', ''],
    ['video', ''],
    ['audio', ''],
    ['div', 'cv-storyboard'],
    ['div', 'cv-floating'],
    ['div', 'cv-settings'],
    ['div', 'cv-inline-generator'],
    ['div', 'nowheel'],
  ])('leaves %s %s native scrolling and controls alone', (tag, className) => {
    const page = setup();
    const surface = document.createElement(tag);
    surface.className = className;
    page.board.append(surface);
    expect(page.wheel(surface).defaultPrevented).toBe(false);
    expect(page.wheel(surface, { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(page.options.setView).not.toHaveBeenCalled();
    expect(page.options.zoom).not.toHaveBeenCalled();
  });
  it('keeps contenteditable descendants and text targets inside their editor', () => {
    const page = setup();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.innerHTML = '<span>编辑器内容</span>';
    page.board.append(editor);
    expect(page.wheel(editor.firstChild.firstChild).defaultPrevented).toBe(false);
    expect(page.options.setView).not.toHaveBeenCalled();
  });
  it.each(['overflowY', 'overflowX'])(
    'respects a real %s scroll owner above the target',
    (axis) => {
      const page = setup();
      const scroller = document.createElement('div');
      scroller.style[axis] = 'auto';
      Object.defineProperties(scroller, {
        scrollHeight: { value: 200 },
        clientHeight: { value: 80 },
        scrollWidth: { value: 200 },
        clientWidth: { value: 80 },
      });
      const child = document.createElement('span');
      scroller.append(child);
      page.board.append(scroller);
      expect(page.wheel(child).defaultPrevented).toBe(false);
      expect(page.options.setView).not.toHaveBeenCalled();
    },
  );
  it('allows a nonoverflowing container to pass its wheel to the canvas', () => {
    const page = setup();
    const container = document.createElement('div');
    container.style.overflow = 'auto';
    page.board.append(container);
    expect(page.wheel(container).defaultPrevented).toBe(true);
    expect(page.view().x).toBe(90);
  });
  it('uses current callbacks after rerender and removes its listener on unmount', () => {
    const page = setup();
    const replacement = vi.fn();
    page.options.setView = replacement;
    page.hook.rerender();
    page.wheel();
    expect(replacement).toHaveBeenCalledOnce();
    page.hook.unmount();
    page.wheel();
    expect(replacement).toHaveBeenCalledOnce();
  });
});
