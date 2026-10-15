import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NodeGeneratorPrompt from './NodeGeneratorPrompt.jsx';
import { NODE_PROMPT_REFERENCE_MIME } from './node-prompt-model.js';
import { selectionOffsets } from './node-prompt-dom.js';

const references = { mixedList: [{ nodeId: 'i-a', mediaType: 'image', url: '/a.webp' }] };
const editor = () => screen.getByRole('textbox', { name: '提示词' });
function caretAtEnd(element) {
  element.focus();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}
function typeText(text) {
  editor().textContent = text;
  caretAtEnd(editor());
  fireEvent.input(editor(), { inputType: 'insertText' });
}
function beforeInput(inputType) {
  const event = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
  act(() => editor().dispatchEvent(event));
  return event;
}
afterEach(() => vi.useRealTimers());

describe('node generator DOM prompt', () => {
  it('renders readonly source Mixed badges and copies their stored tokens rather than the visible media label', () => {
    const ref = createRef();
    const onChange = vi.fn();
    render(
      <NodeGeneratorPrompt
        ref={ref}
        readonly
        value="前{{Mixed 1}}后{{Mixed 9}}"
        references={references}
        onChange={onChange}
      />,
    );
    const node = editor();
    expect(node.getAttribute('contenteditable')).toBe('false');
    expect(node.getAttribute('data-readonly-allow')).toBe('true');
    expect(node.tabIndex).toBe(-1);
    expect(node.querySelector('[data-mention-node-id="i-a"]').textContent).toBe('图片1');
    expect(node.querySelector('[data-mention-missing="true"]').dataset.mentionNodeId).toBe('');
    const range = document.createRange();
    range.selectNodeContents(node);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    const setData = vi.fn();
    fireEvent.copy(node, { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith('text/plain', '前{{Mixed 1}}后{{Mixed 9}}');
    act(() => {
      expect(ref.current.flush()).toBe('前{{Mixed 1}}后{{Mixed 9}}');
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('debounces text by 150ms, records blur without forcing save and flush always returns current serialized text', () => {
    vi.useFakeTimers();
    const ref = createRef();
    const onChange = vi.fn();
    const boundary = vi.fn();
    render(<NodeGeneratorPrompt ref={ref} onChange={onChange} onHistoryBoundary={boundary} />);
    typeText('新提示词');
    fireEvent.blur(editor());
    expect(boundary).toHaveBeenCalledWith('blur', '新提示词');
    act(() => vi.advanceTimersByTime(149));
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('新提示词');
    act(() => expect(ref.current.flush()).toBe('新提示词'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('holds IME composition and does not submit Enter; native linebreak preserves multiline prompt', () => {
    vi.useFakeTimers();
    const ref = createRef();
    const onChange = vi.fn();
    render(<NodeGeneratorPrompt ref={ref} onChange={onChange} />);
    fireEvent.compositionStart(editor());
    typeText('中文');
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(editor(), { key: 'Enter', isComposing: true });
    fireEvent.compositionEnd(editor());
    act(() => vi.advanceTimersByTime(150));
    expect(onChange).toHaveBeenLastCalledWith('中文');
    caretAtEnd(editor());
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(beforeInput('insertParagraph').defaultPrevented).toBe(true);
    expect(ref.current.flush()).toBe('中文\n');
    expect(editor().querySelectorAll('br')).toHaveLength(2);
  });

  it('keeps caret and current draft when reference props change, then accepts a true external value replacement', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const ref = createRef();
    const { rerender } = render(
      <NodeGeneratorPrompt ref={ref} value="原" onChange={onChange} references={references} />,
    );
    typeText('尚未保存');
    rerender(
      <NodeGeneratorPrompt
        ref={ref}
        value="原"
        onChange={onChange}
        references={{ ...references }}
      />,
    );
    expect(ref.current.flush()).toBe('尚未保存');
    expect(document.activeElement).toBe(editor());
    expect(selectionOffsets(editor())).toEqual({ start: 4, end: 4 });
    typeText('旧pending');
    rerender(
      <NodeGeneratorPrompt
        ref={ref}
        value="服务器替换"
        onChange={onChange}
        references={references}
      />,
    );
    act(() => vi.advanceTimersByTime(150));
    expect(ref.current.flush()).toBe('服务器替换');
    expect(onChange).not.toHaveBeenCalledWith('旧pending');
  });

  it('cancels stale edits on session switch, readonly changes and unmount while using latest callback in the same session', () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const ref = createRef();
    const { rerender, unmount } = render(
      <NodeGeneratorPrompt ref={ref} sessionKey="a" onChange={first} />,
    );
    typeText('A');
    rerender(<NodeGeneratorPrompt ref={ref} sessionKey="a" onChange={second} />);
    act(() => vi.advanceTimersByTime(150));
    expect(second).toHaveBeenCalledWith('A');
    expect(first).not.toHaveBeenCalled();
    typeText('旧节点');
    rerender(<NodeGeneratorPrompt ref={ref} sessionKey="b" value="B" onChange={second} />);
    act(() => vi.advanceTimersByTime(150));
    expect(second).not.toHaveBeenCalledWith('旧节点');
    typeText('只读前');
    rerender(<NodeGeneratorPrompt ref={ref} sessionKey="b" value="B" readonly onChange={second} />);
    act(() => vi.advanceTimersByTime(150));
    expect(second).not.toHaveBeenCalledWith('只读前');
    rerender(<NodeGeneratorPrompt ref={ref} sessionKey="b" value="B" onChange={second} />);
    typeText('卸载前');
    const handle = ref.current;
    unmount();
    act(() => vi.advanceTimersByTime(150));
    expect(handle.flush()).toBe('卸载前');
    expect(second).not.toHaveBeenCalledWith('卸载前');
  });

  it('opens source @ options without preselection and inserts the selected current reference token, preserving focus', () => {
    const ref = createRef();
    const onChange = vi.fn();
    render(
      <NodeGeneratorPrompt
        ref={ref}
        onChange={onChange}
        references={references}
        mentionListType="mixed"
      />,
    );
    typeText('描述＠');
    expect(screen.getByRole('option').getAttribute('aria-selected')).toBe('false');
    fireEvent.keyDown(editor(), { key: 'ArrowDown' });
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(ref.current.flush()).toBe('描述{{Mixed 1}}');
    expect(onChange).toHaveBeenLastCalledWith('描述{{Mixed 1}}');
    expect(document.activeElement).toBe(editor());
  });

  it('drops current zero-based reference payload and deletes the entire badge as one atom with undo/redo', () => {
    const ref = createRef();
    const onChange = vi.fn();
    render(
      <NodeGeneratorPrompt ref={ref} value="前" onChange={onChange} references={references} />,
    );
    caretAtEnd(editor());
    fireEvent.drop(editor(), {
      dataTransfer: {
        types: [NODE_PROMPT_REFERENCE_MIME],
        getData: () => '{"listType":"mixed","index":0}',
        files: [],
      },
    });
    expect(ref.current.flush()).toBe('前{{Mixed 1}}');
    caretAtEnd(editor());
    expect(beforeInput('deleteContentBackward').defaultPrevented).toBe(true);
    expect(ref.current.flush()).toBe('前');
    fireEvent.keyDown(editor(), { key: 'z', ctrlKey: true });
    expect(ref.current.flush()).toBe('前{{Mixed 1}}');
    fireEvent.keyDown(editor(), { key: 'z', ctrlKey: true, shiftKey: true });
    expect(ref.current.flush()).toBe('前');
  });

  it('preserves plain pasted special tokens and never interprets HTML as executable markup', () => {
    const ref = createRef();
    const onChange = vi.fn();
    render(<NodeGeneratorPrompt ref={ref} onChange={onChange} />);
    caretAtEnd(editor());
    fireEvent.paste(editor(), {
      clipboardData: { getData: () => '<img onerror="bad()">\r\n{{SlashPreset:x}}' },
    });
    expect(ref.current.flush()).toBe('<img onerror="bad()">\n{{SlashPreset:x}}');
    expect(editor().querySelector('img')).toBeNull();
  });

  it('retains a video badge during ordinary typing and releases its media on reference replacement and unmount', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const videoReferences = { videoList: [{ nodeId: 'v-a', url: '/a.mp4' }] };
    const onChange = vi.fn();
    const page = render(
      <NodeGeneratorPrompt value="{{Video 1}}" references={videoReferences} onChange={onChange} />,
    );
    const originalVideo = editor().querySelector('video');
    editor().appendChild(document.createTextNode('继续'));
    caretAtEnd(editor());
    fireEvent.input(editor(), { inputType: 'insertText' });
    expect(editor().querySelector('video')).toBe(originalVideo);
    expect(pause).not.toHaveBeenCalled();
    page.rerender(
      <NodeGeneratorPrompt
        value="{{Video 1}}继续"
        references={videoReferences}
        onChange={onChange}
      />,
    );
    expect(editor().querySelector('video')).toBe(originalVideo);
    expect(pause).not.toHaveBeenCalled();
    page.rerender(
      <NodeGeneratorPrompt
        value="{{Video 1}}继续"
        references={{ videoList: [{ nodeId: 'v-a', url: '/b.mp4' }] }}
        onChange={onChange}
      />,
    );
    expect(originalVideo.hasAttribute('src')).toBe(false);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    const replacement = editor().querySelector('video');
    expect(replacement.getAttribute('src')).toBe('/b.mp4');
    page.unmount();
    expect(replacement.hasAttribute('src')).toBe(false);
    expect(pause).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();
  });
});
