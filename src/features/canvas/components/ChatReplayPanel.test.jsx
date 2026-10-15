import { createRef } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatReplayPanel } from './ChatReplayPanel.jsx';

function props(sharedMessages, overrides = {}) {
  return {
    chatMessages: createRef(),
    nodes: [],
    replay: sharedMessages.length - 1,
    replayPlaying: false,
    setReplay: vi.fn(),
    setReplayPlaying: vi.fn(),
    sharedMessages,
    src: (url) => url,
    title: '只读对话',
    ...overrides,
  };
}

describe('read-only ChatReplay inline integration', () => {
  it('renders serialized parts without a text field and previews the correct occurrence in the shared dialog', async () => {
    const user = userEvent.setup();
    const source = { type: 'data', mimeType: 'audio/wav', value: 'YQ==' };
    const parts = [
      { type: 'text', text: '前{{audio:a}}中\n{{audio:a}}后' },
      { type: 'audio', id: 'a', name: '声音一', referenceKey: 'first', source },
      { type: 'audio', id: 'a', name: '声音二', referenceKey: 'second', source },
    ];
    const page = render(
      <ChatReplayPanel {...props([{ role: 'user', content: JSON.stringify(parts) }])} />,
    );
    const frame = page.container.querySelector('.cv-chat-message.user');
    const content = frame.querySelector('.cv-agent-message-content');
    expect([...content.children].map((child) => child.textContent)).toEqual([
      '前',
      '声音一',
      '中\n',
      '声音二',
      '后',
    ]);
    expect(frame.querySelector('[contenteditable]')).toBeNull();
    expect(screen.queryByRole('button', { name: /移除|发送/ })).toBeNull();
    const second = within(frame).getByRole('button', { name: '预览 声音二' });
    await user.click(second);
    const dialog = await screen.findByRole('dialog', { name: '声音二' });
    expect(dialog.querySelector('audio').getAttribute('src')).toBe('data:audio/wav;base64,YQ==');
    expect(dialog.querySelector('audio').controls).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(second);
    expect(content.querySelectorAll('[data-reference-key]')).toHaveLength(2);
  });

  it('preserves legacy text and replay controls, and closes media when another message document arrives', async () => {
    const messages = [
      { role: 'user', text: '## 原始 **指令**\n下一行' },
      { role: 'assistant', text: '**服务未连接**\n\n输入仍保留。' },
      {
        role: 'user',
        parts: [
          { type: 'text', text: '参考{{document:d}}' },
          {
            type: 'document',
            id: 'd',
            name: '分镜.md',
            source: { type: 'url', value: '/story.md' },
          },
        ],
      },
    ];
    const properties = props(messages, { replay: 0 });
    const page = render(<ChatReplayPanel {...properties} />);
    expect(page.container.querySelector('.cv-agent-message-content').textContent).toBe(
      '## 原始 **指令**\n下一行',
    );
    expect(screen.queryByText('服务未连接')).toBeNull();
    fireEvent.change(screen.getByRole('slider', { name: '回放进度' }), { target: { value: '2' } });
    expect(properties.setReplay).toHaveBeenCalledWith(2);
    expect(properties.setReplayPlaying).toHaveBeenCalledWith(false);
    page.rerender(<ChatReplayPanel {...properties} replay={2} />);
    expect(page.container.querySelector('.cv-chat-message.assistant strong').textContent).toBe(
      '服务未连接',
    );
    fireEvent.click(screen.getByRole('button', { name: '预览 分镜.md' }));
    const dialog = await screen.findByRole('dialog', { name: '分镜.md' });
    expect(within(dialog).getByRole('link', { name: '下载 分镜.md' }).getAttribute('href')).toBe(
      '/story.md',
    );
    page.rerender(<ChatReplayPanel {...props([{ role: 'user', text: '另一个项目' }])} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('另一个项目')).toBeTruthy();
    expect(screen.queryByText('分镜.md')).toBeNull();
  });
});
