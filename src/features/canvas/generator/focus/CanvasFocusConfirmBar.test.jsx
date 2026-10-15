import { StrictMode } from 'react';
import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CanvasFocusConfirmBar from './CanvasFocusConfirmBar.jsx';

let viewport, surface, bounds, resizeObservers, mutationObservers, frames, frameId;
const region = { relX: 0.1, relY: 0.2, width: 0.3, height: 0.4 };
const props = (extra = {}) => ({ region, surfaceElement: surface, ownerKey: 'owner', ...extra });
const flushFrames = () =>
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback();
  });
const transition = (element, type, propertyName = 'transform') => {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'propertyName', { value: propertyName });
  fireEvent(element, event);
};
const measureBar = (width) => {
  let measuredWidth = width;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return this.matches('[data-focus-confirm-bar]') ? { width: measuredWidth } : new DOMRect();
  });
  return (nextWidth) => {
    measuredWidth = nextWidth;
  };
};
const barCenter = (bar) => Number.parseFloat(bar.style.left);

beforeEach(() => {
  bounds = { left: 100, top: 50, width: 200, height: 100, bottom: 150 };
  viewport = document.createElement('div');
  viewport.className = 'cv-world';
  surface = document.createElement('div');
  surface.getBoundingClientRect = () => bounds;
  viewport.append(surface);
  document.body.append(viewport);
  resizeObservers = [];
  mutationObservers = [];
  frames = new Map();
  frameId = 0;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      const id = ++frameId;
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
        resizeObservers.push(this);
      }
    },
  );
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        mutationObservers.push(this);
      }
    },
  );
});

