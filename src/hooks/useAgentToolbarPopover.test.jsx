import { act, fireEvent, render, screen } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentToolbarPosition, useAgentToolbarPopover } from './useAgentToolbarPopover.js';

function Harness({ onOpen, onClose, ...options }) {
  const popover = useAgentToolbarPopover({ onOpen, onClose, ...options });
  return (
    <>
      <button ref={popover.triggerRef} {...popover.triggerProps}>
        Open
      </button>
      <button>Outside</button>
      {popover.open &&
        createPortal(
          <div
            ref={popover.popoverRef}
            {...popover.popoverProps}
            data-testid="popover"
            style={popover.popoverStyle}
          >
            <button>Inside</button>
          </div>,
          document.body,
        )}
    </>
  );
}
afterEach(() => vi.useRealTimers());
describe('shared non-modal toolbar lifecycle', () => {
  it('places source panels above when possible and clamps width on a narrow viewport', () => {
    const anchor = { left: 360, top: 680, bottom: 712, width: 32 };
    expect(
      agentToolbarPosition(
        anchor,
        { height: 384 },
        { width: 1280, height: 720 },
        { width: 370, maxHeight: 384 },
      ),
    ).toMatchObject({ left: 191, top: 288, width: 370, maxHeight: 384 });
    expect(
      agentToolbarPosition(
        { left: 368, top: 760, bottom: 792, width: 22 },
        { height: 384 },
        { width: 390, height: 844 },
        { width: 370, maxHeight: 384 },
      ),
    ).toMatchObject({ left: 12, width: 370 });
    expect(
      agentToolbarPosition(
        { left: 0, top: 10, bottom: 42, width: 32 },
        { height: 384 },
        { width: 320, height: 500 },
        { width: 370, maxHeight: 384 },
      ),
    ).toMatchObject({ left: 8, top: 50, width: 304 });
  });
  it('uses latest callbacks, restores on Escape and keeps outside focus', () => {
    const initial = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(<Harness onClose={initial} />);
    fireEvent.click(screen.getByText('Open'));
    const inside = screen.getByText('Inside');
    act(() => inside.focus());
    rerender(<Harness onClose={latest} />);
    expect(document.activeElement).toBe(inside);
    fireEvent.keyDown(inside, { key: 'Escape' });
    expect(latest).toHaveBeenCalledTimes(1);
    expect(initial).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByText('Open'));
    fireEvent.click(screen.getByText('Open'));
    act(() => screen.getByText('Outside').focus());
    expect(screen.queryByTestId('popover')).toBeNull();
    expect(document.activeElement).toBe(screen.getByText('Outside'));
  });
  it('closes on outside scroll/wheel while allowing model-list scrolling', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Open'));
    fireEvent.scroll(screen.getByTestId('popover'));
    fireEvent.wheel(screen.getByText('Inside'));
    expect(screen.getByTestId('popover')).toBeTruthy();
    fireEvent.wheel(screen.getByText('Outside'));
    expect(screen.queryByTestId('popover')).toBeNull();
    fireEvent.click(screen.getByText('Open'));
    fireEvent.scroll(window);
    expect(screen.queryByTestId('popover')).toBeNull();
  });
  it('honors source hover delays and cancels pending opens on unmount', () => {
    vi.useFakeTimers();
    const opened = vi.fn();
    const { unmount } = render(<Harness trigger="hover" onOpen={opened} closeDelay={400} />);
    fireEvent.mouseEnter(screen.getByText('Open'));
    act(() => vi.advanceTimersByTime(79));
    expect(screen.queryByTestId('popover')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(opened).toHaveBeenCalledTimes(1);
    fireEvent.mouseLeave(screen.getByText('Open'));
    act(() => vi.advanceTimersByTime(399));
    expect(screen.getByTestId('popover')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId('popover')).toBeNull();
    fireEvent.mouseEnter(screen.getByText('Open'));
    unmount();
    act(() => vi.runOnlyPendingTimers());
    expect(opened).toHaveBeenCalledTimes(1);
  });
  it('opens with the keyboard and removes observers/listeners after unmount', () => {
    const { unmount } = render(<Harness />);
    fireEvent.keyDown(screen.getByText('Open'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByText('Inside'));
    unmount();
    fireEvent.wheel(window);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('popover')).toBeNull();
  });
});
