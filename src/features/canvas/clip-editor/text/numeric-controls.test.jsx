import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TextNumericSetting from './TextNumericSetting.jsx';
import TextColorSetting from './TextColorSetting.jsx';
const owner = {};
function numeric(props = {}) {
  const callbacks = {
    start: vi.fn((options) => ({ ...options })),
    change: vi.fn(),
    end: vi.fn(),
    cancel: vi.fn(),
  };
  function Harness({ scope = owner, disabled = false }) {
    const [value, setValue] = useState(56);
    return (
      <TextNumericSetting
        label="字号"
        ariaLabel="数值"
        min={8}
        max={400}
        step={1}
        value={value}
        suffix="px"
        owner={scope}
        disabled={disabled}
        {...props}
        onInteractionStart={(options) => {
          const token = callbacks.start(options);
          token.before = value;
          return token;
        }}
        onValueChange={(token, next) => {
          callbacks.change(token, next);
          setValue(next);
          return true;
        }}
        onInteractionEnd={callbacks.end}
        onInteractionCancel={(token) => {
          callbacks.cancel(token);
          setValue(token.before);
        }}
      />
    );
  }
  return {
    ...render(<Harness />),
    Harness,
    callbacks,
    field: () => screen.getByRole('spinbutton', { name: '数值' }),
  };
}
function pointer(target, type, x, id = 7) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x });
  Object.defineProperty(event, 'pointerId', { value: id });
  fireEvent(target, event);
}
describe('source numerical interaction view', () => {
  it('maps the whole bar to the bounded range and batches a pointer drag into one end callback', () => {
    const c = numeric(),
      row = c.field().closest('[data-slot=control-number]');
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 200 });
    pointer(row, 'pointerdown', 50);
    expect(c.callbacks.change).toHaveBeenLastCalledWith(expect.any(Object), 106);
    pointer(row, 'pointermove', 100);
    pointer(row, 'pointerup', 100);
    expect(c.callbacks.change).toHaveBeenLastCalledWith(expect.any(Object), 204);
    expect(c.callbacks.start).toHaveBeenCalledTimes(1);
    expect(c.callbacks.end).toHaveBeenCalledTimes(1);
    expect(c.field().readOnly).toBe(true);
  });
  it('enters text editing on an unmoved readout click without changing the value', () => {
    const c = numeric(),
      row = c.field().closest('[data-slot=control-number]');
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 200 });
    pointer(c.field(), 'pointerdown', 180);
    pointer(c.field(), 'pointerup', 180);
    expect(c.field().readOnly).toBe(false);
    expect(c.field()).toBe(document.activeElement);
    expect(c.callbacks.start).not.toHaveBeenCalled();
  });
  it('preserves invalid raw input, settles its pending reader, and clamps only on commit', () => {
    const c = numeric();
    fireEvent.keyDown(c.field(), { key: 'Enter' });
    fireEvent.change(c.field(), { target: { value: '999' } });
    expect(c.field().value).toBe('999');
    expect(c.field().getAttribute('aria-invalid')).toBe('true');
    expect(c.callbacks.change).not.toHaveBeenCalled();
    expect(c.callbacks.start.mock.calls[0][0].readPending()).toBe(400);
    fireEvent.keyDown(c.field(), { key: 'Enter' });
    expect(c.field().value).toBe('400');
    expect(c.field().readOnly).toBe(true);
    expect(c.callbacks.change).toHaveBeenLastCalledWith(expect.any(Object), 400);
    expect(c.callbacks.end).toHaveBeenCalledTimes(1);
  });
  it('cancels typed previews with Escape and uses min-relative snapping for keyboard changes', () => {
    const c = numeric({ min: 8, step: 5 });
    fireEvent.keyDown(c.field(), { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyUp(c.field(), { key: 'ArrowRight' });
    expect(c.field().value).toBe('108');
    fireEvent.keyDown(c.field(), { key: 'Enter' });
    fireEvent.change(c.field(), { target: { value: '20.125' } });
    expect(c.callbacks.change).toHaveBeenLastCalledWith(expect.any(Object), 20.125);
    fireEvent.keyDown(c.field(), { key: 'Escape' });
    expect(c.field().value).toBe('108');
    expect(c.callbacks.cancel).toHaveBeenCalledTimes(1);
    expect(c.callbacks.end).toHaveBeenCalledTimes(1);
  });
  it('cancels pending pointer work on window blur or owner replacement, never ending the next owner', () => {
    vi.useFakeTimers();
    try {
      const c = numeric(),
        row = c.field().closest('[data-slot=control-number]');
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 200 });
      pointer(row, 'pointerdown', 50);
      pointer(row, 'pointermove', 150);
      act(() => window.dispatchEvent(new Event('blur')));
      act(() => vi.advanceTimersByTime(20));
      expect(c.callbacks.cancel).toHaveBeenCalledTimes(1);
      expect(c.field().value).toBe('56');
      pointer(row, 'pointerdown', 50);
      c.rerender(<c.Harness scope={{ another: true }} />);
      act(() => vi.advanceTimersByTime(20));
      expect(c.callbacks.cancel).toHaveBeenCalledTimes(2);
      expect(c.callbacks.end).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('cancels only a genuinely hidden document visibility event, keeping visible notifications harmless', () => {
    const c = numeric(),
      row = c.field().closest('[data-slot=control-number]');
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 200 });
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    pointer(row, 'pointerdown', 50);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(c.callbacks.cancel).not.toHaveBeenCalled();
    hidden.mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(c.callbacks.cancel).toHaveBeenCalledTimes(1);
    expect(c.callbacks.end).not.toHaveBeenCalled();
    expect(c.field().value).toBe('56');
  });
});
describe('source non-alpha color swatch', () => {
  it('shows hex and alpha, retains alpha through native changes and ends the burst once on blur', () => {
    const start = vi.fn(() => ({})),
      change = vi.fn(),
      end = vi.fn();
    render(
      <TextColorSetting
        label="颜色"
        ariaLabel="颜色值"
        owner={owner}
        value="#ff000080"
        onInteractionStart={start}
        onValueChange={change}
        onInteractionEnd={end}
      />,
    );
    expect(screen.getByText('#FF0000')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    const input = screen.getByLabelText('颜色值');
    fireEvent.change(input, { target: { value: '#00ff00' } });
    fireEvent.change(input, { target: { value: '#0000ff' } });
    expect(start).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenLastCalledWith(expect.any(Object), 'rgba(0, 0, 255, 0.5)');
    fireEvent.blur(input);
    expect(end).toHaveBeenCalledTimes(1);
  });
  it('hides background alpha display and commits a live native swatch when removed in the same owner', () => {
    const end = vi.fn(),
      start = vi.fn(() => ({}));
    const { unmount } = render(
      <TextColorSetting
        label="背景"
        ariaLabel="背景值"
        showOpacity={false}
        owner={owner}
        value="transparent"
        onInteractionStart={start}
        onValueChange={vi.fn()}
        onInteractionEnd={end}
      />,
    );
    expect(screen.queryByText('0%')).toBeNull();
    fireEvent.change(screen.getByLabelText('背景值'), { target: { value: '#ffffff' } });
    unmount();
    expect(end).toHaveBeenCalledTimes(1);
  });
});
