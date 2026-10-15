import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasNodeActions } from './useCanvasNodeActions.js';
import { useStoryboardSlots } from './useStoryboardSlots.js';
import { readCanvasUploadNode } from '../domain/uploads.js';

vi.mock('../domain/uploads.js', () => ({ readCanvasUploadNode: vi.fn() }));

const image = (id, patch = {}) => ({
  id,
  type: 'image',
  position: { x: 4, y: 4 },
  width: 100,
  height: 80,
  data: { type: 'image', name: id, url: [`/${id}.png`], params: {} },
  ...patch,
});
const initialNodes = () => [
  {
    id: 'g',
    type: 'group',
    position: { x: 100, y: 100 },
    width: 212,
    height: 172,
    data: {
      type: 'group',
      name: 'Story',
      standaloneStoryboardImageGrid: true,
      storyboardGroupType: 'image',
      storyboardManualGridCols: 2,
      storyboardManualGridRows: 2,
      childNodeIds: ['a'],
    },
  },
  image('a', { parentId: 'g' }),
  image('outside', { position: { x: 1000, y: 1000 }, data: { params: { prompt: 'original' } } }),
];
const file = () => new File(['image bytes'], '参考.png', { type: 'image/png' });
const uploaded = (id = 'new') =>
  image(id, {
    resourceMeta: {
      items: [
        {
          kind: 'image',
          sourceUrl: 'data:image/png;base64,cGlj',
          byteSize: 11,
          mimeType: 'image/png',
        },
      ],
    },
    data: {
      type: 'image',
      name: '参考.png',
      localMediaReady: true,
      url: ['data:image/png;base64,cGlj'],
      params: { prompt: '', settings: {} },
    },
  });

let readers;
beforeEach(() => {
  readers = [];
  vi.mocked(readCanvasUploadNode)
    .mockReset()
    .mockImplementation(
      (pickedFile, options) =>
        new Promise((resolve, reject) =>
          readers.push({ file: pickedFile, signal: options.signal, resolve, reject }),
        ),
    );
});

function mount({ nodes = initialNodes(), rejectChange = false, changeError = null } = {}) {
  const callbacks = {
    record: vi.fn(),
    notify: vi.fn(),
    setSelected: vi.fn(),
    change: vi.fn(),
    onInserted: vi.fn(),
  };
  const page = renderHook(
    (permissions) => {
      const [currentNodes, setNodes] = useState(nodes);
      const [edges, setEdges] = useState([{ id: 'keep-edge', source: 'a', target: 'outside' }]);
      const [graphOverride, setGraphOverride] = useState({});
      const actions = useCanvasNodeActions({
        ...permissions,
        nodes: currentNodes,
        edges,
        record: callbacks.record,
        setNodes,
        setEdges,
        setSelected: callbacks.setSelected,
        notify: callbacks.notify,
      });
      callbacks.change.mockImplementation((next) => {
        if (changeError) throw changeError;
        return rejectChange ? false : actions.change(next);
      });
      const slots = useStoryboardSlots({
        ...permissions,
        nodes: currentNodes,
        getDocument: () => ({ ...permissions, ...graphOverride, nodes: currentNodes, edges }),
        change: callbacks.change,
        setSelected: callbacks.setSelected,
        notify: callbacks.notify,
        onInserted: callbacks.onInserted,
      });
      return { slots, nodes: currentNodes, edges, setNodes, setEdges, setGraphOverride };
    },
    { initialProps: { documentKey: 'first', ready: true, readonly: false } },
  );
  return { ...page, callbacks };
}

function open(page, slotIndex = 1) {
  act(() => expect(page.result.current.slots.open('g', slotIndex)).toBe(true));
}
function start(page) {
  open(page);
  let task;
  act(() => {
    task = page.result.current.slots.upload(file());
  });
  return { task, reader: readers.at(-1) };
}
async function finish(task, reader, node = uploaded()) {
  let outcome;
  await act(async () => {
    reader.resolve(node);
    outcome = await task;
  });
  return outcome;
}

