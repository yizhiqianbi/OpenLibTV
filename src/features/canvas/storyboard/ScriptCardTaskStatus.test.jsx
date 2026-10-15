import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeTextToClipboard } from '../../../services/clipboard-text.js';
import ScriptCardTaskStatus from './ScriptCardTaskStatus.jsx';

vi.mock('../../../services/clipboard-text.js', () => ({ writeTextToClipboard: vi.fn() }));

const options = (overrides = {}) => ({
  kind: 'failed',
  taskInfo: { loading: false, status: 3, taskId: 'task-123', failedReason: '模型返回错误' },
  documentKey: 'doc-a',
  nodeId: 'script-a',
  ...overrides,
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, deny) => {
    resolve = accept;
    reject = deny;
  });
  return { promise, resolve, reject };
}
const copyButton = () => screen.getByRole('button', { name: '复制任务编号' });

beforeEach(() => vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(undefined));
afterEach(() => vi.restoreAllMocks());

describe('ScriptV2 task display and local clipboard ownership (jsdom)', () => {
  it('renders the source progress badge from actual status, queueing and progress without task actions', () => {
    const view = render(
      <ScriptCardTaskStatus
        {...options({
          kind: 'generating',
          taskInfo: { status: 0, delayInfo: { remainSeconds: 121 } },
        })}
      />,
    );
    const badge = screen.getByTestId('scriptv2-card-task-badge');
    expect(badge.textContent).toBe('排队中，预计等待3分钟');
    expect(badge.getAttribute('role')).toBe('status');
    view.rerender(
      <ScriptCardTaskStatus
        {...options({ kind: 'generating', taskInfo: { status: 1, progressPercent: 42 } })}
      />,
    );
    expect(badge.textContent).toBe('生成中 42%...');
    view.rerender(
      <ScriptCardTaskStatus
        {...options({ kind: 'generating', taskInfo: { status: '1', progressPercent: 0 } })}
      />,
    );
    expect(badge.textContent).toBe('准备中...');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(document.querySelector('.skeleton-shimmer')).toBeNull();
    expect(writeTextToClipboard).not.toHaveBeenCalled();
  });

  it('does not invent membership benefits or a collaboration progress bus from a task field', () => {
    render(
      <ScriptCardTaskStatus
        {...options({
          kind: 'generating',
          taskInfo: { status: 1, benefitTag: 'free', progressPercent: 5 },
        })}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('生成中 5%...');
    expect(screen.queryByText(/畅享/)).toBeNull();
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull();
  });

  it('shows the source failure icon, raw reason and full TaskID with only a copy action', () => {
    render(<ScriptCardTaskStatus {...options()} />);
    expect(screen.getByText('生成失败')).toBeTruthy();
    expect(screen.getByText('模型返回错误')).toBeTruthy();
    const id = screen.getByText('TaskID: task-123');
    expect(id.title).toBe('task-123');
    const icon = screen.getByTestId('scriptv2-card-task-failure').querySelector('svg');
    expect(icon.getAttribute('width')).toBe('36');
    expect(icon.getAttribute('height')).toBe('36');
    expect(icon.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(icon.getAttribute('stroke-width')).toBe('2');
    expect(icon.querySelector('path').getAttribute('d')).toBe(
      'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
    );
    expect(icon.querySelectorAll('line')).toHaveLength(2);
    expect(screen.getAllByRole('button')).toEqual([copyButton()]);
    expect(screen.queryByRole('button', { name: '重新生成' })).toBeNull();
    expect(screen.queryByRole('button', { name: '查看详情' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([4, ' 4 '])('uses the actual source timeout label for status %j', (status) => {
    render(<ScriptCardTaskStatus {...options({ taskInfo: { loading: false, status } })} />);
    expect(screen.getByText('生成超时')).toBeTruthy();
    expect(screen.queryByText('生成失败')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/TaskID:/)).toBeNull();
  });

  it('preserves source raw string identity and omits missing optional metadata', async () => {
    const view = render(
      <ScriptCardTaskStatus
        {...options({
          taskInfo: { loading: false, status: 3, taskId: '  raw-id  ', failedReason: '  原因  ' },
        })}
      />,
    );
    expect(screen.getByText('TaskID: raw-id').title).toBe('  raw-id  ');
    expect(screen.getByText('原因').textContent).toBe('  原因  ');
    await act(async () => fireEvent.click(copyButton()));
    expect(writeTextToClipboard).toHaveBeenCalledWith('  raw-id  ', {
      signal: expect.any(AbortSignal),
    });
    view.rerender(
      <ScriptCardTaskStatus {...options({ taskInfo: { loading: false, status: 3 } })} />,
    );
    expect(screen.queryByText('原因')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('TaskID 已复制')).toBeNull();
  });

  it('keeps failure TaskID copying available in a readonly parent and reports actual local success', async () => {
    render(
      <div data-readonly="true">
        <ScriptCardTaskStatus {...options()} />
      </div>,
    );
    expect(copyButton().disabled).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => fireEvent.click(copyButton()));
    expect(writeTextToClipboard).toHaveBeenCalledExactlyOnceWith('task-123', {
      signal: expect.any(AbortSignal),
    });
    expect(screen.getByRole('status').textContent).toBe('TaskID 已复制');
    expect(screen.queryByText(/已上传|已生成/)).toBeNull();
  });

  it('reports a real clipboard failure and allows retry without fabricating a success message', async () => {
    vi.mocked(writeTextToClipboard).mockRejectedValueOnce(new Error('denied'));
    render(<ScriptCardTaskStatus {...options()} />);
    await act(async () => fireEvent.click(copyButton()));
    expect(screen.getByRole('alert').textContent).toBe('任务编号复制失败，请重试');
    expect(screen.queryByText('TaskID 已复制')).toBeNull();
    expect(copyButton().disabled).toBe(false);
    await act(async () => fireEvent.click(copyButton()));
    expect(writeTextToClipboard).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('TaskID 已复制')).toBeTruthy();
  });

  it('locks same-render duplicate writes while pending without disabling or blurring the copy button', async () => {
    const write = deferred();
    vi.mocked(writeTextToClipboard).mockReturnValueOnce(write.promise);
    render(<ScriptCardTaskStatus {...options()} />);
    const button = copyButton();
    button.focus();
    act(() => {
      button.click();
      button.click();
    });
    expect(button.disabled).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(copyButton().getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(copyButton());
    expect(writeTextToClipboard).toHaveBeenCalledTimes(1);
    await act(async () => write.resolve());
    expect(copyButton().disabled).toBe(false);
    expect(copyButton().getAttribute('aria-busy')).toBe('false');
    expect(screen.getByText('TaskID 已复制')).toBeTruthy();
  });

  it('does not let an old owner completion unlock a pending request for the new owner', async () => {
    const old = deferred();
    const current = deferred();
    vi.mocked(writeTextToClipboard)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    const view = render(<ScriptCardTaskStatus {...options()} />);
    fireEvent.click(copyButton());
    view.rerender(<ScriptCardTaskStatus {...options({ nodeId: 'script-b' })} />);
    fireEvent.click(copyButton());
    expect(writeTextToClipboard).toHaveBeenCalledTimes(2);
    await act(async () => old.resolve());
    fireEvent.click(copyButton());
    expect(writeTextToClipboard).toHaveBeenCalledTimes(2);
    expect(copyButton().getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('TaskID 已复制')).toBeNull();
    await act(async () => current.resolve());
    expect(copyButton().getAttribute('aria-busy')).toBe('false');
    expect(screen.getByText('TaskID 已复制')).toBeTruthy();
  });

  it.each([
    ['documentKey', 'doc-b'],
    ['nodeId', 'script-b'],
    ['taskId', 'task-456'],
    ['kind', 'generating'],
  ])('aborts and discards late clipboard failure when %s changes', async (field, value) => {
    const write = deferred();
    vi.mocked(writeTextToClipboard).mockReturnValueOnce(write.promise);
    const initial = options();
    const view = render(<ScriptCardTaskStatus {...initial} />);
    fireEvent.click(copyButton());
    const signal = vi.mocked(writeTextToClipboard).mock.calls[0][1].signal;
    const changed =
      field === 'taskId'
        ? { ...initial, taskInfo: { ...initial.taskInfo, taskId: value } }
        : { ...initial, [field]: value };
    view.rerender(<ScriptCardTaskStatus {...changed} />);
    expect(signal.aborted).toBe(true);
    await act(async () => write.reject(new Error('old owner denied')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('TaskID 已复制')).toBeNull();
    if (field !== 'kind') expect(copyButton().disabled).toBe(false);
  });

  it('does not let an A→B→A late success replace a current copy failure for the same TaskID', async () => {
    const old = deferred();
    vi.mocked(writeTextToClipboard)
      .mockReturnValueOnce(old.promise)
      .mockRejectedValueOnce(new Error('new failure'));
    const view = render(<ScriptCardTaskStatus {...options()} />);
    fireEvent.click(copyButton());
    view.rerender(<ScriptCardTaskStatus {...options({ documentKey: 'doc-b' })} />);
    view.rerender(<ScriptCardTaskStatus {...options()} />);
    await act(async () => fireEvent.click(copyButton()));
    expect(screen.getByRole('alert').textContent).toBe('任务编号复制失败，请重试');
    await act(async () => old.resolve());
    expect(screen.getByRole('alert').textContent).toBe('任务编号复制失败，请重试');
    expect(screen.queryByText('TaskID 已复制')).toBeNull();
  });

  it('aborts the real service signal on unmount and discards a late completion', async () => {
    const write = deferred();
    vi.mocked(writeTextToClipboard).mockReturnValueOnce(write.promise);
    const view = render(<ScriptCardTaskStatus {...options()} />);
    fireEvent.click(copyButton());
    const signal = vi.mocked(writeTextToClipboard).mock.calls[0][1].signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => write.resolve());
    expect(screen.queryByText('TaskID 已复制')).toBeNull();
  });

  it('isolates pointer, click and double-click while preserving native Space copy activation', async () => {
    const pointer = vi.fn(),
      click = vi.fn(),
      double = vi.fn(),
      key = vi.fn();
    render(
      <div onPointerDown={pointer} onClick={click} onDoubleClick={double} onKeyDown={key}>
        <ScriptCardTaskStatus {...options()} />
      </div>,
    );
    const button = copyButton();
    fireEvent.pointerDown(button);
    fireEvent.doubleClick(button);
    button.focus();
    expect(fireEvent.keyDown(button, { key: ' ', code: 'Space' })).toBe(true);
    expect(key).not.toHaveBeenCalled();
    await userEvent.setup().keyboard(' ');
    expect(writeTextToClipboard).toHaveBeenCalledTimes(1);
    expect(pointer).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(double).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  });

  it('scopes an explicit light theme without installing a theme reader or document mutation', () => {
    const before = document.documentElement.className;
    render(<ScriptCardTaskStatus {...options({ isCanvasLight: true })} />);
    expect(
      screen
        .getByTestId('scriptv2-card-task-failure')
        .classList.contains('cv-script-card-task-light'),
    ).toBe(true);
    expect(document.documentElement.className).toBe(before);
  });

  it('does not issue a copy during StrictMode effect replay or display an unknown task surface', async () => {
    const view = render(
      <StrictMode>
        <ScriptCardTaskStatus {...options()} />
      </StrictMode>,
    );
    expect(writeTextToClipboard).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(copyButton()));
    expect(writeTextToClipboard).toHaveBeenCalledTimes(1);
    view.rerender(<ScriptCardTaskStatus {...options({ kind: 'resource' })} />);
    expect(screen.queryByTestId('scriptv2-card-task-failure')).toBeNull();
    expect(screen.queryByTestId('scriptv2-card-task-badge')).toBeNull();
  });
});
