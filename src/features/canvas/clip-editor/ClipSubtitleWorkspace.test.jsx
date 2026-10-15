import { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDialogBehavior } from '../../../hooks/useDialogBehavior.js';
import ClipSubtitleWorkspace from './ClipSubtitleWorkspace.jsx';
import ClipSubtitleTimelineRow from './ClipSubtitleTimelineRow.jsx';

const props = () => ({
  state: {
    ready: true,
    previewExpanded: true,
    subtitlePanelOpen: true,
    subtitleStatus: 'ready',
    selectedSubtitleId: 'one',
    mediaBySourceId: new Map(),
    timeline: {
      clips: [],
      subtitles: {
        visible: true,
        defaultStyle: { fontSizePx: 32 },
        cues: [
          { id: 'one', startTime: 1, endTime: 3, text: '第一条' },
          { id: 'two', startTime: 4, endTime: 6, text: '第二条' },
        ],
      },
    },
  },
  controller: Object.fromEntries(
    [
      'onSubtitleTextChange',
      'onCommitSubtitleText',
      'onEditSubtitle',
      'onAddSubtitle',
      'onSelectSubtitle',
      'onSeekSubtitle',
      'onCloseSubtitlePanel',
      'onRetrySubtitles',
    ].map((key) => [key, vi.fn()]),
  ),
});

