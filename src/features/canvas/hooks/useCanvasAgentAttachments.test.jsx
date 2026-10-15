import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSkillHandoff, skillHandoffText } from '../../../services/agent-handoff.js';
import { useCanvasAgentAttachments } from './useCanvasAgentAttachments.js';

class ControlledReader {
  static instances = [];
  readyState = 0;
  result = null;

  constructor() {
    ControlledReader.instances.push(this);
  }

  readAsDataURL(file) {
    this.file = file;
    this.readyState = 1;
  }

  succeed(value = 'data:image/png;base64,cmVmZXJlbmNl') {
    this.result = value;
    this.readyState = 2;
    this.onload?.();
  }

  fail() {
    this.readyState = 2;
    this.onerror?.();
  }

  abort() {
    this.readyState = 2;
    this.onabort?.();
  }
}

beforeEach(() => {
  ControlledReader.instances = [];
  vi.stubGlobal('FileReader', ControlledReader);
});
afterEach(() => vi.unstubAllGlobals());

const image = () => new File(['reference'], '参考图.png', { type: 'image/png' });
const initial = () =>
  createSkillHandoff({
    prompt: '最初的想法',
    model: { modelKey: 'stable-model', label: '已有模型', modality: 'image' },
    skill: { skillKey: 'film', namespace: 'director', name: '已有 Skill' },
  });

describe('Canvas Agent reference file lifecycle', () => {
  it('appends ready references without replacing models, Skills or text edited while reading', async () => {
    const { result, rerender } = renderHook(
      ({ prompt }) => {
        const [draft, setAgentDraft] = useState(initial);
        return {
          ...useCanvasAgentAttachments({
            documentKey: 'first',
            enabled: true,
            prompt,
            setAgentDraft,
          }),
          draft,
        };
      },
      { initialProps: { prompt: '最初的想法' } },
    );
    act(() =>
      result.current.addFiles([image(), new File(['notes'], '笔记.md', { type: 'text/markdown' })]),
    );
    expect(result.current.busy).toBe(true);
    expect(result.current.draft.parts).toHaveLength(3);
    rerender({ prompt: '读取过程中修改的想法' });
    await act(async () => {
      ControlledReader.instances[0].succeed();
      ControlledReader.instances[1].succeed('data:text/markdown;base64,bm90ZXM=');
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.draft.parts.map((part) => part.type)).toEqual([
      'text',
      'model',
      'skill',
      'image',
      'document',
    ]);
    expect(skillHandoffText(result.current.draft)).toBe('读取过程中修改的想法');
    expect(result.current.draft.serialized).toContain('data:text/markdown;base64,bm90ZXM=');
  });

  it('keeps the prior draft on failure and allows selecting the file again', async () => {
    const { result } = renderHook(() => {
      const [draft, setAgentDraft] = useState(initial);
      return {
        ...useCanvasAgentAttachments({
          documentKey: 'first',
          enabled: true,
          prompt: '最初的想法',
          setAgentDraft,
        }),
        draft,
      };
    });
    const priorDraft = result.current.draft;
    act(() => result.current.addFiles([image()]));
    await act(async () => ControlledReader.instances[0].fail());
    expect(result.current.busy).toBe(false);
    expect(result.current.errors[0].name).toBe('参考图.png');
    expect(result.current.draft).toBe(priorDraft);
    act(() => result.current.addFiles([image()]));
    await act(async () => ControlledReader.instances[1].succeed());
    expect(result.current.errors).toEqual([]);
    expect(result.current.draft.parts).toHaveLength(4);
  });

  it('cancels reads on document change and ignores stale completion after a change or unmount', async () => {
    const setAgentDraft = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ documentKey }) =>
        useCanvasAgentAttachments({ documentKey, enabled: true, prompt: '文本', setAgentDraft }),
      { initialProps: { documentKey: 'first' } },
    );
    act(() => result.current.addFiles([image()]));
    const old = ControlledReader.instances[0];
    const abort = vi.spyOn(old, 'abort');
    rerender({ documentKey: 'second' });
    expect(abort).toHaveBeenCalledOnce();
    await act(async () => old.succeed());
    expect(setAgentDraft).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
    act(() => result.current.addFiles([image()]));
    const current = ControlledReader.instances[1];
    unmount();
    await act(async () => current.succeed());
    expect(setAgentDraft).not.toHaveBeenCalled();
  });

  it('rejects unsupported files and does not read files before the document is enabled', () => {
    const setAgentDraft = vi.fn();
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useCanvasAgentAttachments({ documentKey: 'first', enabled, prompt: '', setAgentDraft }),
      { initialProps: { enabled: false } },
    );
    act(() => result.current.addFiles([image()]));
    expect(ControlledReader.instances).toHaveLength(0);
    rerender({ enabled: true });
    act(() => result.current.addFiles([new File(['archive'], '素材.zip')]));
    expect(result.current.errors[0].message).toContain('不支持此类型');
    expect(result.current.busy).toBe(false);
    expect(setAgentDraft).not.toHaveBeenCalled();
  });
});
