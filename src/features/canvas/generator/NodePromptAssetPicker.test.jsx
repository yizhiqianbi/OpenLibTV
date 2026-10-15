import { createRef } from 'react';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NodeGeneratorPrompt from './NodeGeneratorPrompt.jsx';
import { useNodePromptAssetPicker } from './useNodePromptAssetPicker.js';
import { readPromptDOM, selectionOffsets, setPromptCaret } from './node-prompt-dom.js';

vi.mock('../../../services/api-client.ts', () => ({ serverConnected: false, api: {} }));

const image = { id: 'image', name: '真实图片', type: 'image', url: '/media/image.png' };
const audio = { id: 'audio', name: '真实音频', type: 'audio', url: '/media/audio.mp3' };
const text = { id: 'text', name: '节点不支持的文本', type: 'text', content: '代表性真实正文' };
const imported = {
  options: [
    { nodeId: 'imported-image', token: '{{Mixed 4}}' },
    { nodeId: 'imported-audio', token: '{{Mixed 7}}' },
  ],
};
const editor = () => screen.getByRole('textbox', { name: '提示词' });
const pickerDialog = () => screen.getByRole('dialog', { name: '引用资产' });
const submitButton = () => pickerDialog().querySelector('.sk-asset-picker-footer .white-button');
function configuration(importAssets = vi.fn(() => imported)) {
  return {
    targetNodeId: 'target',
    source: { load: vi.fn(async () => []) },
    assetSource: {
      list: vi.fn(async () => ({ items: [image, audio, text], total: 3, hasMore: false })),
    },
    importAssets,
    getLatestReference: vi.fn(),
    connect: vi.fn(),
    isAssetDisabled: vi.fn((item) =>
      item.mediaType === 'text' ? '当前节点不支持文本引用' : false,
    ),
    onSelectDisabledAsset: vi.fn(),
    getAssetCapacity: vi.fn((selected) => [
      {
        kind: 'image',
        selected: selected.filter((item) => item.mediaType === 'image').length,
        max: 2,
      },
      {
        kind: 'audio',
        selected: selected.filter((item) => item.mediaType === 'audio').length,
        max: 2,
      },
    ]),
  };
}
async function openPicker(prompt, caret = prompt.indexOf('＠') + 1 || prompt.indexOf('@') + 1) {
  editor().focus();
  setPromptCaret(editor(), caret);
  fireEvent.input(editor(), { inputType: 'insertText' });
  fireEvent.click(await screen.findByRole('button', { name: '资产' }));
  await screen.findByRole('dialog', { name: '引用资产' });
  await screen.findByRole('checkbox', { name: '选择 真实图片' });
  return pickerDialog();
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  document.querySelector('[data-node-picker-hook-editor]')?.remove();
});