describe('subtitle panels and gesture surface', () => {
  it('keeps the inspector safe after deleting the last cue or opening an empty track', () => {
    const input = props();
    const { rerender } = render(<ClipSubtitleWorkspace {...input}>preview</ClipSubtitleWorkspace>);
    rerender(
      <ClipSubtitleWorkspace
        {...input}
        state={{
          ...input.state,
          selectedSubtitleId: null,
          subtitleTextDraft: null,
          timeline: {
            ...input.state.timeline,
            subtitles: { visible: true, userCleared: true, cues: [] },
          },
        }}
      >
        preview
      </ClipSubtitleWorkspace>,
    );
    expect(screen.getByRole('textbox', { name: '字幕文本' }).value).toBe('');
    expect(screen.getByRole('textbox', { name: '字幕文本' }).disabled).toBe(true);
    expect(screen.getByText('暂无字幕')).toBeTruthy();
    expect(screen.getByText('请先选择一条字幕')).toBeTruthy();
    expect(screen.getByRole('button', { name: '添加字幕' }).disabled).toBe(false);
  });
  it('keeps typing as a draft until blur, searches cues and passes explicit insertion/deletion identity', () => {
    const input = props();
    const { rerender } = render(<ClipSubtitleWorkspace {...input}>preview</ClipSubtitleWorkspace>);
    const field = screen.getByRole('textbox', { name: '字幕文本' });
    expect(field.value).toBe('第一条');
    fireEvent.change(field, { target: { value: '最后输入' } });
    expect(input.controller.onSubtitleTextChange).toHaveBeenCalledWith('one', '最后输入');
    expect(input.controller.onCommitSubtitleText).not.toHaveBeenCalled();
    rerender(
      <ClipSubtitleWorkspace
        {...input}
        state={{ ...input.state, subtitleTextDraft: { cueId: 'one', text: '最后输入' } }}
      >
        preview
      </ClipSubtitleWorkspace>,
    );
    expect(field.value).toBe('最后输入');
    fireEvent.blur(field);
    expect(input.controller.onCommitSubtitleText).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '在字幕 two 后插入' }));
    expect(input.controller.onAddSubtitle).toHaveBeenCalledWith({ afterId: 'two' });
    fireEvent.click(screen.getByRole('button', { name: '删除字幕 one' }));
    expect(input.controller.onEditSubtitle).toHaveBeenLastCalledWith({
      kind: 'delete',
      cueId: 'one',
    });
    fireEvent.change(screen.getByRole('textbox', { name: '搜索字幕' }), {
      target: { value: '第二' },
    });
    expect(screen.queryByRole('button', { name: '选择字幕 one' })).toBeNull();
    fireEvent.doubleClick(screen.getByRole('button', { name: '选择字幕 two' }));
    expect(input.controller.onSeekSubtitle).toHaveBeenCalledWith('two');
  });
  it('gates style edits on failed reads and retains panel width across closing', () => {
    const input = props();
    const { rerender } = render(<ClipSubtitleWorkspace {...input}>preview</ClipSubtitleWorkspace>);
    fireEvent.change(screen.getByRole('spinbutton', { name: '字号' }), { target: { value: '48' } });
    expect(input.controller.onEditSubtitle).toHaveBeenCalledWith({
      kind: 'style',
      style: { fontSizePx: 48 },
    });
    fireEvent.keyDown(screen.getByRole('separator', { name: '调整字幕宽度' }), {
      key: 'ArrowLeft',
    });
    rerender(
      <ClipSubtitleWorkspace {...input} state={{ ...input.state, subtitlePanelOpen: false }}>
        preview
      </ClipSubtitleWorkspace>,
    );
    rerender(
      <ClipSubtitleWorkspace
        {...input}
        state={{ ...input.state, subtitleStatus: 'error', subtitleError: '读取失败' }}
      >
        preview
      </ClipSubtitleWorkspace>,
    );
    expect(
      screen.getByRole('separator', { name: '调整字幕宽度' }).getAttribute('aria-valuenow'),
    ).toBe('364');
    expect(screen.getByRole('textbox', { name: '字幕文本' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '添加字幕' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '重试读取字幕' }));
    expect(input.controller.onRetrySubtitles).toHaveBeenCalledTimes(1);
  });
  it('consumes Escape before the parent dialog and returns focus to the subtitle trigger', () => {
    const input = props(),
      parentClose = vi.fn();
    function Editor() {
      const root = useRef(null);
      useDialogBehavior(root, { onClose: parentClose });
      return (
        <section ref={root} className="cv-clip-editor" tabIndex={-1}>
          <button data-testid="clip-toolbar-subtitle">添加字幕</button>
          <ClipSubtitleWorkspace {...input}>preview</ClipSubtitleWorkspace>
        </section>
      );
    }
    render(<Editor />);
    act(() => screen.getByRole('textbox', { name: '字幕文本' }).focus());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(input.controller.onCloseSubtitlePanel).toHaveBeenCalledTimes(1);
    expect(parentClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByTestId('clip-toolbar-subtitle'));
  });
  it('commits the pointerup position once, cancels on blur and supports keyboard selection/trim', () => {
    const input = props();
    const handlers = {
      onSelectSubtitle: vi.fn(),
      onEditSubtitle: vi.fn(),
      onBeginEdit: vi.fn(() => true),
      onEditPreview: vi.fn(),
      onEndEdit: vi.fn(),
      onCancelEdit: vi.fn(),
    };
    render(
      <ClipSubtitleTimelineRow
        timeline={{ ...input.state.timeline, scale: 100, scrollX: 0 }}
        selectedSubtitleId="one"
        draftSession={{}}
        {...handlers}
      />,
    );
    const cue = screen.getByRole('button', { name: '字幕 one 第一条' });
    fireEvent.keyDown(cue, { key: 'Enter' });
    expect(handlers.onSelectSubtitle).toHaveBeenCalledWith('one');
    fireEvent.pointerDown(cue, { button: 0, pointerId: 2, clientX: 100 });
    fireEvent.pointerMove(cue, { pointerId: 2, clientX: 180 });
    fireEvent.pointerUp(cue, { pointerId: 2, clientX: 200 });
    expect(handlers.onEditPreview).toHaveBeenLastCalledWith('subtitle', {
      kind: 'gesture',
      cueId: 'one',
      mode: 'move',
      delta: 1,
    });
    expect(handlers.onEndEdit).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(cue, { button: 0, pointerId: 3, clientX: 100 });
    fireEvent.blur(window);
    expect(handlers.onCancelEdit).toHaveBeenCalledTimes(1);
    const edge = screen.getByRole('button', { name: '调整字幕结束时间 one' });
    fireEvent.keyDown(edge, { key: 'ArrowLeft' });
    expect(handlers.onEditPreview).toHaveBeenLastCalledWith('subtitle', {
      kind: 'gesture',
      cueId: 'one',
      mode: 'resize-end',
      delta: -0.1,
    });
    expect(handlers.onEndEdit).toHaveBeenCalledTimes(2);
  });
});
