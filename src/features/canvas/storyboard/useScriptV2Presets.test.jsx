import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import presets from '../../../../public/data/script-presets.json';
import { createCanvasScriptNode } from './script-model.js';
import { useScriptV2Presets } from './useScriptV2Presets.js';

function harness(overrides = {}) {
  let graph = {
    documentKey: 'doc',
    ready: true,
    readonly: false,
    models: {},
    nodes: [createCanvasScriptNode({ id: 'script', position: { x: 800, y: 400 } })],
    edges: [],
  };
  let counter = 0;
  const history = [];
  const content = { data: presets, loading: false, error: null, reload: vi.fn() };
  const commitGraph = vi.fn((next, { expectedGraph }) => {
    if (
      graph.nodes !== expectedGraph.nodes ||
      graph.edges !== expectedGraph.edges ||
      graph.models !== expectedGraph.models ||
      !graph.ready ||
      graph.readonly
    )
      return false;
    history.push(graph);
    graph = next;
    return true;
  });
  const props = {
    documentKey: 'doc',
    scriptId: 'script',
    ready: true,
    readonly: false,
    enabled: true,
    content,
    getDocument: () => graph,
    commitGraph,
    flushGraph: vi.fn(() => true),
    notify: vi.fn(),
    makeId: vi.fn((prefix) => `${prefix}-${++counter}`),
    ...overrides,
  };
  const hook = renderHook((value) => useScriptV2Presets(value), { initialProps: props });
  const action = (kind) => {
    let value;
    act(() => {
      value = hook.result.current.create(kind);
    });
    return value;
  };
  return {
    ...hook,
    props,
    action,
    history,
    raw: () => graph,
    publish: (next) => {
      graph = next;
    },
  };
}