describe('node prompt asset picker through the actual shared dialog', () => {
  it('opens from the @ asset entry and cancels without consuming its trigger, restoring the editor caret', async () => {
    const user = userEvent.setup();
    const prompt = '保留@已有 ＠后文';
    const ref = createRef();
    const onChange = vi.fn();
    const config = configuration();
    render(
      <NodeGeneratorPrompt
        ref={ref}
        value={prompt}
        onChange={onChange}
        sessionKey="a"
        canvasMentions={config}
      />,
    );
    const dialog = await openPicker(prompt);
    expect(screen.queryByRole('listbox', { name: '画布引用素材' })).toBeNull();
    expect(config.assetSource.list.mock.calls[0][0]).toMatchObject({ scope: 'personal' });
    await user.click(within(dialog).getByRole('button', { name: '关闭' }));
    await waitFor(() => {
      expect(document.activeElement).toBe(editor());
      expect(selectionOffsets(editor())).toEqual({
        start: prompt.indexOf('＠') + 1,
        end: prompt.indexOf('＠') + 1,
      });
    });
    expect(ref.current.getValue()).toBe(prompt);
    expect(config.importAssets).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('imports two allowed media using returned current tokens, consumes only the current trigger and commits one undo entry', async () => {
    const user = userEvent.setup();
    const prompt = '保留@已有 ＠后文';
    const ref = createRef();
    const onChange = vi.fn();
    const config = configuration();
    render(
      <NodeGeneratorPrompt
        ref={ref}
        value={prompt}
        references={{ mixedList: [] }}
        mentionListType="mixed"
        onChange={onChange}
        sessionKey="a"
        canvasMentions={config}
      />,
    );
    await openPicker(prompt);
    const blockedText = screen.getByRole('checkbox', { name: '选择 节点不支持的文本' });
    expect(blockedText.getAttribute('aria-disabled')).toBe('true');
    await user.click(blockedText);
    expect(config.onSelectDisabledAsset).toHaveBeenCalledOnce();
    expect(blockedText.checked).toBe(false);
    await user.click(screen.getByRole('checkbox', { name: '选择 真实图片' }));
    await user.click(screen.getByRole('checkbox', { name: '选择 真实音频' }));
    await user.click(submitButton());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '引用资产' })).toBeNull());
    expect(config.importAssets).toHaveBeenCalledOnce();
    expect(config.importAssets.mock.calls[0][0].map((item) => item.id)).toEqual(['image', 'audio']);
    expect(config.importAssets.mock.calls[0][1]).toMatchObject({
      promptOverride: prompt,
      expectedPrompts: [prompt, prompt],
      sessionKey: 'a',
      signal: expect.any(AbortSignal),
    });
    const result = '保留@已有 {{Mixed 4}} {{Mixed 7}} 后文';
    expect(ref.current.getValue()).toBe(result);
    expect(readPromptDOM(editor())).toBe(result);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(result);
    expect(config.getLatestReference).not.toHaveBeenCalled();
    expect(config.connect).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(editor()));
    fireEvent.keyDown(editor(), { key: 'z', ctrlKey: true });
    expect(ref.current.getValue()).toBe(prompt);
    fireEvent.keyDown(editor(), { key: 'z', ctrlKey: true, shiftKey: true });
    expect(ref.current.getValue()).toBe(result);
  });

  it('marks a mixed capacity caption only when every media kind is full and still allows deselection', async () => {
    const user = userEvent.setup();
    const prompt = '正文@';
    const config = configuration();
    config.getAssetCapacity.mockImplementation((selected) =>
      ['image', 'audio'].map((kind) => ({
        kind,
        selected: selected.filter((item) => item.mediaType === kind).length,
        max: 1,
      })),
    );
    config.isAssetDisabled.mockImplementation((item, selected) =>
      item.mediaType === 'text' || selected.some((chosen) => chosen.mediaType === item.mediaType)
        ? '此类型已达到上限'
        : false,
    );
    render(<NodeGeneratorPrompt value={prompt} sessionKey="a" canvasMentions={config} />);
    const dialog = await openPicker(prompt);
    const caption = () => dialog.querySelector('.node-prompt-asset-caption');
    const imageChoice = screen.getByRole('checkbox', { name: '选择 真实图片' });
    const audioChoice = screen.getByRole('checkbox', { name: '选择 真实音频' });
    expect(caption().classList.contains('is-at-capacity')).toBe(false);
    await user.click(imageChoice);
    expect(caption().textContent).toBe('图片 1/1 · 音频 0/1');
    expect(caption().classList.contains('is-at-capacity')).toBe(false);
    await user.click(audioChoice);
    expect(caption().textContent).toBe('图片 1/1 · 音频 1/1');
    expect(caption().classList.contains('is-at-capacity')).toBe(true);
    await user.click(imageChoice);
    expect(imageChoice.checked).toBe(false);
    expect(audioChoice.checked).toBe(true);
    expect(caption().classList.contains('is-at-capacity')).toBe(false);
    await user.click(audioChoice);
    expect(audioChoice.checked).toBe(false);
    expect(config.onSelectDisabledAsset).not.toHaveBeenCalled();
    expect(submitButton().disabled).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(config.importAssets).not.toHaveBeenCalled();
  });

  it('preserves the original prompt and selected assets after a synchronous import failure, then retries the same request', async () => {
    const user = userEvent.setup();
    const prompt = '重试＠尾';
    const importAssets = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('本地节点写入失败');
      })
      .mockReturnValueOnce({ options: [imported.options[0]] });
    const config = configuration(importAssets);
    const ref = createRef();
    const onChange = vi.fn();
    render(
      <NodeGeneratorPrompt
        ref={ref}
        value={prompt}
        sessionKey="a"
        onChange={onChange}
        canvasMentions={config}
      />,
    );
    await openPicker(prompt);
    await user.click(screen.getByRole('checkbox', { name: '选择 真实图片' }));
    await user.click(submitButton());
    expect((await screen.findByRole('alert')).textContent).toBe('本地节点写入失败');
    expect(ref.current.getValue()).toBe(prompt);
    expect(screen.getByRole('checkbox', { name: '选择 真实图片' }).checked).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    const firstSignal = importAssets.mock.calls[0][1].signal;
    expect(firstSignal.aborted).toBe(false);
    await user.click(submitButton());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '引用资产' })).toBeNull());
    expect(importAssets).toHaveBeenCalledTimes(2);
    expect(importAssets.mock.calls[1][1].signal).toBe(firstSignal);
    expect(ref.current.getValue()).toBe('重试 {{Mixed 4}} 尾');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('重试 {{Mixed 4}} 尾');
  });

  it.each([
    ['readonly', { readonly: true }],
    ['disabled', { disabled: true }],
    ['session switch', { sessionKey: 'b', value: '新文档' }],
    ['external value replacement', { value: '外部正文' }],
  ])(
    'closes the actual picker on %s without committing its previous trigger',
    async (_label, patch) => {
      const prompt = '原正文@';
      const config = configuration();
      const ref = createRef();
      const onChange = vi.fn();
      const props = { ref, value: prompt, sessionKey: 'a', onChange, canvasMentions: config };
      const view = render(<NodeGeneratorPrompt {...props} />);
      await openPicker(prompt);
      view.rerender(<NodeGeneratorPrompt {...props} {...patch} />);
      await waitFor(() => expect(screen.queryByRole('dialog', { name: '引用资产' })).toBeNull());
      expect(ref.current.getValue()).toBe(patch.value || prompt);
      expect(config.importAssets).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it('does not offer the asset picker in a badge swap menu', async () => {
    const config = configuration();
    render(
      <NodeGeneratorPrompt
        value="已有 {{Mixed 1}}"
        references={{ mixedList: [{ nodeId: 'existing', mediaType: 'image', url: '/old.png' }] }}
        mentionListType="mixed"
        sessionKey="a"
        canvasMentions={config}
      />,
    );
    const badge = editor().querySelector('[data-prompt-token]');
    fireEvent.pointerOver(badge);
    fireEvent.click(badge.querySelector('[data-mention-swap]'));
    await screen.findByRole('listbox', { name: '画布引用素材' });
    expect(screen.queryByRole('button', { name: '资产' })).toBeNull();
    expect(config.assetSource.list).not.toHaveBeenCalled();
    expect(config.importAssets).not.toHaveBeenCalled();
  });
});

