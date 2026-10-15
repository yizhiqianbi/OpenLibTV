import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CanvasAgentMessage } from '../components/CanvasAgentMessage.jsx';

const userMessage = (overrides = {}) => ({
  id: 'user-1',
  role: 'user',
  createdAt: Date.now(),
  parts: [
    { type: 'text', text: '前{{model:m}}\n{{model:m}}尾' },
    { type: 'model', id: 'm', name: '第一次', referenceKey: 'first' },
    { type: 'model', id: 'm', name: '第二次', referenceKey: 'second' },
  ],
  ...overrides,
});

describe('source message actions integration', () => {
  it('copies actual rich body innerText, excluding source-session notice, timestamp and actions', async () => {
    const message = userMessage();
    const serialized = JSON.stringify(message);
    const copy = vi.fn().mockResolvedValue();
    const notify = vi.fn();
    const page = render(
      <CanvasAgentMessage message={message} clipboardWriter={copy} onNotify={notify} />,
    );
    const body = page.container.querySelector('.cv-agent-message-content').parentElement;
    Object.defineProperty(body, 'innerText', {
      configurable: true,
      get: () => '  前实时模型\n第二次尾  ',
    });
    fireEvent.mouseEnter(page.container.querySelector('.cv-agent-message'));
    expect(page.container.querySelector('.cv-message-actions-user')).toBeTruthy();
    expect(page.container.querySelector('time').dateTime).toBe(
      new Date(message.createdAt).toISOString(),
    );
    const button = screen.getByRole('button', { name: '复制' });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(notify).toHaveBeenCalledWith('复制成功'));
    expect(copy).toHaveBeenCalledWith(
      '前实时模型\n第二次尾',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(document.activeElement).toBe(button);
    expect(JSON.stringify(message)).toBe(serialized);
    expect(page.container.querySelectorAll('[data-reference-key]')).toHaveLength(2);
  });
  it('reports a rejected copy accurately and supports keyboard focus without claiming success', async () => {
    const notify = vi.fn();
    const copy = vi.fn().mockRejectedValue(new Error('Permission denied'));
    const keyboard = userEvent.setup();
    render(
      <CanvasAgentMessage
        message={userMessage({ createdAt: undefined })}
        clipboardWriter={copy}
        onNotify={notify}
      />,
    );
    await keyboard.tab();
    const button = screen.getByRole('button', { name: '复制' });
    expect(document.activeElement).toBe(button);
    await keyboard.keyboard('{Enter}');
    await waitFor(() => expect(notify).toHaveBeenCalledWith('复制失败'));
    expect(notify).not.toHaveBeenCalledWith('复制成功');
    expect(screen.getByRole('status').textContent).toBe('复制失败');
    expect(document.querySelector('time')).toBeNull();
    expect(button.getAttribute('aria-busy')).toBe('false');
  });
  it('ignores late writes across message replacement and unmount, but uses latest content/callback for the same id', async () => {
    let settle;
    let signal;
    const writer = vi.fn((_, options) => {
      signal = options.signal;
      return new Promise((resolve) => {
        settle = resolve;
      });
    });
    const oldNotify = vi.fn();
    const newNotify = vi.fn();
    const page = render(
      <CanvasAgentMessage message={userMessage()} clipboardWriter={writer} onNotify={oldNotify} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '复制' }));
    page.rerender(
      <CanvasAgentMessage
        message={userMessage({ id: 'different' })}
        clipboardWriter={writer}
        onNotify={newNotify}
      />,
    );
    expect(signal.aborted).toBe(true);
    await act(async () => settle());
    expect(oldNotify).not.toHaveBeenCalled();
    expect(newNotify).not.toHaveBeenCalled();
    page.rerender(
      <CanvasAgentMessage
        message={userMessage({ id: 'different', parts: [{ type: 'text', text: 'updated' }] })}
        clipboardWriter={writer}
        onNotify={newNotify}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '复制' }));
    expect(writer.mock.calls.at(-1)[0]).toBe('updated');
    await act(async () => settle());
    expect(newNotify).toHaveBeenCalledWith('复制成功');
    fireEvent.click(screen.getByRole('button', { name: '复制' }));
    page.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => settle());
    expect(newNotify).toHaveBeenCalledTimes(1);
  });
  it('hides assistant actions by default and preserves source readonly/share branches', async () => {
    const message = {
      id: 'assistant-end',
      role: 'assistant',
      createdAt: Date.now(),
      content: '**Rendered**',
    };
    const writer = vi.fn().mockResolvedValue();
    const turn = [{ id: 'a', role: 'assistant', content: '  **First**  ' }, message];
    const options = { messages: turn, targetMessageId: 'assistant-end', canCopy: true };
    const page = render(<CanvasAgentMessage message={message} clipboardWriter={writer} />);
    expect(screen.queryByRole('button', { name: '复制' })).toBeNull();
    page.rerender(
      <CanvasAgentMessage
        message={message}
        clipboardWriter={writer}
        assistantActions={options}
        readOnly
      />,
    );
    expect(screen.queryByRole('button', { name: '复制' })).toBeNull();
    page.rerender(
      <CanvasAgentMessage
        message={message}
        clipboardWriter={writer}
        assistantActions={options}
        isShareReplay
      />,
    );
    expect(screen.queryByRole('button', { name: '复制' })).toBeNull();
    page.rerender(
      <CanvasAgentMessage message={message} clipboardWriter={writer} assistantActions={options} />,
    );
    expect(page.container.querySelector('.cv-message-actions-assistant')).toBeTruthy();
    expect(page.container.querySelector('time')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '复制' }));
    await waitFor(() => expect(writer).toHaveBeenCalled());
    expect(writer.mock.calls[0][0]).toBe('**First**\n\n**Rendered**');
    expect(screen.queryByRole('button', { name: /赞|重新生成/ })).toBeNull();
    page.rerender(
      <CanvasAgentMessage
        message={userMessage()}
        clipboardWriter={writer}
        readOnly
        isShareReplay
      />,
    );
    expect(screen.getByRole('button', { name: '复制' })).toBeTruthy();
  });
  it('renders source-session fallback and allows only the real adapter with active-session guards', async () => {
    const parts = [
      { type: 'text', text: '原提示' },
      { type: 'context', metadata: { source_agent_session: 'source' } },
    ];
    const message = userMessage({ parts });
    const notify = vi.fn();
    const onContinue = vi.fn().mockRejectedValue(new Error('session unavailable'));
    const page = render(<CanvasAgentMessage message={message} />);
    expect(screen.getByRole('button', { name: '来源会话' }).disabled).toBe(true);
    const props = {
      message,
      sourceSession: { sessionId: 'source', name: '原始会话', projectId: 'p' },
      projectId: 'p',
      currentSessionId: 'other',
      sessionsReady: true,
      onContinueSourceSession: onContinue,
      onNotify: notify,
    };
    page.rerender(<CanvasAgentMessage {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '原始会话' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('操作失败'));
    expect(onContinue).toHaveBeenCalledWith('source');
    page.rerender(<CanvasAgentMessage {...props} currentSessionId="source" />);
    expect(screen.getByRole('button', { name: '原始会话' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '原始会话' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    page.rerender(<CanvasAgentMessage {...props} projectId="another-project" />);
    expect(screen.getByRole('button', { name: '原始会话' }).disabled).toBe(true);
    page.rerender(<CanvasAgentMessage {...props} isShareReplay />);
    expect(screen.getByRole('button', { name: '原始会话' }).disabled).toBe(true);
    expect(message.parts).toBe(parts);
  });
  it('never displays message_feedback controls as a normal message or copy target', () => {
    render(
      <CanvasAgentMessage
        message={{
          role: 'user',
          content: JSON.stringify([
            { type: 'message_feedback', rating: 'like' },
            { type: 'text', text: 'hidden' },
          ]),
        }}
      />,
    );
    expect(screen.queryByText('hidden')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('closes tooltip on external scroll without moving focus and releases it on unmount', () => {
    const page = render(<CanvasAgentMessage message={userMessage()} />);
    const button = screen.getByRole('button', { name: '复制' });
    act(() => button.focus());
    expect(screen.getByRole('tooltip').textContent).toBe('复制');
    fireEvent.scroll(window);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.activeElement).toBe(button);
    fireEvent.mouseEnter(button);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    page.unmount();
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.scroll(window);
  });
  it('prevents duplicate source-session switching and ignores an old failure after context changes', async () => {
    let reject;
    const switchSession = vi.fn(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const notify = vi.fn();
    const props = {
      message: userMessage({
        parts: [
          { type: 'text', text: '原提示' },
          { type: 'context', metadata: { source_agent_session: 's' } },
        ],
      }),
      sourceSession: { sessionId: 's', name: '来源', projectId: 'p' },
      projectId: 'p',
      currentSessionId: 'other',
      sessionsReady: true,
      onContinueSourceSession: switchSession,
      onNotify: notify,
    };
    const page = render(<CanvasAgentMessage {...props} />);
    const button = screen.getByRole('button', { name: '来源' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(switchSession).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    page.rerender(<CanvasAgentMessage {...props} currentSessionId="new-current" />);
    await act(async () => reject(new Error('late failure')));
    expect(notify).not.toHaveBeenCalled();
    expect(screen.queryByText('操作失败')).toBeNull();
  });
});
