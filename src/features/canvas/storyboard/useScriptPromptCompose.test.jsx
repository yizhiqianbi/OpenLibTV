import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fingerprintScriptPromptBundle, getScriptPromptBundle } from './prompt-compose-model.js';
import { useScriptPromptCompose } from './useScriptPromptCompose.js';

const row = (patch = {}) => ({ id: 'r1', shotNumber: 1, plotDescription: '雨中奔跑', ...patch });
function setup(rows = [row()], options = {}) {
  let document = {
    documentKey: 'doc-a',
    ready: true,
    readonly: false,
    nodes: [{ id: 'script', type: 'script', data: { rows, assets: {} } }],
  };
  const onChange = vi.fn((patch, context) => {
    const current = document.nodes[0];
    if (
      context.expectedNode !== current ||
      context.documentKey !== document.documentKey ||
      context.signal.aborted
    )
      return false;
    document = { ...document, nodes: [{ ...current, data: { ...current.data, ...patch } }] };
    return true;
  });
  const hook = renderHook(
    ({ documentKey, node }) =>
      useScriptPromptCompose({
        documentKey,
        node,
        ready: true,
        getDocument: () => document,
        onChange,
        ...options,
      }),
    { initialProps: { documentKey: document.documentKey, node: document.nodes[0] } },
  );
  return {
    ...hook,
    onChange,
    read: () => document.nodes[0],
    patchData(patch) {
      const current = document.nodes[0];
      document = { ...document, nodes: [{ ...current, data: { ...current.data, ...patch } }] };
    },
    switchDocument() {
      document = { ...document, documentKey: 'doc-b' };
      hook.rerender({ documentKey: 'doc-b', node: document.nodes[0] });
    },
  };
}
afterEach(() => vi.useRealTimers());
describe('ScriptV2 prompt workspace', () => {
  it('locally composes both empty tracks, marks only targets synced and offers no empty-content undo', async () => {
    const hook = setup([row(), row({ id: 'r2', plotDescription: '远处的灯' })]);
    hook.patchData({ styleDescription: '黑白电影', visualStyle: '不应读取的旧字段' });
    let result;
    await act(async () => {
      result = await hook.result.current.composeLocally({ rowIds: ['r1'] });
    });
    expect(result).toMatchObject({ status: 'applied', successful: 1, skipped: 0, failed: 0 });
    expect(hook.read().data.rows[0]).toMatchObject({
      imagePromptState: 'synced',
      videoPromptState: 'synced',
    });
    expect(hook.read().data.rows[0].imageGenerationPrompt).toContain('雨中奔跑');
    expect(hook.read().data.rows[0].imageGenerationPrompt).toContain('视觉风格：黑白电影。');
    expect(hook.read().data.rows[0].videoMotionPrompt).toContain('视觉风格：黑白电影。');
    expect(hook.read().data.rows[0].imageGenerationPrompt).not.toContain('不应读取的旧字段');
    expect(hook.read().data.rows[1].imageGenerationPrompt).toBeUndefined();
    expect(hook.result.current.canUndo).toBe(false);
  });
  it('cancel keeps existing prompts and allows another compose operation', async () => {
    const hook = setup([row({ imageGenerationPrompt: '旧稿' })]);
    let operation;
    act(() => {
      operation = hook.result.current.composeLocally({ rowIds: ['r1'] });
    });
    expect(hook.result.current.confirmRequest).toEqual({ shotCount: 1, trackCount: 1 });
    await act(async () => {
      hook.result.current.cancelOverwrite();
      expect(await operation).toEqual({ status: 'cancelled' });
    });
    expect(hook.onChange).not.toHaveBeenCalled();
    expect(hook.result.current.pending).toBe(false);
  });
  it('uses latest input after confirmation and undo restores original bundle and state only', async () => {
    const hook = setup([row({ imageGenerationPrompt: '旧稿', imagePromptState: 'stale' })]);
    let operation;
    act(() => {
      operation = hook.result.current.composeLocally({ rowIds: ['r1'] });
    });
    hook.patchData({
      rows: [
        row({
          imageGenerationPrompt: '旧稿',
          imagePromptState: 'stale',
          plotDescription: '最新画面',
        }),
      ],
    });
    await act(async () => {
      hook.result.current.confirmOverwrite();
      await operation;
    });
    expect(hook.read().data.rows[0].imageGenerationPrompt).toContain('最新画面');
    expect(hook.result.current.canUndo).toBe(true);
    await act(async () => {
      expect(await hook.result.current.undo()).toEqual({ status: 'applied' });
    });
    expect(hook.read().data.rows[0]).toMatchObject({
      imageGenerationPrompt: '旧稿',
      imagePromptState: 'stale',
      plotDescription: '最新画面',
      videoPromptState: 'synced',
    });
    expect(hook.read().data.rows[0].videoMotionPrompt).toContain('最新画面');
  });
  it('rejects the whole target row if either selected bundle changed during confirmation', async () => {
    const hook = setup([row({ imageGenerationPrompt: '旧稿' })]);
    let operation;
    act(() => {
      operation = hook.result.current.composeLocally({ rowIds: ['r1'] });
    });
    hook.patchData({ rows: [row({ imageGenerationPrompt: '外部新稿' })] });
    await act(async () => {
      hook.result.current.confirmOverwrite();
      expect(await operation).toMatchObject({ status: 'failed', failed: 1 });
    });
    expect(hook.onChange).not.toHaveBeenCalled();
    expect(hook.read().data.rows[0].videoMotionPrompt).toBeUndefined();
  });
  it('manual commits compare bundle fingerprint, preserve state and reject stale editors', async () => {
    const hook = setup([row({ imageGenerationPrompt: '旧稿', imagePromptState: 'stale' })]);
    const expectedFingerprint = fingerprintScriptPromptBundle(
      getScriptPromptBundle(hook.read().data.rows[0], 'image'),
    );
    await act(async () => {
      expect(
        await hook.result.current.commitPrompt({
          rowId: 'r1',
          track: 'image',
          text: '手改',
          expectedFingerprint,
        }),
      ).toMatchObject({ status: 'saved' });
    });
    expect(hook.read().data.rows[0]).toMatchObject({
      imageGenerationPrompt: '手改',
      imagePromptState: 'stale',
    });
    await act(async () => {
      expect(
        await hook.result.current.commitPrompt({
          rowId: 'r1',
          track: 'image',
          text: '迟到',
          expectedFingerprint,
        }),
      ).toEqual({ status: 'conflict' });
    });
    expect(hook.read().data.rows[0].imageGenerationPrompt).toBe('手改');
  });
  it('expires undo after 20 seconds and rejects undo after an external prompt edit', async () => {
    vi.useFakeTimers();
    const hook = setup([row({ imageGenerationPrompt: '旧稿' })]);
    let operation;
    act(() => {
      operation = hook.result.current.composeLocally({ rowIds: ['r1'] });
    });
    await act(async () => {
      hook.result.current.confirmOverwrite();
      await operation;
    });
    hook.patchData({ rows: [{ ...hook.read().data.rows[0], imageGenerationPrompt: '其他编辑' }] });
    await act(async () => {
      expect(await hook.result.current.undo()).toEqual({ status: 'conflict' });
    });
    expect(hook.result.current.canUndo).toBe(false);
    act(() => {
      operation = hook.result.current.composeLocally({ rowIds: ['r1'] });
    });
    await act(async () => {
      hook.result.current.confirmOverwrite();
      await operation;
    });
    act(() => vi.advanceTimersByTime(20000));
    expect(hook.result.current.canUndo).toBe(false);
    await act(async () => {
      expect(await hook.result.current.undo()).toEqual({ status: 'missing' });
    });
  });
  it('cancels confirmation on document change and rejects old-document draft flushes', async () => {
    const hook = setup([row({ imageGenerationPrompt: '旧稿' })]);
    const oldIdentity = hook.result.current.identity;
    const expectedFingerprint = fingerprintScriptPromptBundle(
      getScriptPromptBundle(hook.read().data.rows[0], 'image'),
    );
    let operation;
    act(() => {
      operation = hook.result.current.composeLocally({ rowIds: ['r1'] });
    });
    act(() => hook.switchDocument());
    await act(async () => {
      expect(await operation).toEqual({ status: 'cancelled' });
    });
    await act(async () => {
      expect(
        await hook.result.current.commitPrompt({
          identity: oldIdentity,
          rowId: 'r1',
          track: 'image',
          text: '迟到',
          expectedFingerprint,
        }),
      ).toEqual({ status: 'missing' });
    });
    expect(hook.onChange).not.toHaveBeenCalled();
  });
  it('persists batch mode on both fields and reports smart service boundary without writes', async () => {
    const hook = setup();
    await act(async () => {
      await hook.result.current.setBatchMode('concat');
    });
    expect(hook.read().data).toMatchObject({
      batchPromptComposeMode: 'concat',
      singlePromptComposeMode: 'concat',
    });
    await act(async () => {
      expect(await hook.result.current.composeSmart()).toEqual({ status: 'blocked' });
    });
    expect(hook.result.current.error).toContain('智能合成服务尚未连接');
    expect(hook.onChange).toHaveBeenCalledTimes(1);
  });
  it('does not retain undo or change prompts when the graph refuses the CAS write', async () => {
    const hook = setup([row({ imageGenerationPrompt: '旧稿' })], { onChange: () => false });
    let operation;
    act(() => {
      operation = hook.result.current.composeLocally({ rowIds: ['r1'] });
    });
    await act(async () => {
      hook.result.current.confirmOverwrite();
      expect(await operation).toMatchObject({ status: 'failed', failed: 1 });
    });
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.read().data.rows[0].imageGenerationPrompt).toBe('旧稿');
  });
  it('retains the existing undo after an empty recomposition', async () => {
    vi.useFakeTimers();
    const hook = setup([row({ imageGenerationPrompt: '原稿', imagePromptState: 'stale' })]);
    let operation;
    act(() => {
      operation = hook.result.current.composeLocally({ rowIds: ['r1'] });
    });
    await act(async () => {
      hook.result.current.confirmOverwrite();
      await operation;
    });
    act(() => vi.advanceTimersByTime(10000));
    hook.patchData({ rows: [{ ...hook.read().data.rows[0], plotDescription: '' }] });
    act(() => {
      operation = hook.result.current.composeLocally({ rowIds: ['r1'] });
    });
    await act(async () => {
      hook.result.current.confirmOverwrite();
      expect(await operation).toMatchObject({ status: 'empty', successful: 0 });
    });
    expect(hook.result.current.canUndo).toBe(true);
    await act(async () => {
      expect(await hook.result.current.undo()).toEqual({ status: 'applied' });
    });
    expect(hook.read().data.rows[0]).toMatchObject({
      imageGenerationPrompt: '原稿',
      imagePromptState: 'stale',
      plotDescription: '',
    });
    act(() => {
      operation = hook.result.current.composeLocally({ rowIds: ['r1'] });
    });
    await act(async () => {
      hook.result.current.confirmOverwrite();
      await operation;
    });
    expect(hook.result.current.canUndo).toBe(false);
  });
});
