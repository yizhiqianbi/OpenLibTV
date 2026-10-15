import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NodeGeneratorPrompt from './NodeGeneratorPrompt.jsx';
import { readPromptDOM } from './node-prompt-dom.js';

afterEach(() => vi.useRealTimers());
describe('a committed graph prompt replaces the matching local debounce without another writer', () => {
  it('adopts an unchanged raw baseline, cancels its old timer and resets local undo', () => {
    vi.useFakeTimers();
    const ref = createRef(),
      onChange = vi.fn();
    const page = render(
      <NodeGeneratorPrompt
        ref={ref}
        value="A"
        onChange={onChange}
        references={{ imageList: [] }}
        sessionKey="doc:node"
      />,
    );
    const editor = screen.getByRole('textbox');
    editor.focus();
    editor.textContent = 'B';
    fireEvent.input(editor);
    expect(ref.current.getValue()).toBe('B');
    expect(onChange).not.toHaveBeenCalled();
    act(() => expect(ref.current.acceptCommittedValue('A')).toBe(true));
    expect(readPromptDOM(editor)).toBe('A');
    page.rerender(
      <NodeGeneratorPrompt
        ref={ref}
        value="A"
        onChange={onChange}
        references={{ imageList: [] }}
        sessionKey="doc:node"
      />,
    );
    act(() => vi.advanceTimersByTime(200));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true });
    expect(ref.current.getValue()).toBe('A');
    expect(readPromptDOM(editor)).toBe('A');
    page.unmount();
    expect(onChange).not.toHaveBeenCalled();
  });
  it('keeps a committed value when reference props change before the next input event', () => {
    const ref = createRef(),
      onChange = vi.fn();
    const first = { nodeId: 'image', url: '/first.png' },
      second = { nodeId: 'role', url: '/role.png' };
    const page = render(
      <NodeGeneratorPrompt
        ref={ref}
        value="{{Image 1}}"
        onChange={onChange}
        references={{ imageList: [first, second] }}
        sessionKey="doc:node"
      />,
    );
    act(() => expect(ref.current.acceptCommittedValue('{{Image 1}}')).toBe(true));
    page.rerender(
      <NodeGeneratorPrompt
        ref={ref}
        value="{{Image 1}}"
        onChange={onChange}
        references={{ imageList: [first] }}
        sessionKey="doc:node"
      />,
    );
    expect(readPromptDOM(screen.getByRole('textbox'))).toBe('{{Image 1}}');
    expect(onChange).not.toHaveBeenCalled();
  });
  it('does not expose this write-through acceptance action on a readonly input', () => {
    const ref = createRef(),
      onChange = vi.fn();
    render(
      <NodeGeneratorPrompt
        ref={ref}
        value="A"
        onChange={onChange}
        readonly
        references={{ imageList: [] }}
        sessionKey="doc:node"
      />,
    );
    act(() => expect(ref.current.acceptCommittedValue('B')).toBe(false));
    expect(ref.current.getValue()).toBe('A');
    expect(onChange).not.toHaveBeenCalled();
  });
});