describe('ScriptV2 preset graph and save ownership', () => {
  it('reads the current raw script position and params, publishes once and flushes the exact committed graph', () => {
    const owner = harness();
    const raw = owner.raw();
    const params = { prompt: '保留已有提示词', settings: { count: 2 } };
    owner.publish({
      ...raw,
      nodes: raw.nodes.map((node) => ({
        ...node,
        position: { x: 1200, y: 30 },
        data: { ...node.data, params },
      })),
    });
    const before = owner.raw();
    expect(owner.action('scriptToStoryboard')).toBe(true);
    expect(owner.raw().nodes[0].position).toEqual({ x: 750, y: 30 });
    expect(owner.raw().nodes[0].data.content).toEqual([presets.textToScript.textPrompt]);
    expect(owner.raw().nodes[1]).toBe(before.nodes[0]);
    expect(owner.raw().nodes[1].data.params).toBe(params);
    expect(owner.props.flushGraph).toHaveBeenCalledExactlyOnceWith(owner.raw());
    expect(owner.history).toEqual([before]);
    expect(owner.raw().nodes.every((node) => !node.data.taskInfo?.loading)).toBe(true);
    expect(owner.result.current.pendingSave).toBe(false);
    expect(owner.action('scriptToStoryboard')).toBe(false);
    expect(owner.props.commitGraph).toHaveBeenCalledTimes(1);
  });

  it('retains a committed character graph after Quota and retries only saving the latest graph even when catalog later fails', () => {
    const owner = harness({ flushGraph: vi.fn().mockReturnValueOnce(false).mockReturnValue(true) });
    const raw = owner.raw();
    owner.publish({
      ...raw,
      nodes: raw.nodes.map((node) => ({
        ...node,
        data: { ...node.data, params: { prompt: '旧值', model: '旧模型' } },
      })),
    });
    expect(owner.action('characterToStoryboard')).toBe(false);
    expect(owner.raw().nodes).toHaveLength(3);
    expect(owner.raw().edges).toHaveLength(2);
    expect(owner.raw().nodes.find((node) => node.id === 'script').data.params).toEqual({
      prompt: presets.characterToScript.prompt,
    });
    expect(owner.result.current.pendingSave).toBe(true);
    expect(owner.result.current.error).toContain('已添加');
    expect(owner.props.notify).not.toHaveBeenCalled();
    const edits = {
      ...owner.raw(),
      nodes: owner
        .raw()
        .nodes.map((node, index) =>
          index === 0 ? { ...node, position: { x: -90, y: 200 } } : node,
        ),
    };
    owner.publish(edits);
    owner.rerender({
      ...owner.props,
      enabled: false,
      content: { ...owner.props.content, error: new Error('目录离线') },
    });
    expect(owner.action('characterToStoryboard')).toBe(false);
    let saved;
    act(() => {
      saved = owner.result.current.retrySave();
    });
    expect(saved).toBe(true);
    expect(owner.props.flushGraph).toHaveBeenLastCalledWith(edits);
    expect(owner.props.commitGraph).toHaveBeenCalledTimes(1);
    expect(owner.history).toHaveLength(1);
    expect(owner.props.makeId).toHaveBeenCalledTimes(4);
    expect(owner.result.current.pendingSave).toBe(false);
    expect(owner.props.notify).toHaveBeenCalledExactlyOnceWith(
      '参考节点已保存到本机；脚本生成暂未接入，未提交任务',
    );
  });

  it.each([false, undefined])(
    'requires commit result === true (%s) and permits an explicit fresh retry without flushing an uncommitted plan',
    (result) => {
      const commitGraph = vi.fn().mockReturnValue(result);
      const owner = harness({ commitGraph });
      const raw = owner.raw();
      expect(owner.action('scriptToStoryboard')).toBe(false);
      expect(owner.raw()).toBe(raw);
      expect(owner.history).toHaveLength(0);
      expect(owner.props.flushGraph).not.toHaveBeenCalled();
      expect(owner.result.current.error).toContain('未添加');
      expect(owner.result.current.pendingSave).toBe(false);
      expect(owner.action('scriptToStoryboard')).toBe(false);
      expect(commitGraph).toHaveBeenCalledTimes(2);
    },
  );

  it('rejects a concurrently replaced raw graph through CAS and never overwrites the intervening edit', () => {
    let owner;
    let count = 0;
    owner = harness({
      makeId: (prefix) => {
        if (++count === 1)
          owner.publish({
            ...owner.raw(),
            nodes: owner.raw().nodes.map((node) => ({ ...node, position: { x: 45, y: 90 } })),
          });
        return `${prefix}-${count}`;
      },
    });
    expect(owner.action('scriptToStoryboard')).toBe(false);
    expect(owner.raw().nodes).toHaveLength(1);
    expect(owner.raw().nodes[0].position).toEqual({ x: 45, y: 90 });
    expect(owner.history).toHaveLength(0);
    expect(owner.props.flushGraph).not.toHaveBeenCalled();
  });

  it('locks before cancelling other gestures so a reentrant click cannot create a second plan', () => {
    let owner;
    const nested = vi.fn(() => owner.result.current.create('characterToStoryboard'));
    owner = harness({ cancelOtherGestures: nested });
    expect(owner.action('scriptToStoryboard')).toBe(true);
    expect(nested).toHaveReturnedWith(false);
    expect(owner.raw().nodes).toHaveLength(2);
    expect(owner.history).toHaveLength(1);
  });

  it.each(['connection', 'rows', 'task', 'damaged'])(
    'uses fresh raw card guards for %s despite a stale enabled prop',
    (kind) => {
      const owner = harness();
      const raw = owner.raw();
      owner.publish({
        ...raw,
        edges:
          kind === 'connection' ? [{ id: 'existing', source: 'script', target: 'elsewhere' }] : [],
        nodes: raw.nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            ...(kind === 'rows' ? { rows: [{ hiddenUuid: 'shot', shotNumber: 1 }] } : {}),
            ...(kind === 'task' ? { taskInfo: { loading: true, status: 1 } } : {}),
            ...(kind === 'damaged' ? { rows: 'damaged' } : {}),
          },
        })),
      });
      expect(owner.action('scriptToStoryboard')).toBe(false);
      expect(owner.props.makeId).not.toHaveBeenCalled();
      expect(owner.props.commitGraph).not.toHaveBeenCalled();
    },
  );

  it.each(['document', 'readonly', 'ready', 'suspended', 'reference-deleted'])(
    'retires a failed-save owner when %s changes and cannot save it later',
    (kind) => {
      const owner = harness({ flushGraph: vi.fn(() => false) });
      owner.action('characterToStoryboard');
      expect(owner.result.current.pendingSave).toBe(true);
      if (kind === 'reference-deleted')
        owner.publish({ ...owner.raw(), nodes: owner.raw().nodes.slice(1) });
      const next = {
        ...owner.props,
        ...(kind === 'document' ? { documentKey: 'new-doc' } : {}),
        ...(kind === 'readonly' ? { readonly: true } : {}),
        ...(kind === 'ready' ? { ready: false } : {}),
        ...(kind === 'suspended' ? { suspended: true } : {}),
      };
      owner.rerender(next);
      expect(owner.result.current.pendingSave).toBe(false);
      act(() => expect(owner.result.current.retrySave()).toBe(false));
      expect(owner.props.flushGraph).toHaveBeenCalledTimes(1);
    },
  );

  it('validates each catalog entry independently and consumes rejected reload promises', async () => {
    const reload = vi.fn().mockRejectedValue(new Error('离线'));
    const owner = harness({
      content: {
        data: { textToScript: presets.textToScript },
        loading: false,
        error: null,
        reload,
      },
    });
    expect(owner.result.current.catalogStatus).toBe('error');
    expect(owner.result.current.disabledActions).toEqual({
      scriptToStoryboard: false,
      characterToStoryboard: true,
    });
    expect(owner.action('characterToStoryboard')).toBe(false);
    expect(owner.props.makeId).not.toHaveBeenCalled();
    expect(owner.action('scriptToStoryboard')).toBe(true);
    await expect(owner.result.current.reload()).resolves.toEqual([
      { status: 'rejected', reason: expect.any(Error) },
    ]);
  });

  it('guards missing, failed and in-progress catalog reads without allocating IDs', () => {
    const owner = harness({ content: { data: presets, loading: true, error: null } });
    expect(owner.result.current.catalogStatus).toBe('loading');
    expect(owner.action('scriptToStoryboard')).toBe(false);
    owner.rerender({
      ...owner.props,
      content: { data: presets, loading: false, error: new Error('失败') },
    });
    expect(owner.action('characterToStoryboard')).toBe(false);
    owner.rerender({ ...owner.props, content: { data: null, loading: false, error: null } });
    expect(owner.action('scriptToStoryboard')).toBe(false);
    expect(owner.props.makeId).not.toHaveBeenCalled();
    expect(owner.props.commitGraph).not.toHaveBeenCalled();
  });

  it('cannot create through a captured callback after unmount or through an unready raw document', () => {
    const owner = harness();
    const callback = owner.result.current.create;
    owner.publish({ ...owner.raw(), ready: false });
    expect(owner.action('scriptToStoryboard')).toBe(false);
    owner.unmount();
    expect(callback('scriptToStoryboard')).toBe(false);
    expect(owner.props.makeId).not.toHaveBeenCalled();
  });

  it('rejects callbacks captured by the previous document rather than creating or retry-saving in the new one', () => {
    const owner = harness({ flushGraph: vi.fn(() => false) });
    const oldCreate = owner.result.current.create;
    const oldRetry = owner.result.current.retrySave;
    owner.publish({ ...owner.raw(), documentKey: 'doc-b' });
    owner.rerender({ ...owner.props, documentKey: 'doc-b' });
    act(() => expect(oldCreate('scriptToStoryboard')).toBe(false));
    expect(owner.props.commitGraph).not.toHaveBeenCalled();
    expect(owner.action('characterToStoryboard')).toBe(false);
    expect(owner.result.current.pendingSave).toBe(true);
    act(() => expect(oldRetry()).toBe(false));
    expect(owner.props.flushGraph).toHaveBeenCalledTimes(1);
    expect(owner.raw().documentKey).toBe('doc-b');
    expect(owner.raw().nodes).toHaveLength(3);
  });
});
