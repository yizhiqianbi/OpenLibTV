import { describe, expect, it } from 'vitest';
import { patchCanvasStoredNodeData } from './node-data-update-model.js';

const node = (data, resourceMeta = { existing: true }) => ({
  id: 'node',
  type: 'group',
  position: { x: 0, y: 0 },
  data,
  resourceMeta,
});

describe('source t4/t5/t6 data patch order', () => {
  it('removes only patch undefined keys and preserves existing and nested undefined own keys', () => {
    const before = node({ stale: 'remove', untouched: undefined, nested: { keep: undefined } });
    const result = patchCanvasStoredNodeData(before, { stale: undefined });
    expect(result.data).toEqual({ untouched: undefined, nested: { keep: undefined } });
    expect(Object.hasOwn(result.data, 'untouched')).toBe(true);
    expect(Object.hasOwn(result.data.nested, 'keep')).toBe(true);
    expect(Object.hasOwn(result.data, 'stale')).toBe(false);
    expect(before.data.stale).toBe('remove');
  });

  it.each(['', undefined, null, 17])(
    'falls back to an existing label for absent/nonstring/empty name: %s',
    (name) => {
      const result = patchCanvasStoredNodeData(node({ name, label: '旧标签' }), {
        cleared: undefined,
      });
      expect(result.data).toEqual({ name: '旧标签' });
    },
  );

  it('keeps a nonempty name and always removes the legacy label without trimming', () => {
    expect(patchCanvasStoredNodeData(node({ name: ' ', label: '旧标签' }), {}).data).toEqual({
      name: ' ',
    });
    expect(patchCanvasStoredNodeData(node({ name: 17, label: '' }), {}).data).toEqual({ name: 17 });
  });

  it('normalizes patch label before merging, so it replaces an existing name', () => {
    const result = patchCanvasStoredNodeData(node({ name: '旧名', label: '旧标签' }), {
      label: '新名',
    });
    expect(result.data).toEqual({ name: '新名' });
  });

  it('performs merged label fallback before t6 explicitly removes a patched undefined name', () => {
    const result = patchCanvasStoredNodeData(node({ name: '旧名', label: '旧标签' }), {
      name: undefined,
    });
    expect(result.data).toEqual({});
    expect(Object.hasOwn(result.data, 'name')).toBe(false);
  });

  it('does not normalize an old merged taskInfo when the patch does not supply taskInfo', () => {
    const taskInfo = { loading: false, status: 1 };
    const result = patchCanvasStoredNodeData(node({ taskInfo }), { cleared: undefined });
    expect(result.data.taskInfo).toBe(taskInfo);
    expect(Object.hasOwn(result.data.taskInfo, 'ownerUserId')).toBe(false);
  });

  it('adds nested ownerUserId undefined to a patch loading=false without deleting or mutating other task fields', () => {
    const patch = { taskInfo: { loading: false, status: 2, nested: { keep: true } } };
    const result = patchCanvasStoredNodeData(
      node({ taskInfo: { loading: true, ownerUserId: 'old' } }),
      patch,
    );
    expect(result.data.taskInfo).toEqual({
      loading: false,
      status: 2,
      nested: { keep: true },
      ownerUserId: undefined,
    });
    expect(Object.hasOwn(result.data.taskInfo, 'ownerUserId')).toBe(true);
    expect(Object.hasOwn(patch.taskInfo, 'ownerUserId')).toBe(false);
  });

  it.each([
    { loading: true },
    { loading: false, ownerUserId: 'owner' },
    { loading: false, ownerUserId: undefined },
    { status: 2 },
    { loading: null },
    null,
  ])('retains source task patch guards for %j', (taskInfo) => {
    const result = patchCanvasStoredNodeData(node({}), { taskInfo });
    expect(result.data.taskInfo).toBe(taskInfo);
  });

  it('moves only a defined resourceMeta patch to node level and preserves old metadata on undefined', () => {
    const before = node({ name: '保留' });
    const resourceMeta = { actual: true };
    expect(patchCanvasStoredNodeData(before, { resourceMeta }).resourceMeta).toBe(resourceMeta);
    expect(patchCanvasStoredNodeData(before, { resourceMeta: null }).resourceMeta).toBeNull();
    const result = patchCanvasStoredNodeData(before, { resourceMeta: undefined });
    expect(result.resourceMeta).toBe(before.resourceMeta);
    expect(result.data).toEqual({ name: '保留' });
    expect(Object.hasOwn(result.data, 'resourceMeta')).toBe(false);
  });
});
