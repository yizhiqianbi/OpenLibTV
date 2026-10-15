import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useScriptNodeToolbar } from './useScriptNodeToolbar.js';
import { scriptAssetProgress, scriptWorkflowState } from './workflow-model.js';

function setup(extra = {}, empty = false) {
  const node = {
    id: 'script',
    type: 'script-v2',
    data: {
      rows: empty
        ? []
        : [
            {
              id: 'r1',
              hiddenUuid: 'r1',
              plotDescription: '清晨海岸',
              imageGenerationPrompt: '海岸行走',
              videoMotionPrompt: '镜头推进',
              imagePromptState: 'synced',
              videoPromptState: 'synced',
            },
          ],
      assets: { characters: [{ id: 'character', linkedNodeId: 'asset' }], scenes: [], props: [] },
      ...(empty ? { taskInfo: { loading: false, status: 3 } } : {}),
    },
  };
  const nodes = [node, { id: 'asset', type: 'image', data: { url: ['/fixture-character.webp'] } }];
  let graph = { documentKey: 'doc', ready: true, readonly: false, nodes, edges: [] };
  const workflow = scriptWorkflowState(node.data, {
    getNodeUrl: (id) => nodes.find((item) => item.id === id)?.data?.url?.[0],
    assetProgress: scriptAssetProgress(node.data, nodes),
  });
  const props = {
    node,
    documentKey: 'doc',
    workflow,
    ready: true,
    readonly: false,
    selectionEligible: true,
    videoAvailable: true,
    getDocument: vi.fn(() => graph),
    beforeAction: vi.fn(() => true),
    onCreateImages: vi.fn(),
    onCreateVideos: vi.fn(),
    onDownload: vi.fn(),
    notify: vi.fn(),
    ...extra,
  };
  const hook = renderHook((value) => useScriptNodeToolbar(value), { initialProps: props });
  return {
    ...hook,
    props,
    setDocument: (value) => {
      graph = value;
    },
    document: () => graph,
  };
}
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('ScriptV2 toolbar request ownership', () => {
  it.each(['onCreateImages', 'onCreateVideos', 'onDownload'])(
    'flushes current drafts before %s and passes the published node and stable opener',
    async (handler) => {
      const value = setup();
      const opener = document.createElement('button');
      const published = {
        ...value.props.node,
        data: { ...value.props.node.data, title: '最后一次输入' },
      };
      value.props.beforeAction.mockImplementation(() => {
        value.setDocument({ ...value.document(), nodes: [published, value.document().nodes[1]] });
        return true;
      });
      await act(async () =>
        expect(await value.result.current[handler]('script', opener)).toBe(true),
      );
      expect(value.props.beforeAction).toHaveBeenCalledTimes(1);
      expect(value.props[handler]).toHaveBeenCalledExactlyOnceWith({ node: published, opener });
      expect(value.result.current.pending).toBe(false);
    },
  );

  it('refuses duplicate clicks while retaining the first pending request', async () => {
    const wait = deferred();
    const value = setup({ beforeAction: vi.fn(() => wait.promise) });
    let request;
    let duplicate;
    const callback = value.result.current.onCreateVideos;
    act(() => {
      request = callback('script');
      duplicate = callback('script');
    });
    expect(value.result.current.pending).toBe(true);
    await expect(duplicate).resolves.toBe(false);
    await act(async () => expect(await value.result.current.onCreateVideos('script')).toBe(false));
    expect(value.props.beforeAction).toHaveBeenCalledTimes(1);
    expect(value.props.onCreateVideos).not.toHaveBeenCalled();
    await act(async () => {
      wait.resolve(true);
      expect(await request).toBe(true);
    });
    expect(value.props.onCreateVideos).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ready: false },
    { readonly: true },
    { selectionEligible: false },
    { documentKey: 'new-document' },
  ])('isolates a pending request after owner change: %j', async (change) => {
    const wait = deferred();
    const value = setup({ beforeAction: vi.fn(() => wait.promise) });
    let request;
    act(() => {
      request = value.result.current.onCreateVideos('script');
    });
    value.rerender({ ...value.props, ...change });
    await act(async () => {
      wait.resolve(true);
      expect(await request).toBe(false);
    });
    expect(value.props.onCreateVideos).not.toHaveBeenCalled();
    expect(value.result.current.pending).toBe(false);
  });

  it.each([
    'loading',
    'readonly',
    'deleted',
    'different-type',
    'full-generation',
    'asset-removed',
    'unusable-prompts',
  ])('revalidates the published document before dispatch: %s', async (change) => {
    const wait = deferred();
    const value = setup({ beforeAction: vi.fn(() => wait.promise) });
    let request;
    act(() => {
      request = value.result.current.onCreateVideos('script');
    });
    const next = structuredClone(value.document());
    if (change === 'loading') next.ready = false;
    if (change === 'readonly') next.readonly = true;
    if (change === 'deleted') next.nodes.shift();
    if (change === 'different-type') {
      next.nodes[0].type = 'text';
      next.nodes[0].data.type = 'text';
    }
    if (change === 'full-generation') next.nodes[0].data.taskInfo = { loading: true, status: 1 };
    if (change === 'asset-removed') next.nodes[1].data.url = [];
    if (change === 'unusable-prompts') next.nodes[0].data.rows[0].videoMotionPrompt = '';
    value.setDocument(next);
    await act(async () => {
      wait.resolve(true);
      expect(await request).toBe(false);
    });
    expect(value.props.onCreateVideos).not.toHaveBeenCalled();
  });

  it.each([false, new Error('读取草稿失败')])(
    'retains a rejected draft without opening or downloading: %s',
    async (failure) => {
      const value = setup({
        beforeAction: vi.fn(() => (failure instanceof Error ? Promise.reject(failure) : failure)),
      });
      await act(async () => expect(await value.result.current.onDownload('script')).toBe(false));
      expect(value.props.onDownload).not.toHaveBeenCalled();
      expect(value.props.notify).toHaveBeenCalledWith(
        failure instanceof Error ? failure.message : '当前提示词未保存，请重试',
      );
      expect(value.result.current.pending).toBe(false);
    },
  );

  it('adds pagehide only for an active request and removes it after cancellation', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const wait = deferred();
    const value = setup({ beforeAction: vi.fn(() => wait.promise) });
    expect(value.props.getDocument).not.toHaveBeenCalled();
    expect(add.mock.calls.filter(([name]) => name === 'pagehide')).toHaveLength(0);
    let request;
    act(() => {
      request = value.result.current.onCreateVideos('script');
    });
    const listener = add.mock.calls.find(([name]) => name === 'pagehide')[1];
    act(() => window.dispatchEvent(new Event('pagehide')));
    await act(async () => {
      wait.resolve(true);
      expect(await request).toBe(false);
    });
    value.unmount();
    expect(remove).toHaveBeenCalledWith('pagehide', listener);
    expect(value.props.onCreateVideos).not.toHaveBeenCalled();
  });

  it('ignores a callback retained from another document and a pending draft after unmount', async () => {
    const wait = deferred();
    const value = setup({ beforeAction: vi.fn(() => wait.promise) });
    const callback = value.result.current.onCreateVideos;
    let request;
    act(() => {
      request = callback('script');
    });
    value.rerender({ ...value.props, documentKey: 'new-document' });
    await act(async () => expect(await callback('script')).toBe(false));
    value.unmount();
    await act(async () => {
      wait.resolve(true);
      expect(await request).toBe(false);
    });
    expect(value.props.onCreateVideos).not.toHaveBeenCalled();
  });

  it('opens regeneration confirmation without discarding content, saving or starting a task', async () => {
    const value = setup();
    const original = structuredClone(value.document());
    const opener = document.createElement('button');
    document.body.append(opener);
    await act(async () =>
      expect(await value.result.current.onRegenerate('script', opener)).toBe(true),
    );
    expect(value.result.current.regeneration).toEqual({ nodeId: 'script' });
    expect(document.activeElement).toBe(opener);
    expect(value.props.beforeAction).not.toHaveBeenCalled();
    expect(value.document()).toEqual(original);
    act(() => value.result.current.closeRegeneration());
    expect(value.result.current.regeneration).toBeNull();
    opener.remove();
  });

  it('blocks real generation for an empty failed script and rejects stale node/document identity', async () => {
    const value = setup({}, true);
    await act(async () => expect(await value.result.current.onRegenerate('script')).toBe(false));
    expect(value.props.notify).toHaveBeenCalledWith('脚本生成服务尚未连接，当前脚本已保留');
    expect(value.result.current.regeneration).toBeNull();
    await act(async () =>
      expect(await value.result.current.onRegenerate('stale-node')).toBe(false),
    );
    value.setDocument({ ...value.document(), readonly: true });
    await act(async () => expect(await value.result.current.onRegenerate('script')).toBe(false));
    expect(value.props.notify).toHaveBeenCalledTimes(1);
    expect(value.props.beforeAction).not.toHaveBeenCalled();
  });
});
