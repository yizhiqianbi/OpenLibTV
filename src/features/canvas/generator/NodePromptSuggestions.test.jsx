import { createRef, useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NodeGeneratorPrompt from './NodeGeneratorPrompt.jsx';
import PromptMentionToggle from './PromptMentionToggle.jsx';
import { readPromptDOM, selectionOffsets, setPromptCaret } from './node-prompt-dom.js';
import { writeStoredString } from '../../../services/storage.ts';
import { PROMPT_MENTION_KEY } from '../../../services/prompt-mention-preference.ts';
import { useDialogBehavior } from '../../../hooks/useDialogBehavior.js';

const references = {
  imageList: [
    { nodeId: 'fox', label: '红狐-全身.png', url: '/fox.png' },
    { nodeId: 'forest', label: '森林', url: '/forest.png' },
  ],
};
const editor = () => screen.getByRole('textbox', { name: '提示词' });
const ghosts = () => editor().querySelectorAll('[data-mention-suggest]');
function type(text) {
  editor().focus();
  editor().textContent = text;
  setPromptCaret(editor(), text.length);
  fireEvent.input(editor(), { inputType: 'insertText' });
}
function paste(text) {
  editor().focus();
  setPromptCaret(editor(), readPromptDOM(editor()).length);
  fireEvent.paste(editor(), { clipboardData: { getData: () => text } });
  act(() => vi.advanceTimersByTime(0));
}
function Wrapper({ onChange }) {
  const [value, setValue] = useState('');
  return (
    <NodeGeneratorPrompt
      suggestionAvailable
      references={{ ...references }}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}
function FirstFieldDialog({ onClose }) {
  const ref = useRef(null);
  useDialogBehavior(ref, { onClose });
  return (
    <div ref={ref} role="dialog" tabIndex={-1}>
      <NodeGeneratorPrompt suggestionAvailable references={references} />
      <button>退出输入框</button>
    </div>
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  writeStoredString(PROMPT_MENTION_KEY, '1');
});
afterEach(() => vi.useRealTimers());

describe('automatic ghost references in actual DOM prompt', () => {
  it('waits 200ms, excludes suggestions from serialized value/copy, accepts by Tab and undoes once', () => {
    const onChange = vi.fn();
    render(<NodeGeneratorPrompt suggestionAvailable references={references} onChange={onChange} />);
    type('红狐');
    act(() => vi.advanceTimersByTime(199));
    expect(ghosts()).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1));
    expect(ghosts()).toHaveLength(1);
    expect(readPromptDOM(editor())).toBe('红狐');
    expect(selectionOffsets(editor())).toEqual({ start: 2, end: 2 });
    const range = document.createRange();
    range.selectNodeContents(editor());
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    const setData = vi.fn();
    fireEvent.copy(editor(), { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith('text/plain', '红狐');
    setPromptCaret(editor(), 2);
    fireEvent.keyDown(editor(), { key: 'Tab' });
    expect(readPromptDOM(editor())).toBe('红狐 {{Image 1}} ');
    expect(document.activeElement).toBe(editor());
    expect(onChange).toHaveBeenLastCalledWith('红狐 {{Image 1}} ');
    fireEvent.keyDown(editor(), { key: 'z', ctrlKey: true });
    expect(readPromptDOM(editor())).toBe('红狐');
    fireEvent.keyDown(editor(), { key: 'z', ctrlKey: true, shiftKey: true });
    expect(readPromptDOM(editor())).toBe('红狐 {{Image 1}} ');
  });
  it('replaces ordinal prose on click and preserves surrounding words with source spacing', () => {
    render(<NodeGeneratorPrompt suggestionAvailable references={references} />);
    paste('使用第二张图片作为背景');
    expect(ghosts()).toHaveLength(1);
    fireEvent.mouseDown(ghosts()[0]);
    fireEvent.click(ghosts()[0]);
    expect(readPromptDOM(editor())).toBe('使用 {{Image 2}} 作为背景');
    expect(selectionOffsets(editor()).start).toBe('使用 {{Image 2}} '.length);
  });
  it('accepts a pasted batch in one change/undo and only matches the inserted region', () => {
    const onChange = vi.fn();
    render(<Wrapper onChange={onChange} />);
    type('森林 ');
    paste('红狐与图片2');
    expect(ghosts()).toHaveLength(2);
    const changes = onChange.mock.calls.length;
    fireEvent.keyDown(editor(), { key: 'Tab', shiftKey: true });
    expect(readPromptDOM(editor())).toBe('森林 红狐 {{Image 1}} 与 {{Image 2}} ');
    expect(onChange.mock.calls.length).toBe(changes + 1);
    expect(ghosts()).toHaveLength(0);
    fireEvent.keyDown(editor(), { key: 'z', metaKey: true });
    expect(readPromptDOM(editor())).toBe('森林 红狐与图片2');
  });
  it('advances Tab to the next remaining batch ghost through controlled parent rerenders', () => {
    render(<Wrapper onChange={() => {}} />);
    paste('红狐与森林');
    fireEvent.keyDown(editor(), { key: 'Tab' });
    expect(readPromptDOM(editor())).toBe('红狐 {{Image 1}} 与森林');
    expect(ghosts()).toHaveLength(1);
    expect(ghosts()[0].classList.contains('is-active')).toBe(true);
    fireEvent.keyDown(editor(), { key: 'Tab' });
    expect(readPromptDOM(editor())).toBe('红狐 {{Image 1}} 与森林 {{Image 2}} ');
  });
  it('rejects with Escape until context changes, and hover tips work after the first automatic tip', () => {
    render(<NodeGeneratorPrompt suggestionAvailable references={references} />);
    type('夜里红狐');
    act(() => vi.advanceTimersByTime(200));
    fireEvent.keyDown(editor(), { key: 'Escape' });
    expect(ghosts()).toHaveLength(0);
    type('夜里红狐');
    act(() => vi.advanceTimersByTime(200));
    expect(ghosts()).toHaveLength(0);
    type('白天红狐');
    act(() => vi.advanceTimersByTime(200));
    expect(ghosts()).toHaveLength(1);
    fireEvent.pointerOver(ghosts()[0]);
    expect(screen.getByRole('tooltip').textContent).toBe('点击 或 按Tab键插入');
    fireEvent.pointerLeave(editor());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
  it('cancels IME, blur, readiness, reference removal, external values and session transitions', () => {
    const ref = createRef();
    const props = { ref, suggestionAvailable: true, references, value: '', sessionKey: 'a' };
    const page = render(<NodeGeneratorPrompt {...props} />);
    type('红狐');
    fireEvent.compositionStart(editor());
    act(() => vi.advanceTimersByTime(200));
    expect(ghosts()).toHaveLength(0);
    fireEvent.compositionEnd(editor());
    act(() => vi.advanceTimersByTime(200));
    expect(ghosts()).toHaveLength(1);
    fireEvent.blur(editor());
    expect(ghosts()).toHaveLength(0);
    type('红狐');
    page.rerender(<NodeGeneratorPrompt {...props} disabled />);
    act(() => vi.advanceTimersByTime(200));
    expect(ghosts()).toHaveLength(0);
    page.rerender(<NodeGeneratorPrompt {...props} />);
    type('红狐');
    act(() => vi.advanceTimersByTime(200));
    page.rerender(<NodeGeneratorPrompt {...props} references={{ imageList: [] }} />);
    expect(ghosts()).toHaveLength(0);
    page.rerender(<NodeGeneratorPrompt {...props} />);
    type('红狐');
    page.rerender(<NodeGeneratorPrompt {...props} value="外部新内容" sessionKey="b" />);
    act(() => vi.advanceTimersByTime(200));
    expect(readPromptDOM(editor())).toBe('外部新内容');
    expect(ghosts()).toHaveLength(0);
    const handle = ref.current;
    page.unmount();
    act(() => vi.advanceTimersByTime(200));
    expect(handle.getValue()).toBe('外部新内容');
  });
  it('persists preference changes across prompts and leaves explicit @ available when AutoLink is off', () => {
    render(
      <>
        <PromptMentionToggle />
        <NodeGeneratorPrompt suggestionAvailable references={references} />
      </>,
    );
    type('红狐');
    act(() => vi.advanceTimersByTime(200));
    expect(ghosts()).toHaveLength(1);
    fireEvent.click(screen.getByRole('switch', { name: '智能引用 AutoLink' }));
    expect(localStorage.getItem(PROMPT_MENTION_KEY)).toBe('0');
    expect(ghosts()).toHaveLength(0);
    type('森林');
    act(() => vi.advanceTimersByTime(200));
    expect(ghosts()).toHaveLength(0);
    type('@');
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });
  it.each(['disabled', 'readonly'])(
    'resumes ordinary input and suggestions after %s interrupts composition in the same session',
    (blockedProp) => {
      const onChange = vi.fn();
      const props = { suggestionAvailable: true, references, onChange, sessionKey: 'same' };
      const page = render(<NodeGeneratorPrompt {...props} />);
      editor().focus();
      fireEvent.compositionStart(editor());
      type('红狐');
      page.rerender(<NodeGeneratorPrompt {...props} {...{ [blockedProp]: true }} />);
      fireEvent.compositionEnd(editor());
      act(() => vi.advanceTimersByTime(200));
      expect(onChange).not.toHaveBeenCalled();
      expect(ghosts()).toHaveLength(0);
      page.rerender(<NodeGeneratorPrompt {...props} />);
      type('森林');
      act(() => vi.advanceTimersByTime(200));
      expect(onChange).toHaveBeenLastCalledWith('森林');
      expect(ghosts()).toHaveLength(1);
      fireEvent.keyDown(editor(), { key: 'Tab' });
      expect(readPromptDOM(editor())).toBe('森林 {{Image 2}} ');
      expect(onChange).toHaveBeenLastCalledWith('森林 {{Image 2}} ');
    },
  );
  it('gives batch Shift-Tab and Escape to suggestions before an enclosing dialog focus/close handler', () => {
    const onClose = vi.fn();
    render(<FirstFieldDialog onClose={onClose} />);
    paste('红狐与森林');
    fireEvent.keyDown(editor(), { key: 'Tab', shiftKey: true });
    expect(readPromptDOM(editor())).toBe('红狐 {{Image 1}} 与森林 {{Image 2}} ');
    expect(document.activeElement).toBe(editor());
    type('森林');
    act(() => vi.advanceTimersByTime(200));
    fireEvent.keyDown(editor(), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(ghosts()).toHaveLength(0);
    fireEvent.keyDown(editor(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('consumes an ordinal split across ordinary DOM text nodes without consuming adjacent prose', () => {
    render(<NodeGeneratorPrompt suggestionAvailable references={references} />);
    editor().append(document.createTextNode('使用图'), document.createTextNode('1'));
    editor().focus();
    setPromptCaret(editor(), 4);
    fireEvent.input(editor(), { inputType: 'insertText' });
    act(() => vi.advanceTimersByTime(200));
    expect(ghosts()).toHaveLength(1);
    fireEvent.keyDown(editor(), { key: 'Tab' });
    expect(readPromptDOM(editor())).toBe('使用 {{Image 1}} ');
  });
  it('preserves an adjacent earlier ghost when consuming a later ordinal in the same pasted batch', () => {
    const onChange = vi.fn();
    render(<NodeGeneratorPrompt suggestionAvailable references={references} onChange={onChange} />);
    paste('图片1图片2');
    expect(ghosts()).toHaveLength(2);
    fireEvent.keyDown(editor(), { key: 'Tab', shiftKey: true });
    expect(readPromptDOM(editor())).toBe('{{Image 1}} {{Image 2}} ');
    expect(editor().querySelectorAll('[data-prompt-token]')).toHaveLength(2);
    fireEvent.keyDown(editor(), { key: 'z', ctrlKey: true });
    expect(readPromptDOM(editor())).toBe('图片1图片2');
  });
  it('releases only the ghost video when rejected and preserves real video badges until unmount', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const media = { videoList: [{ nodeId: 'clip', label: '奔跑', url: '/clip.mp4' }] };
    const page = render(
      <NodeGeneratorPrompt suggestionAvailable references={media} value="{{Video 1}}" />,
    );
    const originalVideo = editor().querySelector('video');
    editor().append(document.createTextNode('奔跑'));
    editor().focus();
    setPromptCaret(editor(), readPromptDOM(editor()).length);
    fireEvent.input(editor(), { inputType: 'insertText' });
    act(() => vi.advanceTimersByTime(200));
    const ghostVideo = ghosts()[0].querySelector('video');
    fireEvent.keyDown(editor(), { key: 'Escape' });
    expect(ghostVideo.hasAttribute('src')).toBe(false);
    expect(originalVideo.hasAttribute('src')).toBe(true);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    page.unmount();
    expect(originalVideo.hasAttribute('src')).toBe(false);
    expect(pause).toHaveBeenCalledTimes(2);
  });
});
