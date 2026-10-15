import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgentReferencePreview from '../../../components/agent/AgentReferencePreview.jsx';
import { CanvasAgentMessage, CanvasAgentMessageContent } from './CanvasAgentMessage.jsx';

afterEach(() => vi.useRealTimers());

function PreviewHarness({ message, previewed }) {
  const [reference, setReference] = useState(null);
  return (
    <>
      <CanvasAgentMessage
        message={message}
        onPreview={(next) => {
          previewed(next);
          setReference(next);
        }}
      />
      {reference && (
        <AgentReferencePreview reference={reference} onClose={() => setReference(null)} />
      )}
    </>
  );
}

function orderedContent(container) {
  return [...container.querySelector('.cv-agent-message-content').children].map(
    (child) => child.textContent,
  );
}

describe('Canvas sent-message inline content', () => {
  it('renders duplicate occurrences in position and trims display text without changing the persisted original', () => {
    const message = {
      role: 'user',
      text: '旧的纯文本字段不替代完整 parts',
      parts: [
        { type: 'text', text: '  镜{{skill:s}}头\n{{model:m}}中{{skill:s}}尾  ' },
        { type: 'skill', id: 's', name: '第一个导演', referenceKey: 'skill-one' },
        { type: 'model', id: 'm', name: '图像模型', referenceKey: 'model-one' },
        { type: 'skill', id: 's', name: '第二个导演', referenceKey: 'skill-two', draft: true },
      ],
    };
    const page = render(<CanvasAgentMessage message={message} />);
    expect(orderedContent(page.container)).toEqual([
      '镜',
      '第一个导演',
      '头\n',
      '图像模型',
      '中',
      '第二个导演草稿',
      '尾',
    ]);
    expect(page.container.querySelectorAll('[data-reference-key]')).toHaveLength(3);
    expect(page.container.querySelector('[contenteditable]')).toBeNull();
    expect(screen.getByRole('button', { name: '复制' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /移除/ })).toBeNull();
    expect(message.parts[0].text).toBe('  镜{{skill:s}}头\n{{model:m}}中{{skill:s}}尾  ');
    page.rerender(<CanvasAgentMessage message={JSON.parse(JSON.stringify(message))} />);
    expect(orderedContent(page.container)).toEqual([
      '镜',
      '第一个导演',
      '头\n',
      '图像模型',
      '中',
      '第二个导演草稿',
      '尾',
    ]);
  });

  it('delegates the selected occurrence to the existing audio dialog and restores focus on Escape', async () => {
    const previewed = vi.fn(),
      user = userEvent.setup();
    const base = {
      type: 'audio',
      id: 'a',
      name: '参考声音',
      status: 'ready',
      source: { type: 'data', value: 'YQ==', mimeType: 'audio/wav' },
    };
    render(
      <PreviewHarness
        previewed={previewed}
        message={{
          role: 'user',
          parts: [
            { type: 'text', text: '前{{audio:a}}中{{audio:a}}后' },
            { ...base, referenceKey: 'first' },
            { ...base, referenceKey: 'second' },
          ],
        }}
      />,
    );
    const buttons = screen.getAllByRole('button', { name: '预览 参考声音' });
    await user.click(buttons[1]);
    const dialog = await screen.findByRole('dialog', { name: '参考声音' });
    expect(previewed).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceKey: 'second',
        source: expect.objectContaining({ value: 'data:audio/wav;base64,YQ==' }),
      }),
    );
    const audio = dialog.querySelector('audio');
    expect(audio.controls).toBe(true);
    expect(audio.tabIndex).toBe(0);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(buttons[1]);
    expect(screen.getAllByRole('button', { name: '预览 参考声音' })).toHaveLength(2);
  });

  it('offers only ready attachment actions and displays a node image without creating source or locator permissions', () => {
    const onPreview = vi.fn();
    const node = {
      type: 'node',
      id: 'n',
      nodeKey: 'n',
      name: '场景节点',
      projectId: 'project',
      nodeType: 'image',
      mediaType: 'image',
      url: '/node.png',
    };
    const page = render(
      <CanvasAgentMessageContent
        onPreview={onPreview}
        message={{
          parts: [
            { type: 'text', text: '{{image:pending}}{{document:broken}}{{node:n}}{{skill:s}}' },
            {
              type: 'image',
              id: 'pending',
              name: '读取中',
              status: 'uploading',
              source: { type: 'url', value: '/pending.png' },
            },
            {
              type: 'document',
              id: 'broken',
              name: '不可用文档',
              source: { type: 'url', value: ' javascript:bad' },
            },
            node,
            { type: 'skill', id: 's', name: '导演' },
          ],
        }}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    const chip = page.container.querySelector('.agent-node-reference');
    expect(chip.textContent).toBe('场景节点');
    expect(chip.querySelector('img').getAttribute('src')).toBe('/node.png');
    fireEvent.click(chip);
    expect(onPreview).not.toHaveBeenCalled();
    expect(node.source).toBeUndefined();
    expect(page.container.querySelector('[contenteditable]')).toBeNull();
  });

  it('uses source hover delays for read-only image previews and cancels pending UI on unmount', () => {
    vi.useFakeTimers();
    const message = {
      role: 'user',
      parts: [
        { type: 'text', text: '前{{image:p}}后' },
        {
          type: 'image',
          id: 'p',
          name: '参考图',
          source: { type: 'url', value: '/reference.png' },
        },
      ],
    };
    const page = render(<CanvasAgentMessage message={message} />);
    const chip = page.container.querySelector('.cv-message-reference-image');
    expect(chip.tagName).toBe('SPAN');
    expect(chip.tabIndex).toBe(0);
    fireEvent.mouseEnter(chip);
    act(() => vi.advanceTimersByTime(179));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    const tooltip = screen.getByRole('tooltip', { name: '参考图 预览' });
    expect(within(tooltip).getByRole('img', { name: '参考图' }).getAttribute('src')).toBe(
      '/reference.png',
    );
    fireEvent.mouseLeave(chip);
    act(() => vi.advanceTimersByTime(119));
    expect(screen.queryByRole('tooltip')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(chip);
    page.unmount();
    act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('keeps the video hover muted and bounded, dismisses it on scroll, and delegates a controlled preview', () => {
    vi.useFakeTimers();
    const onPreview = vi.fn();
    const page = render(
      <CanvasAgentMessage
        onPreview={onPreview}
        message={{
          role: 'user',
          content: JSON.stringify([
            { type: 'text', text: '前{{video:v}}\n后' },
            {
              type: 'video',
              id: 'v',
              name: '参考视频',
              source: { type: 'url', value: '/reference.mp4' },
            },
          ]),
        }}
      />,
    );
    const chip = screen.getByRole('button', { name: '预览 参考视频' });
    fireEvent.mouseEnter(chip);
    act(() => vi.advanceTimersByTime(180));
    const tooltip = screen.getByRole('tooltip', { name: '参考视频 预览' });
    const video = tooltip.querySelector('video');
    expect(video.muted).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.controls).toBe(false);
    expect(Number.parseFloat(tooltip.style.left)).toBeGreaterThanOrEqual(12);
    fireEvent.scroll(window);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(chip);
    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'video',
        id: 'v',
        source: expect.objectContaining({ value: '/reference.mp4' }),
      }),
    );
    expect(orderedContent(page.container)).toEqual(['前', '参考视频', '\n后']);
  });

  it('retains an actual blocked assistant message and renders Markdown without adding a generation result', () => {
    const page = render(
      <CanvasAgentMessage
        message={{ role: 'assistant', text: '服务未连接。\n\n**输入已保留**\n\n- 可以稍后重试' }}
      />,
    );
    expect(screen.getByText('服务未连接。')).toBeTruthy();
    expect(page.container.querySelector('strong').textContent).toBe('输入已保留');
    expect(screen.getByRole('listitem').textContent).toBe('可以稍后重试');
    expect(screen.queryByRole('button')).toBeNull();
    expect(page.container.querySelector('[contenteditable]')).toBeNull();
  });
});
