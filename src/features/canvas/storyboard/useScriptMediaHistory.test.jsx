import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useScriptMediaHistory } from './useScriptMediaHistory.js';
import { storyboardRowHashes } from './prompt-state.js';

const versions = () => [
  { versionId: 'v1', nodeId: 'image-1', isActive: true },
  { versionId: 'v2', nodeId: 'image-2', isActive: false },
];
const shot = (id = 'row-1', extra = {}) => {
  const row = {
    id,
    shotNumber: 1,
    imagePromptState: 'none',
    videoPromptState: 'none',
    imageVersions: versions(),
    ...extra,
  };
  return { ...row, ...storyboardRowHashes(row) };
};
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function setup(options = {}) {
  let document = {
    documentKey: 'doc-a',
    ready: true,
    readonly: false,
    nodes: [
      {
        id: 'script',
        type: 'script-v2',
        data: { type: 'script-v2', rows: [shot()], assets: { characters: [] } },
      },
      { id: 'image-1', data: { type: 'image' } },
      { id: 'image-2', data: { type: 'image' } },
    ],
  };
  const commit = (patch, context) => {
    const current = document.nodes.find((node) => node.id === context.nodeId);
    if (
      !current ||
      document.readonly ||
      !document.ready ||
      context.expectedNode !== current ||
      context.documentKey !== document.documentKey ||
      context.signal.aborted
    )
      return false;
    document = {
      ...document,
      nodes: document.nodes.map((node) =>
        node === current ? { ...node, data: { ...node.data, ...patch } } : node,
      ),
    };
    return true;
  };
  const onChange = vi.fn(options.onChange ?? commit);
  const onJumpToNode = vi.fn(options.onJumpToNode ?? (() => true));
  const getDocument = options.noGetter ? undefined : () => document;
  let props = {
    node: document.nodes[0],
    documentKey: 'doc-a',
    ready: true,
    readonly: false,
    disabled: false,
  };
  const hook = renderHook(
    (current) =>
      useScriptMediaHistory({
        ...current,
        getDocument,
        onChange,
        onJumpToNode,
        onBeforeJump: options.onBeforeJump,
        onBeforeSetActive: options.onBeforeSetActive,
      }),
    { initialProps: props, wrapper: options.strict ? StrictMode : undefined },
  );
  return {
    ...hook,
    onChange,
    onJumpToNode,
    commit,
    document: () => document,
    read: () => document.nodes.find((node) => node.id === 'script'),
    patchDocument(patch) {
      document = { ...document, ...patch };
    },
    patchData(patch) {
      const current = document.nodes.find((node) => node.id === 'script');
      document = {
        ...document,
        nodes: document.nodes.map((node) =>
          node === current ? { ...node, data: { ...node.data, ...patch } } : node,
        ),
      };
    },
    rerenderProps(patch) {
      props = { ...props, ...patch };
      hook.rerender(props);
    },
  };
}

