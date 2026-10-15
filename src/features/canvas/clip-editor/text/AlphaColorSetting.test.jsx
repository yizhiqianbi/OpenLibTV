import { useLayoutEffect, useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AlphaColorSetting from './AlphaColorSetting.jsx';
import { registerDialog } from '../../../../services/dialog-stack.ts';
const owner = {};
function setup() {
  const calls = {
    start: vi.fn(() => ({})),
    change: vi.fn(),
    end: vi.fn(),
    cancel: vi.fn(),
    close: vi.fn(),
  };
  function Host({ scope = owner, disabled = false }) {
    const root = useRef(null),
      [value, setValue] = useState('#ff0000');
    useLayoutEffect(() => registerDialog(root.current, () => ({ onClose: calls.close })), []);
    return (
      <div ref={root} className="cv-clip-editor" role="dialog" aria-label="剪辑" tabIndex={-1}>
        <AlphaColorSetting
          label="高亮文字"
          ariaLabel="字幕高亮文字"
          owner={scope}
          disabled={disabled}
          value={value}
          onInteractionStart={calls.start}
          onInteractionEnd={calls.end}
          onInteractionCancel={calls.cancel}
          onValueChange={(token, next) => {
            calls.change(token, next);
            setValue(next);
            return true;
          }}
        />
        <button>其他控件</button>
      </div>
    );
  }
  const view = render(<Host />);
  const open = async () => {
    const button = screen.getByRole('button', { name: '字幕高亮文字', exact: true });
    fireEvent.click(button);
    const slider = await screen.findByRole('slider', { name: '字幕高亮文字 A', exact: true });
    return { button, slider };
  };
  return { ...view, Host, calls, open };
}
describe('real Mantine alpha picker with the shared editor dialog', () => {
  it('flushes the library RAF before closing a quick mouse click with Escape', async () => {
    const c = setup(),
      { slider } = await c.open();
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 10,
    });
    fireEvent.mouseDown(slider, { button: 0, clientX: 37, clientY: 5 });
    fireEvent.mouseUp(document.documentElement);
    fireEvent.keyDown(slider, { key: 'Escape' });
    await waitFor(() =>
      expect(c.calls.change).toHaveBeenLastCalledWith(expect.any(Object), 'rgba(255, 0, 0, 0.37)'),
    );
    await waitFor(() => expect(c.calls.end).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByRole('slider', { name: '字幕高亮文字 A' })).toBeNull(),
    );
  });
  it('uses keyboard alpha steps, retains integer opacity and closes only the palette on Escape', async () => {
    const c = setup(),
      { button, slider } = await c.open();
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(c.calls.change).toHaveBeenLastCalledWith(expect.any(Object), 'rgba(255, 0, 0, 0.95)');
    expect(c.calls.end).toHaveBeenCalledTimes(1);
    expect(c.calls.start.mock.calls[0][0].readPending()).toBe('rgba(255, 0, 0, 0.95)');
    fireEvent.keyDown(slider, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('slider', { name: '字幕高亮文字 A' })).toBeNull(),
    );
    expect(document.activeElement).toBe(button);
    expect(c.calls.close).not.toHaveBeenCalled();
    expect(c.calls.end).toHaveBeenCalledTimes(1);
  });
  it('commits an unfinished mouse drag once on pagehide and ignores late movement and completion', async () => {
    const c = setup(),
      { slider } = await c.open();
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 10,
    });
    fireEvent.mouseDown(slider, { button: 0, clientX: 37, clientY: 5 });
    await waitFor(() =>
      expect(c.calls.change).toHaveBeenLastCalledWith(expect.any(Object), 'rgba(255, 0, 0, 0.37)'),
    );
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(c.calls.end).toHaveBeenCalledTimes(1);
    const changes = c.calls.change.mock.calls.length;
    fireEvent.mouseMove(document.documentElement, { clientX: 75, clientY: 5 });
    fireEvent.mouseUp(document.documentElement);
    expect(c.calls.change).toHaveBeenCalledTimes(changes);
    expect(c.calls.end).toHaveBeenCalledTimes(1);
  });
  it('cancels the previous owner during a drag, closes its palette and rejects the old mouse completion', async () => {
    const c = setup(),
      { slider } = await c.open();
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 10,
    });
    fireEvent.mouseDown(slider, { button: 0, clientX: 40, clientY: 5 });
    await waitFor(() => expect(c.calls.change).toHaveBeenCalled());
    c.rerender(<c.Host scope={{}} />);
    expect(c.calls.cancel).toHaveBeenCalledTimes(1);
    expect(c.calls.end).not.toHaveBeenCalled();
    fireEvent.mouseUp(document.documentElement);
    expect(c.calls.end).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '字幕高亮文字' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });
  it('does not take focus back from another control after an outside close', async () => {
    const c = setup();
    await c.open();
    const other = screen.getByRole('button', { name: '其他控件' });
    fireEvent.mouseDown(other);
    other.focus();
    await waitFor(() =>
      expect(screen.queryByRole('slider', { name: '字幕高亮文字 A' })).toBeNull(),
    );
    expect(document.activeElement).toBe(other);
    expect(c.calls.close).not.toHaveBeenCalled();
  });
});
