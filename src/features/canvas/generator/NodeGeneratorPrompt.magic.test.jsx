import { createRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NodeGeneratorPrompt from './NodeGeneratorPrompt.jsx';
import { readPromptDOM, setPromptCaret } from './node-prompt-dom.js';
import { parseNodePrompt, serializeNodePrompt } from './node-prompt-model.js';

const magicList = {
  id: {
    imageUrl: 'https://images.test/a.png',
    suggestions: [{ label: '真实衣服' }, { label: '真实人物' }],
  },
};
const refs = {
  imageList: [{ nodeId: 'img', url: 'https://images.test/ref.png' }],
  videoList: [],
  audioList: [],
  mixedList: [],
};
const initial = '前 {{magic:id:0}} {{Image 1}} 后 {{magic:id:1}} {{magic:unknown:0}}';
const editor = () => screen.getByRole('textbox', { name: '提示词' });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function Controlled({ value = initial, change = () => {}, ...props }) {
  const [prompt, setPrompt] = useState(value);
  return (
    <NodeGeneratorPrompt
      {...props}
      references={refs}
      magicList={magicList}
      value={prompt}
      onChange={(next) => {
        change(next);
        setPrompt(next);
      }}
    />
  );
}

describe('actual contentEditable magic integration', () => {
  it('renders only real labels and round-trips media, duplicates, unknown tokens and spelling losslessly', () => {
    render(<NodeGeneratorPrompt value={initial} magicList={magicList} references={refs} />);
    const prompt = editor();
    expect(prompt.querySelectorAll('[data-magic-id]')).toHaveLength(2);
    expect(prompt.querySelector('[data-magic-label]').textContent).toBe('真实衣服');
    expect(prompt.querySelector('[data-magic-id] img').getAttribute('src')).toBe(
      magicList.id.imageUrl,
    );
    expect(prompt.textContent).toContain('{{magic:unknown:0}}');
    expect(readPromptDOM(prompt)).toBe(initial);
    expect(serializeNodePrompt(parseNodePrompt(initial, refs, { magicList }))).toBe(initial);
    expect(parseNodePrompt(initial, refs).filter((part) => part.kind === 'magic')).toHaveLength(0);
  });

  it('updates all same-ID tokens in one immediate onChange and then syncs the temporary point once', () => {
    const change = vi.fn();
    const sync = vi.fn();
    render(<Controlled change={change} onMagicSuggestionChange={sync} />);
    const originalEditor = editor();
    const originalBadge = originalEditor.querySelector('[data-magic-id]');
    const originalReference = originalEditor.querySelector('[data-mention-type="image"]');
    fireEvent.click(screen.getByRole('button', { name: '元素 真实衣服' }));
    fireEvent.mouseDown(screen.getByRole('menuitemradio', { name: '真实人物' }), { button: 0 });
    const next = initial.replace('{{magic:id:0}}', '{{magic:id:1}}');
    expect(change).toHaveBeenCalledExactlyOnceWith(next);
    expect(sync).toHaveBeenCalledExactlyOnceWith('id', 1);
    expect(change.mock.invocationCallOrder[0]).toBeLessThan(sync.mock.invocationCallOrder[0]);
    expect(editor()).toBe(originalEditor);
    expect(editor().querySelector('[data-magic-id]')).toBe(originalBadge);
    expect(editor().querySelector('[data-mention-type="image"]')).toBe(originalReference);
    expect(
      [...editor().querySelectorAll('[data-magic-id]')].map((badge) => badge.dataset.promptToken),
    ).toEqual(['{{magic:id:1}}', '{{magic:id:1}}']);
    expect(editor().querySelectorAll('[data-mention-type="image"]')).toHaveLength(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens a badge with the keyboard and restores its live updated badge after choosing a suggestion', () => {
    const change = vi.fn();
    render(<Controlled change={change} />);
    const badge = screen.getByRole('button', { name: '元素 真实衣服' });
    badge.focus();
    fireEvent.keyDown(badge, { key: 'ArrowDown' });
    const choice = screen.getByRole('menuitemradio', { name: '真实人物' });
    choice.focus();
    fireEvent.click(choice, { detail: 0 });
    expect(change).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(badge);
    expect(badge.getAttribute('aria-label')).toBe('元素 真实人物');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('keeps readonly labels and rejects old menu actions after session or metadata replacement', () => {
    const change = vi.fn();
    const page = render(
      <NodeGeneratorPrompt
        value={initial}
        references={refs}
        magicList={magicList}
        onChange={change}
        sessionKey="A"
      />,
    );
    const originalEditor = editor();
    fireEvent.click(screen.getByRole('button', { name: '元素 真实衣服' }));
    const oldItem = screen.getByRole('menuitemradio', { name: '真实人物' });
    page.rerender(
      <NodeGeneratorPrompt
        value="新文档 {{magic:id:0}}"
        magicList={magicList}
        onChange={change}
        sessionKey="B"
        readonly
      />,
    );
    expect(editor()).toBe(originalEditor);
    expect(editor().getAttribute('contenteditable')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.mouseDown(oldItem, { button: 0 });
    fireEvent.click(editor().querySelector('[data-magic-id]'));
    expect(change).not.toHaveBeenCalled();
    page.rerender(
      <NodeGeneratorPrompt
        value="新文档 {{magic:id:0}}"
        magicList={{}}
        onChange={change}
        sessionKey="B"
      />,
    );
    expect(editor().querySelector('[data-magic-id]')).toBeNull();
    expect(readPromptDOM(editor())).toBe('新文档 {{magic:id:0}}');
  });

  it('defers metadata redraw during IME without losing draft text or the editor identity', () => {
    vi.useFakeTimers();
    const change = vi.fn();
    const value = '{{magic:id:0}} 初';
    const page = render(
      <NodeGeneratorPrompt
        value={value}
        magicList={magicList}
        onChange={change}
        sessionKey="ime"
      />,
    );
    const prompt = editor();
    prompt.focus();
    fireEvent.compositionStart(prompt);
    prompt.textContent = value + '中文';
    setPromptCaret(prompt, (value + '中文').length);
    fireEvent.input(prompt, { inputType: 'insertCompositionText' });
    const changed = {
      id: { ...magicList.id, suggestions: [{ label: '更新真实衣服' }, { label: '真实人物' }] },
    };
    page.rerender(
      <NodeGeneratorPrompt value={value} magicList={changed} onChange={change} sessionKey="ime" />,
    );
    expect(editor()).toBe(prompt);
    expect(prompt.textContent).toBe(value + '中文');
    expect(change).not.toHaveBeenCalled();
    fireEvent.compositionEnd(prompt);
    expect(prompt.querySelector('[data-magic-label]').textContent).toBe('更新真实衣服');
    expect(readPromptDOM(prompt)).toBe(value + '中文');
    act(() => vi.advanceTimersByTime(149));
    expect(change).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(change).toHaveBeenCalledExactlyOnceWith(value + '中文');
  });

  it('copies the complete original token protocol rather than badge captions or arrows', () => {
    render(<NodeGeneratorPrompt value={initial} magicList={magicList} references={refs} />);
    const prompt = editor();
    const range = document.createRange();
    range.selectNodeContents(prompt);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    const setData = vi.fn();
    fireEvent.copy(prompt, { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledExactlyOnceWith('text/plain', initial);
  });

  it('retains native atomic Backspace and local undo, without adding a point-delete button or swallowing adjacent spaces', () => {
    const change = vi.fn();
    const value = 'A {{magic:id:0}} B';
    render(<Controlled value={value} change={change} />);
    const prompt = editor();
    prompt.focus();
    setPromptCaret(prompt, 'A {{magic:id:0}}'.length);
    fireEvent(
      prompt,
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'deleteContentBackward',
      }),
    );
    expect(change).toHaveBeenCalledExactlyOnceWith('A  B');
    expect(readPromptDOM(prompt)).toBe('A  B');
    expect(screen.queryByRole('button', { name: /删除/ })).toBeNull();
    fireEvent.keyDown(prompt, { key: 'z', ctrlKey: true });
    expect(readPromptDOM(prompt)).toBe(value);
    expect(prompt.querySelector('[data-magic-id]')).toBeTruthy();
  });

  it('captures valid selection offset zero and later changes through one existing listener, but not outside focus or after unmount', () => {
    const offset = vi.fn();
    const ref = createRef();
    const page = render(
      <NodeGeneratorPrompt
        ref={ref}
        value={initial}
        magicList={magicList}
        onSelectionOffset={offset}
      />,
    );
    const prompt = editor();
    prompt.focus();
    setPromptCaret(prompt, 0);
    fireEvent(document, new Event('selectionchange'));
    expect(ref.current.getSelectionOffset()).toBe(0);
    expect(offset).toHaveBeenLastCalledWith(0);
    setPromptCaret(prompt, initial.length);
    fireEvent(document, new Event('selectionchange'));
    expect(offset).toHaveBeenLastCalledWith(initial.length);
    const count = offset.mock.calls.length;
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    fireEvent(document, new Event('selectionchange'));
    expect(offset).toHaveBeenCalledTimes(count);
    expect(ref.current.getSelectionOffset()).toBe(initial.length);
    page.unmount();
    fireEvent(document, new Event('selectionchange'));
    expect(offset).toHaveBeenCalledTimes(count);
    outside.remove();
  });

  it('uses fresh selection callbacks after a same-editor session change and suppresses IME cursor notifications', () => {
    const first = vi.fn();
    const next = vi.fn();
    const page = render(
      <NodeGeneratorPrompt value="旧文档" sessionKey="A" onSelectionOffset={first} />,
    );
    const prompt = editor();
    prompt.focus();
    setPromptCaret(prompt, 0);
    fireEvent(document, new Event('selectionchange'));
    expect(first).toHaveBeenCalledExactlyOnceWith(0);
    page.rerender(
      <NodeGeneratorPrompt value="新文档内容" sessionKey="B" onSelectionOffset={next} />,
    );
    setPromptCaret(prompt, 2);
    fireEvent(document, new Event('selectionchange'));
    expect(next).toHaveBeenLastCalledWith(2);
    expect(first).toHaveBeenCalledOnce();
    const count = next.mock.calls.length;
    fireEvent.compositionStart(prompt);
    setPromptCaret(prompt, 1);
    fireEvent(document, new Event('selectionchange'));
    expect(next).toHaveBeenCalledTimes(count);
  });
});