describe('ScriptV2 media history controller', () => {
  it('writes only latest rows once with node/document/signal guards, retaining prompt metadata and unrelated rows', async () => {
    const hook = setup();
    const refs = [{ entityId: 'c1', mentionText: '@角色' }];
    const other = shot('row-2', { plotDescription: '外部更新' });
    hook.patchData({
      rows: [
        other,
        shot('row-1', {
          imageGenerationPrompt: '最后输入',
          finalImagePromptEntityRefs: refs,
          imagePromptState: 'stale',
          imagePromptHash: 'hash',
          metadata: 'keep',
        }),
      ],
      styleDescription: '新风格',
    });
    const expected = hook.read();
    await act(async () => {
      expect(await hook.result.current.setActive('row-1', 'image', 'v2')).toBe(true);
    });
    expect(hook.onChange).toHaveBeenCalledTimes(1);
    expect(Object.keys(hook.onChange.mock.calls[0][0])).toEqual(['rows']);
    expect(hook.onChange.mock.calls[0][1]).toMatchObject({
      documentKey: 'doc-a',
      nodeId: 'script',
      expectedNode: expected,
    });
    expect(hook.onChange.mock.calls[0][1].signal.aborted).toBe(false);
    expect(hook.read().data.styleDescription).toBe('新风格');
    expect(hook.read().data.rows[0]).toBe(other);
    expect(hook.read().data.rows[1]).toMatchObject({
      imageGenerationPrompt: '最后输入',
      imagePromptState: 'stale',
      imagePromptHash: 'hash',
      metadata: 'keep',
    });
    expect(hook.read().data.rows[1].finalImagePromptEntityRefs).toBe(refs);
    expect(hook.read().data.rows[1].imageVersions.map((item) => item.isActive)).toEqual([
      false,
      true,
    ]);
    expect(hook.result.current.pending).toBe(false);
  });

  it('serializes rapid changes and reads the newly committed graph instead of old rendered props', async () => {
    const hold = deferred();
    let hook;
    hook = setup({
      onChange: async (patch, context) => {
        await hold.promise;
        return hook.commit(patch, context);
      },
    });
    let first, second;
    act(() => {
      first = hook.result.current.setActive('row-1', 'image', 'v2');
      second = hook.result.current.setActive('row-1', 'image', 'v1');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(hook.onChange).toHaveBeenCalledTimes(1);
    expect(hook.result.current.pending).toBe(true);
    await act(async () => {
      hold.resolve();
      expect(await first).toBe(true);
      expect(await second).toBe(true);
    });
    expect(hook.onChange).toHaveBeenCalledTimes(2);
    expect(hook.onChange.mock.calls[1][1].expectedNode).not.toBe(
      hook.onChange.mock.calls[0][1].expectedNode,
    );
    expect(hook.read().data.rows[0].imageVersions.map((item) => item.isActive)).toEqual([
      true,
      false,
    ]);
  });

  it('does not create a write or history for an already active version and reports missing versions', async () => {
    const hook = setup();
    await act(async () => {
      expect(await hook.result.current.setActive('row-1', 'image', 'v1')).toBe(true);
    });
    expect(hook.onChange).not.toHaveBeenCalled();
    await act(async () => {
      expect(await hook.result.current.setActive('row-1', 'image', 'missing')).toBe(false);
    });
    expect(hook.result.current.error).toContain('已不存在');
    expect(hook.onChange).not.toHaveBeenCalled();
  });

  it('captures the owner before flushing and applies the latest rows/assets with a fresh CAS after successful flush', async () => {
    const hold = deferred();
    const before = vi.fn(() => hold.promise);
    const hook = setup({ onBeforeSetActive: before });
    let operation;
    act(() => {
      operation = hook.result.current.setActive('row-1', 'image', 'v2');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(before).toHaveBeenCalledTimes(1);
    expect(hook.onChange).not.toHaveBeenCalled();
    expect(hook.result.current.pending).toBe(true);
    hook.patchData({
      assets: { scenes: [{ id: 'new-scene', name: '新海岸' }] },
      rows: [
        shot('row-1', {
          imageGenerationPrompt: '最后输入',
          imagePromptState: 'synced',
          dialogueLines: [{ text: '@新海岸。' }],
        }),
      ],
    });
    const afterFlushNode = hook.read();
    await act(async () => {
      hold.resolve(true);
      expect(await operation).toBe(true);
    });
    expect(hook.onChange).toHaveBeenCalledTimes(1);
    expect(hook.onChange.mock.calls[0][1].expectedNode).toBe(afterFlushNode);
    expect(hook.read().data.rows[0]).toMatchObject({
      imageGenerationPrompt: '最后输入',
      dialogue: '新海岸。',
    });
    expect(before.mock.invocationCallOrder[0]).toBeLessThan(
      hook.onChange.mock.invocationCallOrder[0],
    );
  });

  it.each(['false', 'throw'])(
    'does not activate on draft flush %s, retains rows and permits fresh retry',
    async (mode) => {
      const before = vi.fn(() => true);
      if (mode === 'false') before.mockReturnValueOnce(false);
      else
        before.mockImplementationOnce(() => {
          throw new Error('草稿保存失败');
        });
      const hook = setup({ onBeforeSetActive: before });
      const original = hook.read();
      await act(async () => {
        expect(await hook.result.current.setActive('row-1', 'image', 'v2')).toBe(false);
      });
      expect(hook.onChange).not.toHaveBeenCalled();
      expect(hook.read()).toBe(original);
      expect(hook.result.current.error).toBe(mode === 'throw' ? '草稿保存失败' : '');
      await act(async () => {
        expect(await hook.result.current.setActive('row-1', 'image', 'v2')).toBe(true);
      });
      expect(hook.onChange).toHaveBeenCalledTimes(1);
      expect(hook.result.current.error).toBe('');
    },
  );

  it.each(['A-to-B', 'A-to-B-to-A'])(
    'rejects a deferred old-owner flush across %s with identical node/row/version IDs',
    async (change) => {
      const hold = deferred();
      const before = vi.fn(() => true).mockImplementationOnce(() => hold.promise);
      const hook = setup({ onBeforeSetActive: before });
      let oldOperation;
      act(() => {
        oldOperation = hook.result.current.setActive('row-1', 'image', 'v2');
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(hook.onChange).not.toHaveBeenCalled();
      hook.patchDocument({ documentKey: 'doc-b' });
      hook.patchData({ rows: [shot('row-1', { imageGenerationPrompt: 'B 文档内容' })] });
      act(() => hook.rerenderProps({ documentKey: 'doc-b' }));
      if (change === 'A-to-B-to-A') {
        hook.patchDocument({ documentKey: 'doc-a' });
        hook.patchData({ rows: [shot('row-1', { imageGenerationPrompt: '重开的 A 文档内容' })] });
        act(() => hook.rerenderProps({ documentKey: 'doc-a' }));
      }
      const newKey = hook.document().documentKey;
      const newPrompt = hook.read().data.rows[0].imageGenerationPrompt;
      await act(async () => {
        expect(await hook.result.current.setActive('row-1', 'image', 'v2')).toBe(true);
      });
      expect(before).toHaveBeenCalledTimes(2);
      expect(hook.onChange).toHaveBeenCalledTimes(1);
      expect(hook.onChange.mock.calls[0][1].documentKey).toBe(newKey);
      const newNode = hook.read();
      await act(async () => {
        hold.resolve(true);
        expect(await oldOperation).toBe(false);
      });
      expect(hook.onChange).toHaveBeenCalledTimes(1);
      expect(hook.read()).toBe(newNode);
      expect(hook.read().data.rows[0].imageGenerationPrompt).toBe(newPrompt);
      expect(hook.result.current.pending).toBe(false);
      expect(hook.result.current.error).toBe('');
    },
  );

  it.each(['readonly', 'disabled', 'not-ready', 'deleted-script', 'replaced-type', 'unmount'])(
    'rechecks %s after async activation flush',
    async (change) => {
      const hold = deferred();
      const before = vi.fn(() => hold.promise);
      const hook = setup({ onBeforeSetActive: before });
      let operation;
      act(() => {
        operation = hook.result.current.setActive('row-1', 'image', 'v2');
      });
      await act(async () => {
        await Promise.resolve();
      });
      if (change === 'readonly') act(() => hook.rerenderProps({ readonly: true }));
      if (change === 'disabled') act(() => hook.rerenderProps({ disabled: true }));
      if (change === 'not-ready') hook.patchDocument({ ready: false });
      if (change === 'deleted-script') hook.patchDocument({ nodes: [] });
      if (change === 'replaced-type') hook.patchData({ type: 'image' });
      if (change === 'unmount') hook.unmount();
      await act(async () => {
        hold.resolve(true);
        expect(await operation).toBe(false);
      });
      expect(before).toHaveBeenCalledTimes(1);
      expect(hook.onChange).not.toHaveBeenCalled();
    },
  );

  it('runs the full tk pipeline using latest assets, renumbering all rows and syncing spoken text/state in the same patch', async () => {
    const hook = setup();
    hook.patchData({
      assets: { scenes: [{ id: 's', name: '新海岸' }] },
      rows: [
        shot('row-1', {
          shotNumber: 8,
          dialogue: '旧对白',
          dialogueLines: [{ text: '＠新海岸。 @不认识' }],
          imageGenerationPrompt: '原图稿',
          imagePromptState: 'synced',
          videoMotionPrompt: '原视频稿',
          videoPromptState: 'generating',
        }),
        shot('row-2', { shotNumber: 20, voiceover: '旧旁白' }),
      ],
    });
    await act(async () => {
      expect(await hook.result.current.setActive('row-1', 'image', 'v2')).toBe(true);
    });
    expect(hook.onChange).toHaveBeenCalledTimes(1);
    const rows = hook.read().data.rows;
    expect(rows.map((row) => row.shotNumber)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({
      dialogue: '新海岸。 @不认识',
      imagePromptState: 'stale',
      videoPromptState: 'generating',
      imageGenerationPrompt: '原图稿',
      videoMotionPrompt: '原视频稿',
    });
    expect(rows[1].voiceover).toBe('');
    expect(rows[0]).toMatchObject(storyboardRowHashes(rows[0]));
  });

  it.each(['script', 'script-v2', 'storyboard'])(
    'accepts supported script type %s',
    async (type) => {
      const hook = setup();
      hook.patchData({ type });
      await act(async () => {
        expect(await hook.result.current.setActive('row-1', 'image', 'v2')).toBe(true);
      });
      expect(hook.onChange).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['image', 'video', 'group', undefined])(
    'refuses a latest same-ID node replaced by %s even with old rows',
    async (type) => {
      const hook = setup();
      const current = hook.read();
      hook.patchDocument({
        nodes: hook
          .document()
          .nodes.map((node) =>
            node === current ? { ...node, type, data: { ...node.data, type } } : node,
          ),
      });
      await act(async () => {
        expect(await hook.result.current.setActive('row-1', 'image', 'v2')).toBe(false);
        expect(await hook.result.current.jump('image-2')).toBe(false);
      });
      expect(hook.onChange).not.toHaveBeenCalled();
      expect(hook.onJumpToNode).not.toHaveBeenCalled();
    },
  );

  it('rejects a same-ID non-script replacement after async flush and rechecks type between queued writes', async () => {
    const hold = deferred();
    const hook = setup({ onBeforeJump: () => hold.promise });
    let jump;
    act(() => {
      jump = hook.result.current.jump('image-2');
    });
    await act(async () => {
      await Promise.resolve();
    });
    hook.patchData({ type: 'image' });
    await act(async () => {
      hold.resolve(true);
      expect(await jump).toBe(false);
    });
    expect(hook.onJumpToNode).not.toHaveBeenCalled();

    const writeHold = deferred();
    const queued = setup({ onChange: () => writeHold.promise });
    let first, second;
    act(() => {
      first = queued.result.current.setActive('row-1', 'image', 'v2');
      second = queued.result.current.setActive('row-1', 'image', 'v1');
    });
    await act(async () => {
      await Promise.resolve();
    });
    queued.patchData({ type: 'group' });
    await act(async () => {
      writeHold.resolve(true);
      expect(await first).toBe(false);
      expect(await second).toBe(false);
    });
    expect(queued.onChange).toHaveBeenCalledTimes(1);
  });

  it.each(['false', 'throw'])(
    'shows save failure %s and allows retry without losing the version list',
    async (mode) => {
      const hook = setup();
      if (mode === 'throw')
        hook.onChange.mockImplementationOnce(() => {
          throw new Error('保存额度不足');
        });
      else hook.onChange.mockReturnValueOnce(false);
      await act(async () => {
        expect(await hook.result.current.setActive('row-1', 'image', 'v2')).toBe(false);
      });
      expect(hook.result.current.error).toBe(
        mode === 'throw' ? '保存额度不足' : '版本修改未保存，请重试',
      );
      expect(hook.read().data.rows[0].imageVersions[0].isActive).toBe(true);
      await act(async () => {
        expect(await hook.result.current.setActive('row-1', 'image', 'v2')).toBe(true);
      });
      expect(hook.result.current.error).toBe('');
    },
  );

  it.each([{ nodes: [] }, { ready: false }, { readonly: true }, { documentKey: 'doc-b' }])(
    'rejects latest-document deletion/readiness/readonly/identity without falling back to rendered data %j',
    async (patch) => {
      const hook = setup();
      hook.patchDocument(patch);
      await act(async () => {
        expect(await hook.result.current.setActive('row-1', 'image', 'v2')).toBe(false);
      });
      expect(hook.onChange).not.toHaveBeenCalled();
    },
  );

  it('aborts in-flight and queued writes on readonly, then permits fresh work after readonly ends', async () => {
    const hold = deferred();
    let hook;
    hook = setup({
      onChange: async (patch, context) => {
        await hold.promise;
        return hook.commit(patch, context);
      },
    });
    let first, queued;
    act(() => {
      first = hook.result.current.setActive('row-1', 'image', 'v2');
      queued = hook.result.current.setActive('row-1', 'image', 'v2');
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => hook.rerenderProps({ readonly: true }));
    expect(hook.onChange.mock.calls[0][1].signal.aborted).toBe(true);
    act(() => hook.rerenderProps({ readonly: false }));
    await act(async () => {
      hold.resolve();
      expect(await first).toBe(false);
      expect(await queued).toBe(false);
    });
    expect(hook.onChange).toHaveBeenCalledTimes(1);
    await act(async () => {
      expect(await hook.result.current.setActive('row-1', 'image', 'v2')).toBe(true);
    });
    expect(hook.result.current.error).toBe('');
  });

  it('ignores old-document async success and does not let a hanging old request block the next document', async () => {
    const hold = deferred();
    const hook = setup();
    hook.onChange.mockImplementationOnce(() => hold.promise);
    let operation;
    act(() => {
      operation = hook.result.current.setActive('row-1', 'image', 'v2');
    });
    await act(async () => {
      await Promise.resolve();
    });
    const oldIdentity = hook.result.current.identity;
    hook.patchDocument({ documentKey: 'doc-b' });
    act(() => hook.rerenderProps({ documentKey: 'doc-b' }));
    expect(hook.result.current.identity).not.toBe(oldIdentity);
    await act(async () => {
      expect(await hook.result.current.setActive('row-1', 'image', 'v2')).toBe(true);
      hold.resolve(true);
      expect(await operation).toBe(false);
    });
    expect(hook.result.current.pending).toBe(false);
    expect(hook.result.current.error).toBe('');
  });

  it('aborts the caller signal and refuses retained commands after unmount', async () => {
    const hold = deferred();
    const hook = setup({ onChange: () => hold.promise });
    let operation;
    const command = hook.result.current.setActive;
    act(() => {
      operation = command('row-1', 'image', 'v2');
    });
    await act(async () => {
      await Promise.resolve();
    });
    hook.unmount();
    expect(hook.onChange.mock.calls[0][1].signal.aborted).toBe(true);
    hold.resolve(true);
    expect(await operation).toBe(false);
    expect(await command('row-1', 'image', 'v2')).toBe(false);
    expect(hook.onChange).toHaveBeenCalledTimes(1);
  });

  it('allows readonly history navigation, flushes before jumping and never activates the version', async () => {
    const before = vi.fn(() => true);
    const hook = setup({ onBeforeJump: before });
    hook.patchDocument({ readonly: true });
    act(() => hook.rerenderProps({ readonly: true }));
    await act(async () => {
      expect(await hook.result.current.jump('image-2')).toBe(true);
    });
    expect(before).toHaveBeenCalledTimes(1);
    expect(hook.onJumpToNode).toHaveBeenCalledWith('image-2');
    expect(before.mock.invocationCallOrder[0]).toBeLessThan(
      hook.onJumpToNode.mock.invocationCallOrder[0],
    );
    expect(hook.onChange).not.toHaveBeenCalled();
    expect(hook.read().data.rows[0].imageVersions[0].isActive).toBe(true);
  });

  it('allows disabled history navigation but rejects activation before flushing or writing', async () => {
    const beforeJump = vi.fn(() => true);
    const beforeSetActive = vi.fn(() => true);
    const hook = setup({ onBeforeJump: beforeJump, onBeforeSetActive: beforeSetActive });
    act(() => hook.rerenderProps({ disabled: true }));
    await act(async () => {
      expect(await hook.result.current.jump('image-2')).toBe(true);
      expect(await hook.result.current.setActive('row-1', 'image', 'v2')).toBe(false);
    });
    expect(beforeJump).toHaveBeenCalledTimes(1);
    expect(beforeSetActive).not.toHaveBeenCalled();
    expect(hook.onJumpToNode).toHaveBeenCalledExactlyOnceWith('image-2');
    expect(hook.onChange).not.toHaveBeenCalled();
    expect(hook.read().data.rows[0].imageVersions[0].isActive).toBe(true);
    expect(hook.result.current.pending).toBe(false);
  });

  it.each(['busy', 'busy-then-ready'])(
    'cancels the previous read epoch on %s while allowing a fresh history jump',
    async (change) => {
      const hold = deferred();
      const before = vi.fn(() => true).mockImplementationOnce(() => hold.promise);
      const hook = setup({ onBeforeJump: before });
      let oldJump;
      act(() => {
        oldJump = hook.result.current.jump('image-1');
      });
      await act(async () => {
        await Promise.resolve();
      });
      act(() => hook.rerenderProps({ disabled: true }));
      if (change === 'busy-then-ready') act(() => hook.rerenderProps({ disabled: false }));
      await act(async () => {
        expect(await hook.result.current.jump('image-2')).toBe(true);
      });
      expect(hook.onJumpToNode).toHaveBeenCalledExactlyOnceWith('image-2');
      await act(async () => {
        hold.resolve(true);
        expect(await oldJump).toBe(false);
      });
      expect(hook.onJumpToNode).toHaveBeenCalledExactlyOnceWith('image-2');
      expect(hook.onChange).not.toHaveBeenCalled();
      expect(hook.result.current.pending).toBe(false);
    },
  );

  it('continues to honor a failed draft flush and latest readiness/type while writes are disabled', async () => {
    const before = vi.fn(() => false);
    const hook = setup({ onBeforeJump: before });
    act(() => hook.rerenderProps({ disabled: true }));
    await act(async () => {
      expect(await hook.result.current.jump('image-2')).toBe(false);
    });
    expect(before).toHaveBeenCalledTimes(1);
    expect(hook.onJumpToNode).not.toHaveBeenCalled();
    hook.patchDocument({ ready: false });
    await act(async () => {
      expect(await hook.result.current.jump('image-2')).toBe(false);
    });
    hook.patchDocument({ ready: true });
    hook.patchData({ type: 'image' });
    await act(async () => {
      expect(await hook.result.current.jump('image-2')).toBe(false);
    });
    expect(before).toHaveBeenCalledTimes(1);
    expect(hook.onJumpToNode).not.toHaveBeenCalled();
    expect(hook.onChange).not.toHaveBeenCalled();
  });

  it.each(['deleted-target', 'deleted-script', 'new-document', 'disabled', 'unmount'])(
    'rechecks %s after an async draft flush',
    async (change) => {
      const hold = deferred();
      const hook = setup({ onBeforeJump: () => hold.promise });
      let operation;
      act(() => {
        operation = hook.result.current.jump('image-2');
      });
      await act(async () => {
        await Promise.resolve();
      });
      if (change === 'deleted-target')
        hook.patchDocument({
          nodes: hook.document().nodes.filter((node) => node.id !== 'image-2'),
        });
      if (change === 'deleted-script')
        hook.patchDocument({ nodes: hook.document().nodes.filter((node) => node.id !== 'script') });
      if (change === 'new-document') hook.patchDocument({ documentKey: 'doc-b' });
      if (change === 'disabled') act(() => hook.rerenderProps({ disabled: true }));
      if (change === 'unmount') hook.unmount();
      await act(async () => {
        hold.resolve(true);
        expect(await operation).toBe(false);
      });
      expect(hook.onJumpToNode).not.toHaveBeenCalled();
    },
  );

  it('blocks jump on failed draft flush or an absent actual graph node', async () => {
    const before = vi.fn(() => false);
    const hook = setup({ onBeforeJump: before });
    await act(async () => {
      expect(await hook.result.current.jump('image-2')).toBe(false);
    });
    expect(hook.onJumpToNode).not.toHaveBeenCalled();
    await act(async () => {
      expect(await hook.result.current.jump('missing')).toBe(false);
    });
    expect(before).toHaveBeenCalledTimes(1);
    expect(hook.result.current.error).toBe('画布节点已不存在');
  });

  it('requires actual graph evidence for media jump without a getter and survives StrictMode lifecycle replay', async () => {
    const noGetter = setup({ noGetter: true });
    await act(async () => {
      expect(await noGetter.result.current.jump('image-2')).toBe(false);
    });
    expect(noGetter.onJumpToNode).not.toHaveBeenCalled();
    const strict = setup({ strict: true });
    await act(async () => {
      expect(await strict.result.current.setActive('row-1', 'image', 'v2')).toBe(true);
    });
    expect(strict.onChange).toHaveBeenCalledTimes(1);
  });
});