describe('storyboard slot reader and document ownership', () => {
  it('uses the real slot/reflow model and one real node-change/history transaction for a single image', async () => {
    const page = mount();
    const { task, reader } = start(page);
    expect(page.result.current.slots.busy).toBe(true);
    expect(reader.signal.aborted).toBe(false);
    expect(await finish(task, reader)).toBe(true);
    expect(page.callbacks.change).toHaveBeenCalledOnce();
    expect(page.callbacks.record).toHaveBeenCalledOnce();
    expect(page.callbacks.setSelected).toHaveBeenCalledExactlyOnceWith(['g']);
    expect(page.callbacks.onInserted).toHaveBeenCalledExactlyOnceWith('g');
    expect(page.callbacks.record.mock.invocationCallOrder[0]).toBeLessThan(
      page.callbacks.setSelected.mock.invocationCallOrder[0],
    );
    expect(page.callbacks.setSelected.mock.invocationCallOrder[0]).toBeLessThan(
      page.callbacks.onInserted.mock.invocationCallOrder[0],
    );
    expect(page.callbacks.notify).not.toHaveBeenCalled();
    expect(page.result.current.nodes.at(-1)).toMatchObject({
      id: 'new',
      parentId: 'g',
      position: { x: 108, y: 4 },
      width: 100,
      height: 80,
      data: {
        action: 'image_resource',
        name: '分镜 #2',
        localMediaReady: true,
        _explicitContentDims: true,
        contentWidth: 100,
        contentHeight: 80,
      },
    });
    expect(page.result.current.nodes[0].data).toMatchObject({
      childNodeIds: ['a', 'new'],
      groupLayoutMode: 'grid',
    });
    expect(page.result.current.edges).toEqual([
      { id: 'keep-edge', source: 'a', target: 'outside' },
    ]);
    expect(page.result.current.slots.busy).toBe(false);
  });

  it('appends to the latest concurrent nodes/params and preserves connections created while reading', async () => {
    const page = mount();
    const { task, reader } = start(page);
    act(() => {
      page.result.current.setNodes((nodes) => [
        ...nodes.map((node) =>
          node.id === 'outside'
            ? {
                ...node,
                data: { params: { prompt: 'edited while reading', settings: { seed: 44 } } },
              }
            : node,
        ),
        image('concurrent', { position: { x: 1500, y: 1500 } }),
      ]);
      page.result.current.setEdges((edges) => [
        ...edges,
        { id: 'new-edge', source: 'outside', target: 'concurrent' },
      ]);
    });
    const latestNodes = page.result.current.nodes;
    expect(await finish(task, reader)).toBe(true);
    expect(page.result.current.nodes.map((node) => node.id)).toEqual([
      'g',
      'a',
      'outside',
      'concurrent',
      'new',
    ]);
    expect(page.result.current.nodes[2]).toBe(latestNodes[2]);
    expect(page.result.current.nodes[2].data.params).toEqual({
      prompt: 'edited while reading',
      settings: { seed: 44 },
    });
    expect(page.result.current.nodes[3]).toBe(latestNodes[3]);
    expect(page.result.current.edges.map((edge) => edge.id)).toEqual(['keep-edge', 'new-edge']);
    expect(page.callbacks.record).toHaveBeenCalledOnce();
  });

  it.each([
    ['document switch', { documentKey: 'second', ready: true, readonly: false }],
    ['readonly switch', { documentKey: 'first', ready: true, readonly: true }],
    ['loading switch', { documentKey: 'first', ready: false, readonly: false }],
  ])('aborts on %s and ignores even a successful late reader', async (_, permissions) => {
    const page = mount();
    const before = page.result.current.nodes;
    const { task, reader } = start(page);
    page.rerender(permissions);
    expect(reader.signal.aborted).toBe(true);
    expect(page.result.current.slots).toMatchObject({ busy: false, target: null });
    expect(await finish(task, reader)).toBe(false);
    expect(page.result.current.nodes).toBe(before);
    expect(page.callbacks.change).not.toHaveBeenCalled();
    expect(page.callbacks.record).not.toHaveBeenCalled();
    expect(page.callbacks.setSelected).not.toHaveBeenCalled();
    expect(page.callbacks.notify).not.toHaveBeenCalled();
  });

  it('aborts on unmount and ignores a late failure without notifying or changing history', async () => {
    const page = mount();
    const { task, reader } = start(page);
    page.unmount();
    expect(reader.signal.aborted).toBe(true);
    await act(async () => {
      reader.reject(new Error('late failure'));
      expect(await task).toBe(false);
    });
    expect(page.callbacks.change).not.toHaveBeenCalled();
    expect(page.callbacks.record).not.toHaveBeenCalled();
    expect(page.callbacks.notify).not.toHaveBeenCalled();
  });

  it('closing cancels the reader, and reopening does not let the old completion clear a newer busy operation', async () => {
    const page = mount();
    const first = start(page);
    act(() => page.result.current.slots.close());
    expect(first.reader.signal.aborted).toBe(true);
    expect(page.result.current.slots).toMatchObject({ target: null, busy: false });
    const second = start(page);
    expect(await finish(first.task, first.reader, uploaded('obsolete'))).toBe(false);
    expect(page.result.current.slots.busy).toBe(true);
    expect(second.reader.signal.aborted).toBe(false);
    expect(await finish(second.task, second.reader, uploaded('current'))).toBe(true);
    expect(page.result.current.nodes.at(-1).id).toBe('current');
    expect(page.result.current.nodes.some((node) => node.id === 'obsolete')).toBe(false);
    expect(page.callbacks.change).toHaveBeenCalledOnce();
    expect(page.callbacks.record).toHaveBeenCalledOnce();
  });

  it('opening another slot aborts A, rejects its captured native input, and does not let late A close busy B', async () => {
    const page = mount();
    const first = start(page);
    const ownerA = page.result.current.slots.target;
    const retainedA = page.result.current.slots;
    open(page, 3);
    const ownerB = page.result.current.slots.target;
    expect(ownerB).not.toBe(ownerA);
    expect(ownerB.slotIndex).toBe(3);
    expect(first.reader.signal.aborted).toBe(true);
    expect(page.result.current.slots.isCurrent(ownerA)).toBe(false);
    expect(page.result.current.slots.isCurrent(ownerB)).toBe(true);
    let staleInput, second;
    act(() => {
      staleInput = page.result.current.slots.upload(file(), ownerA);
      second = page.result.current.slots.upload(file(), ownerB);
    });
    expect(await staleInput).toBe(false);
    expect(readers).toHaveLength(2);
    const readerB = readers[1];
    act(() => retainedA.close(ownerA));
    expect(readerB.signal.aborted).toBe(false);
    expect(page.result.current.slots).toMatchObject({ busy: true, target: ownerB });
    expect(await finish(first.task, first.reader, uploaded('obsolete'))).toBe(false);
    act(() => retainedA.close(ownerA));
    expect(page.result.current.slots).toMatchObject({ busy: true, target: ownerB });
    expect(await finish(second, readerB, uploaded('current'))).toBe(true);
    expect(page.result.current.nodes.at(-1).data.name).toBe('分镜 #4');
    expect(page.result.current.nodes.some((node) => node.id === 'obsolete')).toBe(false);
    expect(page.callbacks.change).toHaveBeenCalledOnce();
    expect(page.callbacks.record).toHaveBeenCalledOnce();
  });

  it('reopening the same group/slot creates a distinct owner and rejects a retained pick callback', () => {
    const page = mount();
    open(page);
    const ownerA = page.result.current.slots.target;
    const retainedA = page.result.current.slots;
    open(page);
    const ownerB = page.result.current.slots.target;
    expect(ownerB).toEqual(ownerA);
    expect(ownerB).not.toBe(ownerA);
    act(() => {
      expect(retainedA.pick({ url: '/obsolete.png' })).toBe(false);
      retainedA.close(ownerA);
    });
    expect(page.result.current.slots.target).toBe(ownerB);
    expect(page.callbacks.change).not.toHaveBeenCalled();
    expect(page.callbacks.record).not.toHaveBeenCalled();
  });

  it.each([{ ready: false }, { readonly: true }, { documentKey: 'second' }])(
    'checks the latest graph ownership independently of hook props %j',
    async (override) => {
      const page = mount();
      const { task, reader } = start(page);
      act(() => page.result.current.setGraphOverride(override));
      expect(await finish(task, reader)).toBe(false);
      expect(page.callbacks.change).not.toHaveBeenCalled();
      expect(page.callbacks.record).not.toHaveBeenCalled();
      expect(page.callbacks.setSelected).not.toHaveBeenCalled();
    },
  );

  it('does not write or record if the group is deleted before the reader completes', async () => {
    const page = mount();
    const { task, reader } = start(page);
    act(() => page.result.current.setNodes((nodes) => nodes.filter((node) => node.id !== 'g')));
    const latest = page.result.current.nodes;
    expect(await finish(task, reader)).toBe(false);
    expect(page.result.current.nodes).toBe(latest);
    expect(page.callbacks.change).not.toHaveBeenCalled();
    expect(page.callbacks.record).not.toHaveBeenCalled();
    expect(page.callbacks.notify).not.toHaveBeenCalled();
  });

  it.each(['delete', 'change eligibility'])(
    'does not revive a cancelled slot if the group returns with the same ID after %s',
    async (kind) => {
      const page = mount();
      const original = page.result.current.nodes;
      const first = start(page);
      act(() =>
        page.result.current.setNodes((nodes) =>
          kind === 'delete'
            ? nodes.filter((node) => node.id !== 'g')
            : nodes.map((node) =>
                node.id === 'g'
                  ? { ...node, data: { ...node.data, standaloneStoryboardImageGrid: false } }
                  : node,
              ),
        ),
      );
      expect(first.reader.signal.aborted).toBe(true);
      expect(page.result.current.slots).toMatchObject({ target: null, busy: false });
      act(() => page.result.current.setNodes([...original]));
      expect(page.result.current.slots.target).toBeNull();
      expect(await finish(first.task, first.reader, uploaded('obsolete'))).toBe(false);
      expect(page.callbacks.change).not.toHaveBeenCalled();
      expect(page.callbacks.record).not.toHaveBeenCalled();
      const second = start(page);
      expect(await finish(second.task, second.reader, uploaded('current'))).toBe(true);
      expect(page.result.current.nodes.at(-1).id).toBe('current');
      expect(page.callbacks.change).toHaveBeenCalledOnce();
      expect(page.callbacks.record).toHaveBeenCalledOnce();
    },
  );

  it.each([
    [
      'capacity changes',
      (nodes) =>
        nodes.map((node) =>
          node.id === 'g'
            ? {
                ...node,
                data: { ...node.data, storyboardManualGridCols: 1, storyboardManualGridRows: 1 },
              }
            : node,
        ),
      '分镜宫格已满，无法继续添加',
    ],
    [
      'slot becomes occupied',
      (nodes) => [
        ...nodes.map((node) =>
          node.id === 'g'
            ? { ...node, data: { ...node.data, childNodeIds: ['a', 'new-member'] } }
            : node,
        ),
        image('new-member', { parentId: 'g' }),
      ],
      '该空位已发生变化，请重新选择',
    ],
  ])('retains latest graph and records nothing when %s', async (_, mutate, warning) => {
    const page = mount();
    const { task, reader } = start(page);
    act(() => page.result.current.setNodes(mutate));
    const latest = page.result.current.nodes;
    expect(await finish(task, reader)).toBe(false);
    expect(page.result.current.nodes).toBe(latest);
    expect(page.callbacks.change).not.toHaveBeenCalled();
    expect(page.callbacks.record).not.toHaveBeenCalled();
    expect(page.callbacks.setSelected).not.toHaveBeenCalled();
    expect(page.callbacks.notify).toHaveBeenCalledExactlyOnceWith(warning);
    expect(page.result.current.slots.busy).toBe(false);
  });

  it('reports a read failure, retains the selected slot, and permits exactly one later successful retry', async () => {
    const page = mount();
    const first = start(page);
    const target = page.result.current.slots.target;
    await act(async () => {
      first.reader.reject(new Error('文件无法读取'));
      expect(await first.task).toBe(false);
    });
    expect(page.callbacks.notify).toHaveBeenCalledExactlyOnceWith('文件无法读取');
    expect(page.result.current.slots).toMatchObject({ busy: false, target });
    expect(page.callbacks.change).not.toHaveBeenCalled();
    let retry;
    act(() => {
      retry = page.result.current.slots.upload(file());
    });
    expect(await finish(retry, readers[1])).toBe(true);
    expect(page.callbacks.change).toHaveBeenCalledOnce();
    expect(page.callbacks.record).toHaveBeenCalledOnce();
    expect(vi.mocked(readCanvasUploadNode)).toHaveBeenCalledTimes(2);
  });

  it('rejects another upload while a reader is pending, then keeps one insertion/history entry', async () => {
    const page = mount();
    const first = start(page);
    let second;
    act(() => {
      second = page.result.current.slots.upload(file());
    });
    expect(await second).toBe(false);
    expect(readers).toHaveLength(1);
    expect(await finish(first.task, first.reader)).toBe(true);
    expect(page.result.current.nodes.filter((node) => node.id === 'new')).toHaveLength(1);
    expect(page.callbacks.change).toHaveBeenCalledOnce();
    expect(page.callbacks.record).toHaveBeenCalledOnce();
  });

  it('rejects unsupported files without reading and reports unavailable history URLs', async () => {
    const page = mount();
    open(page);
    let unsupported;
    act(() => {
      unsupported = page.result.current.slots.upload(
        new File(['video'], 'video.mp4', { type: 'video/mp4' }),
      );
    });
    expect(await unsupported).toBe(false);
    expect(readers).toHaveLength(0);
    expect(page.callbacks.notify).toHaveBeenCalledWith('分镜组支持图像内容');
    act(() => expect(page.result.current.slots.pick({ url: '' })).toBe(false));
    expect(page.callbacks.notify).toHaveBeenLastCalledWith('图片地址不可用，请选择其他图片');
    expect(page.callbacks.change).not.toHaveBeenCalled();
    expect(page.callbacks.record).not.toHaveBeenCalled();
  });

  it('history picking selects the group after one actual change and preserves the existing graph', () => {
    const page = mount();
    open(page);
    act(() =>
      expect(
        page.result.current.slots.pick({ thumbnailUrl: '/preferred.png', url: '/fallback.png' }),
      ).toBe(true),
    );
    expect(page.callbacks.change).toHaveBeenCalledOnce();
    expect(page.callbacks.record).toHaveBeenCalledOnce();
    expect(page.callbacks.setSelected).toHaveBeenCalledExactlyOnceWith(['g']);
    expect(page.callbacks.onInserted).toHaveBeenCalledExactlyOnceWith('g');
    expect(page.result.current.nodes.at(-1).data).toMatchObject({
      action: 'image_resource',
      url: ['/preferred.png'],
      name: '分镜 #2',
      _explicitContentDims: true,
    });
    expect(page.result.current.edges).toHaveLength(1);
    expect(readers).toHaveLength(0);
  });

  it('does not select or record when the change adapter explicitly rejects the prepared graph', async () => {
    const page = mount({ rejectChange: true });
    const before = page.result.current.nodes;
    const { task, reader } = start(page);
    expect(await finish(task, reader)).toBe(false);
    expect(page.callbacks.change).toHaveBeenCalledOnce();
    expect(page.callbacks.record).not.toHaveBeenCalled();
    expect(page.callbacks.setSelected).not.toHaveBeenCalled();
    expect(page.callbacks.onInserted).not.toHaveBeenCalled();
    expect(page.result.current.nodes).toBe(before);
    expect(page.result.current.slots.target).not.toBeNull();
    expect(page.result.current.slots.busy).toBe(false);
    expect(page.callbacks.notify).not.toHaveBeenCalled();
  });

  it.each([
    ['history pick', new Error('保存空间不足'), '保存空间不足'],
    ['upload', new Error('提交失败'), '提交失败'],
    ['history pick', new Error(), '添加图片失败，请重试'],
  ])(
    'catches a %s change failure without losing the slot or changing graph/history',
    async (mode, error, warning) => {
      const page = mount({ changeError: error });
      const before = page.result.current.nodes;
      open(page);
      const target = page.result.current.slots.target;
      if (mode === 'upload') {
        let task;
        act(() => {
          task = page.result.current.slots.upload(file());
        });
        expect(await finish(task, readers[0])).toBe(false);
      } else {
        act(() => expect(page.result.current.slots.pick({ url: '/picked.png' })).toBe(false));
        expect(readers).toHaveLength(0);
      }
      expect(page.callbacks.change).toHaveBeenCalledOnce();
      expect(page.callbacks.notify).toHaveBeenCalledExactlyOnceWith(warning);
      expect(page.callbacks.record).not.toHaveBeenCalled();
      expect(page.callbacks.setSelected).not.toHaveBeenCalled();
      expect(page.callbacks.onInserted).not.toHaveBeenCalled();
      expect(page.result.current.nodes).toBe(before);
      expect(page.result.current.slots).toMatchObject({ target, busy: false });
    },
  );
});
