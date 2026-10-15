import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GeneratorNumericSetting from './GeneratorNumericSetting.jsx';

function Host({ advanced = true, disabled = false, layout = 'inline', save = () => {} }) {
  const [value, setValue] = useState(1);
  return (
    <>
      <GeneratorNumericSetting
        label="音量"
        property={{ min: 0.01, max: 10, step: 0.1, layout }}
        {...{ value, advanced, disabled }}
        onChange={(next) => {
          save(next);
          setValue(next);
        }}
      />
      <output aria-label="saved volume">{value}</output>
    </>
  );
}
describe('the source normal and advanced numeric controls', () => {
  it('preserves advanced decimal input and restores invalid drafts without saving twice', () => {
    const save = vi.fn();
    render(<Host save={save} />);
    const input = screen.getByRole('textbox', { name: '音量数值' });
    fireEvent.change(input, { target: { value: '0.11' } });
    expect(screen.getByLabelText('saved volume').textContent).toBe('1');
    fireEvent.blur(input);
    expect(screen.getByLabelText('saved volume').textContent).toBe('0.11');
    expect(input.value).toBe('0.1');
    expect(save.mock.calls).toEqual([[0.11]]);
    fireEvent.change(input, { target: { value: '-' } });
    fireEvent.blur(input);
    expect(input.value).toBe('0.1');
    expect(save).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.blur(input);
    expect(screen.getByLabelText('saved volume').textContent).toBe('10');
  });
  it('rounds the normal numeric input on blur and previews the bounded draft', () => {
    render(<Host advanced={false} />);
    const input = screen.getByRole('spinbutton', { name: '音量数值' });
    fireEvent.change(input, { target: { value: '0.11' } });
    expect(screen.getByRole('slider', { name: '音量' }).getAttribute('aria-valuenow')).toBe('0.11');
    expect(screen.getByLabelText('saved volume').textContent).toBe('1');
    fireEvent.blur(input);
    expect(screen.getByLabelText('saved volume').textContent).toBe('0.1');
  });
  it('commits an actual Mantine drag only after release and accepts keyboard completion', async () => {
    const save = vi.fn();
    render(<Host save={save} />);
    const thumb = screen.getByRole('slider', { name: '音量' });
    const track = thumb.parentElement.parentElement;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 8,
    });
    fireEvent.mouseDown(track, { clientX: 30, clientY: 4 });
    await waitFor(() => expect(thumb.getAttribute('aria-valuenow')).toBe('3'));
    expect(save).not.toHaveBeenCalled();
    fireEvent.mouseMove(document, { clientX: 40, clientY: 4 });
    await waitFor(() => expect(thumb.getAttribute('aria-valuenow')).toBe('4'));
    expect(save).not.toHaveBeenCalled();
    fireEvent.mouseUp(document);
    await waitFor(() => expect(save.mock.calls).toEqual([[4]]));
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(save.mock.calls.at(-1)).toEqual([4.1]);
    fireEvent.keyDown(thumb, { key: 'Home' });
    expect(save.mock.calls.at(-1)).toEqual([0.01]);
    await act(async () => {});
    expect(document.documentElement.hasAttribute('data-mantine-color-scheme')).toBe(false);
  });
  it('renders the advanced vertical value without an editable number and guards readonly inputs', () => {
    const view = render(<Host layout="vertical" />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('slider', { name: '音量' })).toBeTruthy();
    view.unmount();
    const save = vi.fn();
    render(<Host disabled save={save} />);
    const input = screen.getByRole('textbox', { name: '音量数值' });
    expect(input.disabled).toBe(true);
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.blur(input);
    fireEvent.keyDown(screen.getByRole('slider', { name: '音量' }), { key: 'ArrowRight' });
    expect(save).not.toHaveBeenCalled();
  });
});
