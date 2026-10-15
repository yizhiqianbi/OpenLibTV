import { describe, expect, it } from 'vitest';
import { canvasNodeStackingOrder } from './node-stacking-model.js';

describe('transient source node stacking', () => {
  const graph = () => [
    { id: 'group', zIndex: -1001 },
    { id: 'child', parentId: 'group' },
    { id: 'other' },
    { id: 'nested', parentId: 'group', zIndex: 10 },
    { id: 'nested-child', parentId: 'nested' },
  ];
  it('keeps the persisted base order when there is no selection', () => {
    const order = canvasNodeStackingOrder(graph());
    expect(order.get('group')).toBe(-1001);
    expect(order.get('child')).toBe(0);
    expect(order.get('nested-child')).toBe(11);
  });
  it('raises the selected child above overlapping peers, then restores on deselection', () => {
    const nodes = graph();
    expect(canvasNodeStackingOrder(nodes, ['child']).get('child')).toBe(1000);
    expect(canvasNodeStackingOrder(nodes, ['child']).get('other')).toBe(0);
    expect(canvasNodeStackingOrder(nodes).get('child')).toBe(0);
  });
  it('elevates an explicitly high layer additively rather than overwriting it', () => {
    expect(canvasNodeStackingOrder([{ id: 'a', zIndex: 41 }], ['a']).get('a')).toBe(1041);
  });
  it('keeps descendants above a selected parent regardless of input order', () => {
    const nodes = [
      { id: 'leaf', parentId: 'child' },
      { id: 'child', parentId: 'parent' },
      { id: 'parent' },
    ];
    const order = canvasNodeStackingOrder(nodes, ['parent']);
    expect(order.get('parent')).toBe(1000);
    expect(order.get('child')).toBe(1001);
    expect(order.get('leaf')).toBe(1002);
  });
  it('does not lower a child whose own source layer is above its parent', () => {
    const nodes = [
      { id: 'parent', zIndex: 20 },
      { id: 'child', parentId: 'parent', zIndex: 50 },
    ];
    expect(canvasNodeStackingOrder(nodes).get('child')).toBe(50);
  });
  it.each([
    [9.5, 10, 10],
    [9.5, 9.5, 10.5],
  ])('preserves source fractional layers: parent %s, child %s → %s', (parent, child, expected) => {
    const nodes = [
      { id: 'parent', zIndex: parent },
      { id: 'child', parentId: 'parent', zIndex: child },
    ];
    expect(canvasNodeStackingOrder(nodes).get('child')).toBe(expected);
  });
  it('does not mutate documents or persist selection to source node fields', () => {
    const nodes = graph();
    const before = structuredClone(nodes);
    canvasNodeStackingOrder(nodes, ['child', 'nested']);
    expect(nodes).toEqual(before);
    expect(nodes[1]).not.toHaveProperty('selected');
  });
  it('handles missing parents and non-finite source layers without blocking unrelated nodes', () => {
    const order = canvasNodeStackingOrder(
      [
        { id: 'orphan', parentId: 'missing', zIndex: NaN },
        { id: 'other', zIndex: '9' },
      ],
      ['orphan'],
    );
    expect(order.get('orphan')).toBe(1000);
    expect(order.get('other')).toBe(0);
  });
  it('terminates malformed ancestry cycles and leaves unrelated order intact', () => {
    const order = canvasNodeStackingOrder([
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
      { id: 'unrelated', zIndex: 7 },
    ]);
    expect(Number.isFinite(order.get('a'))).toBe(true);
    expect(Number.isFinite(order.get('b'))).toBe(true);
    expect(order.get('unrelated')).toBe(7);
  });
});