function hookController() {
  const node = document.createElement('div');
  node.dataset.nodePickerHookEditor = 'true';
  node.contentEditable = 'true';
  node.textContent = '正文@';
  document.body.append(node);
  node.focus();
  return {
    editorRef: { current: node },
    draft: { current: '正文@' },
    external: { current: { value: '正文@' } },
    latest: { current: { blocked: false, mentionEnabled: true } },
    composing: { current: false },
    menu: { start: 2, end: 3 },
    savedSelection: { current: null },
    setMenu: vi.fn(),
    redraw: vi.fn(),
    change: vi.fn(),
  };
}

describe('node asset picker request ownership after closure', () => {
  it('does not let a retained close callback from a cancelled picker close its replacement', () => {
    const controller = hookController();
    const config = configuration();
    const closeMenu = vi.fn();
    const view = renderHook(() =>
      useNodePromptAssetPicker(controller, {
        canvasMentions: config,
        sessionKey: 'a',
        closeMenu,
      }),
    );
    act(() => view.result.current.show());
    const closeOldRequest = view.result.current.close;
    act(() => closeOldRequest());
    act(() => view.result.current.show());
    expect(view.result.current.open).toBe(true);
    act(() => closeOldRequest());
    expect(view.result.current.open).toBe(true);
    expect(config.importAssets).not.toHaveBeenCalled();
    act(() => view.result.current.close());
    expect(view.result.current.open).toBe(false);
  });

  it('does not let a retained confirmation from a cancelled picker import into a newly opened request', () => {
    const controller = hookController();
    const config = configuration();
    const closeMenu = vi.fn();
    const view = renderHook(() =>
      useNodePromptAssetPicker(controller, {
        canvasMentions: config,
        sessionKey: 'a',
        closeMenu,
      }),
    );
    act(() => view.result.current.show());
    const confirmOldRequest = view.result.current.pick;
    act(() => view.result.current.close());
    act(() => view.result.current.show());
    expect(view.result.current.open).toBe(true);
    act(() => confirmOldRequest([image]));
    expect(config.importAssets).not.toHaveBeenCalled();
    expect(controller.change).not.toHaveBeenCalled();
    expect(view.result.current.open).toBe(true);
    act(() => view.result.current.pick([audio]));
    expect(config.importAssets).toHaveBeenCalledTimes(1);
    expect(config.importAssets.mock.calls[0][0]).toEqual([audio]);
  });

  it.each(['cancel', 'readonly', 'disabled', 'session', 'external value', 'unmount'])(
    'ignores a retained confirmation callback after %s',
    (transition) => {
      const controller = hookController();
      const config = configuration();
      const closeMenu = vi.fn();
      const view = renderHook(
        ({ sessionKey }) =>
          useNodePromptAssetPicker(controller, { canvasMentions: config, sessionKey, closeMenu }),
        { initialProps: { sessionKey: 'a' } },
      );
      act(() => view.result.current.show());
      expect(view.result.current.open).toBe(true);
      const confirmLater = view.result.current.pick;
      if (transition === 'cancel') act(() => view.result.current.close());
      else if (transition === 'unmount') view.unmount();
      else {
        if (transition === 'readonly' || transition === 'disabled')
          controller.latest.current.blocked = true;
        if (transition === 'external value') {
          controller.external.current.value = '外部正文';
          controller.draft.current = '外部正文';
          controller.editorRef.current.textContent = '外部正文';
        }
        view.rerender({ sessionKey: transition === 'session' ? 'b' : 'a' });
      }
      if (transition !== 'unmount') expect(view.result.current.open).toBe(false);
      act(() => confirmLater([image, audio]));
      expect(config.importAssets).not.toHaveBeenCalled();
      expect(controller.redraw).not.toHaveBeenCalled();
      expect(controller.change).not.toHaveBeenCalled();
      expect(controller.draft.current).toBe(transition === 'external value' ? '外部正文' : '正文@');
    },
  );
});
