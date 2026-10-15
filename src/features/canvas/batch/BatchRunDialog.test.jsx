import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import BatchRunDialog from './BatchRunDialog.jsx';

const nodes = [
  { id: 'group', type: 'group', data: {} },
  ...['a', 'b'].map((id) => ({
    id,
    parentId: 'group',
    type: 'text',
    data: {
      name: id,
      action: 'text_generate',
      params: { model: models.default.text, prompt: id + '提示词' },
    },
  })),
];
const props = { groupId: 'group', documentKey: 'document-a', nodes, edges: [], models };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
describe('ordinary group generation confirmation', () => {
  it('lets users inspect the plan without a service, blocks submission without claiming completion, and restores focus on close', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    function Harness() {
      return (
        <>
          <button onClick={() => {}}>原触发器</button>
          <BatchRunDialog {...props} onClose={onClose} />
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByRole('list', { name: '组内生成节点' }).textContent).toContain('a');
    expect(screen.getByText(/费用服务尚未连接/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '开始执行' }));
    expect(screen.getAllByText('尚未提交')).toHaveLength(2);
    expect(screen.queryByText('已完成')).toBeNull();
    expect(nodes[1].data.params.prompt).toBe('a提示词');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('keeps estimate loading, failure retry, and a verified zero quote separate', async () => {
    const user = userEvent.setup();
    const quote = deferred();
    const estimate = vi
      .fn()
      .mockRejectedValueOnce(new Error('费用网络错误'))
      .mockReturnValueOnce(quote.promise);
    render(<BatchRunDialog {...props} onClose={vi.fn()} estimate={estimate} />);
    await screen.findByRole('button', { name: '重新计算' });
    expect(screen.getByText('费用网络错误')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '重新计算' }));
    expect(screen.getByRole('button', { name: '开始执行' }).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('正在计算算力消耗…');
    await act(async () => quote.resolve({ totalPower: 0, nodeCount: 2, hasError: false }));
    expect(screen.getByRole('button', { name: '开始执行' }).disabled).toBe(false);
    expect(screen.getByText('即将对组内 2 个生成节点批量生成，是否继续？')).toBeTruthy();
  });
  it('requires a nested stop confirmation, retains inputs, and ignores a late executor result', async () => {
    const user = userEvent.setup();
    const waiting = deferred();
    const executeNode = vi.fn(() => waiting.promise);
    render(<BatchRunDialog {...props} onClose={vi.fn()} executeNode={executeNode} />);
    await user.click(screen.getByRole('button', { name: '开始执行' }));
    await waitFor(() => expect(executeNode).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: '停止' }));
    const confirmation = screen.getByRole('dialog', { name: '停止批量任务？' });
    expect(confirmation.textContent).toContain('积分不会退还');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '停止批量任务？' })).toBeNull();
    expect(screen.getByRole('button', { name: '停止' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '停止' }));
    await user.click(screen.getAllByRole('button', { name: '停止' }).at(-1));
    await screen.findByText('已停止继续执行，节点参数和已有内容保留。');
    expect(executeNode.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => waiting.resolve({ status: 'success' }));
    expect(screen.queryByText('已完成')).toBeNull();
    expect(nodes[2].data.params.prompt).toBe('b提示词');
  });
  it('cancels both quote and execution on a same-instance document switch without reviving old state', async () => {
    const user = userEvent.setup();
    const waiting = deferred();
    const quote = deferred();
    const executeNode = vi.fn(() => waiting.promise);
    const estimate = vi.fn(() => quote.promise);
    const view = render(<BatchRunDialog {...props} onClose={vi.fn()} executeNode={executeNode} />);
    await user.click(screen.getByRole('button', { name: '开始执行' }));
    view.rerender(
      <BatchRunDialog {...props} documentKey="document-b" onClose={vi.fn()} estimate={estimate} />,
    );
    await waitFor(() => expect(estimate).toHaveBeenCalledTimes(1));
    expect(executeNode.mock.calls[0][1].signal.aborted).toBe(true);
    view.rerender(<BatchRunDialog {...props} documentKey="document-c" onClose={vi.fn()} />);
    expect(estimate.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => {
      quote.resolve({ totalPower: 999 });
      waiting.resolve({ status: 'success' });
    });
    expect(screen.queryByText(/999/)).toBeNull();
    expect(screen.queryByText('已完成')).toBeNull();
    expect(screen.getByRole('button', { name: '开始执行' }).disabled).toBe(false);
  });
});
