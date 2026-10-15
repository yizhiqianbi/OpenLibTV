// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import { buildCanvasBatchPlan } from './model.js';
import { runCanvasBatch } from './runner.js';

const node = (id) => ({
  id,
  parentId: 'g',
  type: 'text',
  data: { action: 'text_generate', params: { model: models.default.text, prompt: id } },
});
const nodes = [{ id: 'g', type: 'group', data: {} }, node('a'), node('b'), node('c'), node('d')];
const edges = [
  { source: 'a', target: 'c' },
  { source: 'b', target: 'd' },
];
const plan = () => buildCanvasBatchPlan({ groupId: 'g', nodes, edges, models });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
describe('canvas batch execution coordinator', () => {
  it('executes each dependency layer concurrently and waits for the whole layer before the next', async () => {
    const a = deferred();
    const b = deferred();
    const executor = vi.fn((id) =>
      id === 'a' ? a.promise : id === 'b' ? b.promise : { status: 'success' },
    );
    const before = JSON.stringify(nodes);
    const running = runCanvasBatch(plan(), { executeNode: executor });
    expect(executor.mock.calls.map(([id]) => id)).toEqual(['a', 'b']);
    a.resolve({ status: 'success' });
    await Promise.resolve();
    expect(executor.mock.calls.map(([id]) => id)).toEqual(['a', 'b']);
    b.resolve({ status: 'success' });
    const result = await running;
    expect(executor.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.completed).toEqual(['a', 'b', 'c', 'd']);
    expect(result.running).toBe(false);
    expect(JSON.stringify(nodes)).toBe(before);
  });
  it('keeps failed input and skips only its dependent descendants, continuing unrelated branches', async () => {
    const executeNode = vi.fn((id) => {
      if (id === 'a') throw new Error('服务返回失败');
      return { status: 'success' };
    });
    const result = await runCanvasBatch(plan(), { executeNode });
    expect(executeNode.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'd']);
    expect(result.failed).toEqual(['a']);
    expect(result.skipped).toEqual(['c']);
    expect(result.completed).toEqual(['b', 'd']);
    expect(result.errors).toMatchObject({ a: '服务返回失败', c: '上游节点未完成' });
    expect(nodes[1].data.params.prompt).toBe('a');
  });
  it('re-resolves live model and media references before each node and skips removed nodes', async () => {
    let current = [...nodes];
    const executeNode = vi.fn((id, { generator }) => {
      if (id === 'a')
        current = current
          .filter((item) => item.id !== 'c')
          .map((item) =>
            item.id === 'd'
              ? {
                  ...item,
                  data: { ...item.data, params: { ...item.data.params, prompt: '运行中更新' } },
                }
              : item,
          );
      if (id === 'd') expect(generator.params.prompt).toBe('运行中更新');
      return { status: 'success' };
    });
    const result = await runCanvasBatch(plan(), {
      executeNode,
      getDocument: () => ({ nodes: current, edges, models }),
    });
    expect(result.skipped).toEqual(['c']);
    expect(result.errors.c).toBe('节点已删除');
    expect(executeNode.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'd']);
  });
  it('cancels pending layers even if an executor ignores AbortSignal and ignores late document completion', async () => {
    const waiting = deferred();
    const controller = new AbortController();
    const onState = vi.fn();
    const executeNode = vi.fn(() => waiting.promise);
    const running = runCanvasBatch(plan(), { executeNode, signal: controller.signal, onState });
    controller.abort();
    const result = await running;
    expect(result.cancelled).toBe(true);
    expect(result.completed).toEqual([]);
    expect(result.skipped).toEqual(['a', 'b', 'c', 'd']);
    const calls = onState.mock.calls.length;
    waiting.resolve({ status: 'success' });
    await Promise.resolve();
    expect(onState).toHaveBeenCalledTimes(calls);
    expect(executeNode).toHaveBeenCalledTimes(2);
  });
  it('never labels missing or invalid executor results as a completed generation', async () => {
    const missing = await runCanvasBatch(plan());
    expect(missing.blocked).toEqual(['a', 'b', 'c', 'd']);
    expect(missing.completed).toEqual([]);
    expect(missing.error).toContain('尚未连接');
    const invalid = await runCanvasBatch(plan(), { executeNode: () => undefined });
    expect(invalid.blocked).toEqual(['a', 'b']);
    expect(invalid.skipped).toEqual(['c', 'd']);
    expect(invalid.completed).toEqual([]);
  });
  it('does not dispatch after the owner document changes or publish stale completion', async () => {
    let current = true;
    const waiting = deferred();
    const onState = vi.fn();
    const executeNode = vi.fn(() => waiting.promise);
    const running = runCanvasBatch(plan(), { executeNode, isCurrent: () => current, onState });
    const calls = onState.mock.calls.length;
    current = false;
    waiting.resolve({ status: 'success' });
    const result = await running;
    expect(result.cancelled).toBe(true);
    expect(result.completed).toEqual([]);
    expect(executeNode).toHaveBeenCalledTimes(2);
    expect(onState).toHaveBeenCalledTimes(calls);
  });
});
