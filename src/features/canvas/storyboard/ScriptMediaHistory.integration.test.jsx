import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeTextToClipboard } from '../../../services/clipboard-text.js';
import CanvasScriptNode from './CanvasScriptNode.jsx';
import { createCanvasScriptNode } from './script-model.js';

vi.mock('../../../services/clipboard-text.js', () => ({ writeTextToClipboard: vi.fn() }));

const row = () => ({
  id: 'row',
  hiddenUuid: 'shot',
  shotNumber: 1,
  imageGenerationPrompt: '原图片提示词',
  videoMotionPrompt: '原视频提示词',
  imagePromptState: 'synced',
  videoPromptState: 'stale',
  lastImageInputHash: 'unchanged-image',
  lastVideoInputHash: 'unchanged-video',
  imageVersions: [
    { versionId: 'im1', nodeId: 'image-1', isActive: true },
    { versionId: 'im2', nodeId: 'image-2', isActive: false },
  ],
  videoVersions: [
    { versionId: 'vi1', nodeId: 'video-1', isActive: false, sourceImageVersionId: 'im1' },
    { versionId: 'vi2', nodeId: 'video-2', isActive: true, sourceImageVersionId: 'im2' },
  ],
});
function setup({ readonly = false, patch = {}, refuse = false } = {}) {
  let current;
  let changeOwner;
  let activateGates;
  const writes = vi.fn();
  const jump = vi.fn();
  const media = ['image-1', 'image-2', 'video-1', 'video-2'].map((id) => ({
    id,
    type: id.startsWith('image') ? 'image' : 'video',
    data: {},
  }));
  function Harness() {
    // Source gates prevent a new fullscreen entry. These cases instead lock or
    // start a task after the actual editor is already open, then verify its guards.
    const [gatesActive, setGatesActive] = useState(false);
    activateGates = setGatesActive;
    const activeReadonly = readonly && gatesActive;
    const deferTask = patch.taskInfo?.loading === true && !gatesActive;
    const [documentKey, setDocumentKey] = useState('history-doc');
    changeOwner = setDocumentKey;
    const [node, setNode] = useState(() => ({
      ...createCanvasScriptNode({ id: 'script' }),
      data: { ...createCanvasScriptNode().data, rows: [row()], ...patch },
    }));
    current = node;
    const presented = deferTask ? { ...node, data: { ...node.data, taskInfo: undefined } } : node;
    return (
      <CanvasScriptNode
        node={presented}
        nodes={[presented, ...media]}
        readonly={activeReadonly}
        documentKey={documentKey}
        getDocument={() => ({
          nodes: [current, ...media],
          documentKey,
          ready: true,
          readonly: activeReadonly,
        })}
        onChange={(change, context) => {
          writes(change, context);
          if (refuse || context.expectedNode !== current) return false;
          current = { ...current, data: { ...current.data, ...change } };
          setNode(current);
          return true;
        }}
        onJumpToNode={jump}
      />
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: '打开脚本节点 →' }));
  fireEvent.click(screen.getByRole('button', { name: '提示词 1' }));
  act(() => activateGates(true));
  if (readonly) {
    // The table retires its prior modal on the permission transition; reviewing
    // from the still-open fullscreen editor creates a fresh readonly modal.
    expect(screen.queryByRole('dialog', { name: '镜头1最终提示词' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '提示词 1' }));
  }
  return {
    current: () => current,
    writes,
    changeOwner: (value) => changeOwner(value),
    jump,
    dialog: () => screen.getByRole('dialog', { name: '镜头1最终提示词' }),
  };
}
beforeEach(() => vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(undefined));

