import { createRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { registerDialog } from '../../../services/dialog-stack.ts';
import ScriptPromptInput from './ScriptPromptInput.jsx';

const assets = {
  characters: [{ id: 'alice', name: 'Alice', role: 'character' }],
  scenes: [{ id: 'city', name: '城市', role: 'scene' }],
  props: [],
};
function Controlled({ onChange = () => {}, ...props }) {
  const [value, setValue] = useState(props.value ?? '');
  return (
    <ScriptPromptInput
      {...props}
      value={value}
      assets={assets}
      onChange={(text) => {
        setValue(text);
        onChange(text);
      }}
    />
  );
}
function type(input, text, offset = text.length) {
  input.replaceChildren(document.createTextNode(text));
  const range = document.createRange();
  range.setStart(input.firstChild, offset);
  range.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  fireEvent.input(input);
}

describe('ScriptPromptInput lifecycle', () => {
  it('inserts a selected asset at the trigger and publishes immediately with the old suffix', () => {
    const change = vi.fn();
    render(<Controlled onChange={change} ariaLabel="分镜提示词" />);
    const input = screen.getByRole('textbox', { name: '分镜提示词' });
    act(() => input.focus());
    type(input, '@tail', 1);
    fireEvent.mouseDown(screen.getByRole('option', { name: '角色 · Alice' }));
    expect(input.querySelector('[data-asset-id="alice"]')).toBeTruthy();
    expect(change).toHaveBeenLastCalledWith('@Alice tail');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('keeps focused DOM identity despite external text/asset updates and redraws once it loses focus', () => {
    const ref = createRef();
    const blur = vi.fn();
    const { rerender } = render(
      <ScriptPromptInput ref={ref} value="@Alice" assets={assets} onBlur={blur} />,
    );
    const input = screen.getByRole('textbox');
    const chip = input.firstChild;
    act(() => input.focus());
    rerender(
      <ScriptPromptInput
        ref={ref}
        value="external"
        assets={{ ...assets, characters: [{ id: 'alice', name: 'Alicia' }] }}
        onBlur={blur}
      />,
    );
    expect(input.firstChild).toBe(chip);
    expect(ref.current.getValue()).toBe('@Alice');
    fireEvent.blur(input);
    expect(blur).toHaveBeenLastCalledWith('@Alice');
    expect(input.textContent).toBe('external');
  });

  it('defers composition publication, commits its final value, and blocks mutation in readonly mode', () => {
    const change = vi.fn();
    const { rerender } = render(<ScriptPromptInput value="" assets={assets} onChange={change} />);
    const input = screen.getByRole('textbox');
    act(() => input.focus());
    fireEvent.compositionStart(input);
    type(input, '中@');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(change).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    expect(change).toHaveBeenLastCalledWith('中@');
    expect(screen.getByRole('listbox')).toBeTruthy();
    rerender(<ScriptPromptInput value="@Alice" assets={assets} readonly onChange={change} />);
    expect(input.getAttribute('contenteditable')).toBe('false');
    expect(input.getAttribute('data-readonly-selection-enabled')).toBe('true');
    expect(input.textContent).toBe('Alice');
    expect(screen.queryByRole('listbox')).toBeNull();
    change.mockClear();
    fireEvent.input(input);
    fireEvent.paste(input, { clipboardData: { getData: () => 'blocked' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(change).not.toHaveBeenCalled();
    expect(input.textContent).toBe('Alice');
  });

  it('portals inside its dialog and makes Escape dismiss only the mention menu', () => {
    const close = vi.fn();
    const { container } = render(
      <div role="dialog" aria-modal="true" tabIndex={-1}>
        <Controlled />
      </div>,
    );
    const dialog = container.firstChild;
    const unregister = registerDialog(dialog, () => ({ onClose: close }));
    try {
      const input = screen.getByRole('textbox');
      act(() => input.focus());
      type(input, '@');
      expect(dialog.contains(screen.getByRole('listbox'))).toBe(true);
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(close).not.toHaveBeenCalled();
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(close).toHaveBeenCalledOnce();
    } finally {
      unregister();
    }
  });

  it('supports keyboard choices, plain/HTML paste, multiline flush and drops without HTML insertion', () => {
    const ref = createRef();
    const change = vi.fn();
    render(<Controlled onChange={change} />);
    const input = screen.getByRole('textbox');
    act(() => input.focus());
    type(input, '@');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(change).toHaveBeenLastCalledWith('@Alice');
    type(input, '@');
    fireEvent.keyDown(input, { key: '2' });
    expect(change).toHaveBeenLastCalledWith('@城市');
    fireEvent.paste(input, {
      clipboardData: {
        getData: (type) => (type === 'text/html' ? '<b>safe</b><script>bad</script>' : ''),
      },
    });
    expect(input.querySelector('b,script')).toBeNull();
    expect(change).toHaveBeenLastCalledWith('@城市safe');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(change).toHaveBeenLastCalledWith('@城市safe\n');
    fireEvent.drop(input, {
      dataTransfer: { getData: (type) => (type === 'text/plain' ? 'drop' : '') },
    });
    expect(change).toHaveBeenLastCalledWith('@城市safe\ndrop');
    render(<ScriptPromptInput ref={ref} value="last" assets={assets} />);
    expect(ref.current.flush()).toBe('last');
  });

  it('positions above when the source 220px threshold is unavailable and removes menu listeners on unmount', () => {
    const bounds = vi
      .spyOn(Range.prototype, 'getBoundingClientRect')
      .mockReturnValue({ left: 100, top: 700, bottom: 716 });
    const { unmount } = render(<Controlled />);
    const input = screen.getByRole('textbox');
    act(() => input.focus());
    type(input, '@');
    expect(screen.getByRole('listbox').style.bottom).toBe(`${window.innerHeight - 700 + 4}px`);
    unmount();
    fireEvent.keyDown(document, { key: '2' });
    expect(screen.queryByRole('listbox')).toBeNull();
    bounds.mockRestore();
  });

  it('delays image previews by 200ms, closes immediately, falls back on errors and cancels on unmount', () => {
    vi.useFakeTimers();
    try {
      const { rerender, unmount } = render(
        <ScriptPromptInput
          value=""
          assets={{ characters: [{ id: 'alice', name: 'Alice', thumbnailUrl: '/alice.png' }] }}
        />,
      );
      const input = screen.getByRole('textbox');
      act(() => input.focus());
      type(input, '@');
      const icon = screen.getByRole('option').querySelector('.script-prompt-mention-icon');
      fireEvent.mouseEnter(icon);
      act(() => vi.advanceTimersByTime(199));
      expect(screen.queryByTestId('script-prompt-resource-preview')).toBeNull();
      act(() => vi.advanceTimersByTime(1));
      const preview = screen.getByTestId('script-prompt-resource-preview');
      expect(preview.querySelector('img').getAttribute('src')).toBe('/alice.png');
      fireEvent.load(preview.querySelector('img'));
      expect(preview.querySelector('img').style.opacity).toBe('1');
      expect(preview.querySelector('.script-prompt-resource-preview-loading')).toBeNull();
      fireEvent.mouseLeave(icon);
      expect(screen.queryByTestId('script-prompt-resource-preview')).toBeNull();
      fireEvent.error(icon.querySelector('img'));
      expect(icon.querySelector('img').getAttribute('src')).toBe(
        '/assets/icons/asset-character.svg',
      );
      fireEvent.mouseEnter(icon);
      act(() => vi.advanceTimersByTime(200));
      expect(screen.queryByTestId('script-prompt-resource-preview')).toBeNull();
      rerender(
        <ScriptPromptInput
          value=""
          assets={{ characters: [{ id: 'alice', name: 'Alice', thumbnailUrl: '/alice-next.png' }] }}
        />,
      );
      fireEvent.mouseEnter(icon);
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
      act(() => vi.runAllTimers());
      expect(screen.queryByRole('listbox')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows current overview names and role suffixes independently of the candidate role filter', () => {
    const jump = vi.fn();
    render(
      <ScriptPromptInput
        value="城市"
        assets={assets}
        entityRefs={[
          { assetId: 'city', text: '旧城市' },
          { assetId: 'lost', text: '旧道具' },
        ]}
        assetRoleFilter={['character']}
        showEntityRefOverview
        onAssetJump={jump}
      />,
    );
    const button = screen.getByRole('button', { name: '城市场景' });
    expect(button.title).toBe('跳转到资产：城市');
    fireEvent.click(button);
    expect(jump).toHaveBeenLastCalledWith('city');
    expect(screen.getByRole('button', { name: '旧道具' }).disabled).toBe(true);
  });
});
