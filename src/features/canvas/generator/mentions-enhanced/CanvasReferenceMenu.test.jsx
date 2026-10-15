import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CanvasReferenceMenu from './CanvasReferenceMenu.jsx';
import NodeGeneratorPrompt from '../NodeGeneratorPrompt.jsx';

const candidate = (id, kind = 'image', extra = {}) => ({
  nodeId: id,
  label: id,
  kind,
  connected: false,
  ...extra,
});
const source = (candidates) => ({ load: vi.fn(async () => candidates) });
const position = { left: 50, top: 100 };
function typePrompt(text) {
  const editor = screen.getByRole('textbox', { name: '提示词' });
  editor.textContent = text;
  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  fireEvent.input(editor, { inputType: 'insertText' });
  return editor;
}
afterEach(() => vi.useRealTimers());

describe('whole-canvas reference menu extension', () => {
  it('autofocuses search, displays first12 connected/More and source type submenus; search excludes unsupported keyboard options', async () => {
    const references = [
      ...Array.from({ length: 14 }, (_, index) =>
        candidate(`引用${index}`, 'image', { connected: true }),
      ),
      candidate('山 video', 'video', { disabledReason: 'limit' }),
      candidate('山 IMAGE'),
      candidate('山 text', 'text'),
    ];
    const onSelect = vi.fn();
    render(
      <CanvasReferenceMenu
        id="menu"
        source={source(references)}
        position={position}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );
    await screen.findByRole('option', { name: '引用0' });
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '搜索引用素材' }));
    expect(screen.getAllByRole('option')).toHaveLength(12);
    fireEvent.click(screen.getByRole('button', { name: '更多' }));
    expect(screen.getAllByRole('option')).toHaveLength(14);
    fireEvent.mouseEnter(screen.getByRole('button', { name: '视频' }));
    expect(
      within(document.querySelector('[data-reference-submenu-panel]')).getByRole('option', {
        name: '山 video',
      }).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: '搜索引用素材' }), {
      target: { value: ' 山 ' },
    });
    expect(document.querySelector('[data-reference-submenu-panel]')).toBeNull();
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '山 IMAGE',
      '山 video',
      '山 text',
    ]);
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ nodeId: '山 IMAGE' }));
    fireEvent.keyDown(document.activeElement, { key: '1' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
  it('retries source failure and cancels stale loads across document changes/unmount', async () => {
    let resolveOld;
    const old = {
      load: vi.fn(
        ({ signal }) =>
          new Promise((resolve) => {
            resolveOld = resolve;
            old.signal = signal;
          }),
      ),
    };
    const fresh = {
      load: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue([candidate('新文档')]),
    };
    const { rerender, unmount } = render(
      <CanvasReferenceMenu
        id="menu"
        source={old}
        sessionKey="old"
        position={position}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(old.load).toHaveBeenCalledTimes(1));
    rerender(
      <CanvasReferenceMenu
        id="menu"
        source={fresh}
        sessionKey="new"
        position={position}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await screen.findByRole('alert');
    expect(old.signal.aborted).toBe(true);
    act(() => resolveOld([candidate('旧文档', 'image', { connected: true })]));
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(fresh.load).toHaveBeenCalledTimes(2));
    fireEvent.mouseEnter(screen.getByRole('button', { name: '图片' }));
    expect(await screen.findByRole('option', { name: '新文档' })).toBeTruthy();
    expect(screen.queryByText('旧文档')).toBeNull();
    unmount();
  });
  it('restores editor caret on Escape, inserts a freshly resolved connected token with source spaces and connects text without manufacturing token', async () => {
    const ref = createRef();
    const connect = vi.fn(() => true);
    const getLatestReference = vi.fn(() => ({ nodeId: 'new', token: '{{Mixed 2}}' }));
    const onChange = vi.fn();
    const config = {
      targetNodeId: 'target',
      source: source([candidate('new'), candidate('text', 'text')]),
      connect,
      getLatestReference,
    };
    render(<NodeGeneratorPrompt ref={ref} onChange={onChange} canvasMentions={config} />);
    const editor = typePrompt('描述@');
    await waitFor(() => expect(config.source.load).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(screen.getByRole('textbox', { name: '搜索引用素材' }), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(editor);
    expect(ref.current.getValue()).toBe('描述@');
    typePrompt('描述＠');
    await screen.findByRole('button', { name: '图片' });
    fireEvent.mouseEnter(screen.getByRole('button', { name: '图片' }));
    fireEvent.click(await screen.findByRole('option', { name: 'new' }));
    expect(connect).toHaveBeenCalledWith('new', 'target');
    expect(getLatestReference).toHaveBeenCalledWith('new');
    expect(ref.current.getValue()).toBe('描述 {{Mixed 2}} ');
    expect(onChange).toHaveBeenLastCalledWith('描述 {{Mixed 2}} ');
    typePrompt('连接文本@');
    await screen.findByRole('button', { name: '文本' });
    fireEvent.mouseEnter(screen.getByRole('button', { name: '文本' }));
    fireEvent.click(await screen.findByRole('option', { name: 'text' }));
    expect(ref.current.getValue()).toBe('连接文本');
    expect(getLatestReference).toHaveBeenCalledTimes(1);
  });
  it('preserves @ and menu on failed connection, rejects disabled selection and never loads candidates when readonly', async () => {
    const ref = createRef();
    const onConnectFailed = vi.fn();
    const config = {
      targetNodeId: 'target',
      source: source([
        candidate('fail'),
        candidate('blocked', 'image', { disabledReason: 'modelUnsupported' }),
      ]),
      connect: () => false,
      getLatestReference: vi.fn(),
      onConnectFailed,
    };
    const { rerender } = render(<NodeGeneratorPrompt ref={ref} canvasMentions={config} />);
    typePrompt('@');
    await screen.findByRole('button', { name: '图片' });
    fireEvent.focus(screen.getByRole('button', { name: '图片' }));
    fireEvent.click(await screen.findByRole('option', { name: 'fail' }));
    expect(onConnectFailed).toHaveBeenCalledTimes(1);
    expect(ref.current.getValue()).toBe('@');
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: 'blocked' }));
    expect(config.getLatestReference).not.toHaveBeenCalled();
    rerender(<NodeGeneratorPrompt ref={ref} canvasMentions={config} readonly />);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.input(screen.getByRole('textbox', { name: '提示词' }));
    expect(config.source.load).toHaveBeenCalledTimes(1);
  });
  it('virtualizes source lists above50, permits keyboard selection beyond the visible rows and disposes preview video', async () => {
    const references = Array.from({ length: 60 }, (_, index) =>
      candidate(`视频${index}`, 'video', { previewUrl: '/sample.mp4', previewMedia: 'video' }),
    );
    const { unmount } = render(
      <CanvasReferenceMenu
        id="menu"
        source={source(references)}
        position={position}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await screen.findByRole('button', { name: '视频' });
    fireEvent.focus(screen.getByRole('button', { name: '视频' }));
    expect(screen.getAllByRole('option').length).toBeLessThan(60);
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: '视频0' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    for (let index = 0; index < 44; index += 1)
      fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: '视频44' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.useFakeTimers();
    fireEvent.mouseEnter(
      screen.getByRole('option', { name: '视频44' }).querySelector('.node-reference-thumbnail'),
    );
    act(() => vi.advanceTimersByTime(200));
    expect(document.querySelector('.node-reference-preview video')).toBeTruthy();
    unmount();
    expect(play).toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
  });
});