describe('actual script media history integration', () => {
  it('flushes the last rich prompt edit before changing only the selected image version and keeps history open', async () => {
    const page = setup();
    const original = page.current().data.rows[0];
    const input = within(page.dialog()).getByRole('textbox', { name: '分镜提示词' });
    input.textContent = '尚未到自动保存的图片提示词';
    fireEvent.input(input);
    fireEvent.click(within(page.dialog()).getByRole('button', { name: '图片版本 v1/2' }));
    await act(async () =>
      fireEvent.click(screen.getByRole('menuitem', { name: '将图片版本 v2 设为当前' })),
    );
    expect(screen.getByRole('menu', { name: '图片版本历史' })).toBeTruthy();
    expect(within(page.dialog()).getByRole('button', { name: '图片版本 v2/2' })).toBeTruthy();
    expect(page.current().data.rows[0]).toMatchObject({
      imageGenerationPrompt: '尚未到自动保存的图片提示词',
      videoMotionPrompt: original.videoMotionPrompt,
      imagePromptState: 'synced',
      videoPromptState: 'stale',
      lastImageInputHash: original.lastImageInputHash,
      lastVideoInputHash: original.lastVideoInputHash,
      videoVersions: original.videoVersions,
    });
    expect(page.current().data.rows[0].imageVersions.map((version) => version.isActive)).toEqual([
      false,
      true,
    ]);
    expect(page.jump).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(page.dialog()).toBeTruthy();
  });
  it('flushes before a version jump, preserves active flags and keeps both source dialogs visible', async () => {
    const page = setup();
    const originalVersions = page.current().data.rows[0].videoVersions;
    const input = within(page.dialog()).getByRole('textbox', { name: '视频提示词' });
    input.textContent = '跳转前的最后视频输入';
    fireEvent.input(input);
    fireEvent.click(within(page.dialog()).getByRole('button', { name: '视频版本 vV2/2' }));
    await act(async () =>
      fireEvent.click(screen.getByRole('menuitem', { name: '跳转到视频版本 vV1' })),
    );
    expect(page.jump).toHaveBeenCalledWith('video-1');
    expect(page.current().data.rows[0].videoMotionPrompt).toBe('跳转前的最后视频输入');
    expect(page.current().data.rows[0].videoVersions).toEqual(originalVersions);
    expect(screen.getByRole('menu', { name: '视频版本历史' })).toBeTruthy();
    expect(page.dialog()).toBeTruthy();
    expect(screen.getByRole('button', { name: '关闭分镜脚本', hidden: true })).toBeTruthy();
  });
  it('keeps already-open version review available after a readonly transition while hiding writes', async () => {
    const page = setup({ readonly: true });
    fireEvent.click(within(page.dialog()).getByRole('button', { name: '图片版本 v1/2' }));
    expect(screen.queryByRole('menuitem', { name: /设为当前/ })).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByRole('menuitem', { name: '跳转到图片版本 v2' })),
    );
    expect(page.jump).toHaveBeenCalledWith('image-2');
    expect(page.writes).not.toHaveBeenCalled();
  });
  it('shows only failed script task information and copies its full ID without altering prompt state', async () => {
    const taskInfo = { taskId: 'script-task-12345', status: ' 4 ', failedReason: '生成超时' };
    const page = setup({ patch: { taskInfo } });
    const original = page.current().data.rows[0];
    expect(within(page.dialog()).getByText('生成超时').title).toBe('生成超时');
    await act(async () =>
      fireEvent.click(
        within(page.dialog()).getByRole('button', { name: '任务 #script-task-12345' }),
      ),
    );
    expect(writeTextToClipboard).toHaveBeenCalledWith('script-task-12345', {
      signal: expect.any(AbortSignal),
    });
    expect(page.current().data.rows[0]).toEqual(original);
    expect(page.writes).not.toHaveBeenCalled();
    vi.mocked(writeTextToClipboard).mockRejectedValueOnce(new Error('denied'));
    await act(async () => fireEvent.click(within(page.dialog()).getByTitle('点击复制任务 ID')));
    expect(within(page.dialog()).getByRole('alert').textContent).toBe('任务编号复制失败，请重试');
  });
  it('isolates a late clipboard failure when an owner changes with the same task ID', async () => {
    let rejectCopy;
    vi.mocked(writeTextToClipboard).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectCopy = reject;
        }),
    );
    const page = setup({ patch: { taskInfo: { taskId: 'same-id', status: 3 } } });
    fireEvent.click(within(page.dialog()).getByRole('button', { name: '任务 #same-id' }));
    const signal = vi.mocked(writeTextToClipboard).mock.calls[0][1].signal;
    await act(async () => page.changeOwner('other-doc'));
    expect(signal.aborted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '打开脚本节点 →' }));
    fireEvent.click(screen.getByRole('button', { name: '提示词 1' }));
    await act(async () => rejectCopy(new Error('old owner denied')));
    expect(within(page.dialog()).queryByRole('alert')).toBeNull();
    expect(within(page.dialog()).getByRole('button', { name: '任务 #same-id' })).toBeTruthy();
  });
  it('keeps already-open history review available when a full task starts while disabling writes', async () => {
    const page = setup({ patch: { taskInfo: { taskId: 'busy', status: 1, loading: true } } });
    fireEvent.click(within(page.dialog()).getByRole('button', { name: '图片版本 v1/2' }));
    expect(screen.getByRole('menuitem', { name: '将图片版本 v2 设为当前' }).disabled).toBe(true);
    await act(async () =>
      fireEvent.click(screen.getByRole('menuitem', { name: '跳转到图片版本 v2' })),
    );
    expect(page.jump).toHaveBeenCalledWith('image-2');
    expect(page.writes).not.toHaveBeenCalled();
  });
  it('hides single-version entries and failure details during actual prompt generation', () => {
    const value = row();
    value.imageVersions = value.imageVersions.slice(0, 1);
    value.videoVersions = [];
    value.imagePromptState = 'generating';
    const page = setup({
      patch: {
        rows: [value],
        taskInfo: { taskId: 'must-hide', status: 3, failedReason: 'must-hide-reason' },
      },
    });
    expect(within(page.dialog()).queryByRole('button', { name: /版本/ })).toBeNull();
    expect(within(page.dialog()).queryByText(/must-hide/)).toBeNull();
    expect(within(page.dialog()).getByRole('button', { name: '重新合成提示词' }).disabled).toBe(
      true,
    );
    expect(within(page.dialog()).getByText('合成中...')).toBeTruthy();
  });
});