afterEach(() => {
  viewport.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('source focus confirmation and layout lifecycle', () => {
  it('portals to body below the actual rendered content and exposes all seven source ratios in order', () => {
    const view = render(<CanvasFocusConfirmBar {...props()} selectedRatio="4:3" />);
    const bar = screen.getByRole('region', { name: '确认聚焦区域' });
    expect(bar.parentElement).toBe(document.body);
    expect(view.container.contains(bar)).toBe(false);
    expect(bar.style.left).toBe('200px');
    expect(bar.style.top).toBe('158px');
    expect(bar.style.visibility).toBe('visible');
    expect(
      within(bar)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16', '取消', '确认']);
    expect(within(bar).getByRole('button', { name: '4:3' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(resizeObservers[0].observe).toHaveBeenCalledWith(surface);
    expect(mutationObservers[0].observe).toHaveBeenCalledWith(viewport, {
      attributes: true,
      attributeFilter: ['style', 'transform'],
    });
    expect(document.body.style.overflow).toBe('');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('tracks resize, world transform and scroll without using saved node coordinates', () => {
    render(<CanvasFocusConfirmBar {...props()} />);
    const bar = screen.getByRole('region', { name: '确认聚焦区域' });
    bounds = { left: 250, top: 120, width: 300, height: 160, bottom: 280 };
    act(() => resizeObservers[0].callback());
    flushFrames();
    expect(bar.style.left).toBe('400px');
    expect(bar.style.top).toBe('288px');
    bounds = { ...bounds, left: 200, bottom: 310 };
    act(() => mutationObservers[0].callback());
    flushFrames();
    expect(bar.style.left).toBe('350px');
    expect(bar.style.top).toBe('318px');
    bounds = { ...bounds, left: 150 };
    fireEvent.scroll(window);
    flushFrames();
    expect(bar.style.left).toBe('300px');
  });

  it('keeps both off-screen source anchors inside narrow viewport margins using the actual bar width', () => {
    vi.stubGlobal('innerWidth', 390);
    const width = 372.3;
    measureBar(width);
    bounds = { left: 17.51, top: 50, width: 178.26, height: 100, bottom: 150 };
    render(<CanvasFocusConfirmBar {...props()} />);
    const bar = screen.getByRole('region', { name: '确认聚焦区域' });
    expect(barCenter(bar) - width / 2).toBeCloseTo(8);
    expect(barCenter(bar) + width / 2).toBeLessThanOrEqual(382);
    expect(bar.style.top).toBe('158px');
    bounds = { ...bounds, left: 340, width: 160 };
    act(() => mutationObservers[0].callback());
    flushFrames();
    expect(barCenter(bar) + width / 2).toBeCloseTo(382);
    expect(barCenter(bar) - width / 2).toBeGreaterThanOrEqual(8);
  });

  it('restores the source-centered desktop anchor when the viewport expands beyond the narrow breakpoint', () => {
    vi.stubGlobal('innerWidth', 390);
    measureBar(300);
    bounds = { left: 10, top: 50, width: 100, height: 100, bottom: 150 };
    render(<CanvasFocusConfirmBar {...props()} />);
    const bar = screen.getByRole('region', { name: '确认聚焦区域' });
    expect(barCenter(bar) - 150).toBe(8);
    vi.stubGlobal('innerWidth', 601);
    fireEvent.resize(window);
    flushFrames();
    expect(barCenter(bar)).toBe(60);
    expect(bar.style.top).toBe('158px');
    vi.stubGlobal('innerWidth', 600);
    fireEvent.resize(window);
    flushFrames();
    expect(barCenter(bar) - 150).toBe(8);
    expect(document.body.style.overflow).toBe('');
  });

  it('reclamps observed bar content widths and retires their callbacks on owner replacement and unmount', () => {
    vi.stubGlobal('innerWidth', 390);
    const resizeBar = measureBar(200);
    bounds = { left: 10, top: 50, width: 100, height: 100, bottom: 150 };
    const view = render(<CanvasFocusConfirmBar {...props()} />);
    const bar = screen.getByRole('region', { name: '确认聚焦区域' });
    const oldResize = resizeObservers[0];
    expect(oldResize.observe).toHaveBeenCalledWith(bar);
    expect(barCenter(bar) - 100).toBe(8);
    resizeBar(372);
    view.rerender(<CanvasFocusConfirmBar {...props({ error: '本机保存失败，原区域仍保留' })} />);
    act(() => oldResize.callback([{ target: bar }]));
    flushFrames();
    expect(barCenter(bar) - 186).toBe(8);
    expect(barCenter(bar) + 186).toBeLessThanOrEqual(382);
    resizeBar(250);
    act(() => oldResize.callback([{ target: bar }]));
    const staleFrame = [...frames.values()][0];
    bounds = { ...bounds, left: 230 };
    view.rerender(<CanvasFocusConfirmBar {...props({ ownerKey: 'next-owner' })} />);
    const currentCenter = barCenter(bar);
    expect(currentCenter + 125).toBe(382);
    expect(oldResize.disconnect).toHaveBeenCalledTimes(1);
    bounds = { ...bounds, left: 900 };
    act(() => {
      oldResize.callback([{ target: bar }]);
      staleFrame();
    });
    expect(barCenter(bar)).toBe(currentCenter);
    expect(frames.size).toBe(0);
    const currentResize = resizeObservers[1];
    expect(currentResize.observe).toHaveBeenCalledWith(bar);
    view.unmount();
    expect(currentResize.disconnect).toHaveBeenCalledTimes(1);
    act(() => currentResize.callback([{ target: bar }]));
    expect(frames.size).toBe(0);
  });

  it('follows rendered intermediate transform transition bounds and stops at the final geometry', () => {
    render(<CanvasFocusConfirmBar {...props()} />);
    const bar = screen.getByRole('region', { name: '确认聚焦区域' });
    transition(viewport, 'transitionrun');
    transition(viewport, 'transitionstart');
    expect(frames.size).toBe(1);
    bounds = { left: 220, top: 100, width: 240, height: 120, bottom: 220 };
    flushFrames();
    expect(bar.style.left).toBe('340px');
    expect(bar.style.top).toBe('228px');
    bounds = { left: 340, top: 160, width: 280, height: 140, bottom: 300 };
    flushFrames();
    expect(bar.style.left).toBe('480px');
    expect(bar.style.top).toBe('308px');
    // Bubbling child events and unrelated property endings cannot stop tracking.
    transition(surface, 'transitionend');
    transition(viewport, 'transitionend', 'opacity');
    bounds = { ...bounds, left: 380, bottom: 330 };
    flushFrames();
    expect(bar.style.left).toBe('520px');
    expect(bar.style.top).toBe('338px');
    const staleFrame = [...frames.values()][0];
    bounds = { ...bounds, left: 440, bottom: 360 };
    transition(viewport, 'transitionend');
    expect(bar.style.left).toBe('580px');
    expect(bar.style.top).toBe('368px');
    expect(frames.size).toBe(0);
    bounds = { ...bounds, left: 900 };
    act(() => staleFrame());
    expect(bar.style.left).toBe('580px');
    expect(frames.size).toBe(0);
  });

  it('ignores child and unrelated transitions, cancels transform tracking, and retains one-shot observers', () => {
    render(<CanvasFocusConfirmBar {...props()} />);
    const bar = screen.getByRole('region', { name: '确认聚焦区域' });
    transition(surface, 'transitionrun');
    transition(surface, 'transitionstart');
    transition(viewport, 'transitionrun', 'opacity');
    transition(viewport, 'transitionstart', 'width');
    expect(frames.size).toBe(0);
    transition(viewport, 'transitionstart');
    bounds = { ...bounds, left: 300, bottom: 250 };
    flushFrames();
    expect(bar.style.left).toBe('400px');
    expect(bar.style.top).toBe('258px');
    bounds = { ...bounds, left: 420, bottom: 280 };
    const staleFrame = [...frames.values()][0];
    transition(viewport, 'transitioncancel');
    expect(bar.style.left).toBe('520px');
    expect(bar.style.top).toBe('288px');
    expect(frames.size).toBe(0);
    bounds = { ...bounds, left: 600, bottom: 400 };
    act(() => staleFrame());
    expect(bar.style.left).toBe('520px');
    act(() => mutationObservers[0].callback());
    flushFrames();
    expect(bar.style.left).toBe('700px');
    expect(bar.style.top).toBe('408px');
    expect(frames.size).toBe(0);
  });

  it('retires transition frames on owner replacement without late measurements or restarting old tracking', () => {
    const view = render(<CanvasFocusConfirmBar {...props({ ownerKey: {} })} />);
    transition(viewport, 'transitionrun');
    bounds = { ...bounds, left: 200 };
    flushFrames();
    const staleFrame = [...frames.values()][0];
    bounds = { ...bounds, left: 500 };
    view.rerender(<CanvasFocusConfirmBar {...props({ ownerKey: {} })} />);
    const bar = screen.getByRole('region', { name: '确认聚焦区域' });
    expect(bar.style.left).toBe('600px');
    expect(frames.size).toBe(0);
    bounds = { ...bounds, left: 800 };
    act(() => staleFrame());
    expect(bar.style.left).toBe('600px');
    expect(frames.size).toBe(0);
    // A transition initiated by the current owner can track the same viewport again.
    transition(viewport, 'transitionstart');
    flushFrames();
    expect(bar.style.left).toBe('900px');
    transition(viewport, 'transitioncancel');
    expect(frames.size).toBe(0);
  });

  it('cleans transform listeners and active frames through StrictMode replay and unmount', () => {
    const removeListener = vi.spyOn(viewport, 'removeEventListener');
    const view = render(
      <StrictMode>
        <CanvasFocusConfirmBar {...props()} />
      </StrictMode>,
    );
    for (const name of ['transitionrun', 'transitionstart', 'transitionend', 'transitioncancel'])
      expect(removeListener).toHaveBeenCalledWith(name, expect.any(Function));
    transition(viewport, 'transitionstart');
    bounds = { ...bounds, left: 260, bottom: 280 };
    flushFrames();
    const bar = screen.getByRole('region', { name: '确认聚焦区域' });
    expect(bar.style.left).toBe('360px');
    expect(bar.style.top).toBe('288px');
    const staleFrame = [...frames.values()][0];
    view.unmount();
    expect(frames.size).toBe(0);
    expect(removeListener.mock.calls).toHaveLength(8);
    bounds = { ...bounds, left: 900 };
    act(() => staleFrame());
    transition(viewport, 'transitionrun');
    expect(bar.style.left).toBe('360px');
    expect(frames.size).toBe(0);
  });

  it('coalesces measurements into one frame and drops stale owner callbacks including A→B→A', () => {
    const ownerA = {},
      ownerB = {},
      nextA = {};
    const view = render(<CanvasFocusConfirmBar {...props({ ownerKey: ownerA })} />);
    const oldResize = resizeObservers[0],
      oldMutation = mutationObservers[0];
    oldResize.callback();
    oldMutation.callback();
    expect(frames.size).toBe(1);
    const staleFrame = [...frames.values()][0];
    view.rerender(<CanvasFocusConfirmBar {...props({ ownerKey: ownerB })} />);
    view.rerender(<CanvasFocusConfirmBar {...props({ ownerKey: nextA })} />);
    const bar = screen.getByRole('region', { name: '确认聚焦区域' });
    const previousLeft = bar.style.left;
    bounds = { ...bounds, left: 900 };
    act(() => {
      oldResize.callback();
      oldMutation.callback();
      staleFrame();
    });
    expect(frames.size).toBe(0);
    expect(bar.style.left).toBe(previousLeft);
    expect(oldResize.disconnect).toHaveBeenCalledTimes(1);
    expect(oldMutation.disconnect).toHaveBeenCalledTimes(1);
  });

  it('cleans observers/frame/listeners after exit and rejects a late callback after unmount', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const view = render(<CanvasFocusConfirmBar {...props()} />);
    const oldResize = resizeObservers[0],
      oldMutation = mutationObservers[0];
    oldResize.callback();
    const staleFrame = [...frames.values()][0];
    view.rerender(<CanvasFocusConfirmBar {...props({ active: false })} />);
    expect(screen.queryByRole('region', { name: '确认聚焦区域' })).toBeNull();
    expect(frames.size).toBe(0);
    expect(oldResize.disconnect).toHaveBeenCalledTimes(1);
    expect(oldMutation.disconnect).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function), true);
    view.unmount();
    act(() => {
      oldResize.callback();
      oldMutation.callback();
      staleFrame();
    });
    expect(frames.size).toBe(0);
  });

  it('keeps ownership correct through StrictMode replay and a replacement surface', () => {
    const view = render(
      <StrictMode>
        <CanvasFocusConfirmBar {...props()} />
      </StrictMode>,
    );
    expect(resizeObservers).toHaveLength(2);
    expect(resizeObservers[0].disconnect).toHaveBeenCalledTimes(1);
    const next = document.createElement('div');
    next.getBoundingClientRect = () => ({ left: 10, top: 20, width: 80, height: 90, bottom: 110 });
    viewport.append(next);
    view.rerender(
      <StrictMode>
        <CanvasFocusConfirmBar {...props({ surfaceElement: next })} />
      </StrictMode>,
    );
    const bar = screen.getByRole('region', { name: '确认聚焦区域' });
    expect(bar.style.left).toBe('50px');
    expect(bar.style.top).toBe('118px');
    expect(resizeObservers[1].disconnect).toHaveBeenCalledTimes(1);
  });

  it('hides an unmeasurable or detached surface and never invents a fallback position', () => {
    render(<CanvasFocusConfirmBar {...props()} />);
    const bar = screen.getByRole('region', { name: '确认聚焦区域' });
    bounds = { ...bounds, width: 0 };
    resizeObservers[0].callback();
    flushFrames();
    expect(bar.style.visibility).toBe('hidden');
    bounds = { ...bounds, width: 200 };
    surface.remove();
    resizeObservers[0].callback();
    flushFrames();
    expect(bar.style.visibility).toBe('hidden');
  });

  it('delegates current ratio/cancel/confirm without changing the controlled draft or capturing Escape', async () => {
    const onRatioChange = vi.fn(),
      onCancel = vi.fn(),
      onConfirm = vi.fn(),
      board = vi.fn();
    render(
      <div onPointerDown={board} onClick={board} onKeyDown={board}>
        <CanvasFocusConfirmBar {...props({ onRatioChange, onCancel, onConfirm })} />
      </div>,
    );
    const ratio = screen.getByRole('button', { name: '3:2' });
    fireEvent.pointerDown(ratio);
    ratio.focus();
    await userEvent.keyboard(' ');
    expect(onRatioChange).toHaveBeenCalledExactlyOnceWith('3:2');
    expect(board).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(region).toEqual({ relX: 0.1, relY: 0.2, width: 0.3, height: 0.4 });
    fireEvent.keyDown(ratio, { key: 'Escape' });
    expect(board).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('blocks recommit after quota failure while preserving the actionable retry and explicit local error', () => {
    const action = vi.fn(),
      onRetrySave = vi.fn();
    const view = render(
      <CanvasFocusConfirmBar
        {...props({
          disabled: true,
          error: '本机保存失败',
          onRetrySave,
          onRatioChange: action,
          onCancel: action,
          onConfirm: action,
        })}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('本机保存失败');
    for (const name of ['16:9', '取消', '确认']) {
      const button = screen.getByRole('button', { name });
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(action).not.toHaveBeenCalled();
    const retry = screen.getByRole('button', { name: '重试保存' });
    expect(retry.disabled).toBe(false);
    fireEvent.click(retry);
    expect(onRetrySave).toHaveBeenCalledTimes(1);
    view.rerender(
      <CanvasFocusConfirmBar
        {...props({
          disabled: true,
          error: new Error('仍保存失败'),
          onRetrySave,
          retryDisabled: true,
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '重试保存' }));
    expect(onRetrySave).toHaveBeenCalledTimes(1);
  });

  it('does not steal existing focus or create a placeholder bar before any valid region', () => {
    const external = document.createElement('button');
    external.textContent = '外部控件';
    document.body.append(external);
    external.focus();
    const view = render(<CanvasFocusConfirmBar {...props({ region: null })} />);
    expect(screen.queryByRole('region', { name: '确认聚焦区域' })).toBeNull();
    expect(resizeObservers).toHaveLength(0);
    view.rerender(<CanvasFocusConfirmBar {...props()} />);
    expect(document.activeElement).toBe(external);
    external.remove();
  });

  it('uses current callbacks after controlled rerender and leaves disabled clicks inert', () => {
    const oldConfirm = vi.fn(),
      currentConfirm = vi.fn(),
      ratio = vi.fn();
    const view = render(<CanvasFocusConfirmBar {...props({ onConfirm: oldConfirm })} />);
    view.rerender(
      <CanvasFocusConfirmBar {...props({ onConfirm: currentConfirm, onRatioChange: ratio })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(currentConfirm).toHaveBeenCalledTimes(1);
    expect(oldConfirm).not.toHaveBeenCalled();
    view.rerender(
      <CanvasFocusConfirmBar
        {...props({ disabled: true, onConfirm: currentConfirm, onRatioChange: ratio })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    fireEvent.click(screen.getByRole('button', { name: '4:3' }));
    expect(currentConfirm).toHaveBeenCalledTimes(1);
    expect(ratio).not.toHaveBeenCalled();
  });

  it('keeps fixed screen-size source chrome and scopes narrow-screen wrapping to this bar', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/features/canvas/generator/focus/focus.css', 'utf8');
    document.head.append(style);
    try {
      render(<CanvasFocusConfirmBar {...props()} />);
      const bar = getComputedStyle(screen.getByRole('region', { name: '确认聚焦区域' }));
      expect(bar.position).toBe('fixed');
      expect(bar.width).toBe('max-content');
      expect(bar.zIndex).toBe('9999');
      expect(bar.backgroundColor).toBe('rgba(0, 0, 0, 0.75)');
      expect(bar.padding).toBe('4px');
      expect(bar.backdropFilter).toBe('blur(8px)');
      const ratio = getComputedStyle(screen.getByRole('button', { name: '3:2' }));
      expect(ratio.fontSize).toBe('12px');
      expect(ratio.padding).toBe('4px 8px');
      const rules = [...style.sheet.cssRules];
      const mobile = rules.find((rule) => rule.media?.mediaText.includes('600px'));
      const wrap = [...mobile.cssRules].find(
        (rule) => rule.selectorText === '.cv-focus-confirm-actions',
      );
      expect(wrap.style.flexWrap).toBe('wrap');
      expect(wrap.style.justifyContent).toBe('center');
    } finally {
      style.remove();
    }
  });
});
