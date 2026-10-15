import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClipTextWorkspace from './ClipTextWorkspace.jsx';
import { createSubtitleHtml, readSubtitleHtml, createTextOverlayHtml } from './html-document.js';
import { within } from '@testing-library/react';
const input = () => ({
  state: {
    ready: true,
    textStatus: 'ready',
    previewExpanded: true,
    textPanelOpen: true,
    selectedTextCueId: 'one',
    timeline: {
      overlayHtmlInline: createTextOverlayHtml({
        compositionId: 'text',
        width: 1920,
        height: 1080,
        duration: 10,
        cues: [{ cueId: 'one', start: 0, duration: 3, text: '正文', trackIndex: 0 }],
      }),
    },
  },
  controller: Object.fromEntries(
    [
      'onTextChange',
      'onCommitText',
      'onEditText',
      'onDeleteText',
      'onCloseTextPanel',
      'onRetryText',
      'onAddText',
      'onApplyTextToAll',
      'onBeginTextStyle',
      'onPreviewTextStyle',
      'onEndTextStyle',
      'onCancelTextStyle',
    ].map((name) => [name, name === 'onBeginTextStyle' ? vi.fn(() => ({})) : vi.fn()]),
  ),
});
describe('ordinary text inspector and read-only preset library', () => {
  it('shows subtitle-only word highlight controls while ordinary animation remains absent', () => {
    const props = input();
    const model = readSubtitleHtml(
      createSubtitleHtml({
        compositionId: 'sub',
        width: 1920,
        height: 1080,
        duration: 10,
        cues: [{ cueId: 'one', start: 0, duration: 2, trackIndex: 0, text: '字幕' }],
      }),
    );
    render(
      <ClipTextWorkspace {...props} label="字幕" variant="subtitle" modelOverride={model}>
        preview
      </ClipTextWorkspace>,
    );
    expect(screen.getByRole('group', { name: '字幕属性' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: '字幕动画类型' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: '字幕逐词高亮' }), {
      target: { value: 'enabled' },
    });
    expect(props.controller.onEditText).toHaveBeenCalledWith({
      fields: { wordHighlightEnabled: true },
    });
    expect(screen.getByRole('button', { name: '字幕高亮文字' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '字幕高亮背景' })).toBeTruthy();
    expect(screen.getByLabelText('字幕文字颜色').type).toBe('color');
  });
  it('does not commit an unblurred body before the source header delete action', () => {
    const props = input();
    render(<ClipTextWorkspace {...props}>preview</ClipTextWorkspace>);
    const body = screen.getByRole('textbox', { name: '文本内容' }),
      remove = screen.getByRole('button', { name: '删除文本' });
    fireEvent.change(body, { target: { value: '即将删除的草稿' } });
    fireEvent.blur(body, { relatedTarget: remove });
    fireEvent.click(remove);
    expect(props.controller.onCommitText).not.toHaveBeenCalled();
    expect(props.controller.onDeleteText).toHaveBeenCalledTimes(1);
  });
  it('keeps source sections in one scroll flow, folds each section, exposes percentage line-height and ordinary-only animation', () => {
    const props = input();
    render(<ClipTextWorkspace {...props}>preview</ClipTextWorkspace>);
    expect(screen.getByRole('spinbutton', { name: '文本X' })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: '文本行高（%）' }).value).toBe('140');
    expect(screen.getByRole('spinbutton', { name: '文本背景不透明度' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '文本动画类型' }).options).toHaveLength(10);
    expect(screen.queryByText('高亮')).toBeNull();
    fireEvent.click(
      within(screen.getByRole('group', { name: '文本属性' })).getByRole('button', { name: '背景' }),
    );
    const toggle = screen
      .getAllByRole('button', { name: '背景', exact: true })
      .find((element) => element.hasAttribute('aria-expanded'));
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('spinbutton', { name: '文本背景不透明度' })).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole('spinbutton', { name: '文本背景不透明度' })).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: '文本动画类型' }), {
      target: { value: 'wave' },
    });
    expect(props.controller.onEditText).toHaveBeenLastCalledWith({
      fields: { animationType: 'wave' },
    });
    fireEvent.click(screen.getByRole('button', { name: '应用到所有' }));
    expect(props.controller.onApplyTextToAll).toHaveBeenCalledTimes(1);
  });
  it('passes decimal numeric strings and text as pending drafts, committing only on blur', () => {
    const props = input();
    render(<ClipTextWorkspace {...props}>preview</ClipTextWorkspace>);
    const body = screen.getByRole('textbox', { name: '文本内容' });
    fireEvent.change(body, { target: { value: '最后字符' } });
    expect(props.controller.onTextChange).toHaveBeenLastCalledWith('one', '最后字符');
    const size = screen.getByRole('spinbutton', { name: '文本字号' });
    fireEvent.change(size, { target: { value: '45.125' } });
    const token = props.controller.onBeginTextStyle.mock.results[0].value;
    expect(props.controller.onBeginTextStyle).toHaveBeenCalledWith({
      field: 'fontSizePx',
      kind: 'input',
      readPending: expect.any(Function),
    });
    expect(props.controller.onBeginTextStyle.mock.calls[0][0].readPending()).toBe(45.125);
    expect(props.controller.onPreviewTextStyle).toHaveBeenCalledWith(token, 45.125);
    expect(props.controller.onCommitText).not.toHaveBeenCalled();
    fireEvent.blur(size);
    expect(props.controller.onEndTextStyle).toHaveBeenCalledWith(token);
    expect(props.controller.onCommitText).not.toHaveBeenCalled();
  });
  it('remains safe after the final cue is deleted and blocks every mutation while loading', async () => {
    const props = input(),
      { rerender } = render(<ClipTextWorkspace {...props}>preview</ClipTextWorkspace>);
    const state = {
      ...props.state,
      textStatus: 'loading',
      selectedTextCueId: null,
      textDraft: null,
      timeline: {
        overlayHtmlInline: createTextOverlayHtml({
          compositionId: 'empty',
          width: 1920,
          height: 1080,
          duration: 10,
          cues: [],
        }),
      },
    };
    rerender(
      <ClipTextWorkspace {...props} state={state}>
        preview
      </ClipTextWorkspace>,
    );
    expect(screen.getByRole('textbox', { name: '文本内容' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '删除文本' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '默认样式' }));
    await screen.findByText('未找到预设样式');
    expect(screen.getByText('请先选择文本')).toBeTruthy();
  });
  it('loads presets only on demand, handles failed/malformed sources and searches categories without losing the selection', async () => {
    const props = input(),
      pending = {};
    const source = {
      load: vi
        .fn()
        .mockRejectedValueOnce(new Error('离线'))
        .mockResolvedValueOnce({
          categories: [{ id: 'base', name: '基础' }],
          presets: [
            { id: 'gold', name: '金色', categoryId: 'base', fields: { color: '#FFD000' } },
            { id: 'blue', name: '蓝色', fields: { color: '#0000FF' } },
          ],
        }),
    };
    const { unmount } = render(
      <ClipTextWorkspace {...props} presetSource={source}>
        preview
      </ClipTextWorkspace>,
    );
    expect(source.load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '默认样式' }));
    await screen.findByText('离线');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await screen.findByRole('button', { name: '金色' });
    fireEvent.click(screen.getByRole('tab', { name: '基础' }));
    expect(screen.queryByRole('button', { name: '蓝色' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '金色' }));
    expect(props.controller.onEditText).toHaveBeenCalledWith({
      preset: expect.objectContaining({ id: 'gold' }),
    });
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索预设样式' }), {
      target: { value: 'missing' },
    });
    await screen.findByText('未找到预设样式');
    unmount();
    const malformed = {
      load: vi.fn().mockResolvedValue({ categories: [], presets: [{ id: 'broken' }] }),
    };
    render(
      <ClipTextWorkspace {...props} presetSource={malformed}>
        preview
      </ClipTextWorkspace>,
    );
    fireEvent.click(screen.getByRole('button', { name: '默认样式' }));
    await screen.findByText('预设样式数据无法读取');
    const late = {
      load: vi.fn(({ signal }) => {
        pending.signal = signal;
        return new Promise((resolve) => {
          pending.resolve = resolve;
        });
      }),
    };
    // The next render owns its pending request independently of the previous source.
    render(
      <ClipTextWorkspace {...props} presetSource={late}>
        preview
      </ClipTextWorkspace>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: '默认样式' })[1]);
    await waitFor(() => expect(late.load).toHaveBeenCalled());
    await act(async () => pending.resolve({ categories: [], presets: [] }));
  });
});
