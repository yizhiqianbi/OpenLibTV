import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCanvasMentions } from './useCanvasMentions.js';

const nodes = Array.from({ length: 8 }, (_, index) => ({
  id: `n${index}`,
  type: 'text',
  position: { x: index < 4 ? 1000 : 0, y: 0 },
  width: 100,
  height: 100,
  data: { type: 'text', name: `节点${index}` },
}));
const ids = (result, query = '') =>
  result.current
    .source({ query })
    .filter((row) => row.reference?.type === 'node')
    .map((row) => row.reference.id);

describe('Canvas mention controller', () => {
  it('snapshots actual viewport at open, resets three on reopen, loads three and keeps search global', () => {
    const { result } = renderHook(() =>
      useCanvasMentions({
        nodes,
        view: { x: 0, y: 0, z: 1 },
        board: { current: { getBoundingClientRect: () => ({ width: 200, height: 100 }) } },
      }),
    );
    expect(ids(result)).toEqual(['n0', 'n1', 'n2']);
    const source = result.current.source;
    act(() => result.current.onOpen());
    expect(ids(result)).toEqual(['n4', 'n5', 'n6']);
    act(() => result.current.onLoadMore());
    expect(ids(result)).toEqual(['n4', 'n5', 'n6', 'n7', 'n0', 'n1']);
    expect(ids(result, '节点')).toEqual(nodes.map((node) => node.id));
    act(() => result.current.onOpen());
    expect(ids(result)).toHaveLength(3);
    expect(result.current.source).toBe(source);
  });
  it('updates live labels/deletions without stale references and resets ordering across projects', () => {
    const { result, rerender } = renderHook((props) => useCanvasMentions(props), {
      initialProps: { nodes, projectId: 'a' },
    });
    act(() => result.current.onOpen());
    const refreshKey = result.current.refreshKey;
    const next = nodes
      .slice(1)
      .map((node) => (node.id === 'n1' ? { ...node, data: { ...node.data, name: '改名' } } : node));
    rerender({ nodes: next, projectId: 'a' });
    expect(ids(result)).toEqual(['n1', 'n2', 'n3']);
    expect(result.current.source()[1].reference.name).toBe('改名');
    expect(result.current.refreshKey).not.toBe(refreshKey);
    rerender({ nodes: [nodes[7]], projectId: 'b' });
    expect(ids(result)).toEqual(['n7']);
    expect(result.current.source()[1].reference.projectId).toBe('b');
  });
  it('honors caller canvas-coordinate rectangle and pending IDs without querying global DOM', () => {
    const { result } = renderHook(() =>
      useCanvasMentions({
        nodes,
        viewport: { x: 900, y: 0, width: 300, height: 200 },
        pendingNodeIds: new Set(['n0']),
      }),
    );
    act(() => result.current.onOpen());
    expect(ids(result)).toEqual(['n1', 'n2', 'n3']);
  });
});
