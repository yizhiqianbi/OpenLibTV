import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import CanvasScriptNode from './CanvasScriptNode.jsx';
import { createCanvasScriptNode } from './script-model.js';

const exposed = vi.hoisted(() => ({ emptyAction: null }));
vi.mock('./ScriptCardSurface.jsx', async (importOriginal) => {
  const { default: Surface } = await importOriginal();
  return {
    default: (props) => {
      exposed.emptyAction = props.onEmptyAction;
      return <Surface {...props} />;
    },
  };
});

const resource = (patch = {}) => {
  const node = createCanvasScriptNode({ id: 'script' });
  return {
    ...node,
    data: {
      ...node.data,
      rows: [{ id: 'shot', hiddenUuid: 'shot', shotNumber: 1, plotDescription: '海岸晨光' }],
      ...patch,
    },
  };
};
const open = () => screen.getByRole('button', { name: '打开脚本节点 →' });
const surface = () => screen.getByTestId('scriptv2-resource-card-surface');

describe('ScriptV2 card state and entry ownership', () => {
  it('rejects the prior document manual callback and checks the latest raw card before writing', async () => {
    const node = createCanvasScriptNode({ id: 'script' });
    let graph = { documentKey: 'doc-a', nodes: [node], edges: [], ready: true, readonly: false };
    const onChange = vi.fn(() => true);
    const props = { node, nodes: [node], onChange, getDocument: () => graph };
    const page = render(<CanvasScriptNode {...props} documentKey="doc-a" />);
    const oldAction = exposed.emptyAction;
    graph = { ...graph, documentKey: 'doc-b' };
    page.rerender(<CanvasScriptNode {...props} documentKey="doc-b" />);
    await act(async () => oldAction('writeStoryboard'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    graph = { ...graph, edges: [{ id: 'new-edge', source: 'script', target: 'other' }] };
    await act(async () => exposed.emptyAction('writeStoryboard'));
    expect(onChange).not.toHaveBeenCalled();
    graph = { ...graph, edges: [] };
    await act(async () => exposed.emptyAction('writeStoryboard'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toMatchObject({ documentKey: 'doc-b', nodeId: 'script' });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it.each(['source', 'target'])(
    'shows pending for an empty script with an %s edge',
    (direction) => {
      const node = createCanvasScriptNode({ id: 'script' });
      const edge = { id: 'edge', source: 'other', target: 'other', [direction]: 'script' };
      const onChange = vi.fn();
      const page = render(
        <CanvasScriptNode node={node} nodes={[node]} edges={[edge]} onChange={onChange} />,
      );
      const pending = screen.getByTestId('scriptv2-pending-card-surface');
      expect(screen.queryByRole('button', { name: '自己编写分镜脚本' })).toBeNull();
      expect(screen.queryByTestId('scriptv2-stage-progress-compact')).toBeNull();
      fireEvent.doubleClick(pending);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
      page.rerender(<CanvasScriptNode node={node} nodes={[node]} onChange={onChange} />);
      expect(screen.getByRole('button', { name: '自己编写分镜脚本' }).disabled).toBe(false);
    },
  );

  it('lets the card surface drag while isolating the sole open button and portal double-clicks', async () => {
    const onPointer = vi.fn();
    const onChange = vi.fn();
    const node = resource();
    render(
      <div onPointerDown={onPointer}>
        <CanvasScriptNode node={node} nodes={[node]} onChange={onChange} />
      </div>,
    );
    const pill = screen.getByTestId('scriptv2-stage-pill-assets');
    fireEvent.pointerDown(pill);
    expect(onPointer).toHaveBeenCalledTimes(1);
    fireEvent.click(pill);
    expect(screen.queryByRole('dialog')).toBeNull();
    const trigger = open();
    trigger.focus();
    fireEvent.pointerDown(trigger);
    expect(onPointer).toHaveBeenCalledTimes(1);
    fireEvent.click(trigger);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.doubleClick(screen.getByRole('columnheader', { name: '画面描述' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '关闭分镜脚本' })));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('consumes blocked external requests without reopening when permissions or tasks later change', () => {
    const node = resource();
    const props = { node, nodes: [node], documentKey: 'doc' };
    const page = render(<CanvasScriptNode {...props} readonly openRequest={1} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: '打开脚本节点 →' })).toBeNull();
    fireEvent.doubleClick(surface());
    expect(screen.queryByRole('dialog')).toBeNull();
    page.rerender(<CanvasScriptNode {...props} openRequest={1} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    const busy = resource({ taskInfo: { loading: true, status: 1 } });
    page.rerender(<CanvasScriptNode {...props} node={busy} openRequest={2} />);
    expect(screen.getByTestId('scriptv2-generating-card-surface')).toBeTruthy();
    fireEvent.doubleClick(screen.getByTestId('scriptv2-generating-card-surface'));
    expect(screen.queryByRole('dialog')).toBeNull();
    page.rerender(<CanvasScriptNode {...props} openRequest={2} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    page.rerender(<CanvasScriptNode {...props} openRequest={3} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it.each([3, 4])(
    'opens a failed full-task surface by double-click, with no compact button (%s)',
    (status) => {
      const node = resource({ taskInfo: { loading: false, status, failedReason: '保留失败原因' } });
      const props = { node, nodes: [node], documentKey: 'doc' };
      const page = render(<CanvasScriptNode {...props} />);
      expect(screen.queryByRole('button', { name: '打开脚本节点 →' })).toBeNull();
      expect(screen.queryByTestId('scriptv2-stage-progress-compact')).toBeNull();
      fireEvent.doubleClick(screen.getByTestId('scriptv2-failed-card-surface'));
      expect(screen.getByRole('dialog')).toBeTruthy();
      page.rerender(<CanvasScriptNode {...props} documentKey="readonly-doc" readonly />);
      fireEvent.doubleClick(screen.getByTestId('scriptv2-failed-card-surface'));
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );

  it('keeps recompute separate from a full task and opens its notice without resetting the remembered stage', async () => {
    const task = {
      loading: true,
      status: 1,
      progressPercent: 95,
      scriptV2TaskMode: 'recompute-batch-shots',
    };
    const node = resource({ taskInfo: task });
    const props = { node, nodes: [node], documentKey: 'doc', onChange: vi.fn() };
    const page = render(<CanvasScriptNode {...props} />);
    expect(screen.getByTestId('scriptv2-stage-generating-label').textContent).toBe(
      '合成提示词中...',
    );
    expect(screen.queryByTestId('scriptv2-prompt-task-notice')).toBeNull();
    fireEvent.click(open());
    fireEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: /准备资产/ }),
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '关闭分镜脚本' })));
    const failed = resource({
      taskInfo: { ...task, loading: false, status: 3, taskId: ' task ', failedReason: '超时' },
    });
    page.rerender(<CanvasScriptNode {...props} node={failed} />);
    const notice = screen.getByTestId('scriptv2-prompt-task-notice');
    expect(notice.tagName).toBe('BUTTON');
    expect(notice.title).toBe('最终提示词生成失败 · TaskID: task · 超时');
    fireEvent.click(notice);
    expect(
      within(screen.getByRole('navigation'))
        .getByRole('button', { name: /准备资产/ })
        .getAttribute('aria-current'),
    ).toBe('step');
    expect(props.onChange).not.toHaveBeenCalled();
    page.rerender(<CanvasScriptNode {...props} node={failed} documentKey="readonly" readonly />);
    expect(screen.getByTestId('scriptv2-prompt-task-notice').tagName).toBe('DIV');
  });

  it('keeps malformed raw rows and readonly empty nodes from publishing a replacement', () => {
    const invalid = resource({ rows: 'damaged-rows' });
    const onChange = vi.fn();
    const page = render(<CanvasScriptNode node={invalid} onChange={onChange} />);
    expect(screen.getByRole('alert').textContent).toContain('原内容已保留');
    expect(screen.queryByRole('button', { name: '自己编写分镜脚本' })).toBeNull();
    fireEvent.doubleClick(page.container.querySelector('.cv-script-node'));
    expect(screen.queryByRole('dialog')).toBeNull();
    page.rerender(
      <CanvasScriptNode node={createCanvasScriptNode()} readonly onChange={onChange} />,
    );
    expect(screen.queryByRole('button', { name: '自己编写分镜脚本' })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('retains a failed manual draft and retries from the editor with the same hidden row identity', async () => {
    let current;
    const writes = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    function Host() {
      const [node, setNode] = useState(() => createCanvasScriptNode({ id: 'script' }));
      current = node;
      return (
        <CanvasScriptNode
          node={node}
          documentKey="doc"
          onChange={(patch, context) => {
            if (context.expectedNode !== current || !writes(patch)) return false;
            current = { ...current, data: { ...current.data, ...patch } };
            setNode(current);
            return true;
          }}
        />
      );
    }
    render(<Host />);
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '自己编写分镜脚本' })),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(current.data.rows).toEqual([]);
    expect(screen.getByRole('alert').textContent).toContain('分镜修改未保存');
    const originalRow = writes.mock.calls[0][0].rows[0];
    expect(originalRow.hiddenUuid).toBeTruthy();
    fireEvent.click(open());
    const input = screen.getByRole('textbox', { name: '画面描述 1' });
    fireEvent.change(input, { target: { value: '失败后保留的最后输入' } });
    await act(async () => fireEvent.blur(input));
    expect(current.data.rows).toHaveLength(1);
    expect(current.data.rows[0]).toMatchObject({
      hiddenUuid: originalRow.hiddenUuid,
      plotDescription: '失败后保留的最后输入',
    });
    expect(writes).toHaveBeenCalledTimes(2);
  });

  it('retains legacy table pointer isolation and its existing fullscreen entry', () => {
    const node = { ...resource(), type: 'script', data: { ...resource().data, type: 'script' } };
    const pointer = vi.fn();
    const page = render(
      <div onPointerDown={pointer}>
        <CanvasScriptNode node={node} />
      </div>,
    );
    fireEvent.pointerDown(page.container.querySelector('.cv-script-node'));
    expect(pointer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '展开分镜脚本' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.queryByTestId('scriptv2-stage-progress-compact')).toBeNull();
  });

  it.each(['manual', 'prompt-notice'])(
    'retains native Space activation on the %s button without arming board panning',
    (entry) => {
      const node =
        entry === 'manual'
          ? createCanvasScriptNode({ id: 'script' })
          : resource({
              taskInfo: {
                loading: false,
                status: 3,
                scriptV2TaskMode: 'recompute-batch-shots',
                failedReason: '取消任务',
              },
            });
      const boardKey = vi.fn((event) => event.preventDefault());
      render(
        <div onKeyDown={boardKey}>
          <CanvasScriptNode node={node} onChange={() => true} />
        </div>,
      );
      const button =
        entry === 'manual'
          ? screen.getByRole('button', { name: '自己编写分镜脚本' })
          : screen.getByTestId('scriptv2-prompt-task-notice');
      button.focus();
      const event = new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        bubbles: true,
        cancelable: true,
      });
      fireEvent(button, event);
      expect(boardKey).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(button);
      // jsdom cannot prove native keyboard click synthesis.
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );
});
