import { useRef, useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ScriptPromptComposeConfirmation,
  ScriptPromptComposeDialog,
  ScriptPromptComposeNotice,
} from './ScriptPromptComposeDialog.jsx';
import { useScriptPromptCompose } from './useScriptPromptCompose.js';

const makeRow = (patch = {}) => ({
  id: 'r1',
  shotNumber: 1,
  plotDescription: '雨中奔跑',
  ...patch,
});
function PromptInput({ value, onChange, readonly, ariaLabel, onBlur }) {
  return (
    <textarea
      aria-label={ariaLabel}
      readOnly={readonly}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => onBlur(value)}
    />
  );
}
function setup({
  rows = [makeRow()],
  kind = 'single',
  refuse = false,
  registerDraft,
  assets = {},
  readonly = false,
  rich = false,
} = {}) {
  let bridge;
  const onClose = vi.fn();
  const writes = vi.fn();
  function Harness() {
    const [node, setNode] = useState({ id: 'script', type: 'script', data: { rows, assets } });
    const [opened, setOpened] = useState(true);
    const [disabled, setDisabled] = useState(false);
    const current = useRef(node);
    current.current = node;
    const compose = useScriptPromptCompose({
      node,
      documentKey: 'doc-a',
      ready: true,
      readonly,
      disabled,
      getDocument: () => ({
        documentKey: 'doc-a',
        nodes: [current.current],
        ready: true,
        readonly,
      }),
      onChange: (patch, context) => {
        writes(patch, context);
        if (refuse || context.expectedNode !== current.current) return false;
        const next = { ...current.current, data: { ...current.current.data, ...patch } };
        current.current = next;
        setNode(next);
        return true;
      },
      registerDraft,
    });
    bridge = { compose, node, setNode, setDisabled, setOpened, current };
    return (
      <>
        <button type="button" onClick={() => setOpened(true)}>
          打开
        </button>
        <ScriptPromptComposeNotice compose={compose} />
        {opened && (
          <ScriptPromptComposeDialog
            kind={kind}
            rowId="r1"
            rows={node.data.rows}
            compose={compose}
            PromptInput={rich ? undefined : PromptInput}
            onClose={() => {
              onClose();
              setOpened(false);
            }}
          />
        )}
        <ScriptPromptComposeConfirmation compose={compose} />
      </>
    );
  }
  const view = render(<Harness />);
  return { ...view, read: () => bridge, writes, onClose };
}
afterEach(() => vi.useRealTimers());
describe('ScriptV2 prompt compose dialogs', () => {
  it('debounces two tracks for 500ms, serializes CAS writes, and keeps manual prompt state', async () => {
    vi.useFakeTimers();
    const view = setup({
      rows: [makeRow({ imagePromptState: 'stale', videoPromptState: 'none' })],
    });
    fireEvent.change(screen.getByRole('textbox', { name: '分镜提示词' }), {
      target: { value: '手动分镜' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '视频提示词' }), {
      target: { value: '手动视频' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(view.writes).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(view.writes).toHaveBeenCalledTimes(2);
    expect(view.read().node.data.rows[0]).toMatchObject({
      imageGenerationPrompt: '手动分镜',
      videoMotionPrompt: '手动视频',
      imagePromptState: 'stale',
      videoPromptState: 'none',
    });
  });
  it('flushes immediately on close and ignores the single-dialog backdrop', async () => {
    const view = setup();
    fireEvent.change(screen.getByRole('textbox', { name: '分镜提示词' }), {
      target: { value: '最后输入' },
    });
    fireEvent.mouseDown(document.querySelector('.cv-script-compose-single .cv-modal-overlay'));
    expect(view.onClose).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    });
    expect(view.onClose).toHaveBeenCalledTimes(1);
    expect(view.read().node.data.rows[0].imageGenerationPrompt).toBe('最后输入');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('retains failed drafts in the dialog, allows same-baseline retries, and prevents close', async () => {
    const view = setup({ refuse: true });
    fireEvent.change(screen.getByRole('textbox', { name: '分镜提示词' }), {
      target: { value: '保留输入' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    });
    expect(view.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: '分镜提示词' }).value).toBe('保留输入');
    expect(screen.getByText('保存失败，请重试')).toBeTruthy();
    await act(async () => {
      fireEvent.blur(screen.getByRole('textbox', { name: '分镜提示词' }));
    });
    expect(view.writes).toHaveBeenCalledTimes(2);
  });
  it('rejects a changed bundle while retaining input and rebases only after another edit', async () => {
    const view = setup({ rows: [makeRow({ imageGenerationPrompt: '原文' })] });
    fireEvent.change(screen.getByRole('textbox', { name: '分镜提示词' }), {
      target: { value: '我的输入' },
    });
    act(() => {
      const before = view.read().node;
      view.read().setNode({
        ...before,
        data: { ...before.data, rows: [makeRow({ imageGenerationPrompt: '外部新文' })] },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    });
    expect(view.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: '分镜提示词' }).value).toBe('我的输入');
    expect(screen.getByText('内容已在其他位置更新，请重新打开后编辑')).toBeTruthy();
    expect(view.read().node.data.rows[0].imageGenerationPrompt).toBe('外部新文');
    fireEvent.change(screen.getByRole('textbox', { name: '分镜提示词' }), {
      target: { value: '重新编辑' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    });
    expect(view.read().node.data.rows[0].imageGenerationPrompt).toBe('重新编辑');
    expect(view.onClose).toHaveBeenCalledTimes(1);
  });
  it('keeps the main dialog when overwrite confirmation is cancelled with Escape', async () => {
    const view = setup({
      rows: [makeRow({ imageGenerationPrompt: '旧稿', singlePromptComposeMode: 'concat' })],
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('自动拼接'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '重新合成提示词' }));
    });
    expect(screen.getByRole('dialog', { name: '替换已有提示词内容？' })).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog', { name: '替换已有提示词内容？' })).toBeNull();
    expect(screen.getByRole('dialog', { name: '镜头1最终提示词' })).toBeTruthy();
    expect(view.onClose).not.toHaveBeenCalled();
    expect(view.read().node.data.rows[0].imageGenerationPrompt).toBe('旧稿');
  });
  it('selects missing pairs, closes a completed batch and leaves 20-second undo outside the dialog', async () => {
    const view = setup({
      kind: 'batch',
      rows: [
        makeRow({ imageGenerationPrompt: '旧分镜' }),
        makeRow({
          id: 'r2',
          shotNumber: 2,
          imageGenerationPrompt: '已有分镜',
          videoMotionPrompt: '已有视频',
        }),
      ],
    });
    expect(screen.getByLabelText('选择镜头 1').checked).toBe(true);
    expect(screen.getByLabelText('选择镜头 2').checked).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('自动拼接'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '确认合成' }));
    });
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('dialog', { name: '替换已有提示词内容？' })).getByRole('button', {
          name: '确认',
        }),
      );
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(view.onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '撤销' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    });
    expect(view.read().node.data.rows[0].imageGenerationPrompt).toBe('旧分镜');
    expect(view.read().node.data.rows[0].videoMotionPrompt).toContain('雨中奔跑');
  });
  it('follows source oJ by reselecting a deselected missing row when rows update', () => {
    const view = setup({ kind: 'batch' });
    fireEvent.click(screen.getByLabelText('选择镜头 1'));
    expect(screen.getByLabelText('选择镜头 1').checked).toBe(false);
    act(() => {
      const before = view.read().node;
      view.read().setNode({
        ...before,
        data: {
          ...before.data,
          rows: before.data.rows.map((item) => ({ ...item, plotDescription: '外部更新' })),
        },
      });
    });
    expect(screen.getByLabelText('选择镜头 1').checked).toBe(true);
  });
  it('exposes dirty drafts to document snapshot before unmount and cancels confirmation when disabled', async () => {
    let retained;
    const registerDraft = vi.fn((_documentKey, _nodeId, read) => () => {
      retained = read();
    });
    const view = setup({ registerDraft });
    fireEvent.change(screen.getByRole('textbox', { name: '分镜提示词' }), {
      target: { value: '离开前输入' },
    });
    expect(view.read().compose.snapshot().scriptPrompts).toMatchObject([
      { rowId: 'r1', track: 'image', value: '离开前输入', dirty: true },
    ]);
    view.unmount();
    expect(retained).toMatchObject({
      writable: true,
      scriptPrompts: [{ rowId: 'r1', track: 'image', value: '离开前输入', dirty: true }],
    });
    const second = setup({ rows: [makeRow({ imageGenerationPrompt: '旧稿' })] });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('自动拼接'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '重新合成提示词' }));
    });
    act(() => second.read().setDisabled(true));
    expect(screen.queryByRole('dialog', { name: '替换已有提示词内容？' })).toBeNull();
    expect(second.read().node.data.rows[0].imageGenerationPrompt).toBe('旧稿');
  });
  it('keeps current asset labels readable in a readonly rich input', () => {
    const view = setup({
      readonly: true,
      rich: true,
      assets: { characters: [{ id: 'actor', name: '现名' }] },
      rows: [
        makeRow({
          imageGenerationPrompt: '角色：@旧名。',
          finalImagePromptEntityRefs: [{ text: '旧名', assetId: 'actor' }],
        }),
      ],
    });
    const editor = screen.getByRole('textbox', { name: '分镜提示词' });
    expect(editor.getAttribute('aria-readonly')).toBe('true');
    expect(editor.querySelector('[data-asset-id="actor"]').textContent).toBe('现名');
    expect(view.read().compose.latestNode().data.assets.characters[0].name).toBe('现名');
    expect(view.writes).not.toHaveBeenCalled();
  });
});
